# OSMU 코드 리뷰 2026-09-18

<!--
STAMP
created_at: 2026-09-18 18:15 KST
model: gpt-codex/GPT-5
agent: code-reviewer
skill: review
scope: 5cd501b36a7c9eacf628538efb4b26a685d1b62a..ddafa8ea31cc6479bcdb0cb1e20a54e2407c0ba0
basis: pipeline-state.osmu.md approved_artifacts, v63 required prototype, v68 approved design hub, DESIGN.md v37, chairman request ledger, OSMU business coordinates
deliberation: 발행 복구와 사용량 원장을 외부 성공 증명, 객체 결속, 단계별 복구, 기간 귀속, 적체 종료 조건, 오류 상태 계약에서 공격했다.
-->

## 한 줄 결론

머지 차단이다. MAJOR 7건과 MINOR 1건이 있으며, 외부 성공 위조, 다른 초안 완료 처리, 예약 발행 사용량 영구 적체, 과금 기간 이동, 적체 축소 집계 가능성이 있다.

## 범위와 기준

- 24시간 기준 시각: 2026-09-18 12:10 KST. 첫 포함 커밋은 2026-09-17 12:19 KST다.
- 최종 동결 시각: 2026-09-18 18:15 KST. 리뷰 중 추가된 문서 전용 커밋 2개도 포함했다.
- 커밋 범위: `5cd501b36a7c9eacf628538efb4b26a685d1b62a..ddafa8ea31cc6479bcdb0cb1e20a54e2407c0ba0`
- 범위 크기: 60개 커밋, 196개 파일, 11,132줄 추가, 82줄 삭제.
- 제품 코드 범위: `dashboard/src`, `dashboard/scripts`, `dashboard/db`, `dashboard/tests` 아래 31개 파일, 724줄 추가, 64줄 삭제.
- 커밋된 삭제 파일: 0개.
- 최신 승인 핀: `pipeline-state.osmu.md:277`의 v68 디자인 허브와 `DESIGN.md` v37.
- 사용자 지정 필수 대조: `openclaw-auto-4room-v63.html:7734`의 "외부 게시 성공 뒤 내부 기록이 누락된 1건입니다. 같은 콘텐츠를 다시 게시하지 않습니다."
- 요청 대장의 지정 경로와 v63 및 v68 프로토타입은 작업 트리에서 실제 파일을 열어 대조했다.
- 사업 좌표의 지정 경로 `wiki/product/사업좌표-OSMU와-ZERO-ONE.md`는 존재하지 않았다. 검색으로 확인한 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`를 읽었다.
- 최신 `approved_artifacts`에 PRD 핀이 없다. PRD 대조는 미검토다.
- 시각 표현 편차는 코드 리뷰 범위 밖이라 미검토했다. 부품, 기능, 흐름, 상태 존재만 판정했다.

## MAJOR

MAJOR: [승인 시안 이탈] dashboard/src/app/api/publish/reconcile/route.ts:41 - 클라이언트가 보낸 `publicationId`가 현재 작업 공간에 속하고 플랫폼만 같으면 기존 상태와 공급자 성공 증거를 확인하지 않고 66행에서 `published`로 바꾼다 / v63 `openclaw-auto-4room-v63.html:7734`의 "외부 게시 성공 뒤 내부 기록이 누락된 1건"과 `:9847`의 "외부 게시는 이미 끝났고 내부 기록만 복구"는 외부 성공이 확인된 건만 복구하라는 계약이다 / 공급자 성공 직후 서버가 발급한 일회성 복구 증표를 발행 식별자와 결속하거나 공급자 조회로 성공을 재확인하고, `failed` 행은 거절해야 한다.

- 재현: 현재 작업 공간에서 상태가 `failed`인 발행 행 식별자를 가져와 같은 플랫폼과 임의의 외부 식별자로 `/api/publish/reconcile`에 보낸다. 공급자 조회 없이 해당 행을 `published`로 바꾸고 사용량 기록까지 시도한다.

MAJOR: [회귀 위험] dashboard/src/app/api/publish/reconcile/route.ts:42 - `publicationId` 경로의 잠금 조회가 행의 `draft_id`를 읽지 않고, 83행은 요청자가 함께 보낸 별도 `draftId`를 그대로 `markQueuePublished`에 넘긴다 / 발행 복구는 성공한 발행과 그 원본 초안 및 승인 큐를 함께 닫아야 하는데, 현재 구현은 같은 작업 공간의 서로 다른 두 작업을 결속하지 않는다 / 잠근 발행 행에서 `draft_id`를 반환하고 요청값과 일치하는지 확인한 뒤, 큐 갱신에는 요청값이 아니라 행의 값을 사용해야 한다.

- 재현: 같은 작업 공간에서 초안 A의 발행 식별자와 초안 B의 식별자를 한 요청에 넣는다. 발행 행 A를 완료 처리하면서 큐 B도 게시 완료로 바뀌어 B의 미발행 작업이 사라진다.

MAJOR: [승인 시안 이탈] dashboard/src/app/api/publish/reconcile/route.ts:9 - 복구 입력 계약에 실패 단계 `stage`가 없고, 64행부터 발행 행, 승인 큐, 사용량을 매번 전부 다시 처리하며 71행에서 실제 게시 시각도 현재 시각으로 덮는다 / v63 `openclaw-auto-4room-v63.html:9847`의 "내부 기록만 복구"는 실패한 기록만 고치는 계약이다 / `publication_record`, `queue_record`, `usage_record`를 서버가 저장한 복구 상태로 구분하고 해당 단계만 실행하며 이미 성공한 행의 `published_at`을 보존해야 한다.

- 재현: 외부 게시와 발행 행 및 큐 저장은 성공하고 사용량 기록만 다음 날 실패한 `usage_record` 건을 복구한다. API는 사용량만 복구하지 않고 `published_at`을 복구 시각으로 바꿔 성과실 정렬과 게시 시점을 하루 뒤로 이동시킨다.

MAJOR: [회귀 위험] dashboard/src/app/api/schedule/publish-due/route.ts:418 - 예약 발행 사용량 relay 실패를 420행에서 빈 `catch`로 버리고 재처리를 사용자 `/api/usage` 조회에만 맡긴다 / 사업 좌표 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md:59`의 "돈이 걸린 계약은 진짜여야 한다"는 자동 발행의 유료 사용량이 사용자 화면 방문 여부와 무관하게 장부에 남아야 한다는 제약이다 / 예약 작업과 독립된 지속 실행 relay가 pending을 비우고, 실패와 적체량을 운영 장애로 기록해야 한다.

