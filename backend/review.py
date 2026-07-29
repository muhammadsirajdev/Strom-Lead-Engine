"""Reads the human-review queue: `run_a_pending_review` + the paused drafts.

`run_a_pending_review` is only an index -- it stores `thread_id`,
`service_cities` and `created_at`, and nothing about the emails themselves.
The actual draft content lives in LangGraph's checkpointer, in the `drafts`
channel of the thread's latest checkpoint (msgpack-encoded inside
`checkpoint_blobs`).

Rather than hand-parse those blobs, this module reads them back through
`AsyncPostgresSaver`, the same class that wrote them. Two deliberate choices:

* `setup()` is never called. It issues DDL/migrations, and this service is
  strictly read-only (the pool also sets `default_transaction_read_only`).
  `aget_tuple` only SELECTs, so it works fine on a read-only session.
* Drafts are normalized structurally, not by importing `lead_find_agent`.
  Importing it would construct a module-level `ChatOpenAI` and make the
  dashboard require `OPENAI_API_KEY` just to render a page. Without that
  import the serializer can't rebuild the `EmailDraft` class and hands back
  plain dicts -- which is exactly what's wanted here, so both cases are
  handled.

If the checkpoint tables don't exist yet, or a thread's checkpoint can't be
read, the endpoint still returns the queue with `drafts_available=False` and a
note, instead of failing the whole request.
"""

from datetime import datetime, timezone
from typing import Any

from . import db, queries, storm
from .schemas import ReviewDraft, ReviewQueue, ReviewThread, StormSummary

# The state channel lead_find_agent.py's human_review node reads and writes.
DRAFTS_CHANNEL = "drafts"

PENDING_STATUS = "pending"


def _normalize_status(value: Any) -> str:
    """Draft status can come back as a `DraftStatus` enum, a bare string, or
    (if the serializer couldn't rebuild the enum) something like
    'DraftStatus.PENDING'. Reduce all of them to 'pending'/'approved'/'rejected'.
    """
    if value is None:
        return PENDING_STATUS
    raw = getattr(value, "value", value)
    text = str(raw).strip()
    if "." in text:
        text = text.rsplit(".", 1)[-1]
    return text.lower() or PENDING_STATUS


def _as_dict(item: Any) -> dict[str, Any] | None:
    """Accepts a plain dict (serializer fell back) or a pydantic model
    (serializer rebuilt `EmailDraft` because it was importable).
    """
    if isinstance(item, dict):
        return item
    dump = getattr(item, "model_dump", None)
    if callable(dump):
        try:
            return dump(mode="json")
        except TypeError:  # pydantic v1-style .dict()
            return dump()
    if hasattr(item, "__dict__"):
        return dict(vars(item))
    return None


def _to_review_draft(raw: Any, customer: dict | None) -> ReviewDraft | None:
    data = _as_dict(raw)
    if not data:
        return None

    customer_id = data.get("customer_id")
    if customer_id is None:
        return None

    storm_ctx = _as_dict(data.get("storm_context")) or {}

    full_name = None
    if customer:
        full_name = f"{customer['first_name']} {customer['last_name']}"

    return ReviewDraft(
        customer_id=int(customer_id),
        to_email=str(data.get("to_email") or (customer or {}).get("email") or ""),
        subject=str(data.get("subject") or ""),
        body=str(data.get("body") or ""),
        status=_normalize_status(data.get("status")),
        feedback=data.get("feedback"),
        storm=StormSummary(**storm.summarize(storm_ctx)),
        full_name=full_name,
        # storm_context.city is the draft's own city; fall back to the
        # customer record, which is always populated.
        city=(customer or {}).get("city") or storm_ctx.get("city"),
        state=(customer or {}).get("state"),
        roof_material=(customer or {}).get("roof_material"),
        roof_age_years=(customer or {}).get("roof_age_years"),
    )


async def _checkpointer_available() -> bool:
    return await db.table_exists("checkpoints") and await db.table_exists("checkpoint_blobs")


async def _load_thread_drafts(saver, thread_id: str) -> tuple[list[Any] | None, str | None]:
    """Returns (raw drafts, note). `None` drafts means the thread's state
    couldn't be read; the note explains why for the UI.
    """
    config = {"configurable": {"thread_id": thread_id}}
    try:
        tuple_ = await saver.aget_tuple(config)
    except Exception as exc:  # a corrupt/partial checkpoint shouldn't 500 the page
        return None, f"Could not read checkpoint: {type(exc).__name__}"

    if tuple_ is None:
        return None, "No checkpoint found for this thread"

    channel_values = (tuple_.checkpoint or {}).get("channel_values") or {}
    drafts = channel_values.get(DRAFTS_CHANNEL)

    if drafts is None:
        return None, "Checkpoint has no drafts channel yet"
    if not isinstance(drafts, (list, tuple)):
        return None, "Unexpected drafts payload shape"

    return list(drafts), None


async def get_review_queue() -> ReviewQueue:
    now = datetime.now(timezone.utc)

    if not await db.table_exists("run_a_pending_review"):
        return ReviewQueue(
            threads=[],
            total_threads=0,
            total_pending_drafts=0,
            checkpointer_available=await _checkpointer_available(),
            generated_at=now,
        )

    rows = await db.fetch_all(
        "SELECT thread_id, service_cities, created_at FROM run_a_pending_review ORDER BY created_at"
    )

    checkpointer_ok = await _checkpointer_available()
    if not rows or not checkpointer_ok:
        return ReviewQueue(
            threads=[
                ReviewThread(
                    thread_id=row["thread_id"],
                    service_cities=list(row["service_cities"] or []),
                    created_at=row["created_at"],
                    drafts=[],
                    pending_count=0,
                    drafts_available=False,
                    note="LangGraph checkpoint tables are not present in this database",
                )
                for row in rows
            ],
            total_threads=len(rows),
            total_pending_drafts=0,
            checkpointer_available=checkpointer_ok,
            generated_at=now,
        )

    # Imported lazily so the dashboard still boots (and every other endpoint
    # still works) if langgraph-checkpoint-postgres isn't installed.
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    saver = AsyncPostgresSaver(db.get_pool())

    threads: list[ReviewThread] = []
    total_pending = 0

    for row in rows:
        thread_id = row["thread_id"]
        raw_drafts, note = await _load_thread_drafts(saver, thread_id)

        drafts: list[ReviewDraft] = []
        if raw_drafts is not None:
            pending_raw = [d for d in raw_drafts if _normalize_status((_as_dict(d) or {}).get("status")) == PENDING_STATUS]

            customer_ids: list[int] = []
            for item in pending_raw:
                data = _as_dict(item) or {}
                if data.get("customer_id") is not None:
                    customer_ids.append(int(data["customer_id"]))
            customers = await queries.customers_by_id(customer_ids)

            for item in pending_raw:
                data = _as_dict(item) or {}
                cid = data.get("customer_id")
                draft = _to_review_draft(item, customers.get(int(cid)) if cid is not None else None)
                if draft:
                    drafts.append(draft)

            if not pending_raw and note is None:
                note = "Every draft on this thread is already approved or rejected"

        total_pending += len(drafts)
        threads.append(
            ReviewThread(
                thread_id=thread_id,
                service_cities=list(row["service_cities"] or []),
                created_at=row["created_at"],
                drafts=drafts,
                pending_count=len(drafts),
                drafts_available=raw_drafts is not None,
                note=note,
            )
        )

    return ReviewQueue(
        threads=threads,
        total_threads=len(threads),
        total_pending_drafts=total_pending,
        checkpointer_available=True,
        generated_at=now,
    )
