#!/bin/bash
# tenant2·3·4의 삭제된 checkout bind mount를 정지 컨테이너에서 영속 루트로 1회 이전한다.
# 운영 서버에서 UID 1000 계정으로 명시 실행한다. 성공 후에도 컨테이너는 정지 상태로 둔다.

set -euo pipefail
cd "$(dirname "$0")"

PERSIST_ROOT="${OPENCLAW_PERSIST_ROOT:-${HOME}/openclaw-persist}"
RUNTIME_UID="1000"
MARKER="${PERSIST_ROOT}/.mount-v2-ready"

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
cleanup() {
  case "$STAGE" in
    "${PERSIST_ROOT}"/.mount-v2-stage.*) rm -rf "$STAGE" ;;
  esac
}
trap cleanup EXIT

containers=()
for tenant in 2 3 4; do
  for kind in gateway dashboard; do
    container="openclaw-${kind}-tenant${tenant}"
    docker inspect "$container" >/dev/null 2>&1 || {
      echo "오류: 이전 원본 컨테이너가 없습니다: $container" >&2
      exit 1
    }
    containers+=("$container")
  done
done

echo "tenant2·3·4 gateway/dashboard를 정지합니다. 성공 후 배포가 다시 기동합니다."
docker stop "${containers[@]}" >/dev/null

for tenant in 2 3 4; do
  gateway="openclaw-gateway-tenant${tenant}"
  config_stage="${STAGE}/config-tenant${tenant}"
  data_stage="${STAGE}/data-tenant${tenant}"
  install -d -m 0700 "$config_stage"
  install -d -m 0750 "$data_stage"

  docker cp "${gateway}:/home/node/.openclaw/." "$config_stage"
  docker cp "${gateway}:/home/node/data/." "$data_stage"
  [ -n "$(find "$config_stage" -mindepth 1 -print -quit)" ] || {
    echo "오류: ${gateway}의 config 스냅샷이 비었습니다. 영속 경로를 교체하지 않습니다." >&2
    exit 1
  }
  [ -n "$(find "$data_stage" -mindepth 1 -print -quit)" ] || {
    echo "오류: ${gateway}의 data 스냅샷이 비었습니다. 영속 경로를 교체하지 않습니다." >&2
    exit 1
  }

  if [ -s "${PERSIST_ROOT}/.env.tenant${tenant}" ]; then
    cp -p "${PERSIST_ROOT}/.env.tenant${tenant}" "${STAGE}/.env.tenant${tenant}"
  elif [ -s ".env.tenant${tenant}" ]; then
    cp -p ".env.tenant${tenant}" "${STAGE}/.env.tenant${tenant}"
  else
    echo "오류: tenant${tenant} 환경파일을 checkout 또는 영속 루트에서 찾지 못했습니다." >&2
    exit 1
  fi
  chmod 0600 "${STAGE}/.env.tenant${tenant}"
  docker inspect --format '{{.Id}}' "$gateway" > "${STAGE}/tenant${tenant}.container-id"
done

BACKUP_ROOT="${PERSIST_ROOT}/backup-mount-v1-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$BACKUP_ROOT"
for tenant in 2 3 4; do
  for kind in config data; do
    target="${PERSIST_ROOT}/${kind}-tenant${tenant}"
    [ ! -e "$target" ] || mv "$target" "$BACKUP_ROOT/"
    mv "${STAGE}/${kind}-tenant${tenant}" "$target"
  done
  mv "${STAGE}/.env.tenant${tenant}" "${PERSIST_ROOT}/.env.tenant${tenant}"
done

{
  echo "schema=2"
  echo "source=stopped-container-copy"
  for tenant in 2 3 4; do
    printf 'tenant%s_container=' "$tenant"
    tr -d '\n' < "${STAGE}/tenant${tenant}.container-id"
    echo
  done
} > "${STAGE}/.mount-v2-ready"
chmod 0600 "${STAGE}/.mount-v2-ready"
mv "${STAGE}/.mount-v2-ready" "$MARKER"

echo "이전 완료: $PERSIST_ROOT"
echo "이전 영속 경로 백업: $BACKUP_ROOT"
echo "컨테이너는 정지 상태입니다. 배포 워크플로를 실행해 새 마운트로 기동하십시오."
