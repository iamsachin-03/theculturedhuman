#!/usr/bin/env bash
# Loads schema.sql into a throwaway database with a minimal stand-in for Supabase's auth schema,
# then runs test.sql. Needs a local Postgres 15+ you can create databases in.
#   PSQL="sudo -u postgres psql" backend/test.sh
set -euo pipefail
cd "$(dirname "$0")"
PSQL=${PSQL:-psql}
DB=tch_schema_test_$$
$PSQL -q -v ON_ERROR_STOP=1 -c "create database $DB" >/dev/null
trap '$PSQL -q -c "drop database if exists $DB" >/dev/null' EXIT
$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" >/dev/null <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.email() returns text language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.email', true), '') $$;
grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;
SQL
$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f schema.sql >/dev/null
$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f test.sql 2>&1 | sed -n 's/^.*NOTICE:  //p; /ERROR/p; /All access rules hold/p'
$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f metrics.sql >/dev/null && echo "The metrics queries run."
