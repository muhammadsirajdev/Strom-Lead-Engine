# Deploying StormLead

| Piece | Where | What runs |
|---|---|---|
| Database | Supabase (Postgres, `ap-southeast-1`) | `customers`, `tracking`, `gmail_credentials`, review ledger, LangGraph checkpoints |
| API + agents | Render free web service `stormlead-api` | `uvicorn backend.main:app`: the read-only API, plus the four agents on their schedule (`RUN_SCHEDULER=true`) |
| Keep-alive | cron-job.org (free) | pings `/api/health` every 10 min so the free service never sleeps |
| Dashboard UI | Vercel, root directory `frontend/` | static Vite build; `/api/*` is proxied to Render |

```
browser ──► Vercel (frontend/dist) ──/api/*──► Render stormlead-api ──► Supabase Postgres
                                               (API + 4 agents)
cron-job.org ──every 10 min──► /api/health ─────────┘
```

Everything runs on free plans. The Render service sits in Singapore, next to
the database.

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

## 2. Backend and agents: Render (free)

1. Render dashboard > **New > Blueprint**, then select this repo. Render reads
   [`render.yaml`](render.yaml) and proposes one free web service,
   `stormlead-api`.
2. Open **stormlead-api > Environment > Add from .env** and paste the contents
   of `deploy/render-api.env`. That file is gitignored and already holds every
   value, including the Supabase pooler URL and all agent keys.
3. Deploy. Check `https://stormlead-api.onrender.com/api/health`: it should
   return `"database": true`. The logs should show
   `scheduler started (America/Chicago): ...` a few seconds after startup.

### Keeping it awake (free cron)

Render puts free web services to sleep after 15 minutes without traffic, and
a sleeping service runs no agents. Two things prevent that:

- **The service pings itself** every 10 minutes (`KEEPALIVE_URL`), already
  configured.
- **An external cron, as a safety net.** It also wakes the service back up
  if Render ever restarts it. At [cron-job.org](https://cron-job.org) (free):
  **Create cronjob**, URL `https://stormlead-api.onrender.com/api/health`,
  schedule **every 10 minutes**, save. UptimeRobot's free 5-minute monitor
  works the same way.

Render's free plan includes 750 instance-hours a month, enough for one
service running 24/7. Because `/api/health` queries the database, the pings
also stop Supabase from pausing a free project after 7 idle days.

Things to know:

- **Schedule.** Lead Find runs daily at 08:00, Close Stale daily at 08:30,
  Reply Triage every 30 min, and Booking Notify hourly. Times are in
  `SCHEDULER_TIMEZONE` (America/Chicago; the service area is TX, CO and FL).
- **One process only.** The start command pins uvicorn to one worker. More
  workers, or a second service with `RUN_SCHEDULER=true`, would run every
  agent job twice.
- **Run an agent on demand.** From your machine (same database):
  `uv run python -m backend.scheduler --once lead_find` (or `send_booking`,
  `notify_booking`, `close_stale`).
- **Human review still applies.** Lead Find drafts and then pauses; nothing
  sends until someone resolves it with
  `uv run python -m agents.lead_find_agent --review` on your machine.
- **Free-tier limits.** 512 MB of memory and a shared CPU. Restarts and
  redeploys reset the in-memory schedule, but the interval jobs simply start
  counting again; nothing is lost because all state lives in Postgres.
- **Paid alternative.** To split the agents into their own always-on process,
  run `python -m backend.scheduler` as a Render background worker (Starter
  plan) and drop `RUN_SCHEDULER` from the web service.

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
