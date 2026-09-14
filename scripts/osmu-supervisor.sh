#!/usr/bin/env bash
# osmu-supervisor.sh — 개발이 끝날 때까지 codex 워커를 쉬지 않고 돌린다.
#
# 왜 (회장 2026-08-28 "개발 완료될때까지 Codex 멈추지말고 시켜라"):
#   지금까지는 컨트롤러가 한 판 발주하고, 끝나면 회장이 물어볼 때까지 다음 판을 안 걸었다.
#   회장이 자는 동안에도 백로그가 스스로 다음 과제를 집어 던지게 만든다.
#
# 하는 일:
#   두 갈래(백엔드·화면)를 각각 한 명씩만 돌린다. 그 갈래가 비면 백로그에서 다음 과제를 꺼내
#   codex-in-pane 으로 던지고, 결과를 기록한다. 백로그가 비면 스스로 멈춘다.
#
# 사용: nohup bash scripts/osmu-supervisor.sh >/tmp/osmu-supervisor.log 2>&1 &
#   상태 보기: cat docs/plan/osmu-backlog-state.tsv
#   멈추기:   touch /tmp/osmu-supervisor.stop
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
BACKLOG="$ROOT/docs/plan/osmu-backlog.tsv"
STATE="$ROOT/docs/plan/osmu-backlog-state.tsv"
STOP="/tmp/osmu-supervisor.stop"
PROMPTS="$ROOT/docs/plan/backlog-prompts"
rm -f "$STOP"
[ -f "$STATE" ] || printf 'id\tlane\t상태\t시각\t세션\n' > "$STATE"

status_of() { awk -F'\t' -v i="$1" '$1==i{s=$3} END{print s}' "$STATE"; }
mark() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$(date +%H:%M)" "$4" >> "$STATE"; }

# codex-in-pane가 정상 종료해 셸 프롬프트로 돌아왔는데 종료 문구를 남기지 않는
# 경우가 있다. tmux 세션 존재만 보면 이 판을 영원히 실행 중으로 오인하므로,
# pane의 현재 명령이 대기 셸이면 종료로 판정한다.
pane_finished() {
  local sess="$1" cmd
  tmux has-session -t "$sess" 2>/dev/null || return 0
  tmux capture-pane -pt "$sess" 2>/dev/null | tail -40 | grep -q "■ 끝났습니다" && return 0
  cmd="$(tmux display-message -p -t "$sess" '#{pane_current_command}' 2>/dev/null || true)"
  case "$cmd" in
    sh|bash|zsh|fish) return 0 ;;
  esac
  return 1
}

# 그 갈래에서 지금 돌고 있는 세션이 있으면 이름을, 없으면 빈 문자열을 준다.
running_in_lane() {
  local lane="$1" id sess
  while IFS=$'\t' read -r id l st ts sess; do
    [ "$l" = "$lane" ] || continue
    [ "$st" = "돌는중" ] || continue
    [ "$(status_of "$id")" = "돌는중" ] || continue
    if ! pane_finished "$sess"; then
      echo "$sess"; return
    fi
    # pane 이 끝났으면 결과를 판정해 닫는다
    local verdict="끝남"
    if tmux capture-pane -pt "$sess" 2>/dev/null | tail -40 | grep -qE "회수 필요|타임아웃|미완료"; then
      verdict="빈손"
    fi
    mark "$id" "$lane" "$verdict" "$sess"
  done < "$STATE"
  echo ""
}

MAX_PARALLEL="${OSMU_MAX_PARALLEL:-4}"

# 끝난 pane 을 상태표에서 닫는다.
sweep_finished() {
  local id l st ts sess
  while IFS=$'\t' read -r id l st ts sess; do
    [ "$st" = "돌는중" ] || continue
    [ "$(status_of "$id")" = "돌는중" ] || continue
    if pane_finished "$sess"; then
      local verdict="끝남"
      tmux capture-pane -pt "$sess" 2>/dev/null | tail -40 | grep -qE "회수 필요|타임아웃|미완료" && verdict="빈손"
      mark "$id" "$l" "$verdict" "$sess"
    fi
  done < "$STATE"
}

# 지금 실제로 돌고 있는 워커 수.
running_count() {
  local n=0 id l st ts sess
  while IFS=$'\t' read -r id l st ts sess; do
    [ "$st" = "돌는중" ] || continue
    [ "$(status_of "$id")" = "돌는중" ] || continue
    tmux has-session -t "$sess" 2>/dev/null && n=$((n+1))
  done < "$STATE"
  echo "$n"
}

next_pending() {
  local lane="$1" id l pf
  while IFS=$'\t' read -r id l pf; do
    case "$id" in ''|'#'*|id) continue;; esac
    [ "$l" = "$lane" ] || continue
    [ -z "$(status_of "$id")" ] || continue
    echo -e "$id\t$pf"; return
  done < "$BACKLOG"
  echo ""
}

