# OSMU 성과 시계열 갭 재확인 인계

최신 갱신: 2026-09-17 15:16 KST

## 무엇을 어디까지 했나

- 사용자 명시 과제를 primary handoff basis로 삼았다. `osmu-gapfill091715:0.0`은 이 작업을 실행한 code-builder pane이다.
- 두 기반 감사, v63 프로토타입, 확정 요구 대장, OSMU 사업 좌표, 현재 schema, migrations와 `/api/metrics` 구현을 대조했다.
- 과거 갭 11개 중 10개는 현행 코드에 구현돼 있다. 남은 하나는 게시물별 성과 관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교다.
- 현재 `pipeline-state.osmu.md`는 `current_stage: qa`, `status: in-progress (승인 아님)`이다. 제품 소스, DB, API 계약과 문서는 수정하지 않았다.
- 같은 차단 판정과 증거는 이미 커밋 `1071da9e` 및 `docs/qa/qa-tracker.md`의 2026-09-17 11시 06분 항목에 기록돼 있어 중복 기록하지 않았다.

## 남은 이슈·블로커

- 성과 관측 단위, 멱등 키, 보존 기간, 공급자별 누계·기간 지표 정규화, 최근 30일 비교식과 표본 부족 기준의 승인 기술설계가 없다.
- code-builder가 별도 snapshot table, 공급자 기간 조회, 기존 JSONB 중 하나를 선택하면 DB 스키마와 API 계약을 임의 결정하게 된다.
- 추천안은 게시물별 snapshot 전용 table이다. 재현성과 감사 가능성이 가장 높지만 migration, RLS, 보존 정책 승인이 필요하다.
- 사용자 지정 v63 프로토타입과 canonical v68 디자인 핀 충돌은 남아 있다. 이번 비화면 판정에서는 어느 쪽도 선택하지 않았다.
- 공유 작업트리에 다른 세션 변경이 남아 있어 범위 밖 파일을 stage하거나 commit하지 않았다.

## 다음에 칠 명령

컨트롤러와 tech-architect가 기술설계를 승인하고 build를 다시 연 뒤 아래 순서로 실행한다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
set -a && source ./.env.local && set +a
npm run test
npx tsc --noEmit
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

종료 증거는 신규 migration과 API 계약 테스트의 정상·거절·경합 통과, 지정 작업 공간의 `history`·`comparison` 실응답, 전체 회귀와 두 E2E 통과다.

## 검증했나

- localhost 실행 앱과 현재 HEAD 사이 `dashboard/src`, `dashboard/db`, `dashboard/scripts` 제품 diff 0건.
- `GET /api/metrics`: HTTP 200, 최상위 키 `coverage`, `posts`, 게시물 0건. `history`, `comparison` 없음.
- `npm run test`: 374파일, 2,414건 통과, 3건 제외, 종료 코드 0.
- `npx tsc --noEmit`: 종료 코드 0.
- `verify-basic-flow-e2e.mjs`: 11/11 통과.
- `verify-studio-v1-e2e.mjs`: 14/14 통과.
- 운영 배포와 외부 공급자의 실제 기간 성과는 미검증이다.

KNOWLEDGE_QUERY: OSMU 성과 시계열, 30일 비교, YouTube 기간 보고서, TikTok 영상 누계 성과를 검색했다.
HITS_USED: BRAIN 사업 허브, 두 갭 감사, v63 성과 계약, Google YouTube Analytics와 TikTok Video Query 공식 문서를 잔여 갭 및 저장 계약 선행 필요성 판정에 사용했다.
HITS_REJECTED: 일반 마케팅 자료와 TikTok Research API는 고객용 저장 및 비교 계약의 근거가 아니어서 제외했다.
CONFLICTS: 외부 공식 계약과 회장 사업 정본의 충돌은 없다. v63과 v68 디자인 핀은 충돌하며 이번 작업에서 선택하지 않았다.
