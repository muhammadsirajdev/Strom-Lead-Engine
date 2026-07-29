"""GET /api/cities -- service-area cities with lead counts and latest storm.

The storm shown per city is read from the most recent
`tracking.storm_context` for a customer in that city. No live weather call is
made here; that only happens inside the pipeline's OpenWeather MCP server.
"""

from datetime import datetime, timezone

from fastapi import APIRouter

from .. import queries
from ..schemas import CitiesResponse

router = APIRouter(tags=["cities"])


@router.get("/cities", response_model=CitiesResponse, summary="Cities with lead counts + latest storm context")
async def list_cities() -> CitiesResponse:
    cities = await queries.list_cities()
    return CitiesResponse(
        cities=cities,
        severe_count=sum(1 for c in cities if c.severity == "severe"),
        generated_at=datetime.now(timezone.utc),
    )
