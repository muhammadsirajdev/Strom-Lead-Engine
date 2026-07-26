"""Google OAuth "web application" flow for connecting a Gmail sender account.

Requires an OAuth client of type "Web application" in Google Cloud Console
(APIs & Services > Credentials) with GOOGLE_REDIRECT_URI added to its
Authorized redirect URIs.
"""

import os

import httpx
from dotenv import load_dotenv
from google_auth_oauthlib.flow import Flow

load_dotenv()

# oauthlib raises a hard error if the scopes Google actually grants differ at
# all from the ones requested here -- which happens routinely (e.g. Google
# echoing back a scope from an earlier partial consent, or the "email" alias
# for userinfo.email). This only relaxes that exact-match check on our own
# client; it doesn't change what the user actually consents to on Google's
# side, so it's safe to always set (unlike OAUTHLIB_INSECURE_TRANSPORT below,
# which does have a real security implication and is gated accordingly).
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    # gmail.compose covers create/read/update/delete drafts + sending (a superset
    # of gmail.send); gmail.modify covers reading threads/messages and managing
    # labels (including system labels like TRASH/SPAM). Together these cover every
    # tool the gmailmcp.googleapis.com MCP server exposes (create_draft, list_drafts,
    # search_threads, get_thread, get_message, label/unlabel, list/create labels).
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
]

USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def client_id() -> str:
    return os.environ["GOOGLE_CLIENT_ID"]


def client_secret() -> str:
    return os.environ["GOOGLE_CLIENT_SECRET"]


def redirect_uri() -> str:
    return os.environ["GOOGLE_REDIRECT_URI"]


def build_flow() -> Flow:
    uri = redirect_uri()
    if uri.startswith("http://"):
        # oauthlib refuses to parse a plain-http authorization response otherwise.
        # Only ever set for a genuinely non-https redirect_uri (i.e. local dev) --
        # a real https GOOGLE_REDIRECT_URI in production leaves this untouched.
        os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")

    client_config = {
        "web": {
            "client_id": client_id(),
            "client_secret": client_secret(),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    return Flow.from_client_config(client_config, scopes=SCOPES, redirect_uri=uri)


def fetch_connected_email(access_token: str) -> str:
    response = httpx.get(
        USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["email"]
