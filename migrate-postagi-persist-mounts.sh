#!/bin/bash
# tenant2·3·4의 삭제된 checkout bind mount를 영속 루트로 1회 이전한다.
# holder와 원자적 journal을 사용해 어느 중단 지점에서도 같은 명령으로 재개한다.

set -euo pipefail
cd "$(dirname "$0")"

PERSIST_ROOT="${OPENCLAW_PERSIST_ROOT:-${HOME}/openclaw-persist}"
RUNTIME_UID="1000"
MARKER="${PERSIST_ROOT}/.mount-v2-ready"
PENDING_MARKER="${PERSIST_ROOT}/.mount-v2-pending"
COMPOSE_FILE="docker-compose.postagi-4tenants.yml"
TENANT_SERVICES=(openclaw-gateway-tenant2 openclaw-dashboard-tenant2 openclaw-gateway-tenant3 openclaw-dashboard-tenant3 openclaw-gateway-tenant4 openclaw-dashboard-tenant4)
TARGETS=(config-tenant2 data-tenant2 config-tenant3 data-tenant3 config-tenant4 data-tenant4)

case "${1:-}" in ""|--resume-pending) ;; *) echo "사용법: bash $0 [--resume-pending]" >&2; exit 2 ;; esac
if [ "$(uname -s)" = "Linux" ] && [ "$(id -u)" != "$RUNTIME_UID" ]; then
  echo "오류: OpenClaw 런타임과 같은 UID 1000 계정으로 실행해야 합니다." >&2; exit 1
fi
command -v docker >/dev/null 2>&1 || { echo "오류: docker CLI가 필요합니다." >&2; exit 1; }
install -d -m 0750 "$PERSIST_ROOT"
[ ! -e "$MARKER" ] || { echo "오류: 이전 표식이 이미 있습니다. 재실행하지 않습니다: $MARKER" >&2; exit 1; }

RESUMING=0 MIGRATION_COMPLETE=0 PAUSE_ATTEMPTED=0 WRITERS_STOPPED=0
ARCHIVES_VALIDATED=0 HOLDERS_RELEASED=0 CURRENT_PHASE="" INSTALLED_TARGETS=""
running_before=() holder_names=() holder_controls=()

