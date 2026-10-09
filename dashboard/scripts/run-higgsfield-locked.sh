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
owner_token="$boot_id:$$:$self_start"

owner_is_alive() {
  local owner_file="$lock_dir/owner"
  local stored_boot stored_pid stored_start current_start lock_mtime now
  if [ ! -r "$owner_file" ]; then
    lock_mtime="$(stat -c %Y "$lock_dir" 2>/dev/null || echo 0)"
    now="$(date +%s)"
    [ $((now - lock_mtime)) -lt 5 ]
    return
  fi
  if ! IFS=: read -r stored_boot stored_pid stored_start < "$owner_file" \
      || ! [[ "$stored_pid" =~ ^[0-9]+$ ]]; then
    lock_mtime="$(stat -c %Y "$lock_dir" 2>/dev/null || echo 0)"
    now="$(date +%s)"
    [ $((now - lock_mtime)) -lt 5 ]
    return
  fi
  [ "$stored_boot" = "$boot_id" ] || return 1
  [ -r "/proc/$stored_pid/stat" ] || return 1
  current_start="$(awk '{print $22}' "/proc/$stored_pid/stat" 2>/dev/null || true)"
  [ -n "$current_start" ] && [ "$current_start" = "$stored_start" ]
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
  if [ "$current" = "$owner_token" ]; then
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

set +e
"$@" &
child_pid=$!
wait "$child_pid"
status=$?
set -e
child_pid=""
exit "$status"
