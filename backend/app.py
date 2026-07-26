"""FastAPI backend: connects a Gmail account via OAuth and stores its tokens.

Run:
    uv run uvicorn backend.app:app --reload

Then open http://localhost:8000 and click "Connect Gmail".
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse

from backend.db import get_gmail_credentials, upsert_gmail_credentials
from backend.gmail_oauth import build_flow, fetch_connected_email

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(title="StormLead - Gmail Connect")

# In-memory OAuth state store: state -> PKCE code_verifier (single-process dev
# use only — swap for a shared/persistent store before running multiple
# workers or in production). The code_verifier from the /login Flow instance
# must be replayed on the /callback Flow instance (a separate request, so a
# separate Flow object) or Google's token endpoint rejects the exchange with
# "Missing code verifier".
_pending_states: dict[str, str] = {}


@app.get("/")
def root():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/auth/google/login")
def google_login():
    flow = build_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    _pending_states[state] = flow.code_verifier
    return RedirectResponse(auth_url)


@app.get("/auth/google/callback")
def google_callback(request: Request):
    state = request.query_params.get("state")
    if not state or state not in _pending_states:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")
    code_verifier = _pending_states.pop(state)

    if request.query_params.get("error"):
        return RedirectResponse(f"/?error={request.query_params['error']}")

    flow = build_flow()
    flow.code_verifier = code_verifier
    flow.fetch_token(authorization_response=str(request.url))
    creds = flow.credentials

    email = fetch_connected_email(creds.token)
    upsert_gmail_credentials(
        email=email,
        access_token=creds.token,
        refresh_token=creds.refresh_token,
        token_expiry=creds.expiry,
        scope=" ".join(creds.scopes or []),
    )

    return RedirectResponse(f"/?connected={email}")


@app.get("/auth/google/status")
def google_status(email: str | None = None):
    row = get_gmail_credentials(email)
    if row is None:
        return {"connected": False}
    return {"connected": True, "email": row["email"], "updated_at": row["updated_at"]}
