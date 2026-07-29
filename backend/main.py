"""FastAPI application for the StormLead operations dashboard.

Run from the project root:
    uv run uvicorn backend.main:app --reload --port 8000

Read-only over the pipeline's Postgres database. Interactive docs at /docs.
"""

import asyncio
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__, db
from .config import get_settings
from .routers import bookings, cities, leads, review_queue, stats
from .schemas import HealthResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Opens the shared connection pool once per process, closes it on exit."""
    await db.open_pool()
    try:
        yield
    finally:
        await db.close_pool()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="StormLead Operations API",
        version=__version__,
        summary="Read-only REST API over the StormLead pipeline's Postgres database.",
        description=(
            "Backs the StormLead ops dashboard. Every endpoint is read-only -- the "
            "connection pool sets `default_transaction_read_only`, so writes are "
            "rejected by Postgres itself. Resolving a human review still happens "
            "through `lead_find_agent.py --review`."
        ),
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
    )

    for router in (stats.router, leads.router, cities.router, review_queue.router, bookings.router):
        app.include_router(router, prefix="/api")

    @app.get("/api/health", response_model=HealthResponse, tags=["meta"], summary="Liveness + schema probe")
    async def health() -> HealthResponse:
        try:
            await db.fetch_one("SELECT 1 AS ok")
            database_ok = True
        except Exception:
            database_ok = False

        checkpointer = pending_review = False
        if database_ok:
            checkpointer = await db.table_exists("checkpoints")
            pending_review = await db.table_exists("run_a_pending_review")

        return HealthResponse(
            status="ok" if database_ok else "degraded",
            database=database_ok,
            checkpointer_tables=checkpointer,
            pending_review_table=pending_review,
            version=__version__,
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    # psycopg's async mode can't run on Windows' default ProactorEventLoop --
    # the same constraint every pipeline entry point works around.
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
