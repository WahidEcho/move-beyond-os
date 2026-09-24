#!/usr/bin/env bash
# Runs supabase/tests/*.sql against the database. Each file runs in a single
# transaction that is ROLLED BACK — nothing is persisted.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${DATABASE_URL:-}" ] && [ -f .env.local ]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2-)
fi
: "${DATABASE_URL:?DATABASE_URL is not set}"
fail=0
for f in supabase/tests/[0-9]*.sql; do
  echo "── $(basename "$f")"
  out=$( { echo "begin;"; echo "\\i supabase/tests/_helpers.sql"; cat "$f"; echo "rollback;"; } \
         | psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 2>&1 ) || { echo "$out" | grep -E "PASS|FAIL|ERROR" | tail -30; fail=1; continue; }
  passes=$(echo "$out" | grep -c "PASS" || true)
  echo "$out" | grep -E "PASS" | sed 's/^.*NOTICE:  /   /'
  echo "   ✓ $passes checks"
done
exit $fail
