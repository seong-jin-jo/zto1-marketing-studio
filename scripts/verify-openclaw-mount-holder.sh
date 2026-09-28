#!/bin/bash
# 실제 Docker에서 2단계 holder가 손상 archive 뒤에도 mount를 유지하고 재시도하는지 검증한다.

set -euo pipefail

command -v docker >/dev/null 2>&1 || { echo "FAIL: docker CLI 없음" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "FAIL: docker daemon 접근 불가" >&2; exit 1; }
docker image inspect alpine:3 >/dev/null 2>&1 || docker pull alpine:3 >/dev/null

TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/openclaw-holder-test.XXXXXX")"
WRITER="openclaw-holder-writer-$$"
HOLDER="openclaw-holder-helper-$$"

cleanup() {
  docker rm -f "$HOLDER" "$WRITER" >/dev/null 2>&1 || true
  case "$TEST_ROOT" in "${TMPDIR:-/tmp}"/openclaw-holder-test.*) rm -rf "$TEST_ROOT" ;; esac
}
trap cleanup EXIT

install -d "$TEST_ROOT/source/config" "$TEST_ROOT/source/data" "$TEST_ROOT/control" "$TEST_ROOT/result/config" "$TEST_ROOT/result/data"
printf 'before-stop\n' > "$TEST_ROOT/source/config/state.txt"
printf 'before-stop\n' > "$TEST_ROOT/source/data/state.txt"

docker run -d --pull=never --name "$WRITER" \
  -v "$TEST_ROOT/source/config:/config" -v "$TEST_ROOT/source/data:/data" \
  alpine:3 sh -c 'trap "echo final-write > /config/final.txt; echo final-write > /data/final.txt; exit 0" TERM; while :; do sleep 1; done' >/dev/null

if [ "$(uname -s)" = Linux ]; then
  rm -rf "$TEST_ROOT/source/config" "$TEST_ROOT/source/data"
  docker exec "$WRITER" test -f /config/state.txt
fi

docker pause "$WRITER" >/dev/null
writer_pid="$(docker inspect --format '{{.State.Pid}}' "$WRITER")"
holder_script="$(cat <<EOF
set -eu
exec 5>/control/ready
nsenter -t ${writer_pid} -m -r/proc/${writer_pid}/root -w/ /bin/sh -c '
set -eu
hold=/tmp/openclaw-holder-test-$$
mkdir -p "\$hold/config" "\$hold/data"
mount --bind /config "\$hold/config"
mount --bind /data "\$hold/data"
printf ready >&5
trap "exit 0" TERM INT
while :; do sleep 1; done
' &
hold_pid=\$!
archive(){
  rm -f /control/archive-ready /control/config.tar /control/data.tar
  nsenter -t "\$hold_pid" -m -r/proc/"\$hold_pid"/root -w/ tar -cf - -C /tmp/openclaw-holder-test-$$/config . > /control/config.tar
  nsenter -t "\$hold_pid" -m -r/proc/"\$hold_pid"/root -w/ tar -cf - -C /tmp/openclaw-holder-test-$$/data . > /control/data.tar
  sync
  printf ready > /control/archive-ready
}
release(){ kill -TERM "\$hold_pid"; wait "\$hold_pid"; exit 0; }
trap archive USR1
trap release USR2
trap release TERM INT
while kill -0 "\$hold_pid" 2>/dev/null; do wait "\$hold_pid" || true; done
EOF
)"
docker run -d --pull=never --name "$HOLDER" --privileged --pid=host -v "$TEST_ROOT/control:/control" alpine:3 sh -c "$holder_script" >/dev/null

for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$TEST_ROOT/control/ready" ] && break; sleep 1; done
[ -s "$TEST_ROOT/control/ready" ] || { echo "FAIL: holder 준비 실패" >&2; exit 1; }

docker stop --timeout 30 "$WRITER" >/dev/null
docker kill --signal USR1 "$HOLDER" >/dev/null
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$TEST_ROOT/control/archive-ready" ] && break; sleep 1; done
[ -s "$TEST_ROOT/control/archive-ready" ] || { echo "FAIL: 첫 archive 준비 실패" >&2; exit 1; }

# 호스트 검증 실패를 주입한다. holder는 아직 살아 있어야 하며 같은 mount에서 다시 archive한다.
: > "$TEST_ROOT/control/config.tar"
if [ -s "$TEST_ROOT/control/config.tar" ] && tar -tf "$TEST_ROOT/control/config.tar" >/dev/null 2>&1; then echo "FAIL: 손상 archive가 검증을 통과함" >&2; exit 1; fi
[ "$(docker inspect --format '{{.State.Running}}' "$HOLDER")" = true ] || { echo "FAIL: 검증 전에 holder가 종료됨" >&2; exit 1; }
rm -f "$TEST_ROOT/control/archive-ready"
docker kill --signal USR1 "$HOLDER" >/dev/null
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$TEST_ROOT/control/archive-ready" ] && break; sleep 1; done
[ -s "$TEST_ROOT/control/archive-ready" ] || { echo "FAIL: archive 재시도 준비 실패" >&2; exit 1; }
tar -tf "$TEST_ROOT/control/config.tar" >/dev/null
tar -tf "$TEST_ROOT/control/data.tar" >/dev/null
tar -xf "$TEST_ROOT/control/config.tar" -C "$TEST_ROOT/result/config"
tar -xf "$TEST_ROOT/control/data.tar" -C "$TEST_ROOT/result/data"
for kind in config data; do
  grep -qx before-stop "$TEST_ROOT/result/$kind/state.txt"
  grep -qx final-write "$TEST_ROOT/result/$kind/final.txt"
done

docker kill --signal USR2 "$HOLDER" >/dev/null
docker wait "$HOLDER" >/dev/null
[ "$(docker inspect --format '{{.State.ExitCode}}' "$HOLDER")" = 0 ]
echo "PASS: 손상 archive 뒤 holder 생존과 재시도, 기존 상태와 graceful shutdown 최종 쓰기 보존을 확인했다."
