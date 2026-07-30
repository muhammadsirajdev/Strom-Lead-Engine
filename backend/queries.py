"""Every SQL statement the dashboard runs, plus row -> schema mapping.

All read-only. Column names match the live database exactly:

  customers            customer_id, first_name, last_name, email, phone, street,
                       city, state, zip, roof_material, roof_age_years,
                       last_job_type, last_job_date, last_job_value,
                       insurance_carrier, marketing_opt_in, created_at
  tracking             lead_id (PK), customer_id, thread_id, storm_context,
                       status, processed_message_count, nudge_count,
                       last_contacted_at, created_at, triage_reason, scheduled_at
  run_a_pending_review thread_id (PK), service_cities, created_at

`triage_reason` and `scheduled_at` are added to `tracking` by
agents/send_booking_agent.py and agents/notify_booking_with_team.py respectively, not by
db/schema.sql -- so they may be absent on a database where neither agent has
run. `LEAD_COLUMNS` selects them defensively via to_jsonb so a missing column
surfaces as NULL instead of a 500.
"""

from datetime import datetime, timezone
from typing import Any

from . import db, storm
from .lifecycle import (
    INTERESTED_OR_BEYOND,
    NON_TERMINAL,
    REPLIED,
    STATUSES,
    TERMINAL,
    is_terminal,
)
from .schemas import (
    Booking,
    CityStorm,
    FunnelStage,
    LeadDetail,
    LeadSummary,
    PipelineHealth,
    StatusCount,
    StormSummary,
)

# agents/close_stale_leads.py's STALE_AFTER_DAYS -- mirrored so the dashboard's
# "stale" count predicts exactly what that job will close on its next run.
STALE_AFTER_DAYS = 7

# ---------------------------------------------------------------------------
# Shared column list for the leads join.
# ---------------------------------------------------------------------------

_LEAD_SELECT = """
    SELECT t.lead_id,
           t.customer_id,
           t.thread_id,
           t.storm_context,
           t.status,
           t.processed_message_count,
           t.nudge_count,
           t.last_contacted_at,
           t.created_at,
           t.triage_reason,
           t.scheduled_at,
           c.first_name,
           c.last_name,
           c.email,
           c.phone,
           c.city,
           c.state,
           c.zip,
           EXTRACT(EPOCH FROM (now() - t.last_contacted_at)) / 86400.0 AS days_since_contact
    FROM tracking t
    JOIN customers c ON c.customer_id = t.customer_id
"""

_LEAD_DETAIL_SELECT = """
    SELECT t.lead_id,
           t.customer_id,
           t.thread_id,
           t.storm_context,
           t.status,
           t.processed_message_count,
           t.nudge_count,
           t.last_contacted_at,
           t.created_at,
           t.triage_reason,
           t.scheduled_at,
           c.first_name,
           c.last_name,
           c.email,
           c.phone,
           c.street,
           c.city,
           c.state,
           c.zip,
           c.roof_material,
           c.roof_age_years,
           c.last_job_type,
           c.last_job_date,
           c.last_job_value,
           c.insurance_carrier,
           c.marketing_opt_in,
           c.created_at AS customer_since,
           EXTRACT(EPOCH FROM (now() - t.last_contacted_at)) / 86400.0 AS days_since_contact
    FROM tracking t
    JOIN customers c ON c.customer_id = t.customer_id
    WHERE t.lead_id = %s
"""


def _storm_summary(raw: Any) -> StormSummary:
    return StormSummary(**storm.summarize(raw))


def _to_lead_summary(row: dict) -> LeadSummary:
    return LeadSummary(
        lead_id=row["lead_id"],
        customer_id=row["customer_id"],
        thread_id=row["thread_id"],
        first_name=row["first_name"],
        last_name=row["last_name"],
        full_name=f"{row['first_name']} {row['last_name']}",
        email=row["email"],
        phone=row.get("phone"),
        city=row["city"],
        state=row["state"],
        zip=row["zip"],
        status=row["status"],
        is_terminal=is_terminal(row["status"]),
        storm=_storm_summary(row.get("storm_context")),
        triage_reason=row.get("triage_reason"),
        nudge_count=row["nudge_count"],
        invite_sent=(row["nudge_count"] or 0) > 0,
        processed_message_count=row["processed_message_count"],
        scheduled_at=row.get("scheduled_at"),
        last_contacted_at=row["last_contacted_at"],
        created_at=row["created_at"],
        days_since_contact=round(float(row["days_since_contact"] or 0.0), 3),
    )


