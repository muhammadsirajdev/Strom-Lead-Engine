"""GET /api/bookings -- recently booked leads and their appointment times."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Query

from .. import queries
from ..schemas import BookingsResponse

router = APIRouter(tags=["bookings"])


@router.get("/bookings", response_model=BookingsResponse, summary="Booked leads + appointment times")
async def list_bookings(
    limit: Annotated[int, Query(ge=1, le=500, description="Max bookings to return")] = 100,
) -> BookingsResponse:
    bookings, total, upcoming, unscheduled = await queries.list_bookings(limit=limit)
    return BookingsResponse(
        bookings=bookings,
        total=total,
        upcoming_count=upcoming,
        unscheduled_count=unscheduled,
        generated_at=datetime.now(timezone.utc),
    )
