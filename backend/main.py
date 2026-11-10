"""FastAPI application for the StormLead operations dashboard.

Run from the project root:
    uv run python -m backend.main          # Windows-safe (see note below)
    uv run uvicorn backend.main:app --reload --port 8000   # Linux/macOS

Read-only over the pipeline's Postgres database. Interactive docs at /docs.
"""

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

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


logger = logging.getLogger("uvicorn.error")


def _scheduler_enabled() -> bool:
    return os.getenv("RUN_SCHEDULER", "").strip().lower() in {"1", "true", "yes", "on"}


async def _start_embedded_scheduler(app: FastAPI) -> None:
    """Starts the agent scheduler inside this process (RUN_SCHEDULER=true).

    Runs as a background task so the API -- and its health check -- comes up
    immediately; building the agent pipeline (MCP tools, Composio session,
    checkpointer) takes several seconds. A failure here is logged and leaves
    the read-only API fully working.

    The agents open their own read-write connections; the API's pool stays
    read-only. Only one process may run the scheduler, or every job would
    fire twice -- so this is off by default and the API must run a single
    uvicorn worker when it's on.
    """
    try:
        from .scheduler import start_scheduler

        app.state.scheduler = await start_scheduler()
    except Exception:
        logger.exception("embedded scheduler failed to start; the API keeps running without it")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Opens the shared connection pool once per process, closes it on exit.
    Optionally runs the agent scheduler alongside (see RUN_SCHEDULER)."""
    await db.open_pool()
    app.state.scheduler = None
    starter = asyncio.create_task(_start_embedded_scheduler(app)) if _scheduler_enabled() else None
    try:
        yield
    finally:
        if starter is not None:
            starter.cancel()
        if app.state.scheduler is not None:
            app.state.scheduler.shutdown(wait=False)
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
            "through `uv run python -m agents.lead_find_agent --review`."
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

    @app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
    async def root() -> RedirectResponse:
        """The bare domain has no page of its own; send visitors to the API docs."""
        return RedirectResponse(url="/docs")

    @app.api_route(
        "/api/health",
        methods=["GET", "HEAD"],
        response_model=HealthResponse, tags=["meta"], summary="Liveness + schema probe")
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
