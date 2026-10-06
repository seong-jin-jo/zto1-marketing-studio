#!/usr/bin/env bash

# Higgsfield 계정 상태 감시의 순수 판정 함수 모음.
# 실제 account status 호출은 scripts/probe-generator-session.sh가 담당한다.

generator_monitor_classify() {
  local container_state="${1:-missing}"
  shift || true

  if [ "$container_state" != "running" ]; then
    printf '%s\n' "hold"
    return 0
  fi

  local probe_status
  for probe_status in "$@"; do
    if [ "$probe_status" = "0" ]; then
      printf '%s\n' "up"
      return 0
    fi
  done

  printf '%s\n' "down"
}

generator_monitor_transition() {
  local previous="${1:-unknown}"
  local current="${2:-hold}"

  if [ "$current" = "down" ] && [ "$previous" != "down" ]; then
    printf '%s\n' "failure"
  elif [ "$current" = "up" ] && [ "$previous" = "down" ]; then
    printf '%s\n' "recovery"
  else
    printf '%s\n' "none"
  fi
}

generator_monitor_persisted_state() {
  local previous="${1:-unknown}"
  local current="${2:-hold}"

  if [ "$current" = "hold" ]; then
    printf '%s\n' "$previous"
  else
    printf '%s\n' "$current"
  fi
}