journal_value() { awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$PENDING_MARKER"; }
assert_persist_child() { case "$1" in "${PERSIST_ROOT}"/*) ;; *) echo "오류: 영속 루트 밖 경로를 거부합니다: $1" >&2; return 1 ;; esac; }
write_journal() {
  local phase="$1" installed="${2:-$INSTALLED_TARGETS}" temp="${PENDING_MARKER}.tmp.$$"
  {
    echo schema=2
    echo source=mount-namespace-holder
    if [ "$phase" = pending-health ]; then echo status=pending-health; else echo status=in-progress; fi
    echo "phase=$phase"
    echo "recovery_root=$RECOVERY_ROOT"
    echo "backup_root=$BACKUP_ROOT"
    echo "installed_targets=$installed"
    for tenant in 2 3 4; do
      for role in gateway dashboard; do
        if [ -s "${RECOVERY_ROOT}/metadata/${role}-tenant${tenant}.container-id" ]; then
          printf 'tenant%s_%s_container=' "$tenant" "$role"
          tr -d '\n' < "${RECOVERY_ROOT}/metadata/${role}-tenant${tenant}.container-id"
          echo
        fi
      done
    done
  } > "$temp"
  chmod 0600 "$temp"
  mv "$temp" "$PENDING_MARKER"
  CURRENT_PHASE="$phase" INSTALLED_TARGETS="$installed"
}

if [ -f "$PENDING_MARKER" ]; then
  RESUMING=1
  grep -qx schema=2 "$PENDING_MARKER" && grep -qx source=mount-namespace-holder "$PENDING_MARKER" || { echo "오류: 재개 journal의 schema/source가 유효하지 않습니다." >&2; exit 1; }
  RECOVERY_ROOT="$(journal_value recovery_root)" BACKUP_ROOT="$(journal_value backup_root)"
  CURRENT_PHASE="$(journal_value phase)" INSTALLED_TARGETS="$(journal_value installed_targets)"
  assert_persist_child "$RECOVERY_ROOT"; assert_persist_child "$BACKUP_ROOT"
  [ -d "$RECOVERY_ROOT" ] || { echo "오류: journal의 recovery 자료가 없습니다: $RECOVERY_ROOT" >&2; exit 1; }
  case "$CURRENT_PHASE" in holders-ready|archives-ready|targets-staged|pending-health) ;; *) echo "오류: 알 수 없는 재개 phase입니다: $CURRENT_PHASE" >&2; exit 1 ;; esac
  echo "중단된 이전을 journal phase=$CURRENT_PHASE 에서 자동 재개합니다."
else
  [ "${1:-}" != --resume-pending ] || { echo "오류: 재개할 pending journal이 없습니다: $PENDING_MARKER" >&2; exit 1; }
  RECOVERY_ROOT="${PERSIST_ROOT}/recovery-mount-v1-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  BACKUP_ROOT="${PERSIST_ROOT}/backup-mount-v1-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  install -d -m 0700 "$RECOVERY_ROOT" "$BACKUP_ROOT"
fi
STAGE="$(mktemp -d "${PERSIST_ROOT}/.mount-v2-stage.XXXXXX")"

cleanup() {
  local holder container
  if [ "${#holder_names[@]}" -gt 0 ]; then
    if [ "$HOLDERS_RELEASED" = 1 ] || [ ! -f "$PENDING_MARKER" ]; then
      for holder in "${holder_names[@]}"; do docker rm -f "$holder" >/dev/null 2>&1 || true; done
    elif [ "$ARCHIVES_VALIDATED" != 1 ]; then
      echo "중요: archive 검증 전 실패했습니다. 검증되지 않은 holder를 보존합니다: ${holder_names[*]}" >&2
    fi
  fi
  if [ "$PAUSE_ATTEMPTED" = 1 ] && [ "$WRITERS_STOPPED" != 1 ] && [ ! -f "$PENDING_MARKER" ]; then
    echo "이전 실패: 아직 실행 중인 원본 컨테이너의 pause를 해제합니다." >&2
    for container in "${running_before[@]}"; do docker unpause "$container" >/dev/null 2>&1 || true; done
  fi
  case "$STAGE" in "${PERSIST_ROOT}"/.mount-v2-stage.*) rm -rf "$STAGE" ;; esac
  if [ "$MIGRATION_COMPLETE" != 1 ]; then
    echo "이전 미완료: ready 표식은 만들지 않았습니다." >&2
    echo "복구 자료: $RECOVERY_ROOT" >&2
    [ ! -f "$PENDING_MARKER" ] || echo "재개 journal: $PENDING_MARKER (phase=${CURRENT_PHASE:-unknown})" >&2
    [ ! -f "$PENDING_MARKER" ] || echo "중요: 원본 컨테이너를 절대 재시작하지 말고 같은 명령을 재실행하십시오." >&2
  fi
}
trap cleanup EXIT

docker_gid="${DOCKER_GID:-$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock)}"
compose_with_root() {
  local root="$1"; shift
  env OPENCLAW_PERSIST_ROOT="$root" DOCKER_GID="$docker_gid" NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://migration.invalid}" NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-migration-no-build}" docker compose -f "$COMPOSE_FILE" "$@"
}
compose_no_build() { compose_with_root "$PERSIST_ROOT" "$@"; }
start_and_verify_cutover() {
  local attempt
  for attempt in 1 2; do
    compose_no_build up -d --no-build --force-recreate --wait --wait-timeout 120 "${TENANT_SERVICES[@]}" && return 0
    echo "경고: 기존 이미지의 새 영속 마운트 재기동과 health 확인이 실패했습니다. 동일 조건으로 1회 재시도합니다." >&2
  done
  return 1
}
publish_ready_marker() {
  sed -e 's/^status=pending-health$/status=ready/' -e 's/^phase=pending-health$/phase=ready/' "$PENDING_MARKER" > "$STAGE/.mount-v2-ready"
  grep -qx status=ready "$STAGE/.mount-v2-ready"
  chmod 0600 "$STAGE/.mount-v2-ready"
  mv "$STAGE/.mount-v2-ready" "$MARKER"
  rm -f "$PENDING_MARKER"
}

role_paths() { case "$1" in gateway) ROLE_CONFIG_PATH=/home/node/.openclaw; ROLE_DATA_PATH=/home/node/data ;; dashboard) ROLE_CONFIG_PATH=/app/config; ROLE_DATA_PATH=/app/data ;; *) return 1 ;; esac; }
assert_nonempty_snapshot() {
  local phase="$1" tenant="$2" role="$3" kind root="${RECOVERY_ROOT}/$1/tenant$2/$3"
  for kind in config data; do
    [ -d "$root/$kind" ] && [ -n "$(find "$root/$kind" -mindepth 1 -print -quit)" ] || { echo "오류: tenant${tenant} ${role} ${kind} ${phase} 스냅샷이 비었습니다." >&2; return 1; }
  done
}
compare_pair() {
  local phase="$1" tenant="$2" root="${RECOVERY_ROOT}/$1/tenant$2" ids="${RECOVERY_ROOT}/mount-identities/tenant$2.txt"
  local gc dc gd dd
  assert_nonempty_snapshot "$phase" "$tenant" gateway; assert_nonempty_snapshot "$phase" "$tenant" dashboard
  gc="$(awk -F= '$1=="gateway_config"{print $2}' "$ids")"; dc="$(awk -F= '$1=="dashboard_config"{print $2}' "$ids")"
  gd="$(awk -F= '$1=="gateway_data"{print $2}' "$ids")"; dd="$(awk -F= '$1=="dashboard_data"{print $2}' "$ids")"
  if [ "$gc" != "$dc" ] || [ "$gd" != "$dd" ] || ! diff -qr "$root/gateway" "$root/dashboard" >/dev/null; then
    echo "오류: tenant${tenant} gateway/dashboard ${phase} 스냅샷이 다릅니다. 자동 병합하지 않습니다." >&2
    echo "양쪽 원본 보존: $root" >&2; return 1
  fi
}
capture_mount_identities() {
  local tenant="$1" role container file="${RECOVERY_ROOT}/mount-identities/tenant$1.txt"
  install -d -m 0700 "$(dirname "$file")"; : > "$file"
  for role in gateway dashboard; do
    role_paths "$role"; container="openclaw-${role}-tenant${tenant}"
    printf '%s_config=' "$role" >> "$file"; docker exec "$container" stat -c '%d:%i' "$ROLE_CONFIG_PATH" >> "$file"
    printf '%s_data=' "$role" >> "$file"; docker exec "$container" stat -c '%d:%i' "$ROLE_DATA_PATH" >> "$file"
  done
}
capture_frozen_snapshot() {
  local tenant="$1" role container root
  for role in gateway dashboard; do
    role_paths "$role"; container="openclaw-${role}-tenant${tenant}"; root="${RECOVERY_ROOT}/frozen/tenant${tenant}/${role}"
    install -d -m 0700 "$root/config"; install -d -m 0750 "$root/data"
    docker cp "${container}:${ROLE_CONFIG_PATH}/." "$root/config"; docker cp "${container}:${ROLE_DATA_PATH}/." "$root/data"
  done
  compare_pair frozen "$tenant"
}

create_mount_holder() {
  local tenant="$1" role="$2" container pid holder control hold script attempt
  role_paths "$role"; container="openclaw-${role}-tenant${tenant}"; pid="$(docker inspect --format '{{.State.Pid}}' "$container")"
  case "$pid" in ''|*[!0-9]*) echo "오류: $container PID가 유효하지 않습니다: $pid" >&2; return 1 ;; esac
  holder="openclaw-mount-holder-${role}-tenant${tenant}-$$"; control="${RECOVERY_ROOT}/holders/${role}-tenant${tenant}"; hold="/tmp/openclaw-mount-hold-${role}-tenant${tenant}-$$"
  install -d -m 0700 "$control"
  script="$(cat <<EOF
set -eu
exec 5>/control/ready
nsenter -t ${pid} -m -r/proc/${pid}/root -w/ /bin/sh -c '
set -eu
hold=${hold}
rm -rf "\$hold"; mkdir -p "\$hold/config" "\$hold/data"
mount --bind "${ROLE_CONFIG_PATH}" "\$hold/config"; mount --bind "${ROLE_DATA_PATH}" "\$hold/data"
printf ready >&5
trap "exit 0" TERM INT
while :; do sleep 1; done
' &
hold_pid=\$!
archive(){
  rm -f /control/archive-ready /control/config.tar /control/data.tar
  nsenter -t "\$hold_pid" -m -r/proc/"\$hold_pid"/root -w/ tar -cf - -C "${hold}/config" . > /control/config.tar
  nsenter -t "\$hold_pid" -m -r/proc/"\$hold_pid"/root -w/ tar -cf - -C "${hold}/data" . > /control/data.tar
  sync
  printf ready > /control/archive-ready
}
release(){ kill -TERM "\$hold_pid"; wait "\$hold_pid"; exit 0; }
trap archive USR1
trap release USR2
trap release TERM INT
while kill -0 "\$hold_pid" 2>/dev/null; do wait "\$hold_pid" || true; done
EOF
)"
  docker run -d --pull=never --name "$holder" --privileged --pid=host -v "$control:/control" alpine:3 sh -c "$script" >/dev/null
  holder_names+=("$holder"); holder_controls+=("$control")
  printf '%s\t%s\t%s\t%s\n' "$role" "$tenant" "$holder" "$control" >> "${RECOVERY_ROOT}/holders/manifest.tsv"
  for attempt in 1 2 3 4 5 6 7 8 9 10; do [ -s "$control/ready" ] && return 0; sleep 1; done
  echo "오류: mount holder가 준비되지 않았습니다: $holder" >&2; docker logs "$holder" >&2 || true; return 1
}
load_holders() {
  local role tenant holder control manifest="${RECOVERY_ROOT}/holders/manifest.tsv"
  holder_names=(); holder_controls=(); [ -s "$manifest" ] || return 1
  while IFS=$'\t' read -r role tenant holder control; do
    case "$holder" in openclaw-mount-holder-*) ;; *) return 1 ;; esac
    assert_persist_child "$control"; holder_names+=("$holder"); holder_controls+=("$control")
  done < "$manifest"
  [ "${#holder_names[@]}" -eq 6 ]
}
stop_original_writers() {
  local container pid failed=0; local pids=()
  for container in "${TENANT_SERVICES[@]}"; do
    if [ "$(docker inspect --format '{{.State.Running}}' "$container")" = true ]; then docker stop --timeout 30 "$container" >/dev/null & pids+=("$!"); fi
  done
  for pid in "${pids[@]}"; do wait "$pid" || failed=1; done
  for container in "${TENANT_SERVICES[@]}"; do [ "$(docker inspect --format '{{.State.ExitCode}}' "$container")" != 137 ] || { echo "오류: $container 가 grace period 안에 종료되지 않아 SIGKILL됐습니다." >&2; failed=1; }; done
  [ "$failed" = 0 ]; WRITERS_STOPPED=1; PAUSE_ATTEMPTED=0
}
validate_and_extract_archive() {
  local control="$1" target="$2" kind archive temp="${2}.new"
  rm -rf "$temp"; install -d -m 0700 "$temp/config"; install -d -m 0750 "$temp/data"
  for kind in config data; do
    archive="$control/$kind.tar"; [ -s "$archive" ] || { echo "오류: holder ${kind} archive가 비었습니다: $control" >&2; return 1; }
    tar -tf "$archive" >/dev/null; tar -xf "$archive" -C "$temp/$kind"
    [ -n "$(find "$temp/$kind" -mindepth 1 -print -quit)" ] || return 1
  done
  rm -rf "$target"; mv "$temp" "$target"
}
archive_holders() {
  local i holder control role tenant target attempt manifest="${RECOVERY_ROOT}/holders/manifest.tsv"
  for i in "${!holder_names[@]}"; do
    holder="${holder_names[$i]}"; control="${holder_controls[$i]}"
    [ "$(docker inspect --format '{{.State.Running}}' "$holder")" = true ] || { echo "오류: archive 검증 전 holder가 종료됐습니다: $holder" >&2; return 1; }
    rm -f "$control/archive-ready" "$control/config.tar" "$control/data.tar"; docker kill --signal USR1 "$holder" >/dev/null
    for attempt in 1 2 3 4 5 6 7 8 9 10; do [ -s "$control/archive-ready" ] && break; sleep 1; done
    [ -s "$control/archive-ready" ] || { echo "오류: holder archive 준비 시간 초과: $holder" >&2; return 1; }
    [ "$(docker inspect --format '{{.State.Running}}' "$holder")" = true ] || { echo "오류: archive 검증 전에 holder가 mount를 해제했습니다: $holder" >&2; return 1; }
    role="$(awk -F '\t' -v h="$holder" '$3==h{print $1}' "$manifest")"; tenant="$(awk -F '\t' -v h="$holder" '$3==h{print $2}' "$manifest")"
    target="${RECOVERY_ROOT}/final/tenant${tenant}/${role}"; install -d -m 0700 "$(dirname "$target")"; validate_and_extract_archive "$control" "$target"
  done
  for tenant in 2 3 4; do compare_pair final "$tenant"; done
  ARCHIVES_VALIDATED=1; write_journal archives-ready
}
release_holders() {
  local holder attempt
  for holder in "${holder_names[@]}"; do
    docker inspect "$holder" >/dev/null 2>&1 || continue
    [ "$(docker inspect --format '{{.State.Running}}' "$holder")" != true ] || docker kill --signal USR2 "$holder" >/dev/null
  done
  for holder in "${holder_names[@]}"; do
    docker inspect "$holder" >/dev/null 2>&1 || continue
    for attempt in 1 2 3 4 5 6 7 8 9 10; do [ "$(docker inspect --format '{{.State.Running}}' "$holder")" = false ] && break; sleep 1; done
    [ "$(docker inspect --format '{{.State.Running}}' "$holder")" = false ] || { echo "오류: 검증 완료 holder release 시간 초과: $holder" >&2; return 1; }
  done
  HOLDERS_RELEASED=1
}

target_source() { local name="$1" kind="${1%%-tenant*}" tenant="${1##*-tenant}"; echo "${RECOVERY_ROOT}/final/tenant${tenant}/gateway/${kind}"; }
stage_all_targets() {
  local name source staged mode
  for name in "${TARGETS[@]}"; do
    source="$(target_source "$name")"; staged="${PERSIST_ROOT}/.${name}.mount-v2-new"; mode=0750; case "$name" in config-*) mode=0700 ;; esac
    [ -d "$source" ] && [ -n "$(find "$source" -mindepth 1 -print -quit)" ] || { echo "오류: 검증된 final source가 없거나 비었습니다: $source" >&2; return 1; }
    rm -rf "$staged"; install -d -m "$mode" "$staged"; cp -a "$source/." "$staged"; diff -qr "$source" "$staged" >/dev/null
  done
  write_journal targets-staged
}
append_installed() {
  local name="$1"; case ",$INSTALLED_TARGETS," in *",$name,"*) ;; *) [ -z "$INSTALLED_TARGETS" ] && INSTALLED_TARGETS="$name" || INSTALLED_TARGETS="$INSTALLED_TARGETS,$name" ;; esac
  write_journal targets-staged "$INSTALLED_TARGETS"
}
install_all_targets() {
  local name source staged target backup mode tenant env_source env_temp
  install -d -m 0700 "$BACKUP_ROOT"
  for name in "${TARGETS[@]}"; do
    source="$(target_source "$name")"; staged="${PERSIST_ROOT}/.${name}.mount-v2-new"; target="${PERSIST_ROOT}/$name"; backup="${BACKUP_ROOT}/$name"; mode=0750; case "$name" in config-*) mode=0700 ;; esac
    if [ -d "$target" ] && diff -qr "$source" "$target" >/dev/null 2>&1; then rm -rf "$staged"; chmod "$mode" "$target"; append_installed "$name"; continue; fi
    if [ ! -d "$staged" ] || ! diff -qr "$source" "$staged" >/dev/null 2>&1; then rm -rf "$staged"; install -d -m "$mode" "$staged"; cp -a "$source/." "$staged"; diff -qr "$source" "$staged" >/dev/null; fi
    if [ -e "$target" ] && [ ! -e "$backup" ]; then mv "$target" "$backup"; elif [ -e "$target" ]; then rm -rf "$target"; fi
    mv "$staged" "$target"; chmod "$mode" "$target"; diff -qr "$source" "$target" >/dev/null || return 1; append_installed "$name"
  done
  for tenant in 2 3 4; do
    env_source="${RECOVERY_ROOT}/env/.env.tenant${tenant}"; env_temp="${PERSIST_ROOT}/.env.tenant${tenant}.mount-v2-new"
    [ -s "$env_source" ] || { echo "오류: 보존한 환경파일이 없습니다: $env_source" >&2; return 1; }
    cp -p "$env_source" "$env_temp"; chmod 0600 "$env_temp"; mv "$env_temp" "${PERSIST_ROOT}/.env.tenant${tenant}"
  done
  write_journal pending-health "$INSTALLED_TARGETS"
}

if [ "$RESUMING" = 0 ]; then
  install -d -m 0700 "${RECOVERY_ROOT}/env" "${RECOVERY_ROOT}/metadata"
  for tenant in 2 3 4; do
    if [ -s "${PERSIST_ROOT}/.env.tenant${tenant}" ]; then cp -p "${PERSIST_ROOT}/.env.tenant${tenant}" "${RECOVERY_ROOT}/env/.env.tenant${tenant}"; elif [ -s ".env.tenant${tenant}" ]; then cp -p ".env.tenant${tenant}" "${RECOVERY_ROOT}/env/.env.tenant${tenant}"; else echo "오류: tenant${tenant} 환경파일이 없습니다." >&2; exit 1; fi
    chmod 0600 "${RECOVERY_ROOT}/env/.env.tenant${tenant}"
    for role in gateway dashboard; do
      container="openclaw-${role}-tenant${tenant}"; docker inspect "$container" >/dev/null 2>&1 || { echo "오류: 이전 원본 컨테이너가 없습니다: $container" >&2; exit 1; }
      [ "$(docker inspect --format '{{.State.Running}}' "$container")" = true ] || { echo "오류: 삭제된 bind mount를 회수하려면 컨테이너가 실행 중이어야 합니다: $container" >&2; exit 1; }
      docker exec "$container" sh -c 'command -v mount >/dev/null && command -v tar >/dev/null' || exit 1
      docker inspect --format '{{.Id}}' "$container" > "${RECOVERY_ROOT}/metadata/${role}-tenant${tenant}.container-id"; running_before+=("$container")
    done
    capture_mount_identities "$tenant"
  done
  docker image inspect alpine:3 >/dev/null 2>&1 || docker pull alpine:3 >/dev/null
  PREFLIGHT_ROOT="$STAGE/preflight-root"
  for tenant in 2 3 4; do install -d -m 0700 "$PREFLIGHT_ROOT/config-tenant${tenant}"; install -d -m 0750 "$PREFLIGHT_ROOT/data-tenant${tenant}"; cp -p "${RECOVERY_ROOT}/env/.env.tenant${tenant}" "$PREFLIGHT_ROOT/.env.tenant${tenant}"; done
  compose_with_root "$PREFLIGHT_ROOT" config --quiet
  echo "tenant2·3·4 gateway/dashboard 쓰기를 pause로 동결하고 양쪽 mount를 대조합니다."
  PAUSE_ATTEMPTED=1; for container in "${running_before[@]}"; do docker pause "$container" >/dev/null; done
  for tenant in 2 3 4; do capture_frozen_snapshot "$tenant"; done
  for tenant in 2 3 4; do create_mount_holder "$tenant" gateway; create_mount_holder "$tenant" dashboard; done
  write_journal holders-ready
  stop_original_writers; archive_holders; release_holders
else
  load_holders || true
  case "$CURRENT_PHASE" in
    holders-ready) [ "${#holder_names[@]}" -eq 6 ] || { echo "오류: holders-ready 재개에 holder 6개가 필요합니다." >&2; exit 1; }; stop_original_writers; archive_holders; release_holders ;;
    archives-ready) ARCHIVES_VALIDATED=1; [ "${#holder_names[@]}" -ne 6 ] || release_holders ;;
  esac
fi

case "$CURRENT_PHASE" in archives-ready) stage_all_targets ;; esac
case "$CURRENT_PHASE" in targets-staged) install_all_targets ;; esac
case "$CURRENT_PHASE" in
  pending-health)
    start_and_verify_cutover || { echo "오류: 재시도 후에도 health 확인에 실패했습니다. pending journal을 유지합니다." >&2; exit 1; }
    publish_ready_marker
    ;;
  *) echo "오류: 완료할 수 없는 phase입니다: $CURRENT_PHASE" >&2; exit 1 ;;
esac

MIGRATION_COMPLETE=1
if [ "$RESUMING" = 1 ]; then echo "이전 재개 완료: 새 영속 마운트의 health를 확인하고 ready 표식을 공개했습니다."; else echo "이전 완료: $PERSIST_ROOT"; fi
echo "이전 전 frozen 및 최종 대조본: $RECOVERY_ROOT"
echo "기존 target 백업: $BACKUP_ROOT"
