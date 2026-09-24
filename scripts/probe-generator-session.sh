#!/usr/bin/env bash

set -u

container="${1:-openclaw-dashboard-osmu}"

# `account status`는 계정 API를 실제로 호출하는 읽기 전용 명령이다. 생성 요청은 하지 않는다.
# 종료 코드를 잃지 않도록 파이프 밖에서 먼저 받고, 출력은 diagnose-generator.yml과 같은
# 토큰 가림에 이메일 가림을 더한 뒤에만 로그로 보낸다.
set +e
probe_output="$(timeout 30s docker exec "$container" higgsfield account status 2>&1)"
probe_status=$?
set -e

echo "-- 생성기 API 생존 확인 출력 (민감정보 가림) --"
if [ -n "$probe_output" ]; then
  if safe_output="$(printf '%s\n' "$probe_output" \
      | sed -E \
        -e 's/(ya29|eyJ)[A-Za-z0-9_./+=-]+/[가림]/g' \
        -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[이메일 가림]/g' \
      | tail -20)"; then
    printf '%s\n' "$safe_output"
  else
    echo "(민감정보 가림 실패로 출력 숨김)"
  fi
else
  echo "(출력 없음)"
fi
echo "생성기 API 생존 확인 종료 코드: $probe_status"

exit "$probe_status"
