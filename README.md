# StormLead Lead Engine

Weather-triggered storm outreach: `notebook/weather_agent.ipynb` checks service
cities for storms via a custom OpenWeather MCP server, pulls opted-in leads
from Postgres, and drafts personalized emails.

## Gmail (Klavis MCP)

Emails are sent through the `Klavis-strata` MCP server (a hosted Gmail MCP
endpoint) configured directly in `weather_agent.ipynb` — no local backend or
OAuth flow needed. The prior `backend/` + `frontend/` OAuth-connect flow was
retired in favor of this.

`db/generate_data.py` reseeds `customers`/`tracking` from scratch and does
**not** touch `gmail_credentials` — reconnecting Gmail after reseeding isn't
necessary.
