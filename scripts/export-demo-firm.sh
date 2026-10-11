#!/usr/bin/env bash
# Owner only. Copies one firm (the H.I.G. test account by default) out of a
# database into supabase/seeds/demo-firm.sql, which every contributor's local
# database then loads on `supabase start` / `supabase db reset`.
#
#   SOURCE_DB_URL='postgresql://...' scripts/export-demo-firm.sh
#   SOURCE_DB_URL='postgresql://...' scripts/export-demo-firm.sh 'Some Other Firm%'
#
# SOURCE_DB_URL is the hosted project's connection string (Supabase dashboard
# → Connect). It contains the database password: pass it on the command line
# as above, never write it into a file in this repository.
#
# The export only reads (one read-only transaction). What it copies and what
# it leaves out is described at the top of export-demo-firm.sql. Read the
# result before committing it: it goes to everyone with access to the repository.
set -euo pipefail

: "${SOURCE_DB_URL:?Set SOURCE_DB_URL to the source database connection string}"
firm="${1:-H.I.G.%}"
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../supabase/seeds/demo-firm.sql"

matches=$(psql "$SOURCE_DB_URL" -X -q -At -v ON_ERROR_STOP=1 -v firm="$firm" <<'SQL'
select count(*) from firms where name ilike :'firm';
SQL
)
if [ "$matches" != "1" ]; then
  echo "Expected exactly one firm named like '$firm', found $matches." >&2
  exit 1
fi

mkdir -p "$(dirname "$out")"
psql "$SOURCE_DB_URL" -X -q -At -v ON_ERROR_STOP=1 -v firm="$firm" -f "$here/export-demo-firm.sql" > "$out.tmp"
mv "$out.tmp" "$out"

echo "Wrote $out ($(wc -c < "$out" | tr -d ' ') bytes)."
grep -o '^insert into public\.[a-z_]*' "$out" | sort | uniq -c
