#!/usr/bin/env bash
# 발행실 카드 정렬 실측을 CI 에서 실제로 돌리는 진입점.
#
# 왜 있나 — 2026-09-23 실수 원장 count:9 의 두 번째 근본 원인:
# scripts/measure-publish-room-alignment.mjs 는 package.json 에 등록만 돼 있고
# 어디서도 호출되지 않는 죽은 코드였다. 아무도 안 부르는 게이트는 게이트가 아니다.
# 이 스크립트가 CI 워크플로의 실제 스텝이 되어, 정렬이 깨지면 CI 가 빨개진다.
#
# 하는 일: 브라우저 확보 → dev 서버 기동 → 하네스 측정 → 서버 정리 → 종료코드 전달.
# **조용한 통과를 만들지 않는다.** 브라우저를 못 구하거나 서버가 안 뜨면 이 스크립트는
# 반드시 실패한다(exit 1). 그것이 이 사고를 만든 실패 양상 자체이기 때문이다.
set -euo pipefail

PORT="${ALIGNMENT_PORT:-3457}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_DIR="${ALIGNMENT_LOG_DIR:-/tmp}"
SERVER_LOG="${LOG_DIR}/alignment-dev-server.log"

log() { printf '[alignment-gate] %s\n' "$*"; }

# 1) 브라우저 확보. playwright-core 는 브라우저를 내려받지 못하므로(코어만 들어 있다)
#    같은 버전의 playwright CLI 로 chromium 을 받는다. 실패하면 여기서 죽는다 —
#    "브라우저가 없어서 건너뛰었다"로 통과시키지 않는다.
PW_VERSION="$(node -p "require('playwright-core/package.json').version")"
log "playwright-core ${PW_VERSION} 용 chromium 확보 중"
if ! npx --yes "playwright@${PW_VERSION}" install --with-deps chromium; then
  log "실패: chromium 을 확보하지 못했습니다. 정렬 게이트를 건너뛰지 않고 실패로 처리합니다."
  log "이유: 브라우저가 없다고 조용히 통과시키는 것이 2026-09-23 count:9 사고를 만든 실패 양상입니다."
  exit 1
fi

# 2) dev 서버 기동. /qa-alignment-harness 는 운영 빌드에서 notFound 이므로 dev 로만 잰다.
log "dev 서버 기동 (포트 ${PORT}) → ${SERVER_LOG}"
npm run dev -- -p "${PORT}" >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!
cleanup() {
  if kill -0 "${SERVER_PID}" 2>/dev/null; then kill "${SERVER_PID}" 2>/dev/null || true; fi
  wait "${SERVER_PID}" 2>/dev/null || true
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 90); do
  if curl -fsS -o /dev/null "${BASE_URL}/qa-alignment-harness"; then ready=1; break; fi
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then break; fi
  sleep 2
done
if [ "${ready}" -ne 1 ]; then
  log "실패: ${BASE_URL}/qa-alignment-harness 가 뜨지 않았습니다. dev 서버 로그:"
  tail -n 60 "${SERVER_LOG}" || true
  exit 1
fi
log "하네스 응답 확인 — 측정 시작"

# 3) 측정. 스크립트가 delta 초과를 exit 1 로 알린다.
if ! HARNESS_BASE_URL="${BASE_URL}" node scripts/measure-publish-room-alignment.mjs; then
  log "실패: 발행실 카드 정렬이 허용 delta 를 넘었습니다(위 실측표 참고)."
  exit 1
fi
log "통과: 발행실 카드 정렬 실측이 허용 범위 안입니다."
