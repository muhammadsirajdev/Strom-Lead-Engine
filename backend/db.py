"""Postgres access for the gmail_credentials table."""

import os
from datetime import datetime

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv()


def get_conn() -> psycopg.Connection:
    return psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row)


def upsert_gmail_credentials(
    email: str,
    access_token: str,
    refresh_token: str | None,
    token_expiry: datetime,
    scope: str,
) -> None:
    """Insert or refresh the stored tokens for a Gmail account.

    Google only returns a refresh_token on the first consent (or when
    prompt=consent forces re-issue); COALESCE keeps the existing one on a
    plain access-token refresh where refresh_token comes back None.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO gmail_credentials (email, access_token, refresh_token, token_expiry, scope)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (email) DO UPDATE SET
                    access_token = EXCLUDED.access_token,
                    refresh_token = COALESCE(EXCLUDED.refresh_token, gmail_credentials.refresh_token),
                    token_expiry = EXCLUDED.token_expiry,
                    scope = EXCLUDED.scope,
                    updated_at = now()
                """,
                (email, access_token, refresh_token, token_expiry, scope),
            )
        conn.commit()


def get_gmail_credentials(email: str | None = None) -> dict | None:
    """Fetch stored credentials for `email`, or the most recently connected account if omitted."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if email:
                cur.execute("SELECT * FROM gmail_credentials WHERE email = %s", (email,))
            else:
                cur.execute("SELECT * FROM gmail_credentials ORDER BY updated_at DESC LIMIT 1")
            return cur.fetchone()
