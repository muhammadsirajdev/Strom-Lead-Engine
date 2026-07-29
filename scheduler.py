"""Runs the StormLead pipeline unattended.

- lead_find_agent: once a day, checks every service city for storms and
  drafts outreach for any qualifying leads.
- send_booking_agent: every 30 minutes, triages Gmail replies and invites
  newly-interested leads to book.
- notify_booking_with_team: every hour, checks for new Calendly bookings and
  alerts the team on Slack.
- close_stale_leads: once a day, closes leads that went quiet for a week.

The MCP client, its tools, and the Postgres checkpointer are all built ONCE
at startup and shared by every job -- rebuilding them per tick would mean a
fresh Composio Calendly session (and another open Postgres connection) every
30 minutes, forever.

lead_find_agent's human-review gate is untouched: a scheduled run drafts
emails and pauses at the same LangGraph interrupt an interactive run hits --
nothing sends automatically. Resolve whatever's pending anytime with:
    uv run python lead_find_agent.py --review

Usage:
    uv run python scheduler.py
"""

import asyncio
import logging
import sys
import uuid

from apscheduler.schedulers.asyncio import AsyncIOScheduler

import close_stale_leads as csl
import lead_find_agent as lfa
import notify_booking_with_team as nbt
import send_booking_agent as sba
from mcp_client import build_checkpointer, build_mcp_client, get_required_tools

# Cities StormLead actively monitors -- must match the metros customers were
# seeded into (db/generate_data.py's METROS).
SERVICE_CITIES = [
    "Dallas",
    "Houston",
    "Austin",
    "San Antonio",
    "Denver",
    "Colorado Springs",
    "Tampa",
    "Orlando",
    "Miami",
    "Jacksonville",
]

# A dedicated handler/level for just this logger, rather than
# logging.basicConfig() -- some already-imported dependency (langchain/mcp)
# attaches its own root handler first, which makes basicConfig() a no-op
# unless forced, and forcing it would also crank up those libraries' own
# INFO-level chatter (every httpx/mcp request) along with ours.
logger = logging.getLogger("scheduler")
logger.setLevel(logging.INFO)
logger.addHandler(logging.StreamHandler())
logger.handlers[-1].setFormatter(logging.Formatter("%(asctime)s [%(name)s] %(message)s"))
logger.propagate = False


async def build_pipeline() -> dict:
    """Builds the shared MCP client, every tool the three graphs need, and
    the Postgres checkpointer once, then compiles all three graphs on top of
    them. Also runs each graph's idempotent table/column setup.
    """
    client = build_mcp_client()
    required = sorted(set(lfa.REQUIRED_TOOLS) | set(sba.REQUIRED_TOOLS) | set(nbt.REQUIRED_TOOLS))
    tools = await get_required_tools(client, required)

    await lfa.ensure_tracking_table()
    await lfa.ensure_pending_review_table()
    await sba.ensure_triage_columns()
    await nbt.ensure_notify_columns()

    checkpointer = await build_checkpointer()

    return {
        "lead_find_graph": lfa.build_graph(tools, checkpointer),
        "send_booking_graph": sba.build_graph(tools, checkpointer),
        "notify_booking_graph": nbt.build_graph(tools, checkpointer),
    }


async def run_lead_find_agent(lead_find_graph) -> None:
    """lead_find_agent.py -- kicks off one pass and returns immediately. If
    it pauses at human_review, the thread is left recorded for a later
    `lead_find_agent.py --review` pass; nothing sends unattended.
    """
    try:
        result, thread_id = await lfa.run_once(lead_find_graph, SERVICE_CITIES)
    except Exception:
        logger.exception("lead_find_agent failed")
        return

    if "__interrupt__" in result:
        pending = len(result["__interrupt__"][0].value["drafts"])
        logger.info(
            "lead_find_agent: %d draft(s) awaiting review (thread %s) -- run: python lead_find_agent.py --review",
            pending,
            thread_id,
        )
    else:
        logger.info("lead_find_agent: qualifying_cities=%s sent=%s", result.get("qualifying_cities"), result.get("sent"))
        if result.get("errors"):
            logger.warning("lead_find_agent errors: %s", result["errors"])


async def run_send_booking_agent(send_booking_graph) -> None:
    """send_booking_agent.py -- triages Gmail replies across every
    non-terminal tracking row and invites newly-interested leads to book."""
    try:
        config = {"configurable": {"thread_id": str(uuid.uuid4())}}
        result = await send_booking_graph.ainvoke({"customer_ids": []}, config)
    except Exception:
        logger.exception("send_booking_agent failed")
        return

    logger.info("send_booking_agent: triaged=%s invited=%s", result["triaged"], result["invited"])
    if result.get("errors"):
        logger.warning("send_booking_agent errors: %s", result["errors"])


async def run_notify_booking_with_team(notify_booking_graph) -> None:
    """notify_booking_with_team.py -- checks for new Calendly bookings and
    notifies the team on Slack."""
    try:
        config = {"configurable": {"thread_id": str(uuid.uuid4())}}
        result = await notify_booking_graph.ainvoke({"customer_ids": []}, config)
    except Exception:
        logger.exception("notify_booking_with_team failed")
        return

    logger.info("notify_booking_with_team: notified=%s saved=%s", result["notified"], result["saved"])
    if result.get("errors"):
        logger.warning("notify_booking_with_team errors: %s", result["errors"])


async def run_close_stale_leads() -> None:
    """close_stale_leads.py -- closes leads that went quiet for a week."""
    try:
        closed = await csl.close_stale_leads()
    except Exception:
        logger.exception("close_stale_leads failed")
        return

    logger.info("close_stale_leads: closed %d lead(s)", len(closed))


async def main() -> None:
    pipeline = await build_pipeline()

    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_lead_find_agent, "cron", hour=8, minute=0, args=[pipeline["lead_find_graph"]], id="lead_find_agent"
    )
    scheduler.add_job(
        run_send_booking_agent, "interval", minutes=30, args=[pipeline["send_booking_graph"]], id="send_booking_agent"
    )
    scheduler.add_job(
        run_notify_booking_with_team, "interval", hours=1, args=[pipeline["notify_booking_graph"]], id="notify_booking_with_team"
    )
    scheduler.add_job(run_close_stale_leads, "cron", hour=8, minute=30, id="close_stale_leads")

    scheduler.start()
    logger.info(
        "scheduler started: lead_find_agent daily 08:00, send_booking_agent every 30min, "
        "notify_booking_with_team hourly, close_stale_leads daily 08:30"
    )

    try:
        await asyncio.Event().wait()  # run forever
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        scheduler.shutdown()


if __name__ == "__main__":
    # psycopg's async mode can't run on Windows' default ProactorEventLoop.
    loop_factory = asyncio.SelectorEventLoop if sys.platform == "win32" else None
    asyncio.run(main(), loop_factory=loop_factory)