def _to_lead_detail(row: dict) -> LeadDetail:
    base = _to_lead_summary(row).model_dump()
    last_job_date = row.get("last_job_date")
    last_job_value = row.get("last_job_value")
    return LeadDetail(
        **base,
        street=row["street"],
        roof_material=row["roof_material"],
        roof_age_years=row["roof_age_years"],
        last_job_type=row["last_job_type"],
        last_job_date=last_job_date.isoformat() if last_job_date else None,
        last_job_value=float(last_job_value) if last_job_value is not None else None,
        insurance_carrier=row.get("insurance_carrier"),
        marketing_opt_in=row["marketing_opt_in"],
        customer_since=row.get("customer_since"),
        storm_context_raw=row.get("storm_context") if isinstance(row.get("storm_context"), dict) else None,
    )


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------


async def list_leads(
    status: str | None = None,
    city: str | None = None,
    search: str | None = None,
    limit: int = 1000,
) -> tuple[list[LeadSummary], int]:
    """Filtered leads plus the unlimited match count.

    `status` and `city` are exact matches (city case-insensitively, so a
    dropdown value from /api/cities always lines up). `search` is a substring
    match across name, email, city and thread id.
    """
    where: list[str] = []
    params: list[Any] = []

    if status:
        where.append("t.status = %s")
        params.append(status)

    if city:
        where.append("c.city ILIKE %s")
        params.append(city)

    if search:
        where.append(
            "("
            "c.first_name ILIKE %s OR c.last_name ILIKE %s "
            "OR (c.first_name || ' ' || c.last_name) ILIKE %s "
            "OR c.email ILIKE %s OR c.city ILIKE %s OR t.thread_id ILIKE %s"
            ")"
        )
        needle = f"%{search.strip()}%"
        params.extend([needle] * 6)

    clause = f" WHERE {' AND '.join(where)}" if where else ""

    count_row = await db.fetch_one(
        f"SELECT count(*) AS n FROM tracking t JOIN customers c ON c.customer_id = t.customer_id{clause}",
        tuple(params),
    )
    total = int(count_row["n"]) if count_row else 0

    rows = await db.fetch_all(
        f"{_LEAD_SELECT}{clause} ORDER BY t.last_contacted_at DESC, t.lead_id DESC LIMIT %s",
        tuple([*params, limit]),
    )
    return [_to_lead_summary(r) for r in rows], total


async def get_lead(lead_id: int) -> LeadDetail | None:
    row = await db.fetch_one(_LEAD_DETAIL_SELECT, (lead_id,))
    return _to_lead_detail(row) if row else None


# ---------------------------------------------------------------------------
# Stats / funnel / health
# ---------------------------------------------------------------------------


async def get_status_counts() -> dict[str, int]:
    rows = await db.fetch_all("SELECT status, count(*) AS n FROM tracking GROUP BY status")
    counts = {status: 0 for status in STATUSES}
    for row in rows:
        # A status outside the known set would mean the CHECK constraint was
        # relaxed upstream; surface it rather than silently dropping it.
        counts[row["status"]] = int(row["n"])
    return counts


def build_funnel(counts: dict[str, int]) -> list[FunnelStage]:
    """The four ordered stages a lead passes through, derived from status.

    Every `tracking` row exists because agents/lead_find_agent.py sent an email, so
    stage 1 is simply the row count. Each later stage is a subset of the one
    before it, which keeps the funnel monotonically non-increasing.
    """
    sent = sum(counts.values())
    replied = sum(counts.get(s, 0) for s in REPLIED)
    interested = sum(counts.get(s, 0) for s in INTERESTED_OR_BEYOND)
    booked = counts.get("booked", 0)

    raw = [
        ("sent", "Outreach sent", sent, "Storm-triggered emails approved at review and sent"),
        ("replied", "Replied", replied, "Customer replied and triage classified the reply"),
        ("interested", "Interested", interested, "Classified NEEDED -- Calendly link owed or sent"),
        ("booked", "Booked", booked, "Inspection on the calendar, team notified on Slack"),
    ]

    stages: list[FunnelStage] = []
    for index, (key, label, count, description) in enumerate(raw):
        previous = raw[index - 1][2] if index else None
        stages.append(
            FunnelStage(
                key=key,
                label=label,
                count=count,
                description=description,
                conversion_from_previous=(count / previous) if previous else None,
                conversion_from_start=(count / sent) if sent and index else None,
            )
        )
    return stages


