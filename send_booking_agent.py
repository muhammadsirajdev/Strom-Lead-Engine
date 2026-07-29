"""StormLead -- Run B: triage Gmail replies -> invite interested leads to book.

Two subgraphs under one parent graph:

- triage: scans `tracking` rows in any non-terminal status (awaiting_reply,
  interested, not_interested -- so a change-of-mind reply after an initial
  "not interested" still gets picked up), reads each thread via the
  `gmail_read_email` MCP tool, and classifies any new reply as
  interested / not_interested via an LLM.
- invite: for every customer now `interested` who hasn't been sent a
  Calendly link yet (`nudge_count == 0`), generates a single-use scheduling
  link via the Composio Calendly agent and replies in-thread with it via
  `gmail_send_email`.

This graph ends once invites go out. Checking whether a customer actually
booked a slot, and notifying the team, is notify_booking_with_team.py.

Usage:
    uv run python send_booking_agent.py [customer_id ...]
"""

import asyncio
import json
import operator
import os
import sys
import uuid
from typing import Annotated, Literal, TypedDict

import psycopg
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from psycopg.rows import dict_row
from pydantic import BaseModel, Field

from mcp_client import (
    build_checkpointer,
    build_composio_calendly_agent,
    build_mcp_client,
    get_required_tools,
    run_composio_agent,
)

REQUIRED_TOOLS = [
    "gmail_send_email",
    "gmail_read_email",
    "COMPOSIO_SEARCH_TOOLS",
    "COMPOSIO_GET_TOOL_SCHEMAS",
    "COMPOSIO_MULTI_EXECUTE_TOOL",
]


# What the parent graph carries: the batch of customers being processed.
# customer_ids is optional -- when empty/omitted, triage scans every
# non-terminal tracking row instead of a specific batch (invite is always
# unscoped: "who's ready to be invited" is purely DB-driven).
class MainState(TypedDict):
    customer_ids: list[str]
    triaged: Annotated[list[dict], operator.add]
    invited: Annotated[list[dict], operator.add]
    errors: Annotated[list[str], operator.add]


# Each subgraph's own working state. Field names (triaged/invited/errors)
# match MainState's on purpose -- when a compiled subgraph is added as a
# node, LangGraph only merges output keys that exist in BOTH schemas.
class TriageState(TypedDict):
    customer_ids: list[str]
    triaged: Annotated[list[dict], operator.add]
    errors: Annotated[list[str], operator.add]


class InviteState(TypedDict):
    invited: Annotated[list[dict], operator.add]
    errors: Annotated[list[str], operator.add]


async def ensure_triage_columns() -> None:
    """Idempotent migration for the one column Run B needs beyond what
    lead_find_agent.py's ensure_tracking_table already creates on `tracking`
    (db/schema.sql). Safe to call on every run.
    """
    ddl = "ALTER TABLE tracking ADD COLUMN IF NOT EXISTS triage_reason TEXT;"
    async with await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"]) as conn:
        async with conn.cursor() as cur:
            await cur.execute(ddl)


# ---------------------------------------------------------------------------
# DB helpers against the `tracking` table (db/schema.sql). Every function
# takes an already-open psycopg AsyncConnection (row_factory=dict_row).
# ---------------------------------------------------------------------------


async def get_triage_candidates(conn, customer_ids: list[str] | None = None) -> list[dict]:
    """Rows that might have a new reply worth looking at: any non-terminal
    status, so a change-of-mind reply after an initial 'not interested'
    still gets picked up, not just first-time replies.
    """
    query = """
        SELECT customer_id, thread_id, storm_context, processed_message_count
        FROM tracking
        WHERE status IN ('awaiting_reply', 'interested', 'not_interested')
    """
    params: tuple = ()
    if customer_ids:
        query += " AND customer_id = ANY(%s)"
        params = (customer_ids,)

    async with conn.cursor() as cur:
        await cur.execute(query, params)
        return await cur.fetchall()


