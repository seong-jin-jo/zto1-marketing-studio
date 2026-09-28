#!/bin/bash
# 멀티 테넌트 openclaw 인스턴스 초기 셋업 (브랜드/도메인은 fork-local data/tenants.json에서 설정)
# - 각 서비스용 data-{slug}/, config-{slug}/ 디렉토리 생성
# - data/templates/general.* → 영속 data-{slug}/ 콘텐츠 가이드·검색어 복사
# - .env.{slug} 자동 생성 (포트/토큰 placeholder)
# - data/config 정본은 체크아웃 밖 ${OPENCLAW_PERSIST_ROOT:-$HOME/openclaw-persist}
#
# 사용: bash bootstrap-postagi-4tenants.sh

set -euo pipefail
cd "$(dirname "$0")"

PERSIST_ROOT="${OPENCLAW_PERSIST_ROOT:-${HOME}/openclaw-persist}"
RUNTIME_UID="1000"
MARKER="${PERSIST_ROOT}/.mount-v2-ready"
if [ "$(uname -s)" = "Linux" ] && [ "$(id -u)" != "$RUNTIME_UID" ]; then
  echo "오류: Linux에서는 OpenClaw 런타임 UID 1000과 같은 사용자로 bootstrap을 실행해야 합니다." >&2
  exit 1
fi

for slug in tenant2 tenant3 tenant4; do
  if [ -d "config-${slug}" ] || [ -d "data-${slug}" ]; then
    echo "오류: checkout 안에 ${slug}의 기존 config/data가 남아 있습니다." >&2
    echo "컨테이너를 절대 멈추지 말고, 실행 중인 상태에서 migrate-postagi-persist-mounts.sh로 ${PERSIST_ROOT}에 이전하십시오." >&2
    echo "bootstrap은 기존 운영 데이터를 자동 병합하거나 .mount-v2-ready를 만들지 않습니다." >&2
    exit 1
  fi
done

resume_fresh=0
if [ -f "$MARKER" ]; then
  if grep -qx 'schema=2' "$MARKER" && grep -qx 'source=fresh-bootstrap' "$MARKER"; then
    resume_fresh=1
    for slug in tenant2 tenant3 tenant4; do
      for target in "${PERSIST_ROOT}/config-${slug}" "${PERSIST_ROOT}/data-${slug}" "${PERSIST_ROOT}/.env.${slug}"; do
        if [ ! -e "$target" ]; then
          echo "오류: fresh-bootstrap 표식은 있지만 필수 영속 대상이 없습니다: $target" >&2
          exit 1
        fi
      done
    done
    echo "유효한 fresh-bootstrap 상태를 이어서 검증합니다. 기존 파일은 덮어쓰지 않습니다."
  else
    echo "오류: bootstrap이 이어갈 수 없는 영속 표식입니다: $MARKER" >&2
    exit 1
  fi
elif find "$PERSIST_ROOT" -mindepth 1 -maxdepth 1 \
  \( -name 'config-tenant[234]' -o -name 'data-tenant[234]' -o -name '.env.tenant[234]' \) \
  -print -quit 2>/dev/null | grep -q .; then
  echo "오류: 표식 없는 기존 영속 데이터가 있습니다. fresh bootstrap으로 덮어쓰지 않습니다." >&2
  echo "부분 실행 상태라면 검증 후 정리하거나, 운영 데이터라면 migrate-postagi-persist-mounts.sh를 사용하십시오." >&2
  exit 1
fi

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

# 신규 설치이거나 이미 검증된 fresh-bootstrap 재개만 이 경로에 도달한다.
# 표식 없는 부분 상태와 기존 운영 데이터는 위에서 멈추므로 준비 완료로 승격되지 않는다.
if [ "$resume_fresh" != "1" ]; then
  cat > "$MARKER" <<'EOF'
schema=2
source=fresh-bootstrap
EOF
fi
chmod 600 "$MARKER"

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
