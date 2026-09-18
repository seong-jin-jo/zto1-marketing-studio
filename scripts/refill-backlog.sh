#!/usr/bin/env bash
# refill-backlog.sh: 백로그가 비면 다음 판을 스스로 만들어 채운다.
#
# 왜 (회장 2026-08-28 "지금 또 멈췄지? 원인 분석해라"):
#   감독을 죽지 않게 고쳤더니 이번엔 "살아 있는데 할 일이 없어" 멈췄다.
#   백로그가 내가 손으로 쓴 고정 목록이라, 다 비면 새 판을 넣는 유일한 경로가
#   다시 내 손이었다. 감독은 일을 만들어 내지 못한다.
#   그래서 백로그를 채우는 일 자체를 자동화한다.
#
# 두 가지 원천에서 채운다.
#   ① 아직 처리하지 않은 검수 산출물(리뷰·QA 지적 문서) → 그 지적을 고치는 판
#   ② 상시 회전하는 품질 점검 → ①이 없어도 마르지 않게
#
# 사용: refill-backlog.sh   (감독이 대기 상태일 때 부른다)
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
BACKLOG="$ROOT/docs/plan/osmu-backlog.tsv"
STATE="$ROOT/docs/plan/osmu-backlog-state.tsv"
PROMPTS="$ROOT/docs/plan/backlog-prompts"
SEEN="$ROOT/docs/plan/backlog-consumed.txt"
touch "$SEEN"

has_pending() {
  while IFS=$'\t' read -r id lane pf; do
    case "$id" in ''|'#'*|id) continue;; esac
    grep -q "^$id	" "$STATE" 2>/dev/null || { echo yes; return; }
  done < "$BACKLOG"
  echo no
}
[ "$(has_pending)" = "yes" ] && exit 0

add() { # add <id> <lane> <프롬프트파일명>
  grep -q "^$1	" "$BACKLOG" 2>/dev/null && return
  printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$BACKLOG"
  echo "[$(date +%H:%M)] 백로그에 $1 을 넣었다."
}

COMMON='
공통 규율(어기면 반려된다):
- 기반 산출물을 반드시 Read 하고 시작한다. 임의 재해석 금지.
  승인 기준은 pipeline-state.osmu.md의 작업 대상 방별 approved_artifacts와 승인 범위에서 확인한다.
  DESIGN.md와 docs/design/README.md를 함께 읽고 실제 채택한 승인 파일·버전·근거를 기록한다.
  과거 v63 비교 결과는 보존한다. 후보 버전이나 다른 방의 증분 승인을 전체 승인으로 확대하지 않는다.
  승인 기록과 문서가 어긋나면 해당 디자인 정합은 미검증으로 남기고 충돌 근거를 보고한다. 임의 기준 완화 금지.
  회장 확정 요구 대장 docs/requests/회장-확정-요구사항-대장.md
  사업 좌표 wiki/product/사업좌표-OSMU와-ZERO-ONE.md
- 완료 = 증거. 도는 앱(localhost:3456)에 실제 요청을 보내 관찰하고 붙여라. mock 통과는 증거가 아니다.
- npm run test 와 npx tsc --noEmit 통과 필수.
- dashboard/scripts/verify-basic-flow-e2e.mjs 와 verify-studio-v1-e2e.mjs 가 계속 통과해야 한다.
- 자격증명은 dashboard/.env.local, 작업 공간은 cd1d0a40-540d-4524-9b49-bf2445d82182.
- 범위를 넘지 마라. 중간중간 커밋해라. 거짓 완료 금지.
- 사족 문구 금지. 긴 대시 금지. 이모지 금지. 영문 단추 라벨 금지.
- 끝나면 docs/qa/qa-tracker.md 에 증거를 적고 커밋해라.
'

