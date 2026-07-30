"""StormLead -- Run A: weather -> leads -> human-reviewed outreach -> send.

Flow: for each service city -> the openweather MCP tool (`get_current_weather`)
checks conditions -> if `StormEvent.qualifies` (storm condition code or wind
over `WIND_THRESHOLD_MPH`), the city is passed to the `get_customers_by_city`
DB tool to pull opted-in leads -> the personalizer drafts one email per lead
-> a human reviews/approves/rejects/rewrites each draft via a LangGraph
`interrupt` gate -> the sender sends only the approved emails and records a
`tracking` row per send for Run B (agents/send_booking_agent.py) to pick up
later.

If no city qualifies (no storm, or no opted-in customers), the run ends
right after targeting instead of drafting anything.

Usage (from the project root):
    uv run python -m agents.lead_find_agent <city> [<city> ...]
    uv run python -m agents.lead_find_agent --review   # resolve any runs paused at human_review
"""

import asyncio
import json
import operator
import os
import sys
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Literal, TypedDict

import psycopg
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, model_validator

from .runtime import build_checkpointer, build_mcp_client, get_required_tools

REQUIRED_TOOLS = ["get_current_weather", "gmail_send_email"]

WIND_THRESHOLD_MPH = 50.0

# OpenWeather condition-code groups that count as a storm.
# 2xx = thunderstorm, 7xx range includes squall (771) and tornado (781).
THUNDERSTORM_CODES = range(200, 300)
SQUALL_TORNADO_CODES = {771, 781}


def _to_mph(speed: float, units: Literal["m/s", "mph"]) -> float:
    """OpenWeather returns m/s on metric, mph on imperial. Normalize to mph."""
    return speed * 2.23694 if units == "m/s" else speed


class StormEvent(BaseModel):
    """One detected weather event for a city, built from the openweather MCP
    tool's `get_current_weather` output. No hail data is available from
    OpenWeather, so the trigger is storm condition codes OR high wind.
    `qualifies` is computed, never hand-set.
    """

    city: str
    condition_code: int  # OpenWeather weather.id
    condition_text: str  # human-readable, e.g. "Thunderstorm"
    wind_speed: float  # raw value from OpenWeather
    wind_units: Literal["m/s", "mph"]  # store units so the threshold is unambiguous
    date: str
    qualifies: bool = False

    @property
    def wind_mph(self) -> float:
        return _to_mph(self.wind_speed, self.wind_units)

    @model_validator(mode="after")
    def _set_qualifies(self) -> "StormEvent":
        is_storm = self.condition_code in THUNDERSTORM_CODES or self.condition_code in SQUALL_TORNADO_CODES
        self.qualifies = is_storm or self.wind_mph >= WIND_THRESHOLD_MPH
        return self


class Lead(BaseModel):
    """One targeted customer + property record for the personalizer. Field
    names/types mirror the `customers` table (db/schema.sql) directly, so a
    DB row validates straight into this model with no remapping.
    """

    customer_id: int
    first_name: str
    last_name: str
    email: str
    city: str
    state: str
    zip: str
    roof_material: str
    roof_age_years: int
    insurance_carrier: str | None = None


class StormContext(BaseModel):
    """Compact storm summary carried with a lead into later runs. Also
    stored in the `tracking` ledger so Run B's triage can read it.
    """

    city: str
    condition_text: str
    wind_mph: float
    date: str


class DraftStatus(str, Enum):
    """Per-draft review state. Lives on each EmailDraft so the human_review
    gate can track every draft individually instead of one batch-level flag.
    """

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class EmailDraft(BaseModel):
    """One personalized draft. The personalizer produces a list; the human
    gate approves; the sender consumes.
    """

    customer_id: int
    to_email: str
    subject: str
    body: str
    storm_context: StormContext
    status: DraftStatus = DraftStatus.PENDING
    feedback: str | None = None
    gmail_thread_id: str | None = None


class RunAState(TypedDict):
    # trigger/input -- city name(s) to check
    service_cities: list[str]

    # monitor -- StormEvents built from OpenWeather (condition code + wind), one per city
    storm_events: list[StormEvent]
    qualifying_cities: list[str]

    # targeting -- Leads pulled from the DB (already opted-in)
    leads: list[Lead]

    # personalize + human gate -- single source of truth. Each draft's own
    # `status` (pending/approved/rejected) tracks review state, so there is
    # no separate approved-batch flag or approved-drafts list to keep in sync.
    drafts: list[EmailDraft]

    # sender -- {customer_id, gmail_thread_id, status}
    sent: list[dict]

    # accumulates across any node
    errors: Annotated[list[str], operator.add]