- 재현: 예약 게시가 성공한 직후 `usage_events` INSERT만 실패시키고 사용자가 성과실과 사용량 API를 열지 않게 한다. `published_posts.provider_meta`는 pending으로 남고 과금 사용량은 기한 없이 1건 적게 집계된다.

MAJOR: [회귀 위험] dashboard/src/app/api/schedule/publish-due/route.ts:414 - 최근 변경이 발생 시각 없는 `publicationUsageOutbox`를 예약 발행에 붙이고, `dashboard/src/lib/usage-events.ts:44`는 relay 시 `usage_events.created_at` 기본값인 현재 시각으로 INSERT한다 / `/api/usage`는 `dashboard/src/app/api/usage/route.ts:89`에서 이 시각으로 일, 주, 월을 나누므로 실제 게시 시각과 과금 기간이 달라질 수 있다 / 발행 확정 트랜잭션에서 outbox에 `occurredAt`을 저장하고 relay가 그 값을 원장 발생 시각으로 명시해야 한다.

- 재현: 8월 31일 23시 59분에 예약 발행을 성공시키고 사용량 INSERT만 실패시킨 뒤 9월 1일에 relay한다. 발행 1건이 8월 사용량에서 빠지고 9월 사용량과 한도에 들어간다.

MAJOR: [회귀 위험] dashboard/src/app/api/usage/route.ts:73 - 최근 변경은 relay의 이번 묶음 실패 수만 0이면 정상 집계를 계속하고, `dashboard/src/lib/usage-events.ts:64`는 pending을 기본 50건만 읽으며 남은 건수를 반환하지 않는다 / 51건 이상 적체되면 50건만 반영하고도 부분 완료를 전체 성공으로 세어 발행 수와 과금 장부를 낮게 보여 준다 / 대상이 없을 때까지 제한 묶음을 처리하거나 남은 pending 수를 조회해 0이 아니면 지연 상태를 반환해야 한다.

- 재현: 한 작업 공간에 `usageEvent.status = pending`인 published 행 51건을 둔 뒤 `/api/usage`를 한 번 호출한다. 50건만 기록되고 1건은 남지만 응답은 `failed: 0`, HTTP 200이며 합계는 실제보다 1 작다.

