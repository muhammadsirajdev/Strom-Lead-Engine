#!/usr/bin/env sh
# Copies every StormLead table (customers, tracking, gmail_credentials,
# run_a_pending_review, and the LangGraph checkpoint tables) from one Postgres
# to another -- e.g. local -> Supabase -- then locks the tables away from
# Supabase's public REST API.
#
#   sh deploy/migrate_to_supabase.sh "<source DATABASE_URL>" "<target DATABASE_URL>"
#
# Re-runnable: tables are dropped and recreated on the target, so the target
# ends up an exact copy of the source. Needs pg_dump/psql 15+ on PATH.
set -eu

SOURCE="$1"
TARGET="$2"

pg_dump --no-owner --no-privileges --no-comments --schema=public --clean --if-exists "$SOURCE" \
  | grep -v -e '^SET transaction_timeout' -e '^CREATE SCHEMA public;' -e '^DROP SCHEMA IF EXISTS public;' \
  | psql "$TARGET" --quiet --set ON_ERROR_STOP=1 --single-transaction > /dev/null

psql "$TARGET" --quiet --set ON_ERROR_STOP=1 -f "$(dirname "$0")/supabase_lockdown.sql"

echo "Row counts on target:"
psql "$TARGET" --tuples-only --command "
  SELECT format('  %-24s %s', relname, n_live_tup) FROM pg_stat_user_tables
  WHERE schemaname = 'public' ORDER BY relname;"
