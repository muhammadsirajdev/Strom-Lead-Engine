"""Async Postgres access for the dashboard.

One `AsyncConnectionPool` is opened at app startup and shared by every
request, rather than a connection per query the way the pipeline scripts do
it -- a polling dashboard would otherwise churn connections every few
seconds.

The pool is opened in **read-only** mode at the session level
(`default_transaction_read_only`), so Postgres itself rejects any write this
service might accidentally attempt. That's a real guarantee, not a comment.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import get_settings

_pool: AsyncConnectionPool | None = None


async def _configure(conn) -> None:
    """Pin every pooled connection to read-only, enforced by the server."""
    await conn.set_autocommit(True)
    async with conn.cursor() as cur:
        await cur.execute("SET default_transaction_read_only = on")


async def open_pool() -> AsyncConnectionPool:
    """Opens the shared pool. Called once from the app's lifespan handler."""
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = AsyncConnectionPool(
            conninfo=settings.database_url,
            min_size=settings.pool_min_size,
            max_size=settings.pool_max_size,
            kwargs={"row_factory": dict_row},
            configure=_configure,
            open=False,
        )
        await _pool.open(wait=True, timeout=15)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> AsyncConnectionPool:
    if _pool is None:
        raise RuntimeError("connection pool is not open -- did the lifespan handler run?")
    return _pool


@asynccontextmanager
async def connection() -> AsyncIterator[Any]:
    """Checks a connection out of the shared pool for the duration of a query."""
    async with get_pool().connection() as conn:
        yield conn


async def fetch_all(sql: str, params: tuple | None = None) -> list[dict]:
    async with connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, params or ())
            return await cur.fetchall()


async def fetch_one(sql: str, params: tuple | None = None) -> dict | None:
    async with connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, params or ())
            return await cur.fetchone()


async def table_exists(name: str) -> bool:
    """Used to degrade gracefully when an optional table (LangGraph's
    checkpoint tables, `run_a_pending_review`) hasn't been created yet --
    a fresh database that has only ever run `db/schema.sql`.
    """
    row = await fetch_one("SELECT to_regclass(%s) IS NOT NULL AS present", (name,))
    return bool(row and row["present"])