MAJOR: [승인 시안 이탈] dashboard/src/components/home/PerformanceDashboard.tsx:30 - SWR의 인증 실패, 네트워크 단절, 일반 5xx까지 모든 `usageError`를 150행에서 지연 상태 하나로 축약하고, `PerformanceRoom.tsx:560`은 원인과 기존 값을 버린 채 "발행 사용량 반영이 지연"이라고 표시한다 / `DESIGN.md:693`은 오류 상태에서 "원인, 보존, 다음 행동"을 함께 닫으라고 했고, v68 `osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html:417`은 "마지막 확인 시점의 성과는 유지"하고 "다시 불러오기"를 제공한다 / 구조화된 `status: delayed` 응답만 사용량 지연으로 분류하고, 나머지 오류는 실제 원인과 마지막 성공 데이터 및 재시도 행동을 보존해야 한다.

- 재현: `/api/usage`를 401 또는 일반 DB 503으로 응답시킨다. 성과실은 인증 또는 서버 장애를 말하지 않고 사용량 반영 지연으로 오표시하며, 마지막 사용량과 다시 불러오기 행동도 보여 주지 않는다.

## MINOR

MINOR: [회귀 위험] dashboard/tests/integrity/four-room-token-request-timeout.regression-1.test.ts:17 - 회귀 테스트가 두 스크립트의 소스 문자열에 `Math.min(readyTimeoutMs,`가 한 번 있는지만 확인해 실제 토큰 요청의 중단 신호가 그 제한시간에 결속됐는지 검증하지 않는다 / 테스트 주석 `:5`의 "요청 본문을 중단"한 사고를 막으려면 실제 요청의 abort 시간이 계약인데, 현재 검사는 무관한 줄 하나로도 통과한다 / 제한시간 계산을 함수로 분리해 토큰 요청에 전달되는 값을 단위 검사하거나 지연 서버를 둔 통합 검사로 실제 중단 시각과 상한을 검증해야 한다.

- 재현: 파일의 다른 곳에 `Math.min(readyTimeoutMs, 1)`을 남겨 두고 토큰 요청의 제한시간을 다시 15초로 고친다. 현재 테스트는 통과하지만 냉간 컴파일에서 같은 오판이 재발한다.

## 실행 증거