# ---------------------------------------------------------------------------
# Targeting -- DB tool
# ---------------------------------------------------------------------------


@tool
async def get_customers_by_city(city: str) -> list[Lead]:
    """Look up opted-in customers in a given city.

    Returns one Lead per matching customer: customer_id, first_name,
    last_name, email, city, state, zip, roof_material, roof_age_years,
    and insurance_carrier.
    """
    query = """
        SELECT customer_id, first_name, last_name, email, city, state, zip,
               roof_material, roof_age_years, insurance_carrier
        FROM customers
        WHERE city ILIKE %s AND marketing_opt_in = true
    """
    async with await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, (city,))
            rows = await cur.fetchall()
            return [Lead(**row) for row in rows]


async def targeting_customer_agent(state: RunAState) -> dict:
    """Targeting node: for each qualifying city (from the monitor node), pulls
    opted-in customers via the `get_customers_by_city` DB tool and gathers
    them into `leads` for the personalizer.
    """
    leads: list[Lead] = []
    errors: list[str] = []

    for city in state["qualifying_cities"]:
        try:
            city_leads = await get_customers_by_city.ainvoke({"city": city})
        except Exception as exc:
            errors.append(f"{city}: customer lookup failed - {exc}")
            continue

        leads.extend(city_leads)

    return {"leads": leads, "errors": errors}


# ---------------------------------------------------------------------------
# Personalizer -- email drafts
# ---------------------------------------------------------------------------


class _EmailContent(BaseModel):
    """Slim structured-output schema for the LLM call -- the node wraps this
    into a full EmailDraft (which also needs customer_id/storm_context)."""

    subject: str = Field(description="Short, professional subject line referencing the storm and check-in purpose")
    body: str = Field(description="Full plain-text email body, professional tone, no markdown/bullets")


PERSONALIZER_SYSTEM_PROMPT = """You are a professional, empathetic customer-outreach specialist for a \
roofing company that monitors severe weather across its service area and follows up with homeowners after \
storms. You will be given one homeowner's details and the storm that recently affected their city. Write \
ONE personalized outreach email for that homeowner, following these rules exactly:

1. Tone: warm, professional, concise — a caring check-in, never salesy or alarmist.
2. Open by acknowledging the specific storm/weather condition and date in their city, and briefly express \
sympathy (e.g. "sorry to hear about the recent storm activity in your area").
3. State the purpose plainly: you are reaching out to check whether the storm caused any damage to their \
roof. Do not assume or claim that damage occurred — you are simply checking in.
4. Where it fits naturally, reference their roof material and/or approximate age to make the message feel \
personalized (e.g. older roofs or certain materials can be more vulnerable to storm damage). Do not force \
this if it reads awkwardly for the given details.
5. Call to action: ask them to simply reply to this email if they've noticed any damage (missing/loose \
shingles, leaks, dents, granule loss, etc.) so the company can follow up with more details and arrange a \
free inspection. Make clear that replying is quick and low-effort.
6. If they haven't noticed anything, reassure them no action is needed — but they're welcome to reply \
anyway if they'd like a precautionary inspection.
7. Sign off professionally from "The StormLead Roofing Team".
8. Do NOT invent facts that weren't provided (no insurance claims, no guarantees, no pricing, no specific \
dollar amounts).
9. Length: 120-180 words, plain prose paragraphs only — no markdown, no bullet lists, no placeholder \
brackets like [Name].
"""

PERSONALIZER_USER_TEMPLATE = """Customer: {first_name} {last_name}
Location: {city}, {state}
Roof: {roof_material}, approximately {roof_age_years} years old
Insurance carrier on file: {insurance_carrier}

Storm details for {city}:
- Condition: {condition_text}
- Wind speed: {wind_mph} mph
- Date: {date}

Write the personalized outreach email now, following all system instructions."""

personalizer_llm = ChatOpenAI(model="gpt-5.4-mini", temperature=0.4).with_structured_output(_EmailContent)


