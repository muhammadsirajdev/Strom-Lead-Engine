"""Access the connected Gmail account's stored refresh token.

Intended to be called by the agent (e.g. from weather_agent.ipynb) once a
mailbox has been connected via the /auth/google/login flow:

    from backend.gmail_client import get_valid_access_token, send_email
    token = get_valid_access_token()   # for the gmail MCP server's Authorization header
    send_email(to="lead@example.com", subject="...", body="...")   # direct REST send
"""

import base64
from email.mime.text import MIMEText

import httpx
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials

from backend.db import get_gmail_credentials, upsert_gmail_credentials
from backend.gmail_oauth import SCOPES, client_id, client_secret

GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
TOKEN_URI = "https://oauth2.googleapis.com/token"


def _credentials_from_row(row: dict) -> Credentials:
    return Credentials(
        token=row["access_token"],
        refresh_token=row["refresh_token"],
        token_uri=TOKEN_URI,
        client_id=client_id(),
        client_secret=client_secret(),
        scopes=SCOPES,
    )


def get_valid_credentials(sender_email: str | None = None) -> tuple[Credentials, dict]:
    """Return live (refreshed if needed) Credentials for a connected mailbox.

    Also returns the DB row (for the mailbox's email address). Persists a
    refreshed access token back to gmail_credentials so the next call reuses
    it instead of hitting Google's token endpoint again.
    """
    row = get_gmail_credentials(sender_email)
    if row is None:
        raise RuntimeError(
            "No connected Gmail account found. Connect one first via the "
            "'Connect Gmail' button in the frontend (GET /auth/google/login)."
        )

    creds = _credentials_from_row(row)
    if not creds.valid:
        creds.refresh(GoogleAuthRequest())
        upsert_gmail_credentials(
            row["email"],
            creds.token,
            creds.refresh_token or row["refresh_token"],
            creds.expiry,
            " ".join(creds.scopes or SCOPES),
        )
    return creds, row


def get_valid_access_token(sender_email: str | None = None) -> str:
    """A fresh (refreshed if expired) access token, e.g. for the gmail MCP
    server's `Authorization: Bearer <token>` header. Call this right before
    building the MCP client -- the token is only valid for a limited time
    (usually ~1 hour), so re-fetch it if a notebook session runs long."""
    creds, _ = get_valid_credentials(sender_email)
    return creds.token


def send_email(to: str, subject: str, body: str, sender_email: str | None = None) -> dict:
    """Send a plain-text email from the connected Gmail account via the Gmail REST API directly.

    sender_email: which connected mailbox to send from, if more than one is
    stored; defaults to the most recently connected one.
    """
    creds, row = get_valid_credentials(sender_email)

    message = MIMEText(body)
    message["to"] = to
    message["from"] = row["email"]
    message["subject"] = subject
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()

    response = httpx.post(
        GMAIL_SEND_URL,
        headers={"Authorization": f"Bearer {creds.token}"},
        json={"raw": raw},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()
