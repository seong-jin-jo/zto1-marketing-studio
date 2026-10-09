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
  local has_hold_status=no
  for probe_status in "$@"; do
    if [ "$probe_status" = "0" ]; then
      printf '%s\n' "up"
      return 0
    fi
    if [ "$probe_status" = "75" ] || [ "$probe_status" = "127" ]; then
      has_hold_status=yes
    fi
  done

  if [ "$has_hold_status" = "yes" ]; then
    printf '%s\n' "hold"
    return 0
  fi

  printf '%s\n' "down"
}

generator_monitor_transition() {
  local previous="${1:-unknown}"
  local current="${2:-hold}"
  local hold_count="${3:-0}"

  # Slack 전송은 best-effort다. 3회째 한 번만 알리면 그 전송 실패 뒤 영구 침묵하므로
  # 보류가 계속되는 동안 3회 간격으로 다시 경보한다(3, 6, 9, ...).
  if [ "$current" = "hold" ] \
      && [[ "$hold_count" =~ ^[0-9]+$ ]] \
      && [ "$hold_count" -ge 3 ] \
      && [ $((hold_count % 3)) -eq 0 ]; then
    printf '%s\n' "hold_warning"
  elif [ "$current" = "down" ] && [ "$previous" = "suspect" ]; then
    printf '%s\n' "failure"
  elif [ "$current" = "up" ] && [ "$previous" = "down" ]; then
    printf '%s\n' "recovery"
  else
    printf '%s\n' "none"
  fi
}

generator_monitor_next_hold_count() {
  local previous_count="${1:-0}"
  local current="${2:-hold}"

  if ! [[ "$previous_count" =~ ^[0-9]+$ ]]; then
    previous_count=0
  fi
  if [ "$current" = "hold" ]; then
    printf '%s\n' "$((previous_count + 1))"
  else
    printf '%s\n' "0"
  fi
}

generator_monitor_persisted_state() {
  local previous="${1:-unknown}"
  local current="${2:-hold}"

  case "$current" in
    hold)
      printf '%s\n' "$previous"
      ;;
    down)
      if [ "$previous" = "suspect" ] || [ "$previous" = "down" ]; then
        printf '%s\n' "down"
      else
        printf '%s\n' "suspect"
      fi
      ;;
    up)
      printf '%s\n' "up"
      ;;
    *)
      printf '%s\n' "$previous"
      ;;
  esac
}
