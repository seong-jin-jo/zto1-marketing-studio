#!/bin/bash
# osmu-browsers.sh — OSMU 대시보드 상시 테스트용 브라우저 2개(관리자·회원)를 영구 프로필로 띄운다.
# 왜 (회장 2026-09-17): 관리자용 크롬 하나, 일반회원용 크롬 하나를 계속 띄워 놓고 테스트·설정을 반복한다.
#   Claude in Chrome 은 회장 실사용 프로필 1개를 공유해 동시 세션이 안 되고 포커스를 뺏는다.
#   프로필 관리는 하네스 정문 social-browser.mjs(SOCIAL_PROFILE → ~/.sj-agent-harness/browser-profiles/<이름>)를 그대로 쓴다.
#   실제 크롬 채널(channel: 'chrome')이라 Chrome for Testing 은 필요 없다.
# 사용: dashboard/scripts/osmu-browsers.sh admin|member [url]     (기본 url = 운영 https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/)
#       dashboard/scripts/osmu-browsers.sh status                 (두 CDP 포트 응답 확인)
# CDP: admin=9222, member=9223(기본) 또는 OSMU_MEMBER_CDP(회장이 직접 띄운 실회원 브라우저. 그 창의 SNS 탭은 건드리지 않고 localhost 탭만 쓴다). 컨트롤러는 playwright chromium.connectOverCDP('http://127.0.0.1:<port>') 로 붙는다.
# 로그인: admin 은 DASHBOARD_AUTH_TOKEN 을 localStorage 에 넣는 운영자 로그인(컨트롤러가 함).
#         member 는 회장이 그 창에서 Google/소셜 로그인 1회. Meta OAuth 동의 클릭은 회장 손(ADR-005 §7, 2026-07-01 플래그 사고).
set -euo pipefail
ROLE="${1:-}"; URL="${2:-https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/}"   # 운영 서비스가 기본. 로컬은 2번째 인자로 명시 (회장 2026-09-17 "실제 배포된 서비스를 들어가야지")
RUNNER="$HOME/.claude/harness/bin/social-browser.mjs"
case "$ROLE" in
  admin)  PORT=9222; PROFILE=osmu-admin ;;
  member) PORT="${OSMU_MEMBER_CDP:-9223}"; PROFILE=osmu-member ;;   # 회장이 직접 띄운 실회원 브라우저(2026-09-17: 9333, j.the.great.investor)가 있으면 OSMU_MEMBER_CDP=9333 로 가리킨다
  status)
    failures=0
    for p in 9222:admin "${OSMU_MEMBER_CDP:-9223}:member"; do
      port=${p%%:*}; name=${p##*:}
      if v=$(curl -s --max-time 2 "http://127.0.0.1:$port/json/version" 2>/dev/null) && [[ -n "$v" ]]; then
        echo "정상 $name (CDP $port): $(echo "$v" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("Browser"))')"
      else
        echo "오류 $name (CDP $port): 응답 없음"
        failures=$((failures + 1))
      fi
    done
    exit "$failures" ;;
  *) echo "usage: $0 admin|member [url] | status" >&2; exit 2 ;;
esac
if curl -s --max-time 1 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  echo "이미 떠 있음: $ROLE (CDP $PORT)"; exit 0; fi
LOG="$HOME/.sj-agent-harness/browser-profiles/$PROFILE.log"; mkdir -p "$(dirname "$LOG")"
SOCIAL_PROFILE="$PROFILE" CDP_PORT="$PORT" nohup node "$RUNNER" serve "$URL" >"$LOG" 2>&1 &
for i in $(seq 1 20); do curl -s --max-time 1 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1 && { echo "기동: $ROLE · 프로필 $PROFILE · CDP $PORT · 로그 $LOG"; exit 0; }; sleep 0.5; done
echo "기동 실패 $ROLE. 로그: $LOG"; tail -5 "$LOG"; exit 1