async def get_health(counts: dict[str, int], pending_review_threads: int) -> PipelineHealth:
    row = await db.fetch_one(
        f"""
        SELECT count(*) FILTER (WHERE status = 'interested' AND nudge_count = 0) AS awaiting_invite,
               count(*) FILTER (
                   WHERE status = 'awaiting_reply'
                     AND last_contacted_at < now() - '{STALE_AFTER_DAYS} days'::interval
               ) AS stale_awaiting,
               max(last_contacted_at) AS last_activity_at
        FROM tracking
        """
    )
    row = row or {}

    total = sum(counts.values())
    replied = sum(counts.get(s, 0) for s in REPLIED)
    interested = sum(counts.get(s, 0) for s in INTERESTED_OR_BEYOND)
    booked = counts.get("booked", 0)

    return PipelineHealth(
        total_leads=total,
        active_leads=sum(counts.get(s, 0) for s in NON_TERMINAL),
        reply_rate=(replied / total) if total else None,
        interest_rate=(interested / replied) if replied else None,
        booking_rate=(booked / interested) if interested else None,
        awaiting_invite=int(row.get("awaiting_invite") or 0),
        pending_review_threads=pending_review_threads,
        stale_awaiting=int(row.get("stale_awaiting") or 0),
        last_activity_at=row.get("last_activity_at"),
    )


async def get_customer_totals() -> tuple[int, int]:
    row = await db.fetch_one(
        "SELECT count(*) AS total, count(*) FILTER (WHERE marketing_opt_in) AS opted_in FROM customers"
    )
    row = row or {}
    return int(row.get("total") or 0), int(row.get("opted_in") or 0)


async def count_pending_review_threads() -> int:
    if not await db.table_exists("run_a_pending_review"):
        return 0
    row = await db.fetch_one("SELECT count(*) AS n FROM run_a_pending_review")
    return int(row["n"]) if row else 0


def status_count_list(counts: dict[str, int]) -> list[StatusCount]:
    """Lifecycle order, not count order -- the board and legend depend on it."""
    ordered = [StatusCount(status=s, count=counts.get(s, 0)) for s in STATUSES]
    extra = [StatusCount(status=s, count=n) for s, n in counts.items() if s not in STATUSES]
    return ordered + extra


# ---------------------------------------------------------------------------
# Cities
#
# The service area comes from `customers.city` -- never from
# storm_context.city, which db/generate_data.py's shape omits entirely.
# ---------------------------------------------------------------------------

_CITY_ROLLUP_SQL = """
    SELECT c.city,
           min(c.state) AS state,
           count(*) AS customer_count,
           count(*) FILTER (WHERE c.marketing_opt_in) AS opted_in_count
    FROM customers c
    GROUP BY c.city
"""

_CITY_LEADS_SQL = """
    SELECT c.city, t.status, count(*) AS n
    FROM tracking t
    JOIN customers c ON c.customer_id = t.customer_id
    GROUP BY c.city, t.status
"""

# DISTINCT ON gives the newest storm_context per city in one pass.
_CITY_LATEST_STORM_SQL = """
    SELECT DISTINCT ON (c.city)
           c.city, t.storm_context, t.created_at
    FROM tracking t
    JOIN customers c ON c.customer_id = t.customer_id
    WHERE t.storm_context IS NOT NULL
    ORDER BY c.city, t.created_at DESC, t.lead_id DESC
"""


