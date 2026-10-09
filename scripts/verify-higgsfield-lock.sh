#!/usr/bin/env bash

set -euo pipefail

image="openclaw-auto/dashboard:higgsfield-lock-test"
lock_path_mode="internal"
image_set=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --lock-path)
      [ "$#" -ge 2 ] || { echo "--lock-path requires bind or internal" >&2; exit 2; }
      lock_path_mode="$2"
      shift 2
      ;;
    --image)
      [ "$#" -ge 2 ] || { echo "--image requires an image name" >&2; exit 2; }
      image="$2"
      image_set=true
      shift 2
      ;;
    --help)
      echo "usage: $0 [--lock-path bind|internal] [--image IMAGE] [IMAGE]"
      exit 0
      ;;
    --*)
      echo "unknown option: $1" >&2
      exit 2
      ;;
    *)
      if [ "$image_set" = true ]; then
        echo "image was specified more than once" >&2
        exit 2
      fi
      image="$1"
      image_set=true
      shift
      ;;
  esac
done

case "$lock_path_mode" in
  bind|internal) ;;
  *) echo "--lock-path must be bind or internal" >&2; exit 2 ;;
esac

fixture_dir="$(mktemp -d "${TMPDIR:-/tmp}/higgsfield-lock.XXXXXX")"
result_dir="$fixture_dir/results"
internal_credential_dir="$fixture_dir/credentials"
container_a="higgsfield-lock-test-a-$$"
container_b="higgsfield-lock-test-b-$$"
containers=("$container_a")
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
wrapper_path="$script_dir/../dashboard/scripts/run-higgsfield-locked.sh"
mkdir -p "$result_dir" "$internal_credential_dir"

if [ "$lock_path_mode" = "bind" ]; then
  credential_dir="${HIGGSFIELD_CREDENTIAL_DIR:-$HOME/.config/higgsfield}"
  [ -d "$credential_dir" ] || {
    echo "Higgsfield credential directory not found: $credential_dir" >&2
    exit 2
  }
  [ -s "$credential_dir/credentials.json" ] || {
    echo "Higgsfield credential file not found or empty: $credential_dir/credentials.json" >&2
    exit 2
  }
  containers=("$container_a" "$container_b")
  lock_dir="/credentials/.cli.lock.d"
else
  credential_dir="$internal_credential_dir"
  lock_dir="/tmp/higgsfield-cli-lock"
fi

cleanup() {
  local container
  for container in "${containers[@]}"; do
    docker rm -f "$container" >/dev/null 2>&1 || true
  done
  rm -rf "$fixture_dir"
}
trap cleanup EXIT

# internal은 한 컨테이너 내부 파일시스템의 flock 자체를 빠르게 검증한다. bind는 운영과
# 동일한 실제 ~/.config/higgsfield를 두 컨테이너에 RW로 마운트해 서로 다른 mount namespace의
# 프로세스가 같은 lock inode를 두고 경쟁하게 한다. 결과 sentinel은 별도 임시 bind mount에
# 두므로 실제 credentials.json의 내용은 읽거나 변경하지 않는다.
for container in "${containers[@]}"; do
  docker run -d --rm --name "$container" \
    -v "$credential_dir:/credentials:rw" \
    -v "$result_dir:/results:rw" \
    -v "$wrapper_path:/usr/local/bin/run-higgsfield-locked:ro" \
    "$image" sh -c 'sleep 300' >/dev/null
done

