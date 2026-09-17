# OSMU 코드 리뷰 2026-09-18

<!--
STAMP
created_at: 2026-09-18 04:26 KST
model: gpt-codex/gpt-5.6-sol
agent: code-reviewer
skill: review
scope: c0661fb2bebc95a2293119ba250910593db69e50..87779ba0191570bcdbd22418eb69bd049f3561c2
basis: pipeline-state.osmu.md approved_artifacts, v63 required prototype, v68 approved design hub, DESIGN.md v37, chairman request ledger, OSMU business coordinates
deliberation: 최근 변경의 발행 복구와 사용량 원장을 외부 성공 증명, 단계별 복구, 기간 귀속, 대량 적체 경계에서 공격했다.
-->

## 한 줄 결론

머지 차단이다. MAJOR 4건이 있으며, 외부 성공을 증명하지 않은 발행 완료 처리와 사용량의 기간 이동 및 미집계로 발행 상태와 과금 장부가 틀어질 수 있다.

## 범위와 기준

- 동결 시각: 2026-09-18 04:22 KST
- 커밋 범위: `c0661fb2bebc95a2293119ba250910593db69e50..87779ba0191570bcdbd22418eb69bd049f3561c2`
- 범위 크기: 70개 커밋, 342개 파일, 19,236줄 추가, 308줄 삭제
- 제품 코드 범위: `dashboard/src`, `dashboard/scripts`, `dashboard/db` 아래 19개 파일, 930줄 추가, 167줄 삭제
- 커밋된 삭제 파일: 0개
- 최신 승인 핀: `pipeline-state.osmu.md:277`의 v68 디자인 허브와 `DESIGN.md` v37
- 사용자 지정 필수 대조: `openclaw-auto-4room-v63.html:9847`의 "외부 게시는 이미 끝났고 내부 기록만 복구가 필요합니다. 다시 발행하지 않습니다."
- PRD 핀: 최신 `approved_artifacts`에 없음. PRD 대조는 미검증이다.
- 시각 표현 편차: 코드 리뷰 역할 범위 밖이므로 미검토했다. 부품, 기능, 흐름, 상태 존재만 판정했다.

## MAJOR

MAJOR: [승인 시안 이탈] dashboard/src/app/api/publish/reconcile/route.ts:41 - 클라이언트가 보낸 `publicationId`가 현재 작업 공간에 속하고 플랫폼만 같으면 기존 상태와 외부 성공 증거를 확인하지 않고 66행에서 `published`로 바꾼다 / 사용자 지정 시안 `openclaw-auto-4room-v63.html:9847`의 "외부 게시는 이미 끝났고 내부 기록만 복구"와 `:7734`의 "외부 게시 성공 뒤 내부 기록이 누락된 1건"은 외부 성공이 확인된 건만 복구하라는 계약인데, 현재 API는 `failed` 행이나 임의의 내부 행도 완료로 승격할 수 있다 / 공급자 성공 직후 서버가 발급한 일회성 복구 증표 또는 DB에 남긴 복구 단계와 외부 성공 상태를 검증하고, `failed`는 거절하며 `uncertain`은 공급자 조회가 성공한 경우에만 완료로 바꿔야 한다.

- 재현: 현재 작업 공간에서 상태가 `failed`인 발행 행 식별자를 가져와 같은 플랫폼과 임의의 외부 식별자로 `/api/publish/reconcile`에 보낸다. 공급자 조회 없이 HTTP 200이 반환되고 해당 행은 `published`가 되며 사용량도 기록된다.

MAJOR: [승인 시안 이탈] dashboard/src/app/api/publish/reconcile/route.ts:9 - 복구 입력 계약에서 원래 실패 응답이 가진 `stage`를 받지 않고, 64행부터 발행 행, 승인 큐, 사용량을 매번 전부 다시 처리하며 71행에서 실제 게시 시각까지 현재 시각으로 덮는다 / 시안 `openclaw-auto-4room-v63.html:9847`의 "내부 기록만 복구"는 실패한 기록만 고치는 계약인데, `usage_record` 실패를 복구해도 이미 확정된 발행 시각과 큐 상태가 함께 바뀐다 / `publication_record`, `queue_record`, `usage_record`를 서버가 저장한 복구 상태로 구분하고 해당 단계만 실행하며, 이미 성공한 행의 `published_at`은 보존해야 한다.

