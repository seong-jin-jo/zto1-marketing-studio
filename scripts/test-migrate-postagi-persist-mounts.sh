#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/migrate-postagi-persist-mounts.sh"
[ "$(wc -l < "$SCRIPT" | tr -d ' ')" -le 50 ] || { echo "FAIL: migration script exceeds 50 lines"; exit 1; }

run_case() {
  local mode="$1" tmp checkout persist bin real_rsync rc=0
  tmp="$(mktemp -d)"; checkout="$tmp/checkout"; persist="$tmp/persist"; bin="$tmp/bin"
  mkdir -p "$checkout" "$persist" "$bin"
  cp "$SCRIPT" "$checkout/"; printf 'services: {}\n' > "$checkout/docker-compose.postagi-4tenants.yml"
  for tenant in 2 3 4; do
    printf 'TOKEN=test\n' > "$persist/.env.tenant${tenant}"
    for kind in config data; do
      mkdir -p "$checkout/${kind}-tenant${tenant}" "$persist/${kind}-tenant${tenant}"
      printf 'new-%s-%s\n' "$kind" "$tenant" > "$checkout/${kind}-tenant${tenant}/state"
      printf 'old-%s-%s\n' "$kind" "$tenant" > "$persist/${kind}-tenant${tenant}/state"
    done
  done
  real_rsync="$(command -v rsync)"
  printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "$FAKE_DOCKER_LOG"\nexit 0\n' > "$bin/docker"
  printf '#!/bin/sh\ncase "$*" in *"$FAIL_RSYNC_SOURCE"*) exit 42;; esac\nexec "%s" "$@"\n' "$real_rsync" > "$bin/rsync"
  chmod +x "$bin/docker" "$bin/rsync"
  if [ "$mode" = failure ]; then export FAIL_RSYNC_SOURCE="$checkout/data-tenant3/"; else export FAIL_RSYNC_SOURCE=/never; fi
  (cd "$checkout" && PATH="$bin:$PATH" OPENCLAW_CHECKOUT_ROOT="$checkout" OPENCLAW_PERSIST_ROOT="$persist" FAKE_DOCKER_LOG="$tmp/docker.log" bash ./migrate-postagi-persist-mounts.sh) >"$tmp/out" 2>"$tmp/err" || rc=$?
  if [ "$mode" = success ]; then
    [ "$rc" -eq 0 ] && grep -qx 'new-config-2' "$persist/config-tenant2/state" && grep -Rqx 'old-config-2' "$persist"/backup-pre-cutover-*'/config-tenant2/state'
    grep -q 'stop -t 30' "$tmp/docker.log" && grep -q 'up -d --no-build --force-recreate --wait --wait-timeout 60' "$tmp/docker.log"
    echo "PASS: success copies six targets, preserves timestamp backup, and restarts healthy services"
  else
    [ "$rc" -eq 42 ] && ! grep -q 'up -d' "$tmp/docker.log" && grep -q '복구 방법' "$tmp/err" && grep -q 'stop -t 30' "$tmp/err" && grep -q 'rsync -a --delete' "$tmp/err"
    for tenant in 2 3 4; do for kind in config data; do grep -qx "old-$kind-$tenant" "$persist"/backup-pre-cutover-*"/$kind-tenant$tenant/state"; done; done
    echo "PASS: injected mid-copy failure exits immediately and prints recovery without restart"
  fi
  rm -rf "$tmp"
}

run_case success
run_case failure
