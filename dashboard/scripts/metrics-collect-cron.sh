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

if [ -z "$TOKEN" ]; then
  echo "ERROR: DASHBOARD_AUTH_TOKEN 미설정 — 운영자 전체 스윕 불가." >&2
  exit 2
fi

echo "[metrics-collect] $(date -u +%FT%TZ) sweeping all tenants @ ${BASE_URL}"
http_code=$(curl -sS -o /tmp/metrics-collect-resp.json -w "%{http_code}" \
  -X POST "${BASE_URL}/api/metrics" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}')

cat /tmp/metrics-collect-resp.json
echo
if [ "$http_code" != "200" ]; then
  echo "[metrics-collect] FAILED http=${http_code}" >&2
  exit 1
fi
echo "[metrics-collect] OK http=${http_code}"
