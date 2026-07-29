"""Shared MCP/Composio setup for the StormLead pipeline.

Builds the MultiServerMCPClient wired to every MCP server the pipeline talks
to (the custom OpenWeather stdio server, Klavis' Gmail and Slack servers,
and a Composio Tool Router session scoped to Calendly), resolves the tools
each stage needs, and wraps Composio's generic Tool Router behind a small
ReAct agent so callers never have to hardcode a Calendly tool_slug or its
argument names.

Used by lead_find_agent.py, send_booking_agent.py, and
notify_booking_with_team.py -- none of those talk to MCP directly.
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

import mcp.client.stdio as mcp_stdio
from composio import Composio
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.errors import GraphRecursionError

load_dotenv()

# Silences the stdio transport's default passthrough of the child MCP
# server's stderr, which would otherwise interleave with this process' own
# output.
mcp_stdio.stdio_client.__wrapped__.__defaults__ = (open(os.devnull, "w"),)

WEATHER_MCP_SERVER = (Path(__file__).parent / "mcp_servers" / "weather_server.py").resolve()


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"{name} is not set")
    return value


def build_mcp_client() -> MultiServerMCPClient:
    """Builds the MultiServerMCPClient for all four MCP servers the pipeline
    uses: the custom OpenWeather stdio server, Klavis' Gmail and Slack
    servers, and a fresh Composio Tool Router session scoped to Calendly.
    """
    assert WEATHER_MCP_SERVER.exists(), f"missing {WEATHER_MCP_SERVER}"

    composio_api_key = _require_env("COMPOSIO_API_KEY")
    composio_user_id = _require_env("COMPOSIO_USER_ID")
    weather_api_key = _require_env("OPENWEATHER_API_KEY")
    klavis_gmail_url = _require_env("KLAVIS_GMAIL_MCP_URL")
    klavis_slack_url = _require_env("KLAVIS_SLACK_MCP_URL")
    klavis_token = _require_env("KLAVIS_MCP_TOKEN")

    composio = Composio(api_key=composio_api_key)
    calendly_session = composio.create(user_id=composio_user_id, toolkits=["calendly"])

    return MultiServerMCPClient(
        {
            "openweather": {
                "transport": "stdio",
                "command": sys.executable,
                "args": [str(WEATHER_MCP_SERVER)],
                "env": {"OPENWEATHER_API_KEY": weather_api_key},
            },
            "Klavis-strata": {
                "url": klavis_gmail_url,
                "transport": "streamable_http",
                "headers": {"Authorization": f"Bearer {klavis_token}"},
            },
            "calendly-agent": {
                "transport": "streamable_http",
                "url": calendly_session.mcp.url,
                "headers": {"x-api-key": composio_api_key},
            },
            "Slack-mcp": {
                "url": klavis_slack_url,
                "transport": "streamable_http",
                "headers": {"Authorization": f"Bearer {klavis_token}"},
            },
        }
    )


async def get_required_tools(mcp_client: MultiServerMCPClient, required: list[str]) -> dict[str, BaseTool]:
    """Fetches every tool `mcp_client` exposes and returns just the subset
    named in `required`, keyed by name. Raises if any are missing.
    """
    all_tools = await mcp_client.get_tools()
    tools_by_name = {t.name: t for t in all_tools}

    missing = [name for name in required if name not in tools_by_name]
    if missing:
        raise RuntimeError(f"missing expected MCP tools: {missing}")

    return {name: tools_by_name[name] for name in required}


# `from_conn_string`'s context manager must be kept alive for the life of the
# process (see build_checkpointer) -- module-level so it outlives the
# function call that creates it instead of being garbage-collected, which
# would silently close the connection out from under the checkpointer.
_checkpointer_cms: list = []


async def build_checkpointer() -> AsyncPostgresSaver:
    """Opens the Postgres checkpointer used by every LangGraph graph in this
    pipeline. `AsyncPostgresSaver` is an async context manager; it's entered
    manually (rather than `async with`) so the connection stays open for the
    life of the process instead of closing at the end of a `with` block.
    """
    checkpointer_cm = AsyncPostgresSaver.from_conn_string(os.environ["DATABASE_URL"])
    checkpointer = await checkpointer_cm.__aenter__()
    _checkpointer_cms.append(checkpointer_cm)  # prevents GC from closing the connection
    await checkpointer.setup()
    return checkpointer


# ---------------------------------------------------------------------------
# Composio Tool Router agent (Calendly)
#
# The calendly-agent MCP session doesn't expose fixed Calendly tools -- it
# exposes Composio's generic router (search -> read schema -> execute), so a
# small ReAct agent drives that loop itself instead of us hardcoding a
# tool_slug and argument names we can't verify without a live session.
# ---------------------------------------------------------------------------

COMPOSIO_AGENT_SYSTEM_PROMPT = """You have three Composio Tool Router tools: COMPOSIO_SEARCH_TOOLS \
(find the right tool for a task), COMPOSIO_GET_TOOL_SCHEMAS (read a tool's exact argument schema), and \
COMPOSIO_MULTI_EXECUTE_TOOL (call it). Only use tools from the Calendly toolkit. Use CALENDLY_GET_USER \
for the current user, never the deprecated CALENDLY_GET_CURRENT_USER.

1. Search for the tool(s) that match the task -- some tasks need more than one call (e.g. you may need
   the current user's URI before you can filter another call by it).
2. Fetch each tool's schema before calling it -- never guess argument names.
3. Execute with correctly-shaped arguments.
4. Reply with ONLY a single JSON object in the exact shape requested -- no prose, no markdown fences.

If COMPOSIO_MULTI_EXECUTE_TOOL returns an error (auth failure, no connection, tool not found, missing
required argument, etc.), do NOT retry it and do NOT search again. Immediately reply with
{"error": "<the tool's exact error message>"}. A failed execution is a final answer, not a signal to try
something else."""


def build_composio_calendly_agent(
    composio_search_tools: BaseTool,
    composio_get_tool_schemas: BaseTool,
    composio_multi_execute_tool: BaseTool,
):
    """A ReAct agent scoped to Composio's three Tool Router meta-tools, used
    to drive Calendly actions (create a scheduling link, check for a
    booking) without hardcoding Calendly's own tool names.
    """
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    return create_agent(llm, [composio_search_tools, composio_get_tool_schemas, composio_multi_execute_tool])


def _parse_agent_json(messages: list) -> dict:
    text = messages[-1].content
    if isinstance(text, list):  # some providers return content blocks instead of a plain string
        text = "".join(b.get("text", "") for b in text if isinstance(b, dict))
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise RuntimeError(f"Calendly agent returned no JSON: {text!r}")
    return json.loads(match.group(0))


async def run_composio_agent(composio_agent, task: str, timeout: float = 90.0) -> dict:
    """Runs the ReAct loop with a hard wall-clock timeout and a low
    recursion_limit, so a stuck/looping agent (e.g. retrying
    COMPOSIO_MULTI_EXECUTE_TOOL against a missing required argument) fails
    fast with a clear error instead of hanging the whole graph run
    indefinitely.
    """
    try:
        result = await asyncio.wait_for(
            composio_agent.ainvoke(
                {
                    "messages": [
                        SystemMessage(content=COMPOSIO_AGENT_SYSTEM_PROMPT),
                        HumanMessage(content=task),
                    ]
                },
                config={"recursion_limit": 12},
            ),
            timeout=timeout,
        )
    except asyncio.TimeoutError as exc:
        raise RuntimeError(
            f"Calendly agent did not respond within {timeout}s -- likely stuck retrying "
            "COMPOSIO_MULTI_EXECUTE_TOOL."
        ) from exc
    except GraphRecursionError as exc:
        raise RuntimeError(
            "Calendly agent hit its 12-step recursion limit without converging -- likely looping on "
            "COMPOSIO_MULTI_EXECUTE_TOOL."
        ) from exc

    parsed = _parse_agent_json(result["messages"])
    if "error" in parsed:
        raise RuntimeError(f"Calendly agent task failed: {parsed['error']}")
    return parsed
