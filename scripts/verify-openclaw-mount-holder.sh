#!/bin/bash
# 실제 Docker에서 mount namespace holder가 graceful shutdown 최종 쓰기를 보존하는지 검증한다.

set -euo pipefail

command -v docker >/dev/null 2>&1 || { echo "SKIP: docker CLI 없음"; exit 0; }
docker info >/dev/null 2>&1 || { echo "SKIP: docker daemon 접근 불가"; exit 0; }
docker image inspect alpine:3 >/dev/null 2>&1 || docker pull alpine:3 >/dev/null

TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/openclaw-holder-test.XXXXXX")"
WRITER="openclaw-holder-writer-$$"
HOLDER="openclaw-holder-helper-$$"

cleanup() {
  docker rm -f "$HOLDER" "$WRITER" >/dev/null 2>&1 || true
  case "$TEST_ROOT" in
    "${TMPDIR:-/tmp}"/openclaw-holder-test.*) rm -rf "$TEST_ROOT" ;;
  esac
}
trap cleanup EXIT

install -d "$TEST_ROOT/source/config" "$TEST_ROOT/source/data" "$TEST_ROOT/control" "$TEST_ROOT/result/config" "$TEST_ROOT/result/data"
printf 'before-stop\n' > "$TEST_ROOT/source/config/state.txt"
printf 'before-stop\n' > "$TEST_ROOT/source/data/state.txt"

docker run -d --pull=never \
  --name "$WRITER" \
  -v "$TEST_ROOT/source/config:/config" \
  -v "$TEST_ROOT/source/data:/data" \
  alpine:3 sh -c 'trap "echo final-write > /config/final.txt; echo final-write > /data/final.txt; exit 0" TERM; while :; do sleep 1; done' >/dev/null

if [ "$(uname -s)" = "Linux" ]; then
  rm -rf "$TEST_ROOT/source/config" "$TEST_ROOT/source/data"
  docker exec "$WRITER" test -f /config/state.txt
fi

docker pause "$WRITER" >/dev/null
writer_pid="$(docker inspect --format '{{.State.Pid}}' "$WRITER")"
holder_script="$(cat <<EOF
set -eu
exec 3>/control/config.tar
exec 4>/control/data.tar
exec 5>/control/ready
exec nsenter -t ${writer_pid} -m -r/proc/${writer_pid}/root -w/ /bin/sh -c '
set -eu
hold=/tmp/openclaw-holder-test-$$
mkdir -p "\$hold/config" "\$hold/data"
mount --bind /config "\$hold/config"
mount --bind /data "\$hold/data"
printf ready >&5
trap "tar -cf - -C \"\$hold/config\" . >&3; tar -cf - -C \"\$hold/data\" . >&4; exit 0" USR1
while :; do sleep 1; done
'
EOF
)"
docker run -d --pull=never \
  --name "$HOLDER" \
  --privileged \
  --pid=host \
  -v "$TEST_ROOT/control:/control" \
  alpine:3 sh -c "$holder_script" >/dev/null

ready=0
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if [ -s "$TEST_ROOT/control/ready" ]; then ready=1; break; fi
  sleep 1
done
[ "$ready" = "1" ] || { docker logs "$HOLDER" >&2; echo "FAIL: holder 준비 실패" >&2; exit 1; }

docker stop --timeout 30 "$WRITER" >/dev/null
docker kill --signal USR1 "$HOLDER" >/dev/null
docker wait "$HOLDER" >/dev/null
[ "$(docker inspect --format '{{.State.ExitCode}}' "$HOLDER")" = "0" ]

tar -xf "$TEST_ROOT/control/config.tar" -C "$TEST_ROOT/result/config"
tar -xf "$TEST_ROOT/control/data.tar" -C "$TEST_ROOT/result/data"
for kind in config data; do
  grep -qx 'before-stop' "$TEST_ROOT/result/$kind/state.txt"
  grep -qx 'final-write' "$TEST_ROOT/result/$kind/final.txt"
done

echo "PASS: holder는 config/data의 기존 상태와 graceful shutdown 최종 쓰기를 모두 보존했다."
