#!/usr/bin/env bash
# Starts a local stand-in for a Supabase project: a fresh database with schema.sql, GoTrue
# (Supabase Auth), PostgREST and dev-server.mjs, all on one origin at http://localhost:54321.
# For development and tests only. Needs Postgres 15+, and the GoTrue and PostgREST binaries:
#   AUTH_BIN=/path/to/auth  PGRST_BIN=/path/to/postgrest  PSQL="sudo -u postgres psql" backend/dev/start.sh
# Stop it with Ctrl-C. Then put this in the browser console on the site to use it:
#   localStorage.setItem('tch-backend', JSON.stringify({ url: 'http://localhost:54321', anonKey: '<printed below>' }))
set -euo pipefail
cd "$(dirname "$0")"
PSQL=${PSQL:-psql}
AUTH_BIN=${AUTH_BIN:-auth}
PGRST_BIN=${PGRST_BIN:-postgrest}
DB=${DB:-tch_dev}
PW=${PW:-devpassword}
SITE=${SITE:-http://localhost:4321}
export JWT_SECRET=${JWT_SECRET:-local-development-secret-at-least-32-chars}

$PSQL -q -c "drop database if exists $DB" -c "create database $DB" >/dev/null
$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" >/dev/null <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin login createrole; end if;
end \$\$;
alter role authenticator password '$PW';
alter role supabase_auth_admin password '$PW';
grant anon, authenticated, service_role to authenticator;
create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role;
grant create on database $DB to supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;
SQL

# GoTrue creates the auth schema's tables and functions (auth.users, auth.uid(), auth.email()).
GOTRUE_ENV=(
  GOTRUE_API_HOST=127.0.0.1 PORT=9999 API_EXTERNAL_URL=http://localhost:54321/auth/v1
  GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://supabase_auth_admin:$PW@127.0.0.1:5432/$DB"
  GOTRUE_DB_MIGRATIONS_PATH="$(dirname "$AUTH_BIN")/migrations"
  GOTRUE_SITE_URL="$SITE" GOTRUE_URI_ALLOW_LIST="$SITE/**"
  GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
  GOTRUE_JWT_ADMIN_ROLES=service_role
  GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=false GOTRUE_DISABLE_SIGNUP=false
  GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_ADMIN_EMAIL=hello@theculturedhuman.local
  GOTRUE_SMTP_SENDER_NAME="The Cultured Human"
  GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify
  GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify
  GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_SMTP_MAX_FREQUENCY=1s GOTRUE_LOG_LEVEL=warn
)
node dev-server.mjs & SERVER=$!
env "${GOTRUE_ENV[@]}" "$AUTH_BIN" & AUTH=$!
trap 'kill $SERVER $AUTH ${REST:-} 2>/dev/null' EXIT
for i in $(seq 1 60); do curl -sf http://127.0.0.1:9999/health >/dev/null && break; sleep 0.5; done

$PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f ../schema.sql >/dev/null
$PSQL -q -d "$DB" -c "grant execute on all functions in schema auth to anon, authenticated" >/dev/null

cat > /tmp/tch-postgrest.conf <<CONF
db-uri = "postgres://authenticator:$PW@127.0.0.1:5432/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 3000
CONF
"$PGRST_BIN" /tmp/tch-postgrest.conf & REST=$!

ANON=$(node -e '
const c=require("crypto"),s=process.env.JWT_SECRET,b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"anon",iss:"local",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+31536000});
console.log(h+"."+p+"."+c.createHmac("sha256",s).update(h+"."+p).digest("base64url"))')
echo "$ANON" > /tmp/tch-anon-key
echo "Ready: http://localhost:54321  anon key: $ANON"
wait
