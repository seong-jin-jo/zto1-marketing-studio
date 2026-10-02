#!/usr/bin/env bash
# 성과 수집 크론 드라이버 — 발행물이 있는 전 테넌트의 성과(views/likes/replies/reposts)를
# 자동 수집한다.
# 배포 호스트 crontab(또는 게이트웨이 스케줄러)이 주기적으로 이걸 호출한다.
#   예: 0 */6 * * * /app/dashboard/scripts/metrics-collect-cron.sh >> /var/log/metrics-collect.log 2>&1
#
# 2026-10-02 결함(회장 지적): 성과 수집은 지금까지 성과실의 "성과 다시 수집하기" 버튼
# (/api/metrics POST, 테넌트 스코프 1회성 호출)에서만 돌았다. 버튼을 안 누르면 영원히
# 수집되지 않는다 — 실제로 마지막 수집(2026-09-23) 뒤 올라간 Shorts/Reels가 전부
# 미수집이었다. publish-due-cron.sh와 같은 패턴으로 "운영자 토큰 + tenant_id 없음 =
# 전 테넌트 스윕"을 돈다.
#
# 인증: 운영자 토큰(DASHBOARD_AUTH_TOKEN)으로 호출하면 /api/metrics가 tenant_id 없이
#       발행물이 있는 모든 테넌트를 순회한다(operator all-tenants sweep).
# 필수 env: DASHBOARD_AUTH_TOKEN(운영자 토큰). 선택: BASE_URL(기본 http://localhost:3456).
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3456}"
TOKEN="${DASHBOARD_AUTH_TOKEN:-}"
# 2026-10-02 독립 리뷰어 MINOR: 고정 /tmp 경로는 같은 호스트에서 이 스크립트가 겹쳐
# 돌면(수동 재실행과 크론이 겹치는 경우 등) 서로의 응답 파일을 덮어쓴다. mktemp로
# 호출마다 고유 경로를 받고 끝나면 치운다.
RESP_FILE="$(mktemp "${TMPDIR:-/tmp}/metrics-collect-resp.XXXXXX.json")"
trap 'rm -f "$RESP_FILE"' EXIT

if [ -z "$TOKEN" ]; then
  echo "ERROR: DASHBOARD_AUTH_TOKEN 미설정 — 운영자 전체 스윕 불가." >&2
  exit 2
fi

echo "[metrics-collect] $(date -u +%FT%TZ) sweeping all tenants @ ${BASE_URL}"
# --max-time: 전체 테넌트 스윕은 테넌트 수만큼 외부 채널 API 호출이 늘어난다. 상한이
# 없으면 한 채널 장애(타임아웃 없는 요청)가 이 크론 실행 전체를 무한정 붙잡고, 다음
# 주기 실행과 겹쳐 중복 수집·락 경합을 만든다. 300초(5분)는 6시간 주기 대비 충분히 짧다.
http_code=$(curl -sS --max-time 300 -o "$RESP_FILE" -w "%{http_code}" \
  -X POST "${BASE_URL}/api/metrics" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}')

cat "$RESP_FILE"
echo
if [ "$http_code" != "200" ]; then
  echo "[metrics-collect] FAILED http=${http_code}" >&2
  exit 1
fi
echo "[metrics-collect] OK http=${http_code}"
