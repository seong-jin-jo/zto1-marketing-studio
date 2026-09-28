#!/bin/bash
# tenant2·3·4의 삭제된 checkout bind mount를 살아 있는 컨테이너에서 영속 루트로 1회 이전한다.
# 운영 서버에서 UID 1000 계정으로 명시 실행한다. 실행 중인 양쪽 writer를 동결·대조하고,
# graceful stop 뒤 최종 스냅샷을 복사한 다음 기존 이미지로 새 마운트를 즉시 재기동한다.

set -euo pipefail
cd "$(dirname "$0")"

PERSIST_ROOT="${OPENCLAW_PERSIST_ROOT:-${HOME}/openclaw-persist}"
RUNTIME_UID="1000"
MARKER="${PERSIST_ROOT}/.mount-v2-ready"
COMPOSE_FILE="docker-compose.postagi-4tenants.yml"
TENANT_SERVICES=(
  openclaw-gateway-tenant2 openclaw-dashboard-tenant2
  openclaw-gateway-tenant3 openclaw-dashboard-tenant3
  openclaw-gateway-tenant4 openclaw-dashboard-tenant4
)

if [ "$(uname -s)" = "Linux" ] && [ "$(id -u)" != "$RUNTIME_UID" ]; then
  echo "오류: OpenClaw 런타임과 같은 UID 1000 계정으로 실행해야 합니다." >&2
  exit 1
fi
command -v docker >/dev/null 2>&1 || { echo "오류: docker CLI가 필요합니다." >&2; exit 1; }
if [ -e "$MARKER" ]; then
  echo "오류: 이전 표식이 이미 있습니다. 재실행하지 않습니다: $MARKER" >&2
  exit 1
fi

install -d -m 0750 "$PERSIST_ROOT"
STAGE="$(mktemp -d "${PERSIST_ROOT}/.mount-v2-stage.XXXXXX")"
MIGRATION_COMPLETE=0
PERSIST_COMMITTED=0
PAUSE_ATTEMPTED=0
STOP_ATTEMPTED=0
running_before=()

cleanup() {
  case "$STAGE" in
    "${PERSIST_ROOT}"/.mount-v2-stage.*) rm -rf "$STAGE" ;;
  esac
  if [ "$PERSIST_COMMITTED" != "1" ] && [ -f "$MARKER" ]; then
    rm -f "$MARKER"
  fi
  if [ "$PAUSE_ATTEMPTED" = "1" ] && [ "$MIGRATION_COMPLETE" != "1" ]; then
    echo "이전 실패: 동결했던 컨테이너를 다시 실행 상태로 돌립니다." >&2
    for container in "${running_before[@]}"; do
      docker unpause "$container" >/dev/null 2>&1 || true
    done
  fi
  if [ "$STOP_ATTEMPTED" = "1" ] && [ "$PERSIST_COMMITTED" != "1" ]; then
    echo "이전 실패: 원래 실행 중이던 컨테이너를 복구합니다." >&2
    for container in "${running_before[@]}"; do
      docker start "$container" >/dev/null 2>&1 || true
    done
  fi
}
trap cleanup EXIT

docker_gid="${DOCKER_GID:-$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock)}"
compose_with_root() {
  local compose_root="$1"
  shift
  env \
    OPENCLAW_PERSIST_ROOT="$compose_root" \
    DOCKER_GID="$docker_gid" \
    NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://migration.invalid}" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-migration-no-build}" \
    docker compose -f "$COMPOSE_FILE" "$@"
}
compose_no_build() {
  compose_with_root "$PERSIST_ROOT" "$@"
}

preserve_divergence() {
  local phase="$1"
  local tenant="$2"
  local tenant_stage="$3"
  local recovery_root
  recovery_root="${PERSIST_ROOT}/recovery-divergent-${phase}-tenant${tenant}-$(date -u +%Y%m%dT%H%M%SZ)"
  install -d -m 0700 "$recovery_root"
  mv "$tenant_stage/gateway" "$recovery_root/gateway"
  mv "$tenant_stage/dashboard" "$recovery_root/dashboard"
  cp "$tenant_stage/mount-identities.txt" "$recovery_root/mount-identities.txt"
  echo "오류: tenant${tenant} gateway/dashboard 스냅샷이 다릅니다. 자동 병합하지 않습니다." >&2
  echo "양쪽 원본 보존: $recovery_root" >&2
}

