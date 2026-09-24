#!/usr/bin/env bash

set -uo pipefail

container="${1:-openclaw-dashboard-osmu}"
outer_timeout="${GENERATOR_PROBE_OUTER_TIMEOUT:-35s}"
inner_timeout="${GENERATOR_PROBE_INNER_TIMEOUT:-30s}"
kill_after="${GENERATOR_PROBE_KILL_AFTER:-5s}"

# `account status`는 계정 API를 실제로 호출하는 읽기 전용 명령이다. 생성 요청은 하지 않는다.
# 종료 코드는 보존하되 명령 출력은 로그에 내보내지 않는다. 계정 명령의 오류 출력에는
# 예측하지 못한 형식의 토큰이나 계정 식별자가 섞일 수 있어 부분 마스킹만으로는 안전하지 않다.
set +e
# 바깥 timeout은 docker 클라이언트를, 안쪽 timeout은 컨테이너 안 CLI를 종료한다.
# API가 멎어도 컨테이너에 고아 higgsfield 프로세스를 남기지 않는다.
timeout -k "$kill_after" "$outer_timeout" \
  docker exec "$container" timeout -k "$kill_after" "$inner_timeout" \
  higgsfield account status >/dev/null 2>&1
probe_status=$?
set -e

echo "생성기 API 생존 확인 종료 코드: $probe_status"

exit "$probe_status"
