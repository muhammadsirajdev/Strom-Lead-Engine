"""GET /api/leads and GET /api/leads/{lead_id}.

`lead_id` is `tracking.lead_id`, the table's real primary key.
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from .. import queries
from ..config import get_settings
from ..lifecycle import STATUSES
from ..schemas import LeadDetail, LeadsPage

router = APIRouter(tags=["leads"])


@router.get("/leads", response_model=LeadsPage, summary="Filtered leads (customers joined to tracking)")
async def list_leads(
    status: Annotated[
        str | None,
        Query(description=f"Exact tracking.status. One of: {', '.join(STATUSES)}"),
    ] = None,
    city: Annotated[str | None, Query(description="Exact customers.city, case-insensitive")] = None,
    search: Annotated[
        str | None,
        Query(description="Substring match on name, email, city or thread id", max_length=200),
    ] = None,
    limit: Annotated[int | None, Query(ge=1, le=5000, description="Max rows to return")] = None,
) -> LeadsPage:
    settings = get_settings()

    if status is not None and status not in STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"unknown status {status!r}; expected one of {', '.join(STATUSES)}",
        )

    effective_limit = min(limit or settings.leads_hard_limit, settings.leads_hard_limit)
    leads, total = await queries.list_leads(
        status=status,
        city=city,
        search=search,
        limit=effective_limit,
    )

    return LeadsPage(
        leads=leads,
        total=total,
        returned=len(leads),
        limit=effective_limit,
        generated_at=datetime.now(timezone.utc),
    )


@router.get(
    "/leads/{lead_id}",
    response_model=LeadDetail,
    summary="One lead in full, including raw storm_context",
    responses={404: {"description": "No tracking row with that lead_id"}},
)
async def get_lead(lead_id: int) -> LeadDetail:
    lead = await queries.get_lead(lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail=f"no lead with lead_id={lead_id}")
    return lead
