-- StormLead synthetic CRM schema (PostgreSQL).
-- Ported from the SQLite demo spec: money -> NUMERIC, the storm_context blob -> JSONB,
-- dates -> DATE/TIMESTAMPTZ, marketing_opt_in -> BOOLEAN.

DROP TABLE IF EXISTS tracking CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
-- gmail_credentials is intentionally NOT dropped here: this file is replayed
-- wholesale by db/generate_data.py to reseed synthetic customers/tracking,
-- and that reseed must not blow away a connected Gmail account's refresh token.

CREATE TABLE customers (
    customer_id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    first_name        TEXT NOT NULL,
    last_name         TEXT NOT NULL,
    email             TEXT NOT NULL UNIQUE,
    phone             TEXT NOT NULL,
    street            TEXT NOT NULL,
    city              TEXT NOT NULL,
    state             TEXT NOT NULL,
    zip               TEXT NOT NULL,
    roof_material     TEXT NOT NULL CHECK (roof_material IN ('asphalt_shingle', 'metal', 'tile', 'flat_tpo')),
    roof_age_years    INTEGER NOT NULL,
    last_job_type     TEXT NOT NULL CHECK (last_job_type IN ('replacement', 'repair', 'inspection', 'gutters')),
    last_job_date     DATE NOT NULL,
    last_job_value    NUMERIC(10, 2) NOT NULL,
    insurance_carrier TEXT,
    marketing_opt_in  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_zip ON customers (zip);
CREATE INDEX idx_customers_marketing_opt_in ON customers (marketing_opt_in);

-- Run B's reply-detection ledger: one row per sent email (one Gmail thread).
--
-- status is split into non-terminal (Run B keeps polling the thread) and
-- terminal (Run B stops watching it):
--   non-terminal: awaiting_reply, interested, not_interested
--   terminal:     booked, no_response, unsubscribed
-- A later reply CAN move a thread between non-terminal statuses (e.g.
-- not_interested -> interested, if someone changes their mind an hour
-- later) -- only the terminal ones are final. See notebook Run B section
-- for the query that scans "any non-terminal status" rather than just
-- 'awaiting_reply', so a second reply after an initial "not interested"
-- still gets picked up.
--
-- processed_message_count is how Run B detects a *new* reply without
-- diffing individual message IDs: it's the Gmail thread's message count as
-- of the last time Run B looked at it. Seeded to 1 at send time (the
-- thread's only message then is the outbound email itself). Run B re-reads
-- the thread, and if the live message count > processed_message_count,
-- everything past that index is an unprocessed reply -- qualify it, then
-- set processed_message_count to the new total.
CREATE TABLE tracking (
    lead_id                 INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id             INTEGER NOT NULL REFERENCES customers (customer_id),
    thread_id               TEXT UNIQUE,
    storm_context           JSONB,
    status                  TEXT NOT NULL DEFAULT 'awaiting_reply'
                                 CHECK (status IN ('awaiting_reply', 'interested', 'not_interested',
                                                    'booked', 'no_response', 'unsubscribed')),
    processed_message_count INTEGER NOT NULL DEFAULT 1,
    nudge_count             INTEGER NOT NULL DEFAULT 0,
    last_contacted_at       TIMESTAMPTZ NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- thread_id's UNIQUE constraint above already creates its index.
CREATE INDEX idx_tracking_status ON tracking (status);

-- Google OAuth tokens for the Gmail account(s) the sender agent sends from.
-- One row per connected mailbox; refresh_token is long-lived and is what lets
-- the agent mint new access tokens later without a human back in the loop.
CREATE TABLE IF NOT EXISTS gmail_credentials (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    access_token  TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expiry  TIMESTAMPTZ NOT NULL,
    scope         TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
