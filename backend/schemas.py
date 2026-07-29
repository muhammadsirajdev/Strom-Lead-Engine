"""Pydantic response models for the dashboard API.

Field names deliberately mirror the real database columns (`lead_id`,
`nudge_count`, `triage_reason`, `last_contacted_at`, ...) rather than
inventing dashboard-specific aliases, so a value on screen can be traced
straight back to the column the pipeline wrote.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Severity = Literal["severe", "elevated", "calm", "unknown"]


class StormSummary(BaseModel):
    """Normalized view of `tracking.storm_context`, which has two producer
    shapes (see backend/storm.py). Every field is optional because no single
    field is written by both producers except wind/date.
    """

    condition_text: str | None = None
    wind_mph: float | None = None
    hail_in: float | None = None
    date: str | None = None
    zip: str | None = None
    severity: Severity = "unknown"
    label: str | None = Field(default=None, description="Compact one-line summary for table cells")


class StatusCount(BaseModel):
    status: str
    count: int


class FunnelStage(BaseModel):
    """One stage of the outreach funnel, in pipeline order."""

    key: str
    label: str
    count: int
    description: str
    conversion_from_previous: float | None = Field(
        default=None, description="Share of the previous stage that reached this one, 0-1"
    )
    conversion_from_start: float | None = Field(
        default=None, description="Share of stage 1 that reached this one, 0-1"
    )


class PipelineHealth(BaseModel):
    """Headline ratios the ops team actually watches."""

    total_leads: int
    active_leads: int = Field(description="Rows in a non-terminal status")
    reply_rate: float | None = Field(default=None, description="Replied / sent, 0-1")
    interest_rate: float | None = Field(default=None, description="Interested-or-booked / replied, 0-1")
    booking_rate: float | None = Field(default=None, description="Booked / interested-or-booked, 0-1")
    awaiting_invite: int = Field(description="status='interested' AND nudge_count=0 -- Calendly link not sent yet")
    pending_review_threads: int = Field(description="Runs paused at the human-review gate")
    stale_awaiting: int = Field(description="awaiting_reply and silent 7+ days -- close_stale_leads' next targets")
    last_activity_at: datetime | None = None


class Stats(BaseModel):
    total_leads: int
    total_customers: int
    opted_in_customers: int
    status_counts: list[StatusCount]
    funnel: list[FunnelStage]
    health: PipelineHealth
    generated_at: datetime


class LeadSummary(BaseModel):
    """One `tracking` row joined to its customer -- the leads-table row."""

    lead_id: int
    customer_id: int
    thread_id: str | None = None
    first_name: str
    last_name: str
    full_name: str
    email: str
    phone: str | None = None
    city: str
    state: str
    zip: str
    status: str
    is_terminal: bool
    storm: StormSummary
    triage_reason: str | None = None
    nudge_count: int
    invite_sent: bool = Field(description="nudge_count > 0 -- doubles as the Calendly-invite-sent marker")
    processed_message_count: int
    scheduled_at: datetime | None = None
    last_contacted_at: datetime
    created_at: datetime
    days_since_contact: float


class LeadDetail(LeadSummary):
    """Adds the property/CRM fields and the raw JSONB the drawer shows."""

    street: str
    roof_material: str
    roof_age_years: int
    last_job_type: str
    last_job_date: str | None = None
    last_job_value: float | None = None
    insurance_carrier: str | None = None
    marketing_opt_in: bool
    customer_since: datetime | None = None
    storm_context_raw: dict[str, Any] | None = Field(
        default=None, description="Verbatim tracking.storm_context JSONB"
    )


class LeadsPage(BaseModel):
    leads: list[LeadSummary]
    total: int = Field(description="Rows matching the filters, before the limit")
    returned: int
    limit: int
    generated_at: datetime


class CityStorm(BaseModel):
    """A service-area city with its lead mix and most recent storm context."""

    city: str
    state: str
    customer_count: int
    opted_in_count: int
    lead_count: int
    active_lead_count: int
    booked_count: int
    status_counts: list[StatusCount]
    latest_storm: StormSummary | None = None
    latest_storm_at: datetime | None = Field(
        default=None, description="created_at of the tracking row the latest storm came from"
    )
    severity: Severity = "unknown"


class CitiesResponse(BaseModel):
    cities: list[CityStorm]
    severe_count: int
    generated_at: datetime


class ReviewDraft(BaseModel):
    """One draft sitting at the human-review gate, read out of the LangGraph
    checkpointer's `drafts` channel (see backend/review.py).
    """

    customer_id: int
    to_email: str
    subject: str
    body: str
    status: str = Field(description="EmailDraft.status -- pending/approved/rejected")
    feedback: str | None = None
    storm: StormSummary
    # Resolved from `customers` where possible -- the checkpointed draft only
    # carries customer_id and to_email.
    full_name: str | None = None
    city: str | None = None
    state: str | None = None
    roof_material: str | None = None
    roof_age_years: int | None = None


class ReviewThread(BaseModel):
    """A `run_a_pending_review` row plus whatever drafts are still pending."""

    thread_id: str
    service_cities: list[str]
    created_at: datetime
    drafts: list[ReviewDraft]
    pending_count: int
    drafts_available: bool = Field(
        description="False when the checkpointed drafts could not be read for this thread"
    )
    note: str | None = None


class ReviewQueue(BaseModel):
    threads: list[ReviewThread]
    total_threads: int
    total_pending_drafts: int
    checkpointer_available: bool = Field(
        description="False when LangGraph's checkpoint tables don't exist yet"
    )
    generated_at: datetime


class Booking(BaseModel):
    """A booked lead for the activity feed."""

    lead_id: int
    customer_id: int
    full_name: str
    email: str
    city: str
    state: str
    thread_id: str | None = None
    scheduled_at: datetime | None = None
    last_contacted_at: datetime
    triage_reason: str | None = None
    storm: StormSummary
    is_upcoming: bool = Field(description="scheduled_at is in the future")


class BookingsResponse(BaseModel):
    bookings: list[Booking]
    total: int
    upcoming_count: int
    unscheduled_count: int = Field(description="Booked rows with no scheduled_at recorded")
    generated_at: datetime


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: bool
    checkpointer_tables: bool
    pending_review_table: bool
    version: str
