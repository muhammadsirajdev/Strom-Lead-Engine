"""Runtime configuration, read from the same `.env` the pipeline uses."""

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

# Vite's dev server. 5173 is the default; 4173 is `vite preview`.
DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
)


class Settings:
    """Process configuration. Instantiated once via `get_settings()`."""

    def __init__(self) -> None:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError(
                "DATABASE_URL is not set. Copy .env.example to .env and fill it in "
                "(the dashboard reads the same database the pipeline writes to)."
            )
        self.database_url: str = database_url

        # Comma-separated override, e.g. DASHBOARD_CORS_ORIGINS=https://ops.example.com
        raw_origins = os.getenv("DASHBOARD_CORS_ORIGINS", "")
        self.cors_origins: list[str] = (
            [o.strip() for o in raw_origins.split(",") if o.strip()] or list(DEFAULT_CORS_ORIGINS)
        )

        # Connection-pool bounds. The dashboard is read-only and polls on a
        # ~10s cadence, so a small pool is plenty.
        self.pool_min_size: int = int(os.getenv("DASHBOARD_POOL_MIN_SIZE", "1"))
        self.pool_max_size: int = int(os.getenv("DASHBOARD_POOL_MAX_SIZE", "8"))

        # How many rows /api/leads will return at most.
        self.leads_hard_limit: int = int(os.getenv("DASHBOARD_LEADS_LIMIT", "1000"))

        # Only consulted by `python -m backend.main`'s __main__ block below --
        # override when 8000 is already taken on the host.
        self.host: str = os.getenv("DASHBOARD_HOST", "127.0.0.1")
        self.port: int = int(os.getenv("DASHBOARD_PORT", "8000"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
