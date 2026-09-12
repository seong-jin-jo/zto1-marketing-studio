# OSMU API 읽기 경로 전수 재실사 핸드오프

업데이트: 2026-09-13 03:00 KST
라인: osmu
작업 목적: API 읽기 경로 전수 실사 재검증
handoff basis: 회장 요청 원문과 tmux `osmu-sweep091301:0.0`

## 무엇을 어디까지 했나

- canonical `pipeline-state.osmu.md`는 착수 시 이미 `current_stage: qa`였다. 승인 단계는 바꾸지 않았다.
- localhost:3456에서 GET Route Handler 105개와 명시적 HEAD 1개를 실제 호출했다.
- 최종 분류는 정상 92개, 의도된 거절 13개, 원인불명 500과 요청 실패 0개다.
- 전수 뒤 공유 작업 트리에서 바뀐 GET 3개를 현재 소스로 재호출했다. Higgsfield 거래, 성과 학습 규칙, Studio 학습 정보는 모두 HTTP 200이었다.
- 새 코드 결함이 없어 제품 코드는 수정하지 않았다.
- 보고서와 원본 증거, qa-tracker, 구현현황, wiki handoff를 `823bc295`에 커밋했다. 최종 API 소스 해시 정정은 `b425c544`에 커밋했다.
- 상세 보고서: `docs/qa/osmu-api-read-sweep-v5-gpt-codex-20260913-0248.md`.
- 원본 증거: `logs/diff/osmu-api-read-sweep-20260913.json`.

## 남은 이슈·블로커

- 로컬 API 읽기 범위는 PASS지만 제품 전체 QA는 NG다.
- 승인 디자인 v63과 pipeline 핀 v68이 충돌하며 기존 디자인 정합 행렬의 공통 셸, 열 수, 담당 패널, 요소 순서, 버튼 위계가 NG다.
- 실제 외부 OAuth, 채널 실발행, 운영 배포는 미검증이다.
- `verify-agent-quality.sh`는 운영 또는 스테이징 접촉 증거가 0건이라 반려했다. `~/.claude/harness/deploy-hosts.tsv`에도 이 서비스의 검증 호스트가 검색되지 않았다.
- Studio v1 E2E에서 무료 재생성 POST가 한 번 예상 밖 HTTP 200이었으나 즉시 수동 재호출과 전체 재실행에서는 계약상 409였다. 비재현 관찰로 남겼다.

## 다음에 칠 명령

API 소스가 다시 바뀌었는지 먼저 대조한다.

```bash
find dashboard/src/app/api -name route.ts -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

출력이 보고서의 `ca1c9a1428b513ee114f5bedd6905f86927b1d931ca098eb98f940853b3b931a`와 다르면 localhost 전수를 다시 실행한다.

```bash
cd dashboard && set -a && source .env.local && set +a && API_SWEEP_BASE_URL=http://127.0.0.1:3456 API_SWEEP_WORKSPACE_ID=cd1d0a40-540d-4524-9b49-bf2445d82182 API_SWEEP_OUTPUT=../logs/diff/osmu-api-read-sweep-next.json node scripts/verify-api-read-sweep.mjs
```

제품 전체 QA를 닫으려면 컨트롤러가 검증 가능한 운영 또는 스테이징 호스트를 `deploy-hosts.tsv`에 등록하고, product-designer가 v63 또는 v68 핀을 하나로 확정한 뒤 QA에 재위임한다. 종료 증거는 운영 또는 스테이징 API 전수 결과, 디자인 3폭 정합 PASS, 실제 OAuth·발행 permalink·성과 응답이다.

## 검증했나

| 항목 | 결과 |
|---|---|
| GET 전수 | 105개, 정상 92, 의도된 거절 13, 원인불명 500과 요청 실패 0 |
| HEAD | 없는 미디어 토큰 HTTP 404, 의도된 거절 |
| 집중 회귀 | 3파일, 30건 PASS |
| 전체 Vitest | 302파일, 2,033건 PASS, 3건 스킵, 실패 0 |
| TypeScript | `npx tsc --noEmit`, exit 0 |
| production build | 정적 페이지 182/182, exit 0 |
| seed와 health | 멱등 seed PASS, 최종 health HTTP 200과 DB up |
| 기본 흐름 | 11/11 PASS |
| Studio v1 | 재실행 14/14 PASS |
| 디자인 lint | 위반 0 |
| 운영 또는 스테이징 | 미검증, 상위 QA 품질 게이트 FAIL |

SKILLS_USED: qa, API 전수 실호출·회귀·E2E·증거 기록 / SKILLS_SKIPPED: 없음