# 워커는 도는 앱에 실제 요청을 보내 증거를 만든다. 앱이 죽으면 그 뒤 모든 판이
# 증거 없이 끝난다. 매 판 돌기 전에 앱을 확인하고 죽었으면 되살린다.
ensure_app() {
  curl -s -o /dev/null --max-time 5 http://localhost:3456/api/health 2>/dev/null && return
  node "$ROOT/scripts/recover-osmu-local-public-env.mjs" >> /tmp/osmu-dev.log 2>&1 || {
    echo "[$(date +%H:%M)] 공개 인증 환경값 복구 실패. 값 없는 앱은 띄우지 않는다."
    return 1
  }
  echo "[$(date +%H:%M)] 앱이 죽어 있다. 되살린다."
  # package.json의 검증된 개발 서버 계약(Webpack)을 우회하지 않는다.
  ( cd "$ROOT/dashboard" && nohup npm run dev -- -p 3456 > /tmp/osmu-dev.log 2>&1 & )
  for _ in $(seq 1 20); do
    sleep 3
    curl -s -o /dev/null --max-time 5 http://localhost:3456/api/health 2>/dev/null && {
      echo "[$(date +%H:%M)] 앱을 되살렸다."; return; }
  done
  echo "[$(date +%H:%M)] 앱을 되살리지 못했다. 다음 판의 증거가 부실할 수 있다."
}

echo "[$(date +%H:%M)] 감독 시작. 백로그 $BACKLOG"
idle_rounds=0
while :; do
  [ -f "$STOP" ] && { echo "[$(date +%H:%M)] 멈춤 요청을 받아 종료한다."; break; }
  dispatched=0
  # 자리가 남았는데 던질 판이 없으면 먼저 채운다. 예전에는 "아무도 안 돌 때"만
  # 채워서, 오래 도는 워커 하나가 남아 있으면 나머지 자리가 계속 비어 있었다
  # (회장 2026-08-28 "또 멍때리고 있지").
  sweep_finished
  if [ "$(running_count)" -lt "$MAX_PARALLEL" ]; then
    if [ -z "$(next_pending build)" ] && [ -z "$(next_pending fe)" ] &&
       [ -z "$(next_pending review)" ] && [ -z "$(next_pending qa)" ]; then
      bash "$ROOT/scripts/refill-backlog.sh" 2>&1 | grep "백로그에" || true
    fi
  fi
  # 갈래당 한 명이 아니라 전체 동시 MAX_PARALLEL 명까지 돌린다.
  # 갈래당 1명이면 같은 갈래 판이 줄줄이 대기해 회장 눈에는 멈춘 것으로 보인다
  # (회장 2026-08-28 "안된거 다 매워").
  sweep_finished
  for lane in build fe review qa; do
    while [ "$(running_count)" -lt "$MAX_PARALLEL" ]; do
    entry="$(next_pending "$lane")"
    [ -z "$entry" ] && break
    id="${entry%%$'\t'*}"; pf="${entry##*$'\t'}"
    prompt="$PROMPTS/$pf"
    if [ ! -f "$prompt" ]; then
      echo "[$(date +%H:%M)] $id 프롬프트 없음: $prompt"
      mark "$id" "$lane" "프롬프트없음" "-"
      continue
    fi
    sess="osmu-$id"
    ensure_app
    echo "[$(date +%H:%M)] $lane 갈래가 비었다. $id 를 던진다."
    # 45분 기본은 이 레포의 판 하나에 짧다. build5·fe4 가 실제 작업을 끝내고
    # 보고를 쓰다가 잘렸다. 90분으로 늘린다.
    role="code-builder"
    [ "$lane" = "review" ] && role="code-reviewer"
    [ "$lane" = "qa" ] && role="qa-verifier"
    if CODEX_TIMEOUT="${CODEX_TIMEOUT:-5400}" bash "$HOME/.claude/harness/bin/codex-in-pane.sh" "$sess" "$role" "$prompt" >/dev/null 2>&1; then
      mark "$id" "$lane" "돌는중" "$sess"; dispatched=1
    else
      echo "[$(date +%H:%M)] $id 발주 실패"
      mark "$id" "$lane" "발주실패" "$sess"
    fi
    done
  done

  # 두 갈래 모두 비었고 던질 것도 없으면 백로그가 소진된 것이다.
  if [ "$dispatched" = "0" ] &&
     [ "$(running_count)" = "0" ] &&
     [ -z "$(next_pending build)" ] && [ -z "$(next_pending fe)" ] &&
     [ -z "$(next_pending review)" ] && [ -z "$(next_pending qa)" ]; then
    # 백로그가 비었다고 죽지 않는다(회장 2026-08-28 "대기하고 있다가 재지시하라").
    # 죽으면 다음 판을 사람이 손으로 걸어야 한다. 그게 멍때림의 원인이었다.
    # 할 일이 없으면 스스로 만들어 채운다. 감독이 살아 있어도 백로그가 비면
    # 멈춘 것과 같기 때문이다(회장 2026-08-28 두 번째 지적).
    bash "$ROOT/scripts/refill-backlog.sh" 2>&1 | grep "백로그에" || true
    idle_rounds=$((idle_rounds+1))
    if [ "$idle_rounds" = "2" ] || [ $((idle_rounds % 30)) = "0" ]; then
      echo "[$(date +%H:%M)] 백로그가 비었다. 새 판이 들어올 때까지 기다린다(대기 ${idle_rounds}회)."
    fi
  else
    idle_rounds=0
  fi
  # 회장이 아침에 열어 볼 한 장을 매 순회마다 새로 쓴다.
  bash "$ROOT/scripts/build-morning-report.sh" >/dev/null 2>&1 || true
  sleep 60
done
bash "$ROOT/scripts/build-morning-report.sh" >/dev/null 2>&1 || true
