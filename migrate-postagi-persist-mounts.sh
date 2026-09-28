#!/bin/bash
# tenant2·3·4의 삭제된 checkout bind mount를 살아 있는 컨테이너에서 영속 루트로 1회 이전한다.
# 운영 서버에서 UID 1000 계정으로 명시 실행한다. gateway/dashboard 양쪽을 동결·대조하고,
# mount namespace holder가 graceful shutdown의 마지막 쓰기까지 보존한 뒤 기존 이미지로 재기동한다.

set -euo pipefail
cd "$(dirname "$0")"

PERSIST_ROOT="${OPENCLAW_PERSIST_ROOT:-${HOME}/openclaw-persist}"
RUNTIME_UID="1000"
MARKER="${PERSIST_ROOT}/.mount-v2-ready"
PENDING_MARKER="${PERSIST_ROOT}/.mount-v2-pending"
COMPOSE_FILE="docker-compose.postagi-4tenants.yml"
TENANT_SERVICES=(
  openclaw-gateway-tenant2 openclaw-dashboard-tenant2
  openclaw-gateway-tenant3 openclaw-dashboard-tenant3
  openclaw-gateway-tenant4 openclaw-dashboard-tenant4
)
RESUME_PENDING=0
case "${1:-}" in
  "") ;;
  --resume-pending) RESUME_PENDING=1 ;;
  *) echo "사용법: bash $0 [--resume-pending]" >&2; exit 2 ;;
esac

if [ "$(uname -s)" = "Linux" ] && [ "$(id -u)" != "$RUNTIME_UID" ]; then
  echo "오류: OpenClaw 런타임과 같은 UID 1000 계정으로 실행해야 합니다." >&2
  exit 1
fi
command -v docker >/dev/null 2>&1 || { echo "오류: docker CLI가 필요합니다." >&2; exit 1; }
if [ -e "$MARKER" ]; then
  echo "오류: 이전 표식이 이미 있습니다. 재실행하지 않습니다: $MARKER" >&2
  exit 1
fi
if [ -e "$PENDING_MARKER" ] && [ "$RESUME_PENDING" != "1" ]; then
  echo "오류: 이전 시도의 pending 표식이 있습니다. recovery 디렉터리와 상태를 먼저 점검하십시오: $PENDING_MARKER" >&2
  echo "health 장애를 해소한 뒤 bash $0 --resume-pending 으로 재검증하십시오." >&2
  exit 1
fi
if [ "$RESUME_PENDING" = "1" ] && [ ! -f "$PENDING_MARKER" ]; then
  echo "오류: 재개할 pending 표식이 없습니다: $PENDING_MARKER" >&2
  exit 1
fi

install -d -m 0750 "$PERSIST_ROOT"
if [ "$RESUME_PENDING" = "1" ]; then
  RECOVERY_ROOT="$(awk -F= '$1 == "recovery_root" { print $2 }' "$PENDING_MARKER")"
  case "$RECOVERY_ROOT" in
    "${PERSIST_ROOT}"/recovery-mount-v1-*) ;;
    *) echo "오류: pending 표식의 recovery_root가 영속 루트 밖이거나 유효하지 않습니다: $RECOVERY_ROOT" >&2; exit 1 ;;
  esac
  [ -d "$RECOVERY_ROOT" ] || { echo "오류: pending 표식의 recovery 자료가 없습니다: $RECOVERY_ROOT" >&2; exit 1; }
else
  RECOVERY_ROOT="${PERSIST_ROOT}/recovery-mount-v1-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  install -d -m 0700 "$RECOVERY_ROOT"
fi
STAGE="$(mktemp -d "${PERSIST_ROOT}/.mount-v2-stage.XXXXXX")"
MIGRATION_COMPLETE=0
PAUSE_ATTEMPTED=0
STOP_ATTEMPTED=0
WRITERS_STOPPED=0
running_before=()
holder_names=()
holder_controls=()

