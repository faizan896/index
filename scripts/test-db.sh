#!/usr/bin/env bash
# Runs the database tests against a real PostgreSQL.
#
#   npm run test:db                             # starts a throwaway local cluster
#   npm run test:db -- list_links performance   # only test files whose names contain these
#   DATABASE_URL=postgres://… npm run test:db   # uses an existing empty database
#
# Applies supabase/tests/00_supabase_stub.sql (a stand-in for Supabase's auth
# schema, roles and default privileges), every migration in order, then each
# supabase/tests/*.test.sql file in name order (01_helpers always runs). A
# test fails by raising an exception; psql stops at the first error in a file
# and the run stops at the first failing file. INFO and WARNING messages from
# passing files (timings, plans) are printed under the file's name; a failing
# file's whole output is shown.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cleanup() { :; }

now_ms() {
  local t
  t="$(date +%s%N)"
  if [[ "$t" == *N ]]; then echo $(($(date +%s) * 1000)); else echo $((t / 1000000)); fi
}

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

  # Supabase databases are UTF-8 with a Unicode-aware locale; lower(), regex
  # classes and the text-search parser treat é or 日本 differently under "C".
  locale="C"
  available="$(locale -a 2>/dev/null || true)"
  for candidate in C.UTF-8 C.utf8 en_US.UTF-8 en_US.utf8; do
    if grep -qx "$candidate" <<<"$available"; then
      locale="$candidate"
      break
    fi
  done

  workdir="$(mktemp -d)"
  port="${PGPORT_TEST:-55432}"
  run_as=(env)
  if [[ "$(id -u)" == "0" ]]; then
    chown -R postgres "$workdir"
    run_as=(runuser -u postgres --)
  fi
  "${run_as[@]}" "$pgbin/initdb" -D "$workdir/data" -U postgres -A trust --no-sync -E UTF8 --locale="$locale" >/dev/null
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

wanted() {
  local name="$1" pattern
  [[ "$name" == 01_* ]] && return 0
  ((${#filters[@]} == 0)) && return 0
  for pattern in "${filters[@]}"; do
    [[ "$name" == *"$pattern"* ]] && return 0
  done
  return 1
}

filters=("$@")
status=0
passed=0
for test in "$here"/supabase/tests/*.test.sql; do
  [[ -e "$test" ]] || continue
  name="$(basename "$test")"
  wanted "$name" || continue
  started="$(now_ms)"
  if output="$(psql_run -f "$test" 2>&1 >/dev/null)"; then
    echo "✓ $name ($(($(now_ms) - started)) ms)"
    grep -E '(INFO|WARNING): ' <<<"$output" | sed -E 's/^.*(INFO|WARNING):  ?/    /' || true
    passed=$((passed + 1))
  else
    echo "✗ $name"
    sed -E 's/^/    /' <<<"$output"
    status=1
    break
  fi
done

((status == 0)) && echo "$passed test files passed"
exit $status
