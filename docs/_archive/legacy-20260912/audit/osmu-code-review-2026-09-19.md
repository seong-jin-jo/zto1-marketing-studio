# OSMU 최근 24시간 코드 공격 리뷰

<!--
STAMP
created_at: 2026-09-19 04:43 KST
model: gpt-codex/GPT-5
agent: code-reviewer
skill: review
scope: 87779ba0191570bcdbd22418eb69bd049f3561c2..3207b25603f6b58cbbd706e616236d4432190937
basis: pipeline-state.osmu.md approved_artifacts, user-required v63 prototype, DESIGN.md v37, chairman request ledger, OSMU business coordinates
deliberation: 새 API 전수검사 안정성 판정이 실제 실행 소스를 커밋에 결속하는지와 실행 중 일시 변경을 놓치는지 공격했다.
-->

## 한 줄 결론

머지 차단이다. MAJOR 2건이 있으며, API 전수검사가 커밋에 없는 코드나 실행 중 잠깐 바뀐 코드를 검사하고도 해당 커밋의 고정된 증거라고 성공 처리할 수 있다.

## 범위와 기준

- 동결 시각: 2026-09-19 03:55 KST
- 커밋 범위: `87779ba0191570bcdbd22418eb69bd049f3561c2..3207b25603f6b58cbbd706e616236d4432190937`
- 범위 크기: 18개 커밋, 59개 파일, 7,155줄 추가, 123줄 삭제
- 제품 및 검증 코드 변경: 검증 스크립트 4개, 회귀 테스트 2개. `dashboard/src`와 `dashboard/db` 변경 0개
- 최신 승인 디자인 핀: `pipeline-state.osmu.md:287`의 v68 디자인 허브와 `DESIGN.md` v37
- 사용자 지정 필수 대조: v63 `openclaw-auto-4room-v63.html:7734`의 "외부 게시 성공 뒤 내부 기록이 누락된 1건"과 `:9847`의 "외부 게시는 이미 끝났고 내부 기록만 복구가 필요합니다. 다시 발행하지 않습니다."
- PRD 핀: 최신 `approved_artifacts`에 없다. PRD 대조는 미검토다.
- 입력 경로 정정: 지정된 `wiki/product/사업좌표-OSMU와-ZERO-ONE.md`는 존재하지 않아 현재 정본 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`를 읽었다.
- 시각 표현 편차: 코드 리뷰 역할 범위 밖이다. 부품, 기능, 흐름, 상태 존재만 판정했다.

## MAJOR

MAJOR: [회귀 위험] dashboard/scripts/verify-api-read-sweep.mjs:142 - `git rev-parse HEAD`와 health의 `build_commit`만 비교하고, 205행의 시작 해시가 그 커밋의 파일 내용과 같은지는 확인하지 않는다 / 새 안정성 계약 `dashboard/scripts/lib/api-sweep-contract.mjs:52`는 "관측 프로세스와 완전한 소스 목록이 고정돼야 권위 있는 검사"라고 선언하지만, 시작부터 dirty인 코드는 전후 해시와 PID가 같아 `evidence_stable=true`가 된다 / 관련 추적 파일이 HEAD와 같은지 확인하거나 깨끗한 분리 작업 트리의 불변 빌드만 검사하고, 서버가 커밋 문자열과 함께 실제 빌드 내용 해시를 반환하게 해야 한다.

- 재현 시나리오: HEAD의 API route 하나를 커밋하지 않고 수정한 뒤 `npm run dev`를 시작한다. `OSMU_BUILD_COMMIT`은 여전히 HEAD이고 수정 파일은 검사 전후 동일하므로 151행과 293행 검사를 모두 통과한다. 전수검사는 커밋에 없는 동작을 읽고도 HEAD 증거로 종료 코드 0을 낼 수 있다.

MAJOR: [회귀 위험] dashboard/scripts/verify-api-read-sweep.mjs:205 - 실행 시작과 끝의 두 스냅샷만 비교해 검사 도중 생겼다가 원복된 변경을 검출하지 못한다 / `dashboard/scripts/lib/api-sweep-contract.mjs:67`은 시작 해시와 끝 해시의 동등성만 안정성으로 세므로, 개발 서버의 hot reload가 같은 PID 안에서 중간 코드를 제공해도 마지막에 파일을 되돌리면 전체 요청을 단일 소스에서 얻은 것처럼 성공 처리한다 / 개발 서버 대신 불변 production build를 쓰거나 검사 동안 파일 변경 이벤트를 기록해 한 번이라도 바뀌면 실패시키고, 결과에 각 요청이 관측한 빌드 식별자를 결속해야 한다.

- 재현 시나리오: 순차 전수검사가 시작 해시를 얻은 뒤 아직 호출하지 않은 후반 route를 수정하고 hot reload 완료 뒤 그 route 응답을 받는다. 검사가 끝나기 전에 파일을 원복한다. PID와 시작 및 끝 해시와 route 목록이 모두 같아 351행은 종료 코드 0을 낼 수 있지만 결과는 두 소스 버전이 섞였다.

## MINOR

MINOR: [회귀 위험] dashboard/tests/integrity/four-room-token-request-timeout.regression-1.test.ts:17 - 회귀 테스트가 두 파일 어딘가에 `Math.min(readyTimeoutMs,` 문자열이 있고 `15_000` 문자열이 없는지만 확인한다 / 주석 `:5`의 사고는 고객 토큰 요청의 실제 중단 시간이 잘못 결속된 것이지만, 현재 검사는 무관한 함수에 같은 문자열이 남아 있어도 통과한다 / 제한시간 계산을 함수로 분리해 단위 검사하거나 지연 HTTP 서버로 `/api/tenant-tokens` 요청의 실제 중단 시각을 검증해야 한다.

- 재현 시나리오: `request()`를 다시 15초 고정값으로 바꾸고 파일의 사용하지 않는 함수에 `Math.min(readyTimeoutMs, deadlineAt - Date.now())`를 남긴다. 제품 사고가 되살아났는데도 이 테스트는 통과한다.

MINOR: [회귀 위험] dashboard/tests/api/api-read-sweep-inventory-stability.regression-1.test.ts:21 - 새 테스트는 호출자가 손으로 넘긴 배열을 순수 함수가 비교하는지만 확인하고, `verify-api-read-sweep.mjs`가 종료 시 파일과 route를 다시 수집하거나 불안정 결과에서 비정상 종료하는지는 검증하지 않는다 / 이번 변경의 목적은 실제 장시간 전수검사의 증거 안정성인데 배선이 빠져도 helper 테스트 3건은 계속 통과한다 / 임시 API 트리에서 실행 중 route를 추가 및 삭제하고 실제 스크립트의 `evidence_stable=false`와 종료 코드 1을 확인하는 통합 검사를 추가해야 한다.

- 재현 시나리오: 285행의 종료 시 `collectRouteFiles`를 시작 목록 재사용으로 되돌리되 helper는 그대로 둔다. 새 테스트 3건은 모두 통과하지만 원래 결함이 다시 열린다.

## 실행 증거

- `npm run test`: 통과. 378개 파일, 2,431건 통과, 3건 제외, 종료 코드 0, 1,431.06초.
- `npx tsc --noEmit`: 통과, 종료 코드 0.
- `GET http://localhost:3456/api/health`: HTTP 200. 실행 커밋 `d0bc4f7b`, 검토 HEAD `3207b256`.
- `dashboard/scripts/verify-api-read-sweep.mjs`: 실행 전 커밋 귀속 검사에서 종료 코드 1. 서버 `d0bc4f7b`, 기대 `3207b256` 불일치로 실제 route 요청 전에 차단됐다.
- `dashboard/scripts/verify-basic-flow-e2e.mjs`: 종료 코드 1. 첫 생성이 후보 0장과 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 끝났다.
- `dashboard/scripts/verify-studio-v1-e2e.mjs`: 종료 코드 1. 401, 400, 422 거절 3건은 통과했고 정상 생성은 기대 201 대신 HTTP 200의 `STUDIO_LLM_PROVIDER_UNAVAILABLE`였다.
- `git diff --check 87779ba0..3207b256`: 통과.
- 실제 외부 SNS 발행, 운영 배포, 두 작업 공간 동시 공격은 미검증이다.

## 셀프심문

질문: 내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?

답: 전수검사 도중 다른 세션이 route를 잠깐 고쳤다가 되돌렸는데도 검사기가 `증거 고정 PASS`를 내고 HEAD의 증거로 기록하는 문제다. 위 두 MAJOR가 이 거짓 성공을 막지 못하므로 PASS를 주지 않는다.

## 벤치마크 적용

- OWASP Multi Tenant Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
  - 차용: 검증은 애플리케이션과 같은 역할, 연결 경로, 풀링 모드에서 실행하고 권한 행렬과 두 tenant 경계를 실제로 공격해야 한다.
  - 변경: 이번 diff는 인증 구현을 바꾸지 않아 새 격리 결함으로 세지 않았고, 실앱 두 tenant 동적 공격은 미검증으로 남겼다.
- OWASP Authorization Regression Testing Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Regression_Testing_Cheat_Sheet.html
  - 차용: 변경마다 자동 권한 회귀와 tenant 경계 검사를 지속해야 한다는 기준.
  - 변경: 단순 source 문자열 검사를 실제 실행 통합 검사로 바꾸라는 MINOR 기준에 적용했다.
- Node.js Global Objects 문서: https://nodejs.org/docs/latest/api/globals.html
  - 차용: `AbortSignal.timeout()`은 유효한 요청 제한시간 수단이다.
  - 변경: 120초 자체는 결함으로 잡지 않고, 그 값이 고객 토큰 요청에 실제 결속됐는지 검증하지 않는 테스트만 지적했다.

SKILLS_USED: review
SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: OSMU 사업 좌표, 회장 확정 요구, v63 기록 복구 계약, API 전수검사 증거 안정성, tenant 권한 회귀, Node 요청 제한시간을 검색했다.
HITS_USED: `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`는 돈이 걸린 동작과 자동화 증거의 진실성을 판정하는 데 사용했다. `wiki/거버넌스/요청.md`는 동시성, 부분 성공, 삭제와 문구 금지 기준에 사용했다. v63, v68, `DESIGN.md`는 승인 계약 대조에 사용했다. OWASP와 Node 공식 문서는 격리 및 실행 검증 기준에 사용했다.
HITS_REJECTED: BRAIN의 범용 사업 레버리지 자료는 이번 검증기 diff의 파일별 결함 판정에 직접 영향을 주지 않아 채택하지 않았다. PostgreSQL 잠금 문서는 이번 24시간 코드 변경에 DB 및 queue 변경이 없어 채택하지 않았다.
CONFLICTS: `pipeline-state.osmu.md`의 최신 승인 디자인 허브는 v68이지만 과제는 v63을 필수 대조로 지정했다. 이번 변경은 제품 UI가 없어 두 시안의 차이가 판정에 영향을 주지 않았다. 최신 승인 핀에 PRD가 없어 PRD 대조는 미검토다. 지정 사업 좌표 경로는 없고 현재 정본은 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`다.

SOURCES: `pipeline-state.osmu.md`, `DESIGN.md`, `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`, `docs/design/prototypes/legacy-prototype-20260912/prototype/osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html`, `wiki/거버넌스/요청.md`, `wiki/거버넌스/결정.md`, `wiki/거버넌스/실수.md`, `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`, OWASP Multi Tenant Security Cheat Sheet, OWASP Authorization Regression Testing Cheat Sheet, Node.js Global Objects
MODEL: gpt-codex/GPT-5

## 4축 판정

- 승인 시안 이탈: 문제없음. 변경된 코드 6개는 검증 스크립트와 테스트뿐이며 v63과 v68의 화면 부품, 기능, 흐름, 상태를 삭제하거나 바꾸지 않았다. PRD는 승인 핀이 없어 미검토다.
- 회귀 위험: 지적 4건. 커밋과 실행 소스 결속 누락 1건, 실행 중 변경 및 원복 경합 1건, 실제 제한시간 배선 미검증 1건, 종료 재수집 배선 미검증 1건.
- 토큰 위반: 문제없음. 변경 범위에 제품 UI 스타일이 없고 새 색상 리터럴, 인라인 스타일, 사용자 노출 긴 대시, 그림문자, 영문 단추 라벨이 없다.
- 무기록 삭제: 문제없음. 제품 코드와 화면 파일 삭제 0건이며 검증 스크립트의 기존 기능 삭제도 없다.

REVIEW_VERDICT: BLOCK