cleanup() {
  local holder container
  if [ "${#holder_names[@]}" -gt 0 ]; then
    for holder in "${holder_names[@]}"; do
      docker rm -f "$holder" >/dev/null 2>&1 || true
    done
  fi
  if [ "$PAUSE_ATTEMPTED" = "1" ] && [ "$WRITERS_STOPPED" != "1" ]; then
    echo "이전 실패: 아직 실행 중인 원본 컨테이너의 pause를 해제합니다." >&2
    for container in "${running_before[@]}"; do
      docker unpause "$container" >/dev/null 2>&1 || true
    done
  fi
  case "$STAGE" in
    "${PERSIST_ROOT}"/.mount-v2-stage.*) rm -rf "$STAGE" ;;
  esac
  if [ "$MIGRATION_COMPLETE" != "1" ]; then
    echo "이전 미완료: ready 표식은 만들지 않았습니다." >&2
    echo "복구 자료 보존: $RECOVERY_ROOT" >&2
    if [ "$STOP_ATTEMPTED" = "1" ]; then
      echo "중요: 삭제된 bind mount를 잃을 수 있으므로 원본 컨테이너에 docker start를 실행하지 마십시오." >&2
      echo "recovery 자료를 확인한 뒤 동일 커밋의 compose로 영속 경로 재기동을 완료하십시오." >&2
    fi
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

start_and_verify_cutover() {
  local attempt
  for attempt in 1 2; do
    if compose_no_build up -d --no-build --force-recreate --wait --wait-timeout 120 "${TENANT_SERVICES[@]}"; then
      return 0
    fi
    echo "경고: 기존 이미지의 새 영속 마운트 재기동과 health 확인이 실패했습니다. 동일 조건으로 1회 재시도합니다." >&2
  done
  return 1
}

publish_ready_marker() {
  sed 's/^status=pending-health$/status=ready/' "$PENDING_MARKER" > "${STAGE}/.mount-v2-ready"
  grep -qx 'status=ready' "${STAGE}/.mount-v2-ready" || {
    echo "오류: pending 표식을 ready 상태로 변환하지 못했습니다." >&2
    return 1
  }
  chmod 0600 "${STAGE}/.mount-v2-ready"
  mv "${STAGE}/.mount-v2-ready" "$MARKER"
  rm -f "$PENDING_MARKER"
}

if [ "$RESUME_PENDING" = "1" ]; then
  grep -qx 'schema=2' "$PENDING_MARKER" \
    && grep -qx 'source=mount-namespace-holder' "$PENDING_MARKER" \
    && grep -qx 'status=pending-health' "$PENDING_MARKER" || {
      echo "오류: 재개할 pending 표식의 schema/source/status가 유효하지 않습니다." >&2
      exit 1
    }
  for tenant in 2 3 4; do
    for kind in config data; do
      target="${PERSIST_ROOT}/${kind}-tenant${tenant}"
      [ -d "$target" ] && [ -n "$(find "$target" -mindepth 1 -print -quit)" ] || {
        echo "오류: pending 재개의 필수 영속 경로가 없거나 비었습니다: $target" >&2
        exit 1
      }
    done
    [ -s "${PERSIST_ROOT}/.env.tenant${tenant}" ] || {
      echo "오류: pending 재개의 환경파일이 없거나 비었습니다: ${PERSIST_ROOT}/.env.tenant${tenant}" >&2
      exit 1
    }
  done
  STOP_ATTEMPTED=1
  WRITERS_STOPPED=1
  if ! start_and_verify_cutover; then
    echo "오류: 재시도 후에도 health 확인에 실패했습니다. pending 표식을 유지합니다." >&2
    exit 1
  fi
  publish_ready_marker
  MIGRATION_COMPLETE=1
  echo "이전 재개 완료: 새 영속 마운트의 health를 확인하고 ready 표식을 공개했습니다."
  exit 0
fi

role_paths() {
  case "$1" in
    gateway) ROLE_CONFIG_PATH="/home/node/.openclaw"; ROLE_DATA_PATH="/home/node/data" ;;
    dashboard) ROLE_CONFIG_PATH="/app/config"; ROLE_DATA_PATH="/app/data" ;;
    *) echo "오류: 알 수 없는 역할입니다: $1" >&2; return 1 ;;
  esac
}

assert_nonempty_snapshot() {
  local phase="$1"
  local tenant="$2"
  local role="$3"
  local root="${RECOVERY_ROOT}/${phase}/tenant${tenant}/${role}"
  for kind in config data; do
    if [ -z "$(find "${root}/${kind}" -mindepth 1 -print -quit)" ]; then
      echo "오류: tenant${tenant} ${role} ${kind} ${phase} 스냅샷이 비었습니다." >&2
      return 1
    fi
  done
}

