#!/usr/bin/env bash

set -euo pipefail

lock_dir="${HIGGSFIELD_LOCK_DIR:-/root/.config/higgsfield/.cli.lock.d}"
wait_seconds="${HIGGSFIELD_LOCK_WAIT_SECONDS:-45}"
command_timeout_seconds="${HIGGSFIELD_COMMAND_TIMEOUT_SECONDS:-600}"

if ! [[ "$wait_seconds" =~ ^[0-9]+$ ]] || [ "$wait_seconds" -lt 1 ] || [ "$wait_seconds" -gt 300 ]; then
  wait_seconds=45
fi
if ! [[ "$command_timeout_seconds" =~ ^[0-9]+$ ]] \
    || [ "$command_timeout_seconds" -lt 1 ] || [ "$command_timeout_seconds" -gt 3600 ]; then
  command_timeout_seconds=600
fi
if [ "$#" -lt 1 ]; then
  echo "usage: run-higgsfield-locked.sh <command> [args...]" >&2
  exit 64
fi

umask 077
mkdir -p "$lock_dir"
chmod 700 "$lock_dir"
lock_file="$lock_dir/lock"

# 커널 advisory lock이 획득과 해제를 원자적으로 처리한다. owner PID를 읽고 stale 디렉터리를
# 옮기는 방식은 판정과 mv 사이에 다른 경쟁자가 들어올 수 있어 OAuth refresh를 중복 실행했다.
exec 9>"$lock_file"
chmod 600 "$lock_file"
if ! flock -w "$wait_seconds" 9; then
  # 자식 명령 자체가 75를 반환하는 경우와 구분하는 공개 표식이다. 토큰·명령 인자는 출력하지 않는다.
  echo "HIGGSFIELD_LOCK_BUSY" >&2
  exit 75
fi

# wrapper가 비정상 종료돼도 flock은 열린 fd 수명에 묶여 자동 해제된다. timeout은 멈춘 CLI가
# credential lock을 무기한 점유하지 못하게 하고 TERM 뒤에도 남으면 5초 후 KILL한다.
exec timeout -k 5s "${command_timeout_seconds}s" "$@"
