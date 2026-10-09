#!/usr/bin/env bash

set -euo pipefail

image="${1:-openclaw-auto/dashboard:higgsfield-lock-test}"
fixture_dir="$(mktemp -d "${TMPDIR:-/tmp}/higgsfield-lock.XXXXXX")"
container="higgsfield-lock-test-$$"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wrapper_path="$script_dir/../dashboard/scripts/run-higgsfield-locked.sh"
cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf "$fixture_dir"
}
trap cleanup EXIT

# 운영에서 credential mount를 가진 서비스는 dashboard 하나뿐이고 monitor·diagnose도 그
# 컨테이너에 docker exec한다. 같은 실제 구조로 하나의 컨테이너 안 두 프로세스를 경합시킨다.
docker run -d --rm --name "$container" \
  -v "$fixture_dir:/credentials:rw" \
  -v "$wrapper_path:/usr/local/bin/run-higgsfield-locked:ro" \
  "$image" sh -c 'sleep 120' >/dev/null

run_contender() {
  local round="$1"
  local label="$2"
  docker exec "$container" sh -ceu '
      umask 077
      HIGGSFIELD_LOCK_DIR=/credentials/.cli.lock.d \
        HIGGSFIELD_LOCK_WAIT_SECONDS=10 \
        /usr/local/bin/run-higgsfield-locked sh -ceu '\''
          round="$1"
          label="$2"
          if ! mkdir /credentials/in-critical 2>/dev/null; then
            printf "%s:%s\n" "$round" "$label" >> /credentials/overlaps
            exit 90
          fi
          printf "%s:%s:start\n" "$round" "$label" >> /credentials/events
          sleep 0.01
          printf "%s:%s:end\n" "$round" "$label" >> /credentials/events
          rmdir /credentials/in-critical
        '\'' sh "$1" "$2"
    ' sh "$round" "$label"
}

: > "$fixture_dir/events"
: > "$fixture_dir/overlaps"
for round in $(seq 1 50); do
  contender_pids=()
  for contender in 1 2 3 4; do
    run_contender "$round" "$contender" &
    contender_pids+=("$!")
  done
  for contender_pid in "${contender_pids[@]}"; do
    wait "$contender_pid"
  done
done

overlap_count="$(wc -l < "$fixture_dir/overlaps" | tr -d ' ')"
event_count="$(wc -l < "$fixture_dir/events" | tr -d ' ')"
if [ "$overlap_count" -ne 0 ] || [ "$event_count" -ne 400 ]; then
  echo "Higgsfield flock stress failed: overlaps=$overlap_count events=$event_count" >&2
  exit 1
fi

credential_mode="$(docker exec "$container" sh -c 'umask 077; : > /credentials/credentials.json; stat -c %a /credentials/credentials.json')"
if [ "$credential_mode" != "600" ]; then
  echo "Higgsfield credential mode mismatch: $credential_mode" >&2
  exit 1
fi

# lock 파일은 남아 있어도 커널 lock owner가 없으면 즉시 획득할 수 있어야 한다.
docker exec "$container" sh -ceu '
  mkdir -p /credentials/.cli.lock.d
  : > /credentials/.cli.lock.d/lock
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
busy_output="$(docker exec "$container" sh -ceu '
  HIGGSFIELD_LOCK_DIR=/credentials/.cli.lock.d \
    HIGGSFIELD_LOCK_WAIT_SECONDS=1 \
    /usr/local/bin/run-higgsfield-locked true
' 2>&1)"
timeout_status=$?
set -e
wait "$holder_pid"
if [ "$timeout_status" -ne 75 ]; then
  echo "Higgsfield live lock must reject with 75, got $timeout_status" >&2
  exit 1
fi
if [ "$busy_output" != "HIGGSFIELD_LOCK_BUSY" ]; then
  echo "Higgsfield lock timeout marker mismatch" >&2
  exit 1
fi

echo "higgsfield_flock_serialized=true contenders=4 rounds=50 overlaps=$overlap_count events=$event_count credential_mode=$credential_mode preexisting_lock_file_reused=true lock_timeout_status=$timeout_status"
