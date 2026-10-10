#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$DASHBOARD_DIR/.." && pwd)"
POSTGRES_DIR="$REPO_DIR/data/local-postgres-20261010"
DATA_ROOT="$REPO_DIR/data/local-real-path-20261010"
POSTGRES_LOG="${TMPDIR:-/tmp}/zto1-local-postgres-20261010.log"
NEXT_LOG="${TMPDIR:-/tmp}/zto1-local-next-20261010.log"
WORKER_LOG="${TMPDIR:-/tmp}/zto1-local-export-worker-20261010.log"

set -a
# shellcheck disable=SC1091
source "$DASHBOARD_DIR/.env.local"
set +a

if ! node -e 'const net=require("node:net");const s=net.createServer();s.once("error",()=>process.exit(1));s.listen(3483,"127.0.0.1",()=>s.close(()=>process.exit(0)))'; then
  echo "ERROR: 127.0.0.1:3483 포트에 Next 개발 서버를 바인딩할 수 없습니다. 해당 로컬 스택을 종료한 뒤 다시 실행하세요." >&2
  exit 3
fi

DB_SHAPE="$(node -e 'const u=new URL(process.env.DATABASE_URL); console.log([u.hostname,u.port,u.pathname].join("|"))')"
if [ "$DB_SHAPE" != "127.0.0.1|55432|/osmu" ]; then
  echo "ERROR: dashboard/.env.local DATABASE_URL은 127.0.0.1:55432/osmu여야 합니다." >&2
  exit 2
fi

# 같은 Mac에서 다른 worktree의 export worker가 .env.local의 osmu 큐를 함께 폴링하면,
# 서로 다른 DATA_DIR를 가진 worker가 이 작업을 선점할 수 있다. 이 검증 스택은 전용 DB로
# 큐와 초안을 격리한다. 호스트와 포트, 계정은 .env.local 값을 그대로 상속한다.
export DATABASE_URL="$(node -e 'const u=new URL(process.env.DATABASE_URL); u.pathname="/osmu_local_real_path_20261010"; process.stdout.write(u.toString())')"
LOCAL_DB_NAME="$(node -e 'const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.pathname.slice(1))')"

mkdir -p "$POSTGRES_DIR" "$DATA_ROOT"
if [ ! -f "$POSTGRES_DIR/PG_VERSION" ]; then
  initdb -D "$POSTGRES_DIR" -U postgres --auth=trust > "${TMPDIR:-/tmp}/zto1-local-initdb-20261010.log" 2>&1
fi
if ! pg_isready -h 127.0.0.1 -p 55432 >/dev/null 2>&1; then
  pg_ctl -D "$POSTGRES_DIR" -l "$POSTGRES_LOG" -o "-p 55432 -h 127.0.0.1" start >/dev/null
fi
if ! psql -h 127.0.0.1 -p 55432 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$LOCAL_DB_NAME'" | rg -q '^1$'; then
  createdb -h 127.0.0.1 -p 55432 -U postgres "$LOCAL_DB_NAME"
fi

bash "$SCRIPT_DIR/apply-schema.sh" --seed > "${TMPDIR:-/tmp}/zto1-local-schema-20261010.log" 2>&1
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/seed-local-publish-dry-run.sql" > "${TMPDIR:-/tmp}/zto1-local-channels-20261010.log" 2>&1

# 실 자격증명이 아닌 로컬 fixture를 복호화하는 비민감 키다. NODE_ENV=production이면
# publish-dry-run.ts가 PUBLISH_DRY_RUN=1을 무시하므로 운영 경로에는 적용되지 않는다.
export OSMU_SECRET_KEY="local-publish-dry-run-key"
export DATA_DIR="$DATA_ROOT"
export OSMU_PUBLIC_URL="http://127.0.0.1:3483"
export MEDIA_SIGNING_SECRET="local-media-signing-key-not-secret"
export PUBLISH_DRY_RUN="1"
export PUBLISH_DRY_RUN_LOG="$DATA_ROOT/publish-dry-run/requests.jsonl"
export EXPORT_WORKER_HEALTH_PORT="34621"
unset R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_ENDPOINT R2_PUBLIC_URL

WORKER_PID=""
cleanup() {
  if [ -n "$WORKER_PID" ]; then kill "$WORKER_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

cd "$DASHBOARD_DIR"
if [ "${START_EXPORT_WORKER:-1}" = "1" ]; then
  ./node_modules/.bin/tsx src/workers/studio-export-worker.ts > "$WORKER_LOG" 2>&1 &
  WORKER_PID=$!
fi

echo "로컬 스택: http://127.0.0.1:3483"
echo "PostgreSQL: 127.0.0.1:55432/$LOCAL_DB_NAME (이 worktree 전용)"
echo "데이터: $DATA_ROOT"
echo "발행 요청 기록: $PUBLISH_DRY_RUN_LOG"
echo "로그: $NEXT_LOG, $WORKER_LOG"
exec npm run dev -- --hostname 127.0.0.1 --port 3483 > "$NEXT_LOG" 2>&1