snapshot_and_compare() {
  local phase="$1"
  local tenant="$2"
  local tenant_stage="${STAGE}/${phase}/tenant${tenant}"
  local gateway="openclaw-gateway-tenant${tenant}"
  local dashboard="openclaw-dashboard-tenant${tenant}"
  local role container config_path data_path gateway_stage dashboard_stage
  local gateway_config_id dashboard_config_id gateway_data_id dashboard_data_id

  gateway_stage="${tenant_stage}/gateway"
  dashboard_stage="${tenant_stage}/dashboard"
  install -d -m 0700 "$gateway_stage/config" "$dashboard_stage/config"
  install -d -m 0750 "$gateway_stage/data" "$dashboard_stage/data"
  if [ "$phase" = "frozen" ]; then
    : > "$tenant_stage/mount-identities.txt"
  else
    cp "${STAGE}/frozen/tenant${tenant}/mount-identities.txt" "$tenant_stage/mount-identities.txt"
  fi

  for role in gateway dashboard; do
    if [ "$role" = "gateway" ]; then
      container="$gateway"
      config_path="/home/node/.openclaw"
      data_path="/home/node/data"
    else
      container="$dashboard"
      config_path="/app/config"
      data_path="/app/data"
    fi
    if [ "$phase" = "frozen" ]; then
      printf '%s_config=' "$role" >> "$tenant_stage/mount-identities.txt"
      docker exec "$container" stat -c '%d:%i' "$config_path" >> "$tenant_stage/mount-identities.txt"
      printf '%s_data=' "$role" >> "$tenant_stage/mount-identities.txt"
      docker exec "$container" stat -c '%d:%i' "$data_path" >> "$tenant_stage/mount-identities.txt"
    fi
    docker cp "${container}:${config_path}/." "${tenant_stage}/${role}/config"
    docker cp "${container}:${data_path}/." "${tenant_stage}/${role}/data"
  done

  for role in gateway dashboard; do
    [ -n "$(find "${tenant_stage}/${role}/config" -mindepth 1 -print -quit)" ] || {
      echo "오류: tenant${tenant} ${role} config 스냅샷이 비었습니다." >&2
      return 1
    }
    [ -n "$(find "${tenant_stage}/${role}/data" -mindepth 1 -print -quit)" ] || {
      echo "오류: tenant${tenant} ${role} data 스냅샷이 비었습니다." >&2
      return 1
    }
  done

  gateway_config_id="$(awk -F= '$1 == "gateway_config" { print $2 }' "$tenant_stage/mount-identities.txt")"
  dashboard_config_id="$(awk -F= '$1 == "dashboard_config" { print $2 }' "$tenant_stage/mount-identities.txt")"
  gateway_data_id="$(awk -F= '$1 == "gateway_data" { print $2 }' "$tenant_stage/mount-identities.txt")"
  dashboard_data_id="$(awk -F= '$1 == "dashboard_data" { print $2 }' "$tenant_stage/mount-identities.txt")"
  if [ "$gateway_config_id" != "$dashboard_config_id" ] \
    || [ "$gateway_data_id" != "$dashboard_data_id" ] \
    || ! diff -qr "$gateway_stage" "$dashboard_stage" >/dev/null; then
    preserve_divergence "$phase" "$tenant" "$tenant_stage"
    return 1
  fi
}

for tenant in 2 3 4; do
  if [ -s "${PERSIST_ROOT}/.env.tenant${tenant}" ]; then
    cp -p "${PERSIST_ROOT}/.env.tenant${tenant}" "${STAGE}/.env.tenant${tenant}"
  elif [ -s ".env.tenant${tenant}" ]; then
    cp -p ".env.tenant${tenant}" "${STAGE}/.env.tenant${tenant}"
  else
    echo "오류: tenant${tenant} 환경파일을 checkout 또는 영속 루트에서 찾지 못했습니다." >&2
    exit 1
  fi
  chmod 0600 "${STAGE}/.env.tenant${tenant}"

  for kind in gateway dashboard; do
    container="openclaw-${kind}-tenant${tenant}"
    docker inspect "$container" >/dev/null 2>&1 || {
      echo "오류: 이전 원본 컨테이너가 없습니다: $container" >&2
      exit 1
    }
    if [ "$(docker inspect --format '{{.State.Running}}' "$container")" != "true" ]; then
      echo "오류: 삭제된 bind mount를 회수하려면 컨테이너가 실행 중이어야 합니다: $container" >&2
      echo "이미 정지됐다면 자동 회수하지 말고 기존 영속 백업에서 복원하십시오." >&2
      exit 1
    fi
    docker inspect --format '{{.Id}}' "$container" > "${STAGE}/${kind}-tenant${tenant}.container-id"
    running_before+=("$container")
  done
