"""The Composio Tool Router agent the pipeline drives Calendly through.

The `calendly-agent` MCP session (see `agents.runtime.mcp_client`) doesn't
expose fixed Calendly tools -- it exposes Composio's generic router
(search -> read schema -> execute). So a small ReAct agent drives that loop
itself instead of us hardcoding a tool_slug and argument names we can't
verify without a live session.

Two callers, both via `run_composio_agent`:
  send_booking_agent        create a single-use scheduling link for an invitee
  notify_booking_with_team  check whether an invitee has booked a slot yet
"""

import asyncio
import json
import re

from langchain.agents import create_agent
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from langgraph.errors import GraphRecursionError

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