- 재현: 외부 게시와 발행 행 및 큐 저장은 성공하고 사용량 기록만 다음 날 실패한 `usage_record` 건을 복구한다. API는 사용량만 복구하지 않고 `published_at`을 복구 시각으로 바꾸므로 성과실 정렬과 게시 시점이 하루 뒤로 이동한다.

MAJOR: [회귀 위험] dashboard/src/lib/usage-events.ts:45 - 사용량 outbox는 발생 시각을 보관하지 않고 relay 시 `usage_events.created_at` 기본값인 현재 시각으로 INSERT한다 / `/api/usage`는 `dashboard/src/app/api/usage/route.ts:89`에서 이 시각으로 일, 주, 월을 나누므로 장애 복구가 자정이나 월말을 넘으면 이전 기간의 유료 발행이 다음 기간으로 이동하며, 사업 좌표 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md:59`의 "돈이 걸린 계약은 진짜여야 한다"와 어긋난다 / 발행 확정 트랜잭션에서 outbox에 `occurredAt`을 저장하거나 relay가 보존된 실제 게시 시각을 `usage_events.created_at`에 명시해야 한다.

- 재현: 8월 31일 23시 59분에 발행을 성공시키고 사용량 INSERT만 실패시킨 뒤 9월 1일에 relay한다. 발행 1건이 8월 사용량에서 빠지고 9월 사용량과 한도에 들어간다.

MAJOR: [회귀 위험] dashboard/src/lib/usage-events.ts:67 - pending 사용량을 기본 50건만 읽고 반환값에는 남은 건수가 없으며, `/api/usage`는 `dashboard/src/app/api/usage/route.ts:74`에서 이번 묶음의 실패 수만 0이면 HTTP 200으로 확정 합계를 반환한다 / 51건 이상 적체되면 50건만 반영하고도 부분 실패를 전체 성공으로 세어 발행 수와 향후 과금 장부를 낮게 보여 준다 / PostgreSQL의 제한된 묶음 처리 지침처럼 대상이 없을 때까지 반복하거나 남은 pending 수를 함께 조회해 0이 아니면 지연 상태를 반환하고, 사용자 조회와 분리된 relay 작업자가 계속 비워야 한다.

- 재현: 한 작업 공간에 `usageEvent.status = pending`인 published 행 51건을 둔 뒤 `/api/usage`를 한 번 호출한다. 50건만 기록되고 1건은 남지만 응답은 `failed: 0`, HTTP 200이며 합계는 실제보다 1 작다.

## MINOR

없음. 새 색상 리터럴과 인라인 스타일은 없었고, 새 사용자 노출 문구의 긴 대시, 그림문자, 영문 단추 라벨도 찾지 못했다.

## 실행 증거

- `npm run test`: 통과. 376개 파일, 2,427건 통과, 3건 건너뜀, 276.47초.
- 작업 트리의 `npx tsc --noEmit`: 실패. 실행 중인 개발 서버가 만든 `.next/dev/types/routes.d.ts:291`에 잘린 선언이 남아 구문 오류 2건이 발생했다.
- 커밋 HEAD를 새 임시 사본으로 풀고 의존성만 연결한 `npx tsc --noEmit`: 통과, 종료 코드 0. 코드 자체와 실행 서버의 생성물을 분리해 확인했다.
- `dashboard/scripts/verify-basic-flow-e2e.mjs`: 통과. localhost:3456 실제 요청 11단계 중 11단계 통과.
- `dashboard/scripts/verify-studio-v1-e2e.mjs`: 통과. localhost:3456 실제 요청 14건 중 14건 통과.
- `GET http://localhost:3456/api/health`: HTTP 200, DB `up`. 응답에 빌드 커밋과 버전이 없어 실행본의 정확한 커밋 귀속은 미검증이다.
- 지정 작업 공간의 `/api/usage`: 임시 고객 토큰으로 HTTP 200, 오늘 AI 생성 107, 발행 0, relay 처리 0, 실패 0을 관찰했다. 임시 토큰은 즉시 폐기했다.
- 실제 SNS 공개 발행, 51건 적체 생성, 월경계 장애 주입은 돈과 공유 데이터에 영향을 주므로 실행하지 않았다. 위 재현은 코드와 DB 계약 대조 결과다.
- 변경 제품 UI 토큰 검사: 새 색상 리터럴 0건, 인라인 스타일 0건.
- 커밋 범위의 삭제 파일: 0개. 제거된 167줄은 예약 및 발행 흐름 교체와 검증기 잠금 보강으로 대체됐고, 사라진 화면 부품이나 기능은 찾지 못했다.