done

# 긴 중단 전에 현재 compose가 기존 이미지로 새 영속 경로를 해석할 수 있는지 먼저 검증한다.
# 실제 영속 루트는 아직 확정 전이므로 stage 안에 같은 구조를 만들어 preflight만 수행한다.
PREFLIGHT_ROOT="${STAGE}/preflight-root"
for tenant in 2 3 4; do
  install -d -m 0700 "${PREFLIGHT_ROOT}/config-tenant${tenant}"
  install -d -m 0750 "${PREFLIGHT_ROOT}/data-tenant${tenant}"
  cp -p "${STAGE}/.env.tenant${tenant}" "${PREFLIGHT_ROOT}/.env.tenant${tenant}"
done
compose_with_root "$PREFLIGHT_ROOT" config --quiet

echo "tenant2·3·4 gateway/dashboard 쓰기를 pause로 동결하고 양쪽 mount를 대조합니다."
PAUSE_ATTEMPTED=1
for container in "${running_before[@]}"; do
  docker pause "$container" >/dev/null
done
for tenant in 2 3 4; do
  snapshot_and_compare frozen "$tenant"
done

# docker stop은 paused 컨테이너에 TERM을 전달하고 실행을 재개해 graceful shutdown을 수행한다.
# stop을 먼저 요청하므로 snapshot 뒤 정상 트래픽 처리 창이 다시 열리지 않는다.
STOP_ATTEMPTED=1
stop_pids=()
for container in "${running_before[@]}"; do
  docker stop --timeout 30 "$container" >/dev/null &
  stop_pids+=("$!")
done
for stop_pid in "${stop_pids[@]}"; do
  wait "$stop_pid"
done
PAUSE_ATTEMPTED=0

# 종료 처리에서 마지막 파일을 쓸 수 있으므로 stopped 컨테이너에서 다시 복사한 것이 최종본이다.
for tenant in 2 3 4; do
  snapshot_and_compare final "$tenant"
done

BACKUP_ROOT="${PERSIST_ROOT}/backup-mount-v1-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$BACKUP_ROOT"
for tenant in 2 3 4; do
  for kind in config data; do
    target="${PERSIST_ROOT}/${kind}-tenant${tenant}"
    [ ! -e "$target" ] || mv "$target" "$BACKUP_ROOT/"
    mv "${STAGE}/final/tenant${tenant}/gateway/${kind}" "$target"
  done
  mv "${STAGE}/.env.tenant${tenant}" "${PERSIST_ROOT}/.env.tenant${tenant}"
done

{
  echo "schema=2"
  echo "source=paused-container-copy"
  for tenant in 2 3 4; do
    printf 'tenant%s_gateway_container=' "$tenant"
    tr -d '\n' < "${STAGE}/gateway-tenant${tenant}.container-id"
    echo
    printf 'tenant%s_dashboard_container=' "$tenant"
    tr -d '\n' < "${STAGE}/dashboard-tenant${tenant}.container-id"
    echo
  done
} > "${STAGE}/.mount-v2-ready"
chmod 0600 "${STAGE}/.mount-v2-ready"
mv "${STAGE}/.mount-v2-ready" "$MARKER"
PERSIST_COMMITTED=1

if ! compose_no_build up -d --no-build --force-recreate --wait --wait-timeout 120 "${TENANT_SERVICES[@]}"; then
  echo "오류: 기존 이미지로 새 영속 마운트 재기동에 실패했습니다. 동일 이미지로 자동 복구를 시도합니다." >&2
  compose_no_build up -d --no-build --force-recreate "${TENANT_SERVICES[@]}" >/dev/null 2>&1 || true
  exit 1
fi

MIGRATION_COMPLETE=1
echo "이전 완료: $PERSIST_ROOT"
echo "이전 영속 경로 백업: $BACKUP_ROOT"
echo "tenant2·3·4는 기존 이미지와 새 영속 마운트로 건강 상태 확인 후 재기동됐습니다."
