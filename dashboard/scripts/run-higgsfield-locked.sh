#!/usr/bin/env bash

set -euo pipefail

lock_dir="${HIGGSFIELD_LOCK_DIR:-/root/.config/higgsfield/.cli.lock.d}"
wait_seconds="${HIGGSFIELD_LOCK_WAIT_SECONDS:-45}"
if ! [[ "$wait_seconds" =~ ^[0-9]+$ ]] || [ "$wait_seconds" -lt 1 ] || [ "$wait_seconds" -gt 300 ]; then
  wait_seconds=45
fi
if [ "$#" -lt 1 ]; then
  echo "usage: run-higgsfield-locked.sh <command> [args...]" >&2
  exit 64
fi

umask 077
mkdir -p "$(dirname "$lock_dir")"
boot_id="$(sed -n '1p' /proc/sys/kernel/random/boot_id 2>/dev/null || echo unknown-boot)"
self_start="$(awk '{print $22}' "/proc/$$/stat" 2>/dev/null || echo unknown-start)"
owner_prefix="$boot_id:$$:$self_start"
owner_token="$owner_prefix"

process_matches() {
  local pid="$1"
  local expected_start="$2"
  local current_start
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  [ -n "$expected_start" ] && [ "$expected_start" != "unknown-start" ] || return 1
  [ -r "/proc/$pid/stat" ] || return 1
  current_start="$(awk '{print $22}' "/proc/$pid/stat" 2>/dev/null || true)"
  [ -n "$current_start" ] && [ "$current_start" = "$expected_start" ]
}

owner_is_alive() {
  local owner_file="$lock_dir/owner"
  local stored_boot stored_pid stored_start stored_child_pid stored_child_start lock_mtime now
  if [ ! -r "$owner_file" ]; then
    lock_mtime="$(stat -c %Y "$lock_dir" 2>/dev/null || echo 0)"
    now="$(date +%s)"
    [ $((now - lock_mtime)) -lt 5 ]
    return
  fi
  if ! IFS=: read -r stored_boot stored_pid stored_start stored_child_pid stored_child_start < "$owner_file" \
      || ! [[ "$stored_pid" =~ ^[0-9]+$ ]]; then
    lock_mtime="$(stat -c %Y "$lock_dir" 2>/dev/null || echo 0)"
    now="$(date +%s)"
    [ $((now - lock_mtime)) -lt 5 ]
    return
  fi
  [ "$stored_boot" = "$boot_id" ] || return 1
  process_matches "$stored_pid" "$stored_start" && return 0
  process_matches "${stored_child_pid:-}" "${stored_child_start:-}" && return 0
  # fork 직후 child가 owner metadata를 원자 교체하기 전에 wrapper가 SIGKILL될 수 있다.
  # 초기 3-field owner만 남은 짧은 구간은 살아 있다고 보고 조기 탈취를 막는다.
  if [ -z "${stored_child_pid:-}" ]; then
    lock_mtime="$(stat -c %Y "$owner_file" 2>/dev/null || echo 0)"
    now="$(date +%s)"
    [ $((now - lock_mtime)) -lt 5 ]
    return
  fi
  return 1
}

acquired=no
if mkdir "$lock_dir" 2>/dev/null; then
  acquired=yes
else
  for _attempt in $(seq 1 "$wait_seconds"); do
    if ! owner_is_alive; then
      stale_dir="$lock_dir.stale.$$"
      if mv "$lock_dir" "$stale_dir" 2>/dev/null; then
        rm -f "$stale_dir/owner"
        rmdir "$stale_dir" 2>/dev/null || true
      fi
    fi
    if mkdir "$lock_dir" 2>/dev/null; then
      acquired=yes
      break
    fi
    sleep 1
  done
fi

if [ "$acquired" != "yes" ]; then
  echo "Higgsfield credential lock timeout" >&2
  exit 75
fi
printf '%s\n' "$owner_token" > "$lock_dir/owner"
chmod 600 "$lock_dir/owner"

child_pid=""
release_lock() {
  local current=""
  if [ -r "$lock_dir/owner" ]; then
    IFS= read -r current < "$lock_dir/owner" || true
  fi
  if [ "$current" = "$owner_token" ] || [[ "$current" == "$owner_prefix:"* ]]; then
    rm -f "$lock_dir/owner"
    rmdir "$lock_dir" 2>/dev/null || true
  fi
}
forward_signal() {
  if [ -n "$child_pid" ]; then
    kill -TERM "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  release_lock
  exit 143
}
trap release_lock EXIT
trap forward_signal HUP INT TERM

run_child() {
  local owned_child_pid="$BASHPID"
  local owned_child_start child_token owner_tmp
  owned_child_start="$(awk '{print $22}' "/proc/$owned_child_pid/stat" 2>/dev/null || echo unknown-start)"
  child_token="$owner_prefix:$owned_child_pid:$owned_child_start"
  owner_tmp="$lock_dir/.owner.$owned_child_pid"
  printf '%s\n' "$child_token" > "$owner_tmp"
  chmod 600 "$owner_tmp"
  mv -f "$owner_tmp" "$lock_dir/owner"
  exec "$@"
}

set +e
run_child "$@" &
child_pid=$!
wait "$child_pid"
status=$?
set -e
child_pid=""
exit "$status"
