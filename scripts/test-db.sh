#!/usr/bin/env bash
# Runs the database tests against a real PostgreSQL.
#
#   npm run test:db                     # starts a throwaway local cluster
#   DATABASE_URL=postgres://… npm run test:db   # uses an existing empty database
#
# Applies supabase/tests/00_supabase_stub.sql (a stand-in for Supabase's auth
# schema and roles), every migration in order, then each supabase/tests/*.test.sql
# file. A test fails by raising an exception; psql stops on the first error.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cleanup() { :; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  pgbin="${PGBIN:-}"
  if [[ -z "$pgbin" ]]; then
    for candidate in /usr/lib/postgresql/*/bin /usr/local/opt/postgresql*/bin /opt/homebrew/opt/postgresql*/bin; do
      [[ -x "$candidate/initdb" ]] && pgbin="$candidate"
    done
  fi
  if [[ -z "$pgbin" || ! -x "$pgbin/initdb" ]]; then
    echo "No PostgreSQL server binaries found. Set PGBIN or DATABASE_URL." >&2
    exit 1
  fi

  workdir="$(mktemp -d)"
  port="${PGPORT_TEST:-55432}"
  run_as=()
  if [[ "$(id -u)" == "0" ]]; then
    chown -R postgres "$workdir"
    run_as=(runuser -u postgres --)
  fi
  "${run_as[@]}" "$pgbin/initdb" -D "$workdir/data" -U postgres -A trust --no-sync >/dev/null
  "${run_as[@]}" "$pgbin/pg_ctl" -D "$workdir/data" -o "-p $port -k $workdir -c listen_addresses=''" -l "$workdir/log" -w start >/dev/null
  cleanup() {
    "${run_as[@]}" "$pgbin/pg_ctl" -D "$workdir/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$workdir"
  }
  trap cleanup EXIT
  DATABASE_URL="postgresql://postgres@/postgres?host=$workdir&port=$port"
fi

psql_run() {
  psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 --pset pager=off "$@"
}

psql_run -f "$here/supabase/tests/00_supabase_stub.sql" >/dev/null
for migration in "$here"/supabase/migrations/*.sql; do
  psql_run -f "$migration" >/dev/null
done
echo "✓ migrations applied"

status=0
for test in "$here"/supabase/tests/*.test.sql; do
  [[ -e "$test" ]] || continue
  if psql_run -f "$test" >/dev/null; then
    echo "✓ $(basename "$test")"
  else
    echo "✗ $(basename "$test")"
    status=1
    break
  fi
done
exit $status
