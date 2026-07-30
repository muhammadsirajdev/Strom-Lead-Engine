"""GET /api/review-queue -- drafts paused at the human-review gate.

Read-only by design: this build exposes what is waiting, and the dashboard
renders Approve/Reject/Rewrite as disabled placeholders. Resolving a review
still happens through `uv run python -m agents.lead_find_agent --review`.
"""

from fastapi import APIRouter

from .. import review
from ..schemas import ReviewQueue

router = APIRouter(tags=["review"])


@router.get(
    "/review-queue",
    response_model=ReviewQueue,
    summary="Runs paused at human_review, with their pending drafts (read-only)",
)
async def get_review_queue() -> ReviewQueue:
    return await review.get_review_queue()