- 현재 작업 트리에서 사용자가 지정한 정확한 `npm run test`: 통과. 377개 파일, 테스트 2,428건 통과, 3건 제외, 종료 코드 0.
- 현재 작업 트리에서 `npx tsc --noEmit`: 통과, 종료 코드 0.
- 현재 HEAD `ddafa8ea`를 localhost:3456에 제한 시간으로 기동한 `dashboard/scripts/verify-basic-flow-e2e.mjs`: 11단계 중 11단계 통과.
- 같은 실행본의 `dashboard/scripts/verify-studio-v1-e2e.mjs`: 14건 중 14건 통과.
- 같은 실행본의 `GET /api/health`: HTTP 200, DB `up`, `build_commit=ddafa8ea31cc6479bcdb0cb1e20a54e2407c0ba0`.
- E2E는 지정 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`를 사용했다. 실제 SNS 공개 발행은 하지 않았다.
- 51건 적체 생성과 월경계 장애 주입은 공유 데이터와 과금 장부에 영향을 주므로 실행하지 않았다. 재현 경로는 코드와 DB 계약으로 확인했다.
- 변경 제품 UI 토큰 검사: 새 색상 리터럴 0건, 인라인 스타일 0건.
- 새 사용자 노출 문구의 긴 대시, 그림문자, 영문 단추 라벨: 0건. 검색 적중은 주석과 TypeScript 타입 선언뿐이었다.
- 커밋 범위의 삭제 파일: 0개. 제거된 제품 코드 64줄에서 사라진 화면 부품이나 기능을 찾지 못했다.

## 격리와 부분 실패 판정

- 다른 작업 공간의 발행 식별자는 `tenant_id` 조건과 `withTenant` RLS 범위로 차단된다. 교차 작업 공간 격리 이탈은 찾지 못했다.
- 같은 작업 공간 안의 초안과 발행 결속은 검증하지 않아 MAJOR 1건으로 판정했다.
- 복구 목록 여러 건 중 일부 실패는 응답의 `partial`, `failed`와 화면의 남은 채널 안내로 보존된다. 이 경로 자체는 부분 실패를 전체 성공으로 표시하지 않는다.
- 사용량 relay의 50건 상한은 남은 적체를 숨겨 부분 완료를 전체 성공으로 표시한다.

## 벤치마크 적용

- OWASP Multi Tenant Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
  - 차용: 클라이언트의 테넌트 및 객체 식별자는 권한 증명이 아니며, 비동기 작업도 서버가 확인한 범위를 보존해야 한다는 기준.
  - 변경: 교차 작업 공간 RLS는 통과로 두고, 같은 작업 공간의 발행과 초안 객체 결속을 별도 검증 대상으로 잡았다.
- PostgreSQL transaction 문서: https://www.postgresql.org/docs/17/tutorial-transactions.html
  - 차용: 여러 단계의 상태 변경은 전부 성공하거나 전부 실패하는 원자적 단위여야 한다는 기준.
  - 변경: 공급자 호출까지 DB 트랜잭션에 넣는 대신, 외부 성공 증거와 내부 복구 단계 상태를 저장하고 실패한 단계만 멱등 재실행하도록 요구했다.
- Microsoft transactional outbox: https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos
  - 차용: 비즈니스 변경과 이벤트를 함께 저장하고 별도 작업자가 미처리 이벤트를 처리한 뒤 완료로 표시하는 기준.
  - 변경: 현재 `provider_meta` outbox 구조를 유지하되 발생 시각, 남은 적체 수, 독립 relay를 보존하도록 요구했다.

## 셀프심문

질문: 내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?

답: 예약 게시가 성공해도 사용량 relay가 한 번 실패하고 사용자가 성과실을 열지 않으면 유료 사용량이 계속 빠지는 문제다. MAJOR에 포함했으므로 PASS를 주지 않는다.

SKILLS_USED: review
SKILLS_SKIPPED: qa, 수정 금지인 코드 리뷰 범위라 사용하지 않았다.

KNOWLEDGE_QUERY: BRAIN `wiki/cto/index.md`에서 코드 리뷰, 멀티테넌트 격리, 동시성, 부분 실패, 멱등성을 검색하고 `wiki/cto/cs/concept-DB-동시성-이상현상-격리수준.md`와 `wiki/business/pmf/idea-zero-one-marketing-studio.md`로 좁혔다. OSMU 사업 좌표, 외부 성공 뒤 기록 복구, 사용량 원장, OWASP 멀티테넌시, PostgreSQL 트랜잭션, transactional outbox도 조회했다.
HITS_USED: BRAIN 동시성 문서는 lost update와 격리 판정에, OSMU 아이디어 문서는 자동화와 유료화 맥락 확인에 사용했다. 사업 좌표는 과금과 멱등의 사업 제약 때문에 사용했다. v63과 v68 프로토타입 및 `DESIGN.md` v37은 승인 계약 대조에 사용했다. OWASP, PostgreSQL, Microsoft 원문은 객체 결속, 원자성, outbox 판정에 사용했다.
HITS_REJECTED: BRAIN OSMU 아이디어의 시장 서술은 파일별 코드 결함의 직접 근거가 아니어서 심각도 판정에는 쓰지 않았다. v68의 시각 표현은 코드 diff 역할 범위 밖이라 시각 판정 근거로 쓰지 않았다.
CONFLICTS: `pipeline-state.osmu.md` 최신 승인 디자인 허브는 v68이지만 과제는 v63을 필수 대조로 지정했다. v68은 생성실과 성과실 후보이고 복구 문구는 v63에 있으므로 복구 흐름에는 v63 계약을 적용했다. 최신 승인 핀에 PRD가 없어 PRD 대조는 미검토로 남겼다.

SOURCES: `pipeline-state.osmu.md`, `DESIGN.md`, `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`, `docs/design/prototypes/legacy-prototype-20260912/prototype/osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html`, `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`, `wiki/거버넌스/결정.md`, `wiki/거버넌스/실수.md`, `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`, `docs/구현현황.md`, BRAIN CTO 동시성 문서, BRAIN OSMU 아이디어 문서, OWASP Multi Tenant Security Cheat Sheet, PostgreSQL 17 transaction 문서, Microsoft transactional outbox
MODEL: gpt-codex/GPT-5

## 4축 판정

- 승인 시안 이탈: 지적 3건. 외부 성공 증명 없이 완료 처리하고, 실패한 단계만 복구하지 않으며, 일반 장애를 사용량 지연 하나로 오표시한다.
- 회귀 위험: 지적 5건. 다른 초안 큐를 닫을 수 있고, 예약 발행 사용량이 기한 없이 빠지며, 지연된 사용량이 다른 과금 기간으로 이동하고, 50건을 넘는 적체를 정상 합계로 반환하며, 토큰 요청 제한시간 테스트가 실제 결속을 검증하지 않는다.
- 토큰 위반: 문제없음. 변경된 제품 UI 코드에서 새 색상 리터럴과 인라인 스타일을 찾지 못했다.
- 무기록 삭제: 문제없음. 삭제 파일 0개이며, 사라진 화면 부품이나 기능을 diff에서 찾지 못했다.

REVIEW_VERDICT: BLOCK