async def mark_triage(conn, customer_id: int, status: str, reason: str, processed_message_count: int) -> None:
    async with conn.cursor() as cur:
        await cur.execute(
            """UPDATE tracking
               SET status = %s, triage_reason = %s, processed_message_count = %s
               WHERE customer_id = %s""",
            (status, reason, processed_message_count, customer_id),
        )


async def get_needs_followup(conn) -> list[dict]:
    """'interested' customers who haven't been sent the Calendly invite yet.
    `nudge_count` (already on `tracking`) doubles as the invite-sent marker,
    so no new column is needed for that.
    """
    query = """
        SELECT t.customer_id, t.thread_id, c.email, c.first_name
        FROM tracking t
        JOIN customers c ON c.customer_id = t.customer_id
        WHERE t.status = 'interested' AND t.nudge_count = 0
    """
    async with conn.cursor() as cur:
        await cur.execute(query)
        return await cur.fetchall()


async def mark_invited(conn, customer_id: int) -> None:
    async with conn.cursor() as cur:
        await cur.execute(
            """UPDATE tracking
               SET nudge_count = nudge_count + 1, last_contacted_at = now()
               WHERE customer_id = %s""",
            (customer_id,),
        )


# ---------------------------------------------------------------------------
# Reply classification (LLM)
# ---------------------------------------------------------------------------


class Classification(BaseModel):
    decision: Literal["OUT_OF_CONTEXT", "NOT_NEEDED", "NEEDED"]
    reason: str = Field(description="one sentence why")


classifier_llm = ChatOpenAI(model="gpt-4o", temperature=0).with_structured_output(Classification)


async def classify_reply(reply_text: str, original_context: str) -> Classification:
    prompt = (
        f"Original outreach context:\n{original_context}\n\n"
        f"Customer reply:\n{reply_text}\n\n"
        "Classify: OUT_OF_CONTEXT (unrelated/spam/auto-reply), "
        "NOT_NEEDED (reply needs no follow-up), NEEDED (wants help/meeting)."
    )
    return await classifier_llm.ainvoke(prompt)