async def email_writing_agent(state: RunAState) -> dict:
    """Personalize node: drafts one storm-damage check-in email per lead,
    using that lead's city storm context (from the monitor node's
    `storm_events`).
    """
    events_by_city = {event.city: event for event in state["storm_events"]}

    drafts: list[EmailDraft] = []
    errors: list[str] = []

    for lead in state["leads"]:
        event = events_by_city.get(lead.city)
        if event is None:
            errors.append(f"{lead.customer_id}: no storm event found for city {lead.city}")
            continue

        storm_context = StormContext(
            city=event.city,
            condition_text=event.condition_text,
            wind_mph=round(event.wind_mph, 1),
            date=event.date,
        )

        user_prompt = PERSONALIZER_USER_TEMPLATE.format(
            first_name=lead.first_name,
            last_name=lead.last_name,
            city=lead.city,
            state=lead.state,
            roof_material=lead.roof_material,
            roof_age_years=lead.roof_age_years,
            insurance_carrier=lead.insurance_carrier or "not on file",
            condition_text=storm_context.condition_text,
            wind_mph=storm_context.wind_mph,
            date=storm_context.date,
        )

        try:
            email_content = await personalizer_llm.ainvoke(
                [
                    SystemMessage(content=PERSONALIZER_SYSTEM_PROMPT),
                    HumanMessage(content=user_prompt),
                ]
            )
        except Exception as exc:
            errors.append(f"{lead.customer_id}: draft generation failed - {exc}")
            continue

        drafts.append(
            EmailDraft(
                customer_id=lead.customer_id,
                to_email=lead.email,
                subject=email_content.subject,
                body=email_content.body,
                storm_context=storm_context,
            )
        )

    return {"drafts": drafts, "errors": errors}


# ---------------------------------------------------------------------------
# Human review gate
#
# `human_review` has no side effects -- it never touches Gmail. The node
# containing `interrupt()` re-executes from the top every time the graph
# resumes, so it must stay pure: filter drafts, call `interrupt` once, apply
# the returned decisions, return new draft instances.
# ---------------------------------------------------------------------------

REWRITE_SYSTEM_PROMPT = """You are revising ONE storm-outreach email based on a human \
reviewer's feedback. You will be given the original subject/body and the storm context \
it references, plus the reviewer's instruction. Rewrite the body to satisfy that \
instruction while keeping the original rules: warm, professional, concise tone; no \
invented facts (no insurance claims, no guarantees, no pricing); 120-180 words; plain \
prose paragraphs only, no markdown, no placeholder brackets. Keep the subject unchanged \
unless the feedback explicitly asks to change it."""