run_contender() {
  local round="$1"
  local label="$2"
  local container="$container_a"
  if [ "$lock_path_mode" = "bind" ] && [ $((label % 2)) -eq 0 ]; then
    container="$container_b"
  fi
  docker exec "$container" sh -ceu '
      umask 077
      HIGGSFIELD_LOCK_DIR="$1" \
        HIGGSFIELD_LOCK_WAIT_SECONDS=10 \
        /usr/local/bin/run-higgsfield-locked sh -ceu '\''
          round="$1"
          label="$2"
          if ! mkdir /results/in-critical 2>/dev/null; then
            printf "%s:%s\n" "$round" "$label" >> /results/overlaps
            exit 90
          fi
          printf "%s:%s:start\n" "$round" "$label" >> /results/events
          sleep 0.5
          printf "%s:%s:end\n" "$round" "$label" >> /results/events
          rmdir /results/in-critical
        '\'' sh "$2" "$3"
    ' sh "$lock_dir" "$round" "$label"
}

: > "$result_dir/events"
: > "$result_dir/overlaps"
contender_failures=0
for round in $(seq 1 50); do
  contender_pids=()
  for contender in 1 2 3 4; do
    run_contender "$round" "$contender" &
    contender_pids+=("$!")
  done
  set +e
  for contender_pid in "${contender_pids[@]}"; do
    wait "$contender_pid"
    contender_status=$?
    if [ "$contender_status" -ne 0 ]; then
      contender_failures=$((contender_failures + 1))
    fi
  done
  set -e
done

overlap_count="$(wc -l < "$result_dir/overlaps" | tr -d ' ')"
event_count="$(wc -l < "$result_dir/events" | tr -d ' ')"
if [ "$overlap_count" -ne 0 ] || [ "$event_count" -ne 400 ] || [ "$contender_failures" -ne 0 ]; then
  echo "Higgsfield flock stress failed: overlaps=$overlap_count events=$event_count contender_failures=$contender_failures" >&2
  exit 1
fi

if [ "$lock_path_mode" = "bind" ]; then
  credential_mode="$(docker exec "$container_a" stat -c %a /credentials/credentials.json)"
else
  credential_mode="$(docker exec "$container_a" sh -c 'umask 077; : > /credentials/credentials.json; stat -c %a /credentials/credentials.json')"
fi
if [ "$credential_mode" != "600" ]; then
  echo "Higgsfield credential mode mismatch: $credential_mode" >&2
  exit 1
fi

# lock 파일이 남아 있어도 커널 lock owner가 없으면 즉시 다시 획득할 수 있어야 한다.
docker exec "$container_a" sh -ceu '
  HIGGSFIELD_LOCK_DIR="$1" /usr/local/bin/run-higgsfield-locked true
  HIGGSFIELD_LOCK_DIR="$1" /usr/local/bin/run-higgsfield-locked true
' sh "$lock_dir"

# 살아 있는 owner가 있으면 다른 프로세스는 제한시간 뒤 75로 거절돼야 한다. bind 모드는
# holder와 contender를 서로 다른 컨테이너에서 실행해 host bind mount 직렬화를 검증한다.
docker exec "$container_a" sh -ceu '
  HIGGSFIELD_LOCK_DIR="$1" \
    /usr/local/bin/run-higgsfield-locked sh -ceu '\''
      : > /results/holder-ready
      sleep 3
    '\''
' sh "$lock_dir" &
holder_pid=$!
for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -f "$result_dir/holder-ready" ] && break
  sleep 0.1
done
[ -f "$result_dir/holder-ready" ]
busy_container="$container_a"
if [ "$lock_path_mode" = "bind" ]; then busy_container="$container_b"; fi
set +e
busy_output="$(docker exec "$busy_container" sh -ceu '
  HIGGSFIELD_LOCK_DIR="$1" \
    HIGGSFIELD_LOCK_WAIT_SECONDS=1 \
    /usr/local/bin/run-higgsfield-locked true
' sh "$lock_dir" 2>&1)"
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

echo "higgsfield_flock_serialized=true lock_path=$lock_path_mode containers=${#containers[@]} critical_seconds=0.5 contenders=4 rounds=50 overlaps=$overlap_count events=$event_count contender_failures=$contender_failures credential_mode=$credential_mode preexisting_lock_file_reused=true lock_timeout_status=$timeout_status"
