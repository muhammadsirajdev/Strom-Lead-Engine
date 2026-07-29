"""Closes stale leads: a DB maintenance pass over `tracking` (db/schema.sql).

Any lead still sitting in 'awaiting_reply' -- emailed by lead_find_agent.py
but never replied to -- more than STALE_AFTER_DAYS days after last contact
gets moved to 'no_response', the schema's terminal status for "contacted,
never heard back" (see the status CHECK constraint and comment in
db/schema.sql). Once closed, send_booking_agent.py's triage no longer polls
that thread.

Usage:
    uv run python close_stale_leads.py [stale_after_days]
"""

import asyncio
import os
import sys

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv()

STALE_AFTER_DAYS = 7

CLOSE_STALE_LEADS_SQL = """
    UPDATE tracking
    SET status = 'no_response'
    WHERE status = 'awaiting_reply'
      AND last_contacted_at < now() - %s::interval
    RETURNING customer_id, thread_id, last_contacted_at
"""


async def close_stale_leads(stale_after_days: int = STALE_AFTER_DAYS) -> list[dict]:
    """DB tool call: flips any lead still 'awaiting_reply' after
    `stale_after_days` days of silence to 'no_response'. Returns the rows
    that were closed.
    """
    async with await psycopg.AsyncConnection.connect(
        os.environ["DATABASE_URL"], row_factory=dict_row, autocommit=True
    ) as conn:
        async with conn.cursor() as cur:
            await cur.execute(CLOSE_STALE_LEADS_SQL, (f"{stale_after_days} days",))
            return await cur.fetchall()


async def main() -> None:
    stale_after_days = int(sys.argv[1]) if len(sys.argv) > 1 else STALE_AFTER_DAYS

    closed = await close_stale_leads(stale_after_days)

    print(f"closed {len(closed)} stale lead(s) (no reply within {stale_after_days} day(s)):")
    for row in closed:
        print(f"- customer {row['customer_id']} (thread {row['thread_id']}), last contacted {row['last_contacted_at']}")


if __name__ == "__main__":
    # psycopg's async mode can't run on Windows' default ProactorEventLoop.
    loop_factory = asyncio.SelectorEventLoop if sys.platform == "win32" else None
    asyncio.run(main(), loop_factory=loop_factory)