async def regenerate_email_body(draft: EmailDraft, feedback: str | None) -> str:
    """Rewrite a draft's body via the LLM, using the human's feedback as the
    instruction. Used by `_apply_review_decision` when a rewrite decision has
    no `edited_body` supplied directly.
    """
    user_prompt = f"""Original subject: {draft.subject}
Original body:
{draft.body}

Storm context: {draft.storm_context.condition_text} in {draft.storm_context.city} \
on {draft.storm_context.date}, wind {draft.storm_context.wind_mph} mph.

Reviewer feedback: {feedback or "(no specific feedback -- improve clarity and tone)"}

Rewrite the email body now, applying the feedback."""

    result = await personalizer_llm.ainvoke(
        [
            SystemMessage(content=REWRITE_SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ]
    )
    return result.body


async def _apply_review_decision(draft: EmailDraft, decision: dict) -> EmailDraft:
    """Turn one human decision into a new EmailDraft instance (never mutate
    in place, so the checkpointer captures the change cleanly).

    `decision` shape: {"action": "approve" | "reject" | "rewrite",
                        "feedback": str | None, "edited_body": str | None}
    """
    action = decision.get("action")

    if action == "approve":
        return draft.model_copy(update={"status": DraftStatus.APPROVED})

    if action == "reject":
        return draft.model_copy(update={"status": DraftStatus.REJECTED, "feedback": decision.get("feedback")})

    if action == "rewrite":
        feedback = decision.get("feedback")
        edited_body = decision.get("edited_body")
        new_body = edited_body if edited_body else await regenerate_email_body(draft, feedback)
        return draft.model_copy(
            update={
                "body": new_body,
                "status": DraftStatus.PENDING,  # comes back for another look
                "feedback": feedback,
            }
        )

    raise ValueError(f"unknown review action: {action!r}")


async def human_review(state: RunAState) -> dict:
    """Human-in-the-loop gate. On the first pass every draft is pending. On
    later passes (after a rewrite loop-back) only the just-rewritten drafts
    are pending, so the human is shown just those, not the whole batch again.
    """
    pending = [d for d in state["drafts"] if d.status == DraftStatus.PENDING]
    settled = [d for d in state["drafts"] if d.status != DraftStatus.PENDING]

    if not pending:
        return {"drafts": state["drafts"]}

    # Serialize to plain dicts -- this payload crosses to the frontend and
    # back through the checkpointer, so no raw model objects.
    payload = {"drafts": [d.model_dump(mode="json") for d in pending]}
    decisions = interrupt(payload)

    updated_pending = []
    for draft in pending:
        decision = decisions.get(str(draft.customer_id))
        if decision is None:
            updated_pending.append(draft)
            continue
        updated_pending.append(await _apply_review_decision(draft, decision))

    return {"drafts": settled + updated_pending}


def route_after_targeting(state: RunAState) -> str:
    """No qualifying leads -- nothing to email, end the run early."""
    if not state.get("leads"):
        return END
    return "Get_Email_Draft"


def route_after_human_review(state: RunAState) -> str:
    """Rewrite loop: any still-pending draft means a rewrite just came back
    and needs another look, so loop back into human_review. Otherwise every
    draft is settled (approved/rejected) and it's on to the sender.
    """
    if any(d.status == DraftStatus.PENDING for d in state["drafts"]):
        return "human_review"
    return "Send_Email"


# ---------------------------------------------------------------------------
# Sender -- Gmail send + tracking write
#
# Runs once, after the human-review loop fully resolves (no drafts left with
# status == pending). For each approved draft: sends it for real via the
# `gmail_send_email` MCP tool, then upserts a `tracking` row keyed by the
# resulting Gmail thread_id -- the handoff Run B (agents/send_booking_agent.py)
# polls later. Rejected (and any leftover pending) drafts are skipped
# entirely -- no Gmail action, no tracking row.
# ---------------------------------------------------------------------------

TRACKING_UPSERT_SQL = """
    INSERT INTO tracking (customer_id, thread_id, storm_context, status, last_contacted_at)
    VALUES (%s, %s, %s, 'awaiting_reply', now())
    ON CONFLICT (thread_id) DO UPDATE SET last_contacted_at = EXCLUDED.last_contacted_at
"""


async def ensure_tracking_table() -> None:
    """Idempotent: creates `tracking` if it's missing (db/schema.sql already
    defines it in the current shape). Safe to call on every run.
    """
    ddl = """
        CREATE TABLE IF NOT EXISTS tracking (
            lead_id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            customer_id             INTEGER NOT NULL REFERENCES customers (customer_id),
            thread_id               TEXT UNIQUE,
            storm_context           JSONB,
            status                  TEXT NOT NULL DEFAULT 'awaiting_reply'
                                         CHECK (status IN ('awaiting_reply', 'interested', 'not_interested',
                                                            'booked', 'no_response', 'unsubscribed')),
            processed_message_count INTEGER NOT NULL DEFAULT 1,
            nudge_count             INTEGER NOT NULL DEFAULT 0,
            last_contacted_at       TIMESTAMPTZ NOT NULL,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_tracking_status ON tracking (status);
    """
    async with await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"]) as conn:
        async with conn.cursor() as cur:
            await cur.execute(ddl)


# ---------------------------------------------------------------------------
# Pending-review ledger
#
# A scheduled run (see backend/scheduler.py) can't block on interactive input, so it
# only ever kicks a run off (see run_once). If that run pauses at
# human_review, its thread_id is recorded here so a later `--review` pass
# (run anytime, by a human) can find and resolve it. Nothing sends until
# that happens -- this ledger is purely a "what's waiting on me" index, not
# a second source of truth for review state (the checkpointer already has
# that).
# ---------------------------------------------------------------------------


async def ensure_pending_review_table() -> None:
    """Idempotent: creates `run_a_pending_review` if it's missing. Safe to
    call on every run."""
    ddl = """
        CREATE TABLE IF NOT EXISTS run_a_pending_review (
            thread_id      TEXT PRIMARY KEY,
            service_cities TEXT[] NOT NULL,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """
    async with await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"]) as conn:
        async with conn.cursor() as cur:
            await cur.execute(ddl)


async def _record_pending_review(thread_id: str, service_cities: list[str]) -> None:
    async with await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO run_a_pending_review (thread_id, service_cities) VALUES (%s, %s) "
                "ON CONFLICT (thread_id) DO NOTHING",
                (thread_id, service_cities),
            )


