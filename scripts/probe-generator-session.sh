#!/usr/bin/env bash

set -uo pipefail

container="${1:-openclaw-dashboard-osmu}"
outer_timeout="${GENERATOR_PROBE_OUTER_TIMEOUT:-50s}"
command_timeout_seconds="${GENERATOR_PROBE_COMMAND_TIMEOUT_SECONDS:-30}"
kill_after="${GENERATOR_PROBE_KILL_AFTER:-5s}"
lock_wait="${GENERATOR_PROBE_LOCK_WAIT_SECONDS:-10}"

# `account status`는 계정 API를 실제로 호출하는 읽기 전용 명령이다. 생성 요청은 하지 않는다.
# 종료 코드는 보존하되 명령 출력은 로그에 내보내지 않는다. 계정 명령의 오류 출력에는
# 예측하지 못한 형식의 토큰이나 계정 식별자가 섞일 수 있어 부분 마스킹만으로는 안전하지 않다.
set +e
# 바깥 timeout은 docker 클라이언트의 전송 교착만 제한한다. CLI 수명은 잠금을 보유한 wrapper
# 내부 timeout이 관리해 refresh 도중 바깥 프로세스가 먼저 잘라 credential을 반쯤 쓰지 않게 한다.
timeout -k "$kill_after" "$outer_timeout" \
  docker exec "$container" env HIGGSFIELD_LOCK_WAIT_SECONDS="$lock_wait" \
  HIGGSFIELD_COMMAND_TIMEOUT_SECONDS="$command_timeout_seconds" \
  /usr/local/bin/run-higgsfield-locked higgsfield account status >/dev/null 2>&1
probe_status=$?
set -e

echo "생성기 API 생존 확인 종료 코드: $probe_status"

exit "$probe_status"