compare_pair() {
  local phase="$1"
  local tenant="$2"
  local tenant_root="${RECOVERY_ROOT}/${phase}/tenant${tenant}"
  local identity_file="${RECOVERY_ROOT}/mount-identities/tenant${tenant}.txt"
  local gateway_config_id dashboard_config_id gateway_data_id dashboard_data_id

  assert_nonempty_snapshot "$phase" "$tenant" gateway
  assert_nonempty_snapshot "$phase" "$tenant" dashboard
  gateway_config_id="$(awk -F= '$1 == "gateway_config" { print $2 }' "$identity_file")"
  dashboard_config_id="$(awk -F= '$1 == "dashboard_config" { print $2 }' "$identity_file")"
  gateway_data_id="$(awk -F= '$1 == "gateway_data" { print $2 }' "$identity_file")"
  dashboard_data_id="$(awk -F= '$1 == "dashboard_data" { print $2 }' "$identity_file")"
  if [ "$gateway_config_id" != "$dashboard_config_id" ] \
    || [ "$gateway_data_id" != "$dashboard_data_id" ] \
    || ! diff -qr "${tenant_root}/gateway" "${tenant_root}/dashboard" >/dev/null; then
    echo "오류: tenant${tenant} gateway/dashboard ${phase} 스냅샷이 다릅니다. 자동 병합하지 않습니다." >&2
    echo "양쪽 원본 보존: $tenant_root" >&2
    return 1
  fi
}

capture_mount_identities() {
  local tenant="$1"
  local role container identity_file
  identity_file="${RECOVERY_ROOT}/mount-identities/tenant${tenant}.txt"
  install -d -m 0700 "$(dirname "$identity_file")"
  : > "$identity_file"
  for role in gateway dashboard; do
    role_paths "$role"
    container="openclaw-${role}-tenant${tenant}"
    printf '%s_config=' "$role" >> "$identity_file"
    docker exec "$container" stat -c '%d:%i' "$ROLE_CONFIG_PATH" >> "$identity_file"
    printf '%s_data=' "$role" >> "$identity_file"
    docker exec "$container" stat -c '%d:%i' "$ROLE_DATA_PATH" >> "$identity_file"
  done
}

capture_frozen_snapshot() {
  local tenant="$1"
  local role container role_root
  for role in gateway dashboard; do
    role_paths "$role"
    container="openclaw-${role}-tenant${tenant}"
    role_root="${RECOVERY_ROOT}/frozen/tenant${tenant}/${role}"
    install -d -m 0700 "$role_root/config"
    install -d -m 0750 "$role_root/data"
    docker cp "${container}:${ROLE_CONFIG_PATH}/." "$role_root/config"
    docker cp "${container}:${ROLE_DATA_PATH}/." "$role_root/data"
  done
  compare_pair frozen "$tenant"
}

create_mount_holder() {
  local tenant="$1"
  local role="$2"
  local container pid holder control hold_path holder_script attempt
  role_paths "$role"
  container="openclaw-${role}-tenant${tenant}"
  pid="$(docker inspect --format '{{.State.Pid}}' "$container")"
  case "$pid" in
    ''|*[!0-9]*) echo "오류: $container PID를 확인하지 못했습니다: $pid" >&2; return 1 ;;
  esac
  [ "$pid" -gt 0 ] || { echo "오류: $container PID가 유효하지 않습니다." >&2; return 1; }

  holder="openclaw-mount-holder-${role}-tenant${tenant}-$$"
  control="${RECOVERY_ROOT}/holders/${role}-tenant${tenant}"
  hold_path="/tmp/openclaw-mount-hold-${role}-tenant${tenant}-$$"
  install -d -m 0700 "$control"
  holder_script="$(cat <<EOF