async def list_cities() -> list[CityStorm]:
    rollups = await db.fetch_all(_CITY_ROLLUP_SQL)
    lead_rows = await db.fetch_all(_CITY_LEADS_SQL)
    storm_rows = await db.fetch_all(_CITY_LATEST_STORM_SQL)

    by_city: dict[str, dict[str, int]] = {}
    for row in lead_rows:
        by_city.setdefault(row["city"], {})[row["status"]] = int(row["n"])

    storms = {row["city"]: row for row in storm_rows}

    cities: list[CityStorm] = []
    for row in rollups:
        city = row["city"]
        counts = by_city.get(city, {})
        storm_row = storms.get(city)
        summary = _storm_summary(storm_row["storm_context"]) if storm_row else None

        cities.append(
            CityStorm(
                city=city,
                state=row["state"],
                customer_count=int(row["customer_count"]),
                opted_in_count=int(row["opted_in_count"]),
                lead_count=sum(counts.values()),
                active_lead_count=sum(counts.get(s, 0) for s in NON_TERMINAL),
                booked_count=counts.get("booked", 0),
                status_counts=status_count_list(counts),
                latest_storm=summary,
                latest_storm_at=storm_row["created_at"] if storm_row else None,
                severity=summary.severity if summary else "unknown",
            )
        )

    # Severe cities first, then by how much of the book is in play there.
    severity_rank = {"severe": 0, "elevated": 1, "calm": 2, "unknown": 3}
    cities.sort(key=lambda c: (severity_rank.get(c.severity, 9), -c.active_lead_count, -c.lead_count, c.city))
    return cities


# ---------------------------------------------------------------------------
# Bookings
# ---------------------------------------------------------------------------

_BOOKINGS_SQL = """
    SELECT t.lead_id,
           t.customer_id,
           t.thread_id,
           t.scheduled_at,
           t.last_contacted_at,
           t.triage_reason,
           t.storm_context,
           c.first_name,
           c.last_name,
           c.email,
           c.city,
           c.state
    FROM tracking t
    JOIN customers c ON c.customer_id = t.customer_id
    WHERE t.status = 'booked'
    ORDER BY t.scheduled_at DESC NULLS LAST, t.last_contacted_at DESC
    LIMIT %s
"""


async def list_bookings(limit: int = 100) -> tuple[list[Booking], int, int, int]:
    rows = await db.fetch_all(_BOOKINGS_SQL, (limit,))
    total_row = await db.fetch_one("SELECT count(*) AS n FROM tracking WHERE status = 'booked'")
    total = int(total_row["n"]) if total_row else 0

    now = datetime.now(timezone.utc)
    bookings: list[Booking] = []
    upcoming = 0
    unscheduled = 0

    for row in rows:
        scheduled_at = row.get("scheduled_at")
        is_upcoming = bool(scheduled_at and scheduled_at > now)
        if is_upcoming:
            upcoming += 1
        if scheduled_at is None:
            unscheduled += 1

        bookings.append(
            Booking(
                lead_id=row["lead_id"],
                customer_id=row["customer_id"],
                full_name=f"{row['first_name']} {row['last_name']}",
                email=row["email"],
                city=row["city"],
                state=row["state"],
                thread_id=row["thread_id"],
                scheduled_at=scheduled_at,
                last_contacted_at=row["last_contacted_at"],
                triage_reason=row.get("triage_reason"),
                storm=_storm_summary(row.get("storm_context")),
                is_upcoming=is_upcoming,
            )
        )

    return bookings, total, upcoming, unscheduled


async def distinct_statuses() -> list[str]:
    rows = await db.fetch_all("SELECT DISTINCT status FROM tracking ORDER BY status")
    return [r["status"] for r in rows]


async def customers_by_id(customer_ids: list[int]) -> dict[int, dict]:
    """Hydrates checkpointed drafts (which carry only customer_id/to_email)
    with the customer + property fields the review queue displays.
    """
    if not customer_ids:
        return {}
    rows = await db.fetch_all(
        """
        SELECT customer_id, first_name, last_name, email, city, state,
               roof_material, roof_age_years
        FROM customers
        WHERE customer_id = ANY(%s)
        """,
        (customer_ids,),
    )
    return {row["customer_id"]: row for row in rows}


__all__ = [
    "STALE_AFTER_DAYS",
    "build_funnel",
    "count_pending_review_threads",
    "customers_by_id",
    "distinct_statuses",
    "get_customer_totals",
    "get_health",
    "get_lead",
    "get_status_counts",
    "list_bookings",
    "list_cities",
    "list_leads",
    "status_count_list",
    "TERMINAL",
]
