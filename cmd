#!/bin/sh
# @alias-enabled true
set -eu

DIR="$(cd "$(dirname "$0")" && pwd)"

die() {
  echo "[error] $1" >&2
  exit 1
}

require_bun() {
  command -v bun > /dev/null 2>&1 || die "bun not found on PATH"
}

list_commands() {
  for f in "${DIR}"/src/cli/cmd/*/main.ts; do
    [ -f "$f" ] || continue
    basename "$(dirname "$f")"
  done | sort
}

print_available() {
  echo "" >&2
  echo "available commands:" >&2
  list_commands | sed 's/^/  /' >&2
}

print_usage() {
  echo "usage: cmd <name> [args...]" >&2
  print_available
}

resolve_main() {
  main="${DIR}/src/cli/cmd/${1}/main.ts"
  [ -f "$main" ] || return 1
}

require_bun

if [ $# -eq 0 ]; then
  print_usage
  exit 1
fi

name="$1"
shift

if ! resolve_main "$name"; then
  echo "[error] command not found: ${name}" >&2
  print_available
  exit 1
fi

exec bun run "$main" "$@"