async def _clear_pending_review(thread_id: str) -> None:
    async with await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM run_a_pending_review WHERE thread_id = %s", (thread_id,))


async def _list_pending_reviews() -> list[dict]:
    async with await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT thread_id, service_cities, created_at FROM run_a_pending_review ORDER BY created_at")
            return await cur.fetchall()


def build_graph(tools: dict, checkpointer):
    """Wires the five StormLead Run-A nodes into a compiled, checkpointed
    graph. `tools` must contain every name in REQUIRED_TOOLS.
    """
    get_current_weather = tools["get_current_weather"]
    gmail_send_email = tools["gmail_send_email"]

    async def weather_monitor_agent(state: RunAState) -> dict:
        """Monitor node: checks each service city for storm conditions via
        the openweather MCP tool and builds a StormEvent per city. A city
        ends up in `qualifying_cities` when `StormEvent.qualifies` is True.
        Per-city failures are appended to `errors` instead of aborting the
        whole run.
        """
        storm_events: list[StormEvent] = []
        qualifying_cities: list[str] = []
        errors: list[str] = []

        for city in state["service_cities"]:
            try:
                raw = await get_current_weather.ainvoke({"location": city, "units": "imperial"})
                payload = json.loads(raw[0]["text"])

                event = StormEvent(
                    city=city,
                    condition_code=payload["condition_code"],
                    condition_text=payload["conditions"],
                    wind_speed=payload["wind_speed"],
                    wind_units="mph" if payload["units"] == "imperial" else "m/s",
                    date=datetime.fromtimestamp(payload["observed_at"], tz=timezone.utc).date().isoformat(),
                )
            except Exception as exc:
                errors.append(f"{city}: weather lookup failed - {exc}")
                continue

            storm_events.append(event)
            if event.qualifies:
                qualifying_cities.append(city)

        return {"storm_events": storm_events, "qualifying_cities": qualifying_cities, "errors": errors}

    async def sender_agent(state: RunAState) -> dict:
        """Send_Email node -- the only node that performs a real, external
        side effect. One Postgres connection (autocommit) is opened for the
        whole call and reused across every tracking upsert, so one draft's
        failed insert can't poison the transaction for the others.
        """
        sent: list[dict] = []
        errors: list[str] = []
        updated_drafts: list[EmailDraft] = []

        async with await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"], autocommit=True) as conn:
            for draft in state["drafts"]:
                if draft.status != DraftStatus.APPROVED:
                    updated_drafts.append(draft)
                    continue

                try:
                    raw = await gmail_send_email.ainvoke(
                        {"to": [draft.to_email], "subject": draft.subject, "body": draft.body}
                    )
                    payload = json.loads(raw[0]["text"])
                    # gmail_send_email's response has no "threadId" field. Every
                    # send here starts a brand-new thread (no threadId/inReplyTo
                    # passed), and per Gmail's API contract the first message of
                    # a new thread has id == threadId -- so messageId IS the
                    # thread id for this always-new-thread pattern. If a future
                    # node ever sends a *reply*, don't re-derive threadId from
                    # that reply's own messageId -- pass the originally stored
                    # threadId back in as inReplyTo/threadId instead.
                    thread_id = payload.get("messageId")
                    sent_draft = draft.model_copy(update={"gmail_thread_id": thread_id})

                    async with conn.cursor() as cur:
                        await cur.execute(
                            TRACKING_UPSERT_SQL,
                            (draft.customer_id, thread_id, Jsonb(draft.storm_context.model_dump(mode="json"))),
                        )

                    sent.append({"customer_id": draft.customer_id, "gmail_thread_id": thread_id, "status": "sent"})
                    updated_drafts.append(sent_draft)
                except Exception as exc:
                    errors.append(f"{draft.customer_id}: send failed - {exc}")
                    updated_drafts.append(draft)

        return {"drafts": updated_drafts, "sent": sent, "errors": errors}

    graph_builder = StateGraph(RunAState)
    graph_builder.add_node("Check_Weather", weather_monitor_agent)
    graph_builder.add_node("Get_Customer", targeting_customer_agent)
    graph_builder.add_node("Get_Email_Draft", email_writing_agent)
    graph_builder.add_node("human_review", human_review)
    graph_builder.add_node("Send_Email", sender_agent)

    graph_builder.add_edge(START, "Check_Weather")
    graph_builder.add_edge("Check_Weather", "Get_Customer")
    graph_builder.add_conditional_edges(
        "Get_Customer", route_after_targeting, {"Get_Email_Draft": "Get_Email_Draft", END: END}
    )
    graph_builder.add_edge("Get_Email_Draft", "human_review")
    graph_builder.add_conditional_edges(
        "human_review", route_after_human_review, {"human_review": "human_review", "Send_Email": "Send_Email"}
    )
    graph_builder.add_edge("Send_Email", END)

    return graph_builder.compile(checkpointer=checkpointer)


