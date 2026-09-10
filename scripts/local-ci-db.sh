#!/usr/bin/env bash
# local-ci-db.sh — CI 와 같은 테스트 데이터베이스를 로컬에 띄우고 스키마를 맞춘다.
#
# 왜 (2026-09-03, 회장 세션):
#   같은 계약(`M5-STUDIO-02`·`M5-STUDIO-03`)이 세 번 연속으로 "로컬 통과, CI 실패" 로 깨졌다.
#   원인은 코드가 아니라 검증 환경 차이였다. 로컬에는 데이터베이스가 없어 격리 테스트 38건이
#   건너뛰기로 빠지고, CI 에는 있어서 실제로 돈다. 워커는 로컬만 보고 "전부 통과" 라 보고했고
#   CI 는 매번 빨간불이었다. 워커가 CI 를 재현할 수 없으면 이 왕복은 끝나지 않는다.
#
# 사용:
#   bash scripts/local-ci-db.sh up      # 띄우고 스키마 적용
#   bash scripts/local-ci-db.sh test    # 그 데이터베이스로 전체 테스트
#   bash scripts/local-ci-db.sh down    # 정리
#
# 참고: CI 정의는 `.github/workflows/ci.yml` 이다. 스키마 적용 순서(schema → seed → rls)를
#   그대로 따른다. seed 가 FORCE RLS 앞에 와야 해서 순서가 중요하다.
set -uo pipefail
NAME="${OSMU_TESTDB_NAME:-osmu-testdb}"
PORT="${OSMU_TESTDB_PORT:-55432}"
URL="postgres://postgres:postgres@127.0.0.1:${PORT}/testdb"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

up() {
  if docker ps --filter "name=^${NAME}$" --format '{{.Names}}' | grep -q "$NAME"; then
    echo "이미 떠 있다: $NAME"
  else
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=testdb \
      -p "${PORT}:5432" postgres:16 >/dev/null || { echo "⛔ 기동 실패"; exit 1; }
  fi
  i=0
  until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 || [ $i -ge 60 ]; do sleep 1; i=$((i+1)); done
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 || { echo "⛔ 데이터베이스가 안 뜬다"; exit 1; }
  for f in dashboard/db/schema.sql dashboard/scripts/seed-test-tenants.sql dashboard/db/rls.sql; do
    [ -f "$ROOT/$f" ] || { echo "건너뜀(파일 없음): $f"; continue; }
    docker exec -i "$NAME" psql "postgres://postgres:postgres@127.0.0.1:5432/testdb" \
      -v ON_ERROR_STOP=1 -q < "$ROOT/$f" >/dev/null 2>&1 && echo "적용: $f" || echo "⚠️ 적용 중 경고: $f"
  done
  echo "준비됨. DATABASE_URL=$URL"
}

case "${1:-up}" in
  up) up ;;
  test) up; cd "$ROOT/dashboard" && DATABASE_URL="$URL" npx vitest run ;;
  down) docker rm -f "$NAME" >/dev/null 2>&1 && echo "정리됨: $NAME" || echo "없음" ;;
  *) echo "사용: $0 {up|test|down}"; exit 1 ;;
esac
