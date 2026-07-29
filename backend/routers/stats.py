"""GET /api/stats -- status counts, funnel numbers, pipeline health."""

from datetime import datetime, timezone

from fastapi import APIRouter

from .. import queries
from ..schemas import Stats

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=Stats, summary="Status counts, funnel and pipeline health")
async def get_stats() -> Stats:
    counts = await queries.get_status_counts()
    total_customers, opted_in = await queries.get_customer_totals()
    pending_threads = await queries.count_pending_review_threads()

    return Stats(
        total_leads=sum(counts.values()),
        total_customers=total_customers,
        opted_in_customers=opted_in,
        status_counts=queries.status_count_list(counts),
        funnel=queries.build_funnel(counts),
        health=await queries.get_health(counts, pending_threads),
        generated_at=datetime.now(timezone.utc),
    )
