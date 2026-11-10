-- Supabase exposes the `public` schema through its auto-generated REST API
-- (PostgREST), reachable with the project's anon key. StormLead never uses that
-- API -- the backend and agents connect to Postgres directly -- so every table
-- gets row-level security switched on with no policies. That denies the
-- `anon` and `authenticated` API roles everything, while the `postgres` role
-- the app connects as (the tables' owner) is unaffected.
--
-- Without this, anyone holding the anon key could read customer PII and the
-- Gmail refresh token in gmail_credentials.
--
-- Idempotent; re-run after any new table appears in `public`
-- (e.g. a LangGraph checkpointer upgrade adds one):
--   psql "$DATABASE_URL" -f deploy/supabase_lockdown.sql

DO $$
DECLARE
    t record;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.tablename);
    END LOOP;
END
$$;

-- Tables created later in `public` start without API grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
