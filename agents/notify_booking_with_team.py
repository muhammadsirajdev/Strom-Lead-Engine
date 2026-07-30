"""StormLead -- Run C: check Calendly bookings -> notify the team on Slack -> save.

For every customer already invited by agents/send_booking_agent.py (status
'interested', nudge_count > 0) who hasn't booked yet, polls Calendly (via
the Composio Calendly agent) for a scheduled event. Newly-booked customers
get one Slack message each in #leads-only, and only bookings that post
successfully get persisted as `tracking.status = 'booked'` -- one that fails
to notify stays 'interested' and gets picked up (and re-notified) next run,
instead of silently being marked booked without ever alerting the team.

Usage (from the project root):
    uv run python -m agents.notify_booking_with_team [customer_id ...]
"""

import asyncio
import json
import operator
import os
import sys
import uuid
from typing import Annotated, TypedDict

import psycopg
from langgraph.graph import END, START, StateGraph
from psycopg.rows import dict_row

from .runtime import (
    build_checkpointer,
    build_composio_calendly_agent,
    build_mcp_client,
    get_required_tools,
    run_composio_agent,
)

REQUIRED_TOOLS = [
    "slack_user_post_message",
    "slack_user_list_channels",
    "COMPOSIO_SEARCH_TOOLS",
    "COMPOSIO_GET_TOOL_SCHEMAS",
    "COMPOSIO_MULTI_EXECUTE_TOOL",
]

SLACK_CHANNEL_NAME = "leads-only"


# customer_ids is optional -- when empty/omitted, check_bookings scans every
# already-invited customer instead of a specific batch. bookings/notified/
# saved are separate accumulators (rather than one list mutated in place) so
# a partial failure at any stage is visible -- see module docstring.
class NotifyState(TypedDict):
    customer_ids: list[str]
    bookings: Annotated[list[dict], operator.add]
    notified: Annotated[list[dict], operator.add]
    saved: Annotated[list[dict], operator.add]
    errors: Annotated[list[str], operator.add]


async def ensure_notify_columns() -> None:
    """Idempotent migration for the one column this graph needs beyond what
    agents/lead_find_agent.py's ensure_tracking_table already creates on `tracking`
    (db/schema.sql). Safe to call on every run.
    """
    ddl = "ALTER TABLE tracking ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;"
    async with await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"]) as conn:
        async with conn.cursor() as cur:
            await cur.execute(ddl)


# ---------------------------------------------------------------------------
# DB helpers against the `tracking` table (db/schema.sql), joined to
# `customers` for the details the Slack message needs.
# ---------------------------------------------------------------------------


async def get_awaiting_booking(conn, customer_ids: list[str] | None = None) -> list[dict]:
    """Already-invited customers (nudge_count > 0, still 'interested') who
    haven't booked a Calendly slot yet -- candidates for check_bookings_node
    to poll.
    """
    query = """
        SELECT t.customer_id, t.thread_id, t.storm_context,
               c.first_name, c.last_name, c.email, c.phone, c.city, c.state,
               c.roof_material, c.roof_age_years
        FROM tracking t
        JOIN customers c ON c.customer_id = t.customer_id
        WHERE t.status = 'interested' AND t.nudge_count > 0
    """
    params: tuple = ()
    if customer_ids:
        query += " AND t.customer_id = ANY(%s)"
        params = (customer_ids,)

    async with conn.cursor() as cur:
        await cur.execute(query, params)
        return await cur.fetchall()


async def mark_booked(conn, customer_id: int, scheduled_at: str | None) -> None:
    async with conn.cursor() as cur:
        await cur.execute(
            "UPDATE tracking SET status = 'booked', scheduled_at = %s::timestamptz WHERE customer_id = %s",
            (scheduled_at, customer_id),
        )


def format_booking_message(booking: dict) -> str:
    storm = booking.get("storm_context") or {}
    return (
        f":calendar: *New inspection booked* -- {booking['first_name']} {booking['last_name']}\n"
        f"*When:* {booking.get('scheduled_at') or 'time TBD'}\n"
        f"*Contact:* {booking['email']}" + (f" | {booking['phone']}" if booking.get("phone") else "") + "\n"
        f"*Address:* {booking['city']}, {booking['state']}\n"
        f"*Roof:* {booking.get('roof_material', 'unknown')}, ~{booking.get('roof_age_years', '?')} yrs old\n"
        f"*Storm context:* {storm.get('condition_text', 'n/a')}, {storm.get('wind_mph', '?')} mph, "
        f"{storm.get('date', 'n/a')}"
    )