# ---------------------------------------------------------------------------
# CLI human review -- replaces a real frontend for standalone runs
# ---------------------------------------------------------------------------


def _prompt_decision(draft: dict) -> dict:
    print(f"\n--- Draft for customer {draft['customer_id']} <{draft['to_email']}> ---")
    print(f"Subject: {draft['subject']}\n")
    print(draft["body"])

    action = ""
    while action not in {"approve", "reject", "rewrite"}:
        action = input("\nDecision (approve/reject/rewrite): ").strip().lower()

    feedback = None
    if action != "approve":
        feedback = input("Feedback (optional, Enter to skip): ").strip() or None
    return {"action": action, "feedback": feedback, "edited_body": None}


def collect_review_decisions(pending_drafts: list[dict]) -> dict:
    return {str(draft["customer_id"]): _prompt_decision(draft) for draft in pending_drafts}


async def run_once(graph, service_cities: list[str]) -> tuple[dict, str]:
    """Kicks off one Run A pass for `service_cities` and returns immediately
    -- does not block on interactive review. If the run pauses at
    human_review, the thread is recorded in `run_a_pending_review` for a
    later `--review` pass (interactive, run by a human) to resolve; nothing
    sends until then. Used by both main()'s fresh-run path and by
    backend/scheduler.py's unattended daily job.
    """
    thread_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    result = await graph.ainvoke({"service_cities": service_cities}, config)
    if "__interrupt__" in result:
        await _record_pending_review(thread_id, service_cities)
    return result, thread_id


async def _resolve_review_loop(graph, thread_id: str, result: dict) -> dict:
    """Runs the CLI approve/reject/rewrite loop until no draft is left
    pending, then clears the thread's pending-review record. Shared by a
    fresh interactive run and `--review`'s resume of an earlier paused run.
    """
    config = {"configurable": {"thread_id": thread_id}}
    while "__interrupt__" in result:
        pending_payload = result["__interrupt__"][0].value
        decisions = collect_review_decisions(pending_payload["drafts"])
        result = await graph.ainvoke(Command(resume=decisions), config)

    await _clear_pending_review(thread_id)
    return result


async def review_pending_runs(graph) -> None:
    """`--review` mode: resumes every thread left paused at human_review --
    whether it was started interactively and interrupted (e.g. terminal
    closed mid-review) or kicked off unattended by backend/scheduler.py -- and walks
    through the same approve/reject/rewrite CLI as a fresh run.
    """
    pending = await _list_pending_reviews()
    if not pending:
        print("No runs awaiting review.")
        return

    for row in pending:
        thread_id = row["thread_id"]
        print(f"\n=== Resuming thread {thread_id} (cities: {row['service_cities']}) ===")
        config = {"configurable": {"thread_id": thread_id}}
        result = await graph.ainvoke(None, config)
        result = await _resolve_review_loop(graph, thread_id, result)

        print("sent:", result.get("sent"))
        if result.get("errors"):
            print("errors:", result["errors"])


async def main() -> None:
    client = build_mcp_client()
    tools = await get_required_tools(client, REQUIRED_TOOLS)
    await ensure_tracking_table()
    await ensure_pending_review_table()
    checkpointer = await build_checkpointer()
    graph = build_graph(tools, checkpointer)

    if sys.argv[1:2] == ["--review"]:
        await review_pending_runs(graph)
        return

    cities = sys.argv[1:] or [input("City to check for storms: ").strip()]
    result, thread_id = await run_once(graph, cities)
    result = await _resolve_review_loop(graph, thread_id, result)

    print("\nqualifying_cities:", result.get("qualifying_cities"))
    print("sent:", result.get("sent"))
    if result.get("errors"):
        print("errors:", result["errors"])


if __name__ == "__main__":
    # psycopg's async mode can't run on Windows' default ProactorEventLoop.
    loop_factory = asyncio.SelectorEventLoop if sys.platform == "win32" else None
    asyncio.run(main(), loop_factory=loop_factory)
