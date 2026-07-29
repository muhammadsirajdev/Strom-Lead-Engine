"""FastAPI application for the StormLead operations dashboard.

Run from the project root:
    uv run python -m backend.main          # Windows-safe (see note below)
    uv run uvicorn backend.main:app --reload --port 8000   # Linux/macOS

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

# psycopg's async mode can't run on Windows' default ProactorEventLoop -- the
# same constraint every pipeline entry point works around with
# `asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop)`.
#
# Setting `asyncio.set_event_loop_policy(...)` here at import time is *not*
# enough to fix it, even though this module is imported before uvicorn's
# event loop exists (`Config.load_app()` runs before `Server.run()`):
# uvicorn's own loop selection (`loop="auto"`/`"asyncio"`) resolves to a
# concrete loop_factory -- `asyncio.ProactorEventLoop` on win32 -- and passes
# that explicitly to `asyncio.run(..., loop_factory=...)`, which overrides
# whatever ambient policy is active. So the fix has to happen at the call
# site, not at import time: see the `__main__` block below, which drives
# `Server.serve()` inside our *own* `asyncio.run(loop_factory=...)` instead
# of letting `uvicorn.run()`/`Server.run()` create the loop.


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

    # No --reload here: uvicorn's reload supervisor restarts the server via
    # its own Server.run(), which always goes through uvicorn's internal loop
    # selection (ProactorEventLoop on win32) -- there's no way to keep our
    # SelectorEventLoop fix once that supervisor is in the picture. This path
    # drives Server.serve() inside our own asyncio.run() instead, exactly
    # like every other entry point in this repo. For hot reload during
    # frontend/backend development on Linux/macOS, use
    # `uv run uvicorn backend.main:app --reload` instead.
    settings = get_settings()
    config = uvicorn.Config(app, host=settings.host, port=settings.port)
    server = uvicorn.Server(config)

    loop_factory = asyncio.SelectorEventLoop if sys.platform == "win32" else None
    asyncio.run(server.serve(), loop_factory=loop_factory)