def build_graph(tools: dict, checkpointer):
    """Wires check_bookings -> notify_slack -> save_booking into a compiled,
    checkpointed graph. `tools` must contain every name in REQUIRED_TOOLS.
    """
    slack_user_post_message = tools["slack_user_post_message"]
    slack_user_list_channels = tools["slack_user_list_channels"]
    composio_agent = build_composio_calendly_agent(
        tools["COMPOSIO_SEARCH_TOOLS"], tools["COMPOSIO_GET_TOOL_SCHEMAS"], tools["COMPOSIO_MULTI_EXECUTE_TOOL"]
    )

    _slack_channel_id_cache: dict[str, str] = {}

    async def get_slack_channel_id() -> str:
        if "id" in _slack_channel_id_cache:
            return _slack_channel_id_cache["id"]

        # The channel_name server-side filter is unreliable once types
        # includes private_channel -- fetch the full list and match
        # client-side instead. Cheap: this workspace only has a handful of
        # channels, and the result is cached after the first call.
        raw = await slack_user_list_channels.ainvoke({"types": "public_channel,private_channel", "limit": 200})
        payload = json.loads(raw[0]["text"])
        channels = payload if isinstance(payload, list) else payload.get("channels") or []

        exact = [c for c in channels if c.get("name", "").lower() == SLACK_CHANNEL_NAME.lower()]
        if not exact:
            raise RuntimeError(
                f"could not find Slack channel {SLACK_CHANNEL_NAME!r} among {[c.get('name') for c in channels]}"
            )

        _slack_channel_id_cache["id"] = exact[0]["id"]
        return _slack_channel_id_cache["id"]

    async def notify_slack(booking: dict) -> None:
        channel_id = await get_slack_channel_id()
        await slack_user_post_message.ainvoke({"channel_id": channel_id, "text": format_booking_message(booking)})

    async def check_booking(invitee_email: str) -> dict | None:
        """Checks whether `invitee_email` has booked a Calendly event yet.
        Returns None if not booked, else {"scheduled_at": "<ISO 8601 or None>"}.
        """
        parsed = await run_composio_agent(
            composio_agent,
            f"Check whether {invitee_email} has booked/scheduled a Calendly event. First call "
            f"CALENDLY_GET_USER to get the current user's URI (Calendly's list-events tool requires it to "
            f"filter by organizer) -- then list scheduled events filtered by that user and "
            f"invitee_email={invitee_email}. Reply with JSON: "
            f'{{"booked": true/false, "scheduled_at": "<ISO 8601 start time or null>"}}.',
        )
        return {"scheduled_at": parsed.get("scheduled_at")} if parsed.get("booked") else None

    async def check_bookings_node(state: NotifyState) -> dict:
        """Polls Calendly for customers already invited who haven't booked
        yet. Doesn't touch the DB -- just collects who's newly booked, in
        state, for the next two nodes.
        """
        bookings: list[dict] = []
        errors: list[str] = []

        async with await psycopg.AsyncConnection.connect(
            os.environ["DATABASE_URL"], row_factory=dict_row, autocommit=True
        ) as conn:
            rows = await get_awaiting_booking(conn, state.get("customer_ids"))

            for row in rows:
                try:
                    result = await check_booking(row["email"])
                    if result is None:
                        continue  # not booked yet
                    bookings.append({**row, "scheduled_at": result["scheduled_at"]})
                except Exception as exc:
                    errors.append(f"{row['customer_id']}: booking check failed - {exc}")

        return {"bookings": bookings, "errors": errors}

    async def notify_slack_node(state: NotifyState) -> dict:
        """Posts one Slack message per newly-booked customer. Only bookings
        that post successfully move on to save_booking_node.
        """
        notified: list[dict] = []
        errors: list[str] = []

        for booking in state.get("bookings", []):
            try:
                await notify_slack(booking)
                notified.append(booking)
            except Exception as exc:
                errors.append(f"{booking['customer_id']}: slack notify failed - {exc}")

        return {"notified": notified, "errors": errors}

    async def save_booking_node(state: NotifyState) -> dict:
        """Persists status='booked' + scheduled_at only for bookings that
        were actually notified in Slack -- the last step, per the
        check -> notify -> save order.
        """
        saved: list[dict] = []
        errors: list[str] = []

        async with await psycopg.AsyncConnection.connect(
            os.environ["DATABASE_URL"], row_factory=dict_row, autocommit=True
        ) as conn:
            for booking in state.get("notified", []):
                try:
                    await mark_booked(conn, booking["customer_id"], booking["scheduled_at"])
                    saved.append({"customer_id": booking["customer_id"]})
                except Exception as exc:
                    errors.append(f"{booking['customer_id']}: db save failed - {exc}")

        return {"saved": saved, "errors": errors}

    notify_builder = StateGraph(NotifyState)
    notify_builder.add_node("check_bookings", check_bookings_node)
    notify_builder.add_node("notify_slack", notify_slack_node)
    notify_builder.add_node("save_booking", save_booking_node)
    notify_builder.add_edge(START, "check_bookings")
    notify_builder.add_edge("check_bookings", "notify_slack")
    notify_builder.add_edge("notify_slack", "save_booking")
    notify_builder.add_edge("save_booking", END)

    return notify_builder.compile(checkpointer=checkpointer)


async def main() -> None:
    # Leave customer_ids empty to scan every already-invited customer, or
    # pass specific customer_ids as CLI args to limit this run to a subset.
    customer_ids = sys.argv[1:]

    client = build_mcp_client()
    tools = await get_required_tools(client, REQUIRED_TOOLS)
    await ensure_notify_columns()
    checkpointer = await build_checkpointer()
    graph = build_graph(tools, checkpointer)

    config = {"configurable": {"thread_id": str(uuid.uuid4())}}
    result = await graph.ainvoke({"customer_ids": customer_ids}, config)

    print("bookings found:", result["bookings"])
    print("notified:", result["notified"])
    print("saved:", result["saved"])
    if result.get("errors"):
        print("errors:", result["errors"])


if __name__ == "__main__":
    # psycopg's async mode can't run on Windows' default ProactorEventLoop.
    loop_factory = asyncio.SelectorEventLoop if sys.platform == "win32" else None
    asyncio.run(main(), loop_factory=loop_factory)
