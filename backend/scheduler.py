"""Runs the StormLead pipeline unattended -- the backend's writing half.

Sits alongside the read-only dashboard API in this package but runs as its
own process: `main.py` serves HTTP and never writes, this drives the four
agents in `agents/` on a timer and is the only thing here that does.

- lead_find_agent: once a day, checks every service city for storms and
  drafts outreach for any qualifying leads.
- send_booking_agent: every 30 minutes, triages Gmail replies and invites
  newly-interested leads to book.
- notify_booking_with_team: every hour, checks for new Calendly bookings and
  alerts the team on Slack.
- close_stale_leads: once a day, closes leads that went quiet for a week.
- keep_api_awake: every 10 minutes, if KEEPALIVE_URL is set, pings the
  dashboard API so a free-tier host (Render sleeps after 15 idle minutes)
  never spins it down. The health endpoint queries Postgres, so this also
  keeps a free Supabase project from pausing for inactivity.

The MCP client, its tools, and the Postgres checkpointer are all built ONCE
at startup and shared by every job -- rebuilding them per tick would mean a
fresh Composio Calendly session (and another open Postgres connection) every
30 minutes, forever.

lead_find_agent's human-review gate is untouched: a scheduled run drafts
emails and pauses at the same LangGraph interrupt an interactive run hits --
nothing sends automatically. Resolve whatever's pending anytime with:
    uv run python -m agents.lead_find_agent --review

Usage (from the project root):
    uv run python -m backend.scheduler                  # run forever on the schedule
    uv run python -m backend.scheduler --once lead_find  # run one job now, then exit

Cron times are evaluated in SCHEDULER_TIMEZONE (an IANA name such as
"America/Chicago"). Without it the host's local zone is used -- which is UTC
on Render, so set it in production or "08:00" fires overnight for the
service area.
"""

import argparse
import asyncio
import logging
import os
import sys
import uuid
from datetime import datetime

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from agents import close_stale_leads as csl
from agents import lead_find_agent as lfa
from agents import notify_booking_with_team as nbt
from agents import send_booking_agent as sba
from agents.config import SERVICE_CITIES
from agents.runtime import build_checkpointer, build_mcp_client, get_required_tools

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
    """agents/lead_find_agent.py -- kicks off one pass and returns
    immediately. If it pauses at human_review, the thread is left recorded
    for a later `--review` pass; nothing sends unattended.
    """
    try:
        result, thread_id = await lfa.run_once(lead_find_graph, SERVICE_CITIES)
    except Exception:
        logger.exception("lead_find_agent failed")
        return

    if "__interrupt__" in result:
        pending = len(result["__interrupt__"][0].value["drafts"])
        logger.info(
            "lead_find_agent: %d draft(s) awaiting review (thread %s) -- "
            "run: python -m agents.lead_find_agent --review",
            pending,
            thread_id,
        )
    else:
        logger.info("lead_find_agent: qualifying_cities=%s sent=%s", result.get("qualifying_cities"), result.get("sent"))
        if result.get("errors"):
            logger.warning("lead_find_agent errors: %s", result["errors"])


async def run_send_booking_agent(send_booking_graph) -> None:
    """agents/send_booking_agent.py -- triages Gmail replies across every
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
    """agents/notify_booking_with_team.py -- checks for new Calendly bookings and
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
    """agents/close_stale_leads.py -- closes leads that went quiet for a week."""
    try:
        closed = await csl.close_stale_leads()
    except Exception:
        logger.exception("close_stale_leads failed")
        return

    logger.info("close_stale_leads: closed %d lead(s)", len(closed))


async def keep_api_awake(url: str) -> None:
    """Pings the dashboard API. Only failures are logged, to keep logs quiet."""
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.get(url)
        if response.status_code != 200:
            logger.warning("keep_api_awake: %s returned HTTP %s", url, response.status_code)
    except Exception as exc:
        logger.warning("keep_api_awake: %s unreachable (%s)", url, exc)


def _jobs(pipeline: dict) -> dict:
    """Job name -> zero-arg coroutine factory, shared by the schedule and --once."""
    return {
        "lead_find": lambda: run_lead_find_agent(pipeline["lead_find_graph"]),
        "send_booking": lambda: run_send_booking_agent(pipeline["send_booking_graph"]),
        "notify_booking": lambda: run_notify_booking_with_team(pipeline["notify_booking_graph"]),
        "close_stale": run_close_stale_leads,
    }


JOB_NAMES = ("lead_find", "send_booking", "notify_booking", "close_stale")


async def run_once(job: str) -> None:
    """Runs a single job immediately and returns -- for smoke-testing a
    deployment, or for driving the pipeline from an external cron."""
    pipeline = await build_pipeline()
    logger.info("running %s once", job)
    await _jobs(pipeline)[job]()


async def start_scheduler() -> AsyncIOScheduler:
    """Builds the pipeline, registers every job, and starts the scheduler on
    the running event loop. Returns it so the caller can shut it down.

    Used two ways: standalone (`main()` below, e.g. a Render worker) or
    embedded in the dashboard API's process when RUN_SCHEDULER is set (see
    backend/main.py) -- which lets a single free web service do both jobs.
    """
    pipeline = await build_pipeline()

    timezone = os.getenv("SCHEDULER_TIMEZONE") or None
    scheduler = AsyncIOScheduler(timezone=timezone) if timezone else AsyncIOScheduler()
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

    keepalive_url = os.getenv("KEEPALIVE_URL")
    if keepalive_url:
        # next_run_time=now: first ping immediately, then every 10 minutes.
        scheduler.add_job(
            keep_api_awake, "interval", minutes=10, args=[keepalive_url], id="keep_api_awake",
            next_run_time=datetime.now(scheduler.timezone),
        )
        logger.info("keep_api_awake: pinging %s every 10 min", keepalive_url)

    scheduler.start()
    logger.info(
        "scheduler started (%s): lead_find_agent daily 08:00, send_booking_agent every 30min, "
        "notify_booking_with_team hourly, close_stale_leads daily 08:30",
        scheduler.timezone,
    )
    return scheduler


async def main() -> None:
    scheduler = await start_scheduler()
    try:
        await asyncio.Event().wait()  # run forever
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        scheduler.shutdown()


if __name__ == "__main__":
    # psycopg's async mode can't run on Windows' default ProactorEventLoop.
    parser = argparse.ArgumentParser(description="Run the StormLead agents on a schedule.")
    parser.add_argument("--once", choices=JOB_NAMES, help="run one job immediately, then exit")
    args = parser.parse_args()

    loop_factory = asyncio.SelectorEventLoop if sys.platform == "win32" else None
    asyncio.run(run_once(args.once) if args.once else main(), loop_factory=loop_factory)