## 벤치마크 적용

- Microsoft transactional outbox: https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-out-box-cosmos
  - 차용: 비즈니스 변경과 이벤트를 함께 저장하고 별도 작업자가 미처리 이벤트를 주기적으로 처리한 뒤 완료로 표시하는 기준.
  - 변경: 현재 구조의 `published_posts.provider_meta` outbox는 유지하되 발생 시각과 독립 dispatcher를 요구했다.
- PostgreSQL 제한 묶음 UPDATE 지침: https://www.postgresql.org/docs/17/sql-update.html
  - 차용: 제한된 묶음 처리는 대상이 없어질 때까지 반복하고 마지막 확인 단계가 필요하다는 기준.
  - 변경: relay의 50건 상한은 유지할 수 있지만 남은 건수를 성공 응답에서 숨기지 못하게 했다.
- PostgreSQL 명시적 잠금: https://www.postgresql.org/docs/17/explicit-locking.html
  - 차용: `FOR UPDATE`가 같은 발행 행의 중복 사용량 기록을 직렬화하는지 판정했다.
  - 변경: 행 잠금 자체는 문제없음으로 두고, 외부 성공 증명과 기간 귀속 및 적체 종료 조건을 지적했다.

## 셀프심문

질문: 내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?

답: 월말에 성공한 발행의 사용량 복구가 다음 달로 잡히거나, 실패한 발행 행을 복구 단추가 실제 게시물처럼 완료 처리하는 문제다. 둘 다 위 MAJOR에 포함했으므로 PASS를 주지 않는다.

## 4축 판정

- 승인 시안 이탈: 지적 2건. 외부 성공 증명 없이 완료 처리하며, 실패한 단계만 복구하지 않고 실제 게시 시각까지 바꾼다.
- 회귀 위험: 지적 2건. 지연된 사용량이 다른 과금 기간으로 이동하고, 50건을 넘는 적체를 정상 합계로 반환한다. 테넌트 범위와 행 잠금은 문제없음으로 확인했다.
- 토큰 위반: 문제없음. 변경된 제품 UI 코드에서 새 색상 리터럴과 인라인 스타일을 찾지 못했다.
- 무기록 삭제: 문제없음. 삭제 파일 0개이며, 사라진 화면 부품이나 기능을 diff에서 찾지 못했다.

REVIEW_VERDICT: BLOCK

SKILLS_USED: review
SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: OSMU 사업 좌표, 외부 성공 뒤 기록 복구, 유료 사용량 원장, transactional outbox, PostgreSQL 제한 묶음 처리와 행 잠금을 검색했다.
HITS_USED: `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`는 과금과 멱등의 사업 제약 때문에 사용했다. v63과 v68 프로토타입 및 `DESIGN.md` v37은 승인 계약 대조에 사용했다. Microsoft와 PostgreSQL 원문은 outbox와 묶음 처리 및 잠금 판정에 사용했다.
HITS_REJECTED: BRAIN의 범용 레버리지 자료는 이번 diff의 파일별 결함을 더 정확히 판정하지 못해 채택하지 않았다. v68의 시각 표현은 이번 발행 복구 및 사용량 원장 계약과 직접 관련이 없어 시각 판정 근거로 쓰지 않았다.
CONFLICTS: `pipeline-state.osmu.md` 최신 승인 디자인 허브는 v68이지만 과제는 v63을 필수 대조로 지정했다. v68은 생성실과 성과실 후보이며 복구 문구는 v63에 있으므로 복구 흐름에는 v63 계약을 적용했다. 최신 승인 핀에 PRD가 없어 PRD 대조는 미검증으로 남겼다.

SOURCES: `pipeline-state.osmu.md`, `DESIGN.md`, `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`, `docs/design/prototypes/legacy-prototype-20260912/prototype/osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html`, `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`, `wiki/거버넌스/요청.md`, `wiki/거버넌스/결정.md`, `wiki/거버넌스/실수.md`, `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`, `docs/구현현황.md`, Microsoft transactional outbox, PostgreSQL 17 문서
MODEL: gpt-codex/gpt-5.6-sol