# ── 원천 1: 아직 안 고친 검수 지적 문서 ──────────────────────
n=0
for doc in "$ROOT"/docs/audit/*review*.md "$ROOT"/docs/qa/osmu-qa-*.md; do
  [ -f "$doc" ] || continue
  key=$(basename "$doc")
  grep -qxF "$key" "$SEEN" && continue
  n=$((n+1)); id="fixdoc$(date +%m%d)$n"
  cat > "$PROMPTS/$id.txt" <<EOF
검수 산출물의 지적을 고친다. 지적한 사람이 아니라 고치는 사람으로 접근해라.

지적 전문(반드시 먼저 Read): ${doc#$ROOT/}

할 일:
1. 그 문서의 지적을 심각도 순으로 정렬한다. 돈이 새거나 격리가 뚫리거나 기본 흐름이 끊기는 것이 최상위다.
2. 위에서부터 고친다. 고칠 때마다 그 문서에 적힌 재현 시나리오를 실제로 돌려 이제 안 깨지는 것을 보여라.
3. 고칠 수 없거나 지적이 틀렸다고 판단하면 그 근거를 적어라. 무시하지 마라.
4. 회귀 방지 테스트를 남겨라. 같은 것이 다시 들어오면 시험이 먼저 잡아야 한다.

다 못 고치면 어디까지 했는지 정확히 적어라.
$COMMON
EOF
  add "$id" build "$id.txt"
  echo "$key" >> "$SEEN"
done
[ "$n" -gt 0 ] && exit 0

# ── 원천 2: 상시 회전 품질 점검 ──────────────────────────────
# ①이 없을 때도 마르지 않게 한다. 매번 다른 것을 집도록 회전한다.
slot=$(( $(date +%s) / 3600 % 4 ))
stamp=$(date +%m%d%H)
case "$slot" in
  0) id="sweep$stamp"; lane=qa; cat > "$PROMPTS/$id.txt" <<EOF
읽기 경로 전수 실사를 다시 돌린다.

지난 실사는 docs/audit/openclaw-api-live-sweep-2026-08-28.md 다. 그 뒤로 코드가 많이 바뀌었다.

할 일: dashboard/src/app/api/**/route.ts 중 읽기를 내보내는 경로 전부에 실제 요청을 보내 상태코드를 관찰한다.
고장난 것(500)과 의도된 거절을 가른다. 고장은 고치고 회귀 테스트를 남긴다.
지난 실사와 달라진 곳을 표로 대조해라.
$COMMON
EOF
  ;;
  1) id="flowcheck$stamp"; lane=qa; cat > "$PROMPTS/$id.txt" <<EOF
네 방 기본 흐름을 다시 끝까지 통과시킨다. 회장 최우선 항목이다.

할 일:
1. dashboard/scripts/verify-basic-flow-e2e.mjs 를 돌려 백엔드 열한 단계가 여전히 통과하는지 본다.
2. dashboard/scripts/probe-four-room-flow.mjs 를 돌려 네 방이 각각 그려지고 가린 모달이 없는지 본다.
3. 390, 768, 1024, 1440 네 폭에서 사람처럼 눌러 본다. 생성실에서 시작해 성과실까지 실제로 간다.
4. 끊긴 곳을 찾으면 고치고 회귀 테스트를 남긴다.
5. 안 끊겼으면 안 끊겼다고 근거와 함께 적어라.
$COMMON
EOF
  ;;
  2) id="gapfill$stamp"; lane=build; cat > "$PROMPTS/$id.txt" <<EOF
갭 감사에서 아직 못 하는 것으로 남은 항목을 하나 골라 만든다.

기반: docs/audit/osmu-gap-recheck-2026-08-28.md 와 docs/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md

할 일:
1. 두 문서를 대조해 지금도 정말 없는 것을 추린다. 이미 만들어진 것을 다시 만들지 마라.
2. 그중 기본 흐름(생성 편집 발행 성과)에 가장 가까운 것을 하나 골라 만든다.
3. 만든 뒤 갭 재확인 문서를 갱신해 무엇이 이제 되는지 적어라.
$COMMON
EOF
  ;;
  3) id="regress$stamp"; lane=review; cat > "$PROMPTS/$id.txt" <<EOF
최근 들어간 변경을 공격적으로 리뷰한다. 너는 이 코드를 짜지 않았다.

대상: 지난 24시간 커밋 전부와 그 diff.

공격할 것: 돈이 새는가, 격리가 뚫리는가, 동시성, 부분 실패를 전체 성공으로 세는 곳, 사유 없는 삭제,
확정 요구 이탈(사족 문구·긴 대시·이모지·영문 라벨).

산출: docs/audit/osmu-code-review-\$(날짜).md 로 새 문서를 쓴다.
각 지적은 파일:줄로 짚고 재현 시나리오를 쓴다. 심각도를 나눈다.
고치지 마라. 지적만 한다. 문제가 없으면 없다고 근거와 함께 써라.
$COMMON
EOF
  ;;
esac
add "$id" "$lane" "$id.txt"
