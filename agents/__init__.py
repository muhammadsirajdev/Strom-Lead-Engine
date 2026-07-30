"""StormLead's agent layer -- every LangGraph pipeline stage and the MCP
plumbing they run on.

Four runnable stages, each a module in this package:

  lead_find_agent            Run A -- weather -> leads -> human-reviewed outreach -> send
  send_booking_agent         Run B -- triage Gmail replies -> invite interested leads to book
  notify_booking_with_team   Run C -- check Calendly bookings -> notify Slack -> save
  close_stale_leads          maintenance -- close leads that went quiet

Everything they share lives alongside them:

  config                     pipeline-wide settings (the monitored service area)
  runtime/                   MCP client, Postgres checkpointer, Composio Calendly agent
  mcp_servers/               MCP servers this project implements itself (OpenWeather)

Each stage is runnable on its own for a manual pass, e.g.
`uv run python -m agents.lead_find_agent Dallas`. Unattended, all four are
driven on a schedule by `backend/scheduler.py`.

`.env` is loaded here, once, so every module under `agents.*` can read its
configuration straight from the environment regardless of which entry point
imported it.
"""

from dotenv import load_dotenv

load_dotenv()

__all__ = ["__version__"]

__version__ = "0.1.0"
