#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"

PERSIST_ROOT="${OPENCLAW_PERSIST_ROOT:-${HOME}/openclaw-persist}"
SOURCE_ROOT="${OPENCLAW_CHECKOUT_ROOT:-$PWD}"
COMPOSE=docker-compose.postagi-4tenants.yml
SERVICES=(openclaw-gateway-tenant2 openclaw-dashboard-tenant2 openclaw-gateway-tenant3 openclaw-dashboard-tenant3 openclaw-gateway-tenant4 openclaw-dashboard-tenant4)
TARGETS=(config-tenant2 data-tenant2 config-tenant3 data-tenant3 config-tenant4 data-tenant4)
STOPPED=0; BACKUPS_READY=0; BACKUP_ROOT=""

on_error() {
  local rc=$?
  echo "이전 실패(exit $rc). 추가 작업을 중단했습니다." >&2
  if [ "$STOPPED" = 1 ]; then
    echo "복구 방법:" >&2
    echo "OPENCLAW_PERSIST_ROOT=\"$PERSIST_ROOT\" docker compose -f \"$COMPOSE\" stop -t 30 ${SERVICES[*]}" >&2
    if [ "$BACKUPS_READY" = 1 ]; then
      echo "for name in ${TARGETS[*]}; do if [ -d \"$BACKUP_ROOT/\$name\" ]; then rsync -a --delete \"$BACKUP_ROOT/\$name/\" \"$PERSIST_ROOT/\$name/\"; else rm -rf \"$PERSIST_ROOT/\$name\"; fi; done" >&2
    fi
    echo "OPENCLAW_PERSIST_ROOT=\"$PERSIST_ROOT\" docker compose -f \"$COMPOSE\" up -d --no-build --force-recreate --wait --wait-timeout 60 ${SERVICES[*]}" >&2
  fi
  exit "$rc"
}
trap on_error ERR
command -v docker >/dev/null; command -v rsync >/dev/null
case "$PERSIST_ROOT" in ""|/) echo "안전하지 않은 영속 루트: $PERSIST_ROOT" >&2; exit 1;; esac
[ "$(uname -s)" != Linux ] || [ "$(id -u)" = 1000 ] || { echo "Linux에서는 UID 1000 운영 계정으로 실행하십시오." >&2; exit 1; }
for name in "${TARGETS[@]}"; do [ -d "$SOURCE_ROOT/$name" ] || { echo "원본 누락: $SOURCE_ROOT/$name" >&2; exit 1; }; done
for tenant in 2 3 4; do [ -s "$PERSIST_ROOT/.env.tenant$tenant" ] || { echo "환경파일 누락: $PERSIST_ROOT/.env.tenant$tenant" >&2; exit 1; }; done
mkdir -p "$PERSIST_ROOT"
BACKUP_ROOT="$(mktemp -d "$PERSIST_ROOT/backup-pre-cutover-$(date +%Y%m%d-%H%M%S).XXXXXX")"
STOPPED=1; docker compose -f "$COMPOSE" stop -t 30 "${SERVICES[@]}"
for name in "${TARGETS[@]}"; do [ ! -d "$PERSIST_ROOT/$name" ] || { mkdir -p "$BACKUP_ROOT/$name"; rsync -a "$PERSIST_ROOT/$name/" "$BACKUP_ROOT/$name/"; }; done
BACKUPS_READY=1
for name in "${TARGETS[@]}"; do mkdir -p "$PERSIST_ROOT/$name"; rsync -a --delete "$SOURCE_ROOT/$name/" "$PERSIST_ROOT/$name/"; case "$name" in config-*) chmod 0700 "$PERSIST_ROOT/$name";; *) chmod 0750 "$PERSIST_ROOT/$name";; esac; done
OPENCLAW_PERSIST_ROOT="$PERSIST_ROOT" docker compose -f "$COMPOSE" up -d --no-build --force-recreate --wait --wait-timeout 60 "${SERVICES[@]}"
STOPPED=0; trap - ERR
echo "이전 완료. 백업: $BACKUP_ROOT"
