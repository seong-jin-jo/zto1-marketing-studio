#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# repo_root로 계산한 동적 절대경로다.
# shellcheck disable=SC1091
source "$repo_root/scripts/lib/generator-monitor-state.sh"

failures=0

assert_eq() {
  local test_name="$1"
  local expected="$2"
  local actual="$3"

  if [ "$actual" = "$expected" ]; then
    printf 'PASS %s\n' "$test_name"
  else
    printf 'FAIL %s: expected=%s actual=%s\n' "$test_name" "$expected" "$actual" >&2
    failures=$((failures + 1))
  fi
}

assert_eq \
  "GENERATOR-MONITOR-01 정상: 재시도 중 한 번이라도 성공하면 up" \
  "up" \
  "$(generator_monitor_classify running 7 7 0 7)"

assert_eq \
  "GENERATOR-MONITOR-02 일시 실패: 첫 down은 suspect로 저장하고 알리지 않음" \
  "none:suspect" \
  "$(generator_monitor_transition up down):$(generator_monitor_persisted_state up down)"

assert_eq \
  "GENERATOR-MONITOR-03 연속 장애: suspect 다음 down에서만 failure 전이" \
  "failure:down" \
  "$(generator_monitor_transition suspect down):$(generator_monitor_persisted_state suspect down)"

assert_eq \
  "GENERATOR-MONITOR-04 보류: 컨테이너 미기동은 장애로 판정하지 않고 이전 상태 유지" \
  "hold:up" \
  "$(generator_monitor_classify stopped 7 7 7 7):$(generator_monitor_persisted_state up hold)"

assert_eq \
  "GENERATOR-MONITOR-05 복구: 장애 뒤 한 번의 up으로 recovery 전이" \
  "recovery:up" \
  "$(generator_monitor_transition down up):$(generator_monitor_persisted_state down up)"

assert_eq \
  "GENERATOR-MONITOR-06 보류: 잠금 대기 종료 코드 75는 인증 장애가 아니다" \
  "hold:suspect" \
  "$(generator_monitor_classify running 7 75 7 7):$(generator_monitor_persisted_state suspect hold)"

assert_eq \
  "GENERATOR-MONITOR-07 보류: 옛 이미지의 wrapper 없음 127은 인증 장애가 아니다" \
  "hold:up" \
  "$(generator_monitor_classify running 127 7 7 7):$(generator_monitor_persisted_state up hold)"

if [ "$failures" -ne 0 ]; then
  exit 1
fi

printf 'generator monitor state tests: 7 passed\n'
