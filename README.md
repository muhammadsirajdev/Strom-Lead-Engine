# StormLead Lead Engine

Weather-triggered storm outreach: `notebook/weather_agent.ipynb` checks service
cities for storms via a custom OpenWeather MCP server, pulls opted-in leads
from Postgres, and drafts personalized emails.

## Gmail connect (backend/ + frontend/)

Emails are sent through the Gmail API using a one-time OAuth connect flow —
not through MCP (the `gmail` MCP entry that used to be in the notebook is
gone; `langchain-mcp-adapters`' streamable_http transport doesn't support an
`oauth` kwarg, and hardcoding a client secret in a notebook is unsafe anyway).

1. In Google Cloud Console (APIs & Services > Credentials), make sure the
   OAuth client referenced by `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in
   `.env` is a **Web application** client with
   `http://localhost:8000/auth/google/callback` under Authorized redirect URIs.
   Also under **OAuth consent screen > Data Access**, make sure
   `https://www.googleapis.com/auth/gmail.send` is added to the app's scopes
   (and, while the app is in Testing mode, that the connecting Google account
   is added as a test user) — otherwise Google silently drops that scope from
   the grant and `send_email()` will get a 403 from the Gmail API later.
2. Run the backend: `uv run uvicorn backend.app:app --reload`
   (`backend/gmail_oauth.py` auto-allows the plain-http localhost redirect for
   OAuth — only when `GOOGLE_REDIRECT_URI` is `http://`, never for a real
   `https://` deployment — so no extra env var is needed for local dev).
3. Open http://localhost:8000 and click **Connect Gmail**. This stores the
   access + refresh token in the `gmail_credentials` table (see `db/schema.sql`).
4. From then on, `backend.gmail_client.send_email(to, subject, body)` reuses
   the stored refresh token (refreshing the access token as needed) — no
   browser step required. See the last cells of `weather_agent.ipynb` for an
   example call from the agent.

`db/generate_data.py` reseeds `customers`/`tracking` from scratch and does
**not** touch `gmail_credentials` — reconnecting Gmail after reseeding isn't
necessary.
