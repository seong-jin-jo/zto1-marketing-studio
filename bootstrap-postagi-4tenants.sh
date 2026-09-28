#!/bin/bash
# 멀티 테넌트 openclaw 인스턴스 초기 셋업 (브랜드/도메인은 fork-local data/tenants.json에서 설정)
# - 각 서비스용 data-{slug}/, config-{slug}/ 디렉토리 생성
# - templates/{slug}.prompt-guide.txt → data-{slug}/prompt-guide.txt 복사
# - .env.{slug} 자동 생성 (포트/토큰 placeholder)
# - data/config 정본은 체크아웃 밖 ${OPENCLAW_PERSIST_ROOT:-$HOME/openclaw-persist}
#
# 사용: bash bootstrap-postagi-4tenants.sh

set -euo pipefail
cd "$(dirname "$0")"

PERSIST_ROOT="${OPENCLAW_PERSIST_ROOT:-${HOME}/openclaw-persist}"
RUNTIME_UID="1000"
if [ "$(uname -s)" = "Linux" ] && [ "$(id -u)" != "$RUNTIME_UID" ]; then
  echo "오류: Linux에서는 OpenClaw 런타임 UID 1000과 같은 사용자로 bootstrap을 실행해야 합니다." >&2
  exit 1
fi

for slug in tenant2 tenant3 tenant4; do
  if [ -d "config-${slug}" ] || [ -d "data-${slug}" ]; then
    echo "오류: checkout 안에 ${slug}의 기존 config/data가 남아 있습니다." >&2
    echo "실행 중인 컨테이너를 멈추고 해당 데이터를 ${PERSIST_ROOT}로 이전한 뒤 기존 디렉터리를 치우십시오." >&2
    echo "bootstrap은 기존 운영 데이터를 자동 병합하거나 .mount-v2-ready를 만들지 않습니다." >&2
    exit 1
  fi
done

for slug in tenant2 tenant3 tenant4; do
  echo "===== ${slug} ====="

  # 1. 체크아웃 밖 영속 디렉토리 생성. gateway(node, uid 1000)와 dashboard가 같은 소유자로 쓴다.
  DATA_DIR="${PERSIST_ROOT}/data-${slug}"
  CONFIG_DIR="${PERSIST_ROOT}/config-${slug}"
  install -d -m 0750 "$DATA_DIR"
  install -d -m 0700 "$CONFIG_DIR"

  # 2. templates → data 복사 (이미 있으면 skip)
  if [ ! -f "$DATA_DIR/prompt-guide.txt" ]; then
    cp "data/templates/general.prompt-guide.txt" "$DATA_DIR/prompt-guide.txt"
    echo "  ✓ prompt-guide.txt copied"
  else
    echo "  - prompt-guide.txt exists (skip)"
  fi

  if [ ! -f "$DATA_DIR/search-keywords.txt" ]; then
    cp "data/templates/general.search-keywords.txt" "$DATA_DIR/search-keywords.txt"
    echo "  ✓ search-keywords.txt copied"
  else
    echo "  - search-keywords.txt exists (skip)"
  fi

  # 3. .env.{slug} placeholder (실 토큰은 사용자가 dashboard Settings에서 입력 권장)
  case "$slug" in
    tenant2) PORTS_PAIR="34561:18790" ;;
    tenant3) PORTS_PAIR="34563:18792" ;;
    tenant4) PORTS_PAIR="34564:18793" ;;
  esac
  DASHBOARD_PORT="${PORTS_PAIR%%:*}"
  GATEWAY_PORT="${PORTS_PAIR##*:}"
  ENV_FILE="${PERSIST_ROOT}/.env.${slug}"
  if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" <<EOF
# openclaw ${slug} tenant — 자동 생성 (편집 후 docker-compose up -d)
DASHBOARD_PORT=${DASHBOARD_PORT}
GATEWAY_PORT=${GATEWAY_PORT}
OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)
DASHBOARD_AUTH_TOKEN=$(openssl rand -hex 32)
# 채널 credential은 dashboard Settings에서 입력 (영구 저장 = ${CONFIG_DIR}/)
# 또는 여기 박아도 됨:
# INSTAGRAM_ACCESS_TOKEN=
# X_API_KEY=
# THREADS_ACCESS_TOKEN=
TZ=Asia/Seoul
EOF
    chmod 0600 "$ENV_FILE"
    echo "  ✓ ${ENV_FILE} generated (token 자동 — 외부 노출 X)"
  else
    echo "  - ${ENV_FILE} exists (skip)"
  fi
  chmod 0600 "$ENV_FILE"
done

# 기존 checkout 데이터가 없는 신규 설치만 이 경로에 도달한다. 기존 운영 환경은 위에서
# 멈추므로 수동 이전 없이 빈 디렉터리에 준비 완료 표식이 생기지 않는다.
cat > "${PERSIST_ROOT}/.mount-v2-ready" <<'EOF'
schema=2
source=fresh-bootstrap
EOF
chmod 600 "${PERSIST_ROOT}/.mount-v2-ready"

# 5. data/tenants.json — dashboard /services 페이지 로드용 (fork-local, gitignore)
if [ ! -f "data/tenants.json" ]; then
  cat > "data/tenants.json" <<'EOF'
{
  "tenants": [
    { "slug": "tenant1", "name": "Tenant One",   "emoji": "🅰", "dashboardPort": 34560, "gatewayPort": 18789, "publicUrl": "https://marketing-tenant1.example.com", "channels": ["instagram","threads"], "status": "active" },
    { "slug": "tenant2", "name": "Tenant Two",   "emoji": "🅱", "dashboardPort": 34561, "gatewayPort": 18790, "publicUrl": "https://marketing-tenant2.example.com", "channels": ["instagram","threads"], "status": "active" },
    { "slug": "tenant3", "name": "Tenant Three", "emoji": "🅲", "dashboardPort": 34563, "gatewayPort": 18792, "publicUrl": "https://marketing-tenant3.example.com", "channels": ["instagram"], "status": "pending" },
    { "slug": "tenant4", "name": "Tenant Four",  "emoji": "🅳", "dashboardPort": 34564, "gatewayPort": 18793, "publicUrl": "https://marketing-tenant4.example.com", "channels": ["x"], "status": "pending" }
  ]
}
EOF
  echo "  ✓ data/tenants.json generated (example tenants — edit for your fork)"
fi

echo ""
echo "============================================================"
echo "✅ 4 tenants 초기화 완료"
echo "============================================================"
echo ""
echo "다음:"
echo "  1. docker compose -f docker-compose.postagi-4tenants.yml up -d"
echo "  2. Cloudflare Tunnel 라우트 추가 (예시 — 실제 도메인은 fork-local):"
echo "     marketing-tenant2.example.com    → localhost:34561"
echo "     marketing-tenant3.example.com    → localhost:34563"
echo "     marketing-tenant4.example.com    → localhost:34564"
echo "  3. 각 dashboard → Settings → 채널 credential 입력 (IG/X/Threads)"
echo "  4. Settings → Automation ON → cron 6시간 자동 발행 시작"