def build_graph(tools: dict, checkpointer):
    """Wires the triage and invite subgraphs into the compiled, checkpointed
    parent graph. `tools` must contain every name in REQUIRED_TOOLS.
    """
    gmail_send_email = tools["gmail_send_email"]
    gmail_read_email = tools["gmail_read_email"]
    composio_agent = build_composio_calendly_agent(
        tools["COMPOSIO_SEARCH_TOOLS"], tools["COMPOSIO_GET_TOOL_SCHEMAS"], tools["COMPOSIO_MULTI_EXECUTE_TOOL"]
    )

    async def fetch_latest_reply(thread_id: str, processed_message_count: int) -> dict | None:
        """Reads the whole thread (thread_id == the original send's
        messageId, per lead_find_agent.py's sender_agent) via
        gmail_read_email. Returns None if the thread hasn't grown since we
        last processed it, otherwise the newest message's body plus the
        thread's new total message count -- callers persist that count via
        mark_triage so the same reply isn't reprocessed next run.
        """
        raw = await gmail_read_email.ainvoke({"messageId": thread_id})
        payload = json.loads(raw[0]["text"])
        messages = payload if isinstance(payload, list) else payload.get("messages") or payload.get("emails") or []

        if len(messages) <= processed_message_count:
            return None

        return {"body": messages[-1].get("body", ""), "message_count": len(messages)}

    async def send_email_in_thread(thread_id: str, to_email: str, body: str) -> None:
        await gmail_send_email.ainvoke(
            {"to": [to_email], "subject": "Re: Your roof check-in", "body": body, "threadId": thread_id}
        )

    async def create_scheduling_link(invitee_email: str, invitee_name: str) -> str:
        """Generates a single-use Calendly scheduling link for one invitee."""
        parsed = await run_composio_agent(
            composio_agent,
            f"Create a single-use Calendly scheduling link for {invitee_name} <{invitee_email}> "
            f"using the default/primary event type. Reply with JSON: {{\"url\": \"<the booking link>\"}}.",
        )
        if not parsed.get("url"):
            raise RuntimeError(f"Calendly agent returned no url: {parsed}")
        return parsed["url"]

    async def triage_node(state: TriageState) -> dict:
        triaged: list[dict] = []
        errors: list[str] = []

        async with await psycopg.AsyncConnection.connect(
            os.environ["DATABASE_URL"], row_factory=dict_row, autocommit=True
        ) as conn:
            rows = await get_triage_candidates(conn, state.get("customer_ids"))

            for row in rows:
                try:
                    reply = await fetch_latest_reply(row["thread_id"], row["processed_message_count"])
                    if reply is None:
                        continue  # no new reply since we last looked

                    storm = row["storm_context"] or {}
                    original_context = (
                        f"Outreach re: {storm.get('condition_text', 'a storm')} in "
                        f"{storm.get('city', 'their area')} on {storm.get('date', 'recently')}."
                    )

                    c = await classify_reply(reply["body"], original_context)
                    status = {
                        "NEEDED": "interested",
                        "NOT_NEEDED": "not_interested",
                        "OUT_OF_CONTEXT": "not_interested",
                    }[c.decision]

                    await mark_triage(conn, row["customer_id"], status, c.reason, reply["message_count"])
                    triaged.append({"customer_id": row["customer_id"], "decision": c.decision})
                except Exception as exc:
                    errors.append(f"{row['customer_id']}: triage failed - {exc}")

        return {"triaged": triaged, "errors": errors}

    async def invite_node(state: InviteState) -> dict:
        invited: list[dict] = []
        errors: list[str] = []

        async with await psycopg.AsyncConnection.connect(
            os.environ["DATABASE_URL"], row_factory=dict_row, autocommit=True
        ) as conn:
            rows = await get_needs_followup(conn)

            for row in rows:
                try:
                    link = await create_scheduling_link(row["email"], row["first_name"])
                    body = (
                        "Thanks for your reply! Please pick a time that works for you here: "
                        f"{link}\nWe're available Mon-Fri, 9-5."
                    )
                    await send_email_in_thread(row["thread_id"], row["email"], body)
                    await mark_invited(conn, row["customer_id"])
                    invited.append({"customer_id": row["customer_id"], "scheduling_link": link})
                except Exception as exc:
                    errors.append(f"{row['customer_id']}: invite failed - {exc}")

        return {"invited": invited, "errors": errors}

    triage_builder = StateGraph(TriageState)
    triage_builder.add_node("triage", triage_node)
    triage_builder.add_edge(START, "triage")
    triage_builder.add_edge("triage", END)
    triage_subgraph = triage_builder.compile()

    invite_builder = StateGraph(InviteState)
    invite_builder.add_node("invite", invite_node)
    invite_builder.add_edge(START, "invite")
    invite_builder.add_edge("invite", END)
    invite_subgraph = invite_builder.compile()

    main_builder = StateGraph(MainState)
    main_builder.add_node("triage", triage_subgraph)  # subgraph as a node
    main_builder.add_node("invite", invite_subgraph)
    main_builder.add_edge(START, "triage")
    main_builder.add_edge("triage", "invite")
    main_builder.add_edge("invite", END)

    return main_builder.compile(checkpointer=checkpointer)


async def main() -> None:
    # Leave customer_ids empty to scan every non-terminal tracking row, or
    # pass specific customer_ids as CLI args to limit this run to a subset.
    customer_ids = sys.argv[1:]

    client = build_mcp_client()
    tools = await get_required_tools(client, REQUIRED_TOOLS)
    await ensure_triage_columns()
    checkpointer = await build_checkpointer()
    graph = build_graph(tools, checkpointer)

    config = {"configurable": {"thread_id": str(uuid.uuid4())}}
    result = await graph.ainvoke({"customer_ids": customer_ids}, config)

    print("triaged:", result["triaged"])
    print("invited:", result["invited"])
    if result.get("errors"):
        print("errors:", result["errors"])


if __name__ == "__main__":
    # psycopg's async mode can't run on Windows' default ProactorEventLoop.
    loop_factory = asyncio.SelectorEventLoop if sys.platform == "win32" else None
    asyncio.run(main(), loop_factory=loop_factory)
