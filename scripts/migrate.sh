#!/usr/bin/env bash
# Applies supabase/migrations/*.sql in order, once each, each in its own transaction.
# Usage: npm run db:migrate            (reads DATABASE_URL from .env.local)
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2-)
fi
: "${DATABASE_URL:?DATABASE_URL is not set}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X --set=client_min_messages=warning)

"${PSQL[@]}" -c "set client_min_messages=warning; create table if not exists public.schema_migrations (version text primary key, applied_at timestamptz not null default now()); alter table public.schema_migrations enable row level security;" >/dev/null

for f in supabase/migrations/*.sql; do
  v=$(basename "$f" .sql)
  applied=$("${PSQL[@]}" -tA -c "select 1 from public.schema_migrations where version = '$v'")
  if [ "$applied" = "1" ]; then
    echo "  = $v (already applied)"
    continue
  fi
  echo "  → applying $v"
  "${PSQL[@]}" -1 -f "$f" -c "insert into public.schema_migrations (version) values ('$v')" >/dev/null
done
echo "Migrations up to date."
