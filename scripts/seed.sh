#!/usr/bin/env bash
# Seeds the real organization (catalogs + partners) and the demo organization. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2-)
fi
: "${DATABASE_URL:?DATABASE_URL is not set}"
psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -1 -f supabase/seed/seed.sql
echo "Seed complete."
