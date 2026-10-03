#!/usr/bin/env bash
# 카드 파생 output_tokens 실측 재현 스크립트 (회장 리뷰 2026-09-21 MINOR9).
#
# llm.ts:143~150 주석의 "실측(PR3, 2026-09-21): output_tokens 1672/1701/3816" 근거가
# 코드 주석에만 있고 레포에 재현 가능한 로그가 없었다. 이 스크립트가 그 갭을 메운다.
#
# 공유 Claude CLI(claude -p)가 주간 한도에 걸려 있는 동안은 이 스크립트를 직접 돌릴 수
# 없다(같은 제약이 docs/eng-design/osmu-quality-stage1-v1-claude-opus.md §12 리스크
# "공유 Claude CLI 7일 한도 100%"에 이미 적혀 있다). 한도가 풀리면 아래를 그대로 실행해
# usage_events.meta 에서 이번 실측과 같은 값을 재현하는지 대조한다.
#
# 사용법:
#   ./measure-max-output-tokens.sh <workspace_id>
# 전제: 그 워크스페이스에 학습 정보가 채워진 카드 파생 요청을 POST 로 3회 보낸 뒤 돌린다.

set -euo pipefail
WORKSPACE_ID="${1:?워크스페이스 id 를 인자로 넘기세요}"

echo "# 최근 studioLlmAttempt(operation=generation.derivation.card) 3건의 output_tokens"
psql "${DATABASE_URL:?DATABASE_URL 환경변수가 필요합니다}" -v ON_ERROR_STOP=1 <<SQL
SELECT
  meta->>'attempt' AS attempt,
  meta->>'status' AS status,
  meta->>'model' AS model,
  meta->>'output_tokens' AS output_tokens,
  created_at
FROM usage_events
WHERE tenant_id = '${WORKSPACE_ID}'
  AND event_type = 'studioLlmAttempt'
  AND meta->>'operation' = 'generation.derivation.card'
ORDER BY created_at DESC
LIMIT 3;
SQL
