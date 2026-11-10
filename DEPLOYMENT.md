# Deploying StormLead

| Piece | Where | What runs |
|---|---|---|
| Database | Supabase (Postgres, `ap-southeast-1`) | `customers`, `tracking`, `gmail_credentials`, review ledger, LangGraph checkpoints |
| Dashboard API | Render web service `stormlead-api` | `uvicorn backend.main:app` (read-only) |
| Agents | Render background worker `stormlead-scheduler` | `python -m backend.scheduler` (all four agents on their cadence) |
| Dashboard UI | Vercel, root directory `frontend/` | static Vite build; `/api/*` is proxied to Render |

```
browser ──► Vercel (frontend/dist) ──/api/*──► Render stormlead-api ──┐
                                                                      ├──► Supabase Postgres
                     Render stormlead-scheduler (4 agents) ───────────┘
```

Both Render services sit in Singapore, next to the database.

## 1. Database: Supabase

Use the **session pooler** connection string (Supabase > Connect > Session
pooler, port **5432**) with `?sslmode=require` appended. Don't use the
transaction pooler (6543): the API pins each connection read-only with a
session-level `SET`, and psycopg's prepared statements need a real session.
The session pooler is IPv4, so Render can reach it.

Copy the existing data (all tables, including checkpoints and the connected
Gmail account) from local Postgres into Supabase:

```bash
sh deploy/migrate_to_supabase.sh "<local DATABASE_URL>" "<supabase DATABASE_URL>"
```

The script also runs [`deploy/supabase_lockdown.sql`](deploy/supabase_lockdown.sql),
which turns on row-level security for every table. Supabase publishes the
`public` schema through its REST API with the anon key; without RLS that
would expose customer PII and the Gmail refresh token. The app connects as
the tables' owner, so RLS doesn't affect it.

Starting from an empty database instead? Seed synthetic data with
`uv run python db/generate_data.py --customers 400 --seed 42`, then run the
lockdown SQL. The agents create their own extra tables and columns on first
start.

## 2. Backend and agents: Render

1. Render dashboard > **New > Blueprint**, then select this repo. Render reads
   [`render.yaml`](render.yaml) and proposes both services.
2. When it asks for the secret values, paste them in. For each service go to
   **Environment > Add from .env** and paste the contents of:
   - `deploy/render-api.env` into **stormlead-api**
   - `deploy/render-scheduler.env` into **stormlead-scheduler**

   These files are gitignored and already hold every value, including the
   Supabase pooler URL.
3. Deploy. Check `https://stormlead-api.onrender.com/api/health`: it should
   return `"database": true`.

Things to know:

- **Cost.** The API runs on the free plan. The scheduler is a background
  worker, and Render has no free workers, so it uses Starter. A free web
  service can't stand in for it, because it sleeps after 15 idle minutes and
  would miss the daily runs.
- **Schedule.** Lead Find runs daily at 08:00, Close Stale daily at 08:30,
  Reply Triage every 30 min, and Booking Notify hourly. Times are in
  `SCHEDULER_TIMEZONE` (America/Chicago; the service area is TX, CO and FL).
- **Run an agent on demand.** From the worker's **Shell** tab:
  `.venv/bin/python -m backend.scheduler --once lead_find` (or
  `send_booking`, `notify_booking`, `close_stale`).
- **Human review still applies.** Lead Find drafts and then pauses; nothing
  sends until someone resolves it with
  `uv run python -m agents.lead_find_agent --review`. That works from your
  machine, because it uses the same Supabase database.
- **Cold starts.** The free API sleeps when idle, so the first dashboard load
  after a quiet spell takes 30-60 s. The frontend retries automatically.

## 3. Frontend: Vercel

1. Vercel > **Add New > Project**, then import this repo.
2. Set **Root Directory** to `frontend`. Vercel then picks up
   [`frontend/vercel.json`](frontend/vercel.json) (Vite framework,
   `npm run build`, output `dist`).
3. No environment variables are needed. Deploy.

`vercel.json` proxies `/api/*` to `https://stormlead-api.onrender.com`, so the
browser only ever talks to the Vercel domain and CORS never comes into play.
**If Render gave your API a different URL** (for example with a suffix,
because the name was taken), update that `destination` and redeploy.

## Pointing a local machine at production

Your local `.env` already uses the Supabase URL. Running
`uv run python -m backend.main` or any agent locally now reads and writes the
production database. The old local URL is kept as a comment above it.
