#!/usr/bin/env bash

set -euo pipefail

image="${1:-openclaw-auto/dashboard:higgsfield-lock-test}"
fixture_dir="$(mktemp -d "${TMPDIR:-/tmp}/higgsfield-lock.XXXXXX")"
cleanup() {
  rm -rf "$fixture_dir"
}
trap cleanup EXIT

run_contender() {
  local label="$1"
  local delay="$2"
  docker run --rm \
    -v "$fixture_dir:/credentials:rw" \
    "$image" \
    sh -ceu '
      umask 077
      flock --exclusive --wait 10 --conflict-exit-code 75 --no-fork \
        /credentials/.cli.lock sh -ceu '\''
          printf "%s:start\n" "$1" >> /credentials/events
          sleep "$2"
          printf "%s:end\n" "$1" >> /credentials/events
        '\'' sh "$1" "$2"
    ' sh "$label" "$delay"
}

run_contender first 1 &
first_pid=$!
sleep 0.1
run_contender second 0 &
second_pid=$!

wait "$first_pid"
wait "$second_pid"

expected="$(printf 'first:start\nfirst:end\nsecond:start\nsecond:end')"
actual="$(sed -n '1,4p' "$fixture_dir/events")"
if [ "$actual" != "$expected" ]; then
  echo "Higgsfield lock serialization failed" >&2
  sed -n '1,4p' "$fixture_dir/events" >&2
  exit 1
fi

lock_mode="$(stat -f '%Lp' "$fixture_dir/.cli.lock" 2>/dev/null || stat -c '%a' "$fixture_dir/.cli.lock")"
if [ "$lock_mode" != "600" ]; then
  echo "Higgsfield lock mode mismatch: $lock_mode" >&2
  exit 1
fi

echo "higgsfield_lock_serialized=true contenders=2 lock_mode=$lock_mode"
