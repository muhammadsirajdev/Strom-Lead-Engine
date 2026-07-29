# StormLead Operations Dashboard

A read-only, CRM-style ops console for the StormLead pipeline: a FastAPI
backend (`backend/`) that queries the same Postgres database the four
pipeline agents write to, and a React + Vite frontend (`frontend/`) that
polls it. No authentication, no write endpoints -- this is an observability
layer on top of the pipeline documented in the main [README](README.md), not
a replacement for any of its scripts.

## Layout

```
backend/
├── main.py            # FastAPI app, CORS, lifespan (opens/closes the pool)
├── config.py           # env-driven Settings (DATABASE_URL, CORS, pool size, port)
├── db.py                # asyncpg-style pool via psycopg_pool, read-only enforced
├── storm.py             # normalizes tracking.storm_context's two producer shapes
├── lifecycle.py          # tracking.status order + terminal/non-terminal split
├── queries.py            # every SQL statement, joined to row -> schema mapping
├── review.py             # reads paused drafts out of the LangGraph checkpointer
├── schemas.py             # Pydantic response models
└── routers/
    ├── stats.py           # GET /api/stats
    ├── leads.py            # GET /api/leads, GET /api/leads/{lead_id}
    ├── cities.py            # GET /api/cities
    ├── review_queue.py       # GET /api/review-queue
    └── bookings.py            # GET /api/bookings

frontend/
├── src/
│   ├── types/api.ts        # TypeScript mirror of backend/schemas.py
│   ├── lib/
│   │   ├── api.ts            # typed fetch client, one function per endpoint
│   │   ├── status.ts          # status/severity -> label/icon/colour metadata
│   │   └── format.ts           # date/number/currency formatting
│   ├── hooks/
│   │   └── useDashboardQueries.ts  # TanStack Query hooks, one per endpoint
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives (button, card, table, sheet, ...)
│   │   ├── common/               # StatusBadge, SeverityBadge, EmptyState, StatTile, ...
│   │   ├── overview/ cities/ pipeline/ leads/ review/ bookings/  # one dir per section
│   │   └── layout/                # Sidebar, Topbar, AppShell
│   └── pages/                       # one page per route, composed from the above
└── ...
```

## Prerequisites

- The main pipeline's `.env` already has `DATABASE_URL` pointing at a Postgres
  instance with `customers` and `tracking` tables (see the root
  [README](README.md#setup)). The dashboard reads that same database -- no
  separate provisioning step.
- Python 3.12+ and `uv` (already required by the pipeline).
- Node 18+ and `npm`.

## Running the backend

```bash
uv sync                       # picks up fastapi/uvicorn, already in pyproject.toml
uv run python -m backend.main # http://127.0.0.1:8000, interactive docs at /docs
```

Override the host/port/pool with env vars if needed (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `DASHBOARD_HOST` | `127.0.0.1` | Bind host for `python -m backend.main` |
| `DASHBOARD_PORT` | `8000` | Bind port |
| `DASHBOARD_CORS_ORIGINS` | Vite's default dev ports | Comma-separated allow-list |
| `DASHBOARD_POOL_MIN_SIZE` / `_MAX_SIZE` | `1` / `8` | Connection pool bounds |
| `DASHBOARD_LEADS_LIMIT` | `1000` | Hard cap on `/api/leads` row count |

**On Linux/macOS**, hot reload works normally via the `uvicorn` CLI:

```bash
uv run uvicorn backend.main:app --reload --port 8000
```

**On Windows**, don't use `--reload`: uvicorn's reload supervisor always
restarts the server through its own event-loop selection (an internal
`ProactorEventLoop` factory that `psycopg`'s async pool can't run on -- the
exact constraint every other script in this repo works around), and there's
no way to keep the pipeline's usual `SelectorEventLoop` fix once that
supervisor is involved. `uv run python -m backend.main` sidesteps it by
driving `Server.serve()` inside the same
`asyncio.run(..., loop_factory=asyncio.SelectorEventLoop)` pattern the
pipeline scripts already use -- see the comment in `backend/main.py` for the
full trace of why the naive fix (setting the policy at import time) doesn't
work here.

## Running the frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api/* to the backend
```

Vite's dev server proxies `/api/*` to `http://127.0.0.1:8000` by default (see
`vite.config.ts`); override with `VITE_API_PROXY_TARGET` if the backend runs
elsewhere. For a production build:

```bash
npm run build       # outputs to frontend/dist/
npm run preview      # serve the build locally on :4173
```

If you serve `dist/` from a different origin than the API, set
`VITE_API_BASE_URL` at build time (see `frontend/.env.example`) and add that
origin to `DASHBOARD_CORS_ORIGINS` on the backend.

## Endpoints

All read-only, all under `/api`:

| Endpoint | Returns |
|---|---|
| `GET /api/stats` | Status counts, the 4-stage conversion funnel, pipeline-health ratios |
| `GET /api/leads?status=&city=&search=&limit=` | Filtered `tracking` ⋈ `customers` rows |
| `GET /api/leads/{lead_id}` | One lead in full, including the raw `storm_context` JSONB |
| `GET /api/cities` | Service-area cities, lead mix, latest storm context per city |
| `GET /api/review-queue` | `run_a_pending_review` threads + their paused drafts |
| `GET /api/bookings?limit=` | Booked leads and appointment times |
| `GET /api/health` | Liveness + which optional tables exist (checkpoints, pending-review) |

`GET /docs` has the full interactive schema (FastAPI's default Swagger UI).

## Notable design decisions

- **Read-only is enforced by Postgres, not just by omitting routes.**
  `backend/db.py` opens every pooled connection with
  `SET default_transaction_read_only = on`, so a write anywhere in this
  codebase would fail at the database level, not just "isn't wired up yet."
- **`storm_context` has two real shapes.** `lead_find_agent.py` writes
  `{city, condition_text, wind_mph, date}`; `db/generate_data.py`'s synthetic
  seed writes `{zip, hail_in, wind_mph, date}`. `backend/storm.py` normalizes
  both into one `StormSummary` (condition_text, wind_mph, hail_in, date, zip,
  severity, label) so the frontend never branches on which producer wrote a
  row. Severity mirrors `lead_find_agent.WIND_THRESHOLD_MPH` (50 mph) exactly,
  so "severe" on the dashboard means the same thing it means to the pipeline.
- **The review queue's draft bodies come from the LangGraph checkpointer,
  not from `run_a_pending_review`.** That table only indexes which threads are
  paused (`thread_id`, `service_cities`, `created_at`); the actual drafted
  subject/body live in the checkpointer's `drafts` channel. `backend/review.py`
  reads them back via `AsyncPostgresSaver.aget_tuple()` (never calling
  `.setup()`, since that issues DDL) and degrades to "drafts unavailable" per
  thread if the checkpoint tables are missing or a thread's state can't be
  read, rather than failing the whole request.
- **Approve / Reject / Rewrite are disabled placeholders, on purpose.** This
  build is display-only for the review queue; resolving a paused run still
  goes through `uv run python lead_find_agent.py --review`, exactly as
  documented in the main README's [human-review section](README.md#the-human-review-safety-gate).
- **Polling, not websockets.** `/api/stats`, `/api/leads` and
  `/api/review-queue` poll every ~12s via TanStack Query's `refetchInterval`,
  with `placeholderData: keepPreviousData` so a poll never flashes a skeleton
  or shifts the layout -- only the "Updated Ns ago" stamp moves.
