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
  "GENERATOR-MONITOR-02 장애: 최초 시도와 세 번 재시도가 모두 실패하면 down" \
  "down" \
  "$(generator_monitor_classify running 7 7 7 7)"

assert_eq \
  "GENERATOR-MONITOR-03 보류: 컨테이너 미기동은 장애로 판정하지 않고 이전 상태 유지" \
  "hold:up" \
  "$(generator_monitor_classify stopped 7 7 7 7):$(generator_monitor_persisted_state up hold)"

assert_eq \
  "GENERATOR-MONITOR-04 전이 없음: 정상 상태가 유지되면 Slack 알림 없음" \
  "none" \
  "$(generator_monitor_transition up up)"

if [ "$failures" -ne 0 ]; then
  exit 1
fi

printf 'generator monitor state tests: 4 passed\n'
