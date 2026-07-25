-- StormLead synthetic CRM schema (PostgreSQL).
-- Ported from the SQLite demo spec: money -> NUMERIC, the storm_context blob -> JSONB,
-- dates -> DATE/TIMESTAMPTZ, marketing_opt_in -> BOOLEAN.

DROP TABLE IF EXISTS tracking CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

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

CREATE TABLE tracking (
    lead_id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id       INTEGER NOT NULL REFERENCES customers (customer_id),
    thread_id         TEXT UNIQUE,
    storm_context     JSONB,
    status            TEXT NOT NULL DEFAULT 'awaiting_reply'
                          CHECK (status IN ('awaiting_reply', 'replied', 'booked', 'no_response')),
    nudge_count       INTEGER NOT NULL DEFAULT 0,
    last_contacted_at TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- thread_id's UNIQUE constraint above already creates its index.
CREATE INDEX idx_tracking_status ON tracking (status);
