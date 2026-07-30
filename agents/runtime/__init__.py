"""Shared plumbing every StormLead agent is built on.

Three concerns, one module each, re-exported here so a stage imports the
whole runtime from a single place:

  mcp_client    the MultiServerMCPClient over all four MCP servers, and the
                REQUIRED_TOOLS resolver every stage validates itself against
  checkpointer  the Postgres AsyncPostgresSaver every graph is compiled with
  composio      the ReAct agent that drives Composio's Calendly Tool Router

None of the pipeline stages talk to MCP, the checkpointer, or Composio
directly -- they all go through this package.
"""

from .checkpointer import build_checkpointer
from .composio import (
    COMPOSIO_AGENT_SYSTEM_PROMPT,
    build_composio_calendly_agent,
    run_composio_agent,
)
from .mcp_client import WEATHER_MCP_SERVER, build_mcp_client, get_required_tools

__all__ = [
    "COMPOSIO_AGENT_SYSTEM_PROMPT",
    "WEATHER_MCP_SERVER",
    "build_checkpointer",
    "build_composio_calendly_agent",
    "build_mcp_client",
    "get_required_tools",
    "run_composio_agent",
]
