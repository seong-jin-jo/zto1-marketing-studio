#!/usr/bin/env bash

set -euo pipefail

image="${1:-openclaw-auto/dashboard:higgsfield-lock-test}"
fixture_dir="$(mktemp -d "${TMPDIR:-/tmp}/higgsfield-lock.XXXXXX")"
container="higgsfield-lock-test-$$"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$fixture_dir"
}
trap cleanup EXIT

# 운영에서 credential mount를 가진 서비스는 dashboard 하나뿐이고 monitor·diagnose도 그
# 컨테이너에 docker exec한다. 같은 실제 구조로 하나의 컨테이너 안 두 프로세스를 경합시킨다.
docker run -d --rm --name "$container" \
  -v "$fixture_dir:/credentials:rw" \
  "$image" sh -c 'sleep 20' >/dev/null

run_contender() {
  local label="$1"
  local delay="$2"
  docker exec "$container" sh -ceu '
      umask 077
      HIGGSFIELD_LOCK_DIR=/credentials/.cli.lock.d \
        HIGGSFIELD_LOCK_WAIT_SECONDS=10 \
        /usr/local/bin/run-higgsfield-locked sh -ceu '\''
          printf "%s:start\n" "$1" >> /credentials/events
          sleep "$2"
          printf "%s:end\n" "$1" >> /credentials/events
        '\'' sh "$1" "$2"
    ' sh "$label" "$delay"
}

run_contender first 1 &
first_pid=$!
for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  grep -q '^first:start$' "$fixture_dir/events" 2>/dev/null && break
  sleep 0.1
done
grep -q '^first:start$' "$fixture_dir/events"
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

credential_mode="$(docker exec "$container" sh -c 'umask 077; : > /credentials/credentials.json; stat -c %a /credentials/credentials.json')"
if [ "$credential_mode" != "600" ]; then
  echo "Higgsfield credential mode mismatch: $credential_mode" >&2
  exit 1
fi

# 강제 종료가 남긴 잠금은 owner 프로세스가 없으면 다음 호출이 회수해야 한다.
docker exec "$container" sh -ceu '
  mkdir -p /credentials/.cli.lock.d
  printf "%s\n" stale-owner > /credentials/.cli.lock.d/owner
  touch -d "10 seconds ago" /credentials/.cli.lock.d /credentials/.cli.lock.d/owner
  HIGGSFIELD_LOCK_DIR=/credentials/.cli.lock.d \
    /usr/local/bin/run-higgsfield-locked true
'

# 살아 있는 owner가 있으면 제한시간 뒤 75로 거절하고 동시에 진입하면 안 된다.
docker exec "$container" sh -ceu '
  HIGGSFIELD_LOCK_DIR=/credentials/.cli.lock.d \
    /usr/local/bin/run-higgsfield-locked sh -ceu '\''
      : > /credentials/holder-ready
      sleep 3
    '\''
' &
holder_pid=$!
for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -f "$fixture_dir/holder-ready" ] && break
  sleep 0.1
done
[ -f "$fixture_dir/holder-ready" ]
set +e
docker exec "$container" sh -ceu '
  HIGGSFIELD_LOCK_DIR=/credentials/.cli.lock.d \
    HIGGSFIELD_LOCK_WAIT_SECONDS=1 \
    /usr/local/bin/run-higgsfield-locked true
' >/dev/null 2>&1
timeout_status=$?
set -e
wait "$holder_pid"
if [ "$timeout_status" -ne 75 ]; then
  echo "Higgsfield live lock must reject with 75, got $timeout_status" >&2
  exit 1
fi

echo "higgsfield_lock_serialized=true contenders=2 credential_mode=$credential_mode stale_recovered=true lock_timeout_status=$timeout_status"