set -eu
exec 3>/control/config.tar
exec 4>/control/data.tar
exec 5>/control/ready
exec nsenter -t ${pid} -m -r/proc/${pid}/root -w/ /bin/sh -c '
set -eu
hold=${hold_path}
rm -rf "\$hold"
mkdir -p "\$hold/config" "\$hold/data"
mount --bind "${ROLE_CONFIG_PATH}" "\$hold/config"
mount --bind "${ROLE_DATA_PATH}" "\$hold/data"
printf ready >&5
trap "tar -cf - -C \"\$hold/config\" . >&3; tar -cf - -C \"\$hold/data\" . >&4; exit 0" USR1
trap "exit 2" TERM INT
while :; do sleep 1; done
'
EOF
)"
  docker run -d --pull=never \
    --name "$holder" \
    --privileged \
    --pid=host \
    -v "${control}:/control" \
    alpine:3 sh -c "$holder_script" >/dev/null
  holder_names+=("$holder")
  holder_controls+=("$control")

  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    [ -s "$control/ready" ] && return 0
    sleep 1
  done
  echo "오류: mount holder가 준비되지 않았습니다: $holder" >&2
  docker logs "$holder" >&2 || true
  return 1
}

archive_holders() {
  local index holder control role_tenant role tenant target exit_code attempt
  for holder in "${holder_names[@]}"; do
    docker kill --signal USR1 "$holder" >/dev/null
  done
  for index in "${!holder_names[@]}"; do
    holder="${holder_names[$index]}"
    control="${holder_controls[$index]}"
    for attempt in 1 2 3 4 5 6 7 8 9 10; do
      [ "$(docker inspect --format '{{.State.Running}}' "$holder")" = "false" ] && break
      sleep 1
    done
    if [ "$(docker inspect --format '{{.State.Running}}' "$holder")" != "false" ]; then
      echo "오류: mount holder가 종료되지 않았습니다: $holder" >&2
      return 1
    fi
    exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$holder")"
    [ "$exit_code" = "0" ] || { echo "오류: mount holder 종료 코드가 0이 아닙니다: $holder=$exit_code" >&2; return 1; }
    [ -s "$control/config.tar" ] && [ -s "$control/data.tar" ] || {
      echo "오류: mount holder 최종 아카이브가 비었습니다: $holder" >&2
      return 1
    }
    role_tenant="${holder#openclaw-mount-holder-}"
    role_tenant="${role_tenant%-$$}"
    role="${role_tenant%%-tenant*}"
    tenant="${role_tenant##*-tenant}"
    target="${RECOVERY_ROOT}/final/tenant${tenant}/${role}"
    install -d -m 0700 "$target/config"
    install -d -m 0750 "$target/data"
    tar -xf "$control/config.tar" -C "$target/config"
    tar -xf "$control/data.tar" -C "$target/data"
  done
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

  for role in gateway dashboard; do
    container="openclaw-${role}-tenant${tenant}"
    docker inspect "$container" >/dev/null 2>&1 || {
      echo "오류: 이전 원본 컨테이너가 없습니다: $container" >&2
      exit 1
    }
    if [ "$(docker inspect --format '{{.State.Running}}' "$container")" != "true" ]; then
      echo "오류: 삭제된 bind mount를 회수하려면 컨테이너가 실행 중이어야 합니다: $container" >&2
      echo "이미 정지됐다면 자동 회수하지 말고 기존 영속 백업에서 복원하십시오." >&2
      exit 1
    fi
    docker exec "$container" sh -c 'command -v mount >/dev/null && command -v tar >/dev/null' || {
      echo "오류: $container 안에 mount와 tar가 모두 있어야 안전한 최종 스냅샷을 만들 수 있습니다." >&2
      exit 1
    }
    docker inspect --format '{{.Id}}' "$container" > "${STAGE}/${role}-tenant${tenant}.container-id"
    running_before+=("$container")
  done
  capture_mount_identities "$tenant"
done

# holder helper image는 중단 전에 확보한다. cutover 중 네트워크 pull을 시도하지 않는다.
docker image inspect alpine:3 >/dev/null 2>&1 || docker pull alpine:3 >/dev/null

# 긴 중단 전에 현재 compose가 기존 이미지로 새 영속 경로를 해석할 수 있는지 먼저 검증한다.
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
  for role in gateway dashboard; do
    container="openclaw-${role}-tenant${tenant}"
    expected_id="$(tr -d '\n' < "${STAGE}/${role}-tenant${tenant}.container-id")"
    actual_id="$(docker inspect --format '{{.Id}}' "$container")"
    if [ "$actual_id" != "$expected_id" ] || [ "$(docker inspect --format '{{.State.Paused}}' "$container")" != "true" ]; then
      echo "오류: preflight 뒤 원본 컨테이너가 교체됐거나 pause되지 않았습니다: $container" >&2
      exit 1
    fi
  done
done
for tenant in 2 3 4; do
  capture_frozen_snapshot "$tenant"
done

# 원본 mount namespace 안에 추가 bind를 잡아, docker stop이 원래 mount를 해제해도 마지막 쓰기를 보존한다.
for tenant in 2 3 4; do
  create_mount_holder "$tenant" gateway
  create_mount_holder "$tenant" dashboard
done

# paused 상태에서 stop을 요청하면 Docker가 프로세스를 재개해 TERM을 전달한다. writer별 종료는 병렬로 기다린다.
STOP_ATTEMPTED=1
stop_pids=()
stop_failed=0
for container in "${running_before[@]}"; do
  docker stop --timeout 30 "$container" >/dev/null &
  stop_pids+=("$!")
done
for stop_pid in "${stop_pids[@]}"; do
  if ! wait "$stop_pid"; then
    stop_failed=1
  fi
done
for container in "${running_before[@]}"; do
  if [ "$(docker inspect --format '{{.State.ExitCode}}' "$container")" = "137" ]; then
    echo "오류: $container 가 grace period 안에 종료되지 않아 SIGKILL됐습니다." >&2
    stop_failed=1
  fi
done

# holder의 추가 bind에서 graceful shutdown 최종 상태를 아카이브한다.
archive_holders
if [ "$stop_failed" = "1" ]; then
  echo "오류: 원본 컨테이너 일부가 정상 종료되지 않았습니다. 자동 cutover를 중단합니다." >&2
  exit 1
fi
WRITERS_STOPPED=1
PAUSE_ATTEMPTED=0
for tenant in 2 3 4; do
  compare_pair final "$tenant"
done

BACKUP_ROOT="${PERSIST_ROOT}/backup-mount-v1-$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 0700 "$BACKUP_ROOT"
for tenant in 2 3 4; do
  for kind in config data; do
    target="${PERSIST_ROOT}/${kind}-tenant${tenant}"
    [ ! -e "$target" ] || mv "$target" "$BACKUP_ROOT/"
    if [ "$kind" = "config" ]; then
      install -d -m 0700 "$target"
    else
      install -d -m 0750 "$target"
    fi
    cp -a "${RECOVERY_ROOT}/final/tenant${tenant}/gateway/${kind}/." "$target"
  done
  chmod 0700 "${PERSIST_ROOT}/config-tenant${tenant}"
  chmod 0750 "${PERSIST_ROOT}/data-tenant${tenant}"
  mv "${STAGE}/.env.tenant${tenant}" "${PERSIST_ROOT}/.env.tenant${tenant}"
done

{
  echo "schema=2"
  echo "source=mount-namespace-holder"
  echo "status=pending-health"
  echo "recovery_root=$RECOVERY_ROOT"
  for tenant in 2 3 4; do
    printf 'tenant%s_gateway_container=' "$tenant"
    tr -d '\n' < "${STAGE}/gateway-tenant${tenant}.container-id"
    echo
    printf 'tenant%s_dashboard_container=' "$tenant"
    tr -d '\n' < "${STAGE}/dashboard-tenant${tenant}.container-id"
    echo
  done
} > "${STAGE}/.mount-v2-pending"
chmod 0600 "${STAGE}/.mount-v2-pending"
mv "${STAGE}/.mount-v2-pending" "$PENDING_MARKER"

if ! start_and_verify_cutover; then
  echo "오류: 재시도 후에도 health 확인에 실패했습니다. ready 표식은 만들지 않습니다." >&2
  echo "pending 표식: $PENDING_MARKER" >&2
  echo "복구 자료: $RECOVERY_ROOT" >&2
  echo "health 장애 해소 후 재개: bash $0 --resume-pending" >&2
  exit 1
fi

publish_ready_marker
MIGRATION_COMPLETE=1

echo "이전 완료: $PERSIST_ROOT"
echo "이전 전 frozen 및 최종 대조본: $RECOVERY_ROOT"
echo "기존 target 백업: $BACKUP_ROOT"
echo "tenant2·3·4는 기존 이미지와 새 영속 마운트로 health 확인 후 재기동됐습니다."
