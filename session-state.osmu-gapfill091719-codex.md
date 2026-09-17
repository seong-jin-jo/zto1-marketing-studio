# OSMU 성과 시계열 갭 재확인 인계

최신 갱신: 2026-09-17 19:29 KST

## 무엇을 어디까지 했나

- 사용자 명시 과제를 primary handoff basis로 삼았다. 다른 tmux pane은 동시 작업과 localhost 소유권 확인에만 사용했다.
- 두 기반 감사, v63 프로토타입, 요구 대장 포인터와 정본, OSMU 사업 좌표, 현재 schema, migrations와 `/api/metrics` 구현을 다시 대조했다.
- 과거 갭 중 현재도 남은 기본 흐름 항목은 게시물별 성과 관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교 하나다.
- `pipeline-state.osmu.md`의 현재 공정은 `qa`, `in-progress`, 승인 아님이다. 성과 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준의 승인 기술설계가 없어 제품 소스와 DB migration은 수정하지 않았다.
- 최신 NG와 회수 사유를 `docs/qa/qa-tracker.md`와 갭 재확인 문서에 갱신해 커밋 `4a447d6a`로 남겼다.

## 검증했나

- `npm run test`: 374파일, 2,416건 통과, 3건 제외.
- `npx tsc --noEmit`: 종료 코드 0.
- `verify-basic-flow-e2e.mjs`: 자격증명 주입 뒤 localhost 실제 요청 11/11 통과.
- `verify-studio-v1-e2e.mjs`: 자격증명 주입 뒤 localhost 실제 요청 14/14 통과.
- `GET /api/health`: HTTP 200, DB up, 실행 `build_commit=0fc655676c5ddcf78b0d3fa8595bb37906560cba`.
- 지정 작업 공간 `GET /api/metrics`: HTTP 200, 최상위 키 `posts`, `coverage`, 게시물 0건, `history`와 `comparison` 없음.
- 현재 HEAD는 `2aac6c14a012999e128065e9cd3a6285cb8e172c`이며 실행 서버 이후 제품 경로 diff 5개는 브라우저 런처와 연결 오류 분류 변경이다. 성과 시계열 구현은 없다.
- `design-lint.sh dashboard/src`: 디자인 토큰 위반 0.

## 남은 이슈·블로커

- 컨트롤러와 tech-architect가 게시물별 snapshot 저장 모델, 멱등 키, 보존 기간, 공급자별 원본과 정규화 지표, 최근 30일과 직전 30일 비교식, 표본 부족 기준을 합의한다.
- eng-design을 승인하고 build를 다시 연 뒤 code-builder가 migration, RLS, 수집 저장, history와 comparison 응답, 정상·거절·경합 테스트를 구현한다.
- 종료 증거는 최신 HEAD와 일치하는 localhost에서 `history`, `comparison` 실응답, 전체 회귀와 두 E2E 통과다.

## 다음에 칠 명령

eng-design 승인과 build 재개 뒤 아래 순서로 실행한다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
set -a && source ./.env.local && set +a
npm run test
npx tsc --noEmit
node scripts/verify-basic-flow-e2e.mjs
node scripts/verify-studio-v1-e2e.mjs
```

## 범위 보존

- 제품 소스, DB와 API 계약 변경 0건. 갭 재확인 문서, QA 트래커와 이 인계 파일만 갱신했다.
- 공유 작업 트리의 다른 세션 변경은 stage, commit, revert하지 않았다.
- 운영 배포와 외부 공급자의 실제 기간 성과는 미검증이다.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 관측 이력, 재현 가능한 30일 비교, YouTube 기간 보고와 TikTok 누계 성과 계약을 검색했다.
HITS_USED: BRAIN business index, repo 사업 좌표, 두 갭 감사, v63 성과 계약, Google YouTube Analytics와 TikTok Video Query 공식 문서를 잔여 갭과 저장 계약 선행 필요성 판정에 사용했다.
HITS_REJECTED: 일반 마케팅 자료와 TikTok Research API는 고객용 저장 및 비교 계약의 근거가 아니어서 제외했다.
CONFLICTS: 외부 공식 계약과 회장 사업 정본의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀은 충돌하지만 이번 비화면 판정에는 영향을 주지 않는다.
