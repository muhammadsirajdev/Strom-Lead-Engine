"""The MultiServerMCPClient every StormLead agent talks to the outside world through.

Wires up all four MCP servers the pipeline uses:

  openweather     the stdio server in `agents/mcp_servers/`, launched as a subprocess
  Klavis-strata   Klavis' hosted Gmail server (send/read)
  Slack-mcp       Klavis' hosted Slack server (post message, list channels)
  calendly-agent  a fresh Composio Tool Router session scoped to Calendly

`get_required_tools` then resolves the specific tools a stage declares in its
own REQUIRED_TOOLS, failing loudly at startup if any are missing rather than
mid-run. The Calendly session exposes a generic router rather than fixed
tools -- see `agents.runtime.composio` for the agent that drives it.
"""

import os
import sys
from pathlib import Path

import mcp.client.stdio as mcp_stdio
from composio import Composio
from langchain_core.tools import BaseTool
from langchain_mcp_adapters.client import MultiServerMCPClient

# Silences the stdio transport's default passthrough of the child MCP
# server's stderr, which would otherwise interleave with this process' own
# output.
mcp_stdio.stdio_client.__wrapped__.__defaults__ = (open(os.devnull, "w"),)

# Launched by path as a subprocess, not imported -- weather_server.py stands
# alone on purpose so it can also be run directly for a quick check.
WEATHER_MCP_SERVER = (Path(__file__).resolve().parents[1] / "mcp_servers" / "weather_server.py").resolve()


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
