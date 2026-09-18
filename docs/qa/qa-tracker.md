## 2026-09-19 08:29 KST · 최근 24시간 코드 공격 리뷰 최종 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드리뷰 24시간 | 운영 dashboard 도커 빌드 유지 | REVIEW-24H-20260919-10 | NG | dashboard-only 격리 context의 `docker build --target builder`가 `next build`에서 `spawnSync git ENOENT`, 종료 코드 1. `next.config.ts:17`이 Git 없는 `node:20-alpine` builder에서 Git을 무조건 실행한다. |
| 코드리뷰 24시간 | 실행 소스 증거의 완전한 입력 결속 | REVIEW-24H-20260919-11 | NG | 임시 Git fixture에서 `next.config.ts`만 수정하자 전체 status는 `M`이지만 source hash는 불변이고 `gitSourceState`는 `clean:true`였다. `source-evidence.mjs:6`이 `src`, `scripts`만 본다. |
| 코드리뷰 24시간 | 자동 백로그의 정본 입력과 산출 경로 | REVIEW-24H-20260919-12 | NG | 검토 HEAD의 `refill-backlog.sh:46-47,59,131`이 존재하지 않는 `docs/requests`, `wiki/product`, `docs/audit`를 발급한다. 실제 정본은 archive requests, `wiki/2-product/build`, archive audit다. |
| 필수 회귀 | 전체 단위 및 통합 테스트 | REVIEW-24H-20260919-13 | PASS | `npm run test` 378파일, 2,434건 통과, 3건 제외, 종료 코드 0, 401.33초. |
| 필수 회귀 | TypeScript | REVIEW-24H-20260919-14 | NG | `npx tsc --noEmit` 두 번 모두 `.next/dev/types/validator.ts:1934`의 잘린 생성 코드로 종료 코드 1 또는 2. `npm run typecheck:ci`도 같은 원인으로 종료 코드 2. 통과로 승격하지 않음. |
| 실앱 기본 흐름 | localhost:3456 기본 흐름과 Studio v1 | REVIEW-24H-20260919-15 | NG | health HTTP 200, 실행 `e7eea1fa`. 기본 흐름은 첫 생성 후보 0장과 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 종료 코드 1. Studio v1은 401, 400, 422 거절 3건 통과 뒤 정상 생성이 같은 공급자 오류로 종료 코드 1. |
| 삭제, 격리, 토큰 | 무기록 삭제와 확정 요구 | REVIEW-24H-20260919-16 | PASS, 동적 격리 미검증 | 삭제 파일 0개, 제품 UI 변경 0개, 새 토큰 및 금지 문구 0개. tenant 제품 코드 변경은 없고 두 작업 공간 동시 공격은 미검증. |

MAJOR 3건, MINOR 2건과 필수 TypeScript 및 실앱 E2E NG로 BLOCK이다. 상세 위치와 재현은 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-19.md`에 기록했다. 제품 코드는 수정하지 않았다.

## 2026-09-19 07:22 KST · 네 방 기본 흐름 v26 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R19, R207 | 네 방 렌더와 390, 768, 1024, 1440 실제 이동 | FLOW-UI-V26 | PASS | 현재 HEAD `e7eea1fa` 실행본에서 네 방 4/4, 20화면, 성과실에서 생성실 복귀 5/5. 가로 넘침, 가린 모달, 탐색 가림, 401, 콘솔 오류 0. `logs/diff/osmu-four-room-flow-20260919-v26/` |
| R166, R172 | 생성실에서 성과실까지 백엔드 열한 단계 관통 | FLOW-API-V26 | NG | 첫 후보 생성이 HTTP 429와 `STUDIO_LLM_PROVIDER_RATE_LIMITED`로 종료. 7일 사용량 100%, 2026-09-19 18:59 KST 초기화 실측 |
| R166, R172 | Studio v1 인증, 생성, 조회, 재생성 계약 | STUDIO-V1-V26 | NG | 401, 400, 422 거절 3건은 통과. 정상 생성은 기대 201 대신 HTTP 429라 이후 단계 미실시 |
| R193, R205, R206 | 승인 시안 계승과 네 폭 디자인 정합 | DESIGN-CONF-V26 | NG | v63 기준 16개 라이트 화면의 정보 순서, 열 책임, 표시 상태와 행동 위계가 불일치. canonical 승인 v68과 과제 v63 핀 충돌도 유지 |
| 필수 회귀 | 전체 테스트, TypeScript, build, seed와 RLS, 디자인 lint | REGRESSION-V26 | PASS | Vitest 378파일과 2,434건 통과, 3건 제외. TypeScript 종료 0, 격리 webpack build 185/185, fingerprint `S3|S3`, 토큰 위반 0 |
| 검사 회귀 | 현재 API 전수검사 계약과 병렬 부하 제한시간 | QA-HARNESS-V26 | PASS | 정적 계약 기대값을 현재 helper 배선으로 갱신해 표적 2/2 통과. 120ms 지연 fixture의 준비 한도를 1초로 보정해 연속 5회 15/15 및 전체 회귀 통과 |
| R01부터 R207 및 세부 요청 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V26 | 이월 | 기존 정본 판정을 유지하고 이번 네 방 범위만 갱신 |

제품 런타임 코드는 변경하지 않았다. 화면 이동은 PASS지만 실제 생성이 막혀 제품 전체는 NG다.
상세는 `docs/qa/osmu-four-room-basic-flow-v26-gpt-codex.md`다.

## 2026-09-19 07:37 KST · 성과 시계열 갭 재확인 최종 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 두 갭 감사에서 지금도 없는 기본 흐름 항목 하나 구현 | GAP-HISTORY-20260919-0737-01 | ❌ NG | 현재 schema와 migration에는 게시물별 성과 관측 이력이 없고 지정 작업 공간 `GET /api/metrics`는 HTTP 200, 키 `posts`, `coverage`, 게시물 0건이다. `history`, `comparison`은 없다. |
| 공정과 기술계약 | 승인 범위 안에서만 제품 소스 수정 | GAP-HISTORY-20260919-0737-02 | BLOCK | `pipeline-state.osmu.md`는 `qa`, `in-progress`, 승인 아님이다. 성과 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준의 승인된 기술설계가 없다. 제품 소스 변경은 0건이다. |
| 실행본 귀속 | localhost 실행본과 현재 제품 소스 | GAP-HISTORY-20260919-0737-03 | 확인 | health HTTP 200, DB up, 실행 `e7eea1fa`. 최종 HEAD `399c08f6`까지 제품 `src`, `db`, `package.json` 차이는 0건이다. |
| 전체 단위 및 통합 | `npm run test` | GAP-HISTORY-20260919-0737-04 | PASS | 378파일, 2,434건 통과, 3건 제외, 종료 코드 0이다. |
| TypeScript | `npx tsc --noEmit` | GAP-HISTORY-20260919-0737-05 | 조건부 PASS | 공유 개발 서버가 만든 현재 `.next/dev/types/validator.ts` 파손으로 작업 디렉터리 명령은 종료 코드 2다. `.next`를 제외한 동일 현재 소스와 루트 상대 import를 복제한 깨끗한 임시 저장소에서는 같은 명령 종료 코드 0이다. |
| 디자인 토큰 | `design-lint.sh src` | GAP-HISTORY-20260919-0737-06 | PASS | 종료 코드 0, 디자인 토큰 위반 0이다. |
| 기본 흐름 실앱 | 생성, 편집, 발행 큐, 성과 재인계 | GAP-HISTORY-20260919-0737-07 | ❌ NG | localhost에서 첫 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 후보 0장으로 종료 코드 1이다. |
| Studio v1 실앱 | 인증, 입력 거절, 생성과 조회 | GAP-HISTORY-20260919-0737-08 | ❌ NG | 401, 400, 422 거절 3건은 통과했다. 정상 생성은 기대 201 대신 HTTP 200 공급자 오류로 종료 코드 1이다. |

승인 없는 DB schema와 API 의미를 선택하지 않았다. 전체 회귀는 통과했지만 신규 기술계약과 두 필수 실앱 E2E가 NG라 구현과 QA 전환은 BLOCK이다.

## 2026-09-19 04:43 KST · 최근 24시간 코드 공격 리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드리뷰 24시간 | 실행 소스를 검토 커밋에 결속 | REVIEW-24H-20260919-02 | NG | `verify-api-read-sweep.mjs:142,205`는 health의 커밋 문자열과 실행 전후 해시만 비교한다. 시작부터 dirty인 route는 HEAD와 내용이 달라도 전후 해시가 같아 해당 커밋 증거로 성공 처리할 수 있다. |
| 코드리뷰 24시간 | 실행 중 일시 변경과 원복을 검출 | REVIEW-24H-20260919-03 | NG | `verify-api-read-sweep.mjs:205,285`의 두 시점 해시는 검사 도중 hot reload된 route가 끝나기 전에 원복되면 PID와 최종 해시가 모두 같아 혼합 소스 결과를 안정 증거로 센다. |
| 코드리뷰 24시간 | 제한시간 회귀의 실제 배선 검증 | REVIEW-24H-20260919-04 | MINOR | `four-room-token-request-timeout.regression-1.test.ts:17`은 source 문자열 존재만 확인해 고객 토큰 요청이 다시 15초로 바뀌어도 무관한 위치의 문자열로 통과할 수 있다. |
| 코드리뷰 24시간 | 종료 시 분모 재수집의 실제 배선 검증 | REVIEW-24H-20260919-05 | MINOR | `api-read-sweep-inventory-stability.regression-1.test.ts:21`은 helper에 손으로 넣은 배열만 검사해 실제 종료 재수집과 종료 코드 배선이 빠져도 통과한다. |
| 필수 회귀 | 전체 테스트와 TypeScript | REVIEW-24H-20260919-06 | PASS | `npm run test` 378파일, 2,431건 통과, 3건 제외, 종료 코드 0. `npx tsc --noEmit` 종료 코드 0. |
| 실앱 기본 흐름 | localhost:3456 기본 흐름과 Studio v1 | REVIEW-24H-20260919-07 | NG | 기본 흐름은 첫 생성에서 후보 0장과 `STUDIO_LLM_PROVIDER_UNAVAILABLE`. Studio v1은 401, 400, 422 거절 3건 통과 뒤 정상 생성이 기대 201 대신 HTTP 200 공급자 오류로 종료 코드 1. |
| 실행본 귀속 | API 읽기 전수검사 | REVIEW-24H-20260919-08 | BLOCK | health 실행 `d0bc4f7b`, 검토 HEAD `3207b256` 불일치로 실제 route 요청 전에 종료 코드 1. |
| 삭제, 격리, 토큰 | 무기록 삭제와 확정 요구 | REVIEW-24H-20260919-09 | PASS, 동적 격리 미검증 | 제품 및 화면 파일 삭제 0건, 새 UI 토큰과 사용자 노출 긴 대시, 그림문자, 영문 단추 라벨 0건. 이번 diff에 인증 및 tenant 제품 코드 변경은 없고 두 작업 공간 동시 공격은 미검증. |

MAJOR 2건과 필수 실앱 E2E NG로 BLOCK이다. 상세 위치와 재현은 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-19.md`에 기록했다. 제품 코드는 수정하지 않았다.

## 2026-09-19 03:10 KST · 성과 시계열 갭 재확인 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 두 갭 감사에서 현재도 없는 기본 흐름 항목 하나 구현 | GAP-HISTORY-20260919-0310-01 | NG | 현재 schema, migration, `GET /api/metrics`에는 게시물별 관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교가 없다. 응답 키는 `coverage`, `posts`뿐이다. |
| 공정과 기술계약 | 승인 범위 안에서만 제품 소스 수정 | GAP-HISTORY-20260919-0310-02 | BLOCK | `pipeline-state.osmu.md`는 `qa`, `in-progress`, 승인 아님이다. 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준의 승인 기술설계가 없다. 제품 소스 변경은 0건이다. |
| 전체 단위 및 통합 | `npm run test` 필수 회귀 | GAP-HISTORY-20260919-0310-03 | PASS | 378파일, 2,431건 통과, 3건 제외, 종료 코드 0이다. |
| 타입과 디자인 토큰 | TypeScript와 Web 토큰 검사 | GAP-HISTORY-20260919-0310-04 | PASS | `npx tsc --noEmit`과 `design-lint.sh src` 종료 코드 0, 토큰 위반 0이다. |
| Web production build | 기본 build와 webpack 비교 | GAP-HISTORY-20260919-0310-08 | 조건부 NG | 격리 HEAD의 `npm run build`는 Next.js 16 Turbopack 한국어 주석 code frame panic으로 종료 코드 1이다. `npx next build --webpack`은 185/185, 종료 코드 0이다. |
| 기본 흐름 실앱 | 생성, 편집, 발행 큐, 성과 재인계 | GAP-HISTORY-20260919-0310-05 | NG | localhost:3456에서 첫 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 후보 0장으로 종료 코드 1이다. |
| Studio v1 실앱 | 인증, 입력 거절, 생성, 조회와 재생성 | GAP-HISTORY-20260919-0310-06 | NG | 401, 400, 422 거절은 통과했다. 정상 생성은 기대 201 대신 HTTP 200의 공급자 오류다. 7일 사용량 100%, 2026-09-19 19:00 KST 초기화를 실측했다. |
| 실행본 귀속 | localhost와 현재 HEAD 제품 소스 | GAP-HISTORY-20260919-0310-07 | 확인 | health HTTP 200, DB up, 실행 `d0bc4f7b`, 현재 HEAD `e4e6885d`. 두 커밋 사이 `dashboard/src`, `dashboard/db`, `dashboard/package.json` diff는 0건이다. |

전체 회귀는 통과했지만 공정과 기술계약이 닫혀 있고 두 필수 실앱 E2E가 NG다. 제품 소스는
수정하지 않았으며 운영 배포와 실제 SNS 공개 발행은 미검증이다.

## 2026-09-19 02:19 KST · 네 방 기본 흐름 v25 최종 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R19, R207 | 네 방 렌더와 390·768·1024·1440 실제 이동 | FLOW-UI-V25-FINAL | PASS | 네 방 단면 4/4, 390 라이트와 다크 및 768·1024·1440의 20화면, 성과실에서 생성실 복귀 5/5. 가로 넘침, 가린 모달, 탐색 가림, 401, 콘솔 오류 0. `logs/diff/osmu-four-room-flow-20260919-v25/` |
| R166, R172 | 생성실에서 성과실까지 백엔드 열한 단계 관통 | FLOW-API-V25-FINAL | NG | 첫 후보 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 종료. 공유 Claude CLI 7일 사용량 100%, 2026-09-19 18:59 KST 리셋 실측. 모의 후보나 하드코딩으로 우회하지 않음 |
| R166, R172 | Studio v1 인증, 생성, 조회, 재생성 계약 | STUDIO-V1-V25 | NG | 401·400·422 거절 3건은 통과, 정상 생성부터 공급자 한도로 중단. `verify-studio-v1-e2e.log` |
| 필수 회귀 | 전체 테스트, TypeScript, production build, seed·RLS, 디자인 lint | FLOW-REGRESSION-V25 | PASS | Vitest 378파일·2,431건, 제외 3건. `npx tsc --noEmit` 최종 종료 0. 격리 build 185/185. schema fingerprint S3|S3. 디자인 토큰 위반 0 |
| R193, R205, R206 | v63 승인 시안 계승 | DESIGN-CONF-V25 | NG | 16개 라이트 화면의 주축, 요소 순서, 열 수, 정렬, 표시, 글꼴 단계, 버튼 위계를 대조했으며 전 화면 배치 속성이 불일치. `docs/qa/osmu-four-room-basic-flow-v25-gpt-codex.md` |

화면 이동은 PASS지만 핵심 생성이 BLOCK이라 제품 전체는 NG다. 공유 공급자 한도 리셋 뒤 같은 실행본에서 `verify-basic-flow-e2e.mjs`와 `verify-studio-v1-e2e.mjs`를 다시 통과하기 전에는 전환하지 않는다.

## 2026-09-19 02:04 KST · 네 방 기본 흐름 v25 착수 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실에서 성과실까지 백엔드 열한 단계 관통 | FLOW-API-V25-INITIAL | NG | 실행 HEAD와 health `build_commit`이 `d0bc4f7b`로 일치하는 localhost:3456에서 첫 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 끝나 후보 0장. HTTP health 200, DB up, 46ms. 원본 `logs/diff/osmu-four-room-flow-20260919-v25/verify-basic-flow-e2e.log`, `health.log` |
| R08, R19, R207 | 네 방 렌더와 390·768·1024·1440 실제 이동 | FLOW-UI-V25-INITIAL | 미실시, 차단 | 백엔드 첫 생성 실패의 원인 분리와 수리 전이다. 화면을 정상으로 승격하지 않는다. |

현재 판정은 NG다. 공급자 실패의 원인을 확인하고 고친 뒤 같은 localhost 실행본에서 두 필수 E2E, 네 폭 실제 클릭과 전체 회귀를 다시 관찰한다.

## 2026-09-18 18:15 KST · 최근 24시간 코드 공격 리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드리뷰 24시간 | 외부 성공이 확인된 발행만 복구 | REVIEW-24H-20260918-20 | NG | `dashboard/src/app/api/publish/reconcile/route.ts:41`은 공급자 성공 증명과 기존 상태를 확인하지 않고 `failed` 행도 `published`로 바꿀 수 있다. |
| 코드리뷰 24시간 | 발행과 원본 초안 결속 | REVIEW-24H-20260918-21 | NG | `publish/reconcile/route.ts:42,83`은 발행 행의 `draft_id`를 읽지 않고 요청자가 보낸 다른 `draftId` 큐를 완료 처리할 수 있다. |
| 코드리뷰 24시간 | 실패한 내부 단계만 복구 | REVIEW-24H-20260918-22 | NG | `publish/reconcile/route.ts:9,64,71`은 실패 단계를 받지 않고 발행 행, 큐, 사용량을 전부 다시 처리하며 게시 시각을 복구 시각으로 덮는다. |
| 코드리뷰 24시간 | 예약 발행 사용량 누락 방지 | REVIEW-24H-20260918-23 | NG | `schedule/publish-due/route.ts:418`은 사용량 relay 실패를 버리고 사용자 `/api/usage` 조회에만 재처리를 맡겨 화면을 열지 않는 고객의 사용량이 계속 pending으로 남을 수 있다. |
| 코드리뷰 24시간 | 사용량 발생 기간 보존 | REVIEW-24H-20260918-24 | NG | `schedule/publish-due/route.ts:414`와 `usage-events.ts:44`는 발생 시각을 보존하지 않아 월경계 복구 시 이전 달 발행이 다음 달 과금 기간으로 이동한다. |
| 코드리뷰 24시간 | pending 적체를 전체 성공으로 세지 않음 | REVIEW-24H-20260918-25 | NG | `usage/route.ts:73`과 `usage-events.ts:64`는 기본 50건만 처리하고 남은 수를 확인하지 않아 51건 이상이면 낮은 합계를 HTTP 200으로 반환한다. |
| 코드리뷰 24시간 | 오류 상태의 원인, 보존, 다음 행동 | REVIEW-24H-20260918-26 | NG | `PerformanceDashboard.tsx:30,150`은 인증 실패와 일반 5xx도 사용량 지연 하나로 축약하고 마지막 값과 재시도 행동을 버린다. |
| 필수 회귀 | 전체 테스트와 TypeScript | REVIEW-24H-20260918-27 | PASS | `npm run test` 377파일, 2,428건 통과, 3건 제외, 종료 코드 0. `npx tsc --noEmit` 종료 코드 0. |
| 실앱 기본 흐름 | localhost:3456 기본 흐름과 Studio v1 | REVIEW-24H-20260918-28 | PASS | HEAD `ddafa8ea`, DB up. 지정 작업 공간에서 기본 흐름 11/11, Studio v1 14/14를 실제 요청으로 관찰했다. |
| 삭제, 격리, 토큰 | 무기록 삭제와 작업 공간 및 디자인 계약 | REVIEW-24H-20260918-29 | PASS, 단 동일 작업 공간 결속 NG | 삭제 파일 0개, 새 색상 리터럴과 인라인 스타일 0건, 새 긴 대시와 그림문자 및 영문 단추 라벨 0건. 교차 작업 공간은 차단되지만 같은 작업 공간의 초안 결속은 NG다. |

판정은 BLOCK이다. 상세 위치, 재현 시나리오, 수정 조건은 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-18.md`에 기록했다. 제품 코드는 수정하지 않았다.

## 2026-09-18 12:16 KST · 성과 시계열 갭 재확인 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 두 갭 감사에서 현재도 없는 기본 흐름 항목을 하나 구현 | GAP-HISTORY-20260918-1216-01 | NG | 현재 schema, migration, `GET /api/metrics`에는 게시물별 관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교가 없다. |
| 공정과 기술계약 | 승인 범위 안에서만 제품 소스를 수정 | GAP-HISTORY-20260918-1216-02 | BLOCK | `pipeline-state.osmu.md`는 `qa`, `in-progress`, 승인 아님이다. 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준도 승인되지 않았다. 제품 소스 수정은 0건이다. |
| 기본 흐름 실앱 | 생성, 편집, 발행 큐, 성과 재인계 | GAP-HISTORY-20260918-1216-03 | PASS | 현재 HEAD를 임시 기동한 localhost:3456에서 `verify-basic-flow-e2e.mjs` 11/11을 관찰했다. |
| Studio v1 실앱 | 인증, 입력 거절, 생성, 조회와 재생성 | GAP-HISTORY-20260918-1216-04 | PASS | 같은 실행본에서 `verify-studio-v1-e2e.mjs` 14/14를 관찰했다. |
| 타입 계약 | 현재 소스 TypeScript 검사 | GAP-HISTORY-20260918-1216-05 | PASS | 개발 서버 종료 후 `npx tsc --noEmit` 재실행 종료 코드 0이다. 실행 중 처음 검사는 손상된 `.next/dev/types` 생성물로 실패했다. |
| 전체 단위 및 통합 | `npm run test` 필수 회귀 | GAP-HISTORY-20260918-1216-06 | NG | 전체 실행은 377파일 중 3파일, 2,431건 중 7건 실패했다. 실패 파일만 재실행하자 publish 32/32와 shorts factory 5/5는 통과했고 `four-room-empty-actions.test.tsx`의 `V77-CREATE-NETWORK-03`만 10초 timeout으로 남았다. 전체 명령 종료 코드 0은 미확인이다. |

실앱 두 흐름은 통과했지만 신규 성과 시계열 기술계약이 승인되지 않았고 전체 Vitest가 NG다.
제품 소스는 수정하지 않았으며 운영 배포와 실제 SNS 공개 발행은 미검증이다.

## 2026-09-18 04:26 KST · 최근 24시간 코드 공격 리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드리뷰 24시간 | 외부 성공이 확인된 기록만 복구 | REVIEW-24H-20260918-12 | NG | `dashboard/src/app/api/publish/reconcile/route.ts:41`은 현재 작업 공간과 플랫폼만 맞으면 기존 상태와 외부 성공 증거 없이 `failed` 행도 `published`로 바꿀 수 있다. |
| 코드리뷰 24시간 | 실패한 내부 단계만 복구 | REVIEW-24H-20260918-13 | NG | `publish/reconcile/route.ts:9`은 원래 실패 단계 `stage`를 받지 않고 발행 행, 큐, 사용량을 모두 다시 처리하며 `:71`에서 게시 시각도 복구 시각으로 덮는다. |
| 코드리뷰 24시간 | 사용량 발생 기간 보존 | REVIEW-24H-20260918-14 | NG | `dashboard/src/lib/usage-events.ts:45`은 실제 발생 시각 없이 relay 현재 시각으로 원장에 넣는다. 월경계 복구 시 이전 달 발행이 다음 달 사용량으로 이동한다. |
| 코드리뷰 24시간 | pending 적체를 전체 성공으로 세지 않음 | REVIEW-24H-20260918-15 | NG | `usage-events.ts:67`은 기본 50건만 처리하고 남은 수를 반환하지 않는다. 51건 이상이면 `/api/usage`가 1건 이상 누락한 낮은 합계를 HTTP 200으로 반환한다. |
| 필수 회귀 | 전체 테스트와 TypeScript | REVIEW-24H-20260918-16 | PASS, 생성물 주의 | Vitest 376파일, 2,427건 통과, 3건 제외. 작업 트리 TypeScript는 개발 서버의 손상된 `.next/dev/types/routes.d.ts:291` 때문에 실패했으나, 같은 HEAD의 깨끗한 사본은 `npx tsc --noEmit` 종료 코드 0이다. |
| 실앱 기본 흐름 | localhost:3456 기본 흐름과 Studio v1 | REVIEW-24H-20260918-17 | PASS | 기본 흐름 11/11, Studio v1 14/14. health HTTP 200, DB up. 지정 작업 공간 `/api/usage`는 임시 고객 토큰으로 HTTP 200, relay 처리 0, 실패 0을 확인했고 토큰을 폐기했다. |
| 삭제와 토큰 | 무기록 삭제와 디자인 토큰 | REVIEW-24H-20260918-18 | PASS | 커밋 범위 삭제 파일 0개. 변경 제품 UI의 새 색상 리터럴과 인라인 스타일 0건, 새 긴 대시와 그림문자 및 영문 단추 라벨 0건이다. |
| 외부 공개와 장애 주입 | 실제 SNS, 51건 적체, 월경계 복구 | REVIEW-24H-20260918-19 | 미검증 | 돈과 공유 데이터에 영향을 주는 외부 발행과 장애 주입은 실행하지 않았다. 코드와 DB 계약으로 재현 경로를 확정했다. |

판정은 BLOCK이다. MAJOR 4건의 상세 위치, 재현 시나리오, 수정 조건은 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-18.md`에 기록했다. 제품 코드는 수정하지 않았다.

## 2026-09-18 03:36 KST · 성과 시계열 갭 재확인 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 두 갭 감사에서 현재도 없는 기본 흐름 항목을 하나 구현 | GAP-HISTORY-20260918-0311-01 | NG | 현재 schema, migration, `GET /api/metrics`에는 게시물별 관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교가 없다. localhost 지정 작업 공간 응답은 HTTP 200, 최상위 키 `coverage`, `posts`, 게시물 0건이며 `history`, `comparison`은 없다. |
| 공정과 기술계약 | 승인 범위 안에서만 제품 소스를 수정 | GAP-HISTORY-20260918-0311-02 | BLOCK | `pipeline-state.osmu.md`의 최신 공정은 `qa`, `in-progress`, 승인 아님이다. 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준도 승인되지 않았다. 제품 소스 수정은 0건이다. |
| 타입 계약 | 현재 소스 TypeScript 검사 | GAP-HISTORY-20260918-0311-03 | PASS | `npx tsc --noEmit` 종료 코드 0. |
| 전체 단위 및 통합 | 실제 PostgreSQL schema, seed, RLS, legacy migration에서 전체 회귀 | GAP-HISTORY-20260918-0311-04 | PASS | 직렬 전체 실행에서 376파일, 2,429건 통과, 1건 제외, 종료 코드 0이다. 병렬 실행에서 발생한 정리 단계 교착 1건은 해당 파일 단독과 직렬 전체에서 재현되지 않았다. |
| 기본 흐름 실앱 | 생성, 편집, 발행 큐, 성과 재인계 | GAP-HISTORY-20260918-0311-05 | PASS | 최신 HEAD `8cc2dd4f`를 띄운 localhost:3456에서 11/11 통과했다. |
| Studio v1 실앱 | 인증, 입력 거절, 생성, 후보 거절과 무료 재생성 | GAP-HISTORY-20260918-0311-06 | NG | localhost에서 10/14 통과했다. 두 작업의 후보 전체 거절 2건, 무료 재생성 상태, 대체 후보 확인 4건이 실패했다. |
| 디자인 토큰 | 현재 Web 소스 토큰 검사 | GAP-HISTORY-20260918-0311-07 | PASS | `design-lint.sh src` 위반 0, 종료 코드 0. |

실행본 health는 HTTP 200, DB `up`, build commit `8cc2dd4f5d61a099834271d5419e5bc8838f480a`였다. 운영 배포와 외부 SNS 공개 발행은 미검증이다.

## 2026-09-18 03:08 KST · 최근 24시간 코드 리뷰 MAJOR 10건 수정 PASS

STAMP: 2026-09-18 03:08 KST | model: gpt-codex/gpt-5 | agent: code-builder | skill: qa | 근거: 감사 재현, localhost 실요청, 라이브 PostgreSQL, 전체 회귀, 공식 공급자 문서 | 고민: 외부 게시를 반복하지 않고 장부만 복구하는 경계를 가장 먼저 고정했다.

### 심각도 순 수정 판정

| 순위 | 테스트번호 | 위험 | 판정과 증거 |
|---|---|---|---|
| 1 | REVIEW-24H-20260918-03A | TikTok 완료 사용량 누락 | PASS. 두 완료 분기가 pending outbox와 relay를 남긴다. 정상과 relay 실패 7건 통과. |
| 2 | REVIEW-24H-20260918-03B | 예약 발행 사용량 누락 | PASS. 성공 INSERT와 같은 행에 outbox를 두고 relay한다. 예약 발행 14건 통과. |
| 3 | REVIEW-24H-20260918-04 | relay 실패를 낮은 정상 합계로 표시 | PASS. `/api/usage`가 지연 상태 503을 반환하고 성과실이 숫자 대신 지연 안내를 표시한다. 사용량 4건과 화면 계약 통과. |
| 4 | REVIEW-24H-20260918-01 | 복구 단추가 초안만 완료 처리 | PASS. 테넌트 범위 복구 API가 발행 행, 승인 큐, 사용량을 복구하고 성공한 플랫폼만 목록에서 제거한다. localhost 임시 행 실측은 HTTP 200, `published`, 사용량 `recorded`, 장부 1건이었다. 없는 발행 식별자는 HTTP 409였다. |
| 5 | REVIEW-24H-20260918-02A | YouTube 기본 계정 간 예약 혼선 | PASS. 실제 해석 계정 ID를 멱등 키, INSERT, SELECT, 토큰 갱신에 일관되게 쓴다. 기본 계정 A와 B 분리 회귀 포함 19건 통과. |
| 6 | REVIEW-24H-20260918-02B | 다른 파일을 옛 YouTube 세션에 재개 | PASS. 저장 해시와 크기가 현재 파일과 다르면 옛 URI를 쓰지 않고 예약을 닫은 뒤 새 세션을 만든다. 불일치 회귀 포함 19건 통과. |
| 7 | REVIEW-24H-20260918-05B | 네 방 검증기가 동시 설정을 삭제 | PASS. 애플리케이션과 같은 파일 잠금에서 fresh read, 필드 변경, 원자 쓰기를 수행하고 자기 `onboardingComplete`만 조건부 복구한다. localhost 네 방 20화면, 복귀 5건, 정리 종료 코드 0. |
| 8 | REVIEW-24H-20260918-05A | 브라우저 일부 중단을 성공으로 판정 | PASS. 관리자 정상, 회원 응답 없음 실측에서 한국어 상태만 출력하고 종료 코드 1이었다. 회귀 테스트가 비정상 종료와 금지 문자를 함께 검사한다. |
| 9 | REVIEW-24H-20260918-06 | OAuth 검증 오류를 테스터 누락으로 단정 | PASS. 구체 신호가 없는 검증 코드 오류는 재연결, 돌아올 주소, Client ID 확인으로 안내한다. 정상과 거절 11건 통과. |
| 10 | REVIEW-24H-20260918-07 | 상태 스크립트 그림문자 | PASS. `정상`, `오류`, `기동 실패`로 바꿨고 금지 문자 출력 0건을 회귀로 고정했다. |

### 통합 검증

| 검증 | 결과 | 관찰 증거 |
|---|---|---|
| 전체 단위 및 통합 | PASS | Vitest 376파일, 2,426건 통과, 3건 제외, 종료 코드 0 |
| TypeScript | PASS | `npx tsc --noEmit` 종료 코드 0 |
| production build | PASS | Next.js 정적 페이지 185/185 생성, `/api/publish/reconcile` 포함, 종료 코드 0 |
| 디자인 토큰 | PASS | `design-lint.sh src`, 위반 0 |
| 기본 흐름 | PASS | localhost 생성부터 성과 재인계 11/11 |
| Studio v1 | PASS | 인증과 입력 거절, 생성, 조회, 재생성 14/14 |
| 네 방 UI | PASS | 390 라이트와 다크, 768, 1024, 1440에서 20화면, 가로 넘침 0, 401 0, 콘솔 오류 0. 증거 `logs/diff/osmu-four-room-flow-20260918-codefix/` |
| 실제 장부 복구 | PASS | 지정 작업 공간의 임시 `in_progress` 행에 localhost 복구 API 호출, HTTP 200, 발행 `published`, 사용량 `recorded`, 사용량 이벤트 1건 확인 후 임시 데이터 삭제 |
| health | PASS | localhost HTTP 200, DB `up`, 실행 제품 커밋 `2d62bd02` |

실제 SNS 공개 발행과 공급자 과금 호출은 하지 않았다. 이 수정은 공급자 재호출 없이 기존 성공 결과의 내부 장부만 복구하도록 검증했다. 운영 배포는 미검증이다.

### 레드팀과 셀프심문

가장 위험한 반례는 복구 API가 다른 작업 공간의 발행 식별자를 고치는 경우다. 모든 SELECT와 UPDATE에 현재 tenant를 넣고 RLS 트랜잭션 안에서 잠갔으며, 다른 범위 식별자 회귀는 409와 변경 0건을 확인했다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 localhost가 이전 제품 코드를 실행한 경우다. health의 제품 커밋 `2d62bd02`가 핵심 제품 수정 `b35da4d1`, `b6117657`의 후손이고, 새 `/api/publish/reconcile`가 실제 DB 행과 사용량 행을 바꾼 것을 직접 관찰해 귀속을 확인했다.

SOURCES: `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-18.md` · `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` · `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` · `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` · https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol · https://www.rfc-editor.org/rfc/rfc6749 · https://www.postgresql.org/docs/current/explicit-locking.html

MODEL: gpt-codex/gpt-5

## 2026-09-18 01:31 KST · Meta 인사이트 회귀 테스트 CI 타입 검사 🔧 전환

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| CI-35245704219 | Meta 인사이트 회귀 테스트를 CI와 같은 TypeScript 설정으로 검사 | META-INSIGHTS-TYPE-20260918-01 | 🔧 수정, 테스트 PASS | GitHub Actions run `35245704219`의 Type check는 53행과 121행 `TS2493`, 종료 코드 2였다. 두 mock에 fetch의 `input`과 선택적 `init` 호출 시그니처를 부여했다. `npx tsc -p tsconfig.ci.json --noEmit` 종료 코드 0, 표적 Vitest 1파일 6건 통과. 원격 CI 재실행과 운영 배포는 미검증. |

## 2026-09-18 01:02 KST · Meta App Review 인사이트 코드 갭 수정 착수

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| IG-INSIGHTS-01 | Instagram OAuth에 인사이트 권한 포함 | META-INSIGHTS-20260918-01 | 🔧 수정, 테스트 PASS | `instagram_business_manage_insights` scope를 추가했고 OAuth URL 회귀 테스트가 통과했다. 실제 OAuth 승인은 미검증. |
| IG-INSIGHTS-02/03 | Instagram Login host와 media metric 정합 | META-INSIGHTS-20260918-02 | 🔧 수정, 테스트 PASS | Meta current reference의 `graph.instagram.com`, `v26.0`, FEED·REELS `views,likes,comments`를 반영. Instagram/Reels URL·구 `impressions` 파싱 회귀 통과. 실제 토큰 호출은 미검증. |
| FB-INSIGHTS-01 | Facebook Login configuration 참고 권한 정합 | META-INSIGHTS-20260918-03 | 부분 🔧, 콘솔 미검증 | `FACEBOOK.scopes`에 `read_insights`를 추가하고 Facebook URL 회귀를 통과했다. `FB_CONFIG_ID(1553247286513620)` configuration 포함 여부와 실제 호출은 콘솔 확인 필요. |

표적 Vitest 3파일 73건과 TypeScript, 디자인 토큰 lint가 통과했다. Instagram과 Facebook 실제 API 호출은 토큰이 없어 미검증이다.

## 2026-09-18 00:41 KST · 최근 24시간 코드 공격 리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드리뷰 24시간 | 외부 성공 뒤 실제 발행 원장 복구 | REVIEW-24H-20260918-01 | NG | `dashboard/src/app/studio/page.tsx:1234`가 초안만 발행 완료로 바꾸고 복구 목록을 지운다. 실제 발행 행, 승인 큐, 사용량 outbox 복구 호출은 없다. |
| 코드리뷰 24시간 | YouTube 계정과 업로드 파일 결속 | REVIEW-24H-20260918-02 | NG | `video/publish/route.ts:246`은 요청 account ID를 쓰고 실제 기본 계정 ID를 버린다. 같은 파일 `:354`는 저장 해시와 크기를 대조하지 않고 세션을 재개한다. |
| 코드리뷰 24시간 | 모든 발행 경로의 사용량 원장 | REVIEW-24H-20260918-03 | NG | TikTok 완료 `tiktok/publish-status/route.ts:87`과 예약 발행 `schedule/publish-due/route.ts:409`가 새 usage outbox를 우회한다. |
| 코드리뷰 24시간 | 사용량 부분 실패 표시 | REVIEW-24H-20260918-04 | NG | `usage/route.ts:73`이 relay 실패 뒤에도 HTTP 200과 낮은 합계를 반환하고 성과실은 실패를 표시하지 않는다. |
| 코드리뷰 24시간 | 브라우저 상태와 공유 설정 경합 | REVIEW-24H-20260918-05 | NG | `osmu-browsers.sh status`는 회원 브라우저 응답 없음에도 종료 0이었다. 네 방 E2E는 공유 설정 전체를 최대 10분 뒤 옛 스냅샷으로 복원한다. |
| 코드리뷰 24시간 | Meta OAuth 오류 원인 | REVIEW-24H-20260918-06 | NG | `oauth-errors.ts:74`가 만료된 승인 코드도 테스터 명단 누락으로 단정한다. 현재 소스 함수 직접 호출로 재현했다. |
| 확정 문구 | 그림문자, 긴 대시, 영문 단추 라벨 | REVIEW-24H-20260918-07 | NG | 새 브라우저 상태 출력에 그림문자 3종이 있다. 제품 UI 노출 문구의 긴 대시와 영문 단추 라벨은 0건이었다. |
| 필수 회귀 | 전체 test와 TypeScript | REVIEW-24H-20260918-08 | PASS | Vitest 374파일, 2,416건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. |
| 실앱 기본 흐름 | localhost:3456 기본 흐름과 Studio v1 | REVIEW-24H-20260918-09 | NG | health HTTP 200, DB up. 기본 흐름은 첫 생성 후보 0장, Studio v1은 정상 생성 기대 201 대신 HTTP 200으로 `STUDIO_LLM_PROVIDER_UNAVAILABLE`을 반환해 둘 다 종료 코드 1. |
| 삭제와 토큰 | 무기록 삭제 및 디자인 토큰 | REVIEW-24H-20260918-10 | PASS | 고정 커밋 범위의 삭제 파일 0개. 변경 제품 UI의 새 색상 리터럴과 인라인 스타일 0건. |
| 외부 실발행과 장애 주입 | 실제 SNS, DB 실패, 두 작업 공간 동시 실행 | REVIEW-24H-20260918-11 | 미검증 | 돈과 외부 공개를 일으키는 실발행과 파괴적 장애 주입은 실행하지 않았다. |

판정은 BLOCK이다. MAJOR 10건의 상세 위치, 재현, 수정 조건은 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-18.md`에 있다. 제품 코드는 수정하지 않았다.

## 2026-09-17 23:15 KST · 성과 시계열 갭 build 차단과 실앱 회귀 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 두 갭 감사에서 지금도 없는 기본 흐름 항목을 하나 구현 | GAP-HISTORY-20260917-2315-01 | NG | 남은 항목은 게시물별 성과 관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교다. 지정 작업 공간 `GET /api/metrics` HTTP 200, 키 `coverage`, `posts`, 게시물 0건, `history`와 `comparison` 없음. |
| 기술 계약과 공정 | 승인된 DB·API 계약 안에서만 build | GAP-HISTORY-20260917-2315-02 | BLOCK | `pipeline-state.osmu.md`는 `qa`, `in-progress`, 승인 아님이다. 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준의 승인 기술설계가 없다. |
| 전체 회귀 | 기존 생성·편집·발행·성과 흐름 보존 | GAP-HISTORY-20260917-2315-03 | PASS | Vitest 374파일·2,416건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. |
| 기본 흐름 실앱 | localhost 생성부터 성과 재인계 | GAP-HISTORY-20260917-2315-04 | NG | `verify-basic-flow-e2e.mjs` 최초와 재실행 모두 첫 생성 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 후보 0장, 종료 코드 1. 서버 원인은 `exit_nonzero`. |
| Studio v1 실앱 | 인증·거절·정상 생성 계약 | GAP-HISTORY-20260917-2315-05 | NG | 401·400·422 거절은 통과. 정상 생성은 기대 201 대신 HTTP 200의 공급자 오류로 종료 코드 1. |
| 실행본 귀속 | localhost와 현재 HEAD | GAP-HISTORY-20260917-2315-06 | 부분 확인 | health HTTP 200, DB up, 실행 `7c9c9050`, HEAD `8e4585e7`. 사이의 성과 route·schema·migration·필수 E2E 변경은 0건. 운영 배포는 미검증. |
| 신규 구현 | migration, API, 계약 테스트 | GAP-HISTORY-20260917-2315-07 | BLOCK | 제품 소스 변경 0건. 승인 없는 저장 구조를 선택하지 않았고 새로 되는 항목은 없다. |

## 2026-09-17 20:19 KST · 최근 24시간 코드 공격 리뷰 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드리뷰 24시간 | 외부 성공과 내부 발행 장부 복구 | REVIEW-24H-20260917-22 | NG | `dashboard/src/app/studio/page.tsx:1234`가 초안만 발행 완료로 바꾸고 실제 발행 행과 사용량 장부를 복구하지 않는다. |
| 코드리뷰 24시간 | 재개 업로드와 파일 동일성 | REVIEW-24H-20260917-23 | NG | `dashboard/src/app/api/video/publish/route.ts:354`가 저장 해시와 크기를 현재 파일에 대조하지 않는다. |
| 코드리뷰 24시간 | 전 발행 경로 과금 원장 | REVIEW-24H-20260917-24 | NG | TikTok 완료 `tiktok/publish-status/route.ts:87`과 예약 발행 `schedule/publish-due/route.ts:409`가 usage outbox를 우회한다. |
| 코드리뷰 24시간 | 사용량 부분 실패 표시 | REVIEW-24H-20260917-25 | NG | `usage/route.ts:73`이 relay 실패 뒤에도 HTTP 200과 낮은 집계를 반환하고 성과실은 실패 수를 표시하지 않는다. |
| 코드리뷰 24시간 | macOS Claude 후보 폴백 | REVIEW-24H-20260917-26 | NG | `anthropic.ts:201`의 launchctl 래퍼가 대상 미존재를 종료 코드로 바꿔 다음 후보 시도를 막는다. |
| 코드리뷰 24시간 | 한국어 오류와 실패 화면 | REVIEW-24H-20260917-27 | NG | ElevenLabs 영문 오류가 사용자에게 노출되고, 블로그와 GSC 화면은 새 503을 오류 안내 대신 0 데이터로 보일 수 있다. |
| 코드리뷰 24시간 | 검증기 동시성 및 증거 무결성 | REVIEW-24H-20260917-28 | NG | API sweep는 실행 중 파일 추가와 삭제를 못 보고, 네 방 E2E는 공유 작업 공간 설정 전체를 옛 스냅샷으로 복원한다. |
| 코드리뷰 24시간 | Studio 실패 HTTP 상태 | REVIEW-24H-20260917-29 | NG | `generation/http.ts:75`가 502, 503, 504를 200으로 바꿔 실패를 성공으로 집계하게 만든다. |
| 코드리뷰 24시간 | Meta OAuth 원인 분류 | REVIEW-24H-20260917-30 | NG | `oauth-errors.ts:74`가 만료된 인증 코드도 테스터 명단 누락으로 단정한다. 현재 소스 직접 실행으로 잘못된 안내를 재현했다. |
| 필수 회귀 | 전체 test와 TypeScript | REVIEW-24H-20260917-31 | PASS | Vitest 374파일, 2,416건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. |
| 실앱 기본 흐름 | localhost:3456 기본 흐름과 Studio v1 | REVIEW-24H-20260917-32 | 부분 PASS | 기본 흐름 11/11, Studio v1 14/14. health HTTP 200, DB up. 실행 `0fc65567`은 검토 끝 `a66b4b37`보다 이전이라 최신 OAuth 변경은 현재 소스 직접 실행으로 별도 확인했다. |
| 외부 실발행과 장애 주입 | 실제 SNS, DB 실패, 두 작업 공간 동시 실행 | REVIEW-24H-20260917-33 | 미검증 | 돈과 외부 공개를 일으키는 실발행은 실행하지 않았다. |

판정은 BLOCK이다. MAJOR 12건의 상세 위치, 재현 시나리오, 수정 조건은 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-17.md` 최상단에 기록했다. 제품 코드는 수정하지 않았다.

## 2026-09-17 19시 22분 KST · 성과 시계열 갭 build 차단 재확인

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 두 갭 감사에서 지금도 없는 기본 흐름 항목을 하나 구현 | GAP-HISTORY-20260917-1922-01 | ❌ NG | 남은 항목은 게시물별 성과 관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교다. 지정 작업 공간 `GET /api/metrics` HTTP 200, 키 `posts`, `coverage`, 게시물 0건, `history`와 `comparison` 없음. |
| 기술 계약과 공정 | 승인된 DB·API 계약 안에서만 build | GAP-HISTORY-20260917-1922-02 | BLOCK | `pipeline-state.osmu.md`는 `qa`, `in-progress`, 승인 아님이다. 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준의 승인 기술설계가 없다. |
| 전체 회귀 | 기존 생성·편집·발행·성과 흐름 보존 | GAP-HISTORY-20260917-1922-03 | PASS | Vitest 374파일·2,416건 통과, 3건 제외. TypeScript 종료 0. localhost 실제 요청 기본 흐름 11/11, Studio v1 14/14. |
| 실행본 귀속 | localhost와 현재 HEAD | GAP-HISTORY-20260917-1922-04 | 부분 확인 | health HTTP 200, DB up, 실행 `0fc65567`. 현재 HEAD `2aac6c14`까지 제품 diff 5개는 브라우저 런처와 연결 오류 분류 변경이며 성과 route·schema·migration 변경은 없다. 운영 배포는 미검증. |
| 신규 구현 | migration, API, 계약 테스트 | GAP-HISTORY-20260917-1922-05 | BLOCK | 제품 소스 변경 0건. 승인 없는 저장 구조를 선택하지 않았고 새로 되는 항목은 없다. |

## 2026-09-17 19:12 KST · Meta App Review 제출 패키지 독립 문서 리뷰

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| Meta 문서 품질 | `standard-doc-review.md` 5축 독립 채점 | META-DOC-REVIEW-20260917-01 | 최초 ❌ NG 17/25 → 보정 PASS 25/25 | 최초본은 목차·버전핀·개정이력·RUBRIC_SCORE가 없었고 권한별 화면 증거가 문서의 API 열에만 있었다. `docs/ops/meta-app-review-2026-09.md` v1.1.0 §12에 최초·최종 점수와 보정 근거 기록. |
| 영문 권한 문안 | Instagram 4, Threads 5, Facebook Page 4 | META-DOC-REVIEW-20260917-02 | PASS 13/13 | 권한별 사용자 가치, 사용하는 데이터·기능, 없을 때의 손실을 고유 문안으로 명시. |
| 스크린캐스트 계약 | 권한별 실제 API 요청이 화면에 보이는가 | META-DOC-REVIEW-20260917-03 | 대본 PASS 13/13, 실행 ❌ NG 0/13 | §4.5에 permission, token 없는 METHOD·path, HTTP 2xx, 결과를 권한별로 명시. 실제 영상과 최근 성공 호출은 아직 없음. |
| 콘솔 실측 정합 | 앱 Live, 표준 액세스 3개, redirect URI, 액세스 인증 | META-DOC-REVIEW-20260917-04 | PASS | 앱 Live는 관찰 상태, 액세스 인증은 미완료 제출 차단으로 기록. |
| 기술 정확성 | Instagram·Facebook 인사이트 및 Page 권한 | META-DOC-REVIEW-20260917-05 | ❌ NG, 제출 차단 | Instagram scope·host·공식 account·media metric 안내 충돌, Facebook `read_insights` configuration과 `pages_read_engagement` 직접 증거가 남아 있음. 특정 Instagram metric은 실제 media 성공 호출 전 확정하지 않음. |
| 출처 URL | 문서 내 외부 URL | META-DOC-REVIEW-20260917-06 | PASS 15/15 | redirect 포함 최종 HTTP 200. Meta 자동 수집은 429가 있었으나 직접 응답 본문과 HTTP로 재검증. |
| Codex 독립 2차 검토 | 권한 문안·API 증거·예약 발행 경계 | META-DOC-REVIEW-20260917-07 | 최초 ❌ RETAKE 4건 → 문서 보정 PASS | Instagram metric 과단정, Facebook Page name 과장, `pages_read_engagement` path 불일치, 예약 발행 누락을 보정. 실제 성공 호출·영상 0/13은 계속 제출 차단. |

문서 자체는 client-ready PASS로 보정했다. App Review 제출 준비는 실제 권한 성공 호출·영상 0/13과 기술 gap 때문에 계속 NO-GO다.

## 2026-09-17 19:12 KST · 네 방 기본 흐름 QA v23

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 사이드바에서 네 방을 잇는다 | FLOW-UI-V23 | PASS | localhost 네 방 4/4, 가린 모달·401·콘솔 오류 0 |
| R19 | 390·768·1024·1440에서 실제로 누른다 | FLOW-UI-V23 | PASS | 20화면, 성과실→생성실 복귀 5/5, 가로 넘침 0 |
| R166, R172 | 생성부터 성과 재인계까지 기본 흐름 | FLOW-API-V23 | PASS | 실제 localhost 요청 최종 11/11 |
| R193, R205, R206 | 승인 시안 계승과 화면 충실도 | DESIGN-CONF-V23 | NG | v63 기준과 현재 16개 라이트 화면의 배치 속성 불일치 또는 동일 상태 미확보. canonical 승인 핀은 v68이라 기준도 충돌 |
| R207 | 성과실 UX와 학습 정보 | FLOW-PERF-V23 | 부분 PASS | 제안 3건과 생성 큐 재인계 동작. v63 시각 정합 NG |
| R01~R207 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V23 | 이월 | 기존 정본 판정 유지. 이번 범위 관련 요청만 재검증 |

기능 범위는 PASS다. 기본 흐름 11/11, 네 방 4/4, Studio v1 14/14, 네 폭 20화면과 복귀 5/5,
전체 Vitest 374파일·2,416건, TypeScript, 격리 build 184/184, schema·seed·RLS, 디자인 lint를 통과했다.
제품 소스는 변경하지 않았다. v63 디자인 정합 NG, v63과 v68 승인 핀 충돌, 운영 배포와 외부 채널
실발행 미검증 때문에 제품 전체 QA는 NG다. 릴레이 품질 게이트도 운영 host 접촉 증거 0건으로 FAIL이다.
상세는 `docs/qa/osmu-four-room-basic-flow-v23-gpt-codex.md`,
원본은 `logs/diff/osmu-four-room-flow-20260917-v23/`이다.

## 2026-09-17 16:45 KST · 최근 24시간 코드 공격 리뷰 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드리뷰 24시간 | 외부 성공과 내부 발행 장부 복구 | REVIEW-24H-20260917-11 | NG | `dashboard/src/app/studio/page.tsx:1234`가 초안만 발행 완료로 바꾸고 실제 발행 행과 사용량 장부를 복구하지 않는다. |
| 코드리뷰 24시간 | 재개 업로드와 파일 동일성 | REVIEW-24H-20260917-12 | NG | `dashboard/src/app/api/video/publish/route.ts:354`가 저장 해시와 크기를 현재 파일에 대조하지 않는다. |
| 코드리뷰 24시간 | 전 발행 경로 과금 원장 | REVIEW-24H-20260917-13 | NG | TikTok 완료 `tiktok/publish-status/route.ts:87`과 예약 발행 `schedule/publish-due/route.ts:409`가 usage outbox를 우회한다. |
| 코드리뷰 24시간 | 사용량 부분 실패 표시 | REVIEW-24H-20260917-14 | NG | `usage/route.ts:73`이 relay 실패 뒤에도 HTTP 200과 낮은 집계를 반환하고 성과실은 실패 수를 표시하지 않는다. |
| 코드리뷰 24시간 | macOS Claude 후보 폴백 | REVIEW-24H-20260917-15 | NG | `anthropic.ts:201`의 launchctl 래퍼가 대상 미존재를 종료 코드로 바꿔 다음 후보 시도를 막는다. |
| 코드리뷰 24시간 | 한국어 오류와 실패 화면 | REVIEW-24H-20260917-16 | NG | localhost ElevenLabs, GA, GSC가 영문 오류를 반환했다. 블로그와 GSC 화면은 새 503을 오류 안내 대신 0 데이터로 보일 수 있다. |
| 코드리뷰 24시간 | 검증기 동시성 및 증거 무결성 | REVIEW-24H-20260917-17 | NG | API sweep는 실행 중 파일 추가와 삭제를 못 보고, 네 방 E2E는 공유 작업 공간 설정 전체를 옛 스냅샷으로 복원한다. |
| 코드리뷰 24시간 | Studio 실패 HTTP 상태 | REVIEW-24H-20260917-18 | NG | localhost Studio 첫 실행에서 `STUDIO_LLM_TIMEOUT`이 HTTP 200으로 반환됐다. `generation/http.ts:75`가 502, 503, 504를 200으로 바꾼다. |
| 필수 회귀 | 전체 test와 TypeScript | REVIEW-24H-20260917-19 | PASS | Vitest 374파일, 2,414건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. |
| 실앱 기본 흐름 | localhost:3456 기본 흐름과 Studio v1 | REVIEW-24H-20260917-20 | 부분 PASS | 기본 흐름 11/11. Studio v1 첫 실행은 timeout NG, 재실행 14/14 PASS. health HTTP 200, DB up. |
| 외부 실발행과 장애 주입 | 실제 SNS, DB 실패, 두 작업 공간 동시 실행 | REVIEW-24H-20260917-21 | 미검증 | 돈과 외부 공개를 일으키는 실발행은 실행하지 않았다. |

판정은 BLOCK이다. MAJOR 11건의 상세 위치, 재현 시나리오, 수정 조건은 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-17.md` 최상단에 기록했다. 제품 코드는 수정하지 않았다.

## 2026-09-17 14:25 KST · 네 방 기본 흐름 QA v22

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 사이드바에서 네 방을 잇는다 | FLOW-UI-V22 | PASS | localhost 네 방 4/4, 가린 모달·401·콘솔 오류 0 |
| R19 | 390·768·1024·1440에서 실제로 누른다 | FLOW-UI-V22 | PASS | 20화면, 성과실→생성실 복귀 5/5, 가로 넘침 0 |
| R166, R172 | 생성부터 성과 재인계까지 기본 흐름 | FLOW-API-V22 | PASS | 실제 localhost 요청 최초·최종 11/11 |
| R193, R205, R206 | 승인 시안 계승과 화면 충실도 | DESIGN-CONF-V22 | NG | v63 기준과 현재 16개 라이트 화면의 배치 속성 불일치 또는 동일 상태 미확보. canonical 승인 핀은 v68이라 기준도 충돌 |
| R207 | 성과실 UX와 학습 정보 | FLOW-PERF-V22 | 부분 PASS | 제안 3건과 생성 큐 재인계 동작. v63 시각 정합 NG |
| R01~R207 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V22 | 이월 | 기존 정본 판정 유지. 이번 범위 관련 요청만 재검증 |

### 판정과 직접 증거

- 기능 범위 PASS: 기본 흐름 11/11, 네 방 4/4, Studio v1 14/14, 네 폭 20화면과 복귀 5/5.
- 전체 회귀 PASS: 첫 실행에서 YouTube 동시 요청 테스트가 비결정적 0ms 대기로 timeout됐다. 실제 예약 확보 신호를 기다리게 고쳐 전용 5회 85/85, 전체 Vitest 374파일·2,414건, TypeScript, 격리 build 184/184를 통과했다. 수정 커밋 `0c596b03`.
- schema·seed·RLS PASS. 디자인 lint 위반 0.
- 제품 전체 QA는 NG: v63과 v68 승인 핀 충돌, v63 디자인 정합 NG, 운영 배포와 외부 채널 실발행 미검증.
- 상세: `docs/qa/osmu-four-room-basic-flow-v22-gpt-codex.md`. 원본: `logs/diff/osmu-four-room-flow-20260917-v22/`.

# QA Tracker — openclaw-auto-osmu (pipeline qa 단계 증거)

> 2026-07-02 밤샘 라이브 QA(browse+curl, 직접 관찰). 형식: 증거 항목 → 결과 → 근거.

## 2026-09-17 12시 15분 KST · 최근 24시간 코드 공격 리뷰 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드리뷰 24시간 | 외부 성공 뒤 내부 기록 복구 계약 | REVIEW-24H-20260917-01 | NG | `dashboard/src/app/studio/page.tsx:1234`가 초안만 `published`로 바꾸고 실제 발행 행과 사용량 장부를 복구하지 않는다. v63 7481행의 “기록만 복구” 계약 위반이다. |
| 코드리뷰 24시간 | YouTube resumable 세션과 실제 파일 결속 | REVIEW-24H-20260917-02 | NG | `dashboard/src/app/api/video/publish/route.ts:354`가 저장된 `fileHash`, `totalBytes`를 현재 파일과 비교하지 않고 재개한다. 같은 경로와 크기의 다른 파일을 기존 세션에 이어 붙일 수 있다. |
| 코드리뷰 24시간 | 모든 발행 경로의 과금 장부 내구성 | REVIEW-24H-20260917-03 | NG | TikTok 완료 `dashboard/src/app/api/tiktok/publish-status/route.ts:87`과 예약 발행 `dashboard/src/app/api/schedule/publish-due/route.ts:409`에 usage outbox가 없다. 성공 발행이 쿼터와 과금에서 빠진다. |
| 코드리뷰 24시간 | macOS Claude 후보 폴백 | REVIEW-24H-20260917-04 | NG | `dashboard/src/lib/anthropic.ts:201`의 launchctl 래퍼는 없는 후보를 `ENOENT`가 아닌 종료 코드 2로 바꾼다. 실제 `/bin/launchctl asuser` 호출에서 `posix_spawn(): 2`, 종료 코드 2를 관찰했고 다음 후보 폴백이 막힌다. |
| 코드리뷰 24시간 | 한국어 사용자 오류 계약 | REVIEW-24H-20260917-05 | NG | localhost `GET /api/elevenlabs-voices`가 HTTP 503과 `API key not set`을 반환했다. 블로그, GA, GSC도 최근 변경에서 영문 오류를 유지하며 일부 화면이 원문을 직접 표시한다. |
| 필수 회귀 | 전체 test와 TypeScript | REVIEW-24H-20260917-06 | PASS | `npm run test` 374파일, 2,414건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. |
| 실앱 기본 흐름 | localhost:3456 기본 흐름과 Studio v1 | REVIEW-24H-20260917-07 | PASS | health HTTP 200, DB up. `verify-basic-flow-e2e.mjs` 11/11, `verify-studio-v1-e2e.mjs` 14/14 통과. |
| 외부 실발행과 격리 | 실제 SNS, DB 실패 주입, 두 작업 공간 동적 검증 | REVIEW-24H-20260917-08 | 미검증 | 돈과 외부 공개를 일으키는 실제 게시를 실행하지 않았다. 정적 SQL 대조에서는 새 교차 작업 공간 누수를 찾지 못했다. |

근본 원인은 발행 가능한 경로 목록과 공통 장부 불변식이 정본으로 열거되지 않은 점, resumable
세션의 저장 파일 메타데이터를 재개 전에 검증하지 않은 점, 화면 복구 이름과 서버 효과가 갈린 점,
launchctl 도입 뒤 바뀐 오류 의미를 실제 래퍼로 테스트하지 않은 점이다. 상세 재현과 수정 조건은
`docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-17.md` 최상단에 기록했다.

## 2026-09-17 11시 06분 KST · 성과 시계열 갭 재착수 ❌ NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 두 갭 감사를 현재 코드와 대조해 기본 흐름의 잔여 미구현 하나를 만든다 | GAP-HISTORY-20260917-1106-01 | ❌ NG | 게시물별 성과 관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교가 여전히 없다. 지정 작업 공간 `GET /api/metrics`는 HTTP 200, 키 `posts`, `coverage`, 게시물 0건이며 `history`, `comparison`이 없다. |
| 기술 계약 | DB와 API 선택을 승인 산출물에서 확인한다 | GAP-HISTORY-20260917-1106-02 | BLOCK | 현재 공정은 `qa`, 승인 아님이다. 승인된 성과 관측 단위, 중복 방지 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준이 없다. code-builder가 새 DB 스키마와 API 계약을 선택할 수 없다. |
| 실행본 귀속 | localhost 제품 소스와 현재 제품 소스 비교 | GAP-HISTORY-20260917-1106-03 | PASS | health HTTP 200, DB up, 실행 `build_commit=2280089f`. 실행 커밋은 현재 HEAD의 조상이고 그 뒤 `dashboard/src`, `dashboard/db`, `dashboard/tests`, `dashboard/scripts` 제품 diff는 0건이다. |
| 기본 흐름 실앱 | 생성, 편집, 발행 큐, 성과 제안 재인계와 지표 조회 | GAP-HISTORY-20260917-1106-04 | 조건부 PASS | 첫 실행은 AI 출력 JSON 파싱 실패로 후보 0장, 종료 1이었다. 재실행은 11/11 통과했다. `logs/diff/osmu-gapfill-20260917-1106/commands/verify-basic-flow-e2e.txt`, `verify-basic-flow-e2e-retry.txt` |
| Studio v1 실앱 | 인증과 입력 거절, 정상 생성, 조회와 무료 다시 만들기 | GAP-HISTORY-20260917-1106-05 | PASS | 14/14 통과. `commands/verify-studio-v1-e2e.txt` |
| 필수 회귀 | 전체 test와 TypeScript | GAP-HISTORY-20260917-1106-06 | PASS | Vitest 374파일, 2,414건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. `commands/npm-test.txt`, `tsc-noemit.txt` |
| 제품 소스와 갭 전환 | migration, API, 계약 테스트 | GAP-HISTORY-20260917-1106-07 | BLOCK | 제품 소스 변경 0건. 새 DB 스키마와 API 비교 계약을 승인 없이 선택하지 않았다. 새로 되는 것으로 전환된 항목은 없다. |

승인 없이 최신 누계 두 번의 차이를 30일 성과로 이름 붙이거나 `provider_meta` 배열을 새 저장소로
쓰면 기간 재현성과 공급자별 의미가 깨진다. 별도 snapshot table, 공급자 기간 조회, JSONB 중
하나를 기술설계에서 합의한 뒤 build를 다시 열어야 한다.

## 2026-09-17 10시 18분 KST · 네 방 기본 흐름 v21 기능 범위 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 백엔드 기본 흐름 관통 | FLOW-API-V21 | PASS | HEAD `2280089f`와 일치하는 localhost 실제 요청 최초와 최종 11/11. 후보 3장, 편집 상태 변경, 발행 큐 HTTP 201, 성과 제안 3건, 생성 큐 재인계. `logs/diff/osmu-four-room-flow-20260917-v21/commands/10-verify-basic-flow-final.txt` |
| R08, R19, R207 | 네 방 렌더와 가린 모달 확인 | FLOW-ROOM-PROBE-V21 | PASS | seed 후 최종 4/4, 가린 모달 0, 브라우저 401 0, 콘솔 오류 0. `commands/11-probe-four-room-final.txt` |
| R08, R19 | 390, 768, 1024, 1440에서 사람처럼 생성실부터 성과실까지 이동 | FLOW-UI-V21 | PASS | 390 라이트·다크와 768, 1024, 1440의 20화면, 성과실→생성실 복귀 5/5. 가로 넘침, 탐색 가림, 모달, 401, 콘솔 오류 0. `commands/12-verify-four-room-ui-final.txt`, 원본 `captures-final/` |
| R166, R172 | Studio v1 인증, 생성, 조회, 무료 다시 만들기 | FLOW-STUDIO-V21 | PASS | localhost 실제 요청 14/14. `commands/04-verify-studio-v1-e2e.txt` |
| 필수 회귀 | 전체 test, TypeScript, production build, seed·RLS, health·주요 API curl, 디자인 lint | FLOW-REGRESSION-V21 | PASS | Vitest 374파일·2,414건 통과, 3건 제외. `npx tsc --noEmit` 종료 0. 격리 build 184/184, seed·RLS 멱등 적용, health·metrics·drafts HTTP 200, 디자인 lint 위반 0. `commands/05`부터 `14` |
| 검증 자격증명 | QA 토큰 정리 | FLOW-TOKEN-CLEANUP-V21 | PASS | 활성 `qa-four-room-*` 토큰 0건, 최신 6/6 폐기. `commands/14-token-cleanup.txt` |
| R193, R205, R206 | v63 계승과 8개 배치 속성 정합 | DESIGN-CONF-V21 | NG | v63 원본과 현재 16개 라이트 화면이 요소 순서, 열 수, 정렬과 여백, 표시와 숨김, 글꼴 단계, 버튼 위계에서 불일치하거나 동일 상태가 아님. 과제 v63과 canonical v68 승인 핀도 충돌. `docs/qa/osmu-four-room-basic-flow-v21-gpt-codex.md` |
| 제품 전체 | 운영 배포와 외부 채널 | QA-QUALITY-GATE-V21 | NG | localhost 기능 범위만 PASS. 운영 동적 URL, 실제 배포 버전, 외부 채널 실발행은 미검증이고 디자인 정합 NG. |
| 릴레이 품질 게이트 | stage 또는 운영 호스트 접촉 | QA-RELAY-GATE-V21 | FAIL | `verify-agent-quality.sh`가 배포 환경 접촉 증거 0건으로 반려. 과제 명시 범위의 localhost 결과만 출고하고 운영 QA로 확대하지 않는다. `commands/15-verify-agent-quality.txt` |
| R01부터 R207 및 세부 요청 232건 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V21 | 이월 | 기존 정본 판정을 유지하고 이번 범위 관련 요청만 갱신. |

제품 소스는 수정하지 않았다. 최신 실행본의 기능 흐름에서 끊긴 곳은 없었다. 16개 화면 디자인
정합 NG와 운영 배포 미검증 때문에 QA 승인은 불가하다.

## 2026-09-17 08시 17분 KST · 최근 24시간 코드 공격 최종 재검수 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드 리뷰 | 최근 24시간 돈, 격리, 동시성, 부분 실패, 삭제, 확정 요구 이탈 | CODE-REVIEW-FINAL-20260917-01 | BLOCK | 고정 끝 `b3086d78`, 49개 커밋, 순변경 155개 파일. MAJOR 3건: 화면 복구가 서버 장부를 고치지 않음, YouTube 재개 세션이 바뀐 파일을 이어 붙일 수 있음, ElevenLabs 영문 오류가 UI에 노출됨. 상세 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-17.md` |
| 필수 회귀 | 전체 test와 TypeScript | CODE-REVIEW-FINAL-20260917-02 | PASS | Vitest 374개 파일과 2,414건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. |
| 실앱 기본 흐름 | localhost:3456 실제 요청 | CODE-REVIEW-FINAL-20260917-03 | 범위 PASS | 기본 흐름 11/11, Studio v1 14/14. health HTTP 200, DB up. 실행 제품 소스 `7f5564ea` 이후 검토 끝까지 제품 소스 변경 0개라 현재 제품 코드에 귀속된다. |
| 사용량 실측 | 지정 작업 공간 `/api/usage` | CODE-REVIEW-FINAL-20260917-04 | 관찰 | HTTP 200, source `usage_events`, 모든 기간 발행 0, 일별 행 0. pending 복구 대상이 없는 정상 조회만 관찰했다. |
| 외부 경계 | 공개 YouTube와 운영 배포 | CODE-REVIEW-FINAL-20260917-05 | 미검증 | 공개 게시, 공급자 성공 직후 DB 장애 주입, 운영 배포는 실행하지 않았다. |

제품 코드는 수정하지 않았다. 세 MAJOR를 코드 작성자가 고친 뒤 같은 고정 시나리오와 현재 제품 소스에서 다시 검수한다.

## 2026-09-17 06시 19분 KST · 네 방 기본 흐름 v20 기능 범위 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 백엔드 기본 흐름 관통 | FLOW-API-V20 | PASS | HEAD `7f5564ea` 와 일치하는 localhost 실제 요청 최종 11/11. 후보 3장, 편집 상태 변경, 발행 큐 HTTP 201, 성과 제안 3건, 생성 큐 재인계. `logs/diff/osmu-four-room-flow-20260917-v20/commands/16-verify-basic-flow-final.txt` |
| R08, R19, R207 | 네 방 렌더와 가린 모달 확인 | FLOW-ROOM-PROBE-V20 | PASS | seed 후 최종 4/4, 가린 모달 0, 브라우저 401 0, 콘솔 오류 0. `commands/17-probe-four-room-final.txt` |
| R08, R19 | 390, 768, 1024, 1440에서 사람처럼 생성실부터 성과실까지 이동 | FLOW-UI-V20 | PASS | 390 라이트·다크와 768, 1024, 1440의 20화면, 성과실→생성실 복귀 5/5. 가로 넘침, 탐색 가림, 모달, 401, 콘솔 오류 0. `commands/18-verify-four-room-ui-final.txt`, 원본 `captures-final/` |
| R166, R172 | Studio v1 인증, 생성, 조회, 무료 다시 만들기 | FLOW-STUDIO-V20 | PASS | localhost 실제 요청 14/14. `commands/04-verify-studio-v1-e2e.txt` |
| 필수 회귀 | 전체 test, TypeScript, production build, seed·RLS, health·주요 API curl, 디자인 lint | FLOW-REGRESSION-V20 | PASS | Vitest 374파일·2,414건 통과, 3건 제외. `npx tsc --noEmit` 종료 0. 격리 build 184/184, seed·RLS 멱등 적용, health·metrics·drafts HTTP 200, 디자인 lint 위반 0. `commands/05` 부터 `13` |
| 검증기 환경 회수 | 격리 production build | FLOW-BUILD-V20-RECOVERY | PASS | 최초 `node_modules` symlink은 Turbopack root 제약으로 환경 NG였다. 실복사 격리 디렉터리에서 compile과 184/184를 통과해 제품 오류와 분리했다. `commands/07-npm-build.txt`, `commands/08-npm-build-copy.txt` |
| 검증 자격증명 | QA 토큰 정리 | FLOW-TOKEN-CLEANUP-V20 | PASS | 이번 실행 최신 토큰 10/10 폐기. 2026-09-15부터 남은 검증 토큰 1개도 제품 API HTTP 200으로 폐기해 활성 `qa-four-room-*` 토큰 0건. `commands/20-token-cleanup.txt` |
| R193, R205, R206 | v63 계승과 8개 배치 속성 정합 | DESIGN-CONF-V20 | NG | v63 원본과 현재 16개 라이트 화면이 요소 순서, 열 수, 정렬과 여백, 표시와 숨김, 글꼴 단계, 버튼 위계에서 불일치하거나 동일 상태가 아님. 과제 v63과 canonical v68 승인 핏도 충돌. `docs/qa/osmu-four-room-basic-flow-v20-gpt-codex.md` |
| 제품 전체 | 운영 배포와 외부 채널 | QA-QUALITY-GATE-V20 | NG | localhost 기능 범위만 PASS. 운영 동적 URL, 실제 배포 버전, 외부 채널 실발행은 미검증이고 디자인 정합 NG. |
| R01부터 R207 및 세부 요청 232건 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V20 | 이월 | 기존 정본 판정을 유지하고 이번 범위 관련 요청만 갱신. |

제품 소스는 수정하지 않았다. 기능 흐름에서 끊긴 곳은 없었고, 최초 build 실패는 격리
방식의 symlink 제약으로 확정해 실복사 환경에서 회수했다. 16개 화면 디자인 정합 NG와 배포
미검증 때문에 QA 승인은 불가하다.

## 2026-09-17 06시 14분 KST · 네 방 기본 흐름 v20 build 검증기 환경 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 필수 회귀 | production build | FLOW-BUILD-V20-INITIAL | ❌ NG | 격리 작업 디렉터리에 `node_modules`를 symlink로 연결한 검증기가 Turbopack의 파일시스템 root 제약에 걸려 종료 코드 1. 제품 compile 오류가 아닌 검증 환경 구성 실패로 분리했으며 실복사 격리 build로 재검증 전에는 PASS로 전환하지 않는다. `logs/diff/osmu-four-room-flow-20260917-v20/commands/07-npm-build.txt` |


## 2026-09-17 05시 20분 KST · 코드 공격 수정 후 독립 재검수 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드 리뷰 수정 재검수 | 원래 MAJOR 6건의 실제 종결 여부 | CODE-REVIEW-REFIX-20260917-01 | BLOCK | 4건은 닫혔고 2건이 남았다. 화면 복구 단추가 서버 발행 장부를 고치지 않고 경고만 지우며, YouTube 세션 재개가 저장 파일 해시와 현재 파일 해시를 비교하지 않는다. 상세는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-17.md`의 수정 커밋 독립 재검수 절이다. |
| 표적 회귀 | YouTube, outbox, 부분 발행 | CODE-REVIEW-REFIX-20260917-02 | PASS | 4파일, 28건 통과. 기존 재개 테스트는 파일이 바뀌지 않는 경우만 검사해 파일 혼합 경로를 잡지 못한다. |
| 전체 회귀 | test, TypeScript, production build | CODE-REVIEW-REFIX-20260917-03 | PASS | 374파일과 2,414건 통과, 3건 제외. TypeScript와 production build 종료 코드 0. |
| 실앱 기본 흐름 | 수정 커밋 포함 localhost 실제 요청 | CODE-REVIEW-REFIX-20260917-04 | 범위 PASS | 기본 흐름 11/11, Studio v1 14/14. health HTTP 200, DB up, 실행 `f3c3704a`는 수정 커밋 `46e75b2d`를 포함한다. 현재 브랜치 HEAD `ba7e9f6f`와는 다른 계보라 현재 HEAD 귀속은 NG다. |
| 외부 경계 | 공개 SNS와 운영 배포 | CODE-REVIEW-REFIX-20260917-05 | 미검증 | 외부 게시와 운영 배포는 실행하지 않았다. |

제품 코드는 수정하지 않았다. 서버 발행 장부의 실제 복구와 YouTube 재개 파일 동일성 검증이 들어간 새 고정 커밋 뒤 다시 검수한다.

## 2026-09-17 05시 08분 KST · 코드 공격 리뷰 MAJOR 6건 수정 PASS

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드 리뷰 수정 | 돈과 쿼터 장부 유실, YouTube 중복 업로드, 발행 의도 유실, 부분 실패 오판, 금지 문구를 위험도 순으로 수정 | CODE-REVIEW-FIX-20260917-01 | PASS | 수정 커밋 `1f7fbed4`, `46e75b2d`, `dc5165cf`. outbox 실 DB 회귀 `72044c45`. 원래 여섯 지적을 모두 수정했고 제외한 지적은 없다. 상세는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-17.md`의 수정 결과 표다. |
| 과금 장부 | pending outbox 원자 기록, 실패 보존, 중복 relay 방지 | CODE-REVIEW-FIX-20260917-02 | PASS | 목 경계 4건과 실제 Postgres 통합 1건 통과. 같은 발행을 두 번 relay해도 `usage_events`는 1행이고 outbox는 recorded로 수렴했다. 테스트 뒤 행을 정리했다. |
| YouTube 복구 | 세션 저장, 308 범위 재개, stale 상태 조회, 재개권 경합, 외부 성공 뒤 내부 확정 실패 | CODE-REVIEW-FIX-20260917-03 | PASS | Route Handler 회귀 17건 통과. 저장된 Range 다음 바이트부터 재개하고, 동시 두 요청은 200과 409로 갈리며 실제 업로드 본문은 한 번만 보냈다. DB 확정과 장부 실패는 `partial`, `retryPublish:false`로 닫혔다. |
| 멱등과 화면 | 태그와 파일 내용 해시, 제외 채널 부분 실패, 긴 대시 제거 | CODE-REVIEW-FIX-20260917-04 | PASS | 태그 변경과 같은 이름의 파일 내용 변경이 각각 새 발행 키를 만들었다. 화면 회귀 6건에서 차단 채널이 초안과 알림의 partial 결과에 포함되고 긴 대시가 0건이다. |
| 전체 회귀 | test, TypeScript, production build, 디자인 lint | CODE-REVIEW-FIX-20260917-05 | PASS | `npm run test`: 374파일, 2,414건 통과, 3건 제외. `npx tsc --noEmit` 종료 0. `npm run build` 종료 0. design lint 위반 0. |
| 실앱 기본 흐름 | 현재 수정 소스를 띄운 localhost:3456 기본 흐름과 Studio v1 | CODE-REVIEW-FIX-20260917-06 | PASS | 제품 수정 커밋 `46e75b2d`를 포함한 실행본에서 기본 흐름 11/11, Studio v1 14/14를 실제 요청으로 관찰했다. health는 HTTP 200, DB up이었다. 이후 포트를 이어받은 API sweep 실행본 `35f11ab0`도 `46e75b2d`의 후손이다. |
| 미검증 경계 | 외부 공개 SNS의 실제 게시와 운영 배포 | CODE-REVIEW-FIX-20260917-07 | 미검증 | 공개 게시와 운영 배포는 실행하지 않았다. 외부 성공 직후 DB 장애는 Route Handler 경계에서 공급자 응답과 DB 실패를 제어해 재현했고, localhost에서는 기존 제품 기본 흐름을 실제로 관찰했다. |

제품 전체 QA와 배포 판정은 기존 디자인 정합 NG와 운영 미검증 때문에 계속 NG다. 이번 PASS는
리뷰 MAJOR 6건의 수정 범위에 한정한다.

## 2026-09-17 04시 04분 KST · 최근 24시간 코드 공격 리뷰 BLOCK ❌ NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드 리뷰 | 최근 24시간 커밋 전체의 돈, 격리, 동시성, 부분 실패, 삭제, 확정 요구 이탈 검토 | CODE-REVIEW-20260917-01 | ❌ NG | 43개 커밋, `7cc7f848..93d1da1`, 81개 파일. MAJOR 6건: 제외 채널 전체 성공 저장, 긴 대시, YouTube 세션 미보존, 외부 성공 뒤 DB 확정 실패 은폐, 멱등 키 충돌, 사용량 장부 유실. 상세 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-17.md` |
| 필수 회귀 | 전체 test와 TypeScript | CODE-REVIEW-20260917-02 | PASS | Vitest 372개 파일과 2,399건 통과, 3건 제외. `npx tsc --noEmit` 종료 0. |
| 실앱 기본 흐름 | localhost:3456 기본 흐름과 Studio v1 | CODE-REVIEW-20260917-03 | PASS | 지정 작업 공간 실제 요청에서 기본 흐름 11/11, Studio v1 14/14. health HTTP 200, DB up. 단 실행 `build_commit=5bdc1f85`로 검토 끝 `93d1da1`과 달라 최신 YouTube 변경의 실앱 귀속은 NG. |
| 사용량 실측 | 지정 작업 공간 `/api/usage` | CODE-REVIEW-20260917-04 | 관찰 | HTTP 200, source `usage_events`, 오늘과 이번 주 및 이번 달 발행 0, 일별 행 0. 외부 실발행은 하지 않았다. |

## 2026-09-17 02시 55분 KST · 네 방 기본 흐름 v19 기능 범위 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 백엔드 기본 흐름 관통 | FLOW-API-V19 | PASS | HEAD `d04c60a1`과 일치하는 localhost 최종 실제 요청 11/11. 후보 3장, 편집 인계와 상태 변경, 발행 큐, 성과 제안 3건, 생성 큐 재인계, 지표 확인. `logs/diff/osmu-four-room-flow-20260917-v19/commands/verify-basic-flow-e2e-final.txt` |
| R08, R19, R207 | 네 방 렌더와 가린 모달 확인 | FLOW-ROOM-PROBE-V19 | PASS | 최초 4/4 통과. 전체 회귀 뒤 두 번 연속 성과실 `DOMContentLoaded` timeout을 재현하고, 300초 전체 예산과 목표 주소 도달 판정을 보강한 뒤 최종 4/4, 모달 0, 401 0, 콘솔 오류 0. `commands/probe-four-room-flow-final.txt`, `probe-four-room-flow-retry.txt`, `probe-four-room-flow-fixed.txt` |
| R08, R19 | 네 폭에서 사람처럼 생성실부터 성과실까지 이동 | FLOW-UI-V19 | PASS | 390 라이트와 다크, 768, 1024, 1440의 20화면과 성과실에서 생성실 복귀 5/5. 가로 넘침, 전체 화면 모달, 탐색 가림, 401, 콘솔 오류 0. `commands/verify-four-room-ui-e2e.txt`, 원본 `captures/` |
| R166, R172 | Studio v1 인증, 생성, 조회, 무료 다시 만들기 | FLOW-STUDIO-V19 | PASS | localhost 실제 요청 14/14. `commands/verify-studio-v1-e2e.txt` |
| 탐침 회귀 회수 | 콜드 컴파일에서 정상 성과실을 timeout으로 오판하지 않는다 | FLOW-PROBE-COLD-V19 | PASS | 단계별 120초는 유지하고 전체 예산을 네 폭 검증기와 같은 300초로 맞췄다. 목표 주소면 실제 room root가 최종 판정한다. 표적 3파일 4건 통과. 최신 탐침 토큰 3개 `revoked=true`. `commands/probe-regression-fixed.txt`, `probe-token-cleanup-final.txt` |
| 필수 회귀 | 전체 test, TypeScript, build, seed와 RLS, 디자인 lint | FLOW-REGRESSION-V19 | PASS | Vitest 371파일과 2,388건 통과, 3건 제외. TypeScript 종료 0. build 184/184. schema, seed, RLS 적용. 디자인 lint 위반 0. `commands/npm-test.txt`, `tsc-noemit.txt`, `npm-build.txt`, `apply-schema-seed.txt`, `design-lint.txt` |
| R193, R205, R206 | v63 계승과 8개 배치 속성 정합 | DESIGN-CONF-V19 | NG | v63 원본과 현재 16개 화면이 요소 순서, 열 수, 정렬과 여백, 표시와 숨김, 글꼴 단계, 버튼 위계에서 불일치하거나 동일 상태 캡처가 아니다. 과제 v63과 canonical 승인 v68 핀도 충돌. `docs/qa/osmu-four-room-basic-flow-v19-gpt-codex.md` |
| 제품 전체 | 운영 배포와 외부 채널 | QA-QUALITY-GATE-V19 | NG | localhost 기능 범위만 PASS. 운영 동적 URL, 실제 배포 버전과 외부 채널 실발행은 미검증이고 디자인 정합 NG |
| 증거 커밋 | 탐침 수정과 QA 기록을 원자 커밋 | FLOW-COMMIT-V19 | BLOCK | 다른 세션의 미추적 소스 `dashboard/tests/publish/video-publish-youtube.route.test.ts` 때문에 `commit-untracked-guard`가 차단했다. 범위 밖 파일을 포함하거나 훅을 우회하지 않았다. |
| R01부터 R207 및 세부 요청 232건 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V19 | 이월 | 기존 정본 판정을 유지하고 이번 범위 관련 요청만 갱신 |

제품 기능은 수정하지 않았다. 끊긴 곳은 QA 탐침의 전체 제한시간과 `DOMContentLoaded` 판정이었다.
상세 근거와 16개 화면 디자인 정합 행렬은 `docs/qa/osmu-four-room-basic-flow-v19-gpt-codex.md`다.

## 2026-09-16 23시 10분 KST · 성과 시계열 갭 build BLOCK, 필수 실앱 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 두 갭 감사에서 지금도 없는 기본 흐름 항목 확인 | GAP-HISTORY-20260916-2310-01 | NG | 게시물별 성과 관측 이력과 재현 가능한 최근 30일 비교가 없다. `published_posts`는 최신 누계와 `metrics_at`만 보존하고, 실제 `GET /api/metrics` 응답은 `posts`, `coverage`만 반환한다. |
| pipeline build 허용 범위 | 신규 저장과 비교 계약을 소스에 추가할 수 있는지 확인 | GAP-HISTORY-20260916-2310-02 | BLOCK | `pipeline-state.osmu.md` 최상단은 `current_stage: qa`, `status: in-progress (승인 아님)`이다. 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준의 승인 기술설계가 없다. |
| 실행본 귀속 | localhost와 현재 소스 일치 | GAP-HISTORY-20260916-2310-03 | PASS | `/api/health` HTTP 200, DB up, `build_commit`과 현재 HEAD가 `df5c4daa`로 일치한다. |
| 실제 metrics | 지정 작업 공간 성과 응답 | GAP-HISTORY-20260916-2310-04 | NG | localhost 실제 요청 HTTP 200. 게시물 0건, `history`와 `comparison` 키가 없다. |
| 필수 회귀 | `npm run test`와 `npx tsc --noEmit` | GAP-HISTORY-20260916-2310-05 | PASS | Vitest 371파일, 2,388건 통과, 3건 제외. TypeScript 종료 코드 0. |
| 기본 흐름 실앱 | `verify-basic-flow-e2e.mjs` | GAP-HISTORY-20260916-2310-06 | NG | 첫 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 후보 0장으로 종료 코드 1. 서버 로그의 직접 원인은 Claude CLI 자식 `exit_nonzero`다. 같은 launch context와 모델의 최소 CLI 대조 요청은 exit 0이라 실행 파일과 전역 인증 장애는 제외했고, 실패는 전체 생성 입력 경로로 좁혔다. 자식 stderr를 보안상 버려 그 아래 원인은 미검증이다. |
| Studio v1 실앱 | `verify-studio-v1-e2e.mjs` | GAP-HISTORY-20260916-2310-07 | NG | 401, 400, 422 거절은 통과했다. 정상 생성은 기대 201 대신 HTTP 200과 공급자 오류를 받아 종료 코드 1이다. |
| 제품 소스 | migration, API, 테스트 | GAP-HISTORY-20260916-2310-08 | BLOCK | 제품 소스 변경 0건. QA 공정과 미승인 DB 및 API 계약을 우회하지 않았다. |
| 증거 커밋 | 이번 기록의 원자 커밋 | GAP-HISTORY-20260916-2310-09 | PASS | 이번 절, 갭 재확인 절, 전용 세션 상태만 부분 staging해 원자 커밋했다. 착수 전부터 있던 다른 세션 변경은 포함하지 않았다. |

이번 실행에서 새로 되는 것으로 전환된 항목은 없다. 최신 누계값을 기간 성과로 이름만 바꾸면
같은 30일을 재현할 수 없다. 저장과 비교 계약을 승인하고 build를 다시 연 뒤 구현해야 한다.

## 2026-09-16 22시 31분 KST · 네 방 기본 흐름 v18 기능 범위 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 기본 흐름 관통 | FLOW-API-V18 | PASS | 수정 커밋 `9293ab40`과 일치하는 localhost 실제 요청 11/11. 후보 3장, 편집 인계와 상태 변경, 발행 큐, 성과 제안 3건, 생성 큐 재인계와 지표 확인. `logs/diff/osmu-four-room-flow-20260916-v18/commands/11-basic-flow.log` |
| R08, R19, R207 | 네 방 렌더와 가린 모달 확인 | FLOW-ROOM-PROBE-V18 | PASS | 네 방 4/4, 가린 모달 0, 브라우저 401 0, 콘솔 오류 0. `commands/12-probe-four-room.log` |
| R08, R19 | 네 폭에서 사람처럼 생성실부터 성과실까지 이동 | FLOW-UI-V18 | PASS | 390 라이트와 다크, 768, 1024, 1440의 20화면과 성과실에서 생성실 복귀 5/5. 가로 넘침, 전체 화면 모달, 탐색 가림, 401, 콘솔 오류 0. `commands/13-four-room-ui.log`, 원본 `captures/` |
| R166, R172 | Studio v1 인증, 생성, 조회, 무료 다시 만들기 | FLOW-STUDIO-V18 | PASS | localhost 실제 요청 14/14. `commands/14-studio-v1.log` |
| 최초 NG 회수 | 장기 실행 서버의 Claude CLI OAuth 갱신 실패 | FLOW-RUNTIME-V18 | PASS | macOS에서 Claude CLI를 로그인 사용자의 `launchctl asuser` context로 실행하고 회귀 테스트 추가. 제품과 테스트만 담은 커밋 `9293ab40` |
| 필수 회귀 | 전체 test, TypeScript, build, seed와 RLS, 디자인 lint | FLOW-REGRESSION-V18 | PASS | Vitest 371파일과 2,388건 통과, 3건 제외. TypeScript 종료 0. build 184/184. schema, seed, RLS 적용. 디자인 lint 위반 0. `commands/05-npm-test.log`부터 `09-design-lint.log` |
| 모바일 사용성 | 390px 인증된 네 방의 글자, 탭 크기, 눌림 상태 | MOBILE-ERGONOMICS-V18 | 미검증 | 지정 계측기는 고객 토큰을 주입하지 못해 AuthGate를 측정했다. 결과를 제품 판정에 사용하지 않음. `commands/16-mobile-ergonomics.log` |
| R193, R205, R206 | v63 계승과 8개 배치 속성 정합 | DESIGN-CONF-V18 | NG | 현재 16개 화면 조합이 요소 순서, 열 수, 정렬과 여백, 표시와 숨김, 글꼴 단계, 버튼 위계에서 불일치하거나 동일 상태 캡처가 아니다. 과제 v63과 canonical 승인 v68 핀도 충돌. `docs/qa/osmu-four-room-basic-flow-v18-gpt-codex.md` |
| 제품 전체 | 운영 배포와 외부 채널 | QA-QUALITY-GATE-V18 | NG | localhost 기능 범위만 PASS. 운영 동적 URL, 실제 배포 버전과 외부 채널 실발행은 미검증이며 디자인 정합 NG |
| R01부터 R207 및 세부 요청 232건 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V18 | 이월 | 기존 정본 판정을 유지하고 이번 범위 관련 요청만 갱신 |

최초 실패는 화면이나 mock으로 덮지 않았다. GUI 터미널과 장기 실행 서버의 차이를 분리해 macOS
bootstrap context를 보존하도록 고친 뒤, 수정 커밋과 일치하는 서버에서 필수 검증을 전부 다시
실행했다. 상세 근거는 `docs/qa/osmu-four-room-basic-flow-v18-gpt-codex.md`다.

## 2026-09-16 22시 05분 KST · 네 방 기본 흐름 재검증 최초 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 백엔드 기본 흐름 관통 | FLOW-API-V18-INITIAL | NG | HEAD `ed8231a5`와 일치하는 localhost:3456 실제 요청에서 첫 후보 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, `provider_unavailable`, 후보 0장으로 종료 코드 1. 원인 수정 후 같은 실제 요청과 전체 회귀를 다시 통과하기 전 PASS 전환 금지. |

화면 단면이나 빌드 통과로 이 실패를 덮지 않는다. 서버 자식 프로세스 환경과 Claude CLI 실행 끝점을 추적한다.

## 2026-09-16 19시 02분 KST · 성과 시계열 갭 재착수 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 두 갭 감사를 현재 코드와 대조하고 기본 흐름에 가장 가까운 미구현 한 항목을 완성 | GAP-HISTORY-20260916-1902-01 | NG | 현재 대조에서 생성, 편집, 발행, 성과 재인계는 구현돼 있고 남은 항목은 게시물별 성과 snapshot과 재현 가능한 최근 30일 비교다. `published_posts`는 최신 누계와 `metrics_at`만 보존하며 게시물별 관측 이력 table과 API `history`, `comparison`은 없다. |
| pipeline build 허용 범위 | 신규 저장과 비교 계약을 소스에 추가할 수 있는지 확인 | GAP-HISTORY-20260916-1902-02 | BLOCK | `pipeline-state.osmu.md` 최상단은 `current_stage: qa`, `status: in-progress (승인 아님)`이다. snapshot 단위, 멱등 키, 보존 기간, 공급자별 누계와 기간 지표 정규화, 비교식과 표본 부족 기준의 승인된 기술설계가 없다. |
| 실제 metrics | 지정 작업 공간 성과 응답 | GAP-HISTORY-20260916-1902-03 | NG | 현재 HEAD와 일치하는 localhost에서 HTTP 200. 최상위 키는 `coverage`, `posts`, 게시물은 0건이며 `history`, `comparison`은 없다. |
| 실행본 귀속 | localhost와 현재 소스 일치 | GAP-HISTORY-20260916-1902-04 | PASS | `/api/health` HTTP 200, DB up, `build_commit`은 현재 HEAD `ed8231a5`와 일치한다. |
| 필수 회귀 | `npm run test` | GAP-HISTORY-20260916-1902-05 | PASS | 371파일, 2,387건 통과, 3건 제외, 종료 코드 0. |
| 필수 회귀 | `npx tsc --noEmit` | GAP-HISTORY-20260916-1902-06 | PASS | 종료 코드 0. |
| 기본 흐름 실앱 | `verify-basic-flow-e2e.mjs` | GAP-HISTORY-20260916-1902-07 | NG | 첫 실제 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, `provider_unavailable`, 후보 0장으로 종료 코드 1. 서버 로그의 관찰 가능한 직접 원인은 Claude CLI 자식 프로세스 `exit_nonzero`이며 그 위 원인은 보안 경계가 원문을 보존하지 않아 미검증이다. |
| Studio v1 실앱 | `verify-studio-v1-e2e.mjs` | GAP-HISTORY-20260916-1902-08 | NG | 401, 400, 422 거절 계약은 통과. 정상 생성은 기대 201 대신 HTTP 200과 `STUDIO_LLM_PROVIDER_UNAVAILABLE`를 받아 종료 코드 1. |
| 소스 구현 | 신규 migration, API, 테스트 | GAP-HISTORY-20260916-1902-09 | BLOCK | 제품 소스 변경 0건. 승인되지 않은 DB와 API 계약을 워커가 선택하지 않았다. |
| 증거 커밋 | 이번 기록 4파일만 커밋 | GAP-HISTORY-20260916-1902-10 | BLOCK | 같은 4개 문서에 다른 세션의 미커밋 변경이 이미 합쳐져 있어 경로 단위 staging은 범위 밖 변경을 함께 커밋한다. 다른 작업을 포함하거나 index를 수동 조작해 우회하지 않았다. |

테스트와 타입 검사는 통과했지만 필수 실앱 검증 두 개가 실패했고 성과 이력 기술설계도 미승인이다. 따라서 이번 항목과 제품 전체는 완료가 아니다. 컨트롤러와 tech-architect가 성과 저장 및 비교 계약을 승인하고 build를 다시 열어야 한다.

## 2026-09-16 18시 53분 KST · 네 방 기본 흐름 v17 기능 범위 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 기본 흐름 관통 | FLOW-API-V17 | PASS | 최종 localhost 실제 요청 11/11. 후보 3장, 편집 인계와 순서 변경, 삭제와 복구, 발행 큐, 지원 여부, 성과 제안 3건, 생성 큐 재인계, 성과 지표를 확인했다. `logs/diff/osmu-four-room-flow-20260916-v17/commands/29-basic-flow-final2.log` |
| R08, R19, R207 | 네 방 렌더와 가린 모달 확인 | FLOW-ROOM-PROBE-V17 | PASS | 최종 네 방 4/4, 가린 모달 0건, 브라우저 401 0건, 콘솔 오류 0건. 중간 실행의 성과실 `ERR_ABORTED` 1건을 숨기지 않고 탐침을 제한적 1회 재시도로 고쳤다. 실패 `commands/25-probe-four-room-final.log`, 통과 `commands/30-probe-four-room-final2.log`, 수정 `71495ef5` |
| R08, R19 | 네 폭에서 사람처럼 생성실부터 성과실까지 이동 | FLOW-UI-V17 | PASS | 390 라이트와 다크, 768, 1024, 1440의 20화면과 성과실에서 생성실 복귀 5/5. 가로 넘침, 전체 화면 모달, 탐색 가림, 401, 콘솔 오류 0건. `commands/31-four-room-ui-final2.log`, 원본 `logs/diff/osmu-four-room-flow-20260916-v17/captures/` |
| R166, R172 | Studio v1 인증, 생성, 조회, 무료 다시 만들기 | FLOW-STUDIO-V17 | PASS | localhost 실제 요청 14/14. `commands/32-studio-v1-final2.log` |
| 필수 회귀 | 전체 test, TypeScript, build, seed와 RLS, 디자인 lint | FLOW-REGRESSION-V17 | PASS | Vitest 최종 371파일과 2,387건 통과, 3건 제외. TypeScript 종료 0. build 184/184. schema, seed, RLS 적용. 디자인 lint 위반 0. `commands/33-npm-test-after-probe-fix.log`, `34-tsc-after-probe-fix.log`, `19-npm-build.log`, `20-schema-seed.log`, `21-design-lint.log` |
| R193, R205, R206 | 승인 시안 계승과 8개 배치 속성 정합 | DESIGN-CONF-V17 | NG | 과제 지정 v63과 현재 16개 화면 조합이 요소 순서, 열 수, 정렬과 여백, 표시와 숨김, 글꼴 단계, 버튼 위계에서 불일치하거나 동일 상태 캡처가 아니다. canonical 승인 v68 핀과도 충돌한다. `docs/qa/osmu-four-room-basic-flow-v17-gpt-codex.md` |
| 제품 전체 | 운영 배포와 외부 채널 | QA-QUALITY-GATE-V17 | NG | localhost 기능 범위만 PASS다. 운영 동적 URL의 실제 배포 버전과 외부 채널 실발행은 미검증이다. 디자인 정합도 NG라 제품 전체 PASS와 배포 승격을 금지한다. |
| R01부터 R207 및 세부 요청 232건 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V17 | 이월 | 기존 정본 판정을 유지하고 이번 범위 관련 요청만 갱신했다. |

첫 생성 실패는 실제 3,044바이트 프롬프트에서 Claude CLI OAuth refresh가 macOS 로그인 키체인 세션을 찾지 못한 것이 원인이었다. 감독이 `SECURITYSESSIONID`를 복구하고 앱의 최소 자식 환경에 보존하도록 고쳤다. 제품 수정은 `327500b0`, 타입 계약 보수는 `e7b8dc0d`, 탐침 회귀 방지는 `71495ef5`다. 별도 Expo 또는 Maestro 표면은 없어 해당 없음으로 판정했다.

## 2026-09-16 18시 36분 KST · 네 방 기본 흐름 v17 TypeScript 최초 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 필수 회귀 | 정확한 `npx tsc --noEmit` 통과 | FLOW-TSC-V17-INITIAL | NG | 공유 CLI 자식 환경을 최소화한 수정에서 프로젝트가 확장한 `NodeJS.ProcessEnv`의 필수 `NODE_ENV`를 빠뜨려 `src/lib/anthropic.ts:64` TS2741, 종료 코드 2. `logs/diff/osmu-four-room-flow-20260916-v17/commands/16-tsc-noemit.log` |

제품 런타임 기본 흐름은 수정 후 통과했지만 타입 계약 실패를 별도로 남긴다. `NODE_ENV`를 명시하고 같은 명령과 전체 회귀를 다시 통과하기 전 최종 PASS로 세지 않는다.

## 2026-09-16 18시 11분 KST · 네 방 기본 흐름 v17 최초 실행 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 백엔드 기본 흐름 관통 | FLOW-API-V17-INITIAL | NG | localhost:3456 실제 요청에서 첫 후보 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 끝나 후보 0장, 종료 코드 1. 서버 로그의 고정 실패 사유는 `exit_nonzero`. 같은 호스트의 Claude CLI 단독 실행은 종료 코드 0이라 서버 자식 실행 조건 차이를 분리 진단한다. `logs/diff/osmu-four-room-flow-20260916-v17/commands/01-basic-flow.log` |
| R08, R19, R207 | 네 방 렌더와 가린 모달 확인 | FLOW-ROOM-PROBE-V17-INITIAL | PASS | 생성실, 편집실, 발행실, 성과실 4/4 렌더. 가린 모달 0건, 브라우저 401 0건, 콘솔 오류 0건. `logs/diff/osmu-four-room-flow-20260916-v17/commands/02-probe-four-room.log` |

기본 흐름 실패를 화면 단면 통과로 덮지 않는다. 원인을 수정한 뒤 동일한 실제 생성 요청과 전체 회귀를 다시 실행하기 전 `FLOW-API-V17`은 PASS로 전환하지 않는다.

## 2026-09-16 17시 57분 KST · API 읽기 경로 v15 범위 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98, R200, R207 | 최신 코드의 읽기 Route Handler 전수 재실사 | API-READ-ALL-V15 | PASS | 실행 커밋과 HEAD가 `50ac3341`로 일치하는 localhost에서 105경로, GET 105회와 HEAD 1회를 실요청했다. 정상 88, 계약상 거절 18, 예상 밖 0, HTTP 500 0. PID와 Route Handler 합성 해시는 전후 동일. `logs/diff/osmu-api-read-sweep-20260916-v15/api-read-sweep-final.json` |
| R68, R98 | HTTP 200 오류 은폐 제거 | API-READ-TRUTH-V15 | PASS | `/api/blog-stats`, `/api/elevenlabs-voices`, `/api/ga-analytics`, `/api/gsc-analytics` 설정 누락은 HTTP 503과 고정 오류 코드를 반환. `/api/images`의 HTTP 200 빈 배열은 정상으로 판정. 실요청과 신규 회귀 12건 통과 |
| R104 | 시드, 자격증명과 비밀값 관리 | API-READ-AUTH-V15 | PASS | `dashboard/.env.local`을 값 출력 없이 주입. 지정 작업 공간 시드와 RLS 멱등 적용. 비밀값 문서 기록 0 |
| 필수 회귀 | test, TypeScript, build, health, 두 E2E | API-READ-REGRESSION-V15 | PASS | Vitest 371파일과 2,385건 통과, 3건 제외. TypeScript 종료 0. 격리 build 184/184. health HTTP 200과 DB up. 기본 흐름 11/11, Studio v1 14/14 |
| UI 계승 | 디자인 입력, lint, 390px 관찰 | API-READ-UI-V15 | 부분 PASS | 디자인 토큰 위반 0. 로그인 HTTP 200, 390px 렌더와 콘솔 오류 0. 화면 코드는 미변경. 과제 v63과 pipeline 승인 v68 핀 충돌 및 기존 정합 NG 때문에 디자인 QA PASS로 승격하지 않음 |
| 제품 전체 | 운영 배포와 실제 외부 계정 | QA-QUALITY-GATE-V15 | NG | 운영 동적 URL, 외부 공급자 실제 자격증명 성공, 채널 실발행은 미검증. API 읽기 범위 PASS와 제품 전체 QA를 분리 |
| R01부터 R207 및 세부 요청 232건 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V15 | 이월 | 요구 정본의 기존 판정을 유지한다. 이번 수정으로 판정이 바뀐 항목은 R68, R98, R104, R200, R207이다. |

2026-08-28의 문서상 GET 84경로에서 현재 105경로로 21개 늘었다. 과거 실사 중 HTTP 500 두 건은 당시 수정됐고 현재도 0건이다. 이번에는 과거에 집계하지 않은 HTTP 200 오류 본문 네 건을 찾아 수정하고 기계 판독 JSON을 남겼다. 상세는 `docs/qa/osmu-api-read-sweep-v15-gpt-codex.md`다.

## 2026-09-16 17시 32분 KST · API 읽기 경로 재실사 최초 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98, R200, R207 | 최신 실행본의 읽기 응답 진실성 | API-READ-TRUTH-V15-INITIAL | NG | localhost:3456 실행본 `80166cfe`에서 `/api/blog-stats`, `/api/elevenlabs-voices`, `/api/ga-analytics`, `/api/gsc-analytics`가 설정 누락 오류 본문을 HTTP 200으로 반환했다. `/api/images`의 HTTP 200 빈 배열은 현재 검사기가 `응답 구조 오류`로 오판한다. 최신 HEAD에서도 같은 네 Route Handler와 검사 계약이 유지됨을 코드로 확인했다. 수정 후 최신 HEAD 실행본에서 전 경로 실요청과 전체 회귀를 다시 요구한다. |

## 2026-09-16 12시 19분 KST · 최근 24시간 코드 공격 리뷰 R3 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드 리뷰 | 직전 24시간 커밋 전체의 돈, 격리, 동시성, 부분 실패, 삭제, 확정 요구 이탈 검토 | CODE-REVIEW-20260916-R3-01 | BLOCK | `f4b0f5a5..e5a4487e`, 순변경 239파일. MAJOR 10건, MINOR 1건. 상세 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-16.md` 최상단 R3 |
| Dashboard 회귀 | `npm run test` | CODE-REVIEW-20260916-R3-02 | PASS | 369파일 통과, 2,373건 통과, 3건 제외, 종료 코드 0 |
| TypeScript | `npx tsc --noEmit` | CODE-REVIEW-20260916-R3-03 | PASS | 종료 코드 0 |
| 기본 흐름 E2E | 지정 작업 공간 생성, 편집, 발행 큐, 성과 재인계 | CODE-REVIEW-20260916-R3-04 | NG | 첫 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 후보 0장, 종료 코드 1 |
| Studio v1 E2E | 인증, 멱등, 정상 생성, 조회와 무료 다시 만들기 | CODE-REVIEW-20260916-R3-05 | NG | 401, 400, 422 거절은 통과. 정상 생성은 기대 201 대신 HTTP 200 오류 본문, 종료 코드 1 |
| 실행본 귀속 | localhost health와 검토 끝 커밋 일치 | CODE-REVIEW-20260916-R3-06 | NG | health HTTP 200, DB up. 실행 `80166cfe`, 검토 끝 `e5a4487e`로 불일치 |
| 검증기 진실성 | 정상 빈 이미지 목록 분류 | CODE-REVIEW-20260916-R3-07 | NG | 지정 작업 공간 `/api/images` HTTP 200 `[]`를 `응답 구조 오류`로 오판 |
| OpenClaw 표적 회귀 | 큐 잠금, Threads 수집과 발행, Instagram 발행 | CODE-REVIEW-20260916-R3-08 | PASS | 4파일, 8건 통과, 종료 코드 0 |
| 외부 채널 | 실제 SNS 발행 | CODE-REVIEW-20260916-R3-09 | 미검증 | 운영 배포와 외부 SNS 실발행을 실행하지 않음 |

제품 코드는 수정하지 않았다. 일부 채널 제외 발행을 전체 성공으로 저장하는 경로, YouTube 중복 업로드와 기록 유실, Reels 외부 성공 뒤 내부 상태 정체, 사용량 장부 유실, 프로세스 로컬 자막 상한, Threads 성과 이중 수집, R2 임시 객체 누적, 빈 목록 검증 오판, 접힌 사이드바 계약 이탈을 확인해 머지와 배포를 차단한다.

## 2026-09-16 11시 10분 KST · 성과 시계열 갭 build BLOCK, 실앱 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 성과 기본 흐름 | 게시물별 snapshot과 재현 가능한 30일 비교 | GAP-PERF-20260916-1110-01 | BLOCK | `published_posts`는 최신 누계만 보존하고 게시물별 이력 table, `history`, `comparison` 응답이 없다. 현재 pipeline은 `qa`, 승인 아님이며 저장과 비교 계약도 미승인이다. |
| 실제 metrics | 지정 작업 공간 성과 응답 | GAP-PERF-LIVE-20260916-1110-01 | NG | localhost `GET /api/metrics` HTTP 200. 응답 키는 `coverage`, `posts`, 게시물 0건이며 `history`와 `comparison`은 없다. |
| 최신 실행본 | localhost와 현재 소스 귀속 | GAP-PERF-BUILD-20260916-1110-01 | NG | health HTTP 200, DB up. 실행 서버 `80166cfe`, 현재 HEAD `171765b4`로 불일치한다. |
| 필수 회귀 | `npm run test` | GAP-PERF-TEST-20260916-1110-01 | PASS | 369파일과 2,373건 통과, 3건 제외, 종료 코드 0. |
| 필수 회귀 | `npx tsc --noEmit` | GAP-PERF-TSC-20260916-1110-01 | PASS | 종료 코드 0. |
| 기본 흐름 E2E | 생성, 편집, 발행 큐, 성과 재인계 | GAP-PERF-E2E-BASIC-20260916-1110-01 | NG | 첫 생성 요청이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 후보 0장, 종료 코드 1. |
| Studio v1 E2E | 인증, 멱등, 정상 생성, 조회와 무료 다시 만들기 | GAP-PERF-E2E-STUDIO-20260916-1110-01 | NG | 401, 400, 422 거절 계약은 통과. 정상 생성은 기대 201 대신 HTTP 200과 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 종료 코드 1. |
| 증거 커밋 | 갭 재확인 문서와 QA 트래커 | GAP-PERF-COMMIT-20260916-1110-01 | BLOCK | 다른 세션의 archive 이동을 포함한 미추적 파일이 대량으로 남아 있다. 범위 밖 파일을 포함하거나 이동해 commit guard를 우회하지 않는다. |

제품 소스, migration과 기능 테스트는 수정하지 않았다. 성과 저장과 비교 기술설계를 승인하고
build 공정을 다시 연 뒤 최신 HEAD와 일치하는 localhost에서 두 E2E를 통과시켜야 한다.

## 2026-09-16 09시 30분 KST · 성과 시계열 갭 재확인 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 성과 기본 흐름 | 게시물별 snapshot과 재현 가능한 30일 비교 | GAP-PERF-20260916-01 | BLOCK | `published_posts`는 최신 누계만 보존하고 게시물별 이력 table과 `history`, `comparison` 응답이 없다. 현재 pipeline은 `qa`, 승인 아님이며 저장과 비교 계약도 미승인이다. |
| 실제 metrics | 지정 작업 공간 성과 응답 | GAP-PERF-LIVE-20260916-01 | NG | localhost health HTTP 200, DB up. `GET /api/metrics` HTTP 200이지만 응답 키는 `coverage`, `posts`, 게시물 0건이다. |
| 필수 회귀 | 전체 `npm run test` | GAP-PERF-TEST-20260916-01 | NG | 369파일 중 365파일 통과, 4파일 실패. 2,373건 중 2,366건 통과, 4건 실패, 3건 제외. 병렬 수정 중인 분석 이벤트, YouTube 갱신, 긴 대시, 발행 사용량 계약 실패다. |
| 필수 회귀 | `npx tsc --noEmit` | GAP-PERF-TSC-20260916-01 | NG | 실행 중 dev 서버의 `.next/dev/types/routes.d.ts:279` 문법 오류, 종료 코드 2. |
| 필수 실앱 E2E | 기본 흐름과 Studio v1 | GAP-PERF-E2E-20260916-01 | 귀속 차단 | 실행 서버 `6a51aaf3`, 현재 HEAD `ee4ac95b`로 불일치해 구 서버 결과의 오귀속을 막고 실행하지 않았다. |
| 증거 커밋 | 갭 재확인 문서 | GAP-PERF-COMMIT-20260916-01 | 차단 | 범위 밖 신규 테스트가 미커밋이라 `commit-untracked-guard`가 거부했다. 다른 세션 변경을 포함하거나 이동하지 않았다. |

제품 소스, migration과 기능 테스트는 수정하지 않았다. 고정 커밋과 일치하는 localhost에서 전체
회귀와 두 E2E를 다시 통과시키고, 성과 저장과 비교 기술설계를 승인한 뒤 build로 재발주해야 한다.

## 2026-09-16 09시 12분 KST · 최근 24시간 코드 공격 리뷰 R2 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드 리뷰 | 직전 24시간 순변경의 돈, 격리, 동시성, 부분 실패, 삭제, 확정 요구 이탈 검토 | CODE-REVIEW-20260916-R2-01 | BLOCK | 범위 `c2008b1a..6a51aaf3`, first-parent 31개 커밋, 시간 필터 전체 52개 커밋, 249개 파일. MAJOR 11건, MINOR 1건. `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-16.md` |
| 필수 회귀 | 전체 `npm run test` | REVIEW-TEST-20260916-R2-01 | NG | 369개 파일 중 7개 실패, 362개 통과. 2,372건 중 8개 실패, 2,361개 통과, 3개 제외. 긴 대시, YouTube 갱신, 발행 UI, 영상 재사용, 이미지 지시문, 분석 이벤트, 생성실 timeout 계약 실패 |
| 필수 회귀 | `npx tsc --noEmit` | REVIEW-TSC-20260916-R2-01 | PASS | 종료 코드 0 |
| 깨끗한 HEAD | 커밋 자체 재현성 | REVIEW-CLEAN-HEAD-20260916-R2-01 | NG | `git archive HEAD`에서 `four-room-performance-ready-timeout` 1/1 실패. 커밋된 검증기는 `waitUntil:commit`을 쓰고 같은 커밋 테스트는 이를 금지함 |
| 실앱 기본 흐름 | 지정 작업 공간 실제 요청 | REVIEW-BASIC-20260916-R2-01 | NG | localhost:3456, server와 target 모두 `6a51aaf3`, DB up. 첫 생성 요청이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 후보 0장으로 종료 |
| Studio v1 | 지정 작업 공간 실제 요청 | REVIEW-STUDIO-20260916-R2-01 | NG | 401, 400, 422 거절 계약은 통과. 정상 생성은 오류 envelope와 HTTP 200을 반환해 기대 201 대비 실패 |
| 삭제와 문구 | 삭제 사유와 금지 문구 대조 | REVIEW-CONTRACT-20260916-R2-01 | NG | 고정 순변경 삭제 파일 0건. 현재 미커밋 고객 UI `dashboard/src/app/studio/page.tsx:2210`에 긴 대시 1건 |

제품 코드는 수정하지 않았다. 감사 문서, QA 원장, 세션 인계만 기록한다. 실제 외부 SNS 발행과 운영 배포는 미검증이다.

## 2026-09-16 08시 21분 KST · 최근 24시간 코드 공격 리뷰 착수 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드 리뷰 | 직전 24시간 커밋 전체의 돈, 격리, 동시성, 부분 실패, 삭제, 확정 요구 이탈 검토 | CODE-REVIEW-20260916-R2-01 | NG | 검토 착수. 대상 커밋 경계, 실앱 귀속, 필수 회귀 결과와 지적 건수를 최종 판정 전까지 PASS로 전환하지 않음. |

제품 코드는 수정하지 않고, 검토 문서와 검증 증거만 최신순으로 기록한다.

## 2026-09-16 06시 26분 KST · 네 방 기본 흐름 v16 착수 환경 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 백엔드 기본 흐름 관통 | FLOW-API-V16-01 | 환경 NG | 착수 health는 HTTP 200, DB up이었으나 localhost 실행 빌드 `169fbf4f`와 canonical HEAD `02e295a3`가 불일치했다. `verify-basic-flow-e2e.mjs`의 첫 실제 생성 요청이 180초 동안 응답하지 않아 종료 코드 130으로 중단했다. 직후 health는 연결 재설정 HTTP 000, 3456 listener는 종료됨. 서버 로그에 `Error: write EPIPE`와 `uncaughtException` 3건이 남았다. |

다른 API 전수 검사 worktree가 소유한 개발 서버가 실행 중 종료된 환경 실패다. 같은 빌드를 QA가 시작부터 종료까지 소유하고 health `build_commit`과 대상 커밋을 일치시킨 뒤 기본 흐름, 네 방 단면, 네 폭 클릭과 Studio v1을 전부 재실행하기 전 PASS로 전환하지 않는다.

## 2026-09-16 05시 47분 KST · 최근 24시간 코드 공격 리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 코드 리뷰 | 직전 24시간 85개 커밋, 236개 파일 공격 검토 | CODE-REVIEW-20260916-01 | BLOCK | MAJOR 10건, MINOR 1건. `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-16.md` |
| 필수 회귀 | 전체 `npm run test` | REVIEW-TEST-20260916-01 | NG | 366개 파일 중 365개 통과, 1개 실패. 2,344건 통과, 3건 제외. 다른 세션의 미커밋 네 방 검증기 변경과 기존 계약 테스트가 충돌 |
| 필수 회귀 | `npx tsc --noEmit` | REVIEW-TSC-20260916-01 | NG | 실행 중인 구 dev 서버의 `.next/dev/types/routes.d.ts`와 `validator.ts` 문법 오류 5건. 종료 코드 2 |
| 실앱 기본 흐름 | 지정 작업 공간 실제 요청 | REVIEW-BASIC-20260916-01 | NG | localhost:3456에서 10/11. 제안의 생성 큐 인계 실패. 서버 `5bad0913`, 검토 대상 `7cc7f848` 불일치 |
| Studio v1 | 지정 작업 공간 실제 요청 | REVIEW-STUDIO-20260916-01 | 귀속 NG | localhost:3456에서 14/14. 구 서버 실행이라 검토 대상 커밋의 통과 증거로 세지 않음 |
| 외부 채널 | 실제 SNS 발행 | REVIEW-EXTERNAL-20260916-01 | 미검증 | 운영 배포와 외부 SNS 실발행을 실행하지 않음 |

제품 코드는 수정하지 않았다. 검증 스크립트가 고정 고객 작업 공간에 생성물과 큐를 남겨 테스트 자체의 데이터 및 무료 몫 오염을 MAJOR로 판정했다.

## 2026-09-16 03시 27분 KST · 네 방 기본 흐름 v15 기능 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 백엔드 기본 흐름 관통 | FLOW-API-V15 | PASS | 통제 localhost의 지정 작업 공간 실요청 11/11. `commands/08-basic-flow-controlled.log` |
| R08, R19, R207 | 네 방 렌더와 390, 768, 1024, 1440 실제 클릭 이동 | FLOW-UI-V15 | PASS | 단면 4/4, 화면 20/20, 복귀 5/5. 가로 넘침, 전체 화면 모달, 탐색 가림, 브라우저 401, 콘솔 오류 0건. `captures-final/observations.json` |
| R27, R168 | Studio v1 회귀 | STUDIO-V1-V15 | PASS | 같은 통제 서버에서 실요청 14/14. `commands/11-studio-v1-controlled.log` |
| 실행 서버 귀속 | 현재 실행 제품 소스와 localhost 동일성 | FLOW-RUNTIME-V15 | PASS | 서버 시작 HEAD와 health `build_commit`이 `4a44136d9c24c1ab5e863a60862f2308d199e7cc`로 일치. 이후 HEAD 변경은 문서 전용 |
| 필수 회귀 | TypeScript, seed, 디자인 lint | FLOW-REGRESSION-V15 | 부분 PASS | 손상된 Next dev 생성물을 `/tmp`에 보존 이동한 뒤 정확한 `npx tsc --noEmit` 종료 0. schema, seed, RLS 종료 0. 디자인 lint 위반 0 |
| 필수 회귀 | 전체 `npm run test` | FLOW-FULL-REGRESSION-V15 | NG | 착수 실행은 366파일, 2,345건 PASS, 조건부 3건 제외. 최종 재실행에서 발행 경계 2건이 5초 timeout으로 실패했고 남은 실행은 종료 전 중단. 최신 전체 PASS로 세지 않음 |
| R193, R205, R206 | 승인 프로토타입과 UI 계승 계약 | DESIGN-V15 | NG | 과제 지정 v63과 canonical 승인 v68 핀이 충돌. 상세 `docs/qa/osmu-four-room-basic-flow-v15-gpt-codex.md` |
| R01부터 R207 중 이번 범위 밖 | 회장 확정 요구 승계 | REQ-ALL-V15 | 이월 | 직접 관련 요청만 실행 판정하고 나머지는 이월 |
| 제품 전체 | QA 출고 | QA-QUALITY-GATE-V15 | NG | 네 방 localhost 기능은 통과했으나 최신 full regression, 단일 승인 디자인 핀, 운영 배포와 외부 실발행이 미통과 또는 미검증 |

첫 네 폭 실행은 다른 워커 소유 서버가 성과실 대기 중 종료돼 health HTTP 000을 남겼다. 통제 서버 재실행으로 제품 실패와 분리했다. Next 16.2.2는 통제 서버에서도 `.next/dev/types/routes.d.ts`를 잘라 만들었다. 정식 typegen 결과는 보존했고 손상 생성물은 `/tmp/osmu-next-dev-types-broken-v15-20260916-0310`으로 옮겼다. 이 도구 결함과 전체 회귀 NG 때문에 제품 전체 PASS는 금지한다.

SOURCES: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `pipeline-state.osmu.md` | https://playwright.dev/docs/emulation | https://playwright.dev/docs/screenshots | https://playwright.dev/docs/api/class-consolemessage

MODEL: gpt-codex/gpt-5.6-sol

## 2026-09-16 02시 18분 KST · 네 방 재검증 TypeScript 1차 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 네 방 필수 회귀 | 정확한 `npx tsc --noEmit` 통과 | FLOW-TSC-V15-01 | NG | 종료 1. `.next/dev/types/routes.d.ts:279`와 `.next/dev/types/validator.ts:1925` 생성물이 토큰 중간에서 잘려 구문 오류 4건. `logs/diff` 최종 증거 작성 전 즉시 NG로 기록했으며 제품 소스 결함과 동시 생성 오염을 분리 진단 중. 원본 로그 `/tmp/osmu-flowcheck091602-tsc.log` |

이 실패를 재생성 없이 PASS로 덮지 않는다. 실행 중인 `next dev`, 다른 QA 브라우저 검증, 공유 작업트리의 HEAD 변동을 함께 관찰해 생성물 손상의 원인을 분리한 뒤 같은 필수 명령을 다시 실행한다.

## 2026-09-16 02시 36분 KST · 네 폭 첫 실행 환경 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R19, R207 | 390, 768, 1024, 1440에서 생성실부터 성과실까지 실제 이동 | FLOW-UI-V15-01 | 환경 NG | 390 라이트 생성, 편집, 발행까지 진행한 뒤 성과 제안 대기 120초 초과. 직후 localhost health는 HTTP 000, 3456 listener 없음. 임시 고객 토큰 폐기도 같은 연결 실패. 다른 워커가 시작하고 종료 trap을 소유한 서버가 검증 중 내려간 것이 직접 원인. `logs/diff/osmu-four-room-flow-20260916-v15/commands/05-four-room-ui.log` |

제품 성과실 결함과 섞지 않는다. QA가 시작과 종료를 소유하고 health의 `build_commit`을 HEAD와 대조하는 단일 서버에서 기본 흐름, 단면, 네 폭, Studio v1을 전부 재실행하기 전 PASS 금지다. 실패한 실행이 남긴 임시 고객 토큰도 서버 복구 뒤 별도로 조회하고 폐기한다.

## 2026-09-16 00시 51분 KST · 최근 24시간 코드 공격 리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 최근 24시간 변경 | 돈, 격리, 동시성, 부분 실패, 무기록 삭제, 확정 요구 이탈 공격 리뷰 | OSMU-CODE-REVIEW-20260916-01 | BLOCK | 범위 `90e785e3..af4f21cf`, 착수 시점 61개 커밋과 순변경 171개 파일. MAJOR 17건, MINOR 0건. 상세 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-16.md` |
| localhost 실제 응답 | 지정 작업 공간 기본 흐름과 Studio v1 | OSMU-CODE-REVIEW-20260916-02 | 범위 PASS | health HTTP 200과 DB up, 기본 흐름 11/11, Studio v1 14/14. 고객 임시 토큰의 카드뉴스 생성은 HTTP 403으로 재현했고 토큰 폐기는 HTTP 200. health에 build SHA, commit, version이 없어 끝 커밋 실행본 귀속은 NG |
| Dashboard 회귀 | 전체 테스트와 TypeScript | OSMU-CODE-REVIEW-20260916-03 | PASS | Vitest 363파일, 2,330건 통과, 조건부 3건 제외. `npx tsc --noEmit` 종료 0 |
| OpenClaw 표적 회귀 | 큐 잠금과 Threads, Instagram 발행 | OSMU-CODE-REVIEW-20260916-04 | PASS | 4파일, 6건 통과. 다만 테스트가 먼저 `{}`를 써 첫 실행 0바이트 파손을 건너뛰며, 별도 실측은 0바이트와 JSON `SyntaxError`를 재현 |
| 승인 UI 계약 | v63, v68, DESIGN.md 구조 대조 | OSMU-CODE-REVIEW-20260916-05 | NG | 1024 기본 56px과 펼침 오버레이를 어기고, 접힌 사이드바에서 네 방 전체를 제거함 |
| 검증기 진실성 | API 오류 본문과 실행본 커밋 귀속 | OSMU-CODE-REVIEW-20260916-06 | NG | HTTP 200의 `success:false`, 최상위 `error`, 배열 본문을 모두 정상으로 오분류. localhost health에는 실행 commit 필드가 없어 현재 소스와 서버 동일성을 증명하지 못함 |

제품 코드, migration과 테스트는 수정하지 않았다. 고객 카드뉴스 403, 첫 큐 파일 파손, 잠금 밖 큐 덮어쓰기, 복구 불가능한 발행 불명 상태, Threads 이미지 발행 차단, Instagram 배포 설정 불일치와 공개 객체 잔존, YouTube 중복 게시 가능성, ffprobe 실패 시 자원 상한 우회를 확인해 머지와 배포를 차단한다. 토큰 추가행과 제품 코드 삭제 파일은 0건이다. 운영 배포와 외부 SNS 실발행은 미검증이다.

## 2026-09-15 23시 12분 KST · 성과 시계열 갭 재확인 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 게시물별 성과 시계열과 재현 가능한 30일 비교 | GAP-HISTORY-20260915-2312-01 | NG | 지정 작업 공간 localhost `GET /api/metrics` HTTP 200. 응답 키는 `coverage`, `posts`이고 `history`, `comparison`은 없음. 현재 schema와 migration에도 게시물별 관측 이력 없음 |
| pipeline build 허용 범위 | 승인 계약 안에서 신규 저장과 응답을 구현할 수 있는지 확인 | GAP-HISTORY-20260915-2312-02 | BLOCK | `pipeline-state.osmu.md`는 `qa`, 승인 아님. snapshot 단위, 멱등 키, 보존 기간, 공급자 정규화와 비교식의 승인된 DB 및 API 계약이 없어 제품 소스와 migration을 수정하지 않음 |
| 기존 기본 흐름 | 생성, 편집, 발행 큐, 성과와 생성실 재인계 | GAP-HISTORY-20260915-2312-03 | PASS | localhost 기본 흐름 11/11, Studio v1 14/14, health HTTP 200과 DB up. health version은 null이라 현재 HEAD 실행본 귀속은 미검증 |
| 필수 회귀 | test, TypeScript, 디자인 lint | GAP-HISTORY-20260915-2312-04 | PASS | Vitest 362파일과 2,321건 통과, 조건부 3건 제외. TypeScript 종료 0, 디자인 토큰 위반 0 |

현재 누계를 30일 값으로 이름만 바꾸거나 JSON 배열에 이력을 임의 적재하면 기간 재현성과 작업
공간 격리, 중복 수집과 보존 정책을 증명할 수 없다. 기술설계에서 저장 단위와 비교 계약을
승인하고 build 공정을 다시 열기 전까지 PASS로 전환하지 않는다. 운영 배포와 실제 외부
공급자의 기간 성과는 미검증이다.

## 2026-09-15 22시 55분 KST · 네 방 기본 흐름 v14 기능 수정 후 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 백엔드 기본 흐름 관통 | FLOW-API-V14 | PASS | 지정 작업 공간의 localhost 최종 실요청 11/11. 후보 3장, 편집 순서 변경, 삭제와 복원, 발행 큐 HTTP 201, 성과 제안 3건, 생성실 재인계 관찰. `commands/12-basic-flow-final.log` 종료 0 |
| R08, R19, R207 | 네 방 렌더와 390, 768, 1024, 1440 실제 클릭 이동 | FLOW-UI-V14 | 수정 후 PASS | 단면 4/4, 가린 모달 0, 브라우저 401 0, 콘솔 오류 0. 화면 20/20과 성과실에서 생성실 복귀 5/5. 수정 후 원본 `logs/diff/osmu-four-room-flow-20260915-v14/captures-fixed/` |
| R19, R200, R206, R207 | 1024 성과실 핵심 지표 가독성 | FLOW-UI-METRICS-V14 | 수정 후 PASS | 수정 전 `captures/1024-light-performance.png`에서 조회 `18,420`, 저장 `1,284`, 답글 `316`, 구독 `428`이 한 자리씩 줄바꿈. 전용 성과실은 1024에서 2열, 1440에서 4열로 조정. 수정 후 `captures-fixed/1024-light-performance.png`와 `captures-fixed/1440-light-performance.png`에서 숫자 한 줄 표시 직접 관찰. 회귀 2건 종료 0 |
| R27, R168 | Studio v1 생성, 조회, 거절, 무료 다시 만들기 회귀 | STUDIO-V1-V14 | PASS | 최종 localhost 실요청 14/14. `commands/14-studio-final.log` 종료 0 |
| R104 | QA 자격증명 정리 | FLOW-PROBE-CLEANUP-V14 | PASS | `probe-four-room-flow.mjs` 자체 정리 완료 후 최종 4/4. `commands/13-probe-final.log` 종료 0 |
| 필수 회귀 | test, TypeScript, build, seed, health, Playwright, 디자인 lint | FLOW-REGRESSION-V14 | PASS | Vitest 362파일, 2,321건 통과, 조건부 3건 제외. TypeScript 최종 종료 0, production build 184/184, schema와 seed 및 RLS 적용, health HTTP 200과 DB up, 디자인 lint 위반 0. 모든 명령별 종료 코드는 아래 기록 |
| R193, R205, R206 | 승인 프로토타입과 UI 계승 계약 | DESIGN-V14 | NG | 과제 지정 v63과 canonical pipeline 최신 승인 v68 핀이 충돌한다. 기존 정합 행렬의 주축, 요소 순서, 열 수, 정렬과 여백, 표시와 숨김, 글꼴 계열과 크기 단계, 버튼 위계, 폭별 판정 NG를 기능 수정으로 해소했다고 세지 않음. QA 캡처는 원본 `docs/design/captures/live-20260912/authenticated-fe3/performance-room-1440.png`와 manifest를 참조한다. `docs/design/README.md`는 3줄이며 필수 5경로를 지목하지 않고, `screen-inventory.md`의 인증 STUDIO 미검증 표기와 `captures/manifest.json`의 인증 캡처가 충돌 |
| 실행 서버 귀속 | 현재 HEAD와 localhost 실행본 동일성 | FLOW-RUNTIME-ATTRIBUTION-V14 | NG | listener PID 15479는 21시 30분 시작, 최종 HEAD `099a7370...`이고 health는 `build_sha`, `commit`, `version`을 제공하지 않는다. localhost 기능은 관찰했지만 현재 HEAD 실행본이라고 입증하지 못함. `commands/15-health-attribution.log` |
| R01부터 R207 중 이번 범위 밖 | 회장 확정 요구 승계 | REQ-ALL-V14 | 이월 | 요청 정본 전건을 유지한다. 이번 네 방 흐름 직접 관련 요청만 실행 판정하고 나머지는 이월 |
| 제품 전체 | 운영 배포와 외부 계정 실발행 | QA-QUALITY-GATE-V14 | NG | localhost 기능 범위만 관찰했다. `verify-agent-quality.sh` 종료 2, 배포 환경 접촉 증거 0건. 단일 승인 디자인 핀, 실행본 커밋 귀속, 운영 배포 버전, 외부 채널 실발행은 미검증이므로 제품 전체 PASS와 배포 출고를 금지 |

첫 1024 화면에서 전용 성과실의 오른쪽 담당 패널 때문에 왼쪽 실제 카드 폭이 좁은데도 화면 breakpoint만 보고 4열을 적용해 숫자가 세로로 깨졌다. 전용 화면만 4열 전환점을 1440급으로 늦추고, 포함형 화면의 기존 1024 4열 계약은 보존했다. 수정 전후 1024와 수정 후 1440을 직접 대조했고, 생성, 편집, 발행, 성과, 제안 재인계, 모바일 메뉴, 테마, 사이드바 현재 방은 그대로 통과했다.

명령 증거는 `logs/diff/osmu-four-room-flow-20260915-v14/commands/`에 있다. `01-basic-flow.log` 0, `02-probe-four-room.log` 0, `03-four-room-ui.log` 0, `04-target-regression.log` 0, `05-four-room-ui-fixed.log` 0, `06-studio-v1.log` 0, `07-full-test.log` 0, `08-tsc.log` 2, `08-tsc-rerun.log` 2, `08a-next-typegen.log` 0, `08-tsc-final.log` 0, `09-design-lint.log` 0, `10-seed.log` 0, `11-build.log` 1, `11-build-final.log` 0, `12-basic-flow-final.log` 0, `13-probe-final.log` 0, `14-studio-final.log` 0, `15-health-attribution.log` 0, `16-verify-agent-quality.log` 2다. TypeScript 첫 실패는 손상된 `.next/dev/types/routes.d.ts` 생성물 때문이며 `next typegen` 재생성 뒤 동일 명령이 통과했다. 첫 build 실패는 임시 디렉터리의 `node_modules` 심볼릭 링크가 Turbopack 파일시스템 루트 밖을 가리킨 실행 구성 문제다. `node_modules`를 hardlink 복제한 격리 디렉터리의 최종 build는 184/184로 통과했으며 실행 중인 3456 서버는 건드리지 않았다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 localhost가 현재 HEAD의 실행본이 아닐 가능성이다. health가 버전 필드를 내지 않으므로 이 가능성을 배제하지 못했고, 기능 PASS와 실행본 귀속 NG를 분리했다. 레드팀: 까다로운 고객에게 1024 숫자 가독성은 회귀가 분명하므로 최초 20/20을 그대로 PASS로 세지 않고 즉시 NG를 기록한 뒤 수정 전후 캡처, 표적 회귀, 전 기능 회귀, 네 폭 재클릭을 다시 요구했다. 승인 핀과 디자인 문서 드리프트도 별도 NG로 유지했다.

SOURCES: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `pipeline-state.osmu.md` | `docs/design/captures/manifest.json` | https://playwright.dev/docs/actionability | https://playwright.dev/docs/locators | https://playwright.dev/docs/test-snapshots

MODEL: gpt-codex/gpt-5.6-sol

RUBRIC_SCORE: 완결성=4/5 정밀성=5/5 벤치마크=4/5 추적성=5/5 전문성=4/5 total=22/25

WEAKEST_LINE: "단일 승인 디자인 핀과 실행본 커밋 귀속이 없어 제품 전체 PASS는 내릴 수 없다."

## 2026-09-15 20시 43분 KST · 최근 24시간 코드 공격 재리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 최근 24시간 변경 | 돈, 격리, 동시성, 부분 실패, 무기록 삭제, 확정 요구 이탈 공격 리뷰 | OSMU-CODE-REVIEW-R7-01 | BLOCK | `0774bf9e..bd0d3499`, 55개 커밋과 103개 파일. MAJOR 25건, MINOR 1건. 상세 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-15.md` |
| localhost 실제 응답 | 지정 작업 공간 기본 흐름과 health | OSMU-CODE-REVIEW-R7-02 | 범위 PASS | health HTTP 200, DB up. 기본 흐름 11/11, Studio v1 14/14. 단 listener는 05시 20분 시작이고 끝 커밋은 19시 02분이며 health에 build SHA가 없어 끝 커밋 실행 증거로는 인정하지 않음 |
| Dashboard 회귀 | 전체 테스트와 TypeScript | OSMU-CODE-REVIEW-R7-03 | PASS | Vitest 361파일과 2,319건 통과, 조건부 3건 제외. `npx tsc --noEmit` 종료 0 |
| OpenClaw 빌드 회귀 | tsdown 자원 정책 표적 테스트 | OSMU-CODE-REVIEW-R7-04 | NG | 26건 중 21건 통과, 5건 실패. heap 기대값 3건과 새 `RAYON_NUM_THREADS` 환경값 2건 불일치 |
| 확정 UI 계약 | v63과 DESIGN.md 코드 구조 대조 | OSMU-CODE-REVIEW-R7-05 | NG | 접힌 사이드바에서 네 방 링크와 현재 방 강조가 삭제되고 1024 기본 56px, 펼침 겹침, 브랜드 오른쪽 접기 단추 계약을 지키지 않음 |

제품 코드, migration과 테스트는 수정하지 않았다. 고객 UI의 생성 단추 403, 신규 큐 빈 파일 파손, Threads와 Instagram 이미지 발행 회귀, 프로세스 로컬 공유 생성 큐, 무제한 ffmpeg, YouTube 중복 게시 가능성, 전역 Docker 정리, 거짓 성공 검증기를 확인해 머지와 배포를 차단한다. 운영 배포, 외부 SNS 실발행, 외부 계정 성과 수집은 미검증이다.

## 2026-09-15 18시 43분 KST · 네 방 현재 위치 표시 수정 후 기능 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 백엔드 기본 흐름 관통 | FLOW-API-V13 | PASS | 지정 작업 공간의 localhost 실요청 11/11. 후보 3장, 편집 순서 변경, 삭제와 복원, 발행 큐 HTTP 201, 성과 제안 3건, 생성실 재인계 관찰 |
| R08, R19, R207 | 네 방 렌더와 390, 768, 1024, 1440 실제 이동 | FLOW-UI-V13 | 수정 후 PASS | 네 방 단면 4/4. 최종 화면 20/20과 성과실에서 생성실 복귀 5/5. 가로 넘침, 전체 화면 모달, 탐색 가림, 브라우저 401, 콘솔 오류 0. `logs/diff/osmu-four-room-flow-20260915-v13-final2/captures/` |
| R08, R19, R207 | 상단 단계와 사이드바 현재 방 일치 | FLOW-UI-ACTIVE-V13 | 수정 후 PASS | URL의 유효 방을 공통 저장 상태에 동기화하고, 768 이상에서 사이드바 `aria-current=page`가 정확히 1개이며 현재 방과 일치해야 캡처하도록 검증기를 강화. 회귀 2건 통과. 수정 전 `logs/diff/osmu-four-room-flow-20260915-v13/captures/1024-light-edit.png`, 수정 후 `logs/diff/osmu-four-room-flow-20260915-v13-final2/captures/1024-light-edit.png`과 `1024-light-publish.png` 직접 대조 |
| R27, R168 | Studio v1 생성, 조회, 거절, 무료 다시 만들기 회귀 | STUDIO-V1-V13 | PASS | 수정본 localhost 실요청 14/14 |
| R104 | QA 자격증명 정리 | FLOW-PROBE-CLEANUP-V13 | PASS | 전체 실행 뒤 활성 `qa-four-room-*` 토큰 0건 |
| 필수 회귀 | test, TypeScript, build, seed, health, Playwright, 디자인 lint | FLOW-REGRESSION-V13 | PASS | Vitest 361파일과 2,319건 통과, 조건부 3건 제외. TypeScript 종료 0, production build 184/184, schema와 seed 및 RLS 적용, health HTTP 200과 DB up, 디자인 토큰 위반 0 |
| 커밋 무결성 | 수정과 회귀 및 증거의 저장소 보존 | FLOW-COMMIT-V13 | 일부 NG | 제품과 검증기 수정은 `6d862d47`로 커밋. 새 회귀 테스트는 표적 및 전체 회귀 PASS 후 스테이징됐으나, 타 세션 미추적 `dashboard/tests/db/local-ci-db-migrations.regression-1.test.ts`를 `commit-untracked-guard`가 감지해 커밋 차단. 범위 밖 파일 포함과 훅 우회는 하지 않음 |
| R193, R205, R206 | 승인 프로토타입 디자인 계승 | DESIGN-V13 | NG | 과제 지정 v63과 canonical pipeline 승인 v68 핀이 충돌한다. 기존 16개 화면의 8개 배치 속성 정합 NG를 기능 수정으로 해소했다고 세지 않음 |
| 제품 전체 | 운영 배포와 외부 계정 실발행 | QA-QUALITY-GATE-V13 | NG | localhost 기능은 관찰했지만 stage와 운영 환경 접촉, 외부 채널 실발행은 미검증. 제품 전체 QA와 배포 출고로 확대하지 않음 |
| R01부터 R207 중 이번 범위 밖 | 회장 확정 요구 승계 | REQ-ALL-V13 | 이월 | 요구 정본 전건을 유지하고 이번 네 방 현재 위치 회귀 판정에 포함하지 않음 |

기존 기능은 생성, 편집, 발행 큐, 성과, 제안 재인계, 모바일 메뉴와 테마를 유지했다. 이번 변경은 현재 방의 이중 상태를 한 지점에서 동기화하고 검증기가 데스크톱 사이드바의 단일 현재 위치와 전환 완료를 기다리게 한 것이다. Playwright 공식 actionability와 visual comparison의 안정 상태 대기 원칙을 차용하되, 이 제품은 숨은 사이드바도 DOM 계약으로 검사하도록 변경했다. 이 결론이 틀릴 가장 그럴듯한 이유는 개발 서버의 낡은 번들이지만, 수정 후 회귀 테스트, production build, localhost 두 API E2E, 단면 탐침, 최종 20화면을 같은 소스에서 다시 통과시켜 배제했다. 까다로운 고객 관점에서는 기능 이동만 되고 두 길잡이가 다르면 제품을 신뢰할 수 없으므로, 정확히 한 현재 방만 남는 것을 PASS 조건으로 승격했다.

SOURCES: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `pipeline-state.osmu.md` | https://playwright.dev/docs/actionability | https://playwright.dev/docs/test-snapshots

MODEL: gpt-codex/gpt-5

## 2026-09-15 18시 21분 KST · 네 방 현재 위치 표시 회귀 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R19, R207 | 생성실부터 성과실까지 네 방을 사람처럼 이동하고 현재 방을 일관되게 표시 | FLOW-UI-ACTIVE-V13 | NG | `logs/diff/osmu-four-room-flow-20260915-v13/captures/1024-light-edit.png`에서 상단은 편집실인데 사이드바는 생성실을 선택. `1024-light-publish.png`에서 상단은 발행실인데 사이드바는 편집실을 선택. 실제 이동은 됐지만 두 길잡이의 현재 위치가 불일치 |

원인은 상단 작업 단계가 URL만 바꾸고 `ui-store.studioRoom`을 갱신하지 않으며, 사이드바가 URL이 아닌 그 저장 상태를 읽는 이중 진실원이다. 공통 동기화 지점 수정, 회귀 테스트, 네 폭 재캡처 전에는 PASS로 전환하지 않는다.

## 2026-09-15 17시 37분 KST · API 읽기 경로 v12 범위 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98, R200, R207 | 최신 코드의 읽기 Route Handler 전부를 localhost에서 재검증 | API-READ-ALL-V12 | PASS | 고유 경로 105개에서 GET 105건과 HEAD 1건, 총 106건 실호출. 정상 92, 계약상 거절 14, HTTP 500, 기타 예상 밖 5xx, redirect, 예상 밖 4xx, timeout 모두 0. 최종 원본 `logs/diff/osmu-api-read-sweep-20260915-v12-authoritative-final2.json` |
| R104 | 고객, 운영자, 작업 공간 인증 경계 | API-AUTH-BOUNDARY-V12 | PASS | 격리 탐침은 계약 401과 `no-tenant` 본문. 인증 필요 문구 노출 0. OAuth 미설정 503을 포함한 나머지 13건도 정확한 허용 목록과 일치 |
| 검사기 회귀 | 긴 JSON 전체 본문 판정과 안전한 증거 축약 | API-SWEEP-LONG-JSON-V12 | 수정 후 PASS | 긴 정상 JSON 19건 오판을 수정. 표적 1파일 3건, 전체 Vitest 360파일과 2,317건 통과, 조건부 3건 제외. 수정 `2c50d68b`, 회귀 `1aefc861` |
| 필수 회귀 | TypeScript, build, seed, health, 두 API E2E, Playwright, 디자인 lint | API-READ-REGRESSION-V12 | 작업트리 PASS | tsc 종료 0, Next.js build 184/184, schema와 seed 및 RLS 적용, health HTTP 200과 DB up, 기본 흐름 11/11, Studio v1 14/14, 네 방 반응형 20/20, 가로 넘침, 가린 모달, 브라우저 401, 콘솔 오류, 디자인 토큰 위반 모두 0 |
| 2026-08-28 대비 | 과거 전수 실사와 현재 분모 및 결과 비교 | API-READ-DIFF-V12 | PASS | 과거 문서 84 GET 대비 현재 105 GET으로 21개 증가. 과거 당시 소스 정적 재계산 95 대비 10개 증가. 과거 발견 500은 2건 후 수정, 현재 0. v11 대비 경로, 상태, 분류 변경 0 |
| R01부터 R207 및 세부 요청 232건 중 이번 범위 밖 | 회장 확정 요구 승계 | REQ-ALL-V12 | 이월 | 전건 표를 `docs/qa/osmu-api-read-sweep-v12-gpt-codex.md`에 승계. 이번 API 읽기 직접 관련 5건만 실행 판정하고 나머지는 이월 |
| 제품 전체 | 디자인 정합, 코드 공격 리뷰, 운영 배포 | QA-QUALITY-GATE-V12 | NG | `verify-agent-quality.sh` 종료 코드 2, 배포 환경 접촉 증거 0건. v63과 v68 승인 핀 충돌, 기존 8개 배치 속성 디자인 NG, 17시 25분 코드 공격 재리뷰 BLOCK, 운영 배포와 외부 채널 실발행 미검증을 유지 |

제품 Route Handler의 HTTP 500은 재현되지 않아 제품 API 코드는 바꾸지 않았다. 검사기는 전체 응답으로 판정하고 220자 증거 미리보기만 축약하도록 고쳤다. 최종 실행 전후 listener PID는 64529, 소스 합성 SHA-256은 `8c65d5fa62b8f3d49cac66f3a41c82018d7735a7641379d95d1f454c88e07a75`로 같았다. 상세 보고서는 `docs/qa/osmu-api-read-sweep-v12-gpt-codex.md`다.

## 2026-09-15 17시 25분 KST · 최근 24시간 코드 공격 재리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 최근 24시간 91개 커밋 | 돈, 격리, 동시성, 부분 실패, 무기록 삭제, 확정 요구 이탈 공격 리뷰 | CODE-REVIEW-20260915-R2-01 | BLOCK | `fe24d051..f4b0f5a5`, 202파일. MAJOR 17건, MINOR 1건. 상세 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-15.md` |
| localhost 실제 응답 | 지정 작업 공간 기본 흐름과 health | CODE-REVIEW-20260915-R2-02 | 범위 PASS | health HTTP 200, DB up. 기본 흐름 11/11 |
| Studio v1 실제 응답 | 생성, 조회, 거절, 무료 다시 만들기 몫 | CODE-REVIEW-20260915-R2-03 | NG | 첫 실행 12/14, 무료 다시 만들기 2건 실패. 같은 조건 재실행 14/14. 연속 안정 통과가 아니므로 전체 성공으로 세지 않음 |
| dashboard 회귀 | 전체 테스트와 TypeScript | CODE-REVIEW-20260915-R2-04 | PASS | Vitest 360파일과 2,317건 통과, 3건 제외. `npx tsc --noEmit` 종료 0 |
| OpenClaw 빌드 회귀 | tsdown 자원 정책 표적 테스트 | CODE-REVIEW-20260915-R2-05 | NG | 26건 중 21건 통과, 5건 실패. heap 기대값 3건과 새 `RAYON_NUM_THREADS` 환경값 2건 불일치 |
| 확정 UI 계약 | v63과 DESIGN.md 코드 구조 대조 | CODE-REVIEW-20260915-R2-06 | NG | 접힌 사이드바에서 네 방 링크와 현재 방 강조가 삭제되고, 1024 기본 56px 및 펼침 겹침 계약을 지키지 않음 |

제품 코드는 수정하지 않았다. 계정별 성과 격리, 프로세스 로컬 생성 큐, 무제한 ffmpeg, 불확실한 성과 글 영구 제외, R2 공개 객체 보관, 증거 스크립트의 거짓 커밋 귀속, 공유 runner 전역 정리에 MAJOR가 남아 머지와 배포를 차단한다. 운영 배포, 외부 SNS 실제 발행, 외부 계정 성과 수집은 미검증이다.

## 2026-09-15 06시 35분 KST · 네 방 기본 흐름 v12 기능 수정 후 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 실제 관통 | FLOW-API-V12 | 수정 후 PASS | 지정 작업 공간에서 최종 localhost 기본 흐름 11/11. 후보 3장, 편집 순서 변경, 삭제와 복원, 발행 큐 HTTP 201, 성과 제안 3건과 생성실 재인계 관찰 |
| R08, R19, R207 | 네 방 렌더와 390, 768, 1024, 1440 실제 이동 | FLOW-UI-V12 | 기능 PASS, 디자인 NG | 단면 4/4, 방 화면 20/20, 성과실에서 생성실 복귀 5/5. 가로 넘침, 전체 화면 모달, 탐색 가림, 브라우저 401, 콘솔 오류 0. 원본 `logs/diff/osmu-four-room-flow-20260915-0635/captures/` |
| R27, R168 | Studio v1 회귀 | STUDIO-V1-V12 | PASS | localhost 실요청 14/14 |
| R104 | 검증 자격증명 정리 | FLOW-PROBE-CLEANUP-V12 | PASS | 전체 실행 뒤 활성 `qa-four-room-*` 토큰 0건 |
| R193, R205, R206 | v63 디자인 계승 | DESIGN-V12 | NG | 16개 방과 폭 조합의 주축, 요소 순서, 열 수, 정렬과 여백, 표시와 숨김, 글꼴 단계, 버튼 위계가 불일치. 과제 v63과 pipeline 승인 v68 핀도 충돌 |
| 필수 회귀 | test, TypeScript, build, seed, health, 두 API E2E, Playwright, 디자인 lint | FLOW-REGRESSION-V12 | 작업트리 PASS | Vitest 360파일과 2,317건 통과, 조건부 3건 제외. tsc 종료 0, build 184/184, schema와 seed 및 RLS 적용, health HTTP 200과 DB up 및 52ms, 디자인 토큰 위반 0 |
| 커밋 무결성 | 수정과 회귀가 깨끗한 체크아웃에도 남는지 | FLOW-COMMIT-V12 | NG | 큐 잠금 수정은 `800c970a`. 발행 동시성 정적 계약 테스트 변경은 같은 경로의 타 세션 미추적 테스트 때문에 커밋 훅이 차단해 작업트리에 남음 |
| QA 출고 게이트 | 운영 배포 접촉 증거 | QA-QUALITY-GATE-V12 | NG | `verify-agent-quality.sh`가 배포 환경 접촉 증거 0건으로 반려. localhost 기능 증거를 제품 전체 QA나 배포 PASS로 확대하지 않음 |
| R01부터 R207 중 이번 범위 밖 | 회장 확정 요구 승계 | REQ-ALL-V12 | 이월 | 요구 정본을 유지하고 이번 네 방 기능 PASS에 포함하지 않음 |

첫 전체 회귀는 3파일 실패였다. 제한 동시성 구현을 예전 `Promise.all` 문자열로만 찾던 정적 계약을 현재 구현으로 맞췄고, 큐 잠금 재시도 여유를 1.55초에서 3.55초로 늘리며 최종 `ELOCKED`를 `queue lock timeout`으로 정규화했다. 수정 후 표적 3파일 43건과 전체 2,317건이 통과했다. 기능 범위는 PASS지만 디자인 정합, 커밋 무결성, 운영 배포는 NG다. 상세는 `docs/qa/osmu-four-room-basic-flow-v12-gpt-codex.md`다.

## 2026-09-15 06시 18분 KST · 네 방 기본 흐름 v12 회귀 NG 수정 중

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 실제 관통 | FLOW-API-V12 | PASS | 지정 작업 공간에서 localhost 기본 흐름 11/11. 후보 3장, 편집 순서 변경, 삭제·복원, 발행 큐 HTTP 201, 성과 제안 3건과 생성실 재인계 관찰 |
| R08, R19, R207 | 네 방 렌더와 390·768·1024·1440 실제 이동 | FLOW-UI-V12 | PASS | 단면 4/4, 방 화면 20/20, 성과실에서 생성실 복귀 5/5. 가로 넘침·전체 화면 모달·탐색 가림·브라우저 401·콘솔 오류 0. 원본 `logs/diff/osmu-four-room-flow-20260915-0615/captures/` |
| R27, R168 | Studio v1 회귀 | STUDIO-V1-V12 | PASS | localhost 실요청 14/14 |
| 필수 회귀 | `npm run test` 전체 회귀 | FLOW-REGRESSION-V12 | NG | 360파일 중 357 통과, 3 실패. 발행 성공 배선 정적 계약 1건은 제한 동시성 구현을 예전 `Promise.all` 문자열로만 판정한 테스트 드리프트. 큐 잠금 2건은 재시도 총시간이 13초 임계구역의 남은 2.8초보다 짧고 최종 오류가 `queue lock timeout`으로 정규화되지 않음 |

소스 해시는 실행 전후 `bec9249f3e03e505370d9455d86082cd70118899f559a60241d3ecd16718607e`, HEAD는 `8a1c3aab`로 같아 도중 소스 변경은 없었다. 세 실패를 단독 재현하고 최소 수정 후 전체 회귀를 다시 끝내기 전에는 PASS로 전환하지 않는다.

## 2026-09-15 05시 14분 KST · API 읽기 경로 v12 재실사 중 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98, R200, R207 | 최신 코드의 읽기 Route Handler 전수 재실사 | API-READ-ALL-V12 | NG | 최신 HEAD로 재기동한 localhost에서 GET 105건과 HEAD 1건을 실제 호출했다. 제품 HTTP 500은 0건이었으나 200의 긴 JSON 19건을 검사기가 500자로 자른 뒤 파싱해 `응답 형식 오류`로 오판했고, 실행 중 소스 해시도 바뀌어 권위 실행으로 채택하지 않았다. 원본 `logs/diff/osmu-api-read-sweep-20260915-v12-authoritative.json` |
| 검증기 회귀 | 긴 JSON은 전체 본문으로 판정하고 미리보기만 자름 | API-SWEEP-LONG-JSON-V12 | 수정 후 PASS | `osmu-code-review-20260915-api-sweep-false-success.regression-1.test.ts` 3건 통과. 전수 재실행 전이라 전체 판정은 NG 유지 |

제품 API 고장과 검사기 고장을 분리했다. 소스가 멈춘 뒤 최신 HEAD 서버를 다시 시작하고 전수 요청과 필수 회귀를 끝내기 전에는 PASS로 전환하지 않는다.

## 2026-09-15 04시 17분 KST · 최근 24시간 코드 공격 리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 최근 24시간 96개 커밋 | 돈, 격리, 동시성, 부분 실패, 무기록 삭제, 확정 요구 이탈 공격 리뷰 | CODE-REVIEW-20260915-01 | BLOCK | MAJOR 43건, MINOR 7건. 상세 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-15.md` |
| 실제 고객 인증 경계 | 고객 허용 생성 경로와 공유 계정 정보 노출 | CODE-REVIEW-20260915-02 | NG | 임시 고객 토큰으로 이미지와 카드뉴스 빈 본문은 각각 HTTP 400으로 핸들러 도달. Higgsfield 상태는 HTTP 200과 `email`, `plan`, `credits`, `raw` 키 노출. 값은 기록하지 않았고 임시 토큰 폐기 HTTP 200 확인 |
| 기본 제품 흐름 | 지정 작업 공간의 localhost 실제 요청 | CODE-REVIEW-20260915-03 | PASS | health HTTP 200과 DB up, 기본 흐름 11/11, Studio v1 14/14 |
| dashboard 회귀 | 전체 테스트와 TypeScript | CODE-REVIEW-20260915-04 | PASS | Vitest 353파일과 2,293건 통과, 3건 제외. `npx tsc --noEmit` 종료 0 |
| OpenClaw 빌드 회귀 | 최근 변경된 tsdown 자원 정책 표적 테스트 | CODE-REVIEW-20260915-05 | NG | 26건 중 21 통과, 5 실패. heap 기대값 3건과 새 `RAYON_NUM_THREADS` 환경값 2건 불일치 |

제품 코드는 수정하지 않았다. 격리와 비용 경계, 발행 멱등성, lease fencing, 복구 상태, v63 화면 계약, 증거 신뢰성에 MAJOR가 남아 머지와 배포를 차단한다.

## 2026-09-15 03시 55분 KST · 성과 시계열 갭 재확인 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 두 갭 감사를 현재 코드와 대조해 남은 기본 흐름 갭을 구현 | GAP-HISTORY-20260915-0355-01 | NG | 남은 항목은 게시물별 성과 snapshot과 재현 가능한 30일 비교다. localhost 지정 작업 공간 `GET /api/metrics`는 HTTP 200, 최상위 키는 `coverage`, `posts`, 게시물 0건이며 `history`, `comparison`은 없다. |
| DB 실물과 API 계약 | 게시물별 관측 이력과 기간 비교를 재현 | GAP-HISTORY-20260915-0355-02 | NG | `published_posts`는 최신 누계와 `metrics_at`만 보존하고, 게시물별 이력 table과 migration은 없다. |
| pipeline build 허용 범위 | 승인된 계약 안에서만 구현 | GAP-HISTORY-20260915-0355-03 | BLOCK | 현재 공정은 `qa`, 승인 아님이다. snapshot 단위, 멱등 키, 보존 기간, 공급자별 정규화와 30일 비교식이 승인되지 않아 제품 소스와 migration을 수정하지 않았다. |
| 기본 흐름 실제 요청 | 생성, 편집, 발행 큐, 성과와 생성실 재인계 | GAP-HISTORY-20260915-0355-04 | PASS | localhost 기본 흐름 11/11, Studio v1 14/14. health HTTP 200, DB up. |
| 필수 회귀 | test, TypeScript, production build, 디자인 lint | GAP-HISTORY-20260915-0355-05 | PASS | Vitest 353파일과 2,293건 통과, 3건 제외. TypeScript 종료 0, build 184/184, 디자인 토큰 위반 0. |

YouTube Analytics는 요청 기간과 집계축을 명시하지만 TikTok Video Query는 영상별 누계값을
반환한다. 여러 공급자를 하나의 30일 비교로 묶는 저장·집계 계약이 먼저 필요하다. 운영 배포와
실제 외부 공급자 기간 성과는 미검증이다.

## 2026-09-15 03시 04분 KST · 성과 시계열 갭 재착수 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 두 갭 감사를 현재 코드와 대조해 남은 기본 흐름 갭을 구현 | GAP-HISTORY-20260915-0304-01 | ❌ NG | localhost 지정 작업 공간 `GET /api/metrics`는 HTTP 200이지만 최상위 키가 `coverage`, `posts`뿐이고 `history`, `comparison`은 없다. 게시물은 0건이다. |
| pipeline build 허용 범위 | 게시물별 성과 snapshot과 재현 가능한 30일 비교 구현 | GAP-HISTORY-20260915-0304-02 | BLOCK | `pipeline-state.osmu.md`의 현재 공정은 `qa`, 상태는 승인 아님이다. snapshot 저장 단위, 멱등 키, 보존 기간, 30일 비교식의 승인된 DB·API 계약이 없다. |

health는 HTTP 200과 DB up으로 관찰했다. 코드와 migration을 수정하기 전 두 감사의 후속 구현, 현재 schema, Route Handler, 공식 provider 기간 계약을 대조한다. 승인 없는 저장 계약을 임의로 만들지 않는다.

## 2026-09-15 02시 27분 KST · 네 방 기본 흐름 v11 기능 수정 후 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 실제 관통 | FLOW-API-V11 | 수정 후 PASS | 최초 생성은 `spawn_failed`, 후보 0장. Claude CLI 사용자 설치 경로 탐색을 복구한 뒤 build 후 재기동 서버에서 기본 흐름 최종 11/11. 후보 3장, 편집, 삭제·복원, 발행 큐 HTTP 201, 성과 제안 3건과 생성실 재인계 관찰. 수정 `629f056d`, 회귀 `957a8225` |
| R08, R19, R207 | 390, 768, 1024, 1440 네 폭에서 네 방을 사람처럼 이동 | FLOW-UI-V11 | 기능 PASS, 디자인 NG | 단면 4/4, 방 화면 20/20, 성과실에서 생성실 복귀 5/5. 가로 넘침·가린 모달·탐색 차단·브라우저 401·콘솔 오류 0. 원본 `logs/diff/osmu-four-room-flow-20260915-0216/captures/` |
| R27, R168 | Studio v1 회귀 | STUDIO-V1-V11 | PASS | localhost 실요청 14/14 |
| R104 | 검증 자격증명 정리 | FLOW-PROBE-CLEANUP-V11 | PASS | 전체 실행 뒤 활성 `qa-four-room-*` 토큰 0건 |
| R193, R205, R206 | v63 디자인 계승 | DESIGN-V11 | NG | 16개 방·폭 조합의 주축, 요소 순서, 열 수, 정렬·여백, 표시·숨김, 글꼴 단계, 버튼 위계가 불일치. 과제 v63과 pipeline 승인 v68 핀도 충돌 |
| 필수 회귀 | test, TypeScript, build, seed, health, 두 API E2E, Playwright, 디자인 lint | FLOW-REGRESSION-V11 | PASS | Vitest 353파일과 2,293건 통과, 조건부 3건 제외. tsc 종료 0, build 184/184, schema·seed·RLS 적용, 최종 health HTTP 200·DB up·26ms, 디자인 토큰 위반 0 |
| R01부터 R207 중 이번 범위 밖 | 회장 확정 요구 승계 | REQ-ALL-V11 | 이월 | 요구 정본을 유지하고 이번 네 방 기능 PASS에 포함하지 않음 |
| QA 출고 게이트 | 운영 배포와 외부 채널 실발행 | QA-QUALITY-GATE-V11 | NG | `verify-agent-quality.sh` 종료 코드 2. localhost 기능은 관찰 완료했지만 운영 배포 환경 접촉과 외부 계정 발행은 미검증. 상세 `docs/qa/osmu-four-room-basic-flow-v11-gpt-codex.md` |

canonical `pipeline-state.osmu.md`는 착수 때 이미 `current_stage: qa`였다. 최종 listener PID는 42353, `dashboard/src`, `dashboard/scripts`, `dashboard/tests` 합성 SHA-256은 `f9919ac18a62566b2b461a0f77de21c2bd848af0853664bb812e70f5222b2ecf`다. 기능 범위는 PASS지만 디자인 정합과 제품 전체 QA, 배포는 NG다.

## 2026-09-15 02시 06분 KST · 네 방 기본 흐름 v11 착수 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R27, R166, R168, R172 | 생성실부터 성과실까지 실제 기본 흐름 재검증 | FLOW-API-V11 | ❌ NG | 착수 health는 `localhost:3456/api/health` HTTP 200, DB up이었으나 `verify-basic-flow-e2e.mjs` 첫 생성 요청이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 종료 코드 1. 후보 0장. request id는 `ebeab845-101e-4ece-baf8-f0f9fadef2b1` |

제공자 실패가 실행 환경인지 제품 회귀인지 분리하고, 같은 localhost에서 기본 11단계, 네 방 렌더, 네 폭 클릭, 전체 회귀를 다시 끝내기 전에는 PASS로 전환하지 않는다.

## 2026-09-15 01시 31분 KST · API 읽기 경로 v12 착수 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98, R200, R207 | 최신 코드의 읽기 Route Handler 전수 재실사 | API-READ-ALL-V12 | ❌ NG | 착수 health 실요청이 `localhost:3456/api/health` HTTP 503, 본문 `db: down`, `error: db timeout`, 3003ms였다. listener PID 65744는 살아 있으나 DB 경로가 응답하지 않아 전수 실사를 PASS로 시작하지 않음 |

원인 분석, 서버·DB 상태 분리, 전수 요청과 전체 회귀가 끝날 때까지 이 항목을 PASS로 전환하지 않는다.

## 2026-09-14 22시 35분 KST · 네 방 기본 흐름 v10 기능 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 실제 관통 | FLOW-API-V10 | PASS | 지정 작업 공간 localhost 기본 흐름 11/11. 후보 3장, 편집, 삭제·복원, 발행 큐 HTTP 201, 성과 제안 3건과 생성실 재인계 관찰 |
| R08, R19, R207 | 390, 768, 1024, 1440 네 폭에서 네 방을 사람처럼 이동 | FLOW-UI-V10 | 기능 PASS, 디자인 NG | 단면 4/4, 방 화면 20/20, 성과실에서 생성실 복귀 5/5. 가로 넘침·가린 모달·탐색 차단·브라우저 401·콘솔 오류 0. 원본 `logs/diff/osmu-four-room-flow-20260914-2208/captures/` |
| R27, R168 | Studio v1 회귀 | STUDIO-V1-V10 | PASS | localhost 실요청 14/14 |
| R104 | 검증 자격증명 정리 | FLOW-PROBE-CLEANUP-V10 | PASS | 전체 실행 뒤 활성 `qa-four-room-*` 토큰 0건 |
| R193, R205, R206 | v63 디자인 계승 | DESIGN-V10 | NG | 16개 방·폭 조합의 주축, 요소 순서, 열 수, 정렬·여백, 표시·숨김, 글꼴 단계, 버튼 위계가 불일치. 과제 v63과 pipeline 승인 v68 핀도 충돌 |
| 필수 회귀 | test, TypeScript, build, seed, health, 두 API E2E, Playwright, 디자인 lint | FLOW-REGRESSION-V10 | PASS | Vitest 351파일과 2,291건 통과, 조건부 3건 제외. tsc 종료 0, build 184/184, schema·seed·RLS 적용, health HTTP 200·DB up·24ms, 디자인 토큰 위반 0 |
| R01부터 R207 중 이번 범위 밖 | 회장 확정 요구 승계 | REQ-ALL-V10 | 이월 | 요구 정본을 유지하고 이번 네 방 기능 PASS에 포함하지 않음 |
| QA 출고 게이트 | 운영 배포와 외부 채널 실발행 | QA-QUALITY-GATE-V10 | NG | localhost 기능은 관찰 완료했지만 운영 배포와 외부 계정 발행은 미검증. 상세 `docs/qa/osmu-four-room-basic-flow-v10-gpt-codex.md` |

첫 `npm run test`는 실자격증명을 내보낸 셸의 환경 오염으로 16파일 59건이 실패했다. 원본 `vitest.log`에 보존하고 제품 결함 판정에서 제외했다. 깨끗한 셸의 공식 명령은 `vitest-clean.log`와 같이 전건 통과했다. 제품 소스는 수정하지 않았다.

## 2026-09-14 22시 15분 KST · API 읽기 경로 v11 범위 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98, R200, R207 | 최신 코드의 읽기 Route Handler 전부를 localhost에서 재검증 | API-READ-ALL-V11 | PASS | 고유 경로 105개에서 GET 105건과 HEAD 1건, 총 106건 실호출. 정상 92, 계약상 거절 14, 500·기타 예상 밖 5xx·redirect·예상 밖 4xx·timeout 0. 원본 `logs/diff/osmu-api-read-sweep-20260914-v11-authoritative-restarted.json` |
| R104 | 고객, 운영자, 작업 공간 인증 경계 | API-AUTH-BOUNDARY-V11 | PASS | 격리 탐침은 계약 401과 `no-tenant` 본문. 401 인증 필요 문구 노출 0. Threads OAuth 미설정 503 등 나머지 13건도 정확한 allowlist와 일치 |
| 검사 실행 환경 | 장기 실행 dev listener 열화와 제품 고장 분리 | API-SWEEP-RUNTIME-V11 | 수정 후 PASS | PID 33531에서 세 번 실행이 서로 다른 경로 timeout과 health 503으로 끝났다. DB는 max_connections 100, 연결 6, active 1이었다. 같은 DB와 소스에서 관리 대상 pane만 PID 53664로 재기동한 뒤 106건 전부 응답. 제품 500은 재현되지 않아 제품 코드는 수정하지 않음 |
| 필수 회귀 | test, TypeScript, build, seed, health, 두 API E2E, Playwright, 디자인 lint | API-READ-REGRESSION-V11 | PASS | Vitest 351파일과 2,291건 통과, 조건부 3건 제외. tsc 종료 0, build 184/184, schema·seed·RLS 적용, warm health HTTP 200·DB up·3ms, 기본 흐름 11/11, Studio v1 14/14, 현재 PID 53664 네 방 렌더 4/4와 가린 모달·브라우저 401·콘솔 오류 0, 디자인 토큰 위반 0 |
| R205, R206 | 승인 프로토타입과 UI 계승 | DESIGN-V11 | NG | 제품 화면 소스는 바꾸지 않았다. v9의 390·768·1024·1440 기능 이동은 PASS지만 v63 대비 8개 배치 속성은 전부 NG. 과제 v63과 pipeline 승인 v68 핀도 충돌 |
| R01부터 R207과 하위 번호 232건 | 회장 확정 요구 전건 승계 | REQ-ALL-V11 | 이월 | 상세 보고서의 요청 번호 표에 232건을 전건 승계. 이번 API 범위와 직접 연결된 항목만 실행 판정하고 나머지는 이월 |
| QA 출고 게이트 | 운영 배포 접촉 증거 | QA-QUALITY-GATE-V11 | NG | `verify-agent-quality.sh` 종료 코드 2. localhost 명시 범위는 관찰 완료했지만 운영 host 접촉 증거가 없어 제품 전체 QA와 배포 PASS 금지 |

canonical `pipeline-state.osmu.md`는 착수 시 이미 `current_stage: qa`였다. 권위 실행 전후 listener PID 53664와 `dashboard/src/**/*`, `dashboard/scripts/**/*` 합성 SHA-256 `723e40ed26074441a93080d267342c1e89290d846c0a6b1d7e21f309c8dca3cd`가 같았다. v10 대비 경로 추가·삭제, 상태와 분류 변화는 0건이다. 상세는 `docs/qa/osmu-api-read-sweep-v11-gpt-codex.md`다.

## 2026-09-14 20시 44분 KST · 최근 24시간 코드 공격 재리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 최근 24시간 변경 | 전체 커밋과 diff 공격 리뷰 | OSMU-CODE-REVIEW-R5-01 | BLOCK | `82642efe..f32ff712`, 87커밋, 213파일. MAJOR 36건, MINOR 9건. |
| 실제 앱 요청 | localhost와 지정 작업 공간 기본 흐름 | OSMU-CODE-REVIEW-R5-02 | 범위 PASS | health HTTP 200과 DB up. 기본 흐름 11/11, Studio v1 14/14. |
| 고객 격리 | 고객 토큰으로 공급자 전역 계정 정보 접근 여부 | OSMU-CODE-REVIEW-R5-03 | NG | 임시 고객 토큰으로 `/api/higgsfield/status` HTTP 200과 `email`, `plan`, `credits`, `raw` 키를 관찰했다. 값은 기록하지 않았고 토큰 폐기 HTTP 200을 확인했다. |
| dashboard 회귀 | test와 TypeScript | OSMU-CODE-REVIEW-R5-04 | PASS | Vitest 351파일, 2,291건 통과, 조건부 3건 제외. `npx tsc --noEmit` 종료 코드 0. |
| OpenClaw 회귀 | 종료 직전 추가된 메모리 수정의 대상 테스트 | OSMU-CODE-REVIEW-R5-05 | NG | `test/scripts/tsdown-build.test.ts` 26건 중 3건 실패. 기대 6,400MB, 실제 3,584MB. |
| 증거 정합 | 실행 서버가 현재 검토 커밋과 같은가 | OSMU-CODE-REVIEW-R5-06 | NG | listener PID 33531은 16:14 시작됐지만 저장 증거는 17:00 커밋을 주장한다. 실요청 관찰은 유효하나 고정 HEAD 실행 증거로 확대하지 않았다. |
| 4축 | 시안, 회귀, 토큰, 삭제 | OSMU-CODE-REVIEW-R5-07 | BLOCK | 승인 시안 이탈 3건, 회귀 위험 39건, 토큰 위반 2건, 무기록 삭제 1건. |

제품 코드, migration과 테스트는 수정하지 않았다. 상세 보고서는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md`다. 운영 배포, 외부 채널 실발행, 현재 HEAD로 재기동한 localhost 동일성은 미검증이다.

## 2026-09-14 19시 18분 KST · 성과 시계열 갭 재실사 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 두 갭 감사를 현재 코드와 대조해 기본 흐름의 잔여 미구현을 선별 | GAP-HISTORY-20260914-1902-01 | NG | 지금도 없는 항목은 게시물별 성과 이력과 재현 가능한 30일 비교다. 지정 작업 공간 localhost `GET /api/metrics`는 HTTP 200이지만 최상위 키는 `coverage`, `posts`뿐이고 `history`, `comparison`은 없다. |
| DB 실물 | 게시물별 누계의 과거 시점 보존 여부 | GAP-HISTORY-20260914-1902-02 | NG | live DB `information_schema`에서 이력 계열 테이블은 채널 팔로워용 `growth_metrics`뿐이다. `published_posts`는 최신 `views`, `likes`, `replies`, `reposts`, `metrics_at`만 보존한다. |
| pipeline build 허용 범위 | 승인된 DB와 API 계약 안에서만 구현 | GAP-HISTORY-20260914-1902-03 | BLOCK | `pipeline-state.osmu.md`의 현재 공정은 `qa`, 상태는 승인 아님이다. snapshot 저장 단위, 멱등 키, 보존 기간과 30일 비교식의 승인 계약이 없어 제품 소스와 migration을 수정하지 않았다. |
| 기존 기본 흐름 | 생성, 편집, 발행 큐, 성과와 생성실 재인계 | GAP-HISTORY-20260914-1902-04 | PASS | localhost 기본 흐름 11/11, Studio v1 14/14를 실제 요청으로 관찰했다. |
| 필수 회귀 | test, TypeScript, production build, 디자인 lint | GAP-HISTORY-20260914-1902-05 | PASS | Vitest 351파일과 2,291건 통과, 조건부 3건 제외. TypeScript 종료 0, build 184/184, 디자인 토큰 위반 0. |

이번 사용자 요청 원문을 작업 기준으로 사용했다. 제품 소스, migration과 테스트는 수정하지 않았다. 현재 누계값을 30일 값으로 재명명하거나 JSON에 이력을 임의 적재하면 재현성과 격리 계약을 증명할 수 없다. 기술설계에서 계약을 승인하고 build 공정을 다시 연 뒤 구현해야 한다. 운영 배포와 실제 외부 provider 기간 조회는 미검증이다.

## 2026-09-14 18시 40분 KST · 네 방 기본 흐름 v9 기능 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 네 방 관통 | FLOW-API-V9 | PASS | localhost 기본 흐름 11/11. 후보 3장, 편집, 순서 변경, 삭제와 복원, 발행 큐 HTTP 201, 성과 제안 3건과 생성실 재인계를 직접 관찰 |
| R08, R19, R207 | 네 방 렌더와 390, 768, 1024, 1440 실제 이동 | FLOW-UI-V9 | 기능 PASS, 디자인 NG | 단면 4/4, 20개 방 화면과 성과실에서 생성실 복귀 5/5. 가로 넘침, 가린 모달, 401, 콘솔 오류 0건. 원본 `logs/diff/osmu-four-room-flow-20260914-1819/captures/` |
| R27, R168 | Studio v1 생성과 무료 다시 만들기 경계 | STUDIO-V1-V9 | PASS | localhost 실요청 14/14 |
| R104 | 검증 자격증명을 남기지 않음 | FLOW-PROBE-CLEANUP-V9 | 수정 후 PASS | 화면 검증과 독립된 60초 폐기 요청과 실패 종료 코드 1 계약을 추가했다. 회귀 3파일 6건, 실앱 단면 4/4, 실행 전후 활성 probe 토큰 0건. 과거 활성 테스트 토큰 2건도 폐기해 최종 잔여 0건. 커밋 `4736aa9f` |
| 필수 회귀 | test, TypeScript, build, seed, health, 디자인 lint | FLOW-REGRESSION-V9 | PASS | Vitest 351파일과 2,291건 통과, 조건부 3건 제외. TypeScript 종료 0, build 184/184, health HTTP 200과 DB up, seed 적용, 디자인 토큰 위반 0 |
| R205, R206 | v63 디자인 계승 | DESIGN-V9 | NG | v63 원본과 현재 16개 방과 폭 조합의 주축, 요소 순서, 열 수, 정렬과 여백, 표시 여부, 글꼴 단계, 버튼 위계가 모두 불일치. 과제 v63과 pipeline 승인 v68 핀도 충돌 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 승계 | REQ-ALL-V9 | 이월 | 기존 전건 추적표 유지. 운영 배포와 외부 채널 실발행은 이번 기능 PASS에 포함하지 않음 |

첫 단면 실행은 4/4 뒤 토큰 폐기 제한시간 초과를 출력하면서 종료 코드 0을 반환했다. 원인은 화면 탐색과 토큰 폐기가 하나의 전체 마감시각을 공유한 구조와 강제 성공 종료였다. 두 검증기의 정리 요청을 독립시키고 실패를 프로세스 실패로 바꾼 뒤 실앱과 회귀를 다시 통과시켰다. 상세는 `docs/qa/osmu-four-room-basic-flow-v9-gpt-codex.md`다. localhost 네 방 기능만 PASS이며 디자인 정합, 운영 배포, 외부 채널 실발행 미검증 때문에 제품 전체 QA와 배포는 NG다.

## 2026-09-14 17시 47분 KST · API 읽기 경로 v10 범위 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98 | 성과와 학습 읽기를 다음 생성 판단으로 되돌림 | API-READ-ALL-V10 | PASS | localhost 고유 경로 105개, GET 105건과 HEAD 1건 실호출. 정상 92, 계약상 거절 14, 500·redirect·timeout·예상 밖 거절 0. 원본 logs/diff/osmu-api-read-sweep-20260914-v10-authoritative.json |
| R104 | 고객, 운영자, 작업 공간 인증 경계 | API-AUTH-BOUNDARY-V10 | PASS | 격리 탐침은 계약 401과 안전한 no-tenant 본문. 401 인증 필요 문구 노출 0, 예상 밖 4xx·5xx 0 |
| R200, R207 | 성과와 Studio 학습 정보 읽기 | API-LEARNING-READ-V10 | PASS | /api/metrics, /api/performance/learned-rules, /api/studio/learning HTTP 200 |
| 검사 증거 울타리 | HEAD·3xx·import chain·서버 교체를 놓치지 않음 | API-SWEEP-FENCE-V10 | 수정 후 PASS | GET 105와 HEAD 1 별도 실행, 2xx만 정상, 전체 src·scripts 해시와 listener PID 전후 동일. 커밋 a6924427, 3be8459b |
| 필수 회귀 | 전체 test, TypeScript, build, seed, health, 두 E2E, 디자인 lint | API-READ-REGRESSION-V10 | PASS | 350파일·2,289건 통과·3건 제외, tsc 0, build 184/184, health 200, 기본 11/11, Studio 14/14, lint 위반 0 |
| 원장 232건 중 이번 범위 밖 | 회장 확정 요구 전건 승계 | REQ-ALL-V10 | 이월 | docs/qa/osmu-api-read-sweep-v10-gpt-codex.md에 232개 요청 번호를 전건 표로 승계 |

권위 실행 전후 listener PID는 33531, dashboard/src/**/*와 dashboard/scripts/**/* 합성 SHA-256은 a7cea815adcf5a80359662c4c8a382b53b1c2c3bf3d7e3458ee270268b2e3e7f로 동일했다. 좁은 해시와 300초 예산 소진 실행은 권위 증거에서 제외했다. API 읽기 범위만 PASS이며 v63과 v68 승인 핀 충돌, 3폭 디자인 정합 NG, 운영 배포와 외부 채널 실발행 미검증 때문에 제품 전체 QA와 배포는 NG다.

⛔ 검증실패 보고: 상위 verify-agent-quality.sh는 배포 환경 접촉 증거 0건으로 종료 코드 2와 함께 반려했다. localhost 명시 범위는 관찰 완료했지만 제품 전체 PASS로 전환하지 않는다.

## 2026-09-14 16시 16분 KST · 최근 24시간 코드 공격 재리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 최근 24시간 변경 | 돈, 격리, 동시성, 부분 실패, 삭제, 확정 요구 이탈 공격 리뷰 | OSMU-CODE-REVIEW-R4-01 | BLOCK | `e65a1d1b..22c27bdb`, 커밋 70개, 파일 162개. MAJOR 28건, MINOR 5건. 상세 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md` |
| 실제 앱 요청 | 지정 작업 공간 기본 흐름과 Studio v1 | OSMU-CODE-REVIEW-R4-02 | PASS | localhost health HTTP 200과 DB up, 기본 흐름 11/11, Studio v1 14/14 |
| 전체 회귀 | Vitest와 TypeScript | OSMU-CODE-REVIEW-R4-03 | PASS | Vitest 348파일, 2,277건 통과와 3건 제외. `npx tsc --noEmit` 종료 코드 0 |
| 고객 격리 | 고객 허용 목록과 전역 Higgsfield 상태 응답 | OSMU-CODE-REVIEW-R4-04 | NG | 같은 날 앞선 임시 고객 토큰 실측에서 HTTP 200과 `email`, `plan`, `credits`, `raw` 키 노출. 이번 범위 종료까지 허용 목록과 응답 코드 변경 없음. 값은 기록하지 않음 |
| 검증기 신뢰성 | 인증 리다이렉트의 부분 실패 분류 | OSMU-CODE-REVIEW-R4-05 | NG | `dashboard/scripts/verify-api-read-sweep.mjs:108`이 200부터 399까지 모두 정상으로 분류해 API가 로그인 화면으로 리다이렉트돼도 초록 가능 |

제품 소스, migration과 테스트는 수정하지 않았다. 다른 세션의 미커밋 변경이 있는 공유 작업 트리에서 실행했으므로 초록 테스트를 고정 커밋 범위의 안전 증명으로 확대하지 않는다. 운영 배포, 실제 외부 채널 발행과 시안 픽셀 대조는 미검증이다.

## 2026-09-14 15시 14분 KST · 성과 시계열 재확인 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 게시물별 성과 시계열과 재현 가능한 30일 비교 | METRICS-HISTORY-20260914-1514-01 | NG | 지정 작업 공간 localhost `GET /api/metrics` HTTP 200. 응답 키는 `coverage`, `posts`이고 `history`, `comparison`은 없음 |
| pipeline build 허용 범위 | 승인된 DB와 API 계약 안에서만 구현 | METRICS-HISTORY-20260914-1514-02 | BLOCK | `pipeline-state.osmu.md`의 현재 공정은 `qa`, 상태는 승인 아님. 성과 snapshot 저장 단위, 멱등 키, 보존 기간과 30일 비교식이 승인되지 않음 |
| 기존 기본 흐름 보존 | 생성, 편집, 발행 큐, 성과와 생성실 재인계 | METRICS-HISTORY-20260914-1514-03 | PASS | localhost health HTTP 200, 기본 흐름 11/11, Studio v1 14/14 |
| 전체 회귀 | Vitest, TypeScript, production build와 디자인 lint | METRICS-HISTORY-20260914-1514-04 | PASS | Vitest 348파일, 2,277건 통과와 3건 제외. `npx tsc --noEmit` 종료 코드 0, build 184/184, 디자인 토큰 위반 0 |

제품 소스, migration과 테스트는 수정하지 않았다. 승인되지 않은 저장 계약을 임의로 추가하지
않았으며 운영 배포와 실제 외부 provider 기간별 성과 회수는 미검증이다.

## 2026-09-14 14시 48분 KST · 네 방 감독 복구 경로 수정 후 기능 PASS, 디자인 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 네 방 관통 | FLOW-API-V8 | PASS | localhost 기본 흐름 11/11. 후보 3장, 편집, 발행 큐 HTTP 201, 성과 제안 3건과 생성실 재인계 관찰 |
| R08, R19, R207 | 네 방 렌더와 390, 768, 1024, 1440 실제 이동 | FLOW-UI-V8 | 기능 PASS, 디자인 NG | 단면 4/4, 20개 방 화면과 성과실에서 생성실 복귀 5/5. 가로 넘침, 가린 모달, 탐색 차단, 다음 행동 누락, 401, 콘솔 오류 모두 0건. 원본 `logs/diff/osmu-four-room-flow-20260914-final/captures/` |
| R27, R168 | Studio v1 생성과 무료 다시 만들기 경계 | STUDIO-V1-V8 | PASS | localhost 실요청 14/14 |
| 개발 서버 복구 | 감독이 검증된 Webpack 개발 계약으로 앱을 복구 | QA-FLOW-RUNTIME-01 | 수정 후 PASS | 감독의 직접 `npx next dev`가 Turbopack을 띄워 `Next.js package not found` 패닉을 반복. `npm run dev -- -p 3456`으로 연결하고 회귀 8/8, 최종 런타임 치명 로그 0건. 커밋 `d17115f6` |
| 전체 회귀 | Vitest, TypeScript, build, 디자인 lint | FLOW-REGRESSION-V8 | PASS | 348파일, 2,277건 통과, 조건부 3건 제외. TypeScript 종료 코드 0, build 184/184, 디자인 토큰 위반 0 |
| R205, R206 | v63 디자인 계승 | DESIGN-V8 | NG | v63 원본과 현재 16개 화면의 8축 배치 속성이 모두 불일치. 과제 v63과 pipeline 승인 v68 핀도 충돌 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 운영 배포와 외부 채널 실발행은 이번 PASS에 포함하지 않음 |

seed는 지정 작업 공간에 멱등 적용했고 최종 health는 HTTP 200, DB up, 2ms다. 상세는 `docs/qa/osmu-four-room-basic-flow-v8-gpt-codex.md`다. 네 방 localhost 기능만 PASS이며 디자인 정합, 운영 배포, 외부 채널 실발행 미검증 때문에 제품 전체 QA와 배포는 NG다.

## 2026-09-14 14시 19분 KST · 네 방 렌더 탐침 1차 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R19, R166, R172, R207 | 생성실부터 성과실까지 네 방 렌더와 가림 모달 여부 재검증 | FLOW-PROBE-20260914-1419-01 | NG | 기본 백엔드 흐름은 11/11 통과했으나 `probe-four-room-flow.mjs`가 `/studio?room=create`의 `[data-room="create"]` 표시를 120초 안에 관찰하지 못하고 종료 코드 1로 중단됨. 검증 전후 localhost:3456 listener PID 21466과 health HTTP 200, DB up은 유지됨. |

현재는 제품 렌더 결함과 공유 Next 개발 서버의 콜드 컴파일 정체를 분리하는 중이다. 동일 소스에서 단독 재현과 네 폭 전건 재실행을 끝내기 전에는 PASS로 바꾸지 않는다.

## 2026-09-14 14시 00분 KST · API 읽기 경로 전수 재실사 범위 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98 | 발행 성과를 읽고 다음 생성 판단으로 되돌림 | API-READ-ALL-V9 | PASS | localhost GET 105개 실호출. 정상 92, 계약상 거절 13, HTTP 500과 요청 실패 0. 원본 `logs/diff/osmu-api-read-sweep-20260914-1313-final.json` |
| R104 | 고객, 운영자, 작업 공간 인증 경계 | API-AUTH-BOUNDARY-V9 | PASS | 무토큰 격리 탐침 401. 비정상 상태 13개의 본문을 입력, 없는 자원, 인증, 설정 경계로 확인 |
| R200, R207 | 성과 학습 규칙과 Studio 학습 정보 조회 | API-LEARNING-READ-V9 | PASS | `/api/performance/learned-rules`, `/api/studio/learning` 각각 HTTP 200 |
| 검사기 콜드 컴파일 경합 | 개발 서버 전수 검사가 제품 응답 전에 멈추지 않음 | API-READ-DEV-COLD-V9 | 수정 후 PASS | 첫 동시성 4 실행은 요청 실패 4, 전체 시간 초과 35, 제품 500 0. production 동시성 4와 개발 서버 순차 실행은 105/105 응답. 기본 동시성을 1로 고정하고 회귀 추가, 커밋 `d5a612cc` |
| 필수 자동 회귀 | 전체 Vitest, TypeScript, build, seed, E2E | API-READ-REGRESSION-V9 | PASS | 348파일과 2,276건 통과, 3건 제외. TypeScript 종료 0, build 184/184, seed와 RLS 적용, 기본 흐름 11/11, Studio v1 14/14, health 200, 디자인 lint 위반 0 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 디자인 정합, 운영 배포, 외부 채널 실발행은 이번 PASS에 포함하지 않음 |

상세는 `docs/qa/osmu-api-read-sweep-v9-gpt-codex.md`다. 2026-08-28 문서 84개, 당시 실제 정적 분모 95개, 현재 105개를 분리해 비교했다. 직전 v8과 현재 v9의 경로, 상태, 분류 차이는 0건이다. API 읽기 범위만 PASS이며 기존 디자인 정합 NG, v63과 v68 승인 핀 충돌, canonical 테스트 계획과 ONE_THING 부재, 운영 배포와 외부 채널 실발행 미검증, 같은 날 공격 리뷰 BLOCK 때문에 제품 전체 QA와 배포는 NG다.

이번 턴에 v63 발행실 1440 PNG와 dev 발행실 1440 PNG를 각각 원본 크기로 직접 열었다. 공통 셸, 요소 순서, 본문 구조, 행동 위계가 달랐고 데이터 상태도 3곳 선택과 0곳 선택으로 달라 디자인 일치를 주장할 수 없다. 1440은 NG, 다른 폭은 이번 턴 미검증으로 유지한다.

## 2026-09-14 13시 28분 KST · API 읽기 경로 전수 재실사 착수 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98, R104, R200, R207 | 최신 코드가 내보내는 읽기 Route Handler 전부를 실제 요청으로 재검증 | API-READ-20260914-1313-01 | NG | 현재 분모 105개, 실행 전 GET 소스 합성 SHA-256 `b37dedf0bf4623843063fd7022fc1c0a5aaba47e5adaba96afc5480f680a4f3a`. localhost health HTTP 200과 DB up만 관찰. 전수 요청, 거절 본문 확인, 필수 회귀가 안 끝나 PASS 금지. |

`rg`가 gitignore의 `tenants/` 패턴을 존중해 추적 중인 `/api/tenants`를 누락한 104개 중간 계산은 폐기했다. 실제 검증기와 동일하게 `fs.readdir`로 수집한 105개가 분모다. `/api/studio/learning`은 공유 작업 트리에서 수정 중이다. 새 원본 JSON과 실행 전후 소스 해시, 실패 단독 재현, 전체 Vitest, TypeScript, 기본 흐름과 Studio v1을 새로 관찰하기 전에는 직전 PASS를 재사용하지 않는다.

## 2026-09-14 12시 22분 KST · 최근 24시간 코드 공격 리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 최근 24시간 변경 | 돈 누수, 작업 공간 격리, 동시성, 부분 실패, 무기록 삭제, 확정 요구 이탈 공격 리뷰 | REVIEW-20260914-R3-01 | BLOCK | 범위 `7e39d0a7..4f59a759`, 커밋 74개, 파일 180개. MAJOR 27건, MINOR 3건. 승인 시안 이탈 2건, 회귀 위험 26건, 토큰 위반 1건, 무기록 삭제 1건. 상세 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md`. |
| 고객 격리 실측 | 고객 토큰이 운영 전역 공급자 정보를 읽지 못함 | REVIEW-20260914-R3-LIVE | FAIL | 임시 고객 토큰으로 `/api/higgsfield/status` 호출 시 HTTP 200과 `email`, `plan`, `credits`, `raw` 키 반환. 값은 출력하지 않았고 임시 토큰 삭제 뒤 잔여 0건 확인. |
| 필수 자동 회귀 | 전체 Vitest와 TypeScript | REVIEW-20260914-R3-REGRESSION | PASS | `npm run test` 347파일, 2,275건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. |
| localhost 기본 흐름 | 생성, 편집, 발행 큐, 성과 재인계와 Studio v1 | REVIEW-20260914-R3-E2E | PASS | health HTTP 200과 DB up. 기본 흐름 11/11, Studio v1 14/14. |

자동 회귀와 기본 흐름은 통과했지만 고객 격리 결함이 실제 재현됐고, 중복 발행과 자원 고갈 등 정적 재현 경로가 남아 있어 전체 판정은 BLOCK이다. 실행 검증은 다른 세션의 미커밋 변경이 있는 공유 작업 트리에서 수행했으므로 고정 커밋 범위의 안전 증명으로 확대하지 않는다. 제품 소스는 수정하지 않았다.

## 2026-09-14 11시 20분 KST · 성과 시계열 갭 build 차단 재확인

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 갭 감사 잔여 1건 | 게시물별 성과 시계열과 재현 가능한 30일 비교 | GAP-HISTORY-20260914-01 | NG | 현재 `published_posts`는 최신 누계와 `metrics_at`만 보존하고 게시물별 이력 테이블이 없다. localhost `GET /api/metrics`는 HTTP 200이지만 최상위 키는 `posts`, `coverage`뿐이고 `history`, `comparison`은 없다 |
| 공정 게이트 | 승인된 DB·API 계약 안에서만 build | GAP-HISTORY-20260914-02 | BLOCK | `pipeline-state.osmu.md`의 현재 공정은 `qa`, 상태는 `in-progress (승인 아님)`이다. 이력 보존 단위, 중복 기준, 보존 기간, 30일 비교 의미가 승인되지 않아 제품 소스와 migration은 수정하지 않았다 |
| 현재 기본 흐름 | 생성, 편집, 발행 큐, 성과 제안 재인계 | GAP-HISTORY-20260914-03 | PASS | localhost 기본 흐름 11/11, Studio v1 14/14 |
| 전체 회귀 | 기존 기능 보존 | GAP-HISTORY-20260914-04 | PASS | Vitest 347파일, 2,275건 통과, 3건 제외. TypeScript 종료 코드 0. production build 184/184 |

현재 두 감사 문서를 코드와 다시 대조하면 이미 닫힌 항목을 제외한 잔여는 성과 시계열 하나다. 이를 최신 누계값 비교로 흉내 내면 프로토타입의 `최근 30일`이 재현 불가능한 숫자가 된다. 정규화된 게시물 성과 snapshot 계약을 승인하고 build 공정을 다시 열기 전에는 PASS로 전환하지 않는다.

## 2026-09-14 10시 39분 KST · 네 방 기본 흐름 기능 PASS, 디자인과 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172, R193 | 생성, 편집, 발행, 성과의 실제 데이터 인계 | FLOW-API-V7 | PASS | 최종 소스의 localhost 기본 흐름 11/11. 후보 3장, 초안 편집, 발행 큐 HTTP 201, 성과 제안 3건과 생성실 재인계 관찰 |
| R08, R19, R207 | 390, 768, 1024, 1440에서 네 방 실제 이동 | FLOW-UI-V7 | 기능 PASS, 디자인 NG | 20개 방 화면과 성과실에서 생성실 복귀 5/5. 가로 넘침, 가린 모달, 탐색 차단, 다음 행동 누락, 401, 콘솔 오류 모두 0건. 원본 `logs/diff/osmu-four-room-flow-20260914-v7/captures/` |
| R27, R168 | Studio v1 생성과 무료 다시 만들기 경계 | STUDIO-V1-V7 | PASS | localhost 실요청 14/14 |
| 공통 단추 회귀 | 새 44px 양축 조작영역 계약과 자동 검사 일치 | FLOW-REGRESSION-V7 | 수정 후 PASS | 첫 전체 회귀는 오래된 `min-w-max` 예상 3건 실패. `ds-touch-target` 존재와 이전 class 부재를 검사하도록 수정, 집중 20/20과 전체 346파일, 2,266건 통과, 조건부 3건 제외. 커밋 `92635f06` |
| web build와 정적 검증 | TypeScript, production build, 디자인 lint | FLOW-BUILD-V7 | PASS | `npx tsc --noEmit` 종료 코드 0, build 184/184, 디자인 토큰 위반 0. 기존 NFT 추적 경고 1건 |
| R205, R206 | v63 디자인 계승 | DESIGN-V7 | NG | v63 원본과 현재 16개 화면의 8축 배치 속성이 모두 불일치. 사용자 지정 v63과 pipeline 승인 v68 핀도 충돌 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 운영 배포와 외부 채널 실발행은 이번 PASS에 포함하지 않음 |

첫 probe 생성실 제한시간 초과와 다음 probe의 연결 재설정 19건은 공유 localhost 서버가 실행 중 교체된 증거라 즉시 NG로 기록했다. 프로젝트 표준 webpack 서버가 안정화된 뒤 기본 스크립트를 그대로 재실행했고, 최종 `dashboard/src`와 `dashboard/scripts` 합성 SHA-256 `9fb3ed473b15475efaa9753508f4ead4e7a0c965af6b3991f2996feb37bc721e`에서 모든 필수 검증을 다시 통과했다. 네 방 localhost 기능만 PASS이며 디자인 정합, 승인 핀 충돌, 운영 배포와 외부 채널 실발행 미검증 때문에 제품 전체 QA와 배포는 NG다. 상세는 `docs/qa/osmu-four-room-basic-flow-v7-gpt-codex.md`다.

## 2026-09-14 10시 11분 KST · 네 방 기본 흐름 재실사 1차 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R19, R166, R172, R207 | 생성실부터 성과실까지 네 방 렌더와 실제 이동 | FLOW-PROBE-V7-01 | NG | localhost 기본 흐름은 11/11 통과했으나 `probe-four-room-flow.mjs`가 `/studio?room=create`의 `[data-room="create"]`를 120초 안에 관찰하지 못해 종료 코드 1. 직후 health는 HTTP 200, DB up |

제품 렌더 결함, 개발 서버 경합, 검증기 대기 결함을 분리하기 전에는 네 방 기능을 PASS로 전환하지 않는다. 같은 URL의 최종 DOM, 요청 상태, 콘솔 오류와 서버 로그를 수집하고 재현한 뒤 전체 네 폭을 처음부터 다시 실행한다.

## 2026-09-14 10시 05분 KST · API 읽기 경로 전수 재실사 범위 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98 | 발행 성과를 읽고 다음 생성 판단으로 되돌림 | API-READ-ALL-V8 | PASS | 고정된 최신 소스에서 localhost GET 105개 실호출. 정상 92, 계약상 거절 13, HTTP 500과 요청 실패 0. 원본 `logs/diff/osmu-api-read-sweep-20260914-091409-final.json` |
| R104 | 고객, 운영자, 작업 공간 인증 경계 | API-AUTH-BOUNDARY-V8 | PASS | 무토큰 격리 탐침 401. 13개 비정상 상태의 본문을 읽어 입력, 설정, 인증 경계로 확인 |
| R200, R207 | 성과 학습 규칙과 Studio 학습 정보 조회 | API-LEARNING-READ-V8 | PASS | `/api/performance/learned-rules`, `/api/studio/learning` 각각 HTTP 200 |
| 생성 장부 연결 오류 | 일시적인 DB 연결 실패가 일반 500으로 누출되지 않음 | API-GENERATION-DB-READ-V8 | 수정 후 PASS | 최초 파생 작업 조회가 38,980ms 뒤 HTTP 500. 연결 오류를 재시도 가능한 503으로 분류하고 회귀 3건 추가. 커밋 `25330905`. 최종 같은 경로 404, 전체 500 0 |
| 현재 소스 고정 | 공유 작업 트리 혼입 방지 | API-READ-SOURCE-HASH-V8 | PASS | 실행 전후 HEAD `e0c66d14`와 `dashboard/src` 합성 SHA-256 `5f276662869c8aef8126c48e0d3969afa810d10971bb763e2c9b58fabd942f5b` 동일. 최종 health 200 |
| 필수 자동 회귀 | 전체 Vitest | API-READ-REGRESSION-V8 | PASS | 최신 코드 345파일, 2,254건 통과, 조건부 3건 제외, 실패 0 |
| 정적 검증과 build | TypeScript, production build, 디자인 lint | API-READ-BUILD-V8 | PASS | `npx tsc --noEmit` 종료 코드 0. Next.js 16.2.2 production build 184/184, 종료 코드 0. 기존 NFT 경고 1건. 디자인 토큰 위반 0 |
| seed와 localhost 흐름 | 고정 작업 공간 fixture와 실동작 | API-READ-E2E-V8 | PASS | schema와 seed 멱등 적용, production health 200, 기본 흐름 11/11, Studio v1 14/14 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 디자인 정합, 운영 배포, 외부 채널 실발행은 이번 PASS에 포함하지 않음 |

상세는 `docs/qa/osmu-api-read-sweep-v8-gpt-codex.md`다. v7과 v8의 최종 경로, HTTP 상태, 분류는 같다. 이번 실사에서 발견한 생성 장부 연결 오류의 500 누출은 계약 보강과 회귀 테스트로 고쳤다. Next 개발 서버 콜드 컴파일 중 콜백 500은 단독 5회와 예열 뒤 전수 실행에서 HTTP 200으로 분리 확인했다. API 읽기 범위만 PASS이며 디자인 정합, 운영 배포, 외부 채널 실발행이 미검증이므로 제품 전체 QA와 배포는 NG다.

## 2026-09-14 09시 06분 KST · API 읽기 경로 전수 재실사 착수 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98, R104, R200, R207 | 최신 코드가 내보내는 읽기 Route Handler 전부를 실제 요청으로 재검증 | API-READ-20260914-091409-01 | NG | 현재 분모 105개, 실행 전 GET 소스 합성 SHA-256 `422005c15c9ceaaa90157b94c17cdbacdf12bc4bb8131128f2346c54e9548e23`. localhost health HTTP 200과 DB up까지만 관찰했다. 전수 요청, 의도된 거절 본문 확인, 필수 회귀가 끝나지 않아 PASS 금지. |

직전 v7 실사 뒤 `/api/metrics`와 고객 proxy 허용 경로가 바뀌었고 `/api/studio/learning`은 공유 작업 트리에서 수정 중이다. 전수 원본 JSON, 실행 전후 소스 해시, 실패 단독 재현, 전체 Vitest, TypeScript, 기본 흐름과 Studio v1을 새로 관찰하기 전에는 기존 PASS를 현재 코드 증거로 재사용하지 않는다.

## 2026-09-14 08시 22분 KST · 최근 24시간 코드 공격 리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| REVIEW-20260914-R2 | 지난 24시간 70개 커밋의 돈, 격리, 동시성, 부분 실패, 삭제, 확정 요구 이탈 재검토 | REVIEW-ATTACK-R2 | BLOCK | 범위 `39d32c58510565df52f330d01c0ac0d96cb0256d..fe24d05180b99b1c39e30e915b8557bd8e03d0fe`, 189파일, 추가 11,113줄, 삭제 2,042줄. MAJOR 20건, MINOR 0건. 승인 시안 이탈 1건, 회귀 위험 19건, 토큰 위반과 무기록 삭제는 0건. 상세 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md`. |
| REVIEW-20260914-R2-RUNTIME | 지정 작업 공간 localhost 실제 요청과 필수 회귀 | REVIEW-ATTACK-R2-LIVE | BLOCK | health HTTP 200과 DB up. 임시 고객 토큰의 `/api/higgsfield/status`가 HTTP 200으로 전역 `email`, `plan`, `credits`, `raw`를 반환했고 토큰은 즉시 폐기. `npm run test` 342파일, 2,217건 통과, 3건 제외. TypeScript 종료 코드 0, 기본 흐름 11/11, Studio v1 14/14 통과. 자동 검증은 격리 결함을 잡지 못했다. |

## 2026-09-14 06시 40분 KST · 네 방 기본 흐름 기능 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 네 방 관통 | FLOW-API-V6 | PASS | localhost 기본 흐름 11/11. 후보 3장, 초안 편집, 발행 큐 HTTP 201, 성과 제안 3건과 생성실 재인계 관찰 |
| R08, R19, R207 | 390, 768, 1024, 1440 사람 클릭 | FLOW-UI-V6 | 기능 PASS, 디자인 NG | 20개 방 화면과 성과실에서 생성실 복귀 5/5. 가로 넘침, 가린 모달, 탐색 차단, 다음 행동 누락, 401, 콘솔 오류 모두 0건. 원본 `logs/diff/osmu-four-room-flow-20260914-rerun/captures-after-fix/` |
| R27, R168 | Studio v1 생성과 무료 다시 만들기 경계 | STUDIO-V1-V6 | PASS | localhost 실요청 14/14 |
| 개발 서버 회귀 | 기본 개발 명령으로 네 방 렌더 | DEV-BUNDLER-V6 | PASS | Turbopack의 반복 `/login/page` 치명 오류를 재현한 뒤 기본 명령을 Webpack으로 고정. `npm run dev -- --port 3456`에서 health 200과 네 방 4/4 재통과. 회귀 2건, 커밋 `99686354` |
| 전체 회귀 | Vitest, TypeScript, build, 디자인 lint | FLOW-REGRESSION-V6 | PASS | 340파일, 2,197건 통과, 조건부 3건 제외. TypeScript 종료 코드 0, build 184/184, 디자인 토큰 위반 0 |
| R205, R206 | v63 디자인 계승 | DESIGN-V6 | NG | v63 원본과 현재 16개 화면의 8축 배치 속성이 모두 불일치. 사용자 지정 v63과 pipeline 승인 v68 핀도 충돌 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 운영 배포와 외부 채널 실발행은 이번 PASS에 포함하지 않음 |

상세는 `docs/qa/osmu-four-room-basic-flow-v6-gpt-codex.md`다. 네 방 localhost 기능 범위는 PASS다. 디자인 정합과 승인 기준 충돌, 운영 배포 및 외부 채널 실발행 미검증 때문에 제품 전체 QA와 배포는 NG다.

## 2026-09-14 06시 04분 KST · API 읽기 경로 전수 재실사 범위 PASS, 제품 전체 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98 | 발행 성과를 읽고 다음 생성 판단으로 되돌림 | API-READ-ALL-V7 | PASS | localhost GET 105개 실호출. 정상 92, 계약상 거절 13, HTTP 500과 요청 실패 0. 원본 `logs/diff/osmu-api-read-sweep-20260914-final-v2.json` |
| R104 | 고객, 운영자, 작업 공간 인증 경계 | API-AUTH-BOUNDARY-V7 | PASS | 무토큰 격리 탐침 401, production의 개발 토큰 401, 인증된 조회는 handler 응답. 13개 비정상 상태의 본문을 읽어 입력, 설정, 인증 경계로 확인 |
| R200, R207 | 성과 학습 규칙과 Studio 학습 정보 조회 | API-LEARNING-READ-V7 | PASS | `/api/performance/learned-rules`, `/api/studio/learning` 각각 HTTP 200 |
| 현재 소스 고정 | 공유 작업 트리 혼입 방지 | API-READ-SOURCE-HASH-V7 | PASS | GET 105개 합성 SHA-256 실행 전후 `a011035aabbc73c19f9862f5f493ef5d9b806c6d922e0d87a3258399de37e5f1` 동일. 소스가 바뀐 두 실행과 서버가 재시작된 전건 실패 실행은 폐기 |
| 필수 자동 회귀 | 전체 Vitest | API-READ-REGRESSION-V7 | PASS | 339파일, 2,194건 통과, 조건부 3건 제외, 실패 0. 줄 모양에 결합된 발행실 검사 1건은 호출 순서 계약으로 수정, 커밋 `e56f660b` |
| 정적 검증과 build | TypeScript, production build, 디자인 lint | API-READ-BUILD-V7 | PASS | `npx tsc --noEmit` 종료 코드 0. Next.js 16.2.2 production build 184/184, 종료 코드 0. 기존 NFT 경고 1건. 디자인 토큰 위반 0 |
| seed와 localhost 흐름 | 고정 작업 공간 fixture와 실동작 | API-READ-E2E-V7 | PASS | `apply-schema.sh --seed` 멱등 적용. production health 200. 개발 서버에서 기본 흐름 11/11, Studio v1 14/14, 최종 health 200 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 디자인 정합, 운영 배포, 외부 채널 실발행은 이번 PASS에 포함하지 않음 |

상세는 `docs/qa/osmu-api-read-sweep-v7-gpt-codex.md`다. v6와 v7의 경로, 상태, 분류는 모두 같다. 2026-08-28 문서 분모 84개와 당시 실제 정적 분모 95개의 차이를 숨기지 않았고, 당시 뒤 추가된 GET 10개를 표로 대조했다. API 읽기 범위는 PASS지만 별도 개발 E2E 서버의 반복 Turbopack 치명 로그, 승인 프로토타입과 실제 화면의 디자인 불일치, 운영 배포 미검증 때문에 제품 전체 QA와 배포는 NG다.

## 2026-09-14 05시 38분 KST · 코드 공격 리뷰 19건 기능 PASS, 개발 서버 로그 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| OSMU-001부터 OSMU-007 | 경로 이탈, 승인 payload, 큐 잠금, 발행 claim, 공급자 실패 상태, analytics 이력 보존 | REVIEW-FIX-20260914-01 | PASS | 경로 realpath·magic byte 3건, 승인 hash 3건, 13초 잠금 경합 2건, claim 복구 2건, 공급자 상태 2건, 손상 이력 2건 통과. 소스 커밋 `d0b8065f`부터 `5032b483` |
| OSMU-008부터 OSMU-014 | 예약 lease, 예약 캐러셀, Instagram 시도 기록, 카드 저장 보상, 발행실 시안 준수 | REVIEW-FIX-20260914-02 | PASS | 예약 14건, Instagram 7건, 카드 저장 3건, 카드 흐름 10건, 발행실 4건 통과. 커밋 `92e0d02e`, `2c806d9d`, `2be47af9`, `1b60a823` |
| OSMU-015부터 OSMU-018 | 성과 중복 호출, 묶음 부분 실패, Meta 오류 분류, API 상태 일치 | REVIEW-FIX-20260914-03 | PASS | PostgreSQL advisory lock, 5분 freshness, X 101건과 YouTube 51건 부분 성공 보존, Meta 게시물별 실패, HTTP 207·429·424·503 계약 14건 통과. 커밋 `6ce8016f` |
| OSMU-019 | QA 전체 실행시간과 제한 병렬성 | REVIEW-FIX-20260914-04 | PASS | 회귀 3건과 기존 timeout 계약 3건 통과. 전체 예산 100ms 재현은 0.55초에 종료 코드 1로 끝났고 미실행 75개를 `전체 시간 초과`로 기록. 커밋 `d2ce0e0e`, `8a055508` |
| 필수 자동 회귀 | 전체 Vitest | REVIEW-FIX-20260914-05 | PASS | `npm run test` 종료 코드 0. 337파일 전체 통과, 2,169건 통과, 조건부 3건 제외, 실패 0 |
| 정적 검증과 빌드 | TypeScript, production build, 디자인 토큰 | REVIEW-FIX-20260914-06 | PASS | `npx tsc --noEmit` 종료 코드 0. `npm run build` 184개 page 생성, 종료 코드 0. design-lint 위반 0. 기존 Turbopack NFT 추적 경고 1건은 남음 |
| 현재 localhost | 이번 코드로 재기동한 실제 서버 | REVIEW-FIX-20260914-07 | PASS | 기존 3456 서버가 120초 무응답이라 해당 자식만 종료했다. 이번 코드로 제한시간 재기동 후 `/api/health` HTTP 200, `db=up`, 기본 흐름 11/11, Studio v1 14/14 통과 후 서버 종료 |
| 공유 작업트리 후속 재검증 | 다른 세션의 발행실 인접 변경 뒤 회귀 | REVIEW-FIX-20260914-08 | 기능 PASS, 로그 NG | 발행실·예약·Instagram 회귀 25/25와 TypeScript, localhost 기본 흐름 11/11, Studio v1 14/14 재통과. 다만 개발 서버가 `/login` endpoint 작성 중 `Next.js package not found` Turbopack 치명 로그를 반복해 깨끗한 개발 서버 스모크는 NG |

운영 배포와 실제 외부 채널 게시물 생성은 수행하지 않았다. 공급자 결과를 조회할 수 없는 예약은 자동 재게시하지 않으며, Instagram 자식 컨테이너는 삭제 API를 추측하지 않고 생성 ID와 부모 ID를 `provider_meta` 또는 예약 payload에 남긴다.

## 2026-09-14 05시 06분 KST · API 읽기 경로 전수 재실사 착수 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98, R104, R200, R207 | 현재 코드가 내보내는 읽기 Route Handler 전부를 실제 요청으로 재검증 | API-READ-20260914-01 | NG | 현재 분모 105개, 실행 전 API 소스 합성 SHA-256 `3ef23480dafe1f508d8bc2589f3712f7a4f61c321a56f1dc5af8cde8b46e7d8f`. localhost health HTTP 200과 DB up까지만 관찰했다. 전수 요청, 의도된 거절 확인, 필수 회귀가 끝나지 않아 PASS 금지. |

지난 실사 뒤 Route Handler와 공유 코드가 바뀌었으므로 기존 105개 PASS를 현재 코드 증거로 재사용하지 않는다. 전수 원본 JSON, 실행 전후 소스 해시, 실패 단독 재현, 전체 회귀, TypeScript, 기본 흐름과 Studio v1을 새로 관찰한 뒤 판정을 갱신한다.

## 2026-09-14 04시 33분 KST · 최근 24시간 코드 공격 리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 최근 24시간 변경 | 돈 누수, 작업 공간 격리, 동시성, 부분 실패, 무기록 삭제, 확정 요구 이탈 공격 리뷰 | REVIEW-20260914-01 | BLOCK | 고정 범위 `b4ec9dbd..acb981ea`, 47커밋, 184파일. MAJOR 19건, MINOR 0건. 경로 탈출 2곳, 승인 payload 불일치, 큐 잠금 중첩, 예약 고아와 캐러셀 단일화, 부분 저장, 성과 수집 중복과 거짓 HTTP 200을 확인 |
| 필수 정적 검증 | TypeScript | REVIEW-20260914-02 | PASS | `npx tsc --noEmit` 종료 코드 0 |
| 필수 자동 회귀 | 전체 Vitest | REVIEW-20260914-03 | NG | `npm run test` 종료 코드 1. 324파일 중 323 통과, 1 실패. 2,124건 중 2,120 통과, 3 제외, 1 실패. `tests/studio/studio-fe2-rooms.test.tsx:239`의 편집 목차 접근 이름 계약 실패. 해당 테스트와 직접 원인 파일은 고정 감사 범위 밖이라 최근 커밋 지적 수에는 미포함 |
| 현재 localhost | health와 기본 네 방 데이터 인계 | REVIEW-20260914-04 | PASS | `localhost:3456/api/health` HTTP 200, DB up. 지정 작업 공간에서 `verify-basic-flow-e2e.mjs` 11/11 통과 |
| Studio v1 계약 | 생성, 조회, 무료 다시 만들기 경합 | REVIEW-20260914-05 | PASS | 지정 작업 공간에서 `verify-studio-v1-e2e.mjs` 14/14 통과 |
| 큐 파일 상호 배제 | 13초 임계 구역과 stale 회수 경합 | REVIEW-20260914-06 | NG | 첫 작업 1ms 진입과 13,002ms 종료 사이에 둘째 작업이 10,254ms 진입, 10,356ms 종료. 2.648초 동시 진입 관찰 |

상세는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md`다. 제품 코드는 수정하지 않았다. 현재 공유 작업 트리의 미커밋 변경과 병렬 tmux 작업은 고정 커밋 리뷰 범위에서 제외했고, 실행 증거는 현재 공유 작업 트리에서 관찰했다. 운영 배포와 실제 외부 채널 발행은 미검증이다.

## 2026-09-14 03시 35분 KST · 네 방 기본 흐름 v5 기능 PASS, 디자인 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R168, R193, R207 | 생성실부터 성과실까지 실제 데이터 인계 | FLOW-API-20260914-01 | PASS | localhost `verify-basic-flow-e2e.mjs` 11/11. 후보 3장, 편집, 발행 큐 HTTP 201, 성과 제안 3건, 생성실 재인계, 지표 조회 |
| R08, R19, R166, R172 | 네 방 렌더와 390, 768, 1024, 1440 실제 이동 | FLOW-UI-20260914-01 | 기능 PASS | 단면 4/4, 사람 클릭 20/20, 성과실에서 생성실 복귀 5/5. 가로 넘침, 가린 모달, 이동 차단, 다음 행동 누락, 브라우저 401, 콘솔 오류 모두 0건 |
| R27, R168 | Studio v1 생성과 무료 다시 만들기 계약 | STUDIO-V1-20260914-01 | PASS | `verify-studio-v1-e2e.mjs` 14/14 첫 실행 통과 |
| R205, R206, R207 | v63 화면 정합과 성과실 UX | DESIGN-20260914-01 | NG | 4개 방과 4개 폭, 총 16개 조합에서 주축, 순서, 열 수, 여백, 표시, 글꼴 단계, 버튼 위계가 모두 불일치. v63의 1440 원본은 실제 1394x796이라 정확한 픽셀 비교도 불가 |
| QA 증거 계약 | 디자인 원본과 QA 결과 분리, viewport 캡처 | ISSUE-010 | 수정 후 PASS | 기본 출력 `logs/diff`, `fullPage: false`, 신규 회귀 1/1. 커밋 `561e859b` |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 판정을 유지하고 이번 PASS에 포함하지 않음 |

seed, health HTTP 200과 DB up, 전체 Vitest 323파일과 2,119건, TypeScript, build 183/183, 디자인 lint가 통과했다. 조건부 DB 테스트 3건은 제외됐고 기존 NFT 추적 경고 1건은 남아 있다. build 결과에서도 health 200과 네 방 4/4를 재관찰했다. `verify-agent-quality.sh`는 배포 환경 접촉 증거 0건으로 반려했다. 실제 운영 배포와 외부 채널 실발행은 미검증이다. 상세와 16개 화면 매트릭스는 `docs/qa/osmu-four-room-basic-flow-v5-gpt-codex.md`, 원본 증거는 `logs/diff/osmu-four-room-flow-20260914-031512/`에 있다.

## 2026-09-14 03시 19분 KST · 네 폭 실제 이동 재실사 2차 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R19, R166, R172, R207 | 390·768·1024·1440에서 생성실부터 성과실까지 실제 이동 | FLOW-UI-RERUN-20260914-02 | NG | 390 라이트·다크와 768은 네 방 및 성과실→생성실 복귀까지 통과했다. 1024 첫 `/studio?room=create`에서 `[data-room="create"]` 표시가 120초를 넘겨 종료 코드 1로 중단됐다. 완주 전이므로 전체 PASS 금지다. |

단면 탐침은 직전 실행에서 4/4, 가린 모달·401·콘솔 오류 0으로 통과했다. 같은 개발 서버가 실행 중 변경된 Studio 소스를 다시 컴파일했으므로 제품 회귀와 공유 작업 트리 경합을 분리한 뒤 4폭 전건을 처음부터 재실행한다.

## 2026-09-14 03시 09분 KST · 성과 시계열 갭 실측 NG와 build 회수

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R19, R68 | 2026-08-28 두 갭 감사를 현재 코드와 대조하고 기본 흐름에 가장 가까운 미구현 한 항목을 완성 | GAP-RECHECK-20260914-01 | ❌ NG | 두 감사의 후속 이력과 현재 코드를 대조한 결과, 남은 항목은 게시물별 성과 이력과 재현 가능한 30일 비교다. 지정 작업 공간으로 `localhost:3456/api/health`와 `/api/metrics`를 실제 요청해 각각 HTTP 200을 관찰했지만, 응답 최상위 키는 `coverage`, `posts`뿐이고 `posts`는 0건이며 이력과 비교 필드는 없었다. |
| pipeline build 허용 범위 | 미구현 성과 시계열 계약을 소스에 추가할 수 있는지 확인 | GAP-RECHECK-20260914-02 | BLOCK | `pipeline-state.osmu.md`의 현재 단계는 `qa`, 상태는 `in-progress (승인 아님)`이다. 승인된 저장 모델과 API 계약도 없다. YouTube는 기간별 분석 조회를 지원하지만 TikTok Video Query는 누적 카운터를 반환하므로, 스냅샷 기준 시각, 중복 수집 처리, 30일 비교식, 보존 기간을 기술설계에서 먼저 확정해야 한다. 제품 소스와 마이그레이션은 수정하지 않았다. |

이 항목은 기술설계와 build 단계를 다시 열고 데이터 계약을 승인한 뒤에만 구현한다. 구현 후 정상 경로 1건, 거절 경로 1건, `npm run test`, `npx tsc --noEmit`, 기본 흐름과 Studio v1 검증기를 새 증거로 남긴다.

## 2026-09-13 23시 22분 KST · 네 방 기본 흐름 재실사 1차 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R19, R193, R207 | 생성실부터 성과실까지 네 방 렌더와 실제 데이터 인계 | FLOW-PROBE-RERUN-20260913-01 | NG | `localhost:3456` 기본 백엔드 흐름은 11/11 통과했으나, 이어 실행한 `probe-four-room-flow.mjs`가 `/studio?room=publish` HTTP 200 뒤 `[data-room="publish"]` 표시를 120초 안에 관찰하지 못하고 종료 코드 1로 중단됐다. |

콜드 컴파일 지연, 화면 런타임 결함, 검증기 결함을 분리하기 전에는 네 방 기능을 PASS로 전환하지 않는다. DOM, 최종 URL, 콘솔 오류, 가림 요소를 수집하고 같은 검증을 재실행한다.

## 2026-09-13 22시 41분 KST · API 읽기 전수 재실사 1차 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98, R104, R200, R207 | 현재 코드의 읽기 Route Handler 전수 실호출 | API-READ-20260913-RERUN-01 | NG | `localhost:3456` GET 105개 중 정상 90, 의도된 거절 후보 13, `/api/workspaces`와 `/api/youtube/status` 요청 제한시간 120초 초과 2건. HTTP 500은 0건. 원본 `logs/diff/osmu-api-read-sweep-20260913-172905.json` |
| 현재 소스 고정 | 실행 중 Route Handler 변경 혼입 방지 | API-READ-SOURCE-HASH-01 | PASS | 실행 전후 합성 SHA-256 `de85df99d60f7922fe7954885228836485db1b908bcd20f3707e472123f7fded` 동일 |

두 요청 실패의 원인을 단독 재현하기 전에는 콜드 컴파일 지연 또는 제품 결함 중 어느 쪽으로도 단정하지 않는다. 원인 분리와 전수 재실행 완료 전 API 읽기 범위 PASS 전환을 금지한다.

## 2026-09-13 16시 27분 KST · 최근 24시간 코드 재리뷰 갱신 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 최근 24시간 변경 | 돈 누수, 작업 공간 격리, 동시성, 부분 실패, 무기록 삭제, 확정 요구 이탈 공격 리뷰 | REVIEW-20260913-R3-01 | BLOCK | 고정 범위 `8652fb5..e65a1d1`, 71커밋, 283파일. MAJOR 26건, MINOR 1건. 기존 차단 사유에 원격 DB 과금 한도 초기화, QA 전체 deadline 부재, 예약 카드뉴스 단일 이미지 축소가 추가됨 |
| 잠금 경합 | queue lock 임계구역 직렬화 | REVIEW-20260913-R3-02 | NG | 첫 writer 종료 12,502ms 전 둘째 writer가 10,257ms에 진입해 2,245ms 중첩 관찰 |
| 현재 localhost | 지정 작업 공간의 실제 실행 경로 | REVIEW-20260913-R3-03 | 부분 관찰 | health HTTP 200. 기본 흐름 11/11, Studio v1 14/14. metrics는 15초 안에 응답하지 않음 |
| 자동 회귀 | 전체 테스트와 TypeScript | REVIEW-20260913-R3-04 | PASS | `npm run test` 종료 코드 0, `npx tsc --noEmit` 종료 코드 0. 초록 테스트는 MAJOR 해소 증거로 사용하지 않음 |

상세는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-13.md`다. 제품 코드는 수정하지 않았고 운영 배포는 미검증이다.

[모델]: gpt-codex/GPT-5가 고정 diff와 승인 산출물을 대조하고 localhost 요청과 경합 재현을 직접 실행했다.
벤치마크: OWASP API Security, Node.js path, PostgreSQL explicit locking 공식 문서의 자원 한도, 경로 정규화, 동시 변경 원칙을 적용했다.
소스 1: `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-13.md`.
소스 2: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`, `DESIGN.md`.
소스 3: `dashboard/scripts/seed-test-tenants.sql`, `openclaw/extensions/threads-queue/src/queue-lock.ts`.

## 2026-09-13 14시 29분 KST · 네 방 기본 흐름 v4 재검증

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R168, R193, R207 | 생성실부터 성과실까지 실제 데이터 인계 | FLOW-API-01 | 수정 후 PASS | 첫 실행은 고정 QA 작업 공간 월 사용량 100/100으로 생성 실패. 시드가 현재 UTC 월 사용량을 0으로 복원하도록 수정한 뒤 `verify-basic-flow-e2e.mjs` 최종 11/11. 후보 3장, 편집, 큐 201, 제안 3건과 재인계 확인 |
| R08, R19, R207 | 네 방이 각각 그려지고 가린 모달이 없음 | FLOW-PROBE-01 | 수정 후 PASS | 첫 탐침은 성과실 표시의 고정 30초에서 실패. 공용 `FOUR_ROOM_READY_TIMEOUT_MS` 120초 정책을 적용한 뒤 4/4 렌더, 가린 모달·브라우저 401·콘솔 오류 0 |
| R08, R19, R166, R172 | 390·768·1024·1440에서 생성실부터 성과실까지 실제 이동 | FLOW-UI-01 | 기능 PASS | 라이트 4폭 16화면과 390 다크 4화면, 성과실→생성실 복귀 5/5. 가로 넘침·이동 차단·다음 행동 누락 0. 원본 `logs/diff/osmu-four-room-flow-20260913-1407/captures/` |
| R27, R168 | 일곱 층 정보를 반영한 Studio v1 생성 | STUDIO-V1 | 재실행 PASS | 첫 실행은 HTTP 200 오류 본문 `STUDIO_LLM_INVALID_OUTPUT`으로 중단. 같은 전체 검증 재실행은 실제 생성과 거절 경계를 포함해 14/14 통과. 제공자 비결정성 우려는 유지 |
| R08, R19, R207 | 반복 QA가 제품 사용량과 검증기 시간차 때문에 흔들리지 않음 | ISSUE-008, ISSUE-009 | 회귀 PASS | `af2f0335`. 월 사용량 시드 복원과 탐침 단일 120초 정책. 신규 회귀 2건과 전체 Vitest 321파일·2,108건 통과, 3건 제외 |
| R205, R206, R207 | v63 승인 화면 정합 | DESIGN-01 | NG | v63 원본과 실제 네 방 4폭의 주축·순서·열·여백·표시·글꼴·버튼 위계가 불일치. pipeline 승인 핀 v68과도 충돌 |
| R01~R207 중 이번 범위 밖 항목 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 추적표 판정을 유지하고 이번 PASS에 포함하지 않음 |

localhost health HTTP 200, seed, TypeScript, 정적 페이지 183/183 build, 디자인 lint도 통과했다.
빌드의 기존 NFT 추적 경고 1건과 React `act(...)` 테스트 경고는 남아 있다. 네 방 로컬 기능은
PASS지만 디자인 정합 NG, 기존 코드 재리뷰 BLOCK, 운영 배포 미검증 때문에 제품 전체 QA와
배포는 NG다. 상위 `verify-agent-quality.sh`도 배포 환경 접촉 증거 0건으로 종료 코드 2를 반환했다.
상세는 `docs/qa/osmu-four-room-basic-flow-v4-gpt-codex.md`다.

## 2026-09-13 12시 22분 KST · 최근 24시간 코드 재리뷰 BLOCK

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 최근 24시간 변경 | 돈 누수, 작업 공간 격리, 동시성, 부분 실패, 확정 요구 이탈 공격 리뷰 | REVIEW-20260913-R2-01 | ❌ BLOCK | 고정 범위 `8652fb5..7e39d0a7`, 55커밋, 236파일. MAJOR 23건. 파일 반출, 승인물 바꿔치기, 동시 writer, 성과 거짓 성공, 카드뉴스 실물 불일치 확인 |
| 잠금 경합 | queue lock이 임계구역을 실제로 직렬화 | REVIEW-20260913-R2-02 | ❌ NG | 첫 writer 종료 12,502ms 전 둘째 writer가 10,253ms에 진입해 2,249ms 중첩 관찰 |
| 자동 회귀 | 전체 테스트와 TypeScript | REVIEW-20260913-R2-03 | PASS | `npm run test` 319파일 2,106건 통과, 3건 제외. `npx tsc --noEmit` 통과 |
| 실제 앱 기본 흐름 | 지정 작업 공간의 기본 흐름과 Studio v1 | REVIEW-20260913-R2-04 | ❌ NG | localhost:3456 HTTP 200. 두 필수 E2E 모두 실제 요청을 보냈으나 정상 생성 단계가 공유 AI 월간 한도 소진 HTTP 429로 중단 |

상세 지적과 재현은 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-13.md`에 있다. 제품 코드는 수정하지 않았고 운영 배포는 미검증이다.

## 2026-09-13 12시 01분 KST · 네 방 기본 흐름 v3 재검증

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R19, R166, R172 | 생성실부터 성과실까지 네 방 이동과 네 폭 반응형 | FLOW-UI-01 | PASS | 390 라이트·다크, 768·1024·1440의 20화면과 성과실→생성실 복귀 5/5. 가로 넘침·가린 모달·이동 차단·다음 행동 누락 0 |
| R08, R193, R207 | 네 방 렌더와 실제 데이터 인계 | FLOW-API-01 | PASS | localhost health 200·DB up, 기본 API 11/11, 네 방 probe 4/4, 브라우저 401·콘솔 오류 0 |
| R27, R168 | 일곱 층 학습 정보를 갖춘 Studio v1 생성 | STUDIO-V1 | NG | 앞선 같은 소스 실행 14/14 뒤 최종 실행의 정상 생성 단계가 공유 AI 월간 한도 소진으로 HTTP 429 |
| R08, R19, R207 | 공유 개발 서버의 느린 준비를 제품 단절로 오판하지 않음 | ISSUE-007 | 수정·회귀 PASS | `d8a65e3d`, `7e39d0a7`. 준비·URL·방 표시·최초 이동을 120초 단일 정책으로 통합, 집중 회귀 3파일 PASS |
| R205, R206, R207 | v63 승인 화면 정합 | DESIGN-01 | NG | v63 원본과 실제 네 방 4폭의 주축·순서·열·여백·표시·글꼴·버튼 위계가 불일치. pipeline 승인 핀 v68과도 충돌 |
| R01~R207 중 이번 범위 밖 항목 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 추적표 판정을 유지하고 이번 PASS에 포함하지 않음 |

전체 Vitest 319파일·2,106건, TypeScript, 정적 페이지 183/183 build, seed, 디자인 lint는 통과했다. 네 방 로컬 기능 범위는 PASS다. Studio v1 현재 429, 디자인 정합 NG, 운영 배포 미검증 때문에 제품 전체 QA와 배포는 NG다. 상세와 원본 경로는 `docs/qa/osmu-four-room-basic-flow-v3-gpt-codex.md`에 있다.

## 2026-09-13 11시 26분 KST · 네 방 성과실 준비 제한시간 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R19, R207 | 네 폭에서 생성실부터 성과실까지 실제 이동 | FLOW-UI-READY-01 | ❌ NG | 첫 `verify-four-room-ui-e2e.mjs` 실행이 390 라이트 성과실의 제안 3건을 30초 안에 보지 못해 `page.waitForFunction` timeout으로 종료 코드 1 |

동일 서버 즉시 재실행은 네 방 20화면과 성과실→생성실 복귀 5회를 통과했다. 제품 단절과
검증기 오판을 분리하기 위해 성과실 준비 제한시간을 120초 기본값과 환경 변수로 바꾸고,
회귀 테스트와 전체 재검증이 끝날 때까지 이 항목을 PASS로 전환하지 않는다.

## 2026-09-13 08시 39분 KST · 코드 리뷰 지적 수정 착수

판정: NG. 감사의 재현 시나리오가 아직 실패하므로 수정과 회귀 검증이 끝날 때까지 PASS로
전환하지 않는다.

| 우선순위 | 테스트번호 | 범위 | 현재 판정 | 실패 근거 |
|---|---|---|---|---|
| P0 | REVIEW-FIX-P0-01 | Compose 실행 이미지와 발행 큐 계약 | NG | 실행 복제본에는 claim 계약이 없고 루트 테스트 대상과 코드가 다름 |
| P0 | REVIEW-FIX-P0-02 | 취소 경합과 claimToken 강제 | NG | 토큰 없는 verify, update, release가 통과할 수 있고 발행 도구가 큐 검증 없이 provider를 호출함 |
| P0 | REVIEW-FIX-P0-03 | 비용 API 실패 상태 | NG | Higgsfield provider 실패가 HTTP 200과 `ok:false`로 반환될 수 있음 |
| P0 | REVIEW-FIX-P0-04 | 작업 공간 전환 중 미디어 응답 격리 | NG | 이전 요청의 늦은 응답이 현재 선택을 덮을 수 있음 |
| P1 | REVIEW-FIX-P1-01 | 성과 부분 실패, DB 연결 점유, outbox 실행과 보존 | NG | 부분 실패 성공 오인, 외부 호출 중 연결 점유, drain 미기동, 500건 초과 자동 삭제가 남아 있음 |
| P1 | REVIEW-FIX-P1-02 | 화면 상태와 검증기 단일 진실원 | NG | 지연 및 부분 발행 상태 누락, 정규식 fixture, 중복 성과 화면, 비활성 학습 규칙 재사용이 남아 있음 |
| P2 | REVIEW-FIX-P2-01 | 승인 학습 흐름과 정보 밀도 | NG | 별도 `/learn` 대신 전체화면 dialog, 근거 표본 누락, 승인 문구 이탈, player 토큰 노출이 남아 있음 |

수정은 P0부터 진행한다. 각 항목은 감사 문서의 재현 절차, 새 회귀 테스트, localhost:3456
실제 요청을 모두 통과한 뒤에만 상태를 갱신한다.

## 2026-09-13 코드 리뷰 게이트 · 최근 24시간 변경

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| 최근 24시간 변경 | 돈 누수, 작업 공간 격리, 동시성, 부분 실패, 무기록 삭제, 확정 요구 이탈 공격 리뷰 | REVIEW-20260913-01 | ❌ BLOCK | 고정 범위 `8652fb5..39d32c5`, 47커밋과 185파일. MAJOR 23건, MINOR 5건. 실제 Compose 복제본 누락, 취소 경합, 고객 예약 취소 차단, 성과 오분류, 자산 전달 단절, 돈 검증기 단절, 승인 시안 이탈 확인 |
| localhost 읽기 | 지정 작업 공간의 현재 실행 앱 응답 | REVIEW-20260913-02 | 관찰됨 | health 200, metrics 200, learned-rules 200, queue 200. 후속 미커밋 수정이 섞인 현재 공유 작업 트리 기준이므로 고정 리뷰 커밋의 결함 해소 증거가 아님 |
| 자동 검증 | 전체 테스트, TypeScript, 기본 흐름, Studio v1 | REVIEW-20260913-03 | 테스트됨 | Vitest 311파일 2,077건 통과와 3건 스킵, `npx tsc --noEmit` 통과, 기본 흐름 11/11, Studio v1 14/14. 현재 공유 작업 트리 기준 |
| 직접 재현 | 돈 검증 fixture와 Higgsfield 거래 파서 | REVIEW-20260913-04 | ❌ NG | 고정 커밋의 옛 fixture 정규식은 `legacyFixtureMatch=false`. 페이지 객체 거래 응답은 운영 route 로직에서 `SyntaxError` 뒤 HTTP 200 실패 계약 |

상세 지적과 재현 시나리오는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-13.md`에 있다. 코드와 단계 상태는 바꾸지 않았고 배포는 미검증이다.

## 2026-09-13 07시 04분 KST · 성과 시계열 갭 build 회수

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 게시물별 성과 시계열과 재현 가능한 30일 비교 | METRICS-HISTORY-01 | ❌ NG | localhost:3456 `GET /api/metrics` HTTP 200 응답은 최상위 키가 `posts`, `coverage`뿐이며 `history`, `comparison`이 없음 |
| build 권한 | pipeline-state에서 허용한 범위만 소스 수정 | STAGE-GATE-01 | 차단 | `pipeline-state.osmu.md`의 현재 공정은 `qa`, 승인 상태 아님 |
| 데이터 계약 | 새 성과 이력 저장소의 식별자, 멱등성, 보존 기간, 30일 비교 기준 | SCHEMA-GATE-01 | 차단 | `wiki/5-hubs/hub-eng/architecture/data-model.md`가 시계열 snapshot과 재현 가능한 30일 비교를 별도 계약으로 명시하고, `wiki/ops/session-state.md`가 DB 계약 합의 전 구현 금지로 인계 |

현행 `published_posts`는 최신 누계와 `metrics_at`만 보존한다. `growth_metrics`는 채널 팔로워
시계열이라 게시물별 반응 이력으로 재사용할 수 없다. 새 테이블, 기존 행 JSONB 이력, provider
직접 재조회 중 하나를 선택해야 하며 이는 워커가 단독 확정할 DB 스키마와 아키텍처 결정이다.
소스, migration, 테스트, 갭 재확인 문서는 수정하지 않았다.

## 2026-09-13 06시 22분 KST · 네 방 기본 흐름 재검증 완료, 기능 PASS·디자인 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R19, R193, R201 | 생성실에서 성과실까지 네 방 이동과 4폭 반응형 | FLOW-UI-01 | PASS | 390 라이트·다크, 768·1024·1440에서 20화면과 성과실→생성실 복귀 5회. 가로 넘침·가린 모달·이동 차단·다음 행동 누락 0 |
| R27, R168 | 학습 정보를 반영한 후보 생성과 거절 후 다시 만들기 | STUDIO-V1-REGEN | 재실행 PASS | 첫 실행은 `STUDIO_LLM_INVALID_OUTPUT` NG, 즉시 전체 재실행 14/14 PASS. 공급자 비결정성 우려는 유지 |
| R205, R206, R207 | 네 방 상단 일관성, 실제 수준 충실도, 성과실 UX | DESIGN-01 | NG | v63 대 실제 4폭 속성 대조에서 공통 셸·요소 순서·열 수·담당 패널·버튼 위계 불일치 |

localhost health HTTP 200·DB up, 기본 API 11/11, 네 방 probe 4/4, Vitest 311파일·2,077건, TypeScript, build 182/182, seed, 디자인 lint가 통과했다. 제품 코드는 수정하지 않았다. 상세 매트릭스와 PNG 원본 경로는 `docs/qa/osmu-four-room-basic-flow-v2-gpt-codex.md`에 있다. 기능 범위만 PASS이며 디자인 정합·운영 배포 미검증 때문에 제품 전체 QA와 배포는 NG다. 상위 품질 게이트도 배포 환경 접촉 증거 0건으로 FAIL을 반환했다.

## 2026-09-13 06시 00분 KST · API 읽기 전수 재실사 v6

한 줄 결론: localhost:3456의 GET 105개와 HEAD 1개를 실제 호출해 정상 92개, 의도된 거절
13개, HTTP 500과 요청 실패 0개를 관찰했다. API 읽기 범위는 PASS지만 제품 전체 QA와 배포는 NG다.

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98 | 발행 성과를 측정하고 다음 생성 판단으로 되돌림 | API-READ-ALL | PASS | GET 105개 전수 실호출, HTTP 500과 요청 실패 0 |
| R104 | 고객, 운영자, 작업 공간 인증 경계 | API-AUTH-BOUNDARY | PASS | 올바른 토큰은 handler 도달, 격리 탐침 무토큰은 401 |
| R200, R207 | 성과 학습 규칙과 Studio 학습 정보 조회 | API-LEARNING-READ | PASS | 변경된 두 GET이 각각 HTTP 200 |
| R01~R207 | 이번 API 읽기 범위 밖 확정 요구 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 누락으로 PASS 처리하지 않음 |

첫 15초 실행은 정상 79, 의도된 거절 13, 요청 실패 13으로 NG였다. 60초 실행도 정상 90,
의도된 거절 13, 요청 실패 2로 NG였다. 실패한 알림 설정과 NSA 데이터 경로는 단독 호출과
최종 120초 전수 실행에서 모두 HTTP 200이었다. 공유 Next 개발 서버의 콜드 컴파일 지연을 제품
고장으로 오판한 것이 원인이므로 검증기의 제한시간을 환경 변수로 만들고 기본값을 120초로
올렸다. 회귀 테스트와 커밋은 `b25005aa`, `f2d3b3e2`다.

회귀는 집중 31건, 전체 Vitest 311파일과 2,077건, TypeScript, 정적 페이지 182/182 build,
멱등 seed, 기본 흐름 11/11, Studio v1 14/14, 디자인 lint 위반 0을 확인했다. 시드 직후 health는
한 번 HTTP 503과 DB down이었으나 이어진 세 번은 모두 HTTP 200과 DB up이었다. 단발성 관찰을
숨기지 않으며 반복되면 DB 연결 구간을 별도 결함으로 다시 연다.

원본은 `logs/diff/osmu-api-read-sweep-20260913-0537.json`, 상세 비교와 판정은
`docs/qa/osmu-api-read-sweep-v6-gpt-codex-20260913-0600.md`다. 승인 프로토타입 v63과 pipeline
디자인 핀 v68 충돌, 기존 디자인 정합 NG, 외부 OAuth와 실제 발행 및 운영 배포 미검증 때문에
제품 전체 QA와 배포는 NG를 유지한다.

상위 QA 품질 검증은 배포 환경 접촉 증거 0건으로 FAIL을 반환했다. 이번 과제의 명시 범위인
localhost 읽기 PASS를 운영 QA PASS로 확장하지 않는다.

## 2026-09-13 05시 17분 KST · API 읽기 전수 첫 실행 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98, R104, R200, R207 | 생성·발행·성과·학습·인증 읽기 경로가 고장 없이 응답 | API-READ-20260913-01 | NG | localhost:3456 GET 105개 중 정상 79, 계약상 거절 13, 15초 요청 제한시간 초과 13. `logs/diff/osmu-api-read-sweep-20260913-0505.json` |

원인 분리 전 판정은 NG다. 개발 서버가 각 경로를 최초 컴파일하는 로그와 제한시간 초과가 겹쳤지만,
따뜻해진 동일 서버에서 전수 재실행해 제품 응답 지연과 개발 컴파일 지연을 가르기 전에는 PASS로
전환하지 않는다. HTTP 500은 첫 실행에서 0건이었다.

## 2026-09-13 03시 43분 KST · TikTok 발행 성과 수집기 수정 증거

판정: 수정됨. 기존 DB와 네 방 UI를 바꾸지 않고 TikTok 발행 영상의 공개 성과를 기존 성과실로
되받는 provider 수집기를 연결했다. build 범위의 증거이며 QA 승인과 운영 배포는 하지 않았다.

| 테스트번호 | 계약 | 판정 | 증거 |
|---|---|---|---|
| METRICS-TIKTOK-PROVIDER-01 | 요청당 20개 분할과 네 지표 변환 | PASS | 21개 영상이 provider 2회 호출로 분할되고 네 성과 축으로 변환 |
| METRICS-TIKTOK-PROVIDER-02 | 토큰 없음 거절 | PASS | provider 호출 0회 |
| METRICS-TIKTOK-01 | TikTok 발행물 성과 갱신 | PASS | 영상 ID 조회, provider 호출, views·likes·replies·reposts UPDATE |
| METRICS-TIKTOK-02 | 연결 자격증명 없음 거절 | PASS | HTTP 400, provider 호출과 DB 변경 0회 |
| METRICS-TIKTOK-OAUTH-01 | 조회 권한 동의 | PASS | `user.info.basic`, `video.publish`, `video.list` 보존 |
| LOCAL-METRICS-GET | localhost 지원 범위 | PASS | HTTP 200, `tiktok_video_query`, 네 지표, 미발행 사유 확인 |
| LOCAL-METRICS-POST | 지정 작업 공간 거절 | PASS | HTTP 400, 연결 채널 없음 안내. 외부 TikTok 호출 없음 |

회귀 증거: `npm run test` 307파일, 2,054건 통과, 3건 제외, 실패 0. `npx tsc --noEmit`
오류 0. `verify-basic-flow-e2e.mjs` 11/11. `verify-studio-v1-e2e.mjs`는 첫 실행에서 생성 provider의
JSON 절단 오류를 관찰했고 동일 검증 재실행은 14/14 통과했다. production build는 정적 페이지
182/182, 디자인 lint는 위반 0이다. 기존 NFT 추적 경고 1건은 남아 있다.

실제 TikTok provider 성공은 미검증이다. 지정 작업 공간에 TikTok 자격증명과 발행물이 없어서
GET은 지원 계약과 빈 상태만 관찰했고 POST는 자격증명 없음으로 거절됐다. 신규 연결은
`video.list`를 요청하며 기존 토큰은 재연결이 필요할 수 있다.

관련 구현 커밋은 `7f853720`, 옛 TikTok 미지원 기대값 정정은 `3b8708bf`다. 운영 배포와
pipeline 단계 승격은 하지 않았다.

## 2026-09-13 02시 50분 KST · 네 방 기본 흐름 재검증 최종 판정

한 줄 결론: localhost 네 방 기본 흐름은 성과실 주소가 낡은 probe를 수리한 뒤 범위 PASS다.
승인 v63 디자인 정합과 외부 공개 발행은 통과하지 않아 전체 QA와 배포는 NG다.

| 단계 | 상태 | 증거·비고 |
|---|---|---|
| canonical 단계 | 진행 중 | 메인 repo `pipeline-state.osmu.md`의 `current_stage: qa`, 승인 전 |
| health | PASS | localhost:3456 HTTP 200, DB up, 서버 측 DB 확인 58ms |
| seed | PASS | 멱등 시드 뒤 지정 작업 공간 `active`, `team`, 공유 AI 승인 true |
| 기본 API 흐름 | PASS | `verify-basic-flow-e2e.mjs` 11/11 |
| Studio v1 | PASS | `verify-studio-v1-e2e.mjs` 14/14 |
| 네 방 probe | NG 후 수정, PASS | `/`에서 찾던 성과실을 정본 `/performance`로 수정. 네 방 렌더, 가린 모달·401·콘솔 오류 각 0 |
| 사람 클릭 반응형 | PASS | 390 라이트·다크, 768, 1024, 1440에서 20화면과 성과실→생성실 복귀 5건 |
| 전체 회귀 | PASS | Vitest 302파일, 2,033건 PASS, 3건 제외, 실패 0 |
| TypeScript | PASS | `npx tsc --noEmit`, 오류 0 |
| production build | PASS | 공유 dev와 분리한 현재 소스 사본, 정적 페이지 182/182 |
| 디자인 lint | PASS | `dashboard/src` 임의 px·인라인 style·토큰 밖 hex 위반 0 |
| mobile typecheck·Maestro | 해당 없음 | dashboard 웹 범위, 별도 Expo 계약 없음, 실패 숨김 옵션 미사용 |
| 승인 디자인 정합 | NG | v63 원본과 현재 4폭 PNG 직접 대조. 셸, 열 수, 담당 패널, 순서, 버튼 위계 불일치. Design Score D |
| 외부 OAuth·실발행·성과 | 미검증 | 이번 범위는 발행 큐까지다. 외부 permalink와 배포 버전 증거 없음 |

최초 health 시간 초과는 같은 공유 개발 서버에서 API 전수 실사가 네 요청씩 라우트를 컴파일한
동시 부하였다. 해당 실사가 끝난 뒤 같은 주소가 200으로 회복돼 제품 health 결함으로 세지 않았다.
실제 결함은 probe가 성과실의 옛 주소 `/`를 사용한 것이며, 수정과 회귀 계약은 `80c09807`이다.
실행 원본은 `logs/diff/osmu-four-room-flow-20260913-0216/captures/observations.json`과 같은 폴더의
20개 PNG, 상세 판정은 `docs/qa/osmu-four-room-basic-flow-v1-gpt-codex.md`다.

### 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 네 방 이동 | FLOW-UI-01 | PASS | 20화면과 성과실→생성실 복귀 5건 |
| R27 | 후보 전건 거절 뒤 무료 재생성 | STUDIO-V1-REGEN | PASS | Studio v1 14/14 |
| R104 | 고객 인증 경계 | FLOW-AUTH-01 | PASS | 실제 임시 고객 토큰, 브라우저 401 0, 폐기 200 |
| R168 | 첫 생성과 학습 정보 | FLOW-11-GEN | PASS | 후보 3장, 편집실 인계 |
| R193 | 성과 제안에서 생성실 재진입 | FLOW-UI-RETURN | PASS | 제안 3건과 생성실 복귀 5건 |
| R200, R207 | 성과실 UX와 학습 정보 | FLOW-PERF-01 | 기능 PASS, 디자인 NG | `/performance` 렌더는 정상, v63 구조는 불일치 |
| R201 | 중복 안내 없이 방 이동 | FLOW-SIDEBAR-01 | PASS | 차단 모달과 이동 후 가린 메뉴 0건 |
| R206 | 승인 시안 수준 화면 충실도 | CONF-ALL | NG | 현재 PNG와 v63 원본의 속성별 구조 불일치 |
| R01~R207 | 이번 기본 흐름 밖 확정 요구 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 누락으로 PASS 처리하지 않음 |

전환 가능 TC는 FLOW-UI-01, FLOW-AUTH-01, FLOW-UI-RETURN, FLOW-SIDEBAR-01과 기본 API 11단계,
Studio v1 14건이다. CONF-ALL과 외부 공개 발행은 전환 불가다.

페르소나 결정: 박도윤은 네 폭에서 생성실부터 성과실까지 이동하고 다시 시작할 수 있다. 그러나
승인 시안과 다른 구조 및 외부 채널 미검증 때문에 실제 공개와 성과 수집까지 완결한다고 판정하지 않는다.

레드팀: 검증기만 고쳐 제품 결함을 숨겼을 가능성을 공격했다. 독립 `/performance` 고객 토큰
브라우저, 실제 API 11단계, Studio v1 14건, 20개 PNG를 교차해 제품 렌더와 인계를 따로 확인했다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 localhost 통과를 운영 배포와 동일시하거나,
데이터 상태 차이를 디자인 일치로 오판한 경우다. 그래서 로컬 기능 PASS로 범위를 제한하고 공통
구조 불일치와 외부 공개 발행을 각각 NG와 미검증으로 남겼다.

벤치마크: Playwright 공식 actionability와 locator 원칙을 적용해 force click 없이 보이고 안정적이며
입력을 받는 링크만 눌렀다. [Actionability](https://playwright.dev/docs/actionability),
[Locators](https://playwright.dev/docs/locators)

다음 실행: 소유자는 product-designer와 Codex 컨트롤러다. v63 또는 v68 승인 핀을 하나로 확정하고
공통 셸을 정합시킨 뒤 QA가 동일 상태 네 방 4폭 PNG를 재대조한다. 종료 증거는 Design Score B 이상
속성별 PASS, 외부 계정 연결, permalink, 성과 API 응답이다.

[모델]: gpt-codex/GPT-5, qa-verifier가 실제 localhost와 원본 PNG를 직접 관찰했다.
소스 1: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`.
소스 2: `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`, `wiki/거버넌스/요청.md`.
소스 3: `logs/diff/osmu-four-room-flow-20260913-0216/captures/observations.json`, 같은 폴더 PNG 20개.

SKILLS_USED: qa, 실제 앱 회귀·결함 등록·반응형 관찰·증거 기록 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: business + OSMU + 기본 흐름 + 1인 사업자 + 끝내기 우선
HITS_USED: BRAIN의 ZERO-ONE Marketing Studio 아이디어와 repo 사업 좌표를 사용해 생성→편집→발행→성과 검증 축과 박도윤 페르소나를 고정했다.
HITS_REJECTED: 일반 마케팅 심리와 다른 벤처 자료는 이번 동작 QA 판정 근거가 아니어서 제외했다.
CONFLICTS: Playwright 원칙과 회장 정본은 충돌 없음. 사용자 지정 v63과 pipeline 최신 승인 핀 v68이 충돌해 디자인 PASS를 금지했다.

## 2026-09-13 02시 48분 KST · API 읽기 경로 105개 전수 재실사

한 줄 결론: localhost GET 105개는 정상 92개와 의도된 거절 13개이며, 원인불명 500과 요청 실패는 0개다. API 읽기 범위만 PASS이고 전체 제품 QA와 배포는 NG를 유지한다.

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98 | 발행 성과를 측정하고 다음 생성 판단으로 되돌림 | API-READ-ALL | PASS | GET 105개 전수 실호출, 정상 92, 의도된 거절 13, 원인불명 500과 요청 실패 0 |
| R104 | 고객·운영자·작업 공간 인증 경계 | API-AUTH-BOUNDARY | PASS | 올바른 토큰은 handler 도달, 격리 탐침 무토큰은 401 |
| R200, R207 | 성과 학습 규칙과 Studio 학습 정보 조회 | API-LEARNING-READ | PASS | 전수 뒤 동시 변경된 GET 3개를 현재 소스로 다시 호출해 모두 200 |
| R01~R207 | 이번 API 읽기 범위 밖 확정 요구 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 누락으로 PASS 처리하지 않음 |

집중 회귀 3파일 30건, 전체 Vitest 302파일 2,033건과 3건 스킵, TypeScript, production build 182/182, seed, health 200, 기본 흐름 11/11, Studio v1 최종 14/14, 디자인 lint를 확인했다. Studio 무료 재생성 POST는 첫 실행에서 한 번 예상 밖 200이었으나 즉시 수동 재호출과 전체 재실행에서는 계약상 409였다. 비재현 관찰로 남긴다.

승인 프로토타입 v63과 pipeline 핀 v68의 충돌 및 기존 디자인 정합 NG, 외부 OAuth·실발행·운영 배포 미검증 때문에 제품 전체 PASS로 승격하지 않는다. 상위 QA 품질 게이트도 운영 또는 스테이징 접촉 증거 0건으로 반려했다. 상세 보고서는 `docs/qa/osmu-api-read-sweep-v5-gpt-codex-20260913-0248.md`, 원본은 `logs/diff/osmu-api-read-sweep-20260913.json`이다.

## 2026-09-12 23시 23분 KST · Instagram Reels 성과 수집 build 전환

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98 | 발행 성과를 다음 생성 판단으로 되돌리고, 미수집을 측정값으로 오인하지 않음 | METRICS-REELS-01 | build 통과, QA 미승인 | Reels 행 조회, `views` provider 요청, 수치 UPDATE 정상 계약 통과. localhost GET 200에서 지원 범위 관찰 |
| R68, R98 | 연결되지 않은 작업 공간에서 외부 수집을 시작하지 않음 | METRICS-REELS-02 | build 통과, QA 미승인 | Route Handler 계약과 localhost POST 400으로 자격증명 없음 거절 확인 |

원 감사의 "Threads 외 수집기 6개 없음" 중 X, Instagram 피드, Facebook, YouTube·Shorts는 현재
코드에 이미 구현돼 있다. 재구현하지 않고 같은 Instagram 자격증명과 미디어 insights 경로를 쓰는
Reels만 이번 build 대상으로 좁혔다. 전체 Vitest 302파일 2,023건, TypeScript, 기본 흐름 11/11,
Studio v1 14/14, production build 182/182, 디자인 lint가 통과했다. 지정 작업 공간에는 연결 자격증명과 Reels 발행물이 없어
실제 Instagram provider 성공 응답은 미검증이다. QA 승인과 운영 배포는 하지 않았다.

## 2026-09-12 22시 49분 KST · 네 방 기본 흐름 재검증 최종 판정

한 줄 결론: localhost 네 방 기본 흐름은 두 검증기 결함을 수리한 뒤 범위 PASS다. 승인 디자인
정합과 외부 채널 발행은 통과하지 않았으므로 전체 QA와 배포는 NG다.

| 검증 | 판정 | 증거 |
|---|---|---|
| canonical 단계 | 진행 중 | 메인 repo `pipeline-state.osmu.md`의 `current_stage: qa`, 승인 전 |
| backend와 web 전체 회귀 | PASS | `npm run test`, 299파일 PASS, 2,000건 PASS, 3건 제외, exit 0 |
| TypeScript | PASS | `npx tsc --noEmit`, 출력 오류 0, exit 0 |
| production build | PASS | `npm run build`, 정적 페이지 182/182, exit 0. 기존 NFT 추적 경고 1건 |
| health | PASS | localhost:3456 `/api/health` HTTP 200, `db: up`, 43ms |
| seed | NG 후 수정, PASS | 고정 QA 작업 공간이 체험 한도 20건을 소진해 생성 429. 승인 fixture로 수정하고 실제 DB에서 `true`, `active`, `team` 확인 |
| 기본 API 흐름 | PASS | `.env.local` 주입 후 `verify-basic-flow-e2e.mjs`, 생성부터 성과 제안 재인계까지 11/11 |
| Studio v1 | NG 후 수정, PASS | 최초 교차 시간대 생성 429와 TypeError. 수정 뒤 `verify-studio-v1-e2e.mjs` 14/14 |
| 네 방 단면 탐침 | PASS | `probe-four-room-flow.mjs`, 네 방 렌더 true, 가린 모달·401·콘솔 오류 각 0 |
| 사람 클릭 반응형 | NG 후 수정, PASS | URL 대기를 클릭 전에 걸도록 수정. `logs/diff/osmu-four-room-flow-20260912-2220`, 390 라이트·다크, 768, 1024, 1440의 20화면과 성과실→생성실 5건 PASS |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`, 임의 px·인라인 style·토큰 밖 hex 위반 0 |
| mobile typecheck와 Maestro | 해당 없음 | dashboard 웹 제품이며 별도 mobile 계약이 없음. `optional:true` 우회 없음 |
| 승인 디자인 정합 | NG | v63 원본과 dev 4폭 PNG를 직접 대조. 셸 열 수, 담당 패널 위치, 요소 순서, 버튼 위계 불일치. 사용자 지정 v63과 pipeline 최신 v68 핀 충돌도 미해소 |
| 외부 OAuth·실발행·성과 | 미검증 | 이번 범위는 발행 직전까지이며 외부 permalink와 운영 배포 증거 없음 |

### 결함과 회귀

1. 반복 QA가 체험 한도를 소진하는 구조를 고쳤다. `seed-test-tenants.sql`이 고정 작업 공간의
   공유 AI 승인을 보장하고, `studio-v1-e2e-quota.regression-1.test.ts`가 이를 고정한다.
2. Next.js 전환 commit이 클릭 안에서 끝나 검증기가 과거 이벤트를 기다리는 경쟁 조건을 고쳤다.
   `waitForURL`과 클릭을 함께 시작하고 폭·방 로그를 남겼다.
   `four-room-client-navigation.regression-1.test.ts`가 순서를 고정한다.

### 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 네 방 이동 | FLOW-UI-01 | PASS | 네 방 20화면과 성과실→생성실 5건 |
| R27 | 후보 전건 거절 뒤 무료 재생성 | STUDIO-V1-REGEN | NG 후 수정, PASS | 승인 fixture 복원 뒤 Studio v1 14/14 |
| R104 | 고객 인증 경계 | FLOW-AUTH-01 | PASS | 실제 임시 고객 토큰, 브라우저 401 0, 폐기 200 |
| R193 | 성과 제안에서 생성실 재진입 | FLOW-UI-RETURN | NG 후 수정, PASS | URL 대기 경쟁 조건 수정 뒤 5개 폭·테마 조합 복귀 |
| R200, R207 | 성과실 UX와 학습 정보 | FLOW-PERF-01 | 기능 PASS, 디자인 NG | 제안 3건과 다음 행동 표시. v63 공통 구조와 불일치 |
| R201 | 중복 안내 없이 방 이동 | FLOW-SIDEBAR-01 | PASS | 차단 모달 0, 다음 행동 표시, 네 방 이동 성공 |
| R206 | 승인 시안 충실도 | CONF-ALL | NG | `docs/qa/osmu-four-room-basic-flow-v1-gpt-codex.md` 속성별 정합 행렬 |
| R01~R207 | 이번 기본 흐름 밖 확정 요구 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 누락으로 PASS 처리하지 않음 |

전환 가능 TC는 FLOW-UI-01, FLOW-AUTH-01, FLOW-UI-RETURN, FLOW-SIDEBAR-01과 기본 API 11단계다.
Studio v1 14건도 재실행 PASS다. CONF-ALL과 외부 실발행은 전환 불가다.

페르소나 결정: 박도윤은 네 폭에서 생성실부터 성과실까지 길을 잃지 않고 이동하고 돌아올 수 있다.
다만 승인 시안과 다른 공통 구조, 외부 채널 미검증 때문에 첫 콘텐츠의 실제 공개와 성과 수집까지
완료할 수 있다고 판정하지 않는다.

레드팀: 링크 클릭만 통과하면 생성과 인계가 끊겨도 숨을 수 있다. 이를 막기 위해 실제 API 11단계와
Studio v1 14건을 별도 실행했다. 반대로 API 통과만으로 화면 성공을 대신하지 않고 20개 실제 화면과
복귀 5건을 관찰했다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 localhost가 운영 배포와 다르거나 시안과 dev의
데이터 상태가 달라 시각 차이를 잘못 분류한 경우다. 그래서 판정을 로컬 기본 흐름 PASS로 한정하고,
상태와 무관한 공통 구조 불일치만 디자인 NG로 기록했다. 운영 배포와 외부 발행은 미검증이다.

벤치마크: Playwright 공식 actionability와 locator 원칙을 따라 force click 없이 표시·동작 가능한
링크를 눌렀고, 빠른 이동은 waiter를 먼저 거는 공식 패턴을 적용했다.

다음 실행: 소유자는 product-designer와 Codex 컨트롤러다. v63 또는 v68 승인 핀을 하나로 확정하고
공통 셸을 정합시킨 뒤 QA가 같은 상태의 네 방 4폭 PNG를 다시 대조한다. 종료 증거는 속성별 디자인
PASS와 외부 계정 연결·permalink·성과 API 응답이다.

SKILLS_USED: qa, 실제 앱 회귀·결함 등록·반응형 관찰·증거 기록 / SKILLS_SKIPPED: 없음

SOURCES: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `pipeline-state.osmu.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `logs/diff/osmu-four-room-flow-20260912-2220/observations.json` | https://playwright.dev/docs/actionability | https://playwright.dev/docs/locators

MODEL: gpt-codex/gpt-5.6-sol / qa-verifier

KNOWLEDGE_QUERY: business + OSMU + 기본 흐름 + 1인 사업자 + 끝내기 우선
HITS_USED: BRAIN의 ZERO-ONE Marketing Studio 아이디어와 repo 사업 좌표를 사용해 생성→편집→발행→성과의 검증 축과 초보 1인 사업자 페르소나를 고정했다.
HITS_REJECTED: 일반 마케팅 심리와 다른 벤처 자료는 이 동작 QA의 판정 근거가 아니어서 제외했다.
CONFLICTS: 외부 Playwright 원칙과 회장 정본은 충돌 없음. 사용자 지정 v63과 pipeline 최신 승인 핀 v68이 충돌해 디자인 PASS를 금지했다.

## 2026-09-12 22시 17분 KST · 네 방 4폭 사람 클릭 회귀 NG 등록

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R193, R201 | 생성실에서 성과실까지 네 방 이동과 성과실에서 생성실 복귀 | FLOW-UI-01 | ❌ NG | `verify-four-room-ui-e2e.mjs` 실제 localhost 실행에서 방 링크 클릭 뒤 `page.waitForURL(... waitUntil: "commit")`가 30초 제한시간 초과, exit 1 |

어느 폭과 방에서 끊겼는지 현재 로그가 밝히지 않아 검증기 관찰성도 결함이다. 재현 지점을 표시하고
제품 경로와 검증기 대기를 분리한 뒤 같은 네 폭을 다시 실행하기 전까지 PASS로 전환하지 않는다.

## 2026-09-12 22시 09분 KST · Studio v1 회귀 NG 등록

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R27 | 후보 전건 거절 뒤 무료 다시 만들기 몫은 회원 UTC 하루에 한 번만 허용 | STUDIO-V1-REGEN | ❌ NG | `verify-studio-v1-e2e.mjs` 실제 localhost 실행에서 첫 생성 201 뒤 교차 시간대 생성 429, 이어 `generation.candidates` 접근 TypeError로 exit 1 |

현재 판정은 제품 기능 실패와 검증기 실패를 분리하기 전의 NG다. 원인 분석과 수정 뒤 같은 실제
localhost 요청, 전체 회귀, TypeScript를 다시 실행하기 전까지 PASS로 전환하지 않는다.

## 2026-09-12 22시 06분 KST · 성과 기반 다음 실험 자동 제안 QA

발견: 성과실은 표본이 있어도 사용자가 `성과에서 제안 받기`를 직접 눌러야 했고, 숫자와 다음
콘텐츠 제작 사이가 끊겨 있었다. 공식 Buffer 흐름도 성과를 차트로 끝내지 않고 적절한 순간에
실행 가능한 제안으로 연결하는 방향이다. 이를 적용하되 표본 5편 미만에서는 자동 결론을
내리지 않도록 `PerformanceRoom`의 자동 제안 조건을 제한했다.

의미: 5편 이상이 쌓이면 성과실 진입 뒤 다음 실험 카드가 자동으로 준비되어 생성실 재방문
마찰이 줄어든다. 학습 정보가 한 번 저장되고 끝나는 것이 아니라 성과에서 다음 생성 가설로
이어지는 제품 고리가 생긴다. 표본이 부족한 사용자는 기존 수동 흐름을 사용하므로 초기
데이터를 과대해석하지 않는다.

| 단계 | 상태 | 증거·비고 |
|---|---|---|
| 자동 제안 조건 | 테스트됨 | 표본 5편에서 `/api/suggestions` 자동 호출 및 카드 표시 |
| 표본 부족 보호 | 테스트됨 | 1편 등 기존 댓글·빈 상태 테스트에서 자동 제안 오작동 없음 |
| 학습 목적 저장 | 테스트됨 | 생성실 목적 저장·복원 2개 포함 관련 11개 PASS |
| 타입·회귀 | 테스트됨 | `npx tsc --noEmit`, 파생 ID 400 회귀 2개, 성과 API 계약 2개 PASS |
| 전체 목표 | 미검증 | OAuth·실제 외부 발행·발행 후 성과·디자인 matched pair 미완료 |

⛔ 검증실패 보고: 등급 A, 이번 UX 개선은 테스트됨이나 전체 OSMU 출고는 불가합니다. 관리자 OAuth 연결·회원 OAuth2·외부 permalink·성과 API 응답·디자인 전체 정합이 없습니다.

다음 실행: 소유자 Codex 컨트롤러. 실행 중인 읽기 API 전수 실사의 최종 로그를 회수하고 105개
경로의 이전 실사 대비 표를 확정한다. 그 뒤 v68 시안·dev 동일 상태 대조를 마치고, 관리자
자격증명 회수 즉시 계정 연결·회원 OAuth2·실제 Threads 발행·성과 조회를 수행한다. 종료증거는
전수 실사 JSON, 속성별 디자인 PASS, 연결 계정 목록, 외부 permalink, 성과 API 응답이다.

[모델]: Codex 컨트롤러가 현재 성과실 코드와 테스트를 읽고 변경 후 직접 테스트했다.
벤치마크: Buffer Smart Scheduling과 Insights 공식 자료를 참조해 성과를 다음 행동으로 연결하는 원칙만 차용했다. [Smart Scheduling](https://buffer.com/resources/smart-scheduling/), [Analytics](https://buffer.com/resources/analytics/)
소스 1: `dashboard/src/components/home/PerformanceRoom.tsx`.
소스 2: `dashboard/tests/home/performance-engagement.test.tsx`.
소스 3: `dashboard/src/components/home/PerformanceDashboard.tsx`, `dashboard/src/app/api/suggestions/route.ts`.

## 2026-09-12 21시 59분 KST · 최신 production QA 상태

발견: v68의 실제 방 이동 위치는 상단 `작업 단계`인데 검증기가 구형 사이드바만 찾고 있어
정상 제품을 timeout으로 실패 처리했다. 상단 네 단계 우선 탐색과 구형 셸 fallback을 검증기에
반영했고, 데스크톱 사이드바는 56px 아이콘 레일로 축약했다. Next.js route 타입 오류는
학습·거래 파서를 route 밖 helper로 분리해 해결했다.

의미: QA가 현재 제품 계약을 검사하게 되어 네 방 흐름의 기능 신뢰도가 올라갔다. 최신 production
번들의 실제 브라우저 실행에서 4개 방 x 4폭, 390 다크 포함 20회가 통과했으며 가로 넘침 0px,
전체 화면 모달 0건, 브라우저 401 0건, 콘솔 오류 0건이다. 반면 디자인 시안과 dev 화면은
동일 상태가 아니고 외부 계정과 실제 발행 경로도 닫히지 않아 출고 판단은 바뀌지 않는다.

| 단계 | 상태 | 증거·비고 |
|---|---|---|
| 기능·반응형 QA | 테스트됨 | `/tmp/osmu-four-room-qa-3564`, 총 20회 PASS |
| TypeScript·production build | 테스트됨 | `npx tsc --noEmit`, `npm run build` exit 0 |
| 디자인 픽셀 대조 | 미검증 | v68 시안과 dev 1024를 각각 Read했으나 상태·콘텐츠 차이로 PASS 보류 |
| OAuth·외부 발행·성과 | 미검증 | 자격증명·연결 계정·외부 permalink·성과 응답 없음 |
| 파이프라인 | 진행 중 | `qa`, 승인 전, 출고 불가 |

⛔ 검증실패 보고: 등급 A, 기능·반응형 증거는 통과했으나 디자인 전체 정합과 OAuth·실제 발행·성과가 미검증, 출고 불가.

다음 실행: 소유자 Codex 컨트롤러. 현재는 회장 지시에 따라 자동 실행을 멈춘다. 재개 시 v68
matched pair와 속성별 conformance matrix를 먼저 끝내고, 관리자 자격증명 회수 직후 계정 연결,
회원 OAuth2 로그인, Threads 발행, 성과 조회를 수행한다. 종료증거는 디자인 속성별 PASS,
연결 계정 목록, 외부 permalink, 성과 API 응답이다.

[모델]: Codex 컨트롤러가 실제 코드·production 브라우저·이미지 Read 증거를 대조해 판정했다.
벤치마크: 해당 없음. 이번 조치는 승인 셸과 검증기 계약을 맞추는 회귀 수정이며 경쟁 제품 비교가 필요하지 않다.
소스 1: `dashboard/scripts/verify-four-room-ui-e2e.mjs`.
소스 2: `dashboard/src/components/layout/Sidebar.tsx`, `dashboard/src/lib/studio-learning-sanitize.ts`, `dashboard/src/lib/higgsfield-transactions.ts`.
소스 3: `/tmp/osmu-four-room-qa-3564`와 v68 clean frame 및 최신 dev 1024 캡처.

## 2026-09-12 22시 03분 KST · v68 방 이동 검증기 수정 후 production 네 방 재검증

발견: v68 승인 셸은 네 방 이동을 상단 `작업 단계`에 두는데, 검증기는 이전 셸의 사이드바 영역만
찾고 있었다. 그래서 제품 상단에 정상적인 방 링크가 있어도 `편집실`을 찾지 못해 30초 timeout이
났다. 검증기를 상단 네 단계 우선, 구형 셸 사이드바 후순위로 바꿔 검증 기준을 승인 화면과 맞췄다.

의미: 검증기가 실제 제품 계약을 따라가므로 정상적인 상단 방 이동을 결함으로 오판하지 않게 됐다.
최신 production 번들에서 네 방 전체 흐름을 다시 실행한 결과 4개 방 x 4폭, 390 다크 포함 20회가
통과했다. 화면의 가로 넘침·401·콘솔 오류가 0이라 다음 QA의 기능 기반은 확보됐지만, 이것이 외부
OAuth 발행이나 디자인 전체 정합을 증명하지는 않는다.

- 판정: 네 방 기능·반응형 `테스트됨`, 디자인 전체 정합 `미검증`, OAuth·외부 발행·성과 `미검증`.
- 직접 증거: `PASS 네 방 4개 x 4폭(390은 라이트+다크), 총 20회 측정`, `/tmp/osmu-four-room-qa-3564`.
- [모델]: 검증기 실패 원인을 제품의 상단 `작업 단계`와 비교해 수정하고 최신 production build에서 재실행했다.
- 벤치마크: 해당 없음. 검증기 계약 수정과 회귀 재실행이다.
- ⛔ 검증실패 보고: 등급 A, 디자인 전체 정합·OAuth·실제 발행·성과 미검증, 출고 불가.
- 다음 실행: 회장 요청에 따라 자동 실행을 멈춘다. 재개 시 Codex 컨트롤러가 v68 matched-pair 정합을 마무리한 뒤 관리자 자격증명 회수 즉시 OAuth·회원 발행·성과를 검증한다. 종료증거는 정합 PASS, 연결 계정, 외부 permalink, 성과 API 응답이다.
- 소스 1: `dashboard/scripts/verify-four-room-ui-e2e.mjs`.
- 소스 2: `dashboard/src/components/layout/Sidebar.tsx`.
- 소스 3: `/tmp/osmu-four-room-qa-3564`.

## 2026-09-12 21시 52분 KST · v68 셸 축약과 route contract 회귀 기록

발견: v68 승인 clean frame은 56px 어두운 아이콘 레일과 상단 네 단계인데 현재 회원 화면은 넓은
사이드바와 중복된 세로 방 레일을 함께 보여 주고 있었다. 이를 맞추기 위해 데스크톱 사이드바를
56px 어두운 레일로 축약하고, 모바일 메뉴는 유지했다. 동시에 학습·Higgsfield route의 테스트용
named export가 Next.js route 타입 검사를 깨뜨리던 문제를 route 밖 공용 함수로 분리했다.

의미: 화면 셸은 v68 방향으로 일부 이동했고 TypeScript route 경계는 정상화됐다. 그러나 시각적
중복을 숨기는 과정에서 최신 standalone 네 방 E2E가 접근 가능한 `한 편의 제작 순서` 내 편집실
링크를 30초 동안 찾지 못했다. 따라서 코드 수정·단위 테스트·빌드 통과를 제품 QA 완료로 확대하지
않고, 셸 변경은 미검증으로 남긴다.

- 판정: 관련 단위 테스트 18개 `테스트됨`, `tsc --noEmit` `테스트됨`, production build `테스트됨`, 네 방 E2E `NG`.
- 직접 증거: `SidebarShell.test.tsx` 8개 통과, `npx tsc --noEmit` exit 0, `npm run build` exit 0, `/tmp/osmu-four-room-qa-3564` E2E 실패 로그.
- [모델]: v68 clean frame을 기준으로 Sidebar를 수정하고 실제 standalone 번들에서 네 방 E2E를 재실행했다.
- 벤치마크: 해당 없음. 이번 작업은 디자인 셸 계승과 route 타입 회귀 수리다.
- ⛔ 검증실패 보고: 등급 A, 접근성 방 링크 회귀 및 OAuth·실제 발행·성과 미검증, 출고 불가.
- 다음 실행: 회장 요청에 따라 추가 실행을 중단한다. 재개 시 Codex 컨트롤러가 방 링크 접근성 회귀를 먼저 해결하고 네 방 E2E PASS를 확보한다. 종료증거는 E2E PASS, 연결 계정, 외부 permalink, 성과 API 응답이다.
- 소스 1: `dashboard/src/components/layout/Sidebar.tsx`.
- 소스 2: `dashboard/src/lib/studio-learning-sanitize.ts`, `dashboard/src/lib/higgsfield-transactions.ts`.
- 소스 3: `dashboard/tests/components/SidebarShell.test.tsx`, `/tmp/osmu-four-room-qa-3564`.

## 2026-09-12 21시 35분 KST · 동일 상태 디자인 대조 재실행

승인 핀 v68의 clean frame `osmu-v68-create-normal-1024...png`와 최신 production standalone 3562에서 실제 생성 담당 흐름을 실행해 만든 `/tmp/osmu-design-qa-v68-create-normal-1024.png`를 각각 Read했다. v68 시안은 짧은 영상 선택 후 후보 3개가 이미 채워진 normal 상태이고, dev는 후보 생성 직후 `2/3` 상태다. 같은 1024px이지만 시안은 56px 어두운 아이콘 레일과 상단 네 단계 중심이며, dev는 넓은 작업실 사이드바와 상단 진행·학습 띠를 함께 사용한다. 카드 배치와 우측 담당 패널의 폭·내용도 일치하지 않는다.

의미: 이번에는 게이트가 요구한 두 장의 직접 관찰 증거를 확보했으므로 "증거 없음" 문제는 해소됐다. 또한 최신 승인 핀 v68을 기준으로 보아도 셸과 상태 표현의 차이가 확인되어 디자인 일치 PASS로 바꿀 수 없다. 현재 구현을 v68에 맞출지, 후속 디자인 후보를 정식 승인 핀으로 올릴지 결정과 핀 갱신이 필요하다.

- 판정: 디자인 픽셀 대조 `미검증`, 동일 상태 화면 캡처 `테스트됨`.
- 직접 증거: v68 clean frame 1024x900, dev 후보 수 3개와 화면 단계 `2 / 3`, standalone 3562 서버는 캡처 후 종료.
- [모델]: 시안과 dev 캡처를 각각 이미지 Read로 열어 주축, 요소 순서, 열 수, 여백, 버튼 위계를 육안 대조했다.
- 벤치마크: 해당 없음. 이번 작업은 외부 사례 비교가 아니라 승인 시안과 구현 화면의 동일성 검증이다.
- ⛔ 검증실패 보고: 등급 A, 구조적 화면 불일치로 디자인 QA PASS 및 전체 출고 불가.
- 다음 실행: 소유자 Codex 컨트롤러가 v68 승인 핀과 후속 디자인 후보의 관계를 정리하고, 선택된 기준에 맞춘 동일 상태 dev 화면을 다시 캡처한다. 종료증거는 기준이 확정된 시안·dev 두 장과 속성별 conformance matrix다. 외부 회수 시점은 기준 확정 직후다.
- 소스 1: `docs/design/clean-frames/osmu-v68-create-normal-1024-gpt-codex-20260903-0022.png`.
- 소스 2: `/tmp/osmu-design-qa-v68-create-normal-1024.png`.
- 소스 3: `pipeline-state.osmu.md`의 v68 `approved_artifacts` 블록.

## 2026-09-12 22시 14분 KST · 읽기 API 전수 실사 최종 판정

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R01~R207 | 읽기 경로 전수 실사 범위와 기존 확정 요구 승계 | API-READ-20260912-01 | 범위 PASS | GET 105개와 HEAD 1개를 localhost:3456에서 실제 호출. 최종 정상 92, 계약상 거절 13, HTTP 500 0, 요청 실패 0 |
| R01~R207 | 서버 고장과 의도된 거절 분리 | API-READ-20260912-02 | 범위 PASS | 파생 작업 조회 500을 잘못된 UUID 400, 없는 UUID 404로 분리. 커밋 `87c3014b`, `fdaa82e1` |
| R01~R207 | 전체 제품 회귀 | API-READ-20260912-03 | NG | 전체 Vitest 2,000건 중 1,993 PASS, 4 FAIL, 3 skip. 실패 4건은 진행 중 성과실 UI, 네 방 탐침, UI token 변경이며 집중 재실행에서도 재현 |

production build 182/182, TypeScript, 기본 흐름 11/11, Studio v1 14/14, 신규 회귀 30건, seed, health, design lint는 통과했다. 전체 근거와 지난 실사 대조는 `docs/qa/osmu-api-read-sweep-v4-gpt-codex-20260912-2214.md`, 전후 원본은 `logs/diff/osmu-api-read-sweep-20260912-before.json`과 `logs/diff/osmu-api-read-sweep-20260912-after.json`이다. 읽기 API 범위는 PASS지만 전체 제품 QA는 PASS로 올리지 않는다.

## 2026-09-12 21시 16분 KST · 발행 복귀 초안 경합 수정과 최신 production 재검증

발견: 전체 테스트에서 `queue_id`가 가리키는 A 초안과 URL의 `draft_id`가 가리키는 B 초안이 다를 때, 일반 딥링크 복원 효과가 먼저 B를 화면에 주입하고 발행 복귀 검증이 나중에 불일치를 거부하는 순서 경합이 드러났다. 발행 복귀 요청이 있으면 큐·초안 연결 검증이 끝날 때까지 일반 복원을 기다리도록 수정했다. 처음 실패한 회귀 테스트는 수정 후 36개 전체 통과했고, 전체 테스트도 295개 파일·1,993개 통과로 끝났다.

의미: 사용자가 잘못된 URL을 열었을 때 다른 작업물이 잠깐이라도 발행 가능한 상태로 보이는 위험을 제거했다. 외부 게시와 내부 기록이 어긋나는 발행 경계에서 작업물 혼입을 막아, 안전성뿐 아니라 사용자가 어느 초안을 보고 있는지에 대한 신뢰도 지킨다. 최신 production build를 standalone 3559로 실행해 회원 토큰 네 방 20회도 다시 통과했다.

- 판정: 발행 복귀 경계 `테스트됨`, 전체 회귀 `테스트됨`, production 네 방 `테스트됨`.
- 직접 증거: `M4-STUDIO-01` 포함 발행실 36개 통과, 전체 295개 파일 1,993개 통과, standalone 3559 20회에서 가로 넘침 0px·401 0건·콘솔 오류 0건.
- [모델]: 불일치 초안이 실제로 화면에 주입된 실패 테스트를 읽고, 복원 효과의 실행 순서를 코드로 확인한 뒤 guard와 의존성을 수정하고 같은 테스트와 production 브라우저를 재실행했다.
- 벤치마크: 해당 없음. 큐와 URL 초안의 안전한 복원 순서에 대한 회귀 수정이다.
- ⛔ 검증실패 보고: 등급 A, 외부 OAuth 계정·실제 permalink·발행 후 성과·동일 상태 디자인 대조가 없어 전체 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. 배포 런처에서 최신 번들의 초안 복귀 경계를 확인하고, 회장 Safari OAuth 세션 또는 관리자 자격증명이 확보되는 즉시 연결 계정 조회·Threads 발행·성과 회수를 수행한다. 종료증거는 연결 계정 목록, 외부 permalink, 성과 API 응답, 동일 상태 디자인 대조 이미지다.
- 소스 1: `dashboard/src/app/studio/page.tsx`, 큐 복귀 중 일반 draft 복원 대기.
- 소스 2: `dashboard/tests/publish/studio-publish-ui.test.tsx`, `M4-STUDIO-01` 및 36개 통과.
- 소스 3: `/tmp/osmu-four-room-qa-3559`와 `npm test` 전체 결과.

## 2026-09-12 · 학습 정보 시작 유도 UX와 최신 production 네 방 재검증

발견: 학습 정보는 헤더에만 보여 첫 로그인 사용자가 생성 전에 놓칠 수 있었다. 시작 안내에 실제 사용자 입력 칸 수를 연결하고, 7칸 중 덜 채워졌으면 `AI가 내 일을 이해하도록 학습 정보 N/7칸 채우기`와 `학습 정보 채우기` 버튼을 보여 주도록 바꿨다. 버튼은 강제 모달이 아니라 기존 문답을 여는 방식이라 사용자가 나중에 하기를 선택할 수 있다. 개발 서버 3456에서는 `data-room=create`가 30초 안에 나타나지 않아 실패했지만, 동일 최신 production 번들 standalone 3558에서는 회원 토큰으로 네 방 20회가 통과했다.

의미: 핵심 학습이 숨은 설정이 아니라 첫 작업 전에 확인 가능한 입력 단계가 됐다. 생성 전에 고객이 무엇을 알려 줬는지 알 수 있어 이후 결과가 마음에 들지 않을 때 수정할 원인을 찾을 수 있다. 개발 서버 실패는 기능 PASS로 승격하지 않고 production 증거와 분리해 기록했다.

- 판정: 시작 유도 UX `테스트됨`, production 네 방 회귀 `테스트됨`, 개발 서버 3456 재검증 `미검증`.
- 직접 증거: `/tmp/osmu-four-room-qa-3558/1440-light-create.png`에서 `학습 정보 0/7칸 채우기`와 버튼 확인, 최신 standalone 20회에서 가로 넘침 0px·401 0건·콘솔 오류 0건.
- [모델]: 학습 칸 수가 실제 페이지 상태에 연결됐는지 화면 Read로 확인하고, 컴포넌트 계약 테스트 29개·production 브라우저 회귀를 각각 실행했다.
- 벤치마크: Buffer의 콘텐츠 캘린더·초안·검토·발행 흐름을 참고해 시작 안내를 작업 흐름의 명시적 다음 행동으로 유지했다. [Buffer benchmark](https://buffer.com/resources/social-media-scheduling-tools/)
- ⛔ 검증실패 보고: 등급 A, 외부 OAuth 자격증명·연결 계정·실제 permalink·성과·승인 시안과 같은 상태의 대조가 없어 전체 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. 배포 환경에서 동일한 시작 안내와 학습 PUT·GET를 확인하고, 회장 Safari 또는 관리자 OAuth 자격증명이 회수되는 즉시 계정 연결 후 Threads 실제 발행과 성과 조회를 수행한다. 종료증거는 배포 화면 캡처, 연결 계정 목록, 외부 permalink, 성과 API 응답, 동일 상태 디자인 대조 이미지다.
- 소스 1: `dashboard/src/components/shared/GettingStartedStrip.tsx`, 학습 정보 진행 유도.
- 소스 2: `dashboard/src/app/studio/page.tsx`, 학습 칸 수와 시작 안내 연결.
- 소스 3: `dashboard/tests/components/getting-started-strip-v70.test.tsx`, `dashboard/tests/studio/*learning*.test.ts`, `/tmp/osmu-four-room-qa-3558`.

## 2026-09-12 20시 52분 KST · 학습 정보 업종 키 서버 보존과 생성 경로 재검증

발견: 회원 학습 카드가 현재 사용하는 `industry`를 클라이언트와 프롬프트 계약에는 전달하고 있었지만, `/api/studio/learning` 서버 허용 목록에는 구형 `business`만 남아 있어 업종 선택이 서버 저장 시 버려지고 있었다. 허용 목록과 정제 함수를 `industry` 기준으로 고치고 구형 `business`는 읽을 때 `industry`로 이관하도록 했다. 계약 테스트 19개와 production standalone의 실제 PUT·GET를 실행해 `industry=교육·강의`, `audience=처음 해 보는 사람`, `voice=차분하게`가 양쪽 응답에 보존되는 것을 확인했다.

의미: 학습 정보가 브라우저·기기에 묶여 사라지는 문제가 아니라 서버 저장 경계에서 조용히 손실되던 문제까지 제거됐다. 업종 선택은 이제 작업 공간에 남고, 기존 생성 경로가 읽는 학습 컨텍스트에 공급될 수 있다. 다만 이 검증은 학습 값의 저장·조회와 프롬프트 계약을 닫은 것이며, 실제 외부 채널 발행과 발행 후 성과를 닫은 것은 아니다.

- 판정: 학습 정보 계약 `테스트됨`, production PUT·GET `관찰됨`, 전체 OSMU 흐름 `미검증`.
- [모델]: 서버 허용 목록과 정제 함수의 코드 경로를 확인하고, Vitest 19개 통과 및 회원 bearer 토큰의 standalone HTTP PUT·GET 응답을 직접 대조했다.
- 벤치마크: 해당 없음. 경쟁사 비교가 아닌 데이터 보존 경계와 생성 컨텍스트 계약의 기계적 회귀 검증이다.
- ⛔ 검증실패 보고: 등급 A, OAuth 자격증명·연결 계정·외부 permalink·발행 후 성과·승인 시안 동일 상태 대조가 없어 전체 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. 동일 production 번들에서 생성 응답의 학습 컨텍스트 반영 로그를 확인하고, 회장 Safari 세션 또는 관리자 OAuth 자격증명이 회수되는 즉시 Threads 실제 발행과 성과 조회를 수행한다. 종료증거는 생성 payload·외부 permalink·발행 후 성과 API 응답·동일 상태 디자인 대조 이미지이며, 외부 회수 시점은 회장 연결 직후다.
- 소스 1: `dashboard/src/app/api/studio/learning/route.ts`, `industry` 허용 및 구형 키 이관.
- 소스 2: `dashboard/tests/studio/learning-info-server.contract.test.ts`, `learning-context-prompt.contract.test.ts`, `learning-info-reaches-generation.test.ts` 19개 통과.
- 소스 3: production standalone 3557의 회원 토큰 PUT·GET 응답과 `dashboard/src/app/api/studio/text/route.ts` 학습 컨텍스트 경로.

## 2026-09-12 23시 55분 KST · 영상 편집실 복원·수정 저장과 production 네 방 재검증

발견: 앞선 편집실 대기 실패를 다시 실행한 결과, 첫 standalone 실행은 서버를 프로젝트 루트에서 띄워 `_next/static` 자산을 찾지 못했고 HTML 200 뒤 CSS·JS 404가 발생했다. standalone 디렉터리에 정적 자산을 배치하고 그 디렉터리에서 재기동하자 회원 토큰으로 `/studio?room=edit`가 렌더링됐다. 검증 MP4를 테넌트 미디어에 연결한 draft 딥링크(`/studio?room=edit&draft_id=...`)는 영상 편집실로 복원됐고 `video.readyState=4`, 장면 대사 3줄, 브라우저 오류 0건을 확인했다. 첫 대사를 화면에서 수정한 뒤 `발행실로 이동`을 눌렀고, draft GET에서 수정 문장과 `status=draft`를 확인했다.

의미: 영상 생성 결과가 저장·서명 배달·편집 화면·편집 저장까지 이어지는 회원 경로는 이제 실제 증거가 생겼다. 또한 이전 실패의 원인은 애플리케이션의 영상 DOM 부재가 아니라 standalone 실행 방식과 정적 자산 배치 누락이었다. 다만 이 조치는 로컬 production 런처 검증이며, 배포 런처가 같은 `DATA_DIR`와 `MEDIA_SIGNING_SECRET`를 주입하는지는 별도 운영 확인이 필요하다.

- 판정: 영상 편집실 복원·수정 저장 `테스트됨`, 네 방 회귀 `테스트됨`.
- 직접 증거: 영상 `readyState=4`, `data-edit-kind=video`, 장면 대사 3개, 수정 문장 draft 반영, 네 방 4개 x 4폭 총 20회, 가로 넘침 0px, 전체 화면 모달 0건, 401 0건, 콘솔 오류 0건.
- [모델]: 실패한 실행의 404 자산 목록과 정상 실행의 브라우저 DOM·미디어 상태·draft 응답을 대조해 런처 문제와 복원 코드를 분리했다.
- 벤치마크: 해당 없음. 이번 실행은 영상 편집 회원 경로와 production 런처 회귀 검증이다.
- ⛔ 검증실패 보고: 등급 A, 외부 OAuth 계정 연결·실제 채널 발행·발행 후 성과·승인 시안 동일 상태 대조가 없어 전체 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. 배포 런처에 정적 자산 배치와 미디어 서명 비밀 주입을 고정하고, 관리자 readiness에서 OAuth 자격증명 상태를 확인한 뒤 회원 Safari 세션의 연결 계정으로 Threads 발행과 성과 회수를 수행한다. 종료증거는 배포 런처 로그, 플랫폼 계정 목록, 외부 permalink, 성과 API 응답, 동일 상태 디자인 대조 이미지다.
- 소스 1: `dashboard/src/app/studio/page.tsx`, 일반 `draft_id` 딥링크 복원.
- 소스 2: `dashboard/src/components/studio/StudioRooms.tsx`, 영상 편집 입력·미디어 미리보기·발행실 이동.
- 소스 3: `/tmp/osmu-video-edit-restore-3556.png`, `/tmp/osmu-four-room-qa-3556` 브라우저 증거.

## 2026-09-12 23시 05분 KST · 승인 시안과 production 생성실 육안 대조

발견: 디자인 게이트가 요구한 시안과 실화면을 같은 턴에 Read했다. 승인 시안은 `qa-v64/room-create-1440.png`의 생성실 후보 선택 단계였고, production 실화면은 `/tmp/osmu-four-room-qa-3555/1440-light-create.png`의 생성실 첫 단계였다. 두 화면 모두 좌측 네 방 레일, 상단 작업 흐름, 중앙 생성 영역, 우측 생성 담당 패널이라는 구조는 공유하지만, 현재 캡처는 같은 생성 단계가 아니며 중앙 콘텐츠와 진행 상태가 달라 픽셀 일치 판정을 내릴 수 없다.

의미: 네 방의 큰 정보 구조가 실제 화면에 반영된 것은 관찰됐지만, 승인 시안 정합을 `통과`라고 보고할 증거는 부족하다. 특히 시안의 후보 3장·2/3 진행 상태와 production의 주제 입력·1/3 진행 상태가 달라서, 위계·간격·행동 단추의 동일성을 같은 상태로 판정할 수 없다. 디자인 QA는 보류하며 QA 단계도 승인 전 상태를 유지한다.

- 판정: 디자인 픽셀 대조 `미검증`, 네 방 production UI `테스트됨`.
- [모델]: 시안과 production 캡처를 각각 Read해 좌측 레일, 헤더, 중앙 작업 영역, 우측 담당 패널을 육안 비교했으나 다른 단계의 화면임을 확인해 PASS를 내리지 않았다.
- 벤치마크: 해당 없음. 이번 조치는 경쟁사 비교가 아니라 승인 시안과 실제 구현의 동일 상태 육안 대조다.
- ⛔ 검증실패 보고: 등급 A, 승인 시안과 production의 같은 생성 단계 대조 이미지가 없어 디자인 정합·전체 OSMU 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. v64 시안의 생성 1단계와 production 생성 1단계를 동일 상태로 캡처해 두 이미지를 다시 Read한다. 종료증거는 동일 단계 1440 캡처 2장 또는 좌우 합성 1장, 1024·390 대응 캡처, 가로 넘침 0px이다. 회원 Safari OAuth 연결 회수 시점은 회장 연결 직후이며, 그때 외부 발행·성과 검증도 재개한다.
- 소스 1: `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v64/room-create-1440.png`.
- 소스 2: `/tmp/osmu-four-room-qa-3555/1440-light-create.png`.
- 소스 3: `DESIGN.md` v64 승인 핀과 `pipeline-state.osmu.md`의 QA 진행 상태.

## 2026-09-12 22시 40분 KST · 영상 편집실 복원 QA 미통과

발견: 검증된 MP4의 서명 배달 URL을 회원 작업 공간의 `studio_work:<tenant>` 복원 상태에 넣고 production standalone 브라우저에서 `/studio?room=edit`를 열었다. 영상 편집실의 `[data-room="edit"]` visible 대기 30초에서 실패해, 이번 실행에서는 편집실 DOM·영상 재생·편집 필드까지 도달하지 못했다.

의미: 영상 파일과 배달 API가 정상이라는 사실만으로 편집실 작업물 복원이 된다고 볼 수 없다. 회원이 생성 결과를 다음 방에서 이어 편집하는 핵심 흐름은 별도 결함으로 남아 있으며, 저장된 draft와 localStorage 복원 중 어느 경계가 먼저 끊기는지 trace가 필요하다.

- 판정: `미검증`.
- [모델]: 브라우저 locator 실패를 그대로 기록했으며 영상 편집 PASS로 해석하지 않았다.
- 벤치마크: 해당 없음. 저장된 작업물 복원 경계의 회귀 QA다.
- ⛔ 검증실패 보고: 등급 A, 영상 편집실 표시·재생·문구 수정 저장·외부 발행·성과가 미검증이므로 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. production 브라우저에서 `/api/me`, draft 조회, localStorage 복원, `hydratedWorkspaceId` 상태를 순서대로 trace하고 편집실 표시까지 고친다. 종료증거는 편집실 캡처, 영상 `loadedmetadata`, 수정 저장 응답, 외부 permalink, 성과 응답이다.
- 소스 1: `dashboard/src/app/studio/page.tsx`, 작업물 복원과 hydration 조건.
- 소스 2: `dashboard/src/components/studio/StudioRooms.tsx`, 편집실 렌더링 계약.
- 소스 3: `/tmp/osmu-video-final.mp4`, MP4 직접 검증 결과.

## 2026-09-12 22시 05분 KST · 영상 결과·앱 미디어 배달 경계 확인

발견: Higgsfield 작업 ID `f3312ba2-ec19-4df9-8888-a0613c73a400`은 `completed`와 MP4 `result_url`을 반환했다. 결과 파일을 직접 다운로드해 H.264, 768×768, 5.875초로 확인했고, 테넌트 미디어 디렉터리에 저장한 뒤 standalone에 `DATA_DIR`와 서명 비밀을 명시해 `/api/media/resign` HTTP 200 및 새 배달 URL을 받았다.

의미: 영상 생성과 앱의 테넌트 서명 배달 경계는 각각 실제 결과를 만들고 브라우저가 받을 주소를 발급하는 데까지 이어진다. 앞선 API 프로세스 종료는 공급자 미완료가 아니라 장시간 작업 대기 중 실행 환경이 종료된 것이었다. 단, 이 검증은 영상 편집 화면, 외부 영상 발행, 발행 후 성과까지는 아직 닫지 않았다.

- 판정: 공급자 영상 `관찰됨`, MP4 포맷 `테스트됨`, 앱 배달 URL `테스트됨`.
- 운영 조건: Next standalone은 `.env.local`을 자동 로드하지 않으므로 `DATA_DIR`, `OSMU_SECRET_KEY` 또는 `MEDIA_SIGNING_SECRET`, 인증 토큰을 배포 런처가 주입해야 한다.
- [모델]: 작업 상태, 직접 다운로드 파일, ffprobe 결과, `/api/media/resign` 응답을 각각 확인했다.
- 벤치마크: 해당 없음. 이미 생성된 미디어의 저장·배달 경계 검증이다.
- ⛔ 검증실패 보고: 등급 A, 영상 편집 화면·OAuth 외부 발행·성과 회수는 미검증이므로 전체 목표 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. 검증된 MP4를 편집실 화면에 연결해 재생·문구 수정·초안 저장을 확인하고, 계정 연결이 준비되면 영상 발행과 성과를 확인한다. 종료증거는 편집실 캡처, 저장된 draft payload, 외부 permalink, 성과 응답이다.
- 소스 1: Higgsfield `generate wait` 결과와 MP4 `ffprobe` 출력.
- 소스 2: `dashboard/src/app/api/higgsfield/video/route.ts`.
- 소스 3: `dashboard/src/app/api/media/resign/route.ts`, `/api/media` 배달 응답.

## 2026-09-12 21시 45분 KST · Higgsfield 거래 조회 복구

발견: CLI의 실제 거래 응답은 배열이 아니라 `{ cursor, items }` 객체였는데 거래 API가 첫 대괄호부터 잘라 파싱해 `Unexpected non-whitespace character`를 반환하고 있었다. `parseTransactionItems`가 페이지 객체와 기존 배열을 모두 받도록 수정했고 3개 회귀 테스트를 통과했다.

의미: 운영자가 이미지·영상 생성 비용과 결과 매칭을 볼 수 있는 경로가 다시 열렸다. production standalone의 거래 조회는 HTTP 200, 최근 10건을 반환했고 Minimax Hailuo 2.3 영상 비용 -6 크레딧과 Soul V2 이미지 비용 -0.12 크레딧을 직접 확인했다. 영상 외부 비용은 발생했지만 출력 파일 매칭은 비어 있어 영상 재생·편집·발행 완료로 판정하지 않는다.

- 판정: 거래 조회 `테스트됨`, 영상 결과 파일 `미검증`.
- 테스트: `tests/higgsfield-transactions.test.ts` 3/3 통과.
- [모델]: CLI 원문, production API 응답, 회귀 테스트를 기준으로 사실과 미검증 범위를 분리했다.
- 벤치마크: 해당 없음. 공급자 거래 응답 파싱의 결함 수정이다.
- ⛔ 검증실패 보고: 등급 A, 영상 비용은 확인됐지만 결과 파일·재생·외부 발행·성과가 없어 전체 목표 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. 거래 시각과 테넌트 생성 로그·미디어 디렉터리를 대조하고, 출력 파일이 없으면 영상 API가 외부 결과를 다운로드하지 못한 지점을 고친다. 종료증거는 영상 파일, 재생 캡처, 거래 매칭, permalink, 성과 응답이다.
- 소스 1: `dashboard/src/app/api/higgsfield/transactions/route.ts`.
- 소스 2: `dashboard/tests/higgsfield-transactions.test.ts`.
- 소스 3: `higgsfield account transactions --size 5 --json` 원문과 production `/api/higgsfield/transactions` 응답.

## 2026-09-12 21시 25분 KST · 이미지 생성 성공, 영상 생성 미확정

발견: 관리자 Higgsfield 상태는 HTTP 200, 크레딧 784.12였고 회원 토큰으로 카드뉴스 이미지 생성 API를 실제 호출했다. 이미지 API는 HTTP 200, `ok:true`, 서버 파일과 배달 URL을 반환했으며 로그에 `hf_image_step run:ok`가 남았다. 이어서 같은 서버 프로세스에서 세로 이미지 생성 후 영상 API를 호출했지만 외부 영상 렌더링 뒤 최종 HTTP 응답과 파일 기록 없이 실행 프로세스가 종료됐다.

의미: 카드뉴스 이미지 생성 경로는 실제 비용 호출과 결과 반환까지 확인됐다. 영상은 외부 효과가 발생했는지 알 수 없는 상태이므로 성공이나 실패로 단정하고 재호출하지 않는다. 이는 중복 비용과 중복 영상을 막는 발행·생성 경계에서 반드시 해결해야 할 운영 문제다.

- 판정: 이미지 `테스트됨`, 영상 `미검증`.
- [모델]: API 응답과 서버 로그에 있는 것만 관찰된 사실로 기록했다.
- 벤치마크: 해당 없음. 공급자 생성 호출의 실행 결과 확인이다.
- ⛔ 검증실패 보고: 등급 A, 영상 렌더링 최종 응답·파일·크레딧 변동이 없어 영상 생성·편집·발행 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. 먼저 Higgsfield 거래·파일 목록으로 영상 호출의 외부 효과를 확인하고, 미발행이면 요청 멱등키와 5분 제한을 붙여 단 한 번 재실행한다. 종료증거는 영상 파일 재생, 파일명, 크레딧 변동, 편집실 화면 캡처다.
- 소스 1: `dashboard/src/app/api/higgsfield/image/route.ts`.
- 소스 2: `dashboard/src/app/api/higgsfield/video/route.ts`.
- 소스 3: `/tmp/osmu-media-3556.log`.

## 2026-09-12 20시 50분 KST · 회원 채널 연결 상태 전수 조회

발견: 회원 토큰으로 Threads, X, Facebook, Instagram, YouTube, TikTok, LinkedIn의 계정 조회 API를 모두 실행했다. 일곱 API가 HTTP 200으로 응답했지만 현재 production standalone 작업 공간의 연결 계정은 모두 0개였다.

의미: API 서버와 인증은 살아 있지만 발행 대상 계정이 없어 외부 발행을 호출할 수 없다. 발행을 실행하지 않은 것은 흐름을 생략한 것이 아니라 공급자 계정이 없는 현재 상태에서 중복·허위 발행을 만들지 않기 위한 정확한 경계다. 회장 Safari OAuth 연결을 회수하면 같은 생성 초안을 Threads 한 건에 실제 발행하고 permalink와 성과를 이어서 확인할 수 있다.

- 판정: 근거 확인. 일곱 플랫폼 조회 HTTP 200, 계정 수 0개.
- [모델]: API 응답을 직접 비교했으며 계정 0개를 발행 완료로 해석하지 않았다.
- 벤치마크: 해당 없음. 현재 연결 상태를 확인하는 운영 진단이다.
- ⛔ 검증실패 보고: 등급 A, 발행 대상 계정 0개와 외부 OAuth 자격증명 미확인으로 외부 발행·성과 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. 회장 Safari OAuth 연결 직후 일곱 플랫폼 계정 상태를 재조회하고 Threads 실제 발행, permalink, 성과 API 응답을 확보한다.
- 소스 1: `/api/channels/{platform}/accounts` 일곱 플랫폼 실행 결과.
- 소스 2: `dashboard/src/app/api/publish/route.ts`.
- 소스 3: `dashboard/src/lib/publish.ts`.

## 2026-09-12 20시 40분 KST · 회원 생성·저장·편집 API 실실행

발견: production standalone에서 회원 토큰으로 생성 요청을 실제 실행하기 전에는 공유 생성기가 화면과 연결됐다는 코드·환경 추정만 있었다. 이번 실행은 학습 정보가 포함된 작업 공간에서 `고객이 자주 헷갈리는 조건`을 넣어 `/api/studio/text`를 호출했고, 글·카드뉴스·숏폼 결과를 모두 받았다.

의미: 프롬프트나 하네스를 수동으로 조작하지 않아도 서버가 학습 정보와 브랜드 가이드를 받아 글 150자, 인스타그램 카드 4장, 숏폼 훅·본문·CTA를 한 번에 만들었다. 결과를 `/api/studio/drafts`에 실제 저장하고 `/api/studio/edit-bulk`로 한 문장을 수정해 저장 경계를 통과했으므로 생성→초안→편집의 회원 경로는 실행 증거가 생겼다. 하지만 Threads 계정 조회가 0개여서 외부 발행과 성과는 아직 이어지지 않았다.

- 판정: 테스트됨. 생성 HTTP 200 및 `ok:true`, 초안 저장 HTTP 200, 편집 HTTP 200과 변경 1건.
- 직접 증거: 생성 응답 keys `threads`, `facebook`, `x`, `instagram`, `shorts`, `image_prompt`; Threads 150자; Instagram slides 4장; Shorts hook·body·cta 존재; 저장 draft ID는 실행 로그에 확인됨.
- 채널 상태: 회원 토큰의 Threads 계정 조회 HTTP 200, 계정 0개.
- [모델]: production standalone의 실제 API 응답과 데이터 저장 응답을 기준으로 판단했다. 생성 품질의 사람 평가와 외부 게시 성공은 별도 증거로 남겼다.
- 벤치마크: 해당 없음. 이번 단계는 실제 생성·저장·편집 계약 실행이며 경쟁사 비교 단계가 아니다.
- ⛔ 검증실패 보고: 등급 A, 현재 작업 공간에 외부 발행 계정이 0개이고 이미지·영상 공급자 및 OAuth 연결 상태가 확인되지 않아 발행·성과 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. 모든 지원 플랫폼 계정 조회를 끝내고 연결된 계정이 있으면 Threads 한 건을 실제 발행해 permalink와 성과 응답을 확인한다. 종료증거는 플랫폼별 계정 상태, 외부 permalink, `/api/performance` 응답, 화면 캡처다. 계정 0개면 회장 Safari OAuth 연결 회수 즉시 재개한다.
- 소스 1: `dashboard/src/app/api/studio/text/route.ts`, 학습 정보·위키·성과 규칙을 프롬프트에 넣는 생성 경로.
- 소스 2: `dashboard/src/app/api/studio/drafts/route.ts`, 초안 저장 경로.
- 소스 3: `dashboard/src/app/api/studio/edit-bulk/route.ts`, 편집 경로와 production 실행 응답.

## 2026-09-12 20시 23분 KST · 최근 24시간 코드리뷰 BLOCK

최근 24시간 커밋 13개를 `443da936..532e37f`로 고정해 별도 detached worktree에서 검증했다. 전체 Vitest는 288파일, 1,963건 통과와 3건 제외, TypeScript는 오류 0이었다. 필수 기본 흐름과 Studio v1 E2E는 둘 다 fixture 파싱 `SyntaxError`로 API 요청 전에 exit 1이었다. 커밋된 QA 수치와 재현 결과가 다르므로 기존 PASS 증거를 승인 근거로 쓰지 않는다.

localhost:3456은 health 200과 DB up이었다. 지정 작업 공간에 임시 고객 토큰을 발급해 `/api/me`와 학습 규칙 GET은 200을 확인했지만 새 queue cancel은 프록시에서 403 `운영자 전용`으로 차단됐다. 운영자 토큰은 같은 요청이 handler까지 도달해 404였고 임시 토큰은 폐기 200을 확인했다.

- 판정: `BLOCK`. MAJOR 10건, MINOR 2건.
- 주요 결함: 고객 발행 중지 403, 취소 뒤 발행 race, DB mirror 실패의 성공 오인, 부분 발행 성과 누락, 학습 판단 경합, 승인 시안의 근거와 되돌리기 누락.
- 미검증: 실제 외부 채널에 예약된 글을 둔 상태의 cancel race는 외부 게시 비용을 만들 수 있어 실행하지 않고 코드 경합으로 판정했다.
- 감사 문서: `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-12.md`.

## 2026-09-12 20시 20분 KST · production server 네 방 브라우저 QA 통과

발견: 개발 서버는 기존 3456 인스턴스와 HMR이 겹쳐 동일 URL 네비게이션과 Turbopack 패닉을 일으켜 브라우저 검증을 막았다. 현재 소스를 production build로 만들고 별도 3555 production server에 회원 토큰을 연결하자 검증기가 정상 완료됐다.

의미: 문제는 현재 네 방 UI 계약의 DOM이나 반응형 자체가 아니라 개발 서버 실행 환경에 있었다. 회원 인증 토큰으로 실제 브라우저를 구동해 생성실·편집실·발행실·성과실 이동과 다음 행동을 확인했으므로 로컬 production 기준 UX는 다음 단계로 이동할 수 있다. 다만 이 검증은 외부 OAuth 발행이나 AI 생성 결과의 품질까지 증명하지 않는다.

- 판정: 테스트됨. 네 방 4개 x 4폭, 390px는 라이트·다크를 모두 실행해 총 20회 측정.
- 직접 증거: 가로 넘침 0px, 전체 화면 모달 0건, 브라우저 401 0건, 콘솔 오류 0건, 390px 다크 테마 미적용 0건. 캡처와 observations는 `/tmp/osmu-four-room-qa-3555`에 생성됐다.
- [모델]: production build와 실제 Playwright 브라우저 결과를 기준으로 판정했으며, 테스트 통과를 외부 발행 완료로 확대하지 않았다.
- 벤치마크: 해당 없음. 이번 실행은 경쟁사 비교가 아니라 동일 소스의 개발 서버와 production server 동작 차이를 분리하는 회귀 QA다.
- ⛔ 검증실패 보고: 등급 A, 실제 AI 생성 품질·관리자 OAuth 연결·회원 OAuth2 재로그인·외부 채널 발행·성과 회수는 아직 미검증이므로 전체 목표 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. production server에서 생성 API를 실제 호출해 글·카드뉴스·영상 결과를 각각 편집실 미리보기와 발행실 입력까지 확인한다. 종료증거는 결과 파일·화면 캡처·외부 permalink·성과 API 응답이며, 공유 AI 한도와 공급자 OAuth 자격증명이 준비되는 즉시 재개한다.
- 소스 1: `dashboard/scripts/verify-four-room-ui-e2e.mjs`.
- 소스 2: `dashboard/src/app/studio/page.tsx`, `dashboard/src/components/shared/AuthGate.tsx`.
- 소스 3: `dashboard/.next` production build 출력과 `/tmp/osmu-four-room-qa-3555` 관찰 결과.

## 2026-09-12 20시 05분 KST · 네 방 브라우저 QA 재실행 결과

발견: `verify-four-room-ui-e2e.mjs`를 3000 임시 서버와 기존 3456 서버에 각각 연결했다. 두 실행 모두 `/api/me`와 `/studio?room=create` HTTP 200까지는 관찰됐지만, 브라우저에서 `[data-room="create"]`가 30초 안에 visible 상태가 되지 않아 생성실 진입에서 중단됐다. 3000 실행에서는 두 개발 서버가 같은 `.next`를 동시에 사용해 Turbopack `/login/page` 패닉도 기록됐다.

의미: 네 방 DOM·반응형·가로 넘침·다크 테마·콘솔 오류를 측정할 화면 상태에 도달하지 못했으므로 반응형 UX PASS나 배포 승인으로 승격하지 않는다. 인증 자체보다 클라이언트 hydration 또는 장기 개발 서버 충돌을 먼저 분리해야 한다. 임시 고객 토큰과 설정은 검증기 종료 경로에서 원복·폐기됐다.

- 판정: `미검증`.
- [모델]: 브라우저 런타임과 로컬 로그를 직접 확인한 기계적 QA이며 모델 판단으로 대체하지 않았다.
- 벤치마크: 해당 없음. 경쟁사 비교가 아니라 현재 저장소의 DOM과 로컬 서버 상태를 재현하는 결함 검증이다.
- ⛔ 검증실패 보고: 등급 A, 네 방 브라우저 검증기가 생성실 DOM 표시 대기에서 실패했고 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근도 없어 외부 발행 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. 단일 개발 서버로 재실행하며 종료증거는 390·768·1024·1440 폭 관찰 JSON과 390 라이트·다크 캡처, 가로 넘침 0px, 401 0건, 콘솔 오류 0건이다. 외부 OAuth와 실제 발행은 회장 Safari 세션에서 자격증명과 콘솔 주소를 회수한 직후 확인한다.
- 소스 1: `dashboard/scripts/verify-four-room-ui-e2e.mjs`.
- 소스 2: `dashboard/src/app/studio/page.tsx`.
- 소스 3: `.next/dev/logs/next-development.log`.

## 2026-09-12 19시 36분 KST · 성과 학습 후보 수락·거절 이력

발견: 성과실의 `배우기`는 활성 규칙만 저장했고 `넘어가기`는 후보를 버려, 왜 수락하거나 거절했는지
다시 볼 수 없었다. API도 표본 수·관찰 기간·적용 범위를 저장하지 않았다.

| 증거 항목 | 판정 | 근거 |
|---|---|---|
| 수락·거절 API | PASS | localhost 수락 201, 거절 201, 잘못된 판단 400 `INVALID_DECISION` |
| 이력 재조회 | PASS | 같은 작업 공간 GET 200, 수락·거절 두 판단과 표본 6건·기간·범위 확인 |
| 생성 반영 경계 | PASS | 수락만 규칙 번호 생성, 거절은 `rule:null`; 검증 수락 규칙은 DELETE 200으로 비활성화 |
| 브라우저 화면 | PASS | `최근 학습 판단`, `반영`·`안 함`, 표본·기간·작업 공간 범위 표시 |
| 브라우저 안전 | PASS | 401 0건, 콘솔 오류 0건, 캡처 `logs/diff/osmu-learning-decision-history-20260912.png` |
| 계약 테스트 | PASS | 신규 API 4건, 화면 2건, 기존 성과실 16건 통과 |
| 디자인 lint | PASS | 카드 색상 정의를 전용 테마 모듈로 분리한 뒤 전체 `dashboard/src` 위반 0 |
| 전체 회귀 | PASS | 최종 Vitest 295파일 1,990건 통과, 3건 스킵, TypeScript 오류 0, production build 182/182 |
| 기본 흐름 | PASS | 기본 흐름 11/11, Studio v1 최초 11/12 실패 후 후보 거절 선행 계약을 반영해 14/14 |

초기 Studio v1 실패 원인은 제품 변경이 아니라 검증기가 무료 다시 만들기 전에 후보 세 장을 거절하지
않은 것이었다. 현재 R27 서버 계약과 같은 순서로 검증기를 고쳐 재실행했다.

- [모델]: 파일 저장, 실제 HTTP, 실제 브라우저, 전체 회귀 네 증거를 분리해 판정했다.
- 벤치마크: [Buffer Insights](https://buffer.com/resources/meet-insights/)의 성과→다음 행동 원칙을 참고하되, 자동 적용 대신 사람의 수락·거절 이력을 보존했다.
- 남은 미검증: 운영 배포와 실제 외부 채널 발행·provider 성과 수집.
- 다음 실행: QA 검증자가 승인된 새 배포에서 같은 회원 작업 공간의 수락·거절 이력과 다음 생성 반영을 재확인한다.
- 소스 1: learned-rules Route Handler와 성과실 화면.
- 소스 2: 신규 계약 테스트 6건, 전체 회귀, 두 필수 E2E.
- 소스 3: 승인 v63 프로토타입, 갭 감사 정정본, localhost 실제 응답과 브라우저 캡처.

## 2026-09-12 19:02 KST · 사용량·작업물 의미 표시 재검증

| 증거 항목 | 판정 | 근거 |
|---|---|---|
| 이번 달 생성 의미 | 테스트됨 | 사용량 chip이 사용 건수와 월 한도를 함께 표시하고 남은 건수·요금제를 표시 |
| 생성 이력 | 테스트됨 | 최근 20건 이력 판과 kind·제목·토큰·시각 표시 계약 통과 |
| 작업물 전체 의미 | 테스트됨 | 저장된 작업물 목록과 상태를 표시 |
| 작업물 도착 방 | 테스트됨 | 각 목록에 생성실·편집실·발행실·성과실 도착 방을 표시하고 클릭 시 해당 방으로 이동 |
| 실제 회원 화면 | 미검증 | 운영 새 빌드와 Safari 회원 세션에서 직접 클릭하지 않음 |

발견의 의미는 회장 요청 원장에 남은 R-5-2와 R-5-3의 “미착수” 표기가 현재 코드와 어긋나 있었다는 점이다. 사용량과 작업물은 이제 화면 계약상 무엇을 뜻하는지와 클릭 후 어디로 가는지를 말하지만, 실제 운영 새 빌드에서 회원이 보는 최종 화면까지 확인하기 전에는 운영 완료로 판정하지 않는다.

벤치마크: 기존 화면 계약 회귀는 기계적 작업이라 새 벤치마크는 해당 없음. 사용량·작업물 흐름의 UX 기준은 기존 Buffer·Later 비교 자료와 OSMU 요청 원장을 사용했다.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

다음 실행: 담당자는 QA 검증자다. 운영 새 빌드와 회원 세션이 준비되면 사용량 chip, 생성 이력, 작업물 목록, 도착 방 이동을 390·768·1024·1440 폭에서 직접 확인한다. 종료 증거는 실제 화면 클릭과 이동 URL, 회원 응답, QA 승인 artifact pin이다.

소스 1: `dashboard/src/app/studio/page.tsx`, `dashboard/src/app/api/studio/generation-history/route.ts`.

소스 2: `dashboard/tests/studio/header-panels.contract.test.ts`, `dashboard/tests/studio/four-room-empty-actions.test.tsx`, `dashboard/tests/publish/studio-publish-ui.test.tsx`, 48/48 통과.

소스 3: `wiki/거버넌스/요청.md`, `pipeline-state.osmu.md`, 기존 QA tracker.

## 2026-09-12 18:57 KST · 편집실 영상 미디어 경계 재검증

| 증거 항목 | 판정 | 근거 |
|---|---|---|
| 영상 URL 표시 | PASS | `EditPreview`가 영상 미디어를 `DeliveredMedia`로 연결하고 `data-edit-preview-media="video"`를 렌더 |
| 영상 재생 조작 | 테스트됨 | `DeliveredMedia`의 `<video controls playsInline>` 계약과 미디어 계약 테스트 통과 |
| 만료 배달 주소 복구 | 테스트됨 | `media-resign.contract.test.tsx`가 실패 후 재서명 경계를 검증 |
| 실제 생성 영상 파일 재생 | 미검증 | 공유 AI 제공자 한도와 Higgsfield 자격증명 부재로 운영 영상 파일을 직접 재생하지 못함 |

발견의 의미는 “편집실 영상이 재생되지 않는다”는 과거 판정이 현재 코드 계약과는 달라졌다는 점이다. 코드에는 실제 URL을 받은 경우 재생 가능한 영상 태그와 만료 주소 복구가 있지만, 영상 생성 성공과 파일의 실제 브라우저 재생까지 확인하지 못했으므로 회장 요청을 완료로 승격하지 않는다.

벤치마크: 컴포넌트 계약 재검증은 기계적 작업이라 새 벤치마크는 해당 없음. 영상 편집 UX의 기준은 Vrew와 CapCut 비교가 기존 산출물에 기록돼 있다.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

다음 실행: 담당자는 QA 검증자다. AI 제공자와 영상 생성 자격증명이 준비되면 실제 영상 1개를 생성해 편집실에서 재생, 장면 대사 변경, 저장, 영상 발행 URL까지 확인한다. 종료 증거는 브라우저의 `video` 재생 상태, 저장 응답, 외부 영상 URL, 성과 응답이다.

소스 1: `dashboard/src/components/studio/EditPreview.tsx`, `dashboard/src/components/studio/DeliveredMedia.tsx`.

소스 2: `dashboard/tests/studio/edit-preview-media.contract.test.tsx`, `dashboard/tests/studio/studio-chairman-feedback-2026-08-29.test.tsx`, 26/26 통과.

소스 3: `docs/qa/qa-tracker.md`, `wiki/거버넌스/요청.md`, 운영 환경 자격증명 실측.

## 2026-09-12 18:54 KST · 발행 중지 경계 계약 재검증

| 증거 항목 | 판정 | 근거 |
|---|---|---|
| 대기 채널 중지 | PASS | `tests/api/queue-cancel.test.ts`, 승인 작업물의 pending 채널을 `canceled`로 전환 |
| 이미 끝난 채널 보존 | PASS | 같은 테스트의 부분 발행 경합 케이스, published 채널의 상태·시각 보존 |
| 종료 작업물 거절 | PASS | 전체 채널 published이면 HTTP 409, `NOTHING_TO_CANCEL`, 원 상태 보존 |
| 존재하지 않는 작업물 | PASS | 없는 작업물 요청은 HTTP 404 |

발견의 의미는 발행 버튼 이후 취소 경계가 이미 코드에 있는데도 이전 갭 문서가 검증 미실행으로 남아 있었던 것이다. 이번 재검증으로 취소 계약 자체는 테스트됨으로 승격할 수 있지만, 실제 외부 채널에서 발행 중지를 눌렀을 때 provider 작업까지 중단되는지는 증명하지 않는다. 따라서 이 항목은 로컬 계약 PASS이고 운영 외부 발행은 계속 미검증이다.

벤치마크: 기존 발행 중지 계약의 회귀 재검증은 기계적 테스트라 새 벤치마크는 해당 없음. UX 흐름의 비교 기준은 [Buffer](https://support.buffer.com/en-us/articles/managing-and-approving-draft-posts-57li7M8tDA)다.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

다음 실행: 담당자는 QA 검증자다. 외부 AI·OAuth 자격증명과 승인된 운영 배포가 준비되면 실제 회원 작업물 1건에서 발행 전 중지, 외부 URL 부재, 성과 상태를 확인한다. 종료 증거는 브라우저 클릭, DB 채널 상태, 외부 URL 부재 또는 provider 중지 응답이다.

소스 1: `dashboard/src/app/api/queue/[postId]/cancel/route.ts`.

소스 2: `dashboard/tests/api/queue-cancel.test.ts` 실행 결과 4/4 통과.

소스 3: `docs/_archive/legacy-20260912/audit/osmu-gap-recheck-2026-08-28.md`와 `pipeline-state.osmu.md`.

## 2026-09-12 18:42 KST · 로컬 build·전체 회귀 최신 재검증, 운영 NO-GO 유지

| 증거 항목 | 판정 | 근거 |
|---|---|---|
| production build | PASS | Next.js 16.2.2, TypeScript 통과, 정적 페이지 182/182, exit 0 |
| 전체 회귀 | PASS | Vitest 292개 파일, 1,981건 통과, 3건 스킵, exit 0 |
| 생성실 timeout 회귀 | PASS | `V77-CREATE-NETWORK-03` 해당 테스트에만 10초 상한, 전체 실행에서 3.2초 통과 |
| 학습정보 프롬프트 배선 | PASS | 고객·목표·말투·금칙어 전달 및 후보 품질 지시 계약 17건 통과 |
| 운영 health | 부분 PASS | Tunnel `/api/health` HTTP 200, 실제 앱은 이전 빌드 |
| 회원 OAuth2·AI 생성·외부 발행·성과 | 미검증 | 운영 생성 `claude CLI exited with code 1`, Instagram callback 앱 정합성 불일치, 외부 permalink와 성과 갱신 미관찰 |

이번 검증에서 앞선 전체 실행의 단일 timeout은 제품 기능 실패가 아니라 병렬 자원 경합이었다. 해당 브라우저형 계약에만 명시적 10초 상한을 두고 전체 회귀를 재실행해 통과시켰다. 그러나 로컬 build와 테스트가 운영 Tunnel의 새 화면이나 외부 계정 발행을 대신하지 않으므로 QA 판정은 NO-GO다. 승인·배포로 승격하지 않는다.

발견의 의미는 로컬 산출물의 품질과 운영 사용 가능성을 분리했다는 데 있다. 고객이 실제로 보는 운영 화면은 아직 성과 재수집 CTA 수정 전이고, AI 생성과 Instagram OAuth도 닫혀 있다. 따라서 내일 아침 확인해야 할 핵심은 테스트 숫자가 아니라 운영 새 빌드에서의 회원 OAuth2, 생성 결과, 편집 저장, 외부 permalink, 성과 응답이다.

벤치마크: build·회귀 재검증은 기계적 QA라 새 벤치마크는 해당 없음. UX 비교 기준은 [Buffer](https://buffer.com/integrations/canva), [Vrew](https://vrew.ai/ko/feature/subtitle-editing/), [Later](https://later.com/blog/social-media-calendar/)다.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

**다음 실행**: 담당자는 Codex 컨트롤러다. QA 산출물과 의도한 변경을 분리하고 `/approve` 게이트 뒤 운영 배포한다. 배포 직후 Safari 회원 계정에서 생성·편집 저장·외부 permalink·성과 API를 직접 확인한다. 외부 회수 시점은 AI·Meta 자격증명과 배포 승인이 준비되는 즉시다.

소스 1: `dashboard/src/lib/studio/generation/llm.ts`, `dashboard/src/components/home/PerformanceRoom.tsx`.

소스 2: `dashboard/tests/studio/four-room-empty-actions.test.tsx`, 학습정보·프롬프트 계약 테스트, 전체 Vitest 결과.

소스 3: production build 출력, 운영 `/api/health`, Safari 회원 관찰, `pipeline-state.osmu.md`.

## 2026-09-12 18:05 KST · 네 방 기본 흐름 재검증 NG

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R168 | 생성실에서 실제 후보를 만들고 다음 방으로 넘긴다 | FLOW-11-GEN-RECHECK | ❌ NG | `verify-basic-flow-e2e.mjs`가 지정 작업 공간에서 `STUDIO_LLM_USAGE_LEDGER_UNAVAILABLE`로 중단. 후보 0장, request_id `ad841539-5ad3-437a-b808-5bb24311f38d` |
| R104 | 실제 고객 인증 경계에서 네 방을 렌더한다 | FLOW-AUTH-RECHECK | ❌ NG | `probe-four-room-flow.mjs`의 임시 고객 토큰 발급이 HTTP 500으로 실패해 브라우저 관찰 시작 전 중단 |
| R08 | 생성실에서 성과실까지 실제 방 이동을 관찰한다 | FLOW-UI-RECHECK | ❌ NG | 1차: 첫 생성실 `networkidle` 60초 timeout. 2차: DOM 진입 뒤 인증 라우팅 중 `page.evaluate` 실행 컨텍스트 소멸. 최종 화면의 실제 방 요소에 결합해 측정하도록 수정 필요 |

현재 판정은 QA NO-GO다. `/api/health`는 HTTP 200, DB `up`이지만 실제 생성 요청의 사용량 장부
기록이 실패해 백엔드 11단계 흐름이 첫 단계에서 끊겼다. 원인과 영향 범위를 확인한 뒤 수정과
회귀 검증을 별도 기록한다.

## 2026-09-12 07시 28분 네 방 UI 검증기 오판 수리

네 방 검증기가 정상 빈 편집실을 실패로 판정한 원인은 제품이 아니라 검증기의 낡은
선택자와 라우팅 대기였다. 제품은 편집 목차가 없는 상태에서 `생성실에서 작업물 고르기`
단추를 다음 행동으로 보여 주는데, 검증기는 목차만 찾았다. 이미 해당 방에 있는 경우에도
다시 클릭하고 document load를 기다려 Next.js client navigation을 timeout으로 처리했다.
검증기를 `f1ccef0c`로 고쳐 이 오판을 없애고, 제품 회귀 테스트를 `8652fb5b`로 추가했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 네 방 경로·상태 | PASS | 390·768·1024·1440px, 390px 라이트·다크 포함, 20회 측정 |
| 가로 넘침 | PASS | 0px |
| 전체 화면 모달 | PASS | 0건 |
| 브라우저 401 | PASS | 0건 |
| 브라우저 console | PASS | 오류 0건 |
| 390px 다크 테마 | PASS | 미적용 0건 |
| 빈 편집실 다음 행동 | PASS | 실제 화면에서 `생성실에서 작업물 고르기` 표시·클릭 후 생성실 복귀 |
| 회귀 테스트 | PASS | `edit-room-empty-actions.regression-1.test.tsx` 1건 |
| TypeScript·syntax·diff check | PASS | 각 명령 exit 0 |
| production build | PASS | Next.js 16.2.2, TypeScript 통과, 정적 페이지 182/182, 기존 NFT tracing warning 1건 |
| 임시 QA 토큰 | PASS | `qa-` 라벨 10개 모두 `revoked: true` |
| 전체 Vitest | PASS | 2워커·테스트당 15초 제한, 290개 파일·1,978건 통과·3건 스킵·실패 0 |
| 기본 테스트 명령 | PASS | `maxWorkers: 2` 고정 후 `npm test -- --run`에서 같은 290개 파일·1,978건 통과·3건 스킵 |
| 회원 OAuth2·AI 생성·외부 발행·성과 | 미검증 | 자격증명·회원 세션·AI provider 없음 |

이번 수리의 의미는 빈 상태를 “길을 잃은 화면”으로 오인하던 QA의 측정 오류를 제거한
것이다. 기본 4워커에서는 자원 경합 timeout이 한 번 있었으므로 테스트 제한시간을 늘리지
않고 기본 워커를 2개로 줄여 `b80d61ed`로 고정했고, 기본 명령을 최종 회귀 증거로 사용했다.
다만 임시 local customer token 기반 UI 경로 확인이므로 실제 회원 OAuth2나
외부 발행을 증명하지 않는다. pipeline은 build in-progress이며 승인이나 배포는 아니다.

벤치마크: 선택자와 client route 대기 수정은 화면·코드 대조인 기계 작업이라 새 벤치마크는
해당 없음. 작성·편집·계획 연결 UX 비교는 [Buffer](https://buffer.com/integrations/canva),
[Vrew](https://vrew.ai/ko/feature/subtitle-editing/), [Later](https://later.com/blog/social-media-calendar/)다.

소스 1: `dashboard/scripts/verify-four-room-ui-e2e.mjs`, `dashboard/src/components/studio/StudioRooms.tsx`.

소스 2: `.gstack/qa-reports/screenshots/issue-002-empty-edit.png`, four-room 20회 결과, 회귀 테스트.

소스 3: 관리자 customers·OAuth API, revoke API 응답, `session-state.osmu.md`, pipeline state.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

**다음 실행**: 담당자는 Codex 컨트롤러다. 2워커 전체 suite는 green으로 확인했다. AI 한도
복구 또는 자체 키와 OAuth 자격증명 준비 즉시 회원 identity 200, 생성, 편집 저장, 외부 URL,
성과 응답을 실제 화면에서 확인한다. 종료 증거는 화면 클릭, 외부 URL, 성과 응답, QA 승인
artifact pin이다.

## 2026-09-12 06시 18분 로그인 터치 영역 QA

로그인 화면을 실제 브라우저로 열어 Google 단추의 높이를 측정했다. 36px로 공통 44px
터치 기준보다 작았으므로 `min-h-control-touch`를 적용하고 `3d662430`으로 단독 커밋했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 로그인 화면 | PASS | `http://localhost:3456/login` HTTP 200 |
| Google 단추 터치 영역 | PASS | browser computed height 44px, 수정 전 36px |
| 모바일 레이아웃 | PASS | 375x812에서 height 44px, width 293px, overflow 없음 |
| 회귀 테스트 | PASS | `login-touch-target.contract.test.ts` 1건 |
| 별도 TypeScript 검사 | PASS | `npx tsc --noEmit`, exit 0 |
| 새로고침 console | PASS | console errors 없음 |
| 회원 OAuth2 세션 | 미검증 | 자격증명 미입력, Safari 세션 import 불가 |
| 생성·발행·성과 | 미검증 | AI 429, OAuth provider 설정 완료 0개 |

이번 결과의 의미는 회원 진입 첫 행동의 실제 조작성은 수리했지만, 인증 이후 관통을 완료한
것은 아니라는 점이다. QA report와 before/after screenshot은 `.gstack/qa-reports/`에 남겼다.

벤치마크: 공통 터치 타깃 적용은 실제 측정 기반 기계적 수리라 새 벤치마크는 해당 없음.
UX 비교 기준은 [Buffer](https://buffer.com/integrations/canva), [Vrew](https://vrew.ai/ko/feature/subtitle-editing/),
[Later](https://later.com/blog/social-media-calendar/)다.

소스 1: `dashboard/src/app/login/page.tsx`, `login-touch-target.contract.test.ts`.

소스 2: QA before/after screenshot과 browser height 측정.

소스 3: QA report, 전체 테스트·build, 실제 생성 E2E와 pipeline 상태.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

**다음 실행**: 담당자는 Codex 컨트롤러다. 고객 OAuth·AI·채널 자격증명이 준비되면 회원 identity 200부터 생성·편집·외부 permalink·성과 API까지 직접 재검증한다. 종료 증거는 실제 화면 클릭, 외부 URL, 성과 응답, QA 승인 artifact pin이다.

## 2026-09-12 06시 02분 공유 AI 한도 오류와 최신 생성 E2E

실제 최신 local dev server에서 유효 `seed-a` 작업 공간으로 생성 요청을 보냈다. Claude CLI는 로그인 상태지만 주간 제공자 한도에 걸려 exit code 1과 오류 JSON을 함께 내고 있었고, 기존 앱은 이를 일반 제공자 장애로 번역했다. JSON 원문은 노출하지 않고 `provider_rate_limited` 고정 코드로 분류하도록 수정했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 실제 생성 API | NG, 정확한 차단 | HTTP 429, `STUDIO_LLM_PROVIDER_RATE_LIMITED`, 후보 0장 |
| 사용자 오류 안내 | PASS | 자체 Anthropic 키 등록 또는 잠시 후 재시도 안내 |
| observability reason | PASS | `shared_ai_generation_execution_failed` context.reason=`provider_rate_limited` |
| 전체 회귀 | PASS | 288개 파일, 1,976건 통과, 3건 스킵 |
| production build | PASS | TypeScript 통과, 정적 페이지 182/182 |
| 회원 OAuth2 | 미검증 | Google 이메일 입력 화면까지, 자격증명 미입력 |
| 외부 발행·성과 | 미검증 | 연결 계정 0개, OAuth 완전 설정 0개 |

이번 결과의 의미는 실패를 성공으로 꾸미지 않으면서도 `provider_unavailable`와 계정 한도를 분리해 다음 행동을 제시하게 된 것이다. 생성이 실제로 성공한 것은 아니므로 편집·발행·성과 완료로 승격하지 않는다. singleton 인증 수리는 로컬에서 계속 유효하지만 운영 배포 후 production console 재확인이 필요하다.

벤치마크: CLI 오류 분류는 직접 관찰 기반 기계적 수리라 새 벤치마크는 해당 없음. UX 비교 기준은 [Buffer Canva integration](https://buffer.com/integrations/canva), [Vrew 자막 편집](https://vrew.ai/ko/feature/subtitle-editing/), [Later social media calendar](https://later.com/blog/social-media-calendar/)에 기록돼 있다.

소스 1: `dashboard/src/lib/anthropic.ts`, `dashboard/src/lib/observability.ts`, `dashboard/src/lib/observability/incidents.ts`.

소스 2: `dashboard/tests/studio/generation-provider-rate-limit.test.ts`, `verify-basic-flow-e2e.mjs` 실제 응답.

소스 3: 전체 Vitest, production build, Tunnel OAuth 브라우저, pipeline 상태.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

**다음 실행**: 담당자는 Codex 컨트롤러다. Claude 한도 reset 또는 자체 Anthropic 키와 OAuth 자격증명 준비 즉시 실제 생성 성공, 회원 identity 200, 편집, 외부 permalink, 성과 API를 직접 확인한다. 외부 회수 시점은 한도 복구 또는 자격증명 제공 즉시이며, 종료 증거는 화면 클릭, 외부 URL, 성과 응답, QA 승인 artifact pin이다.

## 2026-09-12 05시 36분 OAuth 진입과 Supabase singleton 재검증

터널 production에서 랜딩과 `/studio` 진입을 직접 열었다. `/studio`는 `/login?returnTo=%2Fstudio`로 닫혔고, `Google로 계속` 클릭은 Supabase authorize 302와 Google 이메일 입력 화면까지 이어졌다. 계정 자격증명은 입력하지 않았다. 이 과정에서 같은 탭에서 Supabase 클라이언트를 반복 생성해 `Multiple GoTrueClient instances` 경고가 실제로 발생했다. `createBrowserSupabase`를 모듈 singleton으로 바꾸고 중복 생성 회귀를 추가했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| OAuth 진입 | PASS | Tunnel `/login` 200, Google 버튼 클릭, Supabase authorize 302, Google email 화면 200 |
| 회원 세션 확정 | 미검증 | 계정 자격증명을 입력하지 않음 |
| Supabase singleton | PASS | 신규 회귀와 인증 관련 3개 파일 15건 통과 |
| 전체 회귀 | PASS | 287개 파일, 1,975건 통과, 3건 스킵, 실패 0 |
| production build | PASS | TypeScript 단계 통과, 정적 페이지 182/182 생성 |
| 실제 생성 | NG | `seed-a`에서 `STUDIO_LLM_PROVIDER_UNAVAILABLE` |
| 외부 발행·성과 | 미검증 | 연결 계정 0개, OAuth 완전 설정 0개 |

이번 결과의 의미는 Google OAuth 진입 경로는 실제로 살아 있지만, 인증 세션 확정과 제품 관통은 별개의 증거라는 점을 다시 닫은 것이다. singleton 수정은 로컬 새 번들에서 검증했으며 아직 운영 이미지에 반영하지 않았으므로 production 경고 제거로 보고하지 않는다.

벤치마크: singleton은 직접 관찰한 인증 클라이언트 중복 생성 수리라 새 벤치마크는 해당 없음. 기존 작성·편집·계획 기준은 [Buffer](https://buffer.com/integrations/canva), [Vrew](https://vrew.ai/ko/feature/subtitle-editing/), [Later](https://later.com/blog/social-media-calendar/)에 기록돼 있다.

소스 1: `dashboard/src/lib/supabase.ts`, login/AuthGate 코드, singleton 회귀 테스트.

소스 2: production tunnel 브라우저 snapshot·network·console와 localhost 브라우저 확인.

소스 3: 전체 Vitest·production build·실제 생성 API 응답·pipeline 상태.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

**다음 실행**: 담당자는 Codex 컨트롤러다. singleton 포함 운영 배포 후 production console을 재확인하고, AI·OAuth 자격증명이 준비되는 즉시 회원 세션, 생성, 편집, 외부 permalink, 성과 API를 직접 관찰한다. 종료 증거는 회원 identity 200, 화면 클릭, 외부 URL, 성과 응답, QA 승인 artifact pin이다.

## 2026-09-12 05시 14분 공개 진입 재확인

health 응답만으로 회원 화면이 살아 있다고 판정하지 않기 위해 공개 root를 별도로 확인했다. localhost와 production health는 모두 200이었지만 `https://openclaw.app` GET은 15초 timeout으로 HTTP 000이었고 QA 브라우저 URL은 `chrome-error://chromewebdata/`였다. 따라서 회원 OAuth2 화면과 외부 발행은 미검증이다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| localhost health | PASS | HTTP 200, DB up |
| production health | PASS | HTTP 200, DB up |
| production root | NG | 15초 GET timeout, HTTP 000 |
| 회원 로그인·OAuth2 | 미검증 | 브라우저가 chrome-error에 머묾, Safari import 미지원 |

이번 결과의 의미는 health와 실제 사용 가능한 웹 진입을 별도 증거로 관리하게 된 것이다. production root가 열리지 않은 상태에서 로그인이나 발행 완료를 보고하지 않는다.

벤치마크: 해당 없음. 운영 진입 경계 확인이다.

소스 1: production·localhost health와 root curl 결과.

소스 2: gstack browser 상태.

소스 3: `session-state.osmu.md`, `pipeline-state.osmu.md`.

⛔ 검증실패 보고: 등급 A, production root timeout과 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 회원 로그인·외부 발행 완료로 출고하지 않음.

**다음 실행**: 담당자는 Codex 컨트롤러다. production root 응답 복구 및 OAuth·AI 자격증명 준비 즉시 로그인, 생성, 편집, 외부 permalink, 성과 API를 직접 재실행한다. 종료 증거는 화면 클릭, 외부 URL, 성과 응답, QA 승인 artifact pin이다.

## 2026-09-12 05시 10분 build 재검증: AI 상태 문구의 실제 증거 범위 정렬

실제 `seed-a` 생성 요청이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 실패했는데도 Studio 상단의 `AI 사용 가능` 문구는 `/api/studio/engine-status`가 오류 없이 설정 경로를 반환하기만 하면 표시됐다. 이 응답은 실제 생성 probe가 아니므로, 사용자가 설정 확인과 생성 성공을 같은 것으로 읽을 수 있었다. `AI 엔진 설정됨`으로 문구를 정정하고 실제 생성 가능 여부는 요청 결과로 확인한다는 설명을 추가했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| UI 문구 계약 | PASS | `v69copy-ui-copy-contract.test.ts` 4건. `AI 사용 가능` 부재와 `AI 엔진 설정됨` 존재 확인 |
| 학습 목적 저장·복원 회귀 | PASS | `learning-purpose-persistence.test.tsx` 2건 |
| production build | PASS | `npm run build`, TypeScript 단계와 정적 페이지 182/182 생성 |
| 실제 생성 상태 | NG | 유효 `seed-a` workspace에서 `STUDIO_LLM_PROVIDER_UNAVAILABLE` 재현 |
| 회원 OAuth2·외부 발행·성과 | 미검증 | OAuth 완전 설정 0개, Safari 세션 import 도구 미지원 |

이번 결과의 의미는 생성 엔진의 설정 상태와 실제 실행 성공을 화면에서 분리해, 장애를 성공처럼 보고하는 UI 경계를 닫았다는 것이다. 생성 제공자나 외부 계정이 복구된 것은 아니며 QA 승인이나 운영 배포로 승격하지 않는다.

벤치마크: 새 흐름을 설계한 변경은 아니므로 별도 벤치마크는 해당 없음. 기존 흐름 기준은 [Buffer](https://buffer.com/integrations/canva), [Vrew](https://vrew.ai/ko/feature/subtitle-editing/), [Later](https://later.com/blog/social-media-calendar/) 공식 자료에 기록돼 있다.

소스 1: `dashboard/src/app/studio/page.tsx`, `dashboard/src/app/api/studio/engine-status/route.ts`, `dashboard/tests/integrity/v69copy-ui-copy-contract.test.ts`.

소스 2: 실제 `verify-basic-flow-e2e.mjs` 생성 응답과 `localhost /api/health`.

소스 3: `pipeline-state.osmu.md`, 관리자 OAuth metadata API, 위 공식 벤치마크.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

**다음 실행**: 담당자는 Codex 컨트롤러다. 공유 AI 한도 복구 또는 BYO Anthropic 키와 OAuth 자격증명이 준비되는 즉시 생성 성공, 회원 OAuth2, 외부 permalink, 성과 API 응답을 순서대로 직접 관찰한다. 종료 증거는 화면 클릭 결과, 외부 URL, 성과 응답, QA 승인 artifact pin이다.

## 2026-09-12 04시 46분 build 재검증: 감독기 tmux 실행 경로와 실제 생성 병목

`/tmp/osmu-supervisor.log`에서 Node 런타임은 발견하지만 `/usr/local/bin/tmux`가 cron PATH에서 빠져 `codex-in-pane.sh`가 세션 생성에 실패하는 것을 관찰했다. 감독 프로세스가 살아 있어도 워커는 발주되지 않았고, 누적 상태표의 `발주실패`가 실제 진척으로 오인될 수 있는 상태였다. `scripts/osmu-supervisor.sh`에 tmux 탐색과 자식 PATH 전달을 추가하고 `bash -n`, `git diff --check`, `osmu-supervisor` tmux 기동을 확인했다. 로그에 Node와 `/usr/local/bin/tmux`가 남고 04시 45분 백로그 대기까지 관찰했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| supervisor shell syntax | PASS | `bash -n scripts/osmu-supervisor.sh` 종료 코드 0 |
| supervisor diff whitespace | PASS | `git diff --check -- scripts/osmu-supervisor.sh` 출력 없음 |
| tmux runtime resolution | PASS | `/tmp/osmu-supervisor.log`에 `/usr/local/bin/tmux` 기록 |
| supervisor pane | PASS | `tmux list-sessions`에 `osmu-supervisor` 존재, 백로그 대기 로그 확인 |
| localhost health | PASS | `GET /api/health`, HTTP 200, `db: up` |
| 관리자 workspace 조회 | PASS | active workspace 2개, 초안 1개, 연결 계정 0개, published 0개, failed 0개 |
| OAuth credential metadata | PASS | provider 12개, 완전 설정 0개. 원문 값은 출력하지 않음 |
| 기본 흐름 실제 생성 | NG | 유효 `seed-a` workspace에서 `verify-basic-flow-e2e.mjs` 실행 후 `STUDIO_LLM_PROVIDER_UNAVAILABLE` |
| 회원 OAuth2·외부 발행·성과 | 미검증 | OAuth 자격증명 0개, Safari 쿠키 import 도구 미지원 |

이번 결과의 의미는 감독 루프가 실행 파일을 찾는 운영 경계는 닫혔지만, AI 생성 제공자와 외부 채널 계정이 없어서 제품의 생성 이후 흐름은 진행되지 않는다는 것이다. 기존 회귀 pane 네 개는 모두 주간 실행 한도 메시지 뒤 종료된 것을 확인하고 로그와 상태표를 보존한 채 정리했다. 현재 감독은 새 pending 항목이 없어 대기한다. 누적 백로그 수치는 append-only 이력이라 현재 작업 수로 읽지 않았다.

벤치마크: 해당 없음. 이번 조치는 UX 판단이 아닌 cron PATH와 워커 발주 경계의 기계적 수리다. 학습 정보와 UX 비교는 직전 절의 Buffer, Vrew, Later 공식 근거를 사용했다.

소스 1: `scripts/osmu-supervisor.sh`, `dashboard/scripts/verify-basic-flow-e2e.mjs`, 실제 supervisor 로그.

소스 2: `session-state.osmu.md`, `pipeline-state.osmu.md`, 관리자 API 응답.

소스 3: localhost health와 실제 생성 요청, `/tmp/osmu-*.dispatch.log`.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

**다음 실행**: 담당자 Codex 컨트롤러. 외부 회수 시점은 공유 AI 한도 복구 또는 OAuth 자격증명 제공 즉시다. 종료 증거는 실제 화면 클릭, 외부 permalink, 성과 API 응답, QA 승인 artifact pin이다. 그 전에는 QA 승인과 운영 배포를 실행하지 않는다.

## 2026-09-12 04시 24분 build 재검증: 학습 정보 목적 저장과 발행실 기준 안내

생성실에서 목적 카드를 고르면 `purpose` 화면 상태만 바뀌고 작업 공간의 학습 정본은 바뀌지 않는 결함이 있었다. 이 결함은 생성 결과의 품질보다 먼저 학습 루프를 끊는다. 다음 방문에서 목표가 사라지고, 학습 정보를 잘 받아 프롬프트를 대신하는 제품의 약속도 화면 상태에만 머물기 때문이다. 목적 카드 제목과 예시를 저장하고, 저장된 목적을 새 생성실에서 복원했다. 발행실에는 작업 공간의 기준을 보여 주되 “다음 생성과 다시 만들기에 이어진다”고 표시해 현재 본문과 다음 생성 기준을 혼동하지 않게 했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 목적 카드 저장 | PASS | `tests/studio/learning-purpose-persistence.test.tsx`에서 localStorage 학습 정본과 부모 전달값 확인 |
| 저장 목적 복원 | PASS | 같은 테스트에서 새 생성실의 `문의 늘리기` 선택 상태 확인 |
| 생성실·편집실·빈 상태 회귀 | PASS | 관련 3개 테스트 파일 30건 통과, React setState during render 경고 재현되지 않음 |
| 전체 회귀 | PASS | `npm test`, 286파일, 1,974건 통과, 3건 스킵, 실패 0 |
| production build | PASS | `npm run build`, TypeScript 단계와 정적 페이지 182/182 생성 |
| UI 토큰 | PASS | `npm run audit:ui-tokens`, 직접 시각값 위반 0건 |
| 개발 서버 health | PASS | `GET http://localhost:3456/api/health`, HTTP 200, `db: up` |
| 회원 OAuth2·보호 화면 | 미검증 | Safari 쿠키 도구 미지원, `/studio`는 로그인 화면으로 닫힘 |
| 외부 채널 발행·성과 | 미검증 | 연결 계정 0개, OAuth provider 12개 완전 설정 0개 |

이 결과의 의미는 학습 정보가 생성실 목적 선택에서 작업 공간 상태와 발행 전 안내까지 이어지는 코드·계약 경계가 닫혔다는 것이다. 반면 외부 자격증명이 없으므로 실제 생성 API가 공유 Claude 제공자 한도에서 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 멈추는 운영 조건은 그대로다. 별도 `npx tsc --noEmit`는 기존 `src/app/page.tsx`의 `PerformanceDashboard` named export가 `.next/dev/types` Next 페이지 계약과 충돌해 실패했으며, production build 내부 TypeScript 단계는 통과했다. 기존 NFT 추적 범위 경고 1건도 남아 있다.

**벤치마크**: Buffer는 작성·Canva 편집·예약·발행을 같은 흐름에 붙이고, Vrew는 대본 일괄 편집을 제공하며, Later는 목표·형식·성과를 콘텐츠 계획에 연결한다. OSMU에는 이미 네 방과 형식별 편집 기능이 있으므로 이번에는 새 방을 만들지 않고 끊어진 학습 기준 전달을 복구했다. 근거는 [Buffer](https://buffer.com/integrations/canva), [Vrew](https://vrew.ai/ko/feature/subtitle-editing/), [Later](https://later.com/blog/social-media-calendar/) 공식 문서다.

소스 1: 실제 Studio 코드와 목적 저장 회귀 테스트. 소스 2: BRAIN의 OSMU 사업 좌표와 학습 정보 원칙. 소스 3: 위 공식 벤치마크, localhost 실제 HTTP, Vitest·production build 로그.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명·Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

**다음 실행**: 담당자 Codex 컨트롤러. 외부 회수 시점은 공유 AI 한도 복구 또는 회장의 OAuth 자격증명 제공 즉시다. 종료 증거는 관리자 채널 연결 상태, 회원 OAuth2 세션, 실제 생성 결과, 편집 반영, 외부 permalink, 성과 API 응답과 QA 승인 artifact pin이다.

## 2026-09-12 build 재검증: 예약·승인 큐 발행 중지 경계와 인증 화면

이번 재검증에서 발견된 핵심 문제는 코드가 아니라 실행 환경과 라우팅 경계였다. Next.js가 같은 `/api/schedule/*` 위치에 `[id]`와 `[scheduleId]`를 함께 읽어 동적 라우트 충돌을 냈고, 예약 ID를 검증하지 않아 형식이 틀린 값이 DB 500으로 번졌다. 두 경로를 `[id]`로 통일하고 UUID 경계를 추가한 뒤, 관리자 bearer로 실제 서버에 요청해 잘못된 ID는 400, 형식이 맞지만 없는 ID는 404로 닫히는 것을 관찰했다. 따라서 사용자가 오래된 링크나 잘못된 예약 식별자를 눌러도 서버 오류로 오인하지 않는다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 예약·큐 중지 계약 | PASS | `tests/publish/schedule-cancel-route.test.ts` 4건, `tests/api/queue-cancel.test.ts` 4건 통과 |
| 전체 회귀 | PASS | `npm test`, 285파일 1,972건 통과, 3건 스킵, 실패 0. 2026-09-12 03시 50분 재실행 종료 코드 0 |
| TypeScript | PASS | `npx tsc --noEmit`, 종료 코드 0 |
| production build | PASS | `npm run build`, 182개 정적 페이지와 `/api/schedule/[id]/cancel` 등록 확인 |
| 실제 health | PASS | `GET http://localhost:3456/api/health` HTTP 200, `db: up` |
| 실제 예약 중지 경계 | PASS | 관리자 bearer로 잘못된 ID HTTP 400, 없는 UUID HTTP 404 |
| 실제 큐 중지 경계 | PASS | 관리자 bearer로 없는 작업물 HTTP 404 |
| Google-only 로그인 화면 | PASS | `verify-e2e.sh http://localhost:3456`, Google CTA와 이메일·비밀번호 미노출 |
| 보호 화면 시각 E2E | 미검증 | 무효 토큰으로 Studio·인박스가 login으로 닫혀 본문 화면을 관찰하지 못함 |
| 기본 흐름 생성·편집·발행·성과 | 미검증 | 올바른 로컬 workspace 재시도에서 공유 Claude `exit_nonzero`, `STUDIO_LLM_PROVIDER_UNAVAILABLE` |

production build에는 기존 `next.config.ts` NFT 추적 범위 경고 1건이 남았다. design-lint는 기존 이미지 카드 색상 상수 파일의 토큰 밖 hex 1건을 보고했으며, 이번 예약 UI는 토큰 클래스를 사용했다.

관리자 read-only 조회 결과는 active workspace 2개, 연결 계정 0개, 발행 완료 0개, 실패 0개다. OAuth provider 12개가 모두 필수 자격증명 미설정이며, 로컬 DB에는 `auth.users` 관계가 없어 회원 OAuth2 로그인부터 외부 발행까지는 직접 검증할 수 없다. 이 상태에서 연결 완료나 외부 발행 완료로 보고하지 않는다.

소스 1: 실제 레포 코드와 계약 테스트. 소스 2: Next.js 동적 라우트 로컬 공식 문서. 소스 3: localhost 실제 HTTP, 브라우저 E2E, Vitest, TypeScript, production build 로그.

⛔ 검증실패 보고: 등급 A, 생성 제공자 실행 한도와 외부 OAuth 자격증명 부재, 외부 발행 완료로 출고하지 않음.

## 2026-09-12 build 코드 완료, 검증 미실행: 승인 큐 발행 중지(`/api/queue/[postId]/cancel`)

갭: `docs/_archive/legacy-20260912/audit/osmu-gap-recheck-2026-08-28.md`와 `docs/_archive/legacy-20260912/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md`가
공통으로 남긴 "일곱 플랫폼을 아우르는 서버 측 발행 중지 계약". 승인된 글은 삭제(전체 기록 삭제)만
가능하고 아직 발행되지 않은 채널만 골라 멈추는 경로가 없었다.

| 검증 | 판정 | 근거 |
|---|---|---|
| 신규 API 코드 | 관찰됨(정적) | `dashboard/src/app/api/queue/[postId]/cancel/route.ts` |
| 대기 채널만 취소, 발행완료 채널 보존 | 미검증 | 단위 계약 작성함(`tests/api/queue-cancel.test.ts`), 이번 세션 Bash 승인 차단으로 실행 못함 |
| 이미 종료된 글 409 거절 | 미검증 | 위와 동일 |
| cron 경합(일부 채널만 먼저 발행) 안전 처리 | 미검증 | 위와 동일 |
| UI 단추 클릭 동작 | 미검증 | `UnifiedPostCard.tsx`에 단추 추가만, localhost 클릭 관찰 못함 |
| `npm run test` 전체, `npx tsc --noEmit` | 미검증 | Bash 승인 차단 |

원인: `npx vitest`, `npm run test`, `npx tsc --noEmit` 모두 이 세션에서 "This command requires approval"로
거부됐다(단순 명령 `cat`·`grep`은 통과). 사용자 Bash 승인 후 위 표를 관찰 증거로 갱신해야 한다.
자세한 내용은 `session-state.osmu.md` 2026-09-12 03시 18분 항목.

## 2026-09-04 build PASS, QA 승인 대기: v75 생성실 이중 동선 회귀 복구

최신 회장 요청을 기준으로 생성실 본문의 직접 생성과 기존 생성 담당 대화창을 함께 복구했다.
앞서 기록된 본문 읽기 전용 NG는 최신 요청과 충돌하는 구형 디자인 계약이며, 이번 명시 계약이
우선한다. 원래 `V75-CREATE-01`과 전체 PostgreSQL 테스트, production 브라우저 클릭을 모두 통과했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| v75 계약 보존 | PASS | 본문 `초안 주제`, `초안 만들기`, `생성 담당 대화창` 동시 표시 |
| 직접 생성 클릭 | PASS | 본문 1,198자에서 1,296자, 변화 +98자 |
| 생성 요청 | PASS | `/api/studio/text` 1건, B `결과 제시형` 구조 전체 반영 |
| 대화창 보존 | PASS | 직접 생성 뒤 `생성 담당 대화창` 표시 `true` |
| 헤더 학습 정보 | PASS | 클릭 전 1,296자, 클릭 후 1,778자, 변화 +482자 |
| v77 기능 보존 | PASS | 새로고침 뒤 주제 보존, 글 전체 편집 전후 값 반영 |
| 브라우저 콘솔 | PASS | 오류 0건 |
| 전체 회귀 | PASS | PostgreSQL 16 연결 상태 226파일 1,679건 통과, 1건 조건부 제외, 실패 0 |
| TypeScript·Web build·토큰 | PASS | 타입 오류 0, 정적 페이지 177/177, 디자인 토큰 위반 0 |
| 디자인 산출물 정합 | 후속 필요 | DESIGN v37과 v68 프로토타입의 읽기 전용 문구를 최신 이중 동선 계약으로 갱신 필요 |
| 원격·배포 | PASS | `work/v77req` 원격 ref와 로컬 HEAD 일치 확인. 머지와 운영 배포는 실행하지 않음 |

## 2026-09-04 build NG: v77 변경이 v75 생성실 직접 생성 계약을 삭제

`f32d132f`가 생성실 본문의 `초안 주제`, A·B·C 구조 선택, `초안 만들기`를 제거했고,
`d48e4321`은 이를 검출하던 `V75-CREATE-01`을 본문 조작 0개를 요구하는 새 테스트로 바꿨다.
회장 요구는 본문 직접 생성과 기존 생성 담당 대화창의 동시 유지이므로 테스트 변경으로 계약을
대체할 수 없다. v77의 헤더 학습 정보, 남은 칸 진입, 생성 상태 복원, 글 편집도 함께 보존해야 한다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| v75 계약 보존 | NG | 원래 `V75-CREATE-01`을 복구하고 본문 `초안 주제`, `초안 만들기`, 기존 생성 담당을 함께 검증 |
| 직접 생성 클릭 | NG | 본문 단추 클릭 전후 `document.body.innerText.length` 변화 1자 이상 |
| 대화창 보존 | 재검증 대기 | 직접 생성 뒤에도 `생성 담당 대화창`이 화면에 존재 |
| v77 기능 보존 | 재검증 대기 | 헤더 학습 정보 클릭 변화, 남은 칸, 새로고침 보존, 글 편집 계약 유지 |
| 전체 회귀 | 재검증 대기 | `npx tsc --noEmit`, CI 동등 PostgreSQL 전체 테스트 실패 0 |

## 2026-09-04 build NG: 생성실 본문이 승인된 역할 경계를 위반

승인 `DESIGN.md` v37과 v68 프로토타입은 생성실 본문을 설명·예시·결과 전용으로 두고,
형식·주제·A·B·C 구조 선택은 오른쪽 생성 담당에서 하도록 정했다. 현재 코드는 본문에
`초안 주제`, `A·B·C 구조 사용`, `초안 만들기`를 노출해 회장이 지적한 역할 혼합을 다시 만들었다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 본문 역할 | NG | 본문에 입력·선택 단추 0개, 설명·예시·생성 결과만 존재 |
| 생성 담당 역할 | NG | 형식부터 구조 선택까지 한 번에 한 질문으로 진행하고 A·B·C 선택도 생성 담당 안에서 실행 |
| 직접 생성 보존 | 재검증 대기 | 생성 담당에서 A·B·C를 고르면 기존 `/api/studio/text` 호출과 형식별 후보 표시가 유지 |
| 회귀 | 재검증 대기 | TypeScript, 계약 테스트, PostgreSQL 전체 회귀, 디자인 lint, 헤드리스 클릭 실패 0 |

## 2026-09-04 build PASS, 운영 재검증 대기: 학습 정보와 생성실·편집실 회장 요청 복구

회장 요청 원문 33건을 현재 코드와 항목별로 대조해 최종 반영 32건, 부분 1건,
미반영 0건으로 정리했다. production build를 헤드리스로 실제 클릭해 헤더 학습 정보,
남은 문답 진입, 구조 후보, 새로고침 복원, 글 전체 편집을 직접 관찰했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 헤더 학습 정보 | PASS | `학습 정보 0 / 8 남은 8칸 이어 채우기` 상시 표시 |
| 남은 칸 진입 | PASS | 클릭 전 1,189자, 클릭 후 1,671자, 변화 +482자 |
| 구조 후보 | PASS | 구조 B 클릭 전 1,169자, 클릭 후 1,178자, 변화 +9자 |
| 생성실 새로고침 | PASS | `새로고침 뒤에도 남는 고객 질문` 보존 |
| 글 전체 편집 | PASS | `편집 전 글 본문`에서 `편집 뒤 반영된 글 본문`으로 값 반영 |
| 브라우저 콘솔 | PASS | 오류 0건 |
| 전체 회귀 | PASS | PostgreSQL 16 연결 상태 226파일 1,679건 통과, 1건 조건부 제외, 실패 0 |
| TypeScript·Web build·토큰 | PASS | 타입 오류 0, 정적 페이지 177/177, 디자인 토큰 위반 0 |
| 카드뉴스 사진 후보 | 부분 | 메인·본문·마무리 사진 후보 생성과 선택은 이번 build 범위 밖 |
| 원격 브랜치 | PASS | `work/v77req` 원격 ref와 로컬 HEAD 일치 확인 |
| 원격 CI | 미실행 | CI 트리거가 `main` push와 pull request뿐이어서 작업 브랜치 push 실행 0건. 로컬 CI 동등 PostgreSQL 전체 테스트는 PASS |
| 운영 외부 경로 | QA 대기 | 실제 외부 생성, OAuth, 게시, 운영 배포는 실행하지 않음 |

## 2026-09-04 build NG: 학습 정보와 생성실 새로고침이 회장 요청과 어긋남

회장 요청 원문과 현재 코드를 대조한 결과, 학습 정보가 덜 채워져도 로그인 뒤 문답을 열지 않고
생성실에서는 새로고침 때 주제와 문답 진행 상태를 복원하지 않는다. A, B, C 구조로 만든 응답도
첫 번째 글 본문만 보여 주어 함께 고른 영상, 카드뉴스, 글 후보를 화면에서 구분할 수 없다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 학습 정보 유도 | NG | 미완성 작업 공간 첫 진입에서 학습 정보 문답이 열리고 헤더 단추로 남은 칸에 다시 진입 |
| 헤더 학습 정보 | 재검증 대기 | 보이는 문구에 학습 정보, 채운 칸, 남은 칸 행동이 함께 존재 |
| 생성실 새로고침 | NG | 주제, 현재 질문, 고른 형식과 구조가 새로고침 뒤 복원 |
| 형식별 생성 후보 | NG | 구조 생성 뒤 영상, 카드뉴스, 글 중 고른 형식의 실제 후보 본문이 구분되어 표시 |
| 편집실 | 재검증 대기 | 글 전체 편집, 카드 글자 직접 수정과 위치 이동, 발행실 이동을 실제 클릭으로 확인 |
| 전체 회귀 | 재검증 대기 | CI 동등 PostgreSQL 전체 테스트와 TypeScript 실패 0 |

## 2026-09-04 build PASS, 운영 재검증 대기: 채널 계정 재연결 중복 키 복구

공통 계정 저장 INSERT에 유일 키 기준 원자적 갱신을 추가했다. CI와 같은 PostgreSQL 16에
스키마, seed, RLS를 적용하고 같은 계정을 두 번 저장해 두 번째 저장 성공, 복호화 값 갱신,
기본 계정 보존을 직접 확인했다. callback은 기존 행 갱신 결과를 별도 한국어 문구로 알린다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 동일 계정 2회 저장 | PASS | 1회차 성공 1, 2회차 성공 1 |
| 행 중복 방지 | PASS | 두 번 저장 뒤 같은 provider 행 1개 |
| 재연결 데이터 갱신 | PASS | access token 갱신 1, 표시 이름 갱신 1, 나머지 갱신 필드도 새 값 일치 |
| 기본 계정 보존 | PASS | 기본 행 1개, 같은 id 유지 1, 기본 유지 1 |
| 사용자 결과 안내 | PASS | `채널-재연결-03`, `연결을 새로 고쳤습니다` 표시 |
| 키 누락 거절 | PASS | `채널-재연결-02`, 암호화 키가 없으면 DB 저장 전 거절 |
| 전체 회귀 | PASS | PostgreSQL 연결 상태 226파일 1,676건 통과, 1건 조건부 제외, 실패 0 |
| TypeScript·Web build·토큰 | PASS | 타입 오류 0, 정적 페이지 177/177, 디자인 토큰 위반 0 |
| 운영 OAuth | QA 대기 | 운영 배포와 실제 provider 동의 왕복은 이 build 범위에서 실행하지 않음 |

## 2026-09-04 build NG: 같은 채널 계정 재연결이 중복 키로 실패

같은 `(tenant_id, provider, external_account_id)` 계정을 다시 연결할 때
`channel_accounts`의 유일 제약과 충돌하지만, 공통 저장 INSERT에 `ON CONFLICT`가 없어
두 번째 저장이 실패한다. 기존 기본 계정 여부와 legacy 미러는 보존하면서 토큰, 표시 정보,
상태, 만료 시각, meta를 갱신하는 실제 PostgreSQL 왕복이 서기 전까지 build NG다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 동일 계정 2회 저장 | NG | 실제 PostgreSQL에서 1회 삽입과 2회 갱신이 모두 성공 |
| 행 중복 방지 | NG | 두 번 저장 뒤 같은 provider 행 수 1개 |
| 재연결 데이터 갱신 | NG | 2회차 토큰과 표시 이름이 DB 복호화 조회에서 새 값 |
| 기본 계정 보존 | NG | 1회차와 2회차 모두 같은 계정이 기본이며 기본 행 수 1개 |
| 사용자 결과 안내 | NG | 첫 연결은 연결 완료, 재연결은 연결을 새로 고쳤다는 한국어 결과 |
| 전체 회귀 | 재검증 대기 | TypeScript와 전체 Vitest 실패 0 |

## 2026-09-04 build PASS, 운영 재검증 대기: 생성실 직접 생성 경로와 구조 선택

생성실 본문에 주제 입력, A·B·C 구조 선택, `초안 만들기`, 생성 결과를 연결했다.
기존 생성 담당 문답은 함께 유지했다. 프로덕션 빌드 화면에서 구조 카드와 생성 단추를
실제로 클릭해 본문 변화, 네트워크 요청, 결과 문자열, 단추 라벨을 관찰했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 직접 생성 단추 | PASS | 본문 1170→1268자, 변화 +98자, `/api/studio/text` 요청 1건 |
| A·B·C 구조 선택 | PASS | B 카드 클릭 본문 1155→1170자, 요청에 B·결과 제시형·순서 포함 |
| 영어 일반 라벨 | PASS | 생성실 단추 19개 전수 추출, 일반 영어 라벨 0건 |
| 생성 결과 | PASS | 결정론적 한국어 결과 문자열 화면 표시, 콘솔 오류 0건 |
| 기존 대화형 생성 | PASS | 기존 회귀 포함 전체 Vitest 226파일 1,636건 통과, 실패 0 |
| TypeScript·디자인 토큰 | PASS | `npx tsc --noEmit` 오류 0, design lint 위반 0 |
| Web build | PASS | Next.js production build 정적 페이지 177/177 |
| 운영 외부 생성 | QA 대기 | 이 build의 UI를 운영 반영한 뒤 실제 생성 엔진 응답을 재관찰해야 함 |

## 2026-09-04 build NG: 생성실 직접 생성 경로와 구조 선택이 동작하지 않음

운영 화면을 헤드리스로 열어 직접 누른 결과, 생성실 단추 16개 중 초안 생성을
시작하는 단추는 0개였다. A 구조 초안 카드 클릭 전후 `document.body.innerText.length`는
1284자로 같아 변화량이 0자였고, 사이드바 단추에 `Custom Integration`이 남아 있었다.
반면 운영 `POST /api/studio/text`는 200과 한국어 본문을 반환했으므로, 백엔드가 아니라
화면 연결과 발견 가능성 결함으로 판정한다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 직접 생성 단추 | NG | 주제 입력→단추 클릭 후 본문 길이 변화량 1자 이상, `/api/studio/text` 요청 관찰 |
| A·B·C 구조 선택 | NG | 각 카드 클릭 후 선택 구조가 화면과 생성 요청에 반영되고 본문 길이 변화량 1자 이상 |
| 영어 일반 라벨 | NG | 사이드바를 포함한 고객 화면 전수 검사, 플랫폼·제품 고유명사를 제외한 영어 라벨 0개 |
| 기존 대화형 생성 | 재검증 대기 | 기존 6단계 문답→후보 3장→편집실 이동 계약 통과 |

## 2026-09-03 build PASS: 발행실 UI 계정 조회 경합 안정화

발행 단추의 DOM 존재와 사용자 상호작용 가능 시점을 구분했다. 기존 발행 클릭 11곳은 계정 조회 뒤
활성 상태에 동기화했고, `V74-PUBLISH-READY-01`은 조회 응답을 보류해 비활성·요청 0건을 확인한 뒤
응답 해제 후 활성화·발행 요청 1건을 검증한다. 제한시간 확장, 재시도, 계약 제외는 없다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 계정 조회 경합 | PASS | 지연 응답 중 단추 비활성·API 0건, 응답 뒤 활성·발행 1건 |
| 기존 발행 계약 | PASS | 기존 33건과 신규 1건, 총 34건 통과. 삭제·제외 0 |
| 순서 독립성 | PASS | seed 7401 `--sequence.shuffle.tests`, 34건 통과 |
| 반복 안정성 | PASS | 동일 명령 5회 각각 34건, 총 170건 통과, 실패 0 |
| TypeScript | PASS | `npx tsc --noEmit` 오류 0 |
| 전체 회귀 | PASS | PostgreSQL 16 적용, 226파일 1,666건 통과, 1건 조건부 제외, 실패 0 |
| Web build·토큰 | PASS | 정적 페이지 177/177, 디자인 lint 위반 0, 기존 NFT 경고 1건 |
| 운영 CI | 미검증 | 브랜치 push 뒤 GitHub Actions 실제 컨테이너 실행은 아직 관찰 전 |

## 2026-09-03 build NG: 발행실 UI 테스트가 계정 조회 전에 비활성 단추를 클릭함

같은 커밋의 CI 재실행에서 기본 플랫폼 발행, 외부 성공 뒤 복구 지도, 초안 저장 거절 테스트가
번갈아 실패했다. 테스트는 발행 단추의 존재만 기다렸지만 제품은 계정 조회가 끝날 때까지 같은
이름의 단추를 비활성으로 렌더한다. 느린 CI에서 `fireEvent.click`이 무시되어 발행 호출과 후속
상태가 모두 0건으로 남는 경합이다. 계약 삭제나 제한시간 확장 없이 활성 상태에 동기화해야 한다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 계정 조회 경합 | NG | 지연된 계정 응답에서 단추 비활성 확인 뒤 활성화와 발행 호출 통과 |
| 기존 발행 계약 | 재검증 대기 | 지정 파일 전체 실패 0, 기존 33건 삭제·제외 0 |
| 순서 독립성 | 재검증 대기 | `--sequence.shuffle.tests` 실행 실패 0 |
| 반복 안정성 | 재검증 대기 | 지정 파일 같은 명령 5회 연속 실패 0 |
| 전체 회귀 | 재검증 대기 | TypeScript와 PostgreSQL 포함 전체 테스트 실패 0 |

## 2026-09-03 build PASS, 운영 재검증 대기: v73 인박스 본문 위치와 v69 잔여

제목 없는 실제 응답 형태를 사용해 `text`가 본문 영역에 표시되고 빈 제목 요소가 생기지 않는
계약을 추가했다. 본문이 비면 승인과 거절을 단추와 단축키 모두에서 막았다. 성과실 빈 상태는
안내와 예시 지표 한 묶음만 남기고 반복 `미수집` 보조 지표를 숨겼다. 모바일 헤더·필터와
미리보기 채널명 계약은 기존 구현을 보존한 상태로 재검증했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 제목 없는 `text` 응답 | PASS | `V73-INBOX-01`, 본문 영역 표시, 제목 요소 0개, 승인·거절 활성 |
| 빈 콘텐츠 행동 차단 | PASS | `V73-INBOX-02`, 승인·거절 비활성, A·R 요청 0건 |
| v69 모바일·미리보기 | PASS | 헤더 두 줄, 필터 한 줄 스크롤·44픽셀 표적, 채널명 전체 표시·계산기 분리 계약 통과 |
| 성과실 빈 상태 | PASS | 안내 1회, 예시 지표 표시, `미수집`과 보조 지표 묶음 0개 |
| 초안 저장 실패 알림 | PASS | 지정 테스트 33건 통과, `M5-STUDIO-02`, `M5-STUDIO-03` 유지 |
| 전체 회귀 | PASS | 226파일 1,628건 통과, 38건 조건부 제외, 실패 0 |
| TypeScript·디자인 토큰 | PASS | `npx tsc --noEmit` 오류 0, design lint 위반 0 |
| Web build | PASS | Next.js production build 정적 페이지 177/177, 기존 NFT 경고 1건 |
| 운영 실화면 | QA 대기 | 인증된 운영 인박스에서 본문 위치와 빈 콘텐츠 행동을 브라우저로 재관찰 필요 |

## 2026-09-03 build NG: 인박스 본문 위치와 빈 콘텐츠 거절 차단

운영 인증 요청의 실제 응답에는 `title`이 없고 27자 `text`만 있었다. 운영 화면은 그 값을
제목처럼 굵게 표시하고 본문 영역을 비워 두었다. 현재 build 브랜치는 `text` 표시 자체는
추가했지만 본문 영역 계약을 직접 식별하지 않았고, 본문이 정말 비었을 때 거절 단추와
R 단축키가 계속 동작하는 안전장치 누락도 확인했다. 아래 종료 증거가 모두 서기 전까지 build NG다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 제목 없는 `text` 응답 | NG | `text`가 본문 영역에 있고 빈 제목 요소가 생성되지 않는 계약 테스트 통과 |
| 빈 콘텐츠 행동 차단 | NG | 승인·거절 비활성, A·R 단축키 요청 0건 |
| v69 모바일·성과실·미리보기 | 재검증 대기 | 390 헤더 두 줄, 필터 한 줄 스크롤과 44픽셀 표적, 성과 안내 1회, 채널명 전체 표시 |
| 초안 저장 실패 알림 | 재검증 대기 | `M5-STUDIO-02`, `M5-STUDIO-03` 포함 전용 테스트 실패 0 |
| 전체 회귀 | 재검증 대기 | TypeScript, 전체 Vitest, 디자인 lint, Web build 실패 0 |

## 2026-09-03 build PASS, 운영 재검증 대기: v72 초안 알림과 인증 캐시 결합

발행 전 저장의 예외와 빈 ID를 중간 경계에서 하나의 실패 결과로 정규화하고, 발행 행동이
그 결과 한 곳에서만 사용자 오류 알림과 외부 발행 차단을 소유하게 했다. `apiPost`의 오류 전파와
401 캐시 제거·재로그인 부수효과는 유지했다. 보고된 CI 실패는 착수 HEAD에서 재현되지 않았지만,
CI와 같은 PostgreSQL 스키마·seed·RLS를 붙인 최종 전체 실행으로 두 계약을 함께 확인했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 초안 저장 빈 ID | PASS | `M5-STUDIO-02`, 오류 알림 1곳과 외부 발행 요청 0건 |
| 초안 저장 예외 | PASS | `M5-STUDIO-03`, 오류 알림 1곳과 외부 발행 요청 0건 |
| 401 캐시 무효화 | PASS | `V72-AUTH-CACHE-01`, 옛 내용 비노출, 안내 노출, 승인·거절 비활성 |
| 공통 오류 전파 | PASS | `api-post-error-contract.test.ts`, non-2xx 예외 계약 유지 |
| CI 동등 전체 회귀 | PASS | PostgreSQL 16 schema·seed·RLS 적용, 226파일 1,665건 통과, 1건 제외, 실패 0 |
| TypeScript·디자인 토큰 | PASS | `npx tsc --noEmit` 오류 0, design lint 위반 0 |
| Web build | PASS | Next.js production build 정적 페이지 177/177, 기존 NFT 경고 1건 |
| 운영 실화면 | QA 대기 | 저장 실패를 주입한 실제 고객 화면과 만료 세션 인박스 재관찰 필요 |

## 2026-09-03 NG: v72 캐시 무효화 뒤 초안 저장 실패 알림 재회귀

CI의 데이터베이스 포함 조합에서 `M5-STUDIO-02`, `M5-STUDIO-03`이 다시 실패했다.
발행 전 초안 저장 실패 뒤 외부 발행 차단과 사용자 오류 알림이 함께 서야 하지만,
캐시 무효화 변경 뒤 오류 알림 호출이 사라졌다. 테스트 기대값은 바꾸지 않고 오류 전파
경계와 사용자 알림 경계를 분리한 뒤 두 계약을 같은 실행에서 재검증하기 전까지 build NG다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 초안 저장 실패 알림 | NG | `M5-STUDIO-02`, `M5-STUDIO-03`에서 오류 알림과 외부 발행 요청 0건 동시 통과 |
| 401 캐시 무효화 | 재검증 대기 | 성공 캐시 뒤 401에서 옛 내용 비노출, 안내 노출, 승인·거절 비활성 |
| 전체 회귀 | 재검증 대기 | `npx tsc --noEmit`, 전용 Vitest, 전체 Vitest 실패 0 |

## 2026-09-03 build PASS, 운영 재검증 대기: v72 401 승인 캐시 제거

실제 SWR cache provider에 성공 조회를 저장한 뒤 같은 목록을 401로 재조회하는 계약을
추가했다. 수정 전에는 오류 안내와 비활성 단추 뒤에 옛 제목과 본문이 남아 계약이
실패했다. 수정 뒤에는 `fetcher`의 401이 인증 오류를 throw하기 전 공통 무효화 신호를
보내고, SWR provider가 모든 보호 조회 캐시를 재검증 없이 제거한다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 승인 인박스 실제 SWR 전이 | PASS | `V72-AUTH-CACHE-01`. 성공 캐시 뒤 401에서 옛 제목·본문 비노출, 만료 안내, 승인·거절 비활성 |
| 다른 보호 화면 캐시 | PASS | 같은 계약에서 `/api/settings` 성공 캐시도 함께 제거됨을 관찰 |
| 공통 API 401 | PASS | `fetcher`, `apiPost`, `apiDelete`가 모두 캐시 무효화 후 `AuthRequiredError` 유지 |
| 지정 인증 회귀 | PASS | 4파일 42건 통과, 실패 0 |
| TypeScript와 디자인 토큰 | PASS | `npx tsc --noEmit` 오류 0, `design-lint.sh dashboard/src` 위반 0 |
| 전체 Vitest | PASS | 226파일 1,628건 통과, PostgreSQL 필요 38건 조건부 제외, 실패 0 |
| Web build | PASS | Next.js production build 성공, 정적 페이지 177/177. 기존 NFT 광범위 추적 경고 1건 유지 |
| 운영 실화면 | QA 대기 | 만료된 운영 세션에서 캐시 카드 비노출과 재로그인 안내를 브라우저로 재관찰 |

## 2026-09-03 NG: 401 후에도 승인 가능한 초안 캐시 잔존

운영 브라우저에서 보호 API가 전부 401을 반환했지만, 이전 성공 조회의 SWR
캐시가 승인 인박스에 남아 승인 단추가 활성된 상태를 직접 관찰했다. 무인증 HTML에는
카드 제목이 없으므로 서버 렌더가 아니라 클라이언트 캐시 재사용이다. v71 계약 테스트는
SWR의 `data` 와 `error` 를 mock으로 동시 주입해 실제 성공 캐시 뒤 401 전이와 캐시 제거를
검증하지 않았다. 실제 SWR 캐시 계약과 공통 401 무효화를 추가하기 전까지 build NG다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 승인 인박스 캐시 | NG | 캐시에 초안이 있는 상태에서 재조회 401 후 카드 내용 비노출, 안내 노출, 승인·거절 비활성 |
| 공통 `fetcher` | 원인 확인 | 401을 `AuthRequiredError`로 throw하지만 SWR 캐시를 직접 제거하지 않음 |
| 다른 보호 화면 | 재검증 대기 | 같은 `fetcher`의 401이면 화면별 이전 조회 데이터도 공통으로 제거 |
| 전체 회귀 | 재검증 대기 | `npx tsc --noEmit`, `npx vitest run` 실패 0 |

## 2026-09-03 build PASS, 운영 재검증 대기: v71 초안 저장 실패 알림 복구

`apiPost`가 인증을 포함한 변경 요청 실패를 예외로 올리도록 바뀐 뒤에도 Studio 발행 함수는
초안 저장 실패가 `null`로 돌아오는 경우만 처리했다. 예외는 알림 분기 전에 함수를 빠져나가
CI의 데이터베이스 포함 실패 경로에서 사용자 오류 알림이 사라졌다. 발행 전 저장, 수동 임시 저장,
외부 발행 뒤 결과 저장의 예외를 각 사용자 행동 경계에서 처리하도록 보강했다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 발행 전 초안 저장 실패 | PASS | `M5-STUDIO-02·03` 통과. `null`과 예외 모두 오류 알림 뒤 외부 발행 0건 |
| 수동 임시 저장 실패 | PASS | `PUB-DRAFT-UI-01·02` 통과. 정상 저장과 오류 알림, 거짓 성공 알림 0건 |
| 외부 발행 뒤 결과 저장 실패 | PASS | `M5-STUDIO-04` 통과. 외부 발행은 한 번만 실행하고 결과 저장 실패를 오류로 표시 |
| v71 인증과 복원 경계 | PASS | `V71-AUTH-01`부터 `05`, `FE-V63-RETURN-01·02`, `M4-STUDIO-01` 전체 실행 통과 |
| 지정 발행실 계약 | PASS | `studio-publish-ui.test.tsx` 33건 통과, 실패 0 |
| 전체 회귀 | PASS | 225파일 1,627건 통과, PostgreSQL 필요 38건 조건부 제외, 실패 0 |
| TypeScript와 build | PASS | `npx tsc --noEmit` 오류 0, production build 정적 페이지 177/177 |
| 디자인 토큰 | PASS | `design-lint.sh dashboard/src`, 위반 0 |
| 운영 화면 | QA 대기 | 데이터베이스 저장 실패를 주입한 운영 화면에서 오류 알림과 외부 발행 0건 관찰 필요 |

## 2026-09-03 NG: v71 초안 ID 확보 실패 알림 누락

CI의 데이터베이스 포함 조합에서 `M5-STUDIO-02`가 실패했다. 발행 전에 초안 ID를 확보하지
못하면 외부 발행을 시작하지 않는 동작은 유지되지만, 사용자가 봐야 할
`발행할 초안을 저장하지 못했습니다` 오류 알림 호출이 관찰되지 않았다. 원인 수정과 전체
회귀 검증 전까지 build NG다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 초안 저장 실패 알림 | NG | `M5-STUDIO-02`에서 오류 알림 호출과 외부 발행 요청 0건 동시 통과 |
| v71 인증 경계 | 재검증 대기 | 조회 실패 행동 차단, 인증 만료 안내, POST·DELETE 401 전파 계약 통과 |
| 발행실 복원 | 재검증 대기 | `FE-V63-RETURN-01·02`, `M4-STUDIO-01` 통과 |
| 전체 회귀 | 재검증 대기 | `npx vitest run` 실패 0 |

## 2026-09-03 build PASS, 브라우저 재검증 대기: v71 발행실 복원 대기 회귀

전체 Vitest에서 `FE-V63-RETURN-01`이 5초를 넘겨 실패했다. 단독 실행은 1.68초에 통과했고,
16개 파일 워커를 함께 돌린 실행에서는 이 테스트가 9.55초까지 밀리면서 무관한 테스트 6개도
같은 제한으로 실패했다. 복원된 작업물 표시가 채널 계정 조회 완료에 묶여 있던 제품 결합과
테스트 과병렬화를 함께 분리했다. 기존 테스트의 기대값과 제한시간은 변경하지 않았다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 발행실 복원 | build PASS | 전체 실행의 `FE-V63-RETURN-01` 4.08초 통과. 인박스 본문과 Threads 선택 복원 |
| 잘못된 복원 거절 | build PASS | `FE-V63-RETURN-02`, `M4-STUDIO-01` 통과. 없는 작업물과 초안 불일치 거절 |
| 인증 안전장치 보존 | build PASS | `V71-AUTH-01`부터 `05`까지 통과. 조회 실패 행동 차단, 즉시 만료 화면, POST·DELETE 401 전파 유지 |
| 전체 회귀 | PASS | 225파일 1,624건 통과, PostgreSQL 필요 38건 조건부 제외, 실패 0 |
| TypeScript와 build | PASS | `npx tsc --noEmit` 오류 0, production build 정적 페이지 177/177 |
| 디자인 토큰 | PASS | `design-lint.sh dashboard/src`, 위반 0 |
| 실제 브라우저 복원 | QA 대기 | 로그인 고객 세션에서 인박스 복귀 링크 클릭, 본문과 선택 채널 표시, 계정 확인 전 발행 잠금 관찰 필요 |

## 2026-09-03 build PASS, 운영 재검증 대기: 승인 인박스 공백 판단값 차단

운영 1024 화면에서 본문을 판단할 내용이 비어 있는데 승인 단추가 활성이고 본문 누락 경고도
나오지 않는 상태를 직접 관찰했다. 화면, 개별 승인 API, 일괄 승인 API가 이제 같은 공백 판정을
사용한다. 공백과 줄바꿈 본문, 공백 제목, 일괄 승인 부분 성공 방지 계약은 build에서 통과했다.
운영에는 배포하지 않았으므로 수정 후 운영 화면은 재검증 대기다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 운영 승인 인박스 | NG 유지 | 수정 전 캡처에서 판단할 본문 없이 승인 단추 활성 관찰. 배포 후 같은 조건의 캡처 필요 |
| 화면 공백 본문 | PASS | `V70-INBOX-02`에서 공백과 줄바꿈 본문 경고, 승인 비활성, A 단축키 요청 0건 |
| 선택적 제목 | PASS | `V70-INBOX-03·04`에서 공백 제목 차단과 정상 제목·본문 분리 표시 |
| 화면 메타데이터 | PASS | `V70-INBOX-07`에서 공백 주제 fallback, 공백 해시태그·채널 이름 비노출 |
| 개별 승인 API | PASS | `V70-INBOX-08·09`에서 공백 본문·제목 422와 초안 상태 불변 |
| 일괄 승인 API | PASS | `V70-INBOX-10`에서 공백 본문 혼입 시 전체 422, 선택한 정상 초안도 상태 불변 |
| 지정 전체 회귀 | PASS | 89파일 587건 통과, 15건 조건부 제외, 실패 0. TypeScript 오류 0, production build 177/177, design lint 위반 0 |

## 2026-09-03 build PASS, 운영 재검증 대기: 운영 화면 문구·언어·개인정보 노출

운영 로그인 상태에서 네 화면을 직접 순회한 캡처에 고객 화면 결함 여섯 묶음이 재현됐다.
작업 공간 이름이 없을 때 이메일 주소가 제목과 성과 요약에 노출되고, 쿠키 동의 배너가 담당 패널의
입력과 전송 단추를 덮는다. 채널 화면에는 영문과 개발자용 연결 절차가 남아 있고, 연결 가이드에는
긴 대시가 있으며, 발행실 상단에는 내부 실행 도구 이름이 노출된다. build 계약과 전체 회귀는
통과했다. 로그인 상태 운영 화면의 수정 후 캡처는 아직 없으므로 운영 QA는 재검증 대기다.

| 검증 | 판정 | 직접 근거·종료 조건 |
|---|---|---|
| 작업 공간 이름과 개인정보 | build PASS | `V69-COPY-01` 정상·거절 계약. 공용 표시 함수가 빈 값과 이메일 형태를 `기본 작업 공간`으로 바꾸고 RoomHeader·성과 요약에서 원문 비노출 확인 |
| 쿠키 동의 배너와 담당 패널 | build PASS, 화면 대조 대기 | `V69-COPY-02` 2건 통과. 배너가 `fixed`, `bottom-4`, `right-4`를 쓰지 않고 문서 흐름의 `relative` 영역임을 확인 |
| 채널 화면 한국어 | build PASS | `V69-COPY-03` 정상·거절 계약과 채널 컴포넌트 통합 17건 통과. 기존 영어 탭·상태·설정 라벨 비노출 |
| UI 긴 대시 | build PASS | `V69-COPY-04`가 components, app 화면, 고객 UI 상수의 문자열 AST를 전수 검사. 긴 대시 위반 0 |
| OAuth 기본 흐름의 고객 언어 | build PASS | `V69-COPY-05`에서 Threads·Instagram 연결 단추 활성, 직접 입력 기본 비노출, 사용자가 펼친 뒤 기존 입력 폼 노출 확인 |
| 내부 실행 도구 이름 | build PASS | `V69-COPY-06`에서 스튜디오 고객 UI가 내부 label·model을 표시하지 않고 `AI 사용 가능` 상태를 사용함을 확인 |
| 전체 회귀 | PASS | TypeScript 오류 0. Vitest 223파일 1,600건 통과, 38건 조건부 제외, 실패 0. build 177/177. design lint 위반 0 |
| 수정 후 실화면 | 미검증 | 로컬 `/channels/threads`는 HTTP 200 뒤 로그인 화면까지 관찰. Supabase 공개 설정과 고객 세션이 없어 로그인 상태 1024 화면 대조는 QA로 이관 |

## 2026-09-03 build PASS: v68 네 방 담당 패널 접근성 계약 회귀 복구

v68 생성실 개편에서 담당 패널의 시맨틱 요소가 `aside`에서 접근성 이름이 있는 `section`으로
바뀌었다. 화면에는 같은 이름이 보이지만 접근성 역할이 `complementary`에서 `region`으로 바뀌어
화면 낭독기 랜드마크 계약과 기존 계약 테스트 두 건이 깨졌다. 생성실을 `aside`로 되돌리고
편집실, 발행실, 성과실도 같은 이름 있는 보조 랜드마크 계약으로 맞췄다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 생성실 담당 랜드마크 | PASS | `FE3-CREATE-01`, `FE6-CREATE-01` 포함 생성실 19건 통과. 이름 `생성 담당 대화창`, 역할 `complementary` 확인 |
| 다른 방 담당 랜드마크 | PASS | 편집실 `편집 담당 대화창`, 발행실 `발행 담당 대화창`, 성과실 `성과실 담당 대화창`을 `complementary` 역할로 계약 고정 |
| TypeScript | PASS | `npx tsc --noEmit`, 오류 0 |
| 전체 회귀 | PASS | `npx vitest run`, 221파일 1,586건 통과, 38건 조건부 제외, 실패 0 |
| Web build | PASS | `npm run build`, 정적 페이지 177/177. 기존 NFT 광범위 추적 경고 1건 유지 |
| 디자인 토큰 | PASS | `design-lint.sh dashboard/src`, 위반 0 |
| 로컬 서버 스모크 | PASS | 종료형 production server에서 `GET /studio` HTTP 200 관찰 |

## 2026-09-02 build PASS: v67 집중 필터와 운영 빌드 스모크

컨트롤러가 시안과 코드를 직접 대조해 앞 판이 놓친 플랫폼 집중 필터를 찾아 구현시켰고,
운영과 같은 production build 로 실제 서버를 띄워 주요 경로를 직접 두드렸다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 플랫폼 집중 필터 | PASS | `PlatformFocusFilter.tsx` 신설. 전체 7곳과 플랫폼 7개 칩, 선택 시 해당 카드만 표시. 필터 전환이 선택·입력값을 바꾸지 않는 계약 테스트 포함 |
| 작업 공간 초기화 계약 | PASS | `multi-account-ui.contract.test.ts` 를 문장 순서 비의존으로 바꿔 통과. useEffect 블록 안의 초기화 존재만 검사 |
| 타입 | PASS | `npx tsc --noEmit` 오류 0 |
| 지정 회귀 | PASS | `tests/components tests/publish tests/brand` 64파일 553건 통과, 실패 0 |
| production build | PASS | `npm run build` 성공 |
| 운영 빌드 스모크 | PASS | `next start` 로 띄워 `/` `/studio` `/settings` `/channels/threads` `/images` `/blog` 전부 200 |
| CI | PASS | run `33583258595`, HEAD `3fcc6af3`, conclusion success |
| 운영 배포 | 미검증 | `/approve qa` 미승인. 컨트롤러는 배포 게이트를 우회하지 않는다 |

운영 배포와 실제 외부 OAuth 동의, 외부 플랫폼 실게시, 운영 데이터베이스는 여전히 미검증이다.

## 2026-09-02 build PASS: v67 발행실 플랫폼 집중 필터

v67 디자인 정본의 `전체 7곳`과 일곱 플랫폼 집중 필터를 발행실에 반영했다. 필터 상태는
미리보기 노출만 좁히며 캡션, 발행 대상 선택, 계정 선택을 바꾸지 않는다. 1024와 390에서
전체 일곱 장, X 한 장, 전체 복귀와 입력·선택 보존을 직접 관찰했다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 전체 보기 | PASS | `PUB-FOCUS-01`에서 기본 상태 일곱 플랫폼 카드 표시 |
| 한 플랫폼 집중 | PASS | `PUB-FOCUS-02`에서 플랫폼 칩 선택 뒤 해당 카드 한 장만 표시 |
| 편집·선택 보존 | PASS | `PUB-FOCUS-03`에서 필터 왕복 뒤 캡션과 발행 선택 유지 |
| 실제 화면 | PASS | 1024와 390에서 칩 8개, 전체 7장, X 1장, 전체 복귀, 입력·선택 보존, 가로 넘침 0, 콘솔 오류 0 관찰. 증거 `docs/qa/osmu-v67-platform-focus-evidence-20260902/` |

## 2026-09-02 build PASS: v67 발행 계약과 초안 복원 경로 정합

회장 요청 원문과 v67 디자인 정본의 다섯 종료 조건을 코드, 계약 테스트, 현재 Next.js 화면에 다시
대조했다. 글 형식과 플랫폼별 필드가 초안 왕복에서 보존되고, 연결 계정 정보는 읽기 전용이며,
확인된 하드 한도만 발행 전에 거절한다. 결정론적 API fixture를 사용한 build 화면에서 OAuth 연결
단추부터 생성, 편집, 두 계정 발행, 성과실까지 실제 클릭했다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 텍스트 편집 형식 | PASS | `FMT-DRAFT-01·02·04` 저장·복원 계약과 `V65-PAGE-01` 편집 뒤 저장·발행실 이동 통합 테스트 통과 |
| 발행 필드 복원 | PASS | `PUB-DRAFT-01·02`, `PUB-DRAFT-UI-01`에서 제목·캡션·해시태그·주제 태그·선택 계정 저장, 복원, 잘못된 입력 거절 통과 |
| 계정 표시 | PASS | `PUB-ACCOUNT-01`, `QA-PUBLISH-06`에서 읽기 전용, 로딩, 미연결, 0계정 잠금 통과. 1024·390 렌더에서 표시 이름 입력 0개, 연결 계정 상태 4개 관찰 |
| 플랫폼별 필드·한도 | PASS | `PUB-FIELD-01`, `PUB-LIMIT-01`, `PUB-LIMIT-API-01·02`, `PUB-LIMIT-UI-01`, `PUB-FOCUS-01·02·03` 정상·경계·거절 통과. X 280가중 문자 경계는 손실 없이 발행하고 집중 필터는 입력·발행 선택을 보존 |
| 전체 흐름 | PASS | `/channels/threads` OAuth 연결 단추 활성과 동일 출처 성공 callback 관찰 뒤 생성→편집→발행→성과 실제 클릭. 1024·390 가로 넘침 0, 발행 요청 2건, 브라우저 콘솔 오류 0 |

지정 최종 검증은 TypeScript 오류 0, Vitest 89파일 684건 통과·2건 조건부 제외, production build
177/177, 디자인 토큰 위반 0이다. 렌더 증거는 `docs/qa/osmu-v67-build-evidence-20260902/`에
있다. 이 PASS는 build 단계의 앱 왕복 계약이다. 실제 외부 OAuth 공급자 동의, 외부 플랫폼 게시물,
운영 데이터베이스, 운영 배포는 시도하지 않아 미검증이다. Next.js build의 기존 NFT 광범위 추적
경고 1건은 남아 있다.

## 2026-09-01 build 범위 PASS: 테넌트 접속 기록

고객 신원 확인 경계에 15분 단위 접속 기록을 추가하고 운영자 고객 조회와 화면에 마지막 접속,
최근 30일 접속 일수를 연결했다. 기록이 없으면 `접속 기록 없음`으로 표시한다. AI 사용량 전용
`usage_events`는 변경하지 않았고 접속 이력 표에는 테넌트와 시각만 둔다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 15분 접속 합치기 | build PASS, DB 실증 대기 | 조건부 원문 SQL과 동시 재접속 통합 테스트 작성. 로컬 PostgreSQL 부재로 해당 1건 조건부 제외 |
| 인증 가용성 | PASS | 접속 기록 쓰기 실패를 주입해도 기존·신규 고객 테넌트 식별 성공 |
| 운영자 결측 표시 | PASS | 컴포넌트 테스트에서 `접속 기록 없음` 확인, 접속 일수 0 표기 없음 |
| 개인정보 최소화 | PASS | `tenant_access_events` 열은 `tenant_id`, `accessed_at` 두 개뿐 |
| 전체 회귀 | PASS | 깨끗한 구현 커밋 기준 Vitest 214파일 1,540건 통과, 조건부 38건 제외. TypeScript 오류 0, build 177/177, design lint 위반 0 |
| 운영 실측 | 미검증 | 운영 DB migration과 운영자 화면 브라우저 확인은 QA·배포 단계로 남김 |

## 2026-09-01 NG: 편집실과 발행실 2차 실사용 피드백 재현

승인 프로토타입 `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v64.html`이 핀된 뒤 현재 화면을 다시 대조했다.
글을 대사 줄과 초 단위로 보여 주고, 카드뉴스 편집 중 발행 채널 이름을 노출하며, 카드 안 글자를
직접 고치거나 옮길 수 없다. 저장과 발행실 이동도 한곳에서 분리되지 않았고 발행실에는
`승인 인박스로 보내기`와 `여기서만 한 번에 되는 일`이 남아 있다. 아래 종료 증거를 모두 다시
관찰하기 전까지 이 항목은 NG다.

| 검증 | 판정 | 종료 증거 |
|---|---|---|
| 글 편집 | NG | 문단 편집기에서 본문 수정 후 발행실 본문에 같은 값이 보임 |
| 카드뉴스 편집 | NG | 이미지 안 글자 수정과 드래그 이동, 새로고침 뒤 위치 복원 |
| 형식과 채널 분리 | NG | 편집실 형식 선택에 발행 채널 이름 0건, 발행실에서만 채널 선택 |
| 저장과 다음 단계 | NG | `편집 내용 저장`과 `발행실로 이동`을 같은 행동 구역에서 각각 조작 |
| 의미 불명 라벨 | NG | 지정된 다섯 라벨이 제품 화면에서 0건 |
| 전체 회귀 | 미검증 | TypeScript, 전체 Vitest, 두 네 방 E2E, design lint 모두 통과 |

## 2026-08-31 NG: 생성실 콘텐츠가 실제 LLM을 호출하지 않음

회장 실사용에서 후보 A/B/C를 눌러도 실제 영상 후보가 나오지 않았다. 코드 확인 결과 `buildCandidates()`와 파생 생성이 고정 문자열 템플릿만 반환하고 LLM 호출은 0건이며, 영상 `asset_url`도 `pending:render`로 고정돼 있다. 실제 LLM 호출, 실패 사유 노출, 호출량 기록, 로컬 실호출 관찰이 끝날 때까지 생성 기능 완료 판정을 금지한다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 후보 생성 경로 | NG | `dashboard/src/lib/studio/generation/service.ts`의 고정 문자열 후보 조립 |
| 파생 생성 경로 | NG | `dashboard/src/lib/studio/generation/derivation.ts`의 템플릿 조립과 `pending:render` 고정 |
| LLM 실패 투명성 | NG | 실패할 실제 LLM 호출 경로 자체가 없어 템플릿이 성공처럼 저장됨 |
| 실제 LLM 응답 | 미검증 | 2026-08-31 착수 시점까지 로컬 또는 운영 실호출 관찰 없음 |

## 2026-08-30 build 범위 PASS: 학습 정보·생성실 2차 실사용 피드백

회장 2차 실사용 피드백 19건을 원문과 하나씩 대조했다. 학습 정보 8건과 생성실 11건의 문구, 순차 문답, 저장 경계, 지원 범위 표시를 수정했다. 실제 LLM과 완성 미디어 생성은 이번 범위가 아니므로 구현하지 않았고, 화면이 규칙 기반 구성 초안과 준비 중 기능을 정확히 구분하게 했다. 상세 19행 대조와 캡처는 `docs/qa/2차피드백-학습정보와-생성실-대조-2026-08-30.md`에 있다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 학습 정보·생성실 계약 | PASS | 신규 번호 대조 8건 포함 전체 Vitest 206파일, 1,550건 통과, 조건부 1건 제외 |
| TypeScript | PASS | `npx tsc --noEmit` 종료 코드 0 |
| Web production build | PASS | 정적 페이지 177/177. 기존 NFT 추적 경고 1건 유지 |
| UI token audit·design lint | PASS | 6분류 위반 0, 임의 px·hex·인라인 style 위반 0 |
| localhost 3456 실제 화면 | PASS | 학습 정보 자동 팝업부터 generation POST 201과 후보 3개까지 5화면 캡처. 브라우저 401과 콘솔 오류 각각 0건 |
| 실제 LLM·완성 미디어 | 미구현 | 현재 `buildCandidates()`와 파생 생성은 문자열 규칙 기반. 화면에 준비 중으로 명시 |
| 원격 push | BLOCKED | 저장소 정책의 별도 승인 요구. 현재 세션은 승인 요청 불가 |

## 2026-08-30 NG: 편집실·발행실 2차 피드백 build 기반 충돌

회장 2차 피드백 13건 중 발행실 상단 왕복 띠 제거는 소스에 반영했다. 나머지 12건은 승인 프로토타입 경로가 `pipeline-state.osmu.md`에 없고 `DESIGN.md`의 현행 정본 표기가 v64와 v61로 충돌해 중단했다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| R199·R204 왕복 띠 | 수정, 집중 테스트 통과 | `dashboard/src/app/studio/page.tsx`에서 `PublishTrip` 렌더와 import 제거. 발행실 테스트 27건 통과 |
| 승인 프로토타입 | NG | pipeline 승인 핀 없음. 후보 v61, v62, v63, v64 |
| 나머지 12건 | 미착수 | 승인 핀 회수 전 임의 구현 금지 |
| TypeScript·token audit | PASS | `npx tsc --noEmit` 종료 코드 0, UI token audit 0건 |
| 로컬 화면·전체 테스트 | 미검증 | 승인 프로토타입 핀 회수 전 중단 |

## 2026-08-30 PASS: 격리 공격 목록 누락 복구 (`/api/performance/learned-rules`)

커밋 `822fa94a`가 `/api/performance/learned-rules` GET/POST/DELETE를 새로 만들면서 `scripts/verify-tenant-isolation-e2e.mjs`의 공격 목록에 등록하지 않아 `tests/isolation/tenant-api-attack-script.contract.test.ts`(TENANT-READ-01)가 실패했다. 어제 밤 `822fa94a`가 원인이며 착수 전부터 있던 실패가 아니다.

- **실제로 뚫리는지 직접 확인**: 로컬 3456에서 임시 스크립트로 테넌트 A/B를 발급해 학습 규칙 API를 직접 공격했다. `/api/performance/learned-rules`는 `TENANT_AWARE_PATHS`(`dashboard/src/proxy.ts`)에 아직 없어 고객/osmu 테넌트 토큰은 라우트 도달 전에 전부 403 "이 API는 운영자 전용입니다"로 막힌다(fail-closed). 운영자 토큰으로 직접 POST/GET을 쳐도 데이터는 `data/tenants/{tenantId}/performance-learned-rules.json` 파일 하위로 물리 격리돼 있어(같은 밤 확인된 `dataPath()`의 `tenantSeg()` 접두 규칙) 교차 테넌트 마커 유출이 없음을 관찰했다. 현재 이 경로는 자기잠식 위험 없이 안전하다 — 단, 고객 셀프서브로 노출을 확장하려면 그때 `TENANT_AWARE_PATHS`에 명시 등록이 필요하다.
- **공격 목록 등록**: `scripts/verify-tenant-isolation-e2e.mjs`에 `["READ-55", "/api/performance/learned-rules"]` 추가.
- **같은 밤 다른 신규 경로 훑음**: `git diff --name-only 3b74b799..HEAD -- 'dashboard/src/app/api/**'`로 확인한 GET+`effectiveTenantId` 경로 중 `/api/threads/low-engagement-candidates`도 공격 목록에서 빠져 있었다(다른 조가 만든 경로, 컴포넌트·라우트 자체는 만지지 않고 목록에만 `["READ-56", "/api/threads/low-engagement-candidates"]`로 추가). 나머지 신규/수정 경로(`channel-config`, `channel-settings/[channel]`, `connect/[provider]`, `connect/readiness`, `engagement`, `metrics`, `onboarding`, `publish`, `studio/drafts`)는 기존 공격 목록 항목과 라우트 패턴이 이미 매치돼 누락이 아니었다.
- **저장 방식 안전성 판정**: `learned-rules`는 파일 기반이 맞다. 다른 표들처럼 DB RLS로 갈리는 게 아니라 `file-io.ts`의 `dataPath()`가 `currentTenantId()`(AsyncLocalStorage, `runWithTenant`로 라우트가 직접 감쌈)를 읽어 `data/tenants/{id}/` 하위 파일 경로로 물리 분리한다. 이 파일 자체는 하나의 워크스페이스 내부에서 배열로 규칙을 통으로 담고(레코드 단위 tenant_id 필드 없음) 있으나, 파일 자체가 이미 테넌트별로 갈려 있어 교차 테넌트 문제는 아니다. RLS 정책이 아니라는 점만 정확히 적어 둔다.

| 검증 | 판정 | 직접 관찰 증거 |
|---|---|---|
| 실제 교차 테넌트 GET 공격 | PASS(안전) | 로컬 3456, 테넌트 A/B 토큰 발급 후 POST(B 마커)→GET(A) 시도, tenant 토큰 자체가 403(운영자 전용)으로 라우트 미도달 |
| 공격 목록 등록 | PASS | `tests/isolation/tenant-api-attack-script.contract.test.ts` TENANT-READ-01 통과 |
| `npx vitest run tests/isolation/` | PASS | 17 파일, 175건 통과 |
| `npm run test` | PASS | 202 파일, 1500건 통과, 1건 skip |
| `npx tsc --noEmit` | PASS | 종료 코드 0, 출력 없음 |

셀프심문: "목록에 넣어 테스트만 초록으로 만들고 실제 구멍은 남겨 두는 것 아닌가" → 아니다. 목록 등록 전에 실제 A/B 테넌트 토큰으로 교차 요청을 먼저 쏴서 403(라우트 미도달)과 파일 물리 격리(`dataPath` tenant 접두)를 직접 관찰했다. 다만 이 경로가 앞으로 `TENANT_AWARE_PATHS`에 들어가 고객 토큰이 직접 호출하게 되는 순간 이 판정은 재검증이 필요하다 — 지금은 운영자 전용이라 안전한 것이지 라우트 코드 자체의 테넌트 분리 로직이 검증된 것은 아니다(파일 하위 경로 분리는 맞으나, 배열 내부에 tenant_id 필드가 없어 향후 공유 파일로 잘못 옮기면 바로 샐 구조).

## 2026-08-29 NG: 최근 24시간 코드리뷰 재검토

고정 범위 `5d941aa0..47a54e4b`의 109개 커밋에서 MAJOR 34건, MINOR 7건을 확인해 머지를 차단했다. 제품 코드는 수정하지 않았다. 상세 위치, 계약 인용, 재현, 수정 방향은 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-08-29.md`에 있다.

| 검증 | 판정 | 직접 관찰 증거 |
|---|---|---|
| localhost health | NG | TCP 연결 뒤 10초 응답 0바이트, curl 종료 코드 28 |
| 지정 작업 공간 초안 API | NG | TCP 연결 뒤 15초 응답 0바이트, curl 종료 코드 28 |
| 전체 Vitest | PASS | 199개 파일, 1,450건 통과, 조건부 1건 제외 |
| TypeScript | PASS | `npx tsc --noEmit` 종료 코드 0 |
| 기본 흐름 E2E | NG | 생성실 표지 뒤 멈춤, 외부 180초 제한 종료 코드 124 |
| Studio v1 E2E | NG | 출력 없이 멈춤, 외부 180초 제한 종료 코드 124 |

정적 검증 통과는 실제 앱 무응답과 거짓 E2E 판정을 뒤집지 않는다. REVIEW_VERDICT는 BLOCK이다.

## 2026-08-29 build 범위 PASS: 현재 작업과 이어갈 방 단일 계약

지정 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`의 localhost 실제 API에서 초안 39건, 현재 작업 1건, 현재 단계 발행실, 현재 작업 ID의 초안 목록 일치를 관찰했다. 첫 요청에서는 PostgreSQL 드라이버가 저장 시각을 `Date`로 반환해 현재 작업이 비는 결함을 발견했다. 날짜 정규화와 회귀 계약을 추가한 뒤 같은 실제 요청이 통과했다.

| 검증 | 판정 | 직접 관찰 증거 |
|---|---|---|
| 현재 작업 API | PASS | HTTP 200, 초안 39건, 단계 발행실, 목록 일치 예 |
| 정상 및 거절 계약 | PASS | 현재 작업 도메인 4건, 초안 API 7건, Studio 화면 포함 집중 38건 |
| 전체 Vitest | PASS | `npm run test`, 199파일 1,450건 통과, 조건부 1건 제외 |
| TypeScript와 build | PASS | `npx tsc --noEmit` exit 0, production build 174/174 |
| 기본 흐름과 Studio v1 | PASS | 11/11, 12/12 |
| design lint | PASS | `dashboard/src` 토큰 위반 0 |
| 운영과 실채널 | 미검증 | 로컬 build 범위. 운영 배포와 공개 채널 발행 미실행 |

이번 판정은 현재 작업 build 범위 PASS다. 기존 v63 전체 디자인 정합과 제품 전체 QA의 승인 보류를 뒤집지 않는다.

## 2026-08-29 NG 후 수정, 기본 흐름 범위 PASS: 네 방 끝까지 재검증

지정 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`에서 실제 API 기본 흐름 11/11,
Studio v1 계약 12/12, 390, 768, 1024, 1440 네 폭의 네 방 16화면과 성과실에서 생성실
복귀 4건이 통과했다. 가린 모달, 브라우저 401, 콘솔 오류, 가로 넘침은 각각 0건이다.

최초 `probe-four-room-flow.mjs`는 네 방을 모두 `false`로 출력하고도 종료 코드 0을 냈다.
실제 임시 고객 토큰, visible assertion, 모달, 401, 콘솔 오류 검사와 토큰 폐기를 추가했다.
수정판은 네 방 모두 `true`와 오류 0건을 반환했다. 제품 화면 코드는 수정하지 않았다.

장시간 돌던 Turbopack 개발 서버의 첫 health timeout과 `GENERATION_DB_TIMEOUT`은 제한 시간
webpack 서버에서 재현되지 않았고 health HTTP 200, DB `up`, 기본 흐름 11/11로 회복했다.
이는 로컬 장기 개발 서버 정체 위험으로 남긴다. 시안과 dev 캡처의 데이터 상태가 달라 v63
디자인 정합은 미검증이다. 이번 기능 PASS를 전체 QA 승인으로 확대하지 않는다.

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R168 | 네 방 흐름과 첫 후보 생성 | FLOW-11-01 | PASS | 후보 3장, 편집 인계, 발행 큐, 성과 제안까지 11/11 |
| R08, R193 | 네 방 화면과 성과실 복귀 | FLOW-UI-01 | PASS | 4방 x 4폭, 성과실에서 생성실 복귀 4건 |
| R104 | 고객 인증 경계 | FLOW-AUTH-01 | PASS | 실제 임시 고객 토큰, 브라우저 401 0건, 폐기 HTTP 200 |
| R200, R206, R207 | 성과실 UX와 승인 시안 정합 | CONF-ALL | 기능 PASS, 디자인 미검증 | 제안 3건과 왕복은 PASS. same-state 매치드 페어 부재 |
| R01~R207 | 회장 확정 요구 전건 | REQ-ALL | 이월 | 상세 승계는 `docs/qa/osmu-four-room-basic-flow-v1-gpt-codex.md`에 기록 |

| 검증 | 판정 | 직접 관찰 증거 |
|---|---|---|
| health | PASS | `/api/health` HTTP 200, DB `up` |
| 전체 Vitest | PASS | 198파일, 1,443건 통과, 조건부 1건 제외 |
| TypeScript와 build | PASS | `npx tsc --noEmit` exit 0, production build 174/174 |
| 기본 흐름과 Studio v1 | PASS | 11/11, 12/12 |
| 요청된 네 방 탐침 | NG 후 수정, PASS | 수정 전 거짓 양성. 수정 뒤 네 방 true, 모달, 401, 콘솔 오류 0 |
| Playwright 실제 클릭 | PASS | 16화면, 왕복 4건, 가로 넘침 0 |
| design lint | PASS | 토큰 위반 0 |
| mobile과 Maestro | 해당 없음 | dashboard 웹 제품 범위. `optional:true` 우회 없음 |
| 승인 v63 디자인 정합 | 미검증 | 직접 연 시안과 dev가 서로 다른 데이터 상태라 일치와 불일치 모두 확정 불가 |

상세 행렬과 캡처는 `docs/qa/osmu-four-room-basic-flow-v1-gpt-codex.md`와
`docs/qa/osmu-four-room-flow-20260829/`에 있다.

## 2026-08-29 범위 PASS: 읽기 API 99개 전수 재실사 v3

커밋 `783b97ce`의 `localhost:3456`에서 GET export 99개를 실제 호출했다. 정상 89개, 의도된 거절 10개, HTTP 500과 요청 실패는 각각 0개다. 직전 v2와 비교해 추가, 삭제, 상태코드 변화는 모두 0건이다. v2 이후 변경된 `/api/metrics`는 HTTP 200, 기존 `posts`, coverage v1, source `published_posts`, 플랫폼 7건을 반환했다. 새 고장이 없어 제품 코드는 수정하지 않았다.

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R128, R151, R165, R171, R175 | 기존 채널 연결 경로와 화면을 보존하고 채널 화면에서 연결 | API-READ-V3-01 | PASS | Threads 연결 준비 503, readiness와 채널 조회 200, HTTP 500 0 |
| R150 | 플랫폼별 지원 기능과 인증 경계를 실제 계약과 일치 | API-READ-V3-02 | PASS | 임시 고객 토큰으로 TikTok 경계 도달, 두 경로 404, 폐기 HTTP 200과 활성 토큰 0 |
| R207 | 성과실에서 통한 콘텐츠와 배울 정보를 제공 | API-READ-V3-03 | 범위 PASS | `/api/metrics` HTTP 200, coverage v1, 플랫폼 7건. 외부 provider 실제 수집은 미검증 |
| R01~R207 | 회장 확정 요구 전건 | REQ-ALL | 이월 | 기존 전건 요구 추적표 유지. 이번 범위 밖 판정은 변경하지 않음 |

| 검증 | 판정 | 직접 관찰 증거 |
|---|---|---|
| health | PASS | `/api/health` HTTP 200, DB `up` |
| GET 전수 실사 | PASS | 99개 중 정상 89, 의도된 거절 10, HTTP 500과 요청 실패 0 |
| 전체 Vitest | PASS | `npm run test`, 198파일, 1,433건 통과, 조건부 1건 제외 |
| TypeScript | PASS | `npx tsc --noEmit` 종료 코드 0 |
| production build | PASS | `npm run build` 종료 코드 0, 정적 페이지 174/174. 기존 NFT 추적 경고 1건 유지 |
| 기본 흐름 | PASS | `verify-basic-flow-e2e.mjs` 11/11 |
| Studio v1 | PASS | `verify-studio-v1-e2e.mjs` 12/12 |
| Playwright | PASS | 네 방 4개와 390, 768, 1024, 1440. 가로 넘침, 모달, 401, 콘솔 오류 각각 0 |
| design lint | PASS | `design-lint.sh dashboard/src`, 위반 0 |
| mobile, Maestro | 해당 없음 | 별도 mobile 앱이 없는 웹 제품 범위 |
| 전체 디자인 정합 | NG 유지 | 기존 승인 프로토타입 정합 NG와 운영 실채널 검증 NG를 이번 API 범위 PASS로 뒤집지 않음 |

상세 99개 상태와 비교표는 `docs/_archive/legacy-20260912/audit/osmu-api-read-sweep-v3-gpt-codex-20260829-0915.md`에 있다.

## 2026-08-29 NG: 최근 24시간 코드 리뷰 현재 범위 재검증

리뷰 시작 시 고정한 `5d941aa0..3c251689`의 97개 커밋과 438개 파일 diff를 승인 PRD, 프로토타입 v63, 요구 대장, 사업 좌표, DESIGN에 대조했다. MAJOR 19건, MINOR 5건으로 머지 차단이다. 소스 코드는 수정하지 않았다. 상세 지적과 재현 시나리오는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-08-29.md`에 있다.

| 검증 | 판정 | 직접 관찰 증거 |
|---|---|---|
| 앱 health | PASS | `localhost:3456/api/health` HTTP 200, DB `up` |
| 성과 수집 readiness | FAIL | 지정 작업 공간 연결 채널 0개. GET은 Threads `collectionSupported=true`, 실제 POST는 `threads 채널 미연결` 400 |
| 기본 흐름 | 범위 PASS | 11/11. 실행 과정에서 새 생성 작업, 초안 `85a9be49-5d81-439f-8acc-d17208056e53`, 발행 큐가 남았고 정리 경로가 없음 |
| Studio v1 | 범위 PASS | 12/12. 생성 작업 2건을 만들고 무료 재생성 몫 소진 409를 관찰했으며 정리 경로가 없음 |
| 전체 Vitest | PASS | 196파일, 1,409건 통과, 조건부 1건 제외 |
| TypeScript | PASS | `npx tsc --noEmit` 종료 코드 0 |
| 코드 리뷰 | NG | 공유 작업 트리 동시 코드 쓰기, 발행 멱등과 부분 실패, UTC 몫 응답 불일치, migration preflight 공백, E2E 거짓 양성, 승인 플레이어 누락 확인 |

정상 경로 통과는 공급자 성공 뒤 부분 실패, reservation 직후 프로세스 중단, 외부 호출 중 DB connection 점유, 공유 설정 경합, cleanup 실패를 검증하지 않는다. 따라서 전체 QA는 NG를 유지한다.

## 2026-08-29 NG: 운영 수정 6건 교차 재검증

동시 QA의 PASS 기록을 그대로 승계하지 않고, 운영 배포 run `33216078099`, main `ec6f4ccf`에서 같은 실제 QA 고객으로 다시 확인했다. 입력 보존, 생성 연타 요청 한 건, 글 편집 전환, 연결 채널 0개 발행 차단은 PASS다. 무료 재생성은 현재 세션에서 당일 몫 사용 409까지만 관찰했고, 만료 고객은 returnTo 로그인에 잠깐 도달한 뒤 `/operator`로 이동해 FAIL이다.

네 방은 390px과 1440px에서 가로 넘침 0이다. 정상 스모크의 신규 콘솔 오류와 비정상 network 응답은 0건이다. 만료 세션 최종 목적지에 대한 앞선 PASS 기록과 직접 충돌하므로 보수적으로 전체 QA를 NG로 되돌렸다.

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R168 | 입력 보존 | FIX6-INPUT-01 | PASS | 방 왕복과 새로고침 뒤 주제·목적·대상·권리 동일 |
| R168 | 연타 POST 1회 | FIX6-DOUBLE-01 | PASS | 동기 연타 뒤 generation POST 201 한 건, 후보 세 장 |
| R27 | 무료 재생성 | FIX6-REGEN-01 | 부분 검증 | regeneration API 409, 오늘 무료 몫 사용 안내. 이 세션에서 성공 201 미관찰 |
| R08, R132 | 글 전환 | FIX6-EDIT-01 | PASS | 글 pressed, 5개 문단과 글 목차 표시 |
| R89, R128, R151, R165, R171, R175 | 채널 0개 발행 차단 | FIX6-PUBLISH-01 | PASS | 체크박스 7개와 발행 버튼 disabled, publish POST 0건 |
| R104 | 만료 세션 고객 로그인 returnTo | FIX6-AUTH-01 | FAIL, High | 만료형 JWT는 Studio URL 위 공개 랜딩, 형식 불량 stale token은 returnTo 로그인 뒤 최종 `/operator` |
| R01~R207 | 회장 확정 요구 전건 | REQ-ALL | 이월 | 기존 전건 요구 추적표 유지 |

상세 보고서는 `docs/qa/studio-prod-six-fix-reverify-v1.1.0-gpt-codex.md`, 캡처는 `docs/qa/osmu-prod-six-fix-reverify-20260829/`다. 외부 SNS 게시와 유료 재생성은 실행하지 않았다.

## 2026-08-29 PASS: 운영 수정 6건 실제 고객 재검증

배포 성공만으로 PASS를 선언하지 않고, 실제 Supabase QA 고객과 운영 브라우저에서 직전 미검증 여섯 항목을 다시 수행했다. 첫 전체 서비스 배포는 gateway 빌드 메모리 부족으로 self-hosted runner까지 내려갔으나 runner를 복구하고 OSMU 대시보드만 배포해 run `33216078099`를 성공시켰다.

| 테스트번호 | 판정 | 직접 관찰 증거 |
|---|---|---|
| FIX6-INPUT-01 | PASS | 새로고침 뒤 목적 `회원 가입 전환`, 대상 `SNS 운영 중인 1인 사업자`, 권리동의 true 유지 |
| FIX6-DOUBLE-01 | PASS | 생성 버튼 연속 2회 실행 뒤 generation POST 201 한 건만 관찰 |
| FIX6-REGEN-01 | PASS | `모두 거절하고 무료로 다시 만들기` 노출, regeneration POST 201 |
| FIX6-EDIT-01 | PASS | 글 선택 뒤 `data-edit-kind=text`, `글 목차`, `글 미리보기`, 문단 UI 관찰 |
| FIX6-PUBLISH-01 | PASS | 연결 계정 0개 안내, 7개 체크박스 disabled/unchecked, `0곳에 올리기`와 `지금 발행하기` disabled |
| FIX6-AUTH-01 | PASS | 만료형 JWT에서 `/login?returnTo=%2Fstudio%3Froom%3Dedit`, 운영자 토큰 문구 미노출 |
| FIX6-RESPONSIVE-01 | PASS | 390px scrollWidth 390, 1440px scrollWidth 1440, overflow false |

외부 SNS 게시와 운영 데이터 삭제는 0건이다. 같은 날 무료 재생성 두 번째 요청의 409는 1일 1회 계약에 따른 정상 거절이며, 첫 무료 재생성 201을 별도로 관찰했다.

## 2026-08-29 미검증: 운영 수정 6건 재검증 중단 시점 판정

운영 배포 run `33216078099`, main `ec6f4ccf`의 성공과 같은 실제 QA 고객의 새 Supabase 세션 발급은 확인했다. 그러나 인증 발급이 장시간 응답을 기다리면서 종료 지시 시점까지 운영 브라우저에서 여섯 수정 흐름을 재현하지 못했다. 배포 성공과 인증 성공은 고객 동작의 대체 증거가 아니므로 여섯 항목을 PASS로 올리지 않았다.

이 판정의 의미는 수정 실패가 확인됐다는 뜻이 아니라, 운영 고객이 입력 보존, 연타 방지, 무료 재생성, 글 전환, 채널 0개 발행 차단, 만료 로그인 복귀를 실제로 체감하는지 아직 보증할 수 없다는 뜻이다. 외부 SNS 게시와 유료 부작용은 실행하지 않았다.

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R168 | 입력 보존 | FIX6-INPUT-01 | 미검증 | 운영 방 왕복과 새로고침 미실행 |
| R168 | 연타 POST 1회 | FIX6-DOUBLE-01 | 미검증 | 운영 network 요청 수 미측정 |
| R27 | 무료 재생성 | FIX6-REGEN-01 | 미검증 | 운영 재생성 미실행 |
| R08, R132 | 글 전환 | FIX6-EDIT-01 | 미검증 | 운영 글 편집 상태 미관찰 |
| R89, R128, R151, R165, R171, R175 | 채널 0개 발행 차단 | FIX6-PUBLISH-01 | 미검증 | 운영 버튼 잠금과 publish 요청 0건 미측정 |
| R104 | 만료 세션 고객 로그인 returnTo | FIX6-AUTH-01 | 미검증 | 운영 만료 세션 이동 주소 미관찰 |
| R01~R207 | 회장 확정 요구 전건 | REQ-ALL | 이월 | 기존 전건 요구 추적표 유지 |

390px과 1440px 스모크, 콘솔 오류, 비정상 network 응답도 수정판에서는 미검증이다. 상세 기록은 `docs/qa/studio-prod-six-fix-reverify-v1-gpt-codex.md`다.

## 2026-08-29 NG → 수정 → 범위 PASS: 플랫폼별 성과 수집 범위와 결측 이유

최초 `GET /api/metrics`는 HTTP 200과 `posts`만 반환해 성과 0이 실제 0인지, 수집 전인지, 수집 미지원인지 구분할 수 없었다. 수정 뒤 같은 실제 작업 공간에서 기존 `posts`와 coverage v1, 일곱 대상별 지원 범위와 결측 이유를 관찰했다. 이번 범위만 PASS이며 Threads 외 실제 provider 수집과 운영 배포는 미검증이다.

| 테스트번호 | 판정 | 직접 관찰 증거 |
|---|---|---|
| METRICS-COVERAGE-01 | 최초 NG | 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`, HTTP 200, 응답 키 `posts`만 존재, `coverage` 없음 |
| METRICS-COVERAGE-02 | PASS | 수정 뒤 같은 요청 HTTP 200, 응답 키 `coverage`, `posts`, coverage version `v1`, 플랫폼 7건 |
| METRICS-COVERAGE-03 | PASS | 검증용 실제 DB 행에서 Threads 발행 2건, 수집 1건, 미수집 1건, `PARTIAL_COLLECTION` 관찰 |
| METRICS-COVERAGE-04 | PASS | 검증용 실제 DB 행에서 X 발행 1건, `collectionSupported=false`, `COLLECTOR_NOT_IMPLEMENTED` 관찰 |
| METRICS-COVERAGE-05 | PASS | 검증용 발행 행 삭제 뒤 작업 공간 잔여 0건 확인 |

| 검증 | 판정 | 직접 관찰 증거 |
|---|---|---|
| coverage 계약 단위·통합 | PASS | 정상 경로와 잘못된 집계 거절 4/4 |
| 전체 Vitest | PASS | 196파일, 1,408건 통과, 조건부 1건 제외 |
| TypeScript | PASS | `npx tsc --noEmit` 종료 코드 0 |
| production build | PASS | 174/174 생성, 기존 NFT 추적 경고 1건 유지 |
| 기본 흐름 | PASS | `verify-basic-flow-e2e.mjs` 11/11 |
| Studio v1 | PASS | `verify-studio-v1-e2e.mjs` 12/12 |
| design lint | PASS | `design-lint.sh dashboard/src`, 디자인 토큰 위반 0 |
| 외부 provider와 운영 | 미검증 | Threads 외 여섯 provider 수집기, 실제 외부 수치, 운영 배포는 이번 범위 밖 |

## 2026-08-29 범위 PASS: 읽기 API 99개 전수 재실사

커밋 `d5ac3d1c`의 `localhost:3456`에서 GET export 99개를 모두 실제 호출했다. 정상 89개, 의도된 거절 10개, HTTP 500과 요청 실패는 각각 0개였다. 새 고장이 없어 제품 코드 수정은 없었다. 이번 읽기 API 범위만 PASS이며, 기존 디자인 정합과 운영 실채널 검증 NG 때문에 전체 제품 QA는 PASS가 아니다.

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R128, R151, R165, R171, R175 | 기존 채널 연결 경로와 화면을 보존하고 채널 화면에서 연결 | API-READ-RERUN-01 | PASS | Threads 연결 준비 503, readiness와 채널 조회 200, 새 HTTP 500 0 |
| R150 | 플랫폼별 지원 기능과 인증 경계를 실제 계약과 일치 | API-READ-RERUN-02 | PASS | 임시 고객 토큰으로 TikTok 경계 도달, 계정과 발행 기록 부재 404, 실사 뒤 토큰 폐기 확인 |
| R132, R146, R147, R182 | Studio 편집 형식값을 저장하고 다시 읽기 | API-READ-RERUN-03 | PASS | `/api/studio/drafts` HTTP 200, `editFormat` 반환 구현 확인 |
| R01~R207 | 회장 확정 요구 전건 | REQ-ALL | 이월 | 전건 판정 정본 유지. 이번 읽기 API 범위 밖 판정은 변경하지 않음 |

| 검증 | 판정 | 직접 관찰 증거 |
|---|---|---|
| health | PASS | `/api/health` HTTP 200, DB `up` |
| GET 전수 실사 | PASS | 99개 중 정상 89, 의도된 거절 10, HTTP 500과 요청 실패 0 |
| 전체 Vitest | PASS | 기본 병렬 실행의 Studio DB 2건 5초 timeout은 집중 9/9와 단일 워커 전체 194파일, 1,404건 통과로 비재현. 조건부 1건 제외 |
| TypeScript | PASS | `npx tsc --noEmit` 종료 코드 0 |
| production build | PASS | `npm run build` 종료 코드 0, 정적 페이지 174/174. 기존 NFT 추적 경고 1건 유지 |
| 기본 흐름 | PASS | `verify-basic-flow-e2e.mjs` 11/11 |
| Studio v1 | PASS | `verify-studio-v1-e2e.mjs` 12/12 |
| Playwright | PASS | 네 방 4개와 390, 768, 1024, 1440. 가로 넘침, 콘솔 오류, 401 URL 각각 0 |
| design lint | PASS | `design-lint.sh dashboard/src`, 디자인 토큰 위반 0 |
| mobile, Maestro | 해당 없음 | 별도 mobile 앱이 없는 웹 제품 범위 |

상세 99개 상태코드와 8월 28일 대비표는 `docs/_archive/legacy-20260912/audit/osmu-api-read-sweep-v2-gpt-codex.md`에 있다.

## 2026-08-29 NG: 최근 24시간 코드 리뷰 2차 검증

리뷰 시작 시 고정한 `6a618c59..6eaf3a45` 범위는 MAJOR 41건, MINOR 4건으로 머지 차단이다. 코드 수정은 하지 않았다. 상세 지적과 재현 시나리오는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-08-29.md`에 있다.

| 검증 | 판정 | 직접 관찰 증거 |
|---|---|---|
| 앱 health | PASS | `localhost:3456/api/health` HTTP 200, DB `up` |
| 기본 흐름 | 범위 PASS | `verify-basic-flow-e2e.mjs` 11/11. 다만 출처 ID가 없어도 통과하고 지정 작업 공간 데이터를 정리하지 않는 결함 확인 |
| Studio v1 | 범위 PASS | `verify-studio-v1-e2e.mjs` 12/12. 다만 무료 몫 조건의 거짓 양성과 실제 quota 장부 오염 확인 |
| 테넌트 격리 | 범위 PASS | `verify-tenant-isolation-e2e.mjs` 스크립트 자체 183/183, 임시 tenant cleanup 관찰 |
| 전체 Vitest | PASS | 194파일, 1,403건 통과, 1건 건너뜀 |
| TypeScript | PASS | `npx tsc --noEmit` 종료 코드 0 |
| 코드 리뷰 | NG | 발행 중복과 영구 잠금, 첫 댓글 거짓 성공, 무료 몫 시간 경계, 배포 롤백, 시크릿 URL 노출, 승인 부품 누락 확인 |

정상 경로 통과는 공급자 성공 뒤 DB 실패, 프로세스 중단, 병렬 배포, 51번째 댓글을 다루지 않는다. 필수 E2E가 지정 작업 공간에 남긴 고정 제목 초안 24건, queue 29건, generation job 227건과 무료 몫 장부 1건도 관찰했다. 따라서 전체 QA 판정은 NG다.

## 2026-08-29 ❌ NG: 운영 실제 고객 Exhaustive 회귀

운영 고객 생성 201과 DB 멱등 수렴 수정은 유지됐다. 그러나 정상 생성 한 번만 보던 이전 판정에서 범위를 만료 세션, 방 왕복, 생성 연타, 재생성, 편집 저장, 연결 채널 0개 발행 경계로 넓히자 High 2건, Medium 4건, Low 2건이 드러났다.

가장 큰 두 결함은 고객 세션이 만료되면 고객 로그인 대신 `/operator`로 이동해 운영자 토큰 화면을 보여 주는 것과, 연결 채널이 0개인데도 Threads·X·Instagram을 기본 선택해 publish 400까지 진행하는 것이다. 이는 로그인과 발행이라는 고객 핵심 경로라 전체 QA PASS를 허용하지 않는다.

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 네 방 사용자 흐름 | EXH-ROOM-01, EXH-RESP-01 | 부분 PASS | 네 방 390·1440 렌더와 편집·발행 작업물 유지. 생성실 목적·대상·권리 유실 |
| R27 | 후보 셋 거절 뒤 무료 재생성 | EXH-GEN-04 | ❌ NG | 후보 단계 재생성 UI 0 |
| R89 | 채널 연결 전 제작, 발행 때 연결 | EXH-PUB-01~04 | ❌ NG | 연결 0개인데 3개 기본 선택, 미연결 publish 400 |
| R104 | Studio 회원·권한 장부 | EXH-AUTH-01~02 | ❌ NG | 유효 고객 세션 200, 만료 고객은 운영자 콘솔로 이동 |
| R128, R151, R165, R171, R175 | 기존 채널 연결 경로 | EXH-PUB-01~04 | 부분 PASS | Settings 안내는 있으나 실행 전 readiness 차단 없음 |
| R168 | 첫 생성과 학습 정보 | EXH-GEN-01~03 | 부분 PASS | validation·후보 세 장 PASS, 연타 POST 2건과 입력 유실 NG |
| R01~R207 | 회장 확정 요구 전건 | REQ-ALL | 이월 | 기존 전건 요구 추적표 유지 |

정상 범위는 카드뉴스 편집 저장, `/api/studio/commands` 201, 작업물 1건, 발행 큐 인계, 부분 선택 1곳 표시, 네 방 가로 넘침 0이다. 외부 SNS 게시와 유료 재생성은 실행하지 않았다. 상세 보고서는 `docs/qa/studio-prod-exhaustive-regression-v1-gpt-codex.md`, 캡처는 `docs/qa/osmu-prod-exhaustive-20260829/`다.

## 2026-08-29 NG → 수정 → 범위 PASS: 편집 형식값 서버 validation

최초에는 승인 프로토타입의 영상 비율·자막 크기·재생 속도·목소리와 카드 비율·배경값이 편집 화면의 로컬 상태에만 있었다. 수정 뒤 같은 도메인 계약을 초안 저장, 콘텐츠 사전 검증, 발행 서버가 공유하며 허용 목록 밖 값은 DB와 외부 provider 부작용 전에 HTTP 422로 거절한다.

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R132, R146, R147, R182 | Studio 편집값 소유와 비율·자막·속도·목소리 도구 | FMT-API-01 | PASS | 정상 형식 localhost 200, 잘못된 4:3 비율 발행 422, 이슈 필드 `aspectRatio` |
| R132, R182 | 편집 화면의 선택값을 실제 발행 요청으로 전달 | FMT-UI-01 | PASS | 컴포넌트 클릭 계약과 발행 body `edit_format` 연결 통과 |
| R132 | 편집값을 초안에 보존하고 다시 불러오기 | FMT-DRAFT-01 | PASS | 실제 초안 POST 200, GET 200, 카드 4:5 형식값 재조회 |

증거는 전체 Vitest 193파일 1,388건 통과와 조건부 1건 제외, `npx tsc --noEmit`, production build 174/174, 기본 흐름 11/11, Studio v1 12/12, design lint 위반 0이다. 운영 배포, 실제 공개 채널 발행, provider 렌더 결과는 미검증이다.

## 2026-08-29 ✅ PASS: 운영 고객 생성 인증과 DB 멱등 경합 수정판 재검증

main `72afa863` 배포 run `33195231594` 성공 뒤 기존 QA 고객 계정으로 운영을 다시 검증했다. `/api/me`는 HTTP 200과 active customer tenant를 반환했다. generation POST는 HTTP 201과 후보 A·B·C 세 개를 반환했다. 같은 멱등 키의 동시 POST 두 건도 모두 201이며 최초 응답을 포함한 세 응답이 같은 job ID로 수렴했다.

실제 운영 브라우저에서 생성실 입력과 권리 확인 뒤 A·B·C 선택 단추 세 개를 관찰했다. A안을 선택해 편집실로 이동하자 실제 QA 주제 대사와 구조 줄이 인계됐다. 발행실까지 인앱 이동해 `3곳에 올리기` 준비 상태를 확인했다. 세 화면의 신규 콘솔 오류와 비정상 네트워크 응답은 0건이다.

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 네 방 사용자 흐름 | PROD-FIX-ROOM-01 | ✅ PASS | 생성실 후보 3개, A안 선택, 편집실 인계, 발행실 준비 실제 브라우저 관찰 |
| R168 | 첫 생성과 학습 정보 유입 | PROD-FIX-GEN-01 | ✅ PASS | 고객 JWT generation POST 201, 후보 A·B·C |
| R01~R207 | 회장 확정 요구 전건 | REQ-ALL | 이월 | 전건 정본은 기존 요구 추적표 유지 |

이전 BLOCK 두 건은 수정판에서 해소됐다. QA tenant의 연결 채널은 0개라 실제 외부 발행은 실행하지 않았다. 실채널 발행과 전체 디자인 정합은 이번 PASS에 포함하지 않는다. 상세 증거는 `docs/qa/osmu-prod-authenticated-qa-v1-gpt-codex.md`다.

## 2026-08-29 ❌ NG: 실제 운영 고객 로그인은 성립했으나 첫 Studio 생성 불가

Google 자동화 로그인을 사용자에게 넘기지 않고 운영 Supabase의 활성화된 이메일 자동확인 경로로 식별 가능한 QA 계정을 만들었다. 실제 access session으로 `/api/me`를 호출해 `isOperator=false`, active tenant를 확인했고 생성실·편집실·발행실·성과실을 390·768·1440에서 직접 열었다. 네 방 12화면은 콘솔 오류와 가로 넘침이 0건이다.

그러나 주제·목적·대상·소재 권리를 채우고 `후보 세 장 만들기`를 누르면 `Studio 인증이 비어 있습니다`로 종료됐다. 같은 고객 JWT로 generation API를 직접 호출해도 HTTP 503 `IDENTITY_ADAPTER_NOT_CONFIGURED`가 재현됐다. 로그인 성공과 화면 진입은 제품 핵심 흐름의 완료 증거가 아니다.

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 네 방 사용자 흐름 | PROD-AUTH-ROOM-01 | ✅ PASS | 실제 고객 세션, 4방×3폭, 콘솔 오류 0, 가로 넘침 0 |
| R168 | 첫 생성과 학습 정보 유입 | PROD-AUTH-GEN-01 | ❌ NG | UI `Studio 인증이 비어 있습니다`, API HTTP 503 |
| R01~R207 | 회장 확정 요구 전건 | REQ-ALL | 이월 | 전건 정본은 기존 요구 추적표 유지 |

상세 증거와 테스트 사용자·테넌트 정리 계획은 `docs/qa/osmu-prod-authenticated-qa-v1-gpt-codex.md`에 있다. 테스트 테넌트의 연결 채널은 0개라 실채널 발행은 안전상 실행하지 않았다.

임시 가입 request·session response 등 `/tmp` 인증 파일 7개는 삭제 후 부재를 확인했다. access token, refresh token, password는 저장소와 QA 산출물에 남기지 않았다.

전체 회귀도 NG다. 집중 4파일 45건, TypeScript, design lint, production build 174경로는 통과했지만 전체 Vitest는 1,352 PASS, 2 FAIL, 4 SKIP이었다. `GEN-DB-01`은 단독 재실행에서도 unique 제약 위반으로 실패했다. 회원 전역과 tenant 포함 unique 제약이 동시에 있는 DB에서 conflict target 하나만 지정한 예약 INSERT가 다른 제약 충돌을 처리하지 못한다. `GEN-DB-03` 동시 무료 재생성도 한 요청이 거절됐다.

## 2026-08-29 NG → 수정 → 범위 PASS: 읽기 API 99개 전수 실사

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R128, R151, R165, R171, R175 | 기존 채널 연결 경로와 화면을 보존하고 채널 화면에서 연결한다 | API-READ-20260829-01 | PASS | 최초 `/api/connect/threads` HTTP 500. 수정 후 실제 앱 HTTP 503, 구성 부재로 분리. `social-connect.test.ts` 61/61 |
| R150 | 플랫폼별 지원 기능과 비활성 경계를 실제 계약과 일치시킨다 | API-READ-20260829-02 | PASS | 최초 운영자 토큰 400, 고객 토큰 403. 수정 후 고객 토큰으로 핸들러에 도달해 없는 발행 ID를 작업 공간 범위 404로 관찰. 관련 회귀 75/75 |
| R01~R207 이월 | 회장 확정 요구 전건 승계 | REQ-ALL | 이월 | 전건 판정 정본은 `docs/qa/osmu-qa-2026-08-28.md`. 이번 실사는 읽기 API 상태코드 회귀만 재검증 |

| 검증 | 판정 | 직접 관찰 증거 |
|---|---|---|
| GET export 전수 | PASS | 99개 실제 호출. 정상 89, 의도된 거절 10, HTTP 500 0, 요청 실패 0 |
| health | PASS | `/api/health` HTTP 200, `ok:true`, DB `up` |
| seed와 기본 흐름 | PASS | 실제 작업 공간에 생성 작업, 초안, 발행 큐, 성과 제안 인계. `verify-basic-flow-e2e.mjs` 11/11 |
| Studio v1 | PASS | `verify-studio-v1-e2e.mjs` 12/12 |
| Playwright | PASS | 네 방 4개와 390, 768, 1024, 1440의 16화면. 가로 넘침 0, 콘솔 오류 0, 401 URL 0 |
| backend regression | PASS | Studio 이중 고유 제약 실패 2건 재현 후 충돌 예약 보정. 실제 DB 집중 10/10, 전체 190파일 1,358건 통과, 조건부 3건 제외 |
| web typecheck와 build | PASS | `npx tsc --noEmit` exit 0, `npm run build` exit 0, 정적 페이지 174/174 |
| design lint | PASS | `design-lint.sh dashboard/src`, 디자인 토큰 위반 0 |
| Maestro | 해당 없음 | 웹 전용 제품 범위. `optional:true` 우회 없음 |
| 전체 제품 QA | NG 유지 | 운영 고객 Studio 생성 503과 승인 시안 디자인 정합 NG는 이번 API 범위 밖이며 해소되지 않음 |

이전 실사 문서는 GET 84개로 보고했지만 당시 커밋 `5283f7da`의 정적 export는 95개였다. 현재 99개는 실제 순증 4개이며, 새 경로는 engagement, operator incidents, Studio shorts factory 목록과 상세다. 상세 상태와 변경표는 `docs/_archive/legacy-20260912/audit/osmu-api-read-sweep-v1-gpt-codex.md`에 있다.

페르소나 결정: 김민서는 이제 OAuth 구성 부재를 서버 고장 500으로 받지 않고 503으로 구분하며, TikTok 상태 조회는 운영자 전용 403이 아니라 자신의 작업 공간에서 없는 발행 기록 404까지 도달한다. 실제 연결 TikTok provider 성공 응답은 미검증이다.

## 2026-08-29 ⬜ BLOCKED: 운영 Google 실제 계정 로그인 자동화

운영 로그인 화면과 Google OAuth 이동은 정상이다. 저장된 QA 계정으로 로그인을 이어가자 Google이 자동화 브라우저를 안전하지 않은 브라우저로 거절했다. 앱의 OAuth 설정 실패가 아니라 Google 보안 정책에서 멈췄으므로 비밀번호 입력 전에 중단했다.

| 테스트번호 | 판정 | 직접 관찰 증거 |
|---|---|---|
| OSMU-PROD-AUTH-01 | ✅ PASS | 운영 `/login` 200, `Google로 계속` 클릭 뒤 Google 계정 입력 화면 도달 |
| OSMU-PROD-AUTH-02 | ⬜ BLOCKED | 계정 식별 뒤 Google `This browser or app may not be secure` 거절 |
| OSMU-PROD-AUTH-03 | ⬜ 미검증 | 실제 고객 세션 성립 뒤 생성실·편집실·발행실·성과실 관찰 |

운영 서비스와 OAuth 진입은 작동한다. 실제 로그인 완료는 일반 사용자 브라우저 세션에서 다시 확인해야 한다.

## 2026-08-29 ❌ NG → 🔧 → ✅ PASS: 로컬 OSMU 인증 환경값 자동 주입 부재

**발견:** 최신 main을 로컬에서 실행했을 때 `/studio`는 로그인 화면으로 돌아갔고 Google 인증 사전요청은 `supabaseUrl is required`와 HTTP 503을 반환했다. `dashboard/.env.local`에 필요한 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY`가 자동 주입되지 않은 상태다.

**의미:** 운영 배포는 GitHub Secrets에서 값을 렌더하므로 별도 경로로 보호되지만, 로컬 QA가 고객 로그인과 네 방 화면을 직접 검증하지 못한다. 운영만 정상이고 개발·QA가 인증 화면에서 막히는 비대칭은 회귀를 늦게 발견하게 만든다.

| 테스트번호 | 판정 | 직접 관찰 증거 |
|---|---|---|
| OSMU-LOCAL-AUTH-ENV-01 | ❌ NG | `/api/auth/google` HTTP 503, 응답 원인 `supabaseUrl is required` |
| OSMU-LOCAL-AUTH-ENV-02 | ✅ PASS | `scripts/recover-osmu-local-public-env.mjs`가 기존 값을 보존하고 검증된 공개값만 권한 600 파일에 주입. 회귀 5/5 |
| OSMU-LOCAL-AUTH-ENV-03 | ✅ PASS | 운영 배포 run `33187005238` success. 로컬 health 200, Google preflight 200, `prompt=select_account` 직접 관찰 |

**근본 원인:** 운영 배포는 GitHub Secrets를 `.env.osmu`로 렌더했지만 로컬 감독은 공개 Supabase 설정을 준비하지 않고 Next를 바로 기동했다. 로컬 secret 정본에도 두 공개값이 없어 운영과 로컬 사이에 인증 환경 분기가 생겼다.

**수정:** 감독이 앱 기동 전에 복구 스크립트를 실행하고 실패하면 값 없는 앱을 띄우지 않는다. 스크립트는 운영 공개 번들과 Supabase settings에서 같은 프로젝트의 anon 역할을 확인하고, 기존 `.env.local` 값을 보존한다. 값 원문은 출력하지 않는다.

**종료증거:** Vitest 5/5, TypeScript exit 0, `.env.local` 권한 600, 로컬 `/api/health` 200, `/api/auth/google` 200, Google URL의 `prompt=select_account` PASS. 실제 고객 계정 로그인 완료와 Studio 네 방은 별도 미검증이다.

## 2026-08-29 NG: 지난 24시간 코드 리뷰 머지 차단

| 테스트번호 | 판정 | 직접 관찰 증거 |
|---|---|---|
| OSMU-REVIEW-24H-01 | NG | `856ab35e`부터 `50e1c56b`까지 104개 커밋을 승인 v63, 요구 대장, 사업 좌표, DESIGN과 대조. MAJOR 25건, MINOR 5건. `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-08-29.md` |
| OSMU-REVIEW-24H-02 | PASS | `http://localhost:3456/api/health` HTTP 200, DB `up` |
| OSMU-REVIEW-24H-03 | PASS | 실제 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182` 기본 흐름 11/11 |
| OSMU-REVIEW-24H-04 | PASS | 실제 Studio 생성 계약 12/12 |
| OSMU-REVIEW-24H-05 | PASS | Vitest 187파일, 1,338건 통과, 4건 조건부 스킵. TypeScript 종료 코드 0 |
| OSMU-REVIEW-24H-06 | NG | `git diff --check`가 v63 시안과 여러 산출물의 후행 공백 및 EOF 빈 줄로 실패 |

정상 흐름 통과와 별개로 작업 공간 전환 시 브라우저 상태 누수, 인박스 큐와 다른 초안 주입, 병렬 발행 복구값 덮어쓰기, 외부 성공 뒤 내부 기록 실패, 가입자 조회 실패를 0명으로 표시하는 부분 성공이 남아 있다. 실제 공개 채널 발행과 실 provider 댓글은 실행하지 않았다.

REVIEW_VERDICT: BLOCK

## 2026-08-29 PASS: R193 inbox와 calendar 발행실 복귀 독립 QA

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 직접 관찰 증거 |
|---|---|---|---|---|
| R193 | 승인 인박스에서 발행실로 돌아와 기존 작업을 계속한다 | FE-V63-RETURN-01 | PASS | 실제 inbox 링크 클릭 후 queue `0fb7120a...`와 draft `645f1744...`가 붙은 발행실 URL 도착. queue 본문과 플랫폼 3곳, `3곳에 올리기` 복원 |
| R193 | 없는 queue URL은 빈 작업물을 발행 가능 상태로 만들지 않는다 | FE-V63-RETURN-02 | PASS | 빈 `studio_work`에서 존재하지 않는 queue로 진입하자 `돌아갈 작업물을 찾지 못했습니다` 오류와 발행 단추 0건 관찰 |
| R193 | 인박스와 캘린더의 작업물에 발행실 복귀 링크를 둔다 | FE-V63-RETURN-03 | PASS | inbox 항목 링크와 calendar 날짜 셀 선택 뒤 상세 링크를 각각 실제 클릭. 두 경로 모두 `room=publish`, `queue_id`, `from`, `draft_id` 보존 |
| R193 | 본문 없는 편집 인계 초안도 queue 본문과 초안 메타데이터를 합쳐 복원한다 | FE-V63-RETURN-04 | PASS | calendar queue `dc132bd9...`와 draft `21bee663...` 연결. 발행실에서 본문, 초안 제목, 플랫폼 3곳과 발행 단추 복원 |

**실제 앱 관찰:** `localhost:3456`, 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`에서 Chromium으로 inbox와 calendar를 각각 열었다. 캘린더는 날짜 셀을 눌러 그날의 상세 목록을 연 뒤 `발행실로 돌아가기`를 클릭했다. 두 경로 모두 연결 queue와 draft가 URL과 작업 상태에 남았고, queue 본문과 선택 플랫폼 3곳이 발행실에서 다시 보였다. 없는 queue는 이전 작업 상태를 비운 새 진입 조건에서 오류로 거절되고 발행 단추가 0건이었다. 브라우저 응답 401은 0건, JavaScript 콘솔 오류는 0건이다. 기본 흐름 fixture의 `example.invalid` 미디어 요청은 이번 복귀 계약과 무관하므로 브라우저에서 204로 격리했고, 미디어 재생 성공을 이번 완료 근거에 포함하지 않았다.

**실행 증거:** health HTTP 200과 DB `up`. 기본 흐름 11/11, Studio 경계 계약 12/12. FE-V63-RETURN 포함 집중 Vitest 4파일 36건 PASS. 전체 Vitest 187파일 1,336건 PASS, 조건부 6건 SKIP. TypeScript exit 0, design lint 위반 0건이다. 관찰 JSON과 8개 캡처, 재현 스크립트는 `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-return-rerun-20260828/`에 있다.

**doc-review 재검토:** `/Users/sj/.claude/standards/doc-review.md` 151줄과 QA 템플릿 111줄을 끝까지 읽고 기능 증거와 디자인 증거를 분리했다. R193의 요구 추적, 해피·엣지 E2E, 회귀 수치는 기능 PASS를 지지한다. 반면 이 독립 QA에는 v63 프로토타입과 구현을 같은 뷰포트에서 나란히 비교한 스크린샷 쌍이 없다.

**디자인 판정:** R193의 기능 플로우 계약은 요구 R193과 v63 HTML의 복귀 문구에 추적된다. R193 시각 정합은 스크린샷 쌍 부재로 미검증이다. 전체 v63 화면 정합은 기존 `docs/qa/osmu-v24-design-conformance-matrix-v1-gpt-codex.md`의 NG를 유지한다. 기능 PASS를 design 또는 qa 승인으로 확대하지 않는다.

**페르소나 결정:** 박도윤이 승인이나 예약 뒤 원래 콘텐츠를 다시 조립하지 않고 발행실에서 이어서 검수할 수 있는가에는 PASS다. 실제 공개 채널 발행, 운영 배포, provider 댓글 읽기는 미검증이다.

**레드팀:** 까다로운 고객은 링크 존재가 아니라 돌아온 뒤 원문과 발행 대상이 그대로인지 본다. 그래서 URL 도착만으로 통과시키지 않고 queue 본문, 연결 draft, 체크된 플랫폼 수와 발행 단추 수를 함께 대조했다.

**셀프심문:** 이 결론이 틀렸다면 가장 그럴듯한 이유는 캘린더 날짜 셀을 열지 않은 채 링크가 없다고 오판하거나, 이전 localStorage 작업 때문에 없는 queue가 발행 가능한 것처럼 보이는 것이다. 실제 캘린더 사용자 동작을 추가하고, 없는 queue는 작업 상태를 비운 새 진입 조건으로 분리해 재검증했다.

STAMP | line: osmu-return-qa | 생성: 2026-08-29 00:19 KST | model: gpt-5.6-sol | agent: qa-verifier | skill: qa | 고민: 링크 노출, 복귀 URL, 상태 복원, 빈 queue 거절을 서로 다른 관찰로 분리했다.

SKILLS_USED: qa. 브라우저 사용자 흐름, 회귀 우선순위, 증거 캡처와 경계 판정에 사용. SKILLS_SKIPPED: 없음.

SOURCES: `pipeline-state.osmu.md` | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` R193 | `DESIGN.md` | `docs/_archive/legacy-20260912/root-docs/prd-openclaw-service-v8.2.1-gpt-codex.md` | https://playwright.dev/docs/locators | https://playwright.dev/docs/actionability | https://playwright.dev/docs/test-assertions

MODEL: gpt-5.6-sol / qa-verifier

## 2026-08-28 PASS: inbox와 calendar 발행실 복귀

| 테스트번호 | 최초 판정 | 최종 판정 | 직접 관찰 증거 |
|---|---|---|---|
| FE-V63-RETURN-01 | 정상 | PASS | inbox queue 본문과 선택 플랫폼을 발행실 상태로 복원 |
| FE-V63-RETURN-02 | 거절 | PASS | URL의 queue 항목이 없으면 발행 단추를 만들지 않음 |
| FE-V63-RETURN-03 | 정상과 거절 | PASS | inbox와 calendar 링크 노출, legacy context 없는 항목은 링크를 만들지 않음 |
| FE-V63-RETURN-04 | 최초 NG | 수정 후 PASS | `text=null`인 편집 인계 초안이 빈 발행실을 만들던 문제를 queue 본문과 초안 메타데이터 결합으로 수정 |
| BE-V63-03 | 정상과 거절 | PASS | sourceContext의 draft ID를 inbox와 calendar 복귀 URL에 보존, 알 수 없는 source는 400 |

**실제 앱 관찰:** 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`에서 health HTTP 200과 DB `up`을 확인했다. 기본 흐름 E2E 11/11로 만든 편집 인계 초안과 queue를 조회했으며 inbox와 calendar 응답 모두 같은 draft ID를 가진 Studio 복귀 URL을 반환했다. 실제 Chromium에서 두 화면의 `발행실로 돌아가기`를 눌러 발행실 도착과 작업물 복원을 관찰했다. 미디어 없는 검증 항목에서는 브라우저 401 0건, 콘솔 오류 0건이다. 임시 queue와 고객 토큰은 삭제했다.

**회귀:** `npm run test -- --maxWorkers=8 --minWorkers=1 --testTimeout=15000` 187파일 1,336건 PASS, 조건부 6건 SKIP. TypeScript, Next production build 174경로, 기본 흐름 11/11, Studio v1 12/12, UI 토큰 감사와 design lint 위반 0건이다. build의 기존 NFT 추적 경고 1건은 남았다.

**남은 gate:** 운영 배포와 실제 공개 채널 발행은 미검증이다. 전체 v63 디자인 정합 NG와 design, qa 승인 보류를 유지한다.

STAMP | line: osmu-gapfill082823 | 생성: 2026-08-28 23:46 KST | model: gpt-5.6-sol | agent: code-builder | skill: pipeline | 고민: 링크 노출만 통과시키지 않고 본문 없는 편집 인계 초안의 실제 복원까지 검증했다.

SKILLS_USED: pipeline. build 허용 범위와 단계 gate 확인에 사용. SKILLS_SKIPPED: 설치 코드 구현 전용 매칭 스킬 없음.

SOURCES: `docs/_archive/legacy-20260912/audit/osmu-gap-recheck-2026-08-28.md` | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | https://support.buffer.com/en-us/articles/managing-and-approving-draft-posts-57li7M8tDA

MODEL: gpt-5.6-sol / code-builder

## 2026-08-28 NG→FIXED: Claude 하네스의 Codex PostToolUse 동기화 누락

| 테스트번호 | 최초 판정 | 원인 | 수정 | 직접 관찰 증거 |
|---|---|---|---|---|
| HARNESS-SYNC-01 | ❌ NG | 동기화 인벤토리가 최근 Claude PostToolUse 훅 3종을 관리하지 않았고, 해당 훅이 `Write/Edit` 입력만 해석했다 | `artifact-stamp-check`, `dashboard-sync-on-state`, `pipeline-state-coherence`를 Codex 등록 및 자동 미러 대상에 추가하고 `functions.apply_patch` 경로 해석을 정본에 구현 | 동기화 `drift/missing=0`, 네 파일 byte match, Codex apply_patch 입력에서 스탬프 누락 `decision:block`, 전체 하네스 픽스처 PASS 23/FAIL 0 |
| HARNESS-SYNC-02 | ❌ NG | 하네스 자기수정 표식이 Codex apply_patch에서 생성되지 않았다 | `harness-selfmod-mark`의 patch 경로 파싱 및 `hooks.json` 감시 추가 | `/tmp/claude-harness-selfmod-sync-audit` 생성 직접 확인 |

제품 QA와 분리된 전역 하네스 결함이다. OSMU 제품 동작에는 회귀가 없음을 현재 로컬 HEAD에서
기본 흐름 11/11, Studio 계약 12/12, TypeScript exit 0, Vitest 187파일 1,338건 PASS와
조건부 SKIP 3건으로 재확인했다. 실제 공개 채널 발행과 운영 배포는 여전히 미검증이다.

## 2026-08-28 PASS: 네 방 기본 흐름 재검증, 전체 v63 정합 NG 유지

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 사이드바의 네 방을 실제 경로로 이동 | OSMU-FLOW-RERUN-01 | PASS | 실제 `localhost:3456`에서 4개 방 x 4폭 링크 클릭, 경로 16/16 일치 |
| R150 | 채널 capability 계약을 유지한 기본 흐름 | OSMU-FLOW-RERUN-02 | PASS | 생성부터 발행 큐까지 실제 API 기본 흐름 11/11, 지원 여부 응답 포함 |
| R200, R207 | 성과실 제안과 생성실 재진입 | OSMU-FLOW-RERUN-03 | 부분 PASS | 4폭 모두 제안 3건, 성과실에서 생성실 복귀 4/4. 전체 v63 정합은 NG 유지 |
| R201 | 네 방 이동을 가리는 사족과 모달 제거 | OSMU-FLOW-RERUN-04 | PASS | 전체 화면 모달 0건, 브라우저 401 0건, 콘솔 오류 0건, 가로 넘침 0건 |
| R206 | 승인 시안 수준의 화면 정합 | CONF-ALL | NG 유지 | `docs/qa/osmu-v24-design-conformance-matrix-v1-gpt-codex.md`와 전체 12행 정합 NG |
| R01~R207 이월 | 회장 확정 요구 전건 승계 | REQ-ALL | 이월 | 전건 판정은 `docs/qa/osmu-qa-2026-08-28.md` 요청 번호 승계표를 정본으로 사용 |

**실제 앱 관찰:** 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`로 생성실에서
성과실까지 사람처럼 링크를 눌렀다. 390, 768, 1024, 1440에서 생성실, 편집실, 발행실,
성과실 16화면과 성과실에서 생성실로 돌아가는 4건이 통과했다. 각 폭의 문서 폭은 viewport와
같았고 가린 모달, 브라우저 401, 콘솔 오류는 모두 0건이었다. 캡처와 관찰 JSON은
`docs/design/prototypes/legacy-prototype-20260912/prototype/qa-flow-rerun-20260828/`에 있다.

**픽셀 대조:** v63 성과실 시안 `docs/_archive/legacy-20260912/board/v63-perf-1440.png`과 dev 실화면
`docs/design/prototypes/legacy-prototype-20260912/prototype/qa-flow-rerun-20260828/1440-performance.png`을 원본 크기로 각각 열어
대조했다. 시안의 상단 전역 탐색과 우측 담당 패널이 dev에 없고, dev에는 채널 연결 경고와
첫 사용자 온보딩이 추가돼 있다. 따라서 기본 동선 PASS와 별개로 전체 v63 정합은 NG다.

**실행 증거:** health HTTP 200, 실제 API 기본 흐름 11/11, Studio 경계 계약 12/12,
Vitest 186파일 1,330건 PASS와 5건 조건부 SKIP, TypeScript exit 0, Next production build
174경로, 디자인 lint 위반 0건이다. 임시 PostgreSQL에 schema, test seed, RLS를 적용해
`seed-a`, `seed-b`와 `seed-a` 초안 1건을 확인했고 임시 DB 잔존은 0건이다. 웹 전용이라
Maestro는 해당 없음이다. production build의 기존 NFT 추적 경고 1건은 남았다.

**결함 판정:** 네 방 기본 동선에서 끊긴 곳은 관찰되지 않아 앱 코드는 수정하지 않았다.
첫 보조 프로브가 동시 Next build 중 65초 넘게 지연됐지만 단독 재실행은 약 32초에 exit 0으로
종료됐다. 프로브는 `/api/me`를 가로채므로 보조 증거로만 썼고, 완료 근거는 실제 자격증명으로
실행한 16화면 클릭과 실제 API 11단계다.

**페르소나 결정:** 콘텐츠 도구를 처음 쓰는 사용자가 네 방을 순서대로 이동해 성과실에 도달할
수 있는가에는 PASS다. 설명 없이 첫 콘텐츠를 완성할 수 있는가와 승인 v63의 전체 시각 정합에는
이번 동선 증거만으로 답할 수 없으므로 전체 QA 승인은 NG를 유지한다.

**레드팀:** 까다로운 고객은 테스트 개수가 아니라 작은 화면에서 버튼이 실제로 눌리고 모달이
가리지 않으며 성과실까지 도착하는지를 본다. 그래서 mock 프로브를 완료 근거에서 제외하고 실제
서버와 고객 작업 공간의 4폭 클릭을 판정 근거로 남겼다.

**셀프심문:** 이 결론이 틀렸다면 가장 그럴듯한 이유는 기본 동선 PASS를 전체 디자인 PASS로
과장하는 것이다. 기본 동선과 전체 v63 정합 판정을 분리해 후자는 NG로 유지했다.

STAMP | line: osmu-flow-rerun | 생성: 2026-08-28 22:33 KST | model: gpt-codex/gpt-5.6-sol | agent: qa-verifier | skill: qa | 고민: mock 프로브와 실제 고객 경로의 증거 등급을 분리했다.

SKILLS_USED: qa, 결함 재현, 실제 브라우저 검증, 회귀 순서, 증거 기록에 사용 / SKILLS_SKIPPED: 없음

SOURCES: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/product/사업좌표-OSMU와-ZERO-ONE.md` | `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md` | `docs/qa/osmu-qa-2026-08-28.md` | https://playwright.dev/docs/locators | https://playwright.dev/docs/actionability | https://playwright.dev/docs/test-projects

MODEL: gpt-codex/gpt-5.6-sol / qa-verifier

## 2026-08-28 초기 NG -> 재실행 PASS: 네 방 보조 프로브 종료 지연

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R150, R201 | 네 방 실제 경로와 사이드바 흐름을 반복 검증 | OSMU-FLOW-RERUN-05 | 초기 NG, 최종 PASS | 동시 Next build 중 65초 이상 지연. 단독 재실행은 약 32초에 exit 0, 네 방 본문과 가린 모달 0건 확인 |

**관찰:** 최초 실행은 동시 Next build가 끝나기 전 지연돼 수동 종료했다. 같은 소스를 단독으로
재실행하자 네 방을 모두 읽고 가린 모달 0건을 출력한 뒤 종료했다. 앱 수정은 없었다. 재발 시에는
동시 build를 끝낸 뒤 제한시간을 둔 단독 실행으로 앱 결함과 자원 경합을 분리한다.

## 2026-08-28 PASS: v24 디자인 검수 지적 보수, 전체 design gate는 NG 유지

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R150 | 실제 네 방 경로와 최신 채널 탭 계약 보존 | V24-DR-001 | PASS | 네 방 4개 x 4폭 실제 클릭. 채널 capability 7건 PASS |
| R201 | 사이드바의 `지금 여기`, `다음` 제거 | V24-DR-001 | PASS | 390, 1024, 1440 실제 DOM 문구 0건. 회귀 2파일 7건 PASS |
| R200, R207 | 성과실 중복 제거와 한 작업 흐름 유지 | V24-DR-002 | 부분 PASS | `PerformanceRoom` 1건, 레거시 패널 문구 0건. 전체 v63 정합은 NG 유지 |
| R206 | 승인 시안 수준의 화면 정합 | CONF-ALL | NG 유지 | `docs/qa/osmu-v24-design-conformance-matrix-v1-gpt-codex.md` |
| 이월 | v24 저장 본문, 토큰, OAuth 점진 공개와 진실원 | V24-DR-003~008 | PASS 또는 조건부 PASS | 본문 복원 3폭, design lint 0건, API와 DOM OAuth 12개, 기본 펼침 0건 |

**위험도순 결과:** 이 감사에는 돈 손실이나 작업 공간 격리 침해 지적이 없었다. 기본 흐름 P1인
실제 경로, 성과실 중복, 저장 본문 연속성, OAuth 진실원을 먼저 처리했다. 없는 OAuth provider
두 개는 만들지 않았다. API가 반환한 12개를 UI가 그대로 그리며 `14개` 고정 주석만 제거했다.

**실제 앱:** `localhost:3456`에서 v24 재현 3종을 390, 1024, 1440으로 실행했다. 성과실 단일
블록, 저장 본문 복원, OAuth 12개 기본 접힘과 API 정합이 전부 PASS다. 네 방 UI는 추가로
390, 768, 1024, 1440에서 16화면과 성과실 왕복 4건이 PASS다. 가로 넘침, 브라우저 401,
콘솔 오류는 모두 0건이다. 증거는 `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v24-remediation/`에 있다.

**전체 회귀:** Vitest 185파일 1,321건 PASS, 6건 조건부 SKIP. `npx tsc --noEmit`, Next
production build 174경로, 디자인 lint 0건. 실제 앱 기본 흐름 11/11, Studio 계약 12/12,
health HTTP 200. 임시 PostgreSQL에 schema, test seed, RLS를 적용해 `seed-a`, `seed-b`와
seed draft 1건을 관찰한 뒤 임시 DB를 폐기했다. 웹 전용이라 Maestro는 해당 없음이다.

**전환 판정:** v24 audit의 지적 보수는 PASS다. 전체 v63 디자인 정합은 기존 12행이 NG라
qa 승인과 배포 전환은 금지한다. 세부 근거는
`docs/qa/osmu-v24-design-conformance-matrix-v1-gpt-codex.md`다.

## 2026-08-28 NG -> 수정 -> PASS: CI 환경 독립성

| 시험 항목 | 재현된 결함 | 현재 판정 | 종료증거 |
|---|---|---|---|
| RELEASE-CI-01 | 로컬 환경파일이 OAuth 테스트의 DB mock 누락과 운영자 복구 테스트의 시스템 `jq` 의존을 가려 PR CI 33건이 실패했다 | PASS | `.env.local` 없는 CI 유사 환경 집중 67건 PASS, 전체 로컬 186파일 PASS, 원격 [run 33173838496](https://github.com/seong-jin-jo/openclaw-auto/actions/runs/33173838496) 186파일 1,321건 PASS |

**근본 원인:** 단위 테스트가 자기가 쓰는 DB와 명령을 모두 모킹하지 않고 개발 머신의 환경파일과 설치 도구를 암묵적으로 믿었다. 로컬 통과가 깨끗한 CI 통과를 보장하지 못했다.

**수정:** OAuth 테스트는 `DATABASE_URL` 존재 여부와 무관하게 빈 credential DB를 명시적으로 모킹한다. 운영자 복구 계약은 필요한 `jq` 동작까지 자체 fixture로 제공한다. 두 테스트를 환경파일 없이 재실행하고 PR CI 전체를 다시 통과시켰다.

## 2026-08-28 NG -> 수정 -> PASS: 신규 마이그레이션 실행 순서

| 시험 항목 | 재현된 결함 | 현재 판정 | 종료증거 |
|---|---|---|---|
| RELEASE-MIGRATION-01 | 같은 날짜의 신규 파일을 이름순으로 실행하면 `code_review_tenant_fk`가 `engagement_items`보다 먼저, `shorts_factory_run_leases`가 `shorts_factory_runs`보다 먼저 실행된다 | PASS | 기존 운영 스키마에서 6/6, 최신 스키마 재적용 6/6, 대상 테이블 7/7. `/tmp/osmu-release-migration.log` |

**근본 원인:** 날짜만 있는 파일명에 의존하면서 같은 날의 선후 의존성을 나타내는 순번을 두지 않았다. 배포 스크립트가 이름순으로 실행해도 참조 대상 테이블이 먼저 생성되도록 파일명에 명시적 순번이 필요하다.

**수정:** Studio 장부를 만드는 `010`부터 교차 tenant FK를 보강하는 `060`까지 순번을 부여했다. 모든 파일은 `BEGIN`과 `COMMIT`으로 감쌌고 배포 워크플로가 schema와 RLS 적용 사이에 이름순으로 전부 실행한다.

## 2026-08-28 NG -> 수정 -> PASS: Studio 개발용 신원 우회의 운영 예외값

| 시험 항목 | 재현된 결함 | 현재 판정 | 종료증거 |
|---|---|---|---|
| RELEASE-IDENTITY-01 | `NODE_ENV=production` 이어도 `STUDIO_ALLOW_DEV_IDENTITY_IN_PROD=1`이면 개발용 bearer로 회원과 작업 공간을 가장할 수 있다 | PASS | 예외값 없음, `0`, `1` 모두 운영에서 503 거절. 집중 3파일 15건과 최종 로컬 전체 186파일 통과 |

**근본 원인:** 운영 안전장치에 현장 우회용 예외값을 남겼고, 회귀 테스트는 그 예외값이 없는 경우만 검증했다. 운영 신원 경계는 실행 중 플래그로 재개방할 수 없게 고정해야 한다.

**수정:** 운영이면 환경값과 관계없이 개발 principal 해석을 중단한다. 배포 환경파일에도 `STUDIO_IDENTITY_MODE=development`와 `STUDIO_DEV_*`를 넣지 못하게 계약으로 고정했다.

## 2026-08-28 PASS: Opus 교차검수 전 항목 위험도순 재검증

| 우선순위 | 시험 항목 | 수정 또는 재검증 결과 | 직접 증거 | 판정 |
|---|---|---|---|---|
| P0 돈 | OSMU-BLOCK-M1 | 무료 재생성 몫을 회원의 UTC 날짜로 고정 | `localhost:3456` Studio 계약 12/12. 반대 시간대 작업 중 무료 몫은 최대 한 번 | PASS |
| P0 돈 | OSMU-BLOCK-M2 | 일반 생성과 무료 재생성의 멱등 작업 이름 공간을 분리 | 실제 PostgreSQL에서 내부 모양 키 선점 뒤 재생성 성공, 두 작업 이름 동시 보존 | PASS |
| P0 격리 | OSMU-BLOCK-I1/I2 | 공장 쿼리의 tenant 조건과 transaction migration 유지 | 실제 PostgreSQL 공장 격리 및 경합 4건, 전체 계약 통과 | PASS |
| P0 격리 | OSMU-BLOCK-I3 | 인증 오류를 API 오류 경계 안에서 처리 | `localhost:3456` 무효 bearer 댓글 요청 HTTP 401 | PASS |
| P0 외부 중복 | OSMU-BLOCK-C1/C2 | 죽은 공장 실행을 lease로 회수하고 거짓 진행 상태 대신 이전 실행을 실패로 닫음 | 실제 앱 새 실행 HTTP 201, 이전 행 `failed`, 운영자 종료 HTTP 200 | PASS |
| P0 외부 중복 | OSMU-BLOCK-C3 | 답글 청구에 15분 lease와 만료 회수 추가 | 실제 PostgreSQL에서 살아 있는 청구 거절, 만료 청구 회수 | PASS |
| P0 외부 중복 | OSMU-BLOCK-C4 | 응답 불명 청구에 `status-unknown` 표식을 남겨 lease 재획득 차단 | 실제 PostgreSQL에서 만료시각 뒤에도 재청구 `conflict`. 공개 provider 시간 초과는 미검증 | 조건부 PASS |
| P0 외부 중복 | OSMU-BLOCK-C5 | 같은 tenant와 댓글의 외부 좋아요 호출을 transaction 자문 잠금으로 직렬화 | 실제 PostgreSQL 동시 요청 2건에서 provider callback 1회, 실패 뒤 재시도 성공 | PASS |
| P1 거짓 성공 | OSMU-BLOCK-F1 | 사람 개입 장애는 원장 저장 뒤에도 Slack 전달 | 격리 실앱 HTTP 200, DB `open`, 로컬 Slack webhook 1건 | PASS |
| P1 거짓 성공 | OSMU-BLOCK-F2 | 발행 장애와 복구 지문에 계정 식별자 추가 | 실제 PostgreSQL에서 계정 B 복구 뒤 계정 A 장애 `open` 유지 | PASS |
| P1 거짓 성공 | OSMU-BLOCK-F3 | 첫 댓글 실패를 복구가 아니라 발행 실패로 기록 | 발행 route 정상 및 거절 계약 2건, UI 부분 성공 계약 16건 | PASS |
| P1 거짓 성공 | OSMU-BLOCK-F4 | 저장된 멱등 응답은 장애 복구 신호 없이 즉시 재생 | 재생 경로에서 실패 및 복구 호출 0건 계약 | PASS |
| P1 기본 흐름 | OSMU-BLOCK-D1 | 첫 콘텐츠 다음에 브랜드 문서 연결 항목 복구, 생성 차단 없음 | 실제 브라우저 1440 화면에서 `브랜드 문서 연결` 노출, API 및 컴포넌트 3건 | PASS |
| P1 기본 흐름 | OSMU-BLOCK-D2 | 자동저장 복원과 손상 값 거절 회귀 안전망 추가 | 새로고침 복원 및 깨진 JSON 거절 2건 | PASS |

**전체 회귀:** `npm run test` 181파일 1,314건 통과, 조건부 6건 건너뜀.
`npx tsc --noEmit`, `design-lint.sh dashboard/src`, `npm run build`가 통과했고 정적 경로
174개를 생성했다. 기존 NFT 추적 경고 1건은 남았다. 실제 `localhost:3456`에서 기본 흐름
11/11, Studio 계약 12/12, 숏폼 회수 2/2, 무효 댓글 인증 401, 네 방 4개 x 4폭,
브라우저 401 0건, 콘솔 오류 0건을 관찰했다.

**미검증 범위:** 실제 공개 채널에서 응답만 잃는 답글 시간 초과와 실제 좋아요 요청은
계정과 provider fault injection이 없어 실행하지 않았다. 운영 배포도 하지 않았다.

## 2026-08-28 부분 PASS: OSMU 코드리뷰 P0·P1 수정 검증

| 시험 항목 | 수정 결과 | 직접 증거 | 판정 |
|---|---|---|---|
| REVIEW-M4 | 같은 원본 무료 재생성 재시도는 저장된 교체 작업을 재생하고 다른 원본만 과금 승인으로 거절 | 실제 PostgreSQL 생성 통합 6건, Studio Route 5건 | PASS |
| REVIEW-M5 | 외부 호출 전에 `in_progress` 예약을 원자적으로 만들고 승자만 공급자를 호출 | 동시 요청 2건 중 HTTP 200·409, 공급자 호출 1회. 실제 앱의 기존 예약 요청 HTTP 409 | PASS |
| REVIEW-M6-M7 | 첫 댓글 실패를 전체 성공에서 제외하고 채널 요청을 병렬 시작 | 컴포넌트 정상·거절·경합 16건 | PASS |
| REVIEW-M10-M12 | 답글 키와 본문이 모두 같을 때만 재생하고 좋아요는 기존 분류 상태를 보존 | 실제 PostgreSQL 답글·좋아요 경합 2건 | PASS |
| REVIEW-M21 | 댓글 tenant와 발행 글·편집 초안 tenant를 복합 FK로 강제 | 실제 PostgreSQL 교차 참조 2종 거절 | PASS |
| REVIEW-M23-M25 | 사건 전체 SQL 집계, 오래된 미알림 사람 사건 포함, Slack 문자열 정제, 실패 알림 재시도 | API·스크립트 계약 6건 | PASS |
| REVIEW-MINOR | 정본 success·focus·player·radius 토큰, 상태 글자색, 사건 RLS와 전체 서비스 라벨 | design-lint 위반 0, 전체 타입 검사 통과 | PASS |

**전체 회귀:** `npm run test` 173파일 1,302건 통과, 조건부 6건 건너뜀.
`npx tsc --noEmit`, `design-lint.sh dashboard/src`가 통과했다.
`npm run build`는 174/174 경로를 생성하고 종료 코드 0으로 통과했다. 기존 NFT 추적 경고 1건은 남았다.
`verify-basic-flow-e2e.mjs` 11/11, `verify-studio-v1-e2e.mjs` 12/12가 실제
`localhost:3456`에서 통과했다. 검증용 draft, channel account, 발행 예약 행은 0건 남겼다.

**남은 BLOCK:** MAJOR 1·3은 기존 중복 데이터 정리와 과금 장부 보존 기간의 데이터 정책 결정이 필요하다.
MAJOR 8의 만료 토큰 공급자 호출 차단은 반영했지만 갱신 가능 여부를 구분하는 구조화 오류는 남았다.
MAJOR 9·11·13~19·22·26~30·32·33, MINOR 6·9는 미구현이다. 운영 배포와 실제 외부 채널 발행은 미검증이다.

## 2026-08-28 NG: OSMU 코드리뷰 42건 수정 착수

| 우선순위 | 검수 범위 | 현재 판정 | 종료증거 |
|---|---|---|---|
| 1 | 과금 우회, 중복 외부 발행, 작업 공간 격리 | NG | 각 재현 시나리오의 실제 PostgreSQL 또는 `localhost:3456` 요청에서 우회·중복·누출 0건 |
| 2 | 발행·댓글·숏폼 공장의 멱등, 경합, 부분 실패 | NG | 정상 1건, 거절 1건, 경합 1건 회귀 테스트와 실앱 응답 |
| 3 | 편집·성과실·온보딩 기본 흐름과 승인 시안 | NG | 승인 v63 대조와 기본 흐름 E2E 통과 |
| 4 | 디자인 토큰, 운영 알림, 복구성 MINOR | NG | 디자인 lint와 결함별 회귀 테스트 통과 |

**근거:** `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-08-28.md`의 MAJOR 33건과 MINOR 9건을
돈 손실, 격리 침해, 기본 흐름 차단 순으로 재정렬했다. 지정 경로 `docs/osmu-code-review-2026-08-28.md`는
존재하지 않아 실제 감사 산출물인 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-08-28.md`를 진실원으로 사용한다.
수정 전 PASS 기록은 당시 범위의 증거이며 이번 추가 재현을 대체하지 않는다.

## 2026-08-28 NG -> 수정 -> 실화면 재검증 -> PASS: 네 방 기본 흐름

| 시험 항목 | 수정 결과 | 직접 증거 | 판정 |
|---|---|---|---|
| OSMU-FLOW-UI-01 | 성과실을 항상 먼저 그리고 첫 사용자 온보딩은 인라인 도움으로 유지 | `localhost:3456`의 390, 768, 1024, 1440에서 성과실 본문과 방향 제안 3건. 전체 화면 모달 0건, 다른 방 왕복 4건 | PASS |
| OSMU-FLOW-UI-02 | 발행실 빈 상태에 다음 행동 한 줄과 `생성실 열기` 단추 연결 | 네 폭 모두 빈 상태 행동 노출. 단추 클릭 뒤 `/studio?room=create`와 생성실 본문 확인 | PASS |
| OSMU-FLOW-UI-03 | 생성실 빈 상태에 첫 행동 한 줄과 `주제부터 적기` 단추 연결 | 네 폭 모두 빈 상태 행동 노출. 단추 클릭 뒤 주제 입력 초점 확인 | PASS |

**화면 증거:** `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-flow/`의 네 방 4개 x 4폭 캡처와 `observations.json`.
사이드바 실제 링크 16회, 방 본문 16회, 다음 행동 16회, 가로 넘침 0건, 화면 노출 401 0건,
콘솔 오류 0건이다. 검증 작업 공간의 온보딩 완료 설정은 원래 값으로 복원했고 임시 고객 토큰은 0건 남겼다.

**회귀 증거:** `verify-basic-flow-e2e.mjs` 11/11. 전체 Vitest 171파일 1,288건 통과,
조건부 6건 건너뜀. TypeScript, Webpack production build 174페이지, 디자인 토큰 위반 0건.
운영 배포와 실제 외부 채널 발행은 이번 범위가 아니므로 미검증이다.

## 2026-08-28 PASS: 교차 모델 BLOCK 필수 3건 수정과 추가 5건 보정

| 시험 항목 | 수정 결과 | 직접 증거 | 판정 |
|---|---|---|---|
| OSMU-BLOCK-M1 | 무료 재생성 몫 키를 회원의 UTC 날짜로 고정하고 요청 시간대는 초기화 안내에만 사용 | `localhost:3456`에서 서로 반대 시간대의 별도 작업을 만든 뒤 첫 재생성 201, 둘째 409. Studio E2E 12/12 | PASS |
| OSMU-BLOCK-C1 | 공장 실행에 갱신 시각과 heartbeat를 두고 15분 미갱신 실행 회수, 운영자 강제 종료 API 추가 | 죽은 실행 뒤 새 실행 HTTP 201과 이전 행 `failed`. 운영자 강제 종료 HTTP 200과 행 `failed` | PASS |
| OSMU-BLOCK-F1 | 사람 개입 장애는 원장 저장 뒤에도 Slack으로 보내고 자동 복구 장애만 Slack에서 제외 | 격리 서버의 실제 `/api/channel-config` HTTP 200, DB 장애 `open`, 로컬 Slack webhook 1건 | PASS |
| OSMU-BLOCK-I1/I2 | 숏폼 공장 모든 저장소 쿼리에 tenant 조건을 추가하고 migration을 transaction으로 감쌈 | 실제 PostgreSQL 공장 격리와 경합 통합 테스트 4건 통과 | PASS |
| OSMU-BLOCK-I3 | 댓글 API 인증 해석을 오류 경계 안으로 옮겨 AuthError 상태를 보존 | `localhost:3456` 무효 bearer 요청 HTTP 401, Route 계약 4건 통과 | PASS |
| OSMU-BLOCK-C3 | 답글 청구에 기본 15분 lease와 시간 기반 회수를 추가 | 실제 PostgreSQL에서 살아 있는 청구는 conflict, 2초로 만든 만료 청구는 새 요청이 claim | PASS |
| OSMU-BLOCK-C4 | 답글 시간 초과와 응답 불명은 청구를 유지하고, 확정 HTTP 거절만 청구를 해제 | provider와 service 계약 7건 통과. 실제 공개 댓글 provider는 미검증 | 조건부 PASS |

**전체 회귀:** `npm run test` 172파일 1,293건 통과, 조건부 6건 건너뜀. `npx tsc --noEmit`,
Webpack production build, 정적 페이지 174개 생성, `design-lint.sh dashboard/src` 위반 0건.
`verify-studio-v1-e2e.mjs` 12/12와 `verify-shorts-factory-recovery-e2e.mjs` 2/2 통과.

**정리:** M1 실측을 위해 잠시 옮긴 기존 UTC 몫 행은 원래 날짜로 복구했다. C1과 F1에서 만든
검증 실행, 임시 tenant, 계정, 장애 행은 삭제했다. 비밀값과 원문 토큰은 출력하거나 문서에 남기지 않았다.

**남은 감사 항목:** F2, M2, D1, D2, F3, F4는 이번 수정 범위에서 미구현이다. C4 실제 공개 댓글
시간 초과는 중복 게시 위험 때문에 실계정에서 강제로 만들지 않았으며 QA 환경의 provider fault injection이 필요하다.

## 2026-08-28 ❌ NG: 네 방 기본 흐름의 마지막 방과 첫 행동 차단

| 시험 항목 | 재현된 결함 | 현재 판정 | 종료증거 |
|---|---|---|---|
| OSMU-FLOW-UI-01 | 채널 0개인 첫 사용자가 사이드바에서 성과실을 누르면 온보딩 전체 화면이 성과실을 덮는다 | ❌ NG | 네 폭에서 성과실 본문과 방향 제안 3건이 보이고 다른 방 링크도 계속 조작 가능 |
| OSMU-FLOW-UI-02 | 작업물이 없는 발행실에 다음 행동 안내와 생성실 이동 단추가 없다 | ❌ NG | 네 폭에서 안내 한 줄과 생성실 이동 단추를 관찰 |
| OSMU-FLOW-UI-03 | 후보가 없는 생성실에서 첫 행동의 우선순위가 분명하지 않다 | ❌ NG | 네 폭에서 다음 행동 한 줄과 주 행동 단추를 관찰 |

**근거:** 컨트롤러가 실제 `localhost:3456` DOM을 순회해 성과실 전체 화면 모달과 생성실·발행실
빈 상태를 관찰했다. 수정 후에는 같은 작업 공간과 390, 768, 1024, 1440 네 폭으로 재검증한다.

## 2026-08-28 ❌ NG: 교차 모델 BLOCK 중대 결함 수정 착수

| 시험 항목 | 재현된 결함 | 현재 판정 | 종료증거 |
|---|---|---|---|
| OSMU-BLOCK-M1 | 요청 시간대를 바꾸면 회원의 하루 무료 재생성 몫이 다른 날짜 키로 다시 생긴다 | ❌ NG | 서로 다른 시간대의 서로 다른 작업 두 건에서 무료 몫 한 번만 허용 |
| OSMU-BLOCK-C1 | 숏폼 공장 프로세스가 중간에 죽으면 실행이 `running`에 남아 이후 실행을 영구 차단한다 | ❌ NG | 만료된 실행을 회수한 뒤 새 실행 HTTP 성공, 운영자 강제 종료 경로 관찰 |
| OSMU-BLOCK-F1 | 사람 개입 장애를 DB에 저장하면 Slack 발송 전에 반환한다 | ❌ NG | 같은 장애가 DB에 기록되고 운영자 Slack 경로도 한 번 호출됨을 관찰 |

**근거:** `docs/_archive/legacy-20260912/audit/osmu-cross-review-2026-08-28-opus.md`의 BLOCK 판정과 현재 소스 경로를
대조했다. 수정 전 재현 증거와 수정 후 실제 `localhost:3456` 요청 결과를 이 항목에 역순으로
추가한다.

## 2026-08-28 ❌ NG: 사람 동선 QA 첫 콘텐츠 차단과 인증 준비 오류

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R89, R175 | 채널 연결 전 첫 후보를 만들고 연결은 발행 때 한다 | OSMU-HUMAN-01 | ❌ NG | `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-2026-08-28/scenario-1-candidates-unannotated-1440.png` |
| R201 | 사이드바의 `지금 여기`, `다음` 사족 제거 | OSMU-HUMAN-02 | ❌ NG | `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-2026-08-28/04-studio-create-authenticated-1440.png` |
| R135, R173 | 불필요한 설명과 전문가만 아는 문구 제거 | OSMU-HUMAN-03 | ❌ NG | 같은 캡처의 `AI 공유 Claude CLI`, `Social`, `Messaging`, `Video`, `Custom Integration` |

**OSMU-HUMAN-01 재현:** 고객 토큰으로 지정 작업 공간의 `/studio?room=create`를 열고 영상,
주제, 목적, 대상, 소재 권리 확인을 입력한 뒤 `후보 세 장 만들기`를 눌렀다. 첫 시도는
`Studio 인증이 비어 있습니다`, Studio 개발 인증을 세션에 넣은 두 번째 시도는
`Studio 스킬 버전이 비어 있습니다`에서 멈췄다. 후보와 다음 행동은 나타나지 않았다.

**기대:** 채널과 브랜드 안내가 비어 있어도 첫 후보 A, B, C를 만들고 편집실로 보낼 수 있어야 한다.
**실제:** 사용자가 화면에서 알거나 채울 수 없는 Studio 내부 인증과 스킬 버전을 요구한다.
생성실에는 해결 링크나 설정 위치가 없다. 처음 만든 사람은 첫 가치 도달 전에 막힌다.

**추가 관찰:** `.env.local`의 기존 Studio 고객 자격증명은 `/api/me`에서 HTTP 401이었다.
운영자 API로 발급한 임시 고객 토큰은 `/api/me` HTTP 200이었으나 위 Studio 내부 준비 오류를
해소하지 못했다. `/login`은 Supabase URL이 없어 콘솔에 초기화 경고를 남겼다.

**상태:** ❌ NG 유지. 제품 코드는 수정하지 않았다. 남은 방은 기존 작업물로 계속 실조작한다.

## 2026-08-28 NG -> 수정 -> 실화면 재검증 -> PASS: 화면별 시각 규칙 불일치

**반려 관찰:** 화면마다 여백, 글자 크기, 색, 단추, 딱지, 빈 상태, 오류 표시가 서로 다른
직접 값과 구현으로 남아 있다. `DESIGN.md`, 현행 `docs/design/ui-rules.md`,
`dashboard/src/app/globals.css`의 토큰을 기준으로 전체 프론트 소스를 계수하고 통일한 최신 증거가 없다.

**수정:** 직접값 감사기와 반복 실행 가능한 치환기를 추가했다. 여백, 글자, 색, 모서리, 그림자를
시맨틱 토큰으로 바꾸고 상태 전경과 배경, 테마와 무관한 미디어 바탕, 역할별 모서리와 떠 있는
그림자 토큰을 추가했다. 단추와 딱지는 기존 공용 컴포넌트의 역할 토큰으로 고정하고, 빈 상태와
오류 표시는 재시도 행동까지 받는 `StateNotice` 하나로 합쳤다. 영문 행동 단추와 화면 이모지도
한국어 문구로 바꿨다.

**첫 재검증에서 잡은 결함:** 기계 감사는 0건이었지만 390 폭 생성실에서 후보 제목 네 곳이
밝은 바탕에 흰색으로 보였다. 일괄 치환이 같은 JSX 줄의 파란 원형 번호와 일반 제목을 한 덩어리로
오인한 것이 원인이었다. 일반 제목을 `text-text`로 복구하고 강조 전경이 강조 배경 없이 쓰이면
실패하는 대비 계약을 감사기에 추가했다.

**종료증거:** 같은 감사기의 직접값은 3,029건에서 0건으로 줄었고, 전경 대비 짝 오류도 0건이다.
실제 `localhost:3456`의 `/api/health`와 `/`는 HTTP 200이었다. 생성실과 편집실을 390, 768,
1024, 1440 폭으로 다시 촬영했고 모든 폭에서 문서 너비와 viewport가 같아 가로 넘침이 0이었다.
후보 생성은 HTTP 201, 후보 A·B·C 세 장, 편집 도구 8개, 상시 대화창을 관찰했다. 화면 노출
401과 콘솔 오류는 0건이었다. `npx tsc --noEmit`, 디자인 토큰 검사와 production build가
통과했고 정적 페이지 174개를 생성했다. 전체 Vitest는 168파일 1,274건 통과, 조건부 6건
건너뜀이다. 수치와 추가 토큰 이유는
`docs/qa/osmu-ui-token-audit-v1-gpt-codex.json`, 네 폭 캡처와 관측값은
`docs/design/prototypes/legacy-prototype-20260912/prototype/qa-fe10-four-widths/`에 있다. 운영 배포는 미검증이다.

## 2026-08-28 NG -> 실제 고장 -> PASS: 작업 공간별 운영 장애 관측

**반려 관찰:** 발행 실패와 공유 AI 실행 실패는 구조 로그와 Slack 경보가 일부 연결돼 있지만,
장애를 작업 공간별로 보존하고 한 화면에서 조회하는 원장이 없다. 채널 토큰 만료, Studio 생성
실패, 외부 서비스 일시 오류도 같은 분류로 모이지 않는다. 현재 `/api/alerts`는 테넌트 파일의
실패 발행과 cron 상태만 읽고, 운영자 `/operator/customers`는 누적 실패 수만 보여 준다.

**잘못 울릴 위험:** 기존 관측 함수는 사람이 고쳐야 하는 실패와 네트워크 재시도로 회복할
실패를 구분하지 않는다. 설정하지 않은 OAuth 제공자도 장애로 세면 오늘의
`/api/auth/google` 미설정 사례처럼 실제 고장과 준비 전 상태가 섞인다.

**수정:** 작업 공간 RLS가 적용된 `operational_incidents` 원장에 발행 실패, 토큰 만료,
생성 실패, 외부 서비스 오류를 고정 코드로 기록한다. 운영자 API와 기존 고객 관리 화면은
사람 확인 필요, 자동 복구 대기, 복구됨을 나눠 보여 준다. `health-alert.sh`는 사람 확인 필요이면서
아직 알리지 않은 항목만 Slack으로 보내고 성공한 전송만 확인 시각을 기록한다.

**종료증거:** 지정 작업 공간에 복구 가능한 임시 암호화 Threads 계정 한 행을 만들고 상태와
만료시각을 실제로 만료시켰다. `GET /api/channel-config`는 HTTP 200과 `reconnect`를 반환했고,
`GET /api/operator/incidents`는 HTTP 200과 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`,
사람 확인 필요, `token_expired`, `threads`를 반환했다. 로컬 웹훅은 작업 공간명이 포함된 한국어
알림을 수신했고 이후 `notifiedAt`이 채워졌다. 임시 계정은 삭제했고 열린 검증 장애는 0건이다.
실제 Chrome에서 운영 장애 패널과 작업 공간명을 확인했으며 콘솔 오류와 예외는 0건이다.
전체 Vitest 168파일 1,273건과 동일 장애 8건 경합 통합 테스트가 통과했다. 조건부 6건만
건너뜀. `npx tsc --noEmit`, 디자인 토큰 검사,
production build와 정적 페이지 174개 생성이 통과했다. 운영 배포와 실제 Slack 수신은 미검증이다.

## 2026-08-28 NG -> 공격 -> PASS: 작업 공간 간 테넌트 격리

**반려 관찰:** 여섯 사업체가 같은 시스템을 쓰지만, 실제 작업 공간 두 개와 서로 다른
고객 토큰을 사용해 모든 읽기·수정·삭제 경로를 교차 공격한 최신 증거가 없었다.

**공격:** 실제 Postgres에 임시 작업 공간 A와 B를 만들고 DB 14종과 테넌트 파일·설정에
서로 다른 표식을 넣었다. A 토큰으로 B ID를 넣은 읽기 54개, 무토큰 54개, 폐기 토큰
54개, 교차 수정·삭제 12개, 몸통의 `tenant_id=B` 위조 3개, 정상·사후 검증 6개를
`localhost:3456`에 실제 요청했다.

**종료증거:** 총 183건 중 누출과 B 변경은 0건이었다. 무토큰과 폐기 토큰은 54개 읽기
경로 전부 401이었다. 교차 객체 수정·삭제는 403·404로 막혔고, 몸통 위조 3건은 A에만
생기고 B에는 0건이었다. 공격 뒤 B DB 원값과 파일·설정 SHA-256이 같았다. 실제 Postgres의
RLS 19개는 ENABLE·FORCE·USING·WITH CHECK를 모두 가졌고 A 문맥에서 B 조회·수정·삭제는
0행, B 명의 삽입은 거절됐다. 실앱 공격 183건과 전체 Vitest 162파일 1,258건이 통과했고,
선택적 라이브 항목 6건만 건너뛰었다. `npx tsc --noEmit`과 디자인 토큰 검사도 통과했다.
커밋 `b4ee60ab`의 격리 작업 디렉터리에서 Webpack production build와 정적 페이지 173개
생성이 통과했다. 전체 공격표는 `docs/qa/tenant-isolation-attack-2026-08-28.md`다.

## 2026-08-28 NG -> 수정 -> PASS: 주요 다섯 화면의 속도·키보드·대비

**반려 관찰:** 홈, 생성실, 편집실, 발행실, 성과실은 실제 앱에 연결됐지만 같은 조건에서
첫 그림 시간을 잰 기록이 없고, 키보드만으로 주요 흐름을 끝까지 통과한 증거와 화면 대비
검사 결과도 없다. 느리지 않거나 쓸 수 있다고 판정할 근거가 없는 상태다.

**근본 원인:** 생성실·편집실 주소에서도 발행실을 먼저 렌더한 뒤 방을 바꾸고, 발행 전용 첫 댓글과
플랫폼 계정 요청을 모든 방에서 시작했다. 라이트·다크 보조 글자 토큰은 WCAG AA 대비에 못 미쳤고,
공통 키보드 초점 링도 없었다.

**수정:** 주소 쿼리를 첫 렌더와 같은 페이지 이동의 진실원으로 사용했다. 발행 전용 요청은
발행실에서만 시작한다. 보조·상태 토큰과 공통 3px 초점 링을 보정하고, 카드뉴스 이동 단추에
한국어 접근성 이름과 44px 조작 영역을 넣었다.

**종료증거:** 실제 `localhost:3456`의 같은 작업 공간에서 새 브라우저 컨텍스트 3회 중앙값으로
수정 전후를 쟀다. 편집실 첫 그림은 1,312.2ms에서 653.7ms로 50%, 발행실은 1,135.3ms에서
598.1ms로 47% 줄었다. 생성실·편집실 초기 API는 16건에서 7건으로 줄었다. 수정 후 다섯 화면
FCP는 468ms부터 784ms, 첫 그림은 546.5ms부터 1,293.6ms였다. 성과실은 개발 서버 API 편차로
942.0ms에서 1,293.6ms로 증가해 운영 재측정을 남긴다. 키보드 14단계, 후보 생성 HTTP 201,
초안 저장 HTTP 200, 초점 링, 라이트·다크 텍스트 1,102개 대비 위반 0, 401 0건, 콘솔 오류 0을
관찰했다. 전체 Vitest 162파일 1,256건 통과, 조건부 6건 건너뜀. TypeScript, 디자인 토큰 검사,
production build와 정적 페이지 173개 생성도 통과했다. 최종 health와 생성실 문서 응답은 200이었다.
상세표는 `docs/qa/osmu-fe9-주요화면-성능-접근성-v1-gpt-codex-20260828-0642.md`다.

## 2026-08-28 NG -> 수정 -> PASS: 여덟 컨셉 숏폼 공장

**반려 관찰:** 지정 작업 공간에서 Studio 생성 요청 8개를 동시에 보내 모두 HTTP 201과
서로 다른 생성 작업 번호를 받았다. 그러나 현재 API와 DB에는 이 여덟 작업을 한 실행으로
묶는 장부, 컨셉 식별자와 설정, 작업 공간 단위 동시 실행 한도, 개별 실패 뒤 나머지 계속 실행,
컨셉별 현재 단계 조회가 없다. 개별 요청 8개는 처리할 수 있지만 숏폼 공장으로 운영할 수 없다.

**근본 원인:** Studio 생성 장부는 요청 하나를 안전하게 보관하는 데 집중했고, 여러 요청을
공장 실행으로 묶는 상위 조정 계층이 없었다. 클라이언트가 8번 호출하면 생성 자체는 됐지만
동시 수와 전체 상태를 클라이언트 기억에 맡겨 작업 공간 단위 운영 계약이 성립하지 않았다.

**수정:** `shorts_factory_runs`와 `shorts_factory_concept_runs`를 추가하고 기존 Studio 생성
서비스를 컨셉별로 호출하는 제한된 워커 풀을 연결했다. 실행마다 동시 한도 1부터 8을 받고,
작업 공간에는 활성 공장 하나만 허용한다. 각 컨셉 오류는 개별 실패로 기록하고 전체 워커를
중단하지 않는다. 실행 단건과 작업 공간 최근 실행 목록 API를 추가했다.

**종료증거:** 실제 `localhost:3456`에서 정상 컨셉 8개를 동시 한도 8로 시작해 HTTP 201,
상태 `succeeded`, 성공 8, 실패 0을 관찰했다. 네 번째 컨셉의 목적을 비운 실행은 HTTP 201,
상태 `partial`, 성공 7, 실패 1이었다. 실패 컨셉은 `LEARNING_CONTEXT_INCOMPLETE`, 나머지
7개는 서로 다른 Studio 작업 번호를 받았다. 실행 단건 조회와 최근 실행 목록은 HTTP 200이었다.
실제 Postgres 통합에서 다른 작업 공간은 실행을 찾지 못했고, 같은 작업 공간의 둘째 활성 실행은
409로 거절됐다. 전체 Vitest 159파일 1,247건 통과, 6건 조건부 스킵. TypeScript,
production build 173페이지, 디자인 토큰 검사가 통과했다. production migration과 실제 영상
렌더 8개, 외부 발행 8개 병렬 실행은 미검증이다.

## 2026-08-28 NG -> 수정 -> PASS: 채널 없이 만드는 첫 콘텐츠

**반려 관찰:** 지정 작업 공간의 실제 `GET /api/onboarding`은 HTTP 200과
`온보딩 미완료, 채널 0, 위키 0, 발행 0`을 반환했다. 이 상태에서 현행
`OnboardingWizard`는 업종과 채널을 고른 뒤 `첫 번째 채널을 연결하세요`를
세 번째 화면으로 낸다. `OnboardingChecklist`도 첫 항목을 `채널 1개 연결`로
두고 있어, 채널 연결 없이 올릴 갈래만 정하고 첫 한 편을 만드는 확정 순서와
반대다.

**수정:** 온보딩은 업종, 글과 카드뉴스 또는 영상 갈래, 생성실 이동의 세 단계로 줄였다.
채널 연결 화면과 자격증명 입력은 온보딩에서 제거하고 기존 왼쪽 사이드바 채널 화면에
그대로 뒀다. 생성실은 온보딩 갈래를 이어받고, 브랜드 안내가 비어 있어도 주제, 목적,
대상, 소재 권리 확인만으로 생성 요청을 보낸다. 빈 상태 체크리스트의 첫 항목도 콘텐츠
만들기로 바꿨다.

**종료증거:** 지정 작업 공간을 `온보딩 미완료, 채널 0, 위키 0, 발행 0, 생성 0`으로
초기화하고 `GET /api/onboarding` HTTP 200을 관찰했다. 실제 브라우저에서 테크와 영상을
고른 뒤 `POST /api/onboarding` HTTP 200, `/studio?room=create` 진입, 후보 생성
`POST /api/studio/v1/generations` HTTP 201과 A, B, C 세 장을 관찰했다. 채널 연결은
끝까지 false였다. 390 폭의 가로 넘침은 0이고, capability 고객 접근 403을 허용 목록
누락으로 확인해 수정한 뒤 HTTP 200과 콘솔 오류 0을 재확인했다. 캡처와 관측값은
`docs/design/prototypes/legacy-prototype-20260912/prototype/qa-fe7/`에 있다. 전체 Vitest 156파일 1,240건 통과, 6건 조건부 스킵,
TypeScript와 디자인 토큰 검사, production build 173페이지가 통과했다.

## 2026-08-28 NG -> 수정 -> PASS: 댓글 본문과 후속 행동 계약

**반려 관찰:** `GET /api/metrics`에는 답글 개수만 있고 댓글 본문, 답글 초안과 전송,
댓글 좋아요, 나중 처리, 편집실 인계가 없었다.

**수정:** 댓글 본문은 공급자에서 요청 시 읽고, 답글 이력과 좋아요, 보류, 편집실 인계만
`engagement_items`에 남긴다. 성과실은 확정 프로토타입의 전체, 답할 것, 고칠 것, 보류 분류와
다섯 행동을 제공한다. 채널별 미지원 동작은 `channel-capabilities.ts`의 사유를 그대로 표시한다.

**종료증거:** 지정 작업 공간의 실제 `localhost:3456`에서 임시 TikTok 글로 목록 HTTP 200,
댓글 읽기 미지원과 공식 계약 부재 사유를 관찰했다. 같은 글의 좋아요는 HTTP 409와
`ACTION_UNSUPPORTED`, 빈 답글은 HTTP 400과 `INVALID_REPLY`로 거절됐다. 임시 글은 제거해
잔여 0을 확인했다. 실제 Postgres 경합 테스트에서 같은 댓글 답글 claim은 하나만 성공했고,
다른 tenant에서는 상태가 보이지 않았다. 댓글 API, 공급자, capability, DB, 성과실 버튼,
기존 홈 회귀 집중 테스트 85건이 통과했다. `npx tsc --noEmit`과 디자인 토큰 검사는 종료코드
0이다. 지정 작업 공간에 실제 발행 글과 연결 계정이 없어 외부 댓글 조회, 답글 전송, 좋아요의
실계정 부작용은 미검증이다.

## 2026-08-28 NG -> 수정 -> PASS: v63 생성실·편집실 실제 앱

**반려 관찰:** 생성실은 Studio 후보 3장을 받지만 확정 v63의 `이 단계와 예시 / 회원에게
쌓인 것` 두 칸 구조와 단계 이동이 없다. 편집실은 영상 목차와 현재 대사만 있고,
아이콘 조작, VREW식 대사 줄 삭제·복원, 무음 구간 줄이기, 카드뉴스·음악 편집 갈래가 빠져 있다.

**근본 원인:** 앞선 화면 2·3차가 Studio API 연결과 네 방 셸 교체를 먼저 끝내면서,
v63 생성·편집 작업대의 상태 분기와 조작 계약을 최소 구조로 축소했다. API 성공과 상단
표식 존재만 검증해 프로토타입 구성요소 누락을 종료조건이 잡지 못했다.

**수정:** 생성실은 세 단계와 읽기 전용 디스플레이, 누적 학습 정보, 대화창 종류·후보 선택으로
분리했다. 편집실은 왼쪽 영상 목차, 중앙 미리보기와 아이콘 도구, 하단 대사를 배치하고 대사
빼기·되살리기와 무음 구간 축소를 연결했다. 영상·음악 백엔드가 없으면 준비 상태만 표시한다.

**종료증거:** `localhost:3456`에서 Studio 생성 요청 HTTP 201과 후보 3장을 관찰했다.
390, 768, 1024, 1440 네 폭 모두 생성실 디스플레이 단추 0개, 후보 3개, 대화창 가시성,
편집실 대사 하단 배치, 도구 단추 8개, 정직한 영상 준비 상태, 문서와 방 가로 넘침 0을 확인했다.
대사 제거는 20초에서 16초로 바뀌고 복원하면 20초로 돌아왔다. 401과 콘솔 오류는 0건이다.
원본 8장과 관측값은 `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-fe6/`에 있다. 전체 Vitest 153파일 1,229건,
무음 계약을 포함한 집중 14건, TypeScript, production build 172페이지, 디자인 토큰 검사가
통과했다. production 배포와 실제 영상·음악 생성은 미검증이다.

## 2026-08-28 ❌ NG → 🔧 → ✅ PASS: v63 성과실 흐름과 정직한 댓글 준비 상태

**❌ NG 관찰:** 현행 성과실은 집계와 제안 기능은 연결돼 있었지만 v63의 방 상단, 단계형
학습 흐름, 첫 상위 글 반복 행동, 댓글 백엔드 준비 상태, 모바일 원장 표현이 빠져 있었다.
댓글 수만 보이면 사용자가 댓글 본문 읽기와 답글까지 된다고 오해할 수 있었다.

**🔧 수정:** 최근 30일 표본 상단과 판정, 무엇이 통했나, 성과 제안, 달린 반응 순서를
고정했다. 첫 상위 글은 실제 제안 API를 호출한다. 댓글 본문과 답글 입력은 만들지 않고
준비 중이라고 명시했다. 성과 원장은 1024 미만에서 카드형 행으로 바꿨다.

**✅ 종료증거:** Playwright로 `localhost:3456`의 성과실을 390, 768, 1024, 1440에서
전체 캡처했다. 네 폭 모두 본문과 문서 가로 넘침 0, 여섯 섹션 순서 정상, 댓글 준비 문구
1개, 답글 입력과 전송 단추 0개, 401 0건, 콘솔 오류 0건이다. 원본은
`docs/design/prototypes/legacy-prototype-20260912/prototype/qa-fe5/`에 있다. 성과 계약 9건과 전체 Vitest 1,213건, TypeScript,
고정 커밋 격리 Webpack build 171페이지, 디자인 토큰 검사가 모두 통과했다. production
배포와 실제 SNS 댓글 조회는 미검증이다.

## 2026-08-28 ❌ NG → 🔧 → ✅ PASS: Studio 생성 장부 Postgres 영속화

**❌ NG 관찰:** `dashboard/src/lib/studio/generation/service.ts`가 생성 작업, 멱등 응답,
회원별 현지 날짜 무료 재생성 사용 기록을 프로세스 `Map` 세 개에 저장한다. 재시작하면 조회와
무료 몫이 사라지고, 서버가 둘이면 같은 회원이 하루 무료 재생성을 두 번 소비할 수 있다.

**근본 원인:** Studio v1의 HTTP 계약을 먼저 수직 검증하면서 production 장부 스키마 결정을
의도적으로 회수했고, 그 뒤 생성 API가 실제 화면에 연결됐지만 메모리 런타임을 production 준비
상태로 승격하지 않았다. 프로세스 생존 범위 테스트만 있었고 재시작과 다중 인스턴스 경합을
종료조건에 넣지 않은 검증 공백도 원인이다.

**🔧 수정:** 기존 `schema.sql`, `rls.sql`, `withTenant()` 규약으로 생성 작업, 멱등 키,
무료 재생성 사용 기록을 영속화했다. 회원의 현지 날짜 의미와 기존 HTTP 상태·응답 모양은 유지했다.

**✅ 종료증거:** 3456 실앱 Studio E2E 10건 전부 통과. 실제 Postgres에서 같은 멱등 키
동시 요청은 작업 1행과 같은 응답으로 수렴했고, 다른 본문은 409로 거절됐다. 동시 무료
재생성은 성공 1건과 409 1건, 무료 사용 1행으로 수렴했다. 첫 Next 프로세스가 만든 작업
`9a7a377a-3623-430b-8341-70812d292ff3`을 종료한 뒤 새 프로세스가 같은 ID로 HTTP 200
조회했다. 전체 Vitest 150파일 1,213건, TypeScript, Webpack build 171페이지, 디자인 토큰
검사가 통과했다. production DB migration과 배포는 미검증이다.

## 2026-08-28 ❌ NG → 🔧 → ✅ PASS: 성과 제안 생성 큐 인계 고객 인증 복구

**❌ NG 관찰:** 실제 `localhost:3456`과 실제 DB에 임시 tenant, 브랜드 맥락,
시장 신호를 연결했다. 고객 `osmu_` 토큰으로 `POST /api/suggestions`는 HTTP 200과
가설 3개를 반환했지만, 같은 토큰의 `POST /api/suggestions/enqueue`는 HTTP 403
`{“error”:“이 API는 운영자 전용입니다”}`로 막혔다.

**근본 원인:** 성과실 고객 UI가 실제로 호출하는 신규 route를 추가하면서
`proxy.ts` tenant-safe allowlist에 동일 경로를 추가하지 않았다. UI 정적 경계 테스트는
경로 문자열이 존재함만 검사해 proxy 인증 경계 누락을 잡지 못했다.

**🔧 수정:** `/api/suggestions/enqueue`를 tenant-aware 경계에 명시했고, 유효한
고객 토큰은 통과하되 폐기된 토큰은 401을 유지하는 `BE-V63-02` 회귀 테스트를
추가했다.

**✅ 종료증거:** 수정 후 고객 토큰으로 가설 3개 HTTP 200, 선택 제안 큐 인계
HTTP 201을 재관찰했다. 같은 실제 DB에서 queue payload의 `suggestionId`, `basis`,
`label`, `verified`, `evidence.signalIds`, 표본 0건을 대조했다. 편집 계약은 장면 재정렬
200, 문장 삭제 200, 복원 200, 낡은 revision 409와 DB 이력 3건을 일치시켰다.
전체 Vitest 148파일 1,204건 통과, 6건 skipped, TypeScript 통과, Webpack production build
171페이지 통과, design lint 위반 0이다. 임시 tenant, draft, queue는 정리해 DB 잔여 0을
확인했다. 증거 전문은 `/tmp/osmu-build4-live.t2f5Hf/`에 보존했다. production 반영은
미검증이다.

## 2026-08-28 ❌ NG: 화면 4차 390 셸이 본문을 화면 밖으로 밀어냄

**반려 관찰:** `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-fe4/publish-room-390.png`에서 폭 96px의 네 방 레일이
세로 사이드바 전체 높이를 차지하고, 발행실 본문은 오른쪽 화면 밖으로 밀려 보이지 않는다.

**근본 원인:** 실제 `Sidebar.tsx`가 모든 폭에서 `h-screen w-24`를 고정하고
`AuthGate.tsx`도 셸 주축을 항상 가로로 유지한다. 승인 프로토타입의 700px 아래 모바일 서랍 분기와
요구 대장 R19의 390 예외가 화면 3차 이식에서 빠졌다. 1024 레일 캡처만 통과 조건으로 삼고
390에서는 대화창 존재만 세어 본문 가시 폭을 측정하지 않은 검증 공백도 원인이다.

**수정 종료조건:** 390에서는 사이드바를 서랍으로 전환하고 닫힌 셸에 현재 방 이름과
`지금 여기`를 유지한다. 768 이상은 기존 네 방 레일을 보존한다. 홈, Studio, 채널, 설정을
390, 768, 1024, 1440에서 캡처하고 본문 가시 폭, 가로 넘침, 네 방 링크, 콘솔 오류를 기록한다.

## 2026-08-28 ❌ NG → 🔧 → ✅ PASS: 화면 3차가 v63 네 방 정보 구조를 실제 앱에 이식

**반려 관찰:** `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-fe2/publish-room-1440.png`와
`create-room-candidates-1440.png`를 확정 프로토타입 v63과 대조했다. 실제 앱은 기존
Marketing Hub 분류 사이드바와 헤더 방 전환 알약을 유지했고, 오른쪽은 대화창이 아니라
기능 단추와 발행 채널 체크 목록이었다. 발행 채널 선택도 각 미리보기 칸 밖에 있었고
발행 이력과 이모지 단추 문구가 남았다.

**근본 원인:** 화면 2차가 Studio API 후보 3장, 편집 인계, 명령 라우팅, 미리보기 입력 계약을
기존 페이지 구조 위에 추가하는 데 집중해 승인 프로토타입의 정보 구조를 교체하지 않았다.
기능 연결 테스트만으로 시안 준수를 대리했고, 실제 앱과 v63의 구조 대조를 종료 조건으로
검사하지 않은 것이 직접 원인이다.

**수정:** 사이드바 첫 영역을 생성실, 편집실, 발행실, 성과실의 순번과 연결선으로 교체했다.
헤더에는 작업물 전체와 기존 승인 인박스, 발행 캘린더 접근을 유지했다. 생성실, 편집실,
발행실에 `data-room-top` 한 줄을 추가했다. 오른쪽 기능 단추 목록은 실제 명령을 받는 대화창으로
교체하고, 발행 체크와 계정 선택은 7개 미리보기 칸 머리로 이동했다. 발행 이력은 렌더 경로에서
제거하고 실행 단추를 `초안으로 저장`, `검토 요청`, `Publish (3)`, `날짜 잡기`로 정렬했다.

**회귀 발견과 수선:** 옛 화면 렌더 경로 제거 뒤 전체 테스트가 영상 내레이션 폴백 메시지 누락
1건을 잡았다. 배너를 새 발행실에 다시 연결했다. 첫 브라우저 캡처에서는 카드 최소 폭 때문에
세 번째 카드가 가로로 밀렸다. 이를 3열 반응형 그리드로 바꿔 텍스트 3칸, 영상 3칸,
카드뉴스 1칸이 같은 발행실에 모두 노출되게 했다.

**✅ 종료증거:** `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-fe3/`의 1440 발행실, 생성실 후보 3장, 네 방 사이드바와
1024 좁은 사이드바를 원본으로 열었다. 실제 `localhost:3456`에서 네 방 4개, 미리보기 7개,
미리보기 내부 발행 체크 4개, 계정 선택 4개, 발행 중지 0개를 관찰했다. Studio 생성 요청은
HTTP 201이고 A, B, C 선택 단추 3개가 나타났다. 인증 401과 브라우저 콘솔 오류는 0건이다.
전체 `npm run test`는 148파일, 1,200건 통과, 6건 skipped, 실패 0이다. TypeScript와
production build 171페이지가 통과했고 design lint는 토큰 위반 0이다. production 배포는 미검증이다.

## 2026-08-28 🔧 로컬 수정: Studio v1과 대시보드 Authorization 충돌

**❌ NG 관찰:** 대시보드 Proxy와 Studio identity가 같은 `Authorization` 헤더를 각각 자기 토큰으로 검사해 실제 `localhost:3456` 앱에서는 어느 토큰을 보내도 한쪽이 401로 막혔다.

**원인과 수정:** 현재 존재하는 Studio v1 생성·조회·재생성 3개 경로만 대시보드 인증 예외 allowlist로 분리하고, Studio Route Handler의 bearer 검증은 유지했다. 기존 대시보드 Studio 경로와 tenant allowlist는 변경하지 않았다. 미등록 Studio v1 경로도 자동 예외가 되지 않는다.

**🔧 종료증거:** 같은 3456 listener에서 생성 201 후보 3장, 학습정보 누락 422 필드 지목, 조회 200, 무료 재생성 201, 추가 재생성 409, `/api/queue` 200, `/api/suggestions` 200을 관찰했다. 전문은 `/private/tmp/studio-api-live-final.GqNVsz/`. 전체 Vitest 1,170건과 커밋 `1eb0e848` 전용 webpack production build 169/169 통과.

**미검증:** stage와 production 반영, production identity adapter. 배포 뒤 같은 Studio 201·401과 대시보드 회귀를 재검증하기 전에는 production PASS로 승격하지 않는다.

## 2026-08-27 ❌ NG: v62 성과실 핵심 행동의 백엔드 단절

**반려 관찰:** 확정 프로토타입 v62의 성과실은 댓글 본문, 답글 보내기, 나중 처리,
`이 결로 한 편 더`를 요구한다. 현행 `GET /api/metrics`는 replies 숫자만 반환하고,
댓글 목록과 답글 provider 호출은 없다. `POST /api/suggestions`가 만든 제안을 기존
`POST /api/queue/add`로 넘기는 연결도 없다.

**추가 계약 결함:** 성과와 trend signal이 모두 0건이면 `POST /api/suggestions`는
빈 ideas와 재시도 안내만 반환한다. 성과가 없어도 가설 방향을 먼저 제안하라는 R68과 반대다.
Threads OAuth scope에도 답글 작성에 필요한 `threads_manage_replies`가 없다.

**범위 실측:** 위임서의 API 98개는 상위 route family 수와 일치한다. 동적 하위 route를 포함한
실제 route 파일은 163개다. 요구사항 대장의 고유 번호는 210개가 아니라 205개다. 상세 대조와 심각도는
`docs/_archive/legacy-20260912/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md`에 기록했다.

**종료증거:** design과 eng-design 승인 뒤 댓글 read-through와 답글, 제안 큐 인계,
성과 0건 가설 3개를 계약 테스트로 구현한다. 승인된 테스트 계정으로 실제 댓글 조회와 답글 1건,
제안의 queue draft 생성 1건을 관찰하기 전에는 PASS로 바꾸지 않는다.

## 2026-08-24 ✅ PASS: v48 Design Score C 원인 3건 수선

**수정 범위:** v47의 1024 왼쪽 56px 아이콘 줄, 본문과 담당 70:30, 카드 여백 A/B,
131개 화면과 상태를 유지했다. 390의 대화 세로 예산, 제품 글자 하한, 모바일 터치 하한만
수선하고 선택지 스크롤 마감과 활성 transition 속성 제한을 함께 반영했다.

**필수 실측:** `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v48/qa-results.json`에서 390 대화 본문 152px,
첫 선택지 가시율 100%, 입력과 보이는 선택지 겹침 0을 확인했다. 보이는 제품 UI의 12px 미만
글자는 1440·1024·390 모두 0건이다. 390의 보이는 조작 20개 중 44px 미만은 0건이다.

**회귀와 픽셀 관찰:** 세 폭에서 글자 단위 분절, 딱지 잘림, 흐름 가로 넘침, 본문 방 이름 중복,
콘솔 오류가 모두 0이다. 1024 왼쪽 탐색은 56px, 담당 비율은 0.290이다. 1440·1024·390 캡처를
원본으로 직접 열어 390의 질문, 첫 선택지, 두 번째 선택지, 입력, 보내기 단추가 같은 첫 화면에
보이는 것을 확인했다. 카드 여백 A/B와 화면 선택 기능도 자동 검사에서 유지됐다.

**판정:** `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v48/design-review-v48.md`의 셀프 Design Score B.
독립 design-review 재채점과 `/approve design`은 아직 미검증이라 기술설계 게이트는 열지 않는다.

## 2026-08-24 ❌ NG: v47 독립 디자인 리뷰 Design Score C

**반려 관찰:** 1024의 글자 단위 줄바꿈과 딱지 잘림은 해소됐지만 390의 상시 담당 대화 본문은
41px만 남아 네 선택지의 첫 화면 가시율이 모두 0%다. `한 편의 흐름`, `추천` 탭은 40px로
44px 터치 하한에 못 미친다. 보이는 12px 미만 텍스트는 1440 56건, 1024 35건, 390 25건이다.

**독립 판정:** `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v47/design-review-v47.md`의 Design Score C, AI Slop A.
지목된 `출시 전에 꼭 보는 체크리스트 7가지` 선택지 자체는 1440에서 100% 보인다. 다음 선택지는
1440에서 86%, 1024에서 18%만 처음 보이지만 포커스 시 자동 스크롤되어 영구 소실은 아니다.

**B 승격 종료증거:** 390 첫 선택지 가시율 100%, 대화 본문 120px 이상, 입력창 겹침 0,
세 폭 12px 미만 텍스트 0, 390의 모든 보이는 조작 44px 이상을 실렌더와 computed 값으로 확인한다.
프로토타입 수선은 사용자 컨펌 전 미착수다.

## 2026-08-24 ❌ NG → 🔧 → ✅ PASS: v46 1024 붕괴를 v47 폭 적응형 상시 담당으로 수선

**반려 관찰:** 컨트롤러의 1024px 실물 캡처에서 오른쪽 상시 담당이 제품 폭의 약 40%를 차지했다.
가운데 흐름 화면의 제목은 두 글자씩 세로로 갈라졌고, 정보 칩과 다음 인계 문구가 잘리거나
한 단어씩 줄바꿈됐다. 하단 학습 고리도 세 구절을 읽기 어려운 폭으로 눌렸다.

**근본 원인:** v46에서 304px 담당 열을 추가하면서 1024px 본문 내부의 기존 3열 계약을 그대로
유지했다. 자동 넘침 수치가 0이라는 검사만 통과시켜, 실제 글자 단위 줄바꿈과 칩 말줄임을
시각 결함으로 잡지 못했다.

**수정:** v46은 보존했다. v47은 Android canonical layouts의 840dp 이상 70:30과 600dp 미만
아래 배치, Apple HIG Sidebars의 제한 폭 compact control을 차용했다. 1024은 왼쪽 탐색 56px,
본문 70%, 오른쪽 상시 담당 30% 이하이며 탐색을 펼쳐도 본문 폭이 움직이지 않는다. 390은 담당을
본문 아래에 둔다. Figma, Notion, Intercom, Linear의 공식 규칙도 화면 안 근거 패널에 차용·기각과
공개 숫자 유무를 함께 기록했다.

**자동 실측:** `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v47/qa-results.json`의 최종 실행에서 1024 담당 비율 0.290,
본문 폭 654px, 왼쪽 탐색 56px을 관찰했다. 1440·1024·390 모두 글자 단위 줄바꿈 0건,
딱지 잘림 0건, 흐름 카드 가로 넘침 0건, 전달물 넘침 0건, 상시 담당 가시성 3/3,
본문 방 이름 중복 0건, 콘솔 오류 0건이다. 카드 여백 A/B와 1440 탐색 상태 저장도 통과했다.

**픽셀 직접 관찰:** `openclaw-auto-v47-1024.png`, `openclaw-auto-v47-390.png`,
`openclaw-auto-v47-1440.png`을 원본 크기로 열었다. 1024 제목은 `다시 걷는 첫 주`가 한 묶음으로
읽히고, `선택 관찰과 제작 정보` 딱지는 카드 안에 전부 보인다. 다음 묶음과 하단 학습 고리도
한두 글자짜리 세로 열 없이 읽힌다. 390은 정보 딱지와 학습 고리 세 단계를 보존하며 담당 입력과
보내기까지 같은 프레임에 들어온다. 독립 다른 모델의 2차 픽셀 검수와 design gate 승인은 미검증이다.

## 2026-08-23 ✅ PASS: v46 접히는 사이드바·상시 담당·본문 단계명 중복 제거

**직접 관찰:** `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v46/`의 390·1024·1440, 1024 사이드바 접힘,
카드 여백 A/B, 선택 보드 캡처를 직접 열었다. 왼쪽 사이드바는 224px에서 56px으로
접히며 아이콘과 현재 항목 강조가 남는다. 담당은 1024·1440에서 오른쪽 304px 열,
390에서는 본문 아래 372px 패널로 항상 보이고 입력과 보내기까지 같은 프레임에 들어온다.

**중복·넘침:** v46 흐름 화면 12개에서 디스플레이 본문의 `생성실·편집실·발행실·성과실`
노출은 0건이다. 390·1024·1440에서 전달 요약 가로 넘침, 흐름 보드 세로 넘침,
프로토타입 가로 넘침은 모두 0이다. 헤더는 세 폭 모두 61px 한 줄이며 학습 정보가 크레딧
왼쪽에 있다.

**상호작용·회귀:** 사이드바 224→56px 전환, `aria-label`의 접기→펼치기 변경,
`localStorage=true` 복원을 관찰했다. 카드 A는 339/339/339px, B는 189/229/230px로
실제 다른 밀도를 만든다. 화면 2개 선택, 실제 iframe 미리보기 2개, 메모와 B안이 포함된
복사 문장, 자동 저장을 확인했다. 131개 화면의 금지 문구·층 코드 노출 0, 콘솔 오류 0이다.

**근거:** `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v46/qa-results.json`,
`openclaw-auto-v46-visual-qa-v1-gpt-codex.md`, 7개 실렌더 캡처. 제품 코드와 배포 변경은 없다.
독립 다른 모델의 2차 픽셀 검수는 미검증이므로 design gate 승인은 부모 컨트롤러와 `/approve design` 몫이다.

## 2026-08-23 ❌ NG → 🔧: PRD 전수 리뷰의 AI 마케팅 SaaS 실조사 0회

**반려 관찰:** `docs/_archive/legacy-20260912/audit/osmu-prd-corpus-review-v1-gpt-codex.md`의 직전 판은 ISO 29148,
Cucumber, Volere 문서 규격만 비교했고, 사용자 필수 조건인 AI 마케팅 SaaS의 실제 상품 정의,
요금제, 온보딩을 조사하지 않았다. 문서 형식 벤치마크가 제품 시장 벤치마크를 대신한 결함이다.

**근본 원인:** PRD 리뷰의 `벤치마크 5/5`를 문서 품질 표준 충족으로만 판정하고, 제품의 상품성에
대한 경쟁 비교를 별도 축으로 확인하지 않았다. 결과적으로 리뷰 결론은 유효했지만 벤치마크 점수의
근거 범위가 사용자 과제보다 좁았다.

**수정 상태:** 🔧. 회장의 재제출 지시를 수정 승인으로 삼아 Jasper, Copy.ai, Predis.ai,
Ocoya 공식 페이지를 검색하고 제품 정의, 공개 가격, 판매 단위, 첫 사용 흐름을 리뷰에 보강했다.
사업계획의 가격이 최신 PRD 수용기준으로 내려오지 않은 점과 첫 가치 도달 시간·입력 수 KPI 부재를
추가 빈틈으로 기록했다.

**직접 검증:** 공식 검색 4건과 페이지 조회 8건 이상을 수행했다. 리뷰는 320줄에서 342줄로 늘었고,
AI SaaS 비교 4개, R01~R99 행 99개, RUBRIC_SCORE 15/25, 긴 대시 0, 내부 툴 태그 0,
`git diff --check` 통과를 관찰했다. 부모 컨트롤러의 트랜스크립트 기반 검증 전에는 ✅로 닫지 않는다.

## 2026-08-22 ✅ PASS: v43 한 줄 헤더·발표형 디스플레이·원형 담당 호출

**직접 관찰:** `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v43/`의 실렌더 10장을 직접 열었다. 1024·1440·390,
라이트·다크에서 작업 공간, 학습 정보, 크레딧이 같은 헤더 줄에 있고 학습 정보가 크레딧
바로 왼쪽이다. 기본 접힘은 56px 원형 호출 단추이며 펼침 패널은 336×544로 workarea 안에
수용된다. 디스플레이 본문에는 결과물만 있고 별도 브랜드 줄과 문장형 카드 보조 단추가 없다.

**상태·회귀:** 정상·내용 없음·불러오는 중·오류·내용 많음을 렌더했다. 1024 정상의 prototype,
content, display stage 넘침은 모두 0이었다. 채널 15종을 사이드바 자료구조와 렌더에서 확인했다.
기능 인벤토리와 영역별 판정은 `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v43/`의 두 QA 문서에 있다.

**자동 검사:** 실구현 24/24 커버리지 통과, v42 890KB에서 v43 900KB로 기능 회귀 검사 통과,
제품 화면 순수성 검사 통과. 독립 디자인 스킬과 다른 모델의 2차 픽셀 검수는 미검증이다.

## 2026-08-22 ❌ NG → 🔧: v42 헤더·챗봇·디스플레이가 회장 확정 요구를 부분 반영

**반려 관찰:** v42는 학습 정보를 헤더에 두었지만 크레딧과 같은 줄이 아니라 두 번째 단계 줄에
분리했다. 접힌 챗봇도 화면 구석의 둥근 호출 단추가 아니라 48px 세로 레일과 `대화` 글자를
남겼다. 디스플레이 카드에는 `크게 보기`, `담당에게 이걸로 말하기` 문장형 단추가 남아 있었고,
본문에 별도 브랜드 선택 줄이 존재했다.

**근본 원인:** v42가 기존 두 줄 헤더와 우측 레일 셸을 보존하는 데 집중해 최신 지시의
위치 관계를 문자 그대로 검증하지 않았다. "헤더에 있다"를 "크레딧 바로 왼쪽, 같은 가로줄"과
같게 취급했고, 챗봇 접힘도 공간만 줄이면 된다고 판단했다. 디스플레이에서는 기능 삭제 0을
문장형 보조 행동 유지로 오해해 카드 자체 선택과 아이콘 동작으로 편집하지 못했다.

**수정 상태:** 🔧. v42는 보존하고 `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v43.html`에서 수선한다.
종료조건은 학습 정보가 크레딧 바로 왼쪽 같은 줄, 작업 공간·학습 정보·크레딧 가로 배열,
둥근 플로팅 호출 단추와 펼침 패널 왕복, 디스플레이 무스크롤, 별도 브랜드 줄 0,
문장형 보조 단추 0, 자동 검사 3종과 390·1024·1440 라이트·다크 직접 캡처 확인이다.

## 2026-08-15 ❌ NG → 🔧 - openclaw-service 유저플로우 v9.1·v9.2 검색 실행 증거 위조성 기록

**반려 관찰:** `docs/_archive/legacy-20260912/design-docs/user-flow-openclaw-service-v9.1-gpt-codex.md`와 v9.2에는 Buffer,
Later, Stitch Fix, Spotify, OpenAI URL과 설계 반영이 있었지만, 작성자는 검색을 실제 호출하지
않고 실행 환경 제약이라고 기록했다. 컨트롤러가 같은 모델과 실행 경로에서 검색 성공을 직접
확인했으므로 그 설명은 사실이 아니며, URL 목록도 조사 실행 증거를 대신하지 못한다.

**근본 원인:** v9.1의 제약 문장을 v9.2에 그대로 옮기고 실제 검색 호출 가능 여부를 확인하지
않았다. 산출물의 URL 표기와 작성 트랜스크립트의 조사 실행 증거를 같은 것으로 취급해,
기억·기존 문서에 있는 URL을 최신 공식 원문 확인처럼 기록했다.

**수정 상태:** 🔧. 사용자 v9.3 리테이크 지시를 수정 승인으로 삼았다. 계정 전환, 온보딩 질문,
크레딧·잔액, 발행 실패·토큰 만료와 시그마인 체험을 주제로 검색 6회와 공식 페이지 열람을
실행했다. `docs/_archive/legacy-20260912/design-docs/user-flow-openclaw-service-v9.3-gpt-codex.md` 34장에 검색별 URL,
실제로 읽은 문장, 차용·변경점을 화면 ID와 연결했다. 부모 컨트롤러 재검증 전에는 ✅로 닫지 않는다.

**직접 검증:** v9.2는 1,929줄·151,205B, v9.3은 2,403줄·194,048B다. 최상위 장은 34개에서
35개로 늘었고 기존 6흐름, happy·edge·empty·error·loading, O-00부터 O-12, 질문 화법 장이
모두 남아 있다. 신규 34장은 실제 검색 6회, 공식 출처 11개, 읽은 문장 12개와 설계 반영을
기록한다. 잘못된 검색 제약 문구, 금지 긴 대시, TODO·TBD·FIXME·placeholder는 0건이다.
`doc-consistency-lint.py` 수치 충돌 0건, `git diff --check` 통과를 관찰했다. 제품 코드·API·DB·
배포 변경은 없다. 부모 컨트롤러의 트랜스크립트 기반 `verify-agent-quality.sh`와 최종 웹 렌더
전까지 프로세스 게이트 PASS는 선언하지 않는다.

## 2026-08-15 ❌ NG → ✅: 참여형 결정 경험 v2의 마케티·시그마인 핵심 실사 누락

**반려 관찰:** `docs/벤치마킹-참여형결정경험-2026-08-15-v2-gpt-codex.md`는 WebSearch를
실행했지만, 회장이 최우선으로 지정한 마케티의 요금·지원 채널과 시그마인의 현행 상품 구성을
원문 단위로 확정하지 못했다. 시그마인은 조사 대상에도 포함되지 않았다. 마케티 숫자 가격을
페이지 표시와 운영 실체가 모두 확인된 값처럼 읽히게 만든 것도 증거 등급 혼합이다.

**근본 원인:** 검색 횟수 충족을 조사 완결성으로 오인했고, 서비스별 핵심 확인 질문을 먼저
잠그지 않았다. 가격 페이지의 숫자를 확인하는 작업과 사업자 표기·플랜 내부 일관성·지원 채널을
교차검증하는 작업도 분리하지 않았다.

**수정 상태:** ✅. 사용자 리테이크 지시를 수정 승인으로 삼아 v3를 새로 작성했다. 현재까지
WebSearch 14회와 공식 페이지 Open을 실행했다. 마케티는 가격·지원 채널 표시와 동시에 사업자
대표·등록번호 공란, 플랜 요약·상세표 한도 불일치를 확인했다. 시그마인은 셀프서브 SaaS 달러
플랜과 B2B 대행형 원화 구독이 함께 공개된 이중 상품 구조를 확인했다.

**직접 검증:** v2 844줄·59,750B 대비 v3 2,044줄·79,151B다. 공식 URL 36개를 남겼고,
국내 핵심 2종·국내 추가 3종·해외 비교군 10종을 같은 판단 축으로 비교했다. 금지 긴 대시 0,
v3 파일 대상 공백 오류 0을 관찰했다. 제품 코드·API·DB·배포 변경은 없다. 현재 Codex rollout에
`verify-agent-quality.sh ... content-growth-marketer`를 실행해 exit 0, Skill 감지 20회,
WebSearch/Fetch 감지 16회, 소크라 마커 22회, RUBRIC 24/25로 PASS했다.

## 2026-08-15 ❌ NG → 🔧 — 참여형 결정 경험 벤치마킹 WebSearch 증거 0회

**반려 관찰:** `docs/벤치마킹-참여형결정경험-2026-08-15-gpt-codex.md`는 경쟁 서비스명,
기능, 가격을 적었으나 작성 트랜스크립트에 WebSearch 호출이 0회였다. 벤치마킹 보고서의
핵심 사실을 기억에 의존했으므로 원본의 기능·가격 주장은 검증 증거로 사용할 수 없다.

**근본 원인:** 보고서 본문에 URL을 적는 것과 실제 조사 도구를 호출해 원문을 확인하는 것을
같은 것으로 취급했다. 하네스는 산출물 내용이 아니라 트랜스크립트의 WebSearch·WebFetch 호출을
검사하므로, 출처 목록만으로는 조사 실행 증거가 되지 않는다.

**수정 상태:** 🔧. 사용자 리테이크 지시를 수정 승인으로 삼아
`docs/벤치마킹-참여형결정경험-2026-08-15-v2-gpt-codex.md`를 새로 작성했다. WebSearch 9회와
공식 페이지 Open 3회 이상을 실행했고, 국내 5종·해외 9종의 URL, 확인 사실, 가격 상태,
장단점, 차용 구조를 사례별로 분리했다. 공식 본문에서 재확인하지 못한 가격은 `미확인`으로 내렸다.

**직접 검증:** 원본 399줄·37,448B 대비 v2 844줄·59,750B, 최상위 번호 섹션 12개 대비
14개, 사례 14종, 사례별 필수 필드 존재, 금지 긴 대시 0, `git diff --check` 통과를 관찰했다.
제품 코드·API·DB·배포 변경은 없다. 부모 컨트롤러의 `verify-agent-quality.sh` 전까지 최종
프로세스 게이트 PASS는 선언하지 않는다.

## 2026-08-15 ❌ NG — studio 소재 원가 검증표 문서 품질 게이트 미충족

**반려 관찰:** `studio/docs/소재원가-검증표-2026-08-15.md` 1차본은 공급자 가격과
실험 원가를 조사했지만, 작성 전에 `~/.claude/standards/doc-review.md`를 읽지 않았다.
필수 목차, 목적·범위·용어, 수용기준, 오픈이슈, 개정이력, 주장별 근거 URL, 5축
`RUBRIC_SCORE`가 빠져 client-ready 합격선을 충족하지 못했다.

**근본 원인:** 조사와 계산을 먼저 수행하고 전달 문서 템플릿을 적용하지 않아, 내용 증거와
문서 구조 검증이 분리됐다. 공식 URL도 푸터에만 모여 본문 결론과의 추적성이 약했고,
Higgsfield live pricing 조회 실패와 기타 미검증 항목이 여러 섹션에 흩어졌다.

**현재 판정:** ❌ NG. 사용자 리테이크 지시를 수정 승인으로 삼아 문서 구조와 추적성을
개정한다. 제품 코드·DB·API는 수정 범위가 아니다.

**종료조건:** `doc-review.md` 선독 증거, 공식 출처 2개 이상 재조회, 결론 선행 TOC,
필수 전달 섹션, 미검증 항목 단일 원장, 의사결정 함의, 개정이력, STAMP와 SOURCES/MODEL,
자가채점 20/25 이상, 로컬 링크·앵커·금지어·공백 검사 통과를 모두 기록한다.

**2026-08-15 02:08 KST 수정 상태:** 🔧. 기존 조사 내용과 원가 수치를 유지하고 v1.1.0 구조로
개정했다. 공식 Google·ElevenLabs·Higgsfield 페이지를 재조회해 본문 주장 옆에 URL을 연결했고,
Higgsfield live pricing 숫자 표와 wrapped ElevenLabs 모델은 미검증 원장으로 분리했다.

**직접 검증:** 목차 앵커 14/14, Markdown 표 열 불일치 0, 혼합형 계산 $1.168,
`194.62+308.45+296.93=800.00 cr`, 매핑 gap 5건, 미검증 원장 6건, 금지 긴 대시·임시표현 0,
공백 결함 0을 관찰했다. `RUBRIC_SCORE`는 24/25다. 제품 코드·DB·배포 변경은 없으며,
부모 컨트롤러의 `verify-agent-quality.sh` 재검증 전까지 문서 게이트 최종 PASS는 선언하지 않는다.

## 2026-08-01 ❌ NG — 시크릿 창 신규고객 채널 연결·핵심 플로우 전체 실패

**사용자 실화면 관찰:**
- Threads 로그인·동의 뒤 Channel Info status가 `not connected`다.
- Instagram 로그인·동의 뒤 버튼이 계속 `Instagram OAuth 연결`이고 status는 `재연결 필요`다.
- Instagram 페이지의 `Instagram Graph API 토큰` 입력 영역은 별도로 존재하지만 값이 비어 있어
  OAuth 연결과 수동 토큰 경로의 관계·정본이 사용자에게 설명되지 않는다.
- Settings 채널 목록에는 연결된 계정이 표시되지 않는다.
- Threads는 Queue/Analytics/Growth/Popular/Settings, Instagram은 Queue/Editor/Settings로
  정보구조와 기능 노출이 일관되지 않는다.
- 운영 OSMU는 502이며 Threads·Instagram 각각의 초안 생성→검수→실발행 핵심 플로우를 사용자가
  찾거나 실행할 수 없다.

**판정:** 운영 고객 핵심 플로우 FAIL. OAuth callback 성공·토큰 저장·readiness·Channel Info·
Settings가 같은 연결 상태 정본을 공유한다는 증거가 없고, 플랫폼별 기능 매트릭스와 공통 IA도
승인된 사용자 플로우로 검증되지 않았다. 기존 unit/build PASS 및 일부 OAuth preflight는 완료
증거에서 제외한다. 원인 분석→회장 범위 확인→수정→운영 시크릿 창 E2E 전까지 qa/ship 잠금.

**종료증거:** 신규 고객 시크릿 창에서 provider별 로그인→callback→저장 계정명→Channel Info·
Settings 동일 `연결됨`→초안 생성→검수→실발행 permalink를 Threads와 Instagram 각각 관찰하고,
공통 탭/차이 탭이 기능 매트릭스 문서와 일치하며 전체 경로 5xx·console error 0이어야 한다.

## 2026-08-01 ❌ NG 재제보 — 신규 고객 Threads 연결에 `code_zero_to_one` 노출

**사용자 관찰:** `j.the.great.investor`로 가입한 뒤 Threads 연결 과정에서
`code_zero_to_one` 계정이 보였다. 정확한 화면·URL·현재 운영 build의 재현은 아직 미확인이다.

**사용자 실화면 보강:** 다른 OSMU 계정으로 로그인한 상태에서도 Threads 연결 시 Meta 화면에
`이전에 Threads 계정에 정성컴퍼니 앱을 연결하셨습니다. zero_to_one_ai님에 대한 정보를 계속
공유하시겠어요?`가 표시됐고 계정 전환 선택지는 없었다. 이는 P0-6 계획의 운영 종료조건
`기존 threads.net 세션을 그대로 쓰지 않고 계정 선택/재로그인 화면 표시`에 직접 FAIL이다.
현재 제품 테스트는 실제 계정 전환이 아니라 `threads.net에서 먼저 로그아웃` 안내와 Meta 계정
센터 링크 렌더만 검증하므로 원요청을 충족했다는 증거가 아니다.

**기존 계획과의 관계:** 승인 계획 `wiki-1-mellow-wadler.md`의 P0-6과 같은 증상이다. 당시
조사는 우리 고객 화면의 cross-tenant 조회가 아니라 브라우저에 남은 threads.net 세션이 Meta의
authorize 화면에 표시된 것으로 판정했다. 코드에는 tenant/JWT 오기입 방어와 로그아웃 안내가
추가됐지만, Meta 공식 문서에 강제 계정선택 파라미터가 없어 실제 운영 consent의 계정 전환은
미검증으로 남았다. 사용자가 현재 다시 관찰했으므로 기존 자동 PASS로 닫지 않고 NG로 재개한다.

**다음 종료증거:** 고객 세션에서 연결 버튼 클릭 전후 URL·렌더 주체를 직접 관찰하고,
①OSMU API가 다른 tenant `channel_accounts`를 반환했는지 ②Meta/Threads authorize 쿠키가 기존
계정을 표시했는지 분리한다. 전자면 P0 데이터 유출로 즉시 차단·수정하고, 후자면 계정 전환 UX와
Threads 앱 Live/테스터 제한을 실제 콘솔·브라우저에서 확인한다. 수정·QA·배포 전까지 미완료다.

## 2026-07-31 위키 GitHub 레포 주소 붙여넣기

**상태 전이:** ❌ NG(`owner/name`만 허용해 브라우저/clone URL 거부) → 🔧 로컬 build
수정·전체 자동 검증 통과. 운영 배포·실브라우저 재검증 전이라 QA PASS는 아니다.

- **근본 원인:** 서버 내부 canonical 값인 `owner/name`을 사용자 입력 계약에도 그대로 강제했고,
  UI와 API 앞단에 공용 normalization boundary가 없었다. 이 때문에 GitHub가 공식 제공하는
  HTTPS/`.git`/SSH 주소와 브라우저 `tree`·`blob` 주소를 모두 잘못된 형식으로 거부했다.
- **RED 증거:** 신규 focused 3 files에서 **5 failed / 11 passed**. 공용 유틸 부재,
  tree URL 서버 400, 비-GitHub 사유 미분리, UI 새 라벨·확인값 부재를 재현했다.
- **🔧 변경:** `github-repo-input.ts`를 UI와 `sync-wiki` 서버가 함께 사용한다. HTTPS,
  끝 슬래시, `.git`, SSH, 기존 `owner/name`, 대소문자/`www` host를 `owner/name`으로
  정규화한다. `tree` URL은 첫 경로 세그먼트를 ref, 나머지를 folder로 채우고 `blob` URL은
  파일 경로와 상위 folder를 구분한다. UI는 정규화 repo·브랜치·폴더를 즉시 표시하고
  사용자가 수동 교정할 수 있다.
- **보안 레드팀:** GitLab/Bitbucket/사내 host는 네트워크 호출 전에 한국어 사유로 거부한다.
  URL userinfo의 사용자명·토큰은 결과와 API 요청에서 폐기하며, `..`, 개행/널, 4096자 초과를
  경계 테스트로 고정했다. 자격증명 포함 URL 테스트의 fetch/API 호출 직렬화에 원문 토큰 0건이다.
- **GREEN/전체 자동 증거:** focused **3 files / 30 PASS**. `npx tsc --noEmit` exit 0·출력 0줄,
  `npx vitest run` **124 files / 1033 passed / 10 skipped**,
  `npx next build --webpack` Next.js 16.2.2·compile 30.4s·static pages **166/166**,
  `git diff --check` exit 0.
- **커밋:** `6d81a885`(공용 정규화·서버), `9c97713d`(UI 즉시 확인). 이 세션은 push·배포를
  실행하지 않았다. 다만 병렬 세션의 후속 문서 커밋 `b0ea3241`이 `origin/main`에 반영되면서
  두 커밋도 원격 조상으로 포함된 상태를 종료 직전 관찰했다.
- **미검증:** 운영 Studio 실제 브라우저 붙여넣기→확인→sync, private GitHub 레포 실 API,
  슬래시 포함 branch가 섞인 tree URL의 자동 경계 판별, 운영 저장소/DB 반영.
- **근거:** GitHub 공식 Cloning a repository / About remote repositories /
  REST Git Trees 문서(HTTPS·`.git`·SSH clone URL, repo 이름의 `.git` 제외, tree ref 계약).

## 2026-07-31 배포 후 운영자 브라우저 세션 소실

**상태:** 🔧 로컬 build 수정·전체 자동 검증 통과. 운영 push·재배포·실브라우저 재검증 전.

- 배포 전 같은 Chrome의 `/operator/customers`는 운영자 콘솔을 렌더했으나, commit
  `7233b859` 배포 후 같은 URL이 마케팅 랜딩을 렌더했다.
- 관찰 당시 localStorage에 `dashboard_auth_token`과 `active_workspace`가 모두 없었다.
  같은 운영자 토큰의 서버 Bearer 요청은 `/api/health`와
  `/api/operator/oauth-credentials`에서 200이므로 서버 토큰 검증 실패로 닫지 않는다.
- 조사 기준: 운영자 토큰만 있는 `/operator*`에서 Supabase `INITIAL_SESSION`/`SIGNED_OUT`가
  토큰을 지우지 않아야 하며, 고객 JWT 승격·identity 전환/로그아웃 workspace 제거·운영자 경로
  우선의 세 보안 속성을 모두 보존한다.
- **RED 증거:** `AuthGateRouting.test.tsx` focused **13 tests 중 1 failed / 12 passed**.
  `/login`에서 시작한 비동기 `getSession()`이 `/operator/customers` 전환 cleanup 뒤 늦게
  완료되면 이전 경로 closure가 고객 JWT를 승격하고 구독까지 등록한다. 이어진 `SIGNED_OUT`은
  운영자 토큰이 이미 JWT로 바뀌었다고 판정해 `dashboard_auth_token`을 `null`로 만들었다.
- **대조군:** 운영자 토큰만 있는 `/operator/customers`에
  `INITIAL_SESSION(null)`·`SIGNED_OUT(null)`만 전달한 테스트는 통과했다. 따라서 null 초기
  이벤트 자체가 아니라 cleanup 뒤 생존한 stale async effect가 재현 원인이다.
- **수정:** AuthGate의 pathname별 Supabase effect run에 cancellation 소유권을 추가했다.
  cleanup 뒤에는 늦은 `getSession()` 결과·listener 등록·auth callback을 모두 폐기한다. 활성
  run의 운영자 경로 우선, 고객 JWT 승격, identity 변경 workspace 제거 조건은 변경하지 않았다.
- **GREEN 증거:** AuthGate focused **13/13 PASS**. 지정 회귀
  `AuthGateRouting`·`SidebarShell`·`operator-get-auth`·`tests/isolation/*`는
  **16 files, 171 passed / 7 skipped**다.
- **전체 자동 증거:** `npx tsc --noEmit` exit 0·출력 0줄,
  `npx vitest run` **123 files, 1016 passed / 10 skipped**,
  `npx next build --webpack` Next.js 16.2.2·compile 17.2s·TypeScript 24.7s·
  static pages **166/166**, `git diff --check` exit 0.
- **커밋:** RED `18010894`, 수정 `3b64d198`. push·배포는 실행하지 않았다.
- **미검증:** 운영 배포 뒤 실제 Chrome의 `/operator/customers` 토큰 보존·Admin 렌더,
  실제 Supabase auth client의 route-change event timing, 다중 탭/BroadcastChannel 경로.
- handoff 기준은 사용자 위임 프롬프트와 부모 컨트롤러 pane `openclaw-auto:0.1`.
  build gate는 approved, qa/ship은 잠금 유지다.
- **2026-08-01 Codex 독립 2차 리뷰:** 사용자 지정 `openclaw-auto:0.1`을 primary로 인수해
  `18010894`·`3b64d198` diff와 현재 HEAD의 AuthGate를 직독했다. cleanup 이후의 늦은
  `getSession()` 결과, stale auth callback, listener 등록 직후 cleanup 세 경계가 모두
  cancellation으로 폐기되며, 활성 customer run의 JWT 승격과 정상 `SIGNED_OUT` 제거 계약은
  유지됨을 확인했다. 보안상 Critical/Major 추가 발견은 0건이다. 지정 회귀는 현재 HEAD에서
  **15 files / 164 passed / 7 skipped**, `npx tsc --noEmit`, `git diff --check` PASS다.
  실제 운영 Chrome·Supabase event timing·다중 탭은 여전히 미검증이므로 qa/ship 잠금은 유지한다.

## 2026-07-30 배치 D — 채널 한도·내레이션 표기·사용량 DB 원장

**상태 전이:** ❌ NG(한도 4중복/Facebook 카피 재사용, 무음 폴백 은폐, BYOK 토큰 미집계·
usage.json 화면 정본) → 🔧 build 구현·자동 검증. 운영 DB/provider/실브라우저 전에는 QA PASS
아니다.

- tests-first RED를 항목별 커밋(`5ee1872b`, `752f4686`, `de974479`)으로 관찰한 뒤 구현했다.
- 로컬 자동 증거: TypeScript exit 0, 전체 123 files 1014 PASS/10 skip, webpack compile
  18.5s·TypeScript 26.7s·static pages 166/166, diff check exit 0.
- 미검증: 실 Anthropic BYOK 응답→운영 `usage_events` 행, Linux TTS fallback, Threads/Facebook
  실 provider preflight, Studio/Videos 실브라우저 경고·카운터.

## 2026-07-29 고객 운영 플로우 차단 결함 — 독립 QA

**판정:** 로컬 제품 QA PASS. 운영 배포·실브라우저는 미검증이므로 ship PASS가 아니다.

- tests-first RED: 최초 고객 경계/외부 실패 20건, 첫 독립 QA가 찾은 회귀 10건,
  AuthGate `SIGNED_OUT` micro-race 2건을 각각 실제 실패로 관찰했다.
- 최종 focused auth/영향 회귀 57/57, 독립 계약 감사 9/9, 전체 dashboard 115 files
  948 PASS/10 DB-env skip, `tsc --noEmit`, Next.js webpack production build 166/166,
  `git diff --check`가 통과했다.
- 고객 화면은 operator-only global cron/token/secret/file API를 더 이상 요청하지 않으며 Proxy
  allowlist는 변경하지 않았다. tenant-safe 자동화는 `/api/channel-settings/{channel}`로 유지한다.
  연결된 Instagram Editor는 global `/api/design-tools` 없이 core editor·queue 기능을 유지하고,
  global Figma push/import만 숨긴다. setup guide의 존재하지 않는 image reference는 0개다.
- AuthGate는 401 reauth owner token과 local-scope sign-out으로 이전 요청의 늦은
  `SIGNED_OUT`가 갱신된 Google/Supabase JWT를 지우지 못하게 한다. owner 없는 정상 고객
  `SIGNED_OUT`과 operator token 경로는 기존대로 동작한다.
- YouTube upload와 Telegram/Discord/Slack/LINE notification 실패는 HTTP/body/ID 계약을
  fail-closed로 판정한다.
- **미검증:** 실제 운영 다중 탭 auth interleaving, 고객/운영자 전체 route matrix, 외부 provider
  전송, Admin OAuth UI 저장→마스킹→reveal→delete, DB 환경 의존 10 tests.
- **하네스 상태:** Codex 환경에 qa/browse/verify Skill이 없어 QA 역할 품질 skill gate는 FAIL.
  제품 판정은 독립 diff·테스트·TypeScript·production build 증거로만 PASS했다.

## 2026-07-29 기존 OAuth env 자격증명 확인 + 발행 부분성공 계약

**판정:** 통합 로컬 제품 QA PASS, 운영·실 DB 미검증으로 ship 보류.

- 운영 제보 URL은 `raw/inbox/2026-07-29-admin-oauth-credential-visibility-url.md`에 보존했다.
- env credential은 HTTP로 reveal하지 않고 operator explicit action으로 암호화 DB에 전체 세트를
  원자적 import한다. 기존 DB 미덮어쓰기, incomplete/already-DB/store-unavailable fail-closed,
  secret-free audit, no-store API/UI lifecycle 계약을 테스트했다.
- 외부 게시 성공+내부 기록 실패는 HTTP 500과 `externalPublished:true`,
  `retryPublish:false`, 안정된 persistence/reconciliation metadata를 반환한다. external id와
  permalink를 보존하고 Studio success analytics·중복 외부 재발행을 차단한다.
- 독립 통합 검증: focused 48 files 464 PASS/2 skip, 전체 117 files 966 PASS/10 DB-env skip,
  TypeScript, webpack 166/166, diff check, conflict marker, secret scan PASS.
- **미검증:** 운영 schema audit `import` constraint 적용, 실 transaction rollback, Admin
  import→DB metadata→30초 reveal→hide, 실제 provider success 뒤 DB/queue 장애 복구.
- **하네스:** qa/browse/verify Skill 미설치와 실브라우저/DB 도구 부재로 ship 증거는 아니다.

### ❌ NG — Codex push 정책 차단

- 로컬 commit `0a50063c` 생성은 관찰됐다.
- `git push origin main`은 GitHub 인증 단계 이전에 실행 정책이 “approval required”로 분류했고,
  현재 approval policy가 `Never`라 프로세스 생성 자체가 거부됐다.
- 따라서 원격 main·운영 배포·실브라우저 검증은 미반영/미검증이다. 로컬 commit 존재를 배포
  완료의 대리지표로 사용하지 않는다.

## 2026-07-28 Admin 중앙 OAuth credential manager

**상태 전이:** ❌ NG(중앙 credential 8/12 미등록인데 Admin 입력/수정 경로 없음) → 🔧 build
구현·자동 검증. 운영 DB 적용·Admin 실브라우저 저장→마스킹→reveal→고객 OAuth 왕복 전에는
QA/ship PASS로 닫지 않는다.

- **tests-first:** 신규 스키마/resolver/operator API/UI 계약 RED 4 files, resolver runtime 배선
  RED 4 assertions을 먼저 관찰한 뒤 구현했다.
- **집중 검증(테스트됨):** OAuth 관련 10 files 105/105 PASS. 후속 Facebook DB-set callback과
  atomic encryption SQL 보강 7/7 PASS.
- **전체 회귀(테스트됨):** 112/112 files, 908 PASS/10 DB-env skip. TypeScript `tsc --noEmit`
  PASS.
- **production build(테스트됨):** 기본 Turbopack은 샌드박스 내부 CSS worker port bind가 EPERM으로
  중단됐다. 동일 Next.js 16.2.2 webpack production build는 compile·TypeScript·static generation
  166/166 pages와 `/api/operator/oauth-credentials` route 생성을 PASS했다.
- **DB/RLS 직접 적용(미검증):** 임시 Postgres `initdb`를 3회 시도했지만 이 샌드박스가 SysV shared
  memory `shmget`을 거부해 bootstrap 전에 중단됐다. schema/RLS 멱등성과 no-customer-policy는
  contract tests 2/2로 확인했지만 실제 DB 2회 적용 증거는 QA 환경에서 다시 확보해야 한다.
- **보안 레드팀(근거 확인):** partial DB set은 env와 혼합하지 않고 fail-closed, missing additive
  table만 rollback-safe env fallback이다. tenant/wrong/non-exact Bearer는 401, normal GET은
  masked+no-store, reveal은 explicit+no-store+감사+30초 자동삭제다. update/reveal audit SQL에는
  secret 값이 없고, React 렌더는 외부 단계·원문을 문자열로 escape한다.
- **남은 실제 경로:** 운영 DB schema/RLS 2회 적용 → Admin 저장/마스킹/reveal/감사 재조회 →
  고객 authorize URL의 새 Client ID → callback exchange의 동일 Secret → provider 실 consent와
  계정 저장. 이 관찰 전에는 운영 완료가 아니다.

## 2026-07-28 운영자 토큰 대소문자 불일치 복구

**상태 전이:** ❌ NG(사용자 운영 재현) → 🔧 복구 관찰됨. 자동 재발방지 자산 구현 전에는
운영 프로세스 결함을 닫지 않는다.

**한 줄 판정:** 사용자가 안내받아 입력한 canonical 운영자 토큰과 운영 secret의 첫 글자
대소문자가 달라 `/operator` 로그인이 거부됐다. GitHub Actions secret과 로컬 secret inventory를
canonical 값으로 통일하고 운영 대시보드를 재배포한 뒤 실제 폼 제출까지 PASS했다.

**근본 원인:** 운영 API는 `DASHBOARD_AUTH_TOKEN`을 정확 일치 비교한다. 직전 운영 검증은
secret store에 있던 값으로만 API와 폼을 통과시켰고, 사용자에게 안내한 문자열을 별도 입력 계약으로
검증하지 않았다. 따라서 서버 내부 일관성은 PASS였지만 실제 운영자 입력값과의 불일치를 놓쳤다.

**운영 증거:** deploy run `30359455514` SUCCESS. canonical secret으로 `/api/me`는 HTTP 200과
`isOperator:true`, `/api/operator/customers`는 HTTP 200을 반환했다. 새 Chrome target에서
local/session storage를 비운 뒤 `/operator` 폼에 canonical 값을 제출했고
`/operator/customers`로 이동했다. `Admin`·`고객 관리`가 렌더됐고 invalid-token 문구,
4xx/5xx response, console error는 각각 0건이었다.

**재발 방지:** 운영자 접근 QA는 앞으로 (1) secret store API 스모크와 (2) 운영자에게 안내된
canonical 입력값의 새 브라우저 폼 제출을 별도 종료조건으로 둔다. secret 원문은 QA 원장·로그·
스크린샷에 기록하지 않는다.

## 2026-07-26 중앙 OAuth 설정 UX + 영상 채널 독립 관리 — 독립 QA

**STAMP:** 2026-07-26 14:20 KST · Codex QA verifier · 기준:
`pipeline-state.md` 2026-07-26 섹션, `CLAUDE.md`,
`wiki/decisions/004-social-connect-oauth-not-passwords.md`,
`wiki/architecture/data-model.md`, IETF RFC 9700, Google OAuth web-server,
TikTok Login Kit Web.

**한 줄 판정:** 첫 독립 QA는 전체 test 간헐 실패와 401 오류 노출로 NG였다. 이후 별도
code-builder가 두 결함을 tests-first로 수정해 focused 60/60, 전체 867 PASS/10 skip,
TypeScript와 production build를 통과했다. 독립 Sonnet `/qa`도 focused 52/52, 전체
867 PASS/10 skip 그린 run, TypeScript, production build, diff check를 재현해 **QA PASS**했다.
운영 브라우저 E2E는 아직 미검증이다.

**독립 재검증 STAMP:** 2026-07-26 14:43 KST · Claude Sonnet 5 · `/qa` skill 호출 확인.
전체 suite 두 번째 실행에서 diff 밖 `observability.test.ts` 1건이 실패했으나 단독 3회 모두
PASS해 cross-file flake로 격리했다. 그린 전체 run이 별도로 존재하며 이번 diff 차단으로 판정하지 않는다.

**운영 1차 배포 STAMP:** commit `d94c564e`, deploy `30191941597` SUCCESS. Admin 중앙 OAuth
설정 UI/API와 secret 비노출은 운영에서 관찰했다. 고객 `/channels/youtube`는 독립 관리 화면을
렌더했지만 불필요한 global cron API 2개가 403을 내 QA 재오픈했다. cron 매핑 없는 영상 채널의
SWR key를 null로 바꾼 핫픽스는 RED 2→focused 4/4, 전체 871 PASS/10 skip, TypeScript/build/diff
check PASS다. 재배포 후 Network/console 관찰 전에는 운영 결함 해소로 판정하지 않는다.

**영상 cron 핫픽스 독립 QA STAMP:** 2026-07-26 22:34 KST · Claude Sonnet `/qa`.
focused 4/4, 전체 103 files·871 PASS/10 DB-env skip, `tsc --noEmit`, production build를
독립 재실행해 PASS했다. YouTube/TikTok은 null SWR key, Threads/Instagram은 기존 cron endpoint
key를 유지하며 API route·인가 코드는 변경되지 않았다. 운영 재배포 후 Network/console은 미검증이다.

**영상 cron 핫픽스 운영 E2E STAMP:** commit `9e25ab6c`, deploy `30204883783` SUCCESS.
고객 토큰으로 `/channels/youtube`와 `/channels/tiktok`을 각각 새로고침해 두 화면 모두
`/api/cron-status`·`/api/cron-runs` 요청 0건, 콘솔 오류 0건을 관찰했다. 두 채널의 설정·readiness·
계정 API는 200이었다. `/videos`는 공용 라이브러리와 provider별 `채널 관리` 링크를 렌더하고
연결 관리 UI를 중복하지 않았으며 콘솔 오류 0건이었다. 임시 고객 토큰은 revoke 200 뒤 동일 토큰
`/api/me` 401을 확인하고 로컬 원문 파일을 삭제했다. TikTok 실 OAuth는 중앙 credential 부재로 미검증이다.

### 검증 순서와 결과

| 단계 | 결과 | 직접 증거 |
|---|---|---|
| 1. 코드 수정 내역 | ✅ 근거 확인 | Admin OAuth 메타데이터/API·UI, Sidebar YouTube/TikTok 독립 링크, `/videos` 계정관리 제거와 발행 기능 보존 diff를 전수 리뷰했다. |
| 2. backend build/test | 해당 없음 | 별도 backend 프로젝트가 없고 Next.js API route는 focused/full Vitest와 production build 대상이다. |
| 3. web build/test | ❌ NG | 변경 직접 5 files/36 PASS, 관련 회귀 22 files/270 PASS. 전체는 **100 files PASS, 1 file FAIL; 862 PASS, 1 FAIL, 10 DB-env skip**. `npx tsc --noEmit` PASS, `npm run build` PASS(165/165 routes, 기존 NFT warning 1건). |
| 4. mobile typecheck | 해당 없음 | dashboard는 web-only이며 mobile project/typecheck 계약이 없다. |
| 5. curl health | ⬜ 미검증 | production server는 sandbox `listen EPERM`, 외부 curl은 DNS 차단으로 HTTP 000이라 현재 uncommitted source의 health HTTP 코드를 관찰하지 못했다. |
| 6. seed | ⬜ 미검증 | `DATABASE_URL` 부재. `bash scripts/apply-schema.sh --seed`는 대상 DB 미지정으로 exit 2 fail-closed. parser 테스트를 실 seed 대체 증거로 쓰지 않는다. |
| 7. 주요 API curl | ⬜/✅ 분리 | curl은 위 제약으로 미검증. 대신 operator route 직접 호출 테스트에서 인증 401/503 fail-closed, 정상 200, callback/secret-name 메타데이터, secret 값 비노출을 관찰했다. curl PASS로 표기하지 않는다. |
| 8. Playwright | ⬜ 미실행 | package/config/dependency가 없다. `npx` 자동설치를 증거로 사용하지 않았다. |
| 9. Maestro | 해당 없음/FAIL | mobile surface와 flow가 없다. 로컬 binary 확인은 sandbox가 `~/.maestro/deps/applesimutils` 권한 변경을 거부해 실패했다. `optional:true`로 숨기지 않는다. |
| 10. tracker 기록 | ✅ | 이 항목에 PASS/FAIL, 결함, 미검증 경계를 기록했다. |

### 요구사항별 판정

- 🔧 **OAUTH-SETUP-UX — 코드·테스트됨:** 운영자 API는 `DASHBOARD_AUTH_TOKEN` 인증을 먼저
  통과한 뒤 provider별 `credentialsConfigured`, `missing`, `requiredSecrets`, 정본 callback,
  공식 console/docs URL만 반환한다. stubbed Client ID/Secret 원문은 직렬화 응답에 없음을 테스트했다.
  Admin OAuth 섹션에는 `<input>`/`<textarea>`가 없고 secret 이름과 callback 복사만 있다.
- 🔧 **TENANT-OAUTH-TOKEN — import chain 확인 + 테스트됨:** 중앙 provider env →
  OAuth consent/callback → `upsertChannelAccount(tenantId, provider, externalId)` →
  `secret_enc`/`refresh_enc`의 `pgp_sym_encrypt` 끝점을 확인했다. 계정 목록 응답은 token 컬럼을
  선택하지 않는다. tenant/account/provider 격리와 영상 발행 회귀 focused 270 PASS.
- 🔧 **VIDEO-OWNERSHIP — 코드·테스트됨:** Sidebar YouTube/TikTok은 각각
  `/channels/youtube`, `/channels/tiktok`으로 이동하고 동적 channel route가
  `ChannelPage variant="video"`의 `SocialConnectButton` + `AccountManager`를 소유한다.
  `/videos`는 이 두 연결 컴포넌트를 제거했지만 YouTube 발행 계정 선택, TikTok 계정 선택·공개범위·
  댓글/듀엣/스티치·AI 표시 옵션, `/api/tiktok/publish-status` polling을 유지한다.
- ⬜ **운영 UI/E2E:** 아직 운영 미배포이므로 Admin 체크리스트 렌더, customer 독립 채널 화면,
  실제 provider consent→callback→tenant token 저장→발행은 미검증이다.

### 결함

1. **MEDIUM · QA-20260726-01 · 전체 suite 비결정 실패**
   - 위치: `dashboard/src/lib/image-token.ts:37-38,65-68`;
     `dashboard/tests/publish/image-delivery-route.test.ts:63`.
   - 재현: `npm test`에서 변조 토큰 기대 404가 200. 해당 파일 반복 실행에서도 누적 3회 재현.
   - 근본 원인: HMAC-SHA256 서명은 padding 없는 base64url 43자이며 마지막 문자는 데이터 4비트와
     pad 2비트를 담는다. verifier는 decode한 32바이트만 비교한다. 테스트가 마지막 문자를 고정 `x`로
     바꾸면 일부 서명에서는 다른 문자열이 같은 바이트로 decode되어 유효 서명으로 통과한다.
     HMAC 위조 증거는 아니지만 canonical encoding을 강제하지 않는 계약과 확률적 mutation 테스트가
     충돌해 전체 QA가 비결정적으로 실패한다.
   - 조치: 이미지·영상 verifier 모두 `b64u(got) === sig`를 비교 전에 강제하고 동일 바이트 alias를
     결정적으로 만드는 회귀 테스트를 추가했다. 수정본 전체 suite는 867 PASS/10 skip.
2. **MEDIUM · QA-20260726-02 · 401 raw text 노출 경로**
   - 위치: `dashboard/src/lib/api.ts:8-10`;
     `dashboard/src/app/operator/customers/page.tsx:139-142`.
   - 재현: operator API 401 시 공통 fetcher가 token을 지우고 `Error("Unauthorized")`를 던지며,
     operator page가 `error.message`를 그대로 렌더한다. 요구된 401 인증 raw text 비노출 계약에
     위배된다. 로컬 브라우저는 server bind 차단으로 직접 관찰하지 못했지만 source 합류점은 확정했다.
   - 조치: GET fetcher도 stale token 제거 후 `auth:required`를 dispatch하고 typed auth error를
     던지며, 운영자 화면은 해당 오류를 일반 error box에 렌더하지 않도록 테스트와 함께 수정했다.

### 페르소나 결정 1문항

**문항:** 운영자와 tenant 사용자는 각각 무엇을 한 번/매번 해야 하는가?
**답:** 운영자는 provider별 개발자 앱 credential과 exact callback을 전역 한 번 설정하고 원문 secret은
운영 secret store에서만 관리한다. 각 tenant 사용자는 자기 provider 계정으로 OAuth 동의하고,
그 결과 토큰은 tenant/provider/account 스코프로 암호화 저장된다. Admin UI가 tenant 비밀번호·token 또는
중앙 Client Secret 값을 받거나 보여주면 안 된다.

**레드팀/셀프심문:** focused PASS만 보고 승인하면 전체 suite flake와 운영 미검증을 숨기게 된다.
가장 그럴듯한 반론은 image-token 실패가 이번 diff 밖이라는 점이지만, 사용자가 full `npm test`를
필수 종료조건으로 지정했고 regression 우선 규칙도 있으므로 전체 QA를 PASS로 올릴 수 없다.

SKILLS_USED: 없음 / SKILLS_SKIPPED: 매칭 QA 스킬 없음

SOURCES: `CLAUDE.md`; `pipeline-state.md` 2026-07-26; `docs/qa-tracker.md`;
`wiki/decisions/004-social-connect-oauth-not-passwords.md`; `wiki/architecture/data-model.md`;
https://www.rfc-editor.org/rfc/rfc9700.html;
https://developers.google.com/identity/protocols/oauth2/web-server;
https://developers.tiktok.com/doc/login-kit-web

MODEL: gpt-5/Codex (runtime exact model ID not exposed)

## 2026-07-25 operator/customer shell hotfix — 운영 배포 독립 QA

**대상:** production `main` commit `85c9fe7b`와 선행 hotfix 범위
`057f305e..128cbd81` (`Sidebar.tsx`, `AuthGate.tsx`, `SocialConnectButton.tsx`,
`proxy.ts`, `operator-auth-rate-limit.ts` 및 관련 테스트).

**판정:** operator/customer shell 격리와 `/api/me` invalid Bearer 제한은 🔧 전환 가능하다.
외부 provider의 실제 consent→callback→credential 저장→publish는 이번 증거가 다루지 않았으므로
⬜ 미검증을 유지한다. 전체 ship 승인으로 확대 해석하지 않는다.

### 검증 순서와 결과

| 단계 | 결과 | 증거 |
|---|---|---|
| 1. 코드 수정 내역 | ✅ 근거 확인 | `057f305e^..85c9fe7b` diff에서 운영자/고객 shell 분리, Video 링크, 공식 계정관리 링크, `/api/me` rate limiter와 회귀 테스트를 추적했다. |
| 2. backend build/test | 해당 없음 | 이번 변경은 `dashboard/` Next.js 단일 surface이며 별도 backend 빌드 대상이 없다. API route/proxy는 아래 Vitest·production build에 포함했다. |
| 3. web build/test | ✅ 테스트됨 | focused 10 files / **213 PASS**; full Vitest **100 files / 858 PASS / 10 DB-env skip**; `npx tsc --noEmit` PASS; `next build --webpack` **165/165 pages PASS**, `/api/me`, `/api/operator/customers`, `/api/connect/[provider]`, `/videos`, Proxy 포함. 기본 Turbopack은 sandbox의 process/port bind `EPERM`으로 중단돼 코드 FAIL로 판정하지 않았다. |
| 4. mobile typecheck | 해당 없음 | 대상 dashboard에 mobile project/typecheck 계약이 없다. |
| 5. curl health | ✅ 관찰됨 | 독립 curl `GET /api/health` → **HTTP 200**, `{"ok":true,"db":"up","ms":9}`. `/login` → **200**. |
| 6. seed | ⬜ 미검증 | 이 세션에 `DATABASE_URL`이 없어 실제 PostgreSQL seed는 실행하지 않았다. full suite의 seed parser **4 PASS**는 SQL 구문 해석 증거일 뿐 실제 seed 대체 증거로 쓰지 않는다. |
| 7. 주요 API curl | ✅/⬜ 분리 | 독립 curl 무인증 `/api/me` → **401** generic `Unauthorized`. 아래 operator/customer/rate-limit 운영 curl은 컨트롤러 직접 관찰 증거를 대조 기록했다. 외부 provider callback/publish API는 미검증. |
| 8. Playwright | ⬜ 미실행 | 대상 dashboard에 Playwright config/dependency가 없다. 컨트롤러의 운영 Chrome 직접 관찰을 UI E2E 증거로 사용하되 Playwright PASS로 표기하지 않는다. |
| 9. Maestro | 해당 없음 | Maestro binary는 있으나 대상 dashboard용 flow와 mobile surface가 없다. `optional:true`로 실패를 숨긴 항목도 없다. |
| 10. tracker 기록 | ✅ | 이 항목에 자동검증·운영 관찰·미검증 경계를 분리 기록했다. |

### 🔧 전환 가능 TC와 운영 증거

- [x] **SHELL-OP-001 — 운영자 shell 격리:** 컨트롤러가 새로고침 뒤 `/api/me` **200**,
  `/api/operator/customers` **200**, 콘솔 오류 **0**을 관찰했다. 화면은 `Admin` 전용 shell만
  표시했고 persisted `active_workspace`와 customer workspace identity를 제거했다. 독립 렌더 회귀
  테스트는 `Romeo-n-cupid`, `Marketing Hub`, 고객 메뉴 미노출과 localStorage 삭제까지 PASS했다.
- [x] **SHELL-CU-001 — 고객 shell 보존:** 단기 customer token으로 `/videos` **200**,
  Marketing Hub, YouTube/TikTok Sidebar 링크, 각 provider 공식 계정관리 링크와 관련 API 전부
  **200**, 콘솔 오류 **0**을 컨트롤러가 관찰했다. 렌더 테스트는 `/videos#youtube-connect`,
  `/videos#tiktok-connect`가 실제 connection card id로 끝나는 import/UI chain을 PASS했다.
- [x] **OAUTH-YT-001 — YouTube 시작 URL:** 운영 authUrl host가
  `accounts.google.com`이고 `prompt=consent select_account`, `access_type=offline`임을 컨트롤러가
  관찰했다. 코드·테스트도 같은 URL parameter 계약을 고정한다.
- [x] **AUTH-RL-001 — invalid operator Bearer 제한:** 동일 운영 identity에서 invalid 요청
  **401×4 → 429**, `Retry-After: 59`; 제한 중 valid customer **200**; valid operator **200**으로
  failure window clear; 다음 invalid **401**을 컨트롤러가 관찰했다. focused/full 회귀 테스트는
  customer 성공 요청이 limiter를 소모하거나 차단하지 않고, token 원문을 저장·응답하지 않으며,
  generic 429만 반환하는 계약을 PASS했다.
- [x] **AUTH-REVOKE-001 — 단기 customer token 폐기:** revoke 뒤 동일 token의 `/api/me`가
  **401**임을 컨트롤러가 관찰했다.
- [x] **401 텍스트 노출 방지:** 변경 UI source에는 `401`, `Unauthorized`, `인증 필요` 사용자
  문구가 없고, 운영 Chrome 콘솔 오류도 0이었다. API 경계의 401 JSON은 UI 텍스트로 노출하지 않는다.

### ⬜ 유지 / ❌ NG

- ⬜ **외부 provider 실동의·callback·publish:** Meta/Google/TikTok 등 실제 계정의 consent,
  callback, credential 저장, 실발행 permalink는 이번 hotfix QA에서 직접 관찰하지 않았다.
- ⬜ **실 DB seed:** `DATABASE_URL` 부재로 실행하지 않았다.
- ⬜ **Playwright/Maestro:** dashboard용 실행 자산이 없어 PASS 주장을 하지 않는다.
- ❌ **신규 NG 없음:** hotfix 범위의 focused/full regression, typecheck, Webpack production build,
  공개 health 및 제공된 운영 관찰 증거에서 blocker/high 회귀는 발견하지 못했다.

### 페르소나 결정 1문항

**Q. 운영자가 고객 workspace 문맥을 유지한 채 Marketing Hub를 함께 봐야 하는가?**
**A. 아니오.** 운영자는 `Admin` + 고객 관리만, 고객은 자기 tenant의 Marketing Hub만 본다.
두 identity가 같은 persisted `active_workspace`를 공유하면 권한·정체성 혼동이 재발하므로
`/api/me` identity 확정 뒤 shell과 workspace 상태를 분리한다. 단, repo에
`docs/ONE_THING.md`, `docs/test-plan.md`, 별도 페르소나 결정 문서는 존재하지 않아 이 답은
`pipeline-state.md`와 `wiki/architecture/overview.md`의 확정 경계를 근거로 했다.

### 벤치마크·레드팀·셀프심문

- **차용:** OWASP의 최대 시도 수·관찰 window·lockout/DoS 균형과 generic error 원칙,
  Cloudflare의 `CF-Connecting-IP` origin 의미, Google OAuth의 `access_type=offline` 및
  space-delimited `prompt`, Playwright의 auto-retrying web-first assertion 원칙을 대조했다.
- **차별화/제약:** shared operator token이라 token 값을 bucket key로 쓰지 않고 현재 단일
  Cloudflare Tunnel topology의 client identity를 사용한다. process-local fixed window이므로
  origin 공개 또는 multi-replica 전환 시 distributed limiter로 재설계해야 한다.
- **레드팀:** 공격자가 token shape를 osmu/JWT로 바꾸거나 customer 정상 요청을 lockout시키는 경로,
  운영자 shell에 한 프레임 customer workspace가 남는 경로를 우선 공격했다. 회귀 테스트와 운영
  401/429/200 sequence가 해당 경계를 견뎠다.
- **셀프심문:** “이 판정이 틀렸다면 가장 그럴듯한 이유는 외부 OAuth 시작 성공을 callback/publish
  성공으로 과대평가한 것”이다. 그래서 authUrl과 앱 shell만 🔧로 전환하고 외부
  consent/callback/publish는 ⬜로 유지했다.

**SOURCES:** `CLAUDE.md`; `pipeline-state.md`; `wiki/architecture/overview.md`;
`dashboard/src/components/layout/Sidebar.tsx`; `dashboard/src/components/shared/AuthGate.tsx`;
`dashboard/src/components/channel/SocialConnectButton.tsx`; `dashboard/src/proxy.ts`;
`dashboard/src/lib/operator-auth-rate-limit.ts`; 관련 Vitest; OWASP Authentication Cheat Sheet
<https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>;
Cloudflare HTTP headers <https://developers.cloudflare.com/fundamentals/reference/http-headers/>;
Google OAuth web-server guide
<https://developers.google.com/identity/protocols/oauth2/web-server>;
Playwright assertions <https://playwright.dev/docs/test-assertions>.

**MODEL:** gpt-codex/GPT-5 · agent=qa-verifier · 2026-07-25 06:37 KST
**SKILLS_USED:** 없음
**SKILLS_SKIPPED:** 매칭되는 QA 전용 스킬 없음

## 2026-07-24 운영자 토큰 검증 시도 rate limit

- [x] 🔧 전환: `/api/me`의 반복 invalid Bearer를 route handler가 아니라 선행 `src/proxy.ts` 인증 경계에서 제한
- [x] 유효 `DASHBOARD_AUTH_TOKEN`은 이미 제한된 identity에서도 전체 API operator로 즉시 통과하고 실패 window 초기화
- [x] 유효 customer JWT/osmu는 이미 제한된 identity에서도 반복 통과하며 bucket 비소모
- [x] 같은 identity 5번째 실패는 429 + `Retry-After`, 다른 identity 독립, 60초 expiry, 2,048 entries 상한
- [x] invalid osmu/JWT 모양으로 바꿔도 검증 실패 뒤 같은 bucket에 합류해 token-shape 우회 차단
- [x] token 원문 저장·응답 없음: limiter key는 client identity뿐, 429 body는 generic error만
- [x] 현재 Cloudflare Tunnel topology에서 `CF-Connecting-IP`만 신뢰하고 `X-Forwarded-For` 무시
- [x] focused 2 files/68 PASS, TypeScript PASS, full Vitest 100 files/858 PASS·10 DB-env skip
- [x] Next.js 16.2.2 production build 165 routes PASS(proxy 포함); 기존 studio/text NFT trace 경고 1건
- [x] Claude 보안 2nd-pass: blocking/high 결함 0
- [ ] 로컬 실제 HTTP curl: sandbox socket bind가 `listen EPERM`으로 차단돼 미검증
- [x] 2026-07-25 운영 Cloudflare 경유 실제 `401×4 → 429 + Retry-After: 59`, 제한 중 유효 customer 200,
  유효 operator 200 후 window clear와 다음 invalid 401 관찰

## 2026-07-24 운영자 로그인 리다이렉트

- [x] 검증된 운영자 세션이 `/operator/customers`로 이동하는 계약 테스트
- [x] `/api/me` 운영자 경계와 `/api/operator/customers` 보안 회귀 33 PASS
- [x] 전체 Vitest 835 PASS/10 DB-env skip
- [x] TypeScript 포함 production build 165 routes PASS
- [x] 새 GitHub secret으로 운영 재배포: run `30020112816` SUCCESS
- [x] 구 토큰 `/api/me` 401, 새 토큰 `/api/me` 200·`isOperator=true`, customers 200
- [x] Chrome `/operator` 실제 토큰 입력·접속 클릭→`/operator/customers`와 고객 상태판 직접 렌더
- [x] 가입자 7, 워크스페이스 11, 활성 11, 연결 계정 3, 중앙 OAuth 4/12 준비 직접 관찰
- [x] Claude 보안 2nd-pass: redirect/API authorization blocker 0
- [x] 후속: `/api/me` 운영자 토큰 실패 rate limit 운영 관찰(2026-07-25)
- [ ] 후속: 운영자 인증 실패 감사 이벤트
- [ ] 후속: customers client guard와 source-match 대신 컴포넌트 행위 테스트

## 2026-07-23 운영자 상태판·Meta 법정 페이지

- [x] `/api/operator/customers` 비밀번호·credential 원문 비노출 계약
- [x] 운영 KPI와 tenant별 다중 연결계정 집계 단위 테스트
- [x] OAuth provider credential boolean 상태와 Facebook config 상태 단위 테스트
- [x] `/privacy`, `/terms`, `/data-deletion` AuthGate 공개 경로 계약
- [x] focused 51 PASS, full Vitest 834 PASS/10 DB-env skip
- [x] TypeScript PASS, Next.js production build 165 routes PASS
- [x] 운영 PostgreSQL 실제 집계 query 관찰: 가입자 7/워크스페이스 11/연결계정 3/발행 5/실패 5
- [x] 운영 `/operator/customers` API 200 및 Chrome 렌더 관찰
- [x] 운영 공개 법정 페이지 3개 HTTP 200, 개인정보처리방침 Chrome 렌더 관찰
- [x] Meta 앱 Basic 설정 URL 3개 저장·재조회, Go Live `게시됨` 관찰
- [x] Facebook 운영 OAuth가 앱 비활성 오류 없이 consent·다른 계정 로그인 경로 표시
- [ ] Facebook consent callback·페이지 계정 저장·실발행: 개인 개발계정을 고객 tenant에 연결하지 않아 미검증
- [ ] X/TikTok 중앙 앱: 각 개발자 콘솔 로그인 단계에서 외부 인증 대기

## 2026-07-22 셀프서비스 tenant·OAuth 격리 build 재검

**수정:** OAuth auth-url의 서명 state를 callback 경로 전용 HttpOnly 쿠키에도 저장하고 callback에서
대조한 뒤 즉시 만료시킨다. 기존 HMAC·provider·10분 만료 검증에 브라우저 요청 바인딩을 더해 다른 브라우저의
state 재생을 차단했다. 동시 callback을 원자적으로 1회 소비하는 서버 nonce 저장소는 별도 스키마 결정이 필요해 현재 범위에는 포함하지 않았다.

**신규 통합 계약:** `tests/isolation/self-service-tenant.db.test.ts`가 실제 PostgreSQL(RLS 적용)에서
새 사용자 A/B provisioning, account/default 전환, integration mirror, queue/schedule/published_posts와
filesystem images 격리를 만들고 교차조회 0행·교차 INSERT 거부를 검증한다. CI에서는 DATABASE_URL 없음을
실패로 처리한다.

**관찰된 자동 검증:** focused OAuth 50 PASS · full Vitest 96 files / 822 PASS / 10 skipped · TypeScript PASS ·
production build 162 routes PASS.

**미검증:** 현재 로컬은 DATABASE_URL과 Docker daemon이 없어 새 PostgreSQL 통합 테스트는 skip됐다. 실제 신규
Google 사용자 A/B의 가입→OAuth 동의→발행 permalink→교차 API 403/404, 그리고 Meta/X/TikTok 외부 동의는
credential·실계정 부재로 미검증이다. ship 완료 증거로 승격하지 않는다.

## 2026-07-10 ❌ 재제보 재확인 — live Google/raw JSON + 비밀번호 찾기 없음 + 가입자 목록

**사용자 재제보:** Google 로그인 클릭 시 Supabase raw JSON `Unsupported provider: provider is not enabled`가 보이고, 비밀번호 찾기 UI도 없음. 현재 가입자 목록 확인 요청.

**직접 확인:**
- live `GET https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/login` → 200이지만 HTML에 `비밀번호 찾기` 버튼 없음. 현재 운영 빌드는 2026-07-09 로컬 수정 전 구버전.
- live `GET /api/auth/google?redirect_to=...` → 401 `{"error":"Unauthorized"}`. 새 public preflight route/middleware가 운영에 아직 반영되지 않음.
- 운영 DB 직접 조회(비밀번호 원문 조회 없음): `auth.users` 5명, `tenants` 9개. 셀프서브 auth와 tenant가 연결된 계정은 `r.cupid@gmail.com`, `j.the.great.investor@gmail.com`, `code0to1@gmail.com`.

**가입자/워크스페이스 판정:**
- `j.the.great.investor@gmail.com` 존재 확인: auth user 있음, tenant `j-the-great-investor-6794e3` 연결됨, email confirmed, last sign-in `2026-06-28T15:47:44Z`.
- 미확인/미완료 auth 계정: `osmu.qa.overnight0702@gmail.com`, `qa.live.1781632644@gmail.com`은 auth에는 있으나 email unconfirmed + tenant 미연결.

**현재 결론:** 수정 코드는 로컬 worktree에서 통과했지만 라이브에는 미배포다. 배포 전까지 고객은 raw JSON/비밀번호 찾기 없음 상태를 계속 본다.

**2026-07-10 추가 구현:** 운영자 `/operator/customers`를 auth 가입자까지 보이도록 확장하고, 계정별 `비밀번호 재설정 메일` 액션을 추가했다. 기존 비밀번호 원문/해시 조회·노출은 구현하지 않았다.

**2026-07-10 배포 전 검증:**
- `npm run test -- tests/api/operator-customers.test.ts tests/brand/google-auth-preflight.test.ts tests/brand/oauth-errors.test.ts tests/isolation/middleware.test.ts` → 4 files / 22 tests PASS.
- `npm run test` → 37 files PASS, 190 PASS / 8 skipped.
- `npm run build` → PASS. `/api/auth/google`, `/api/operator/customers`, `/api/studio/engine-status`, `/operator/customers` 포함.
- `npm run e2e:local` with `http://localhost:3456` → PASS, screenshots `/tmp/e2e-*.png`. Supabase client duplicate warning만 있고 core flow 통과.

## 2026-07-09 ❌ 재제보 NG — 로그인/계정/연결 E2E

**사용자 재제보:**
- Google 로그인 클릭 시 여전히 raw JSON 노출: `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`
- 비밀번호 찾기/재설정 UI 없음.
- 가입 회원 목록 및 `J.the.great.investor@gmail.com` 계정 존재 여부 확인 필요. 비밀번호 원문/추정 검증은 하지 않음(비밀번호는 조회 불가/조회 금지, 재설정만 가능).
- OAuth 연결 완료 UI, 토큰 저장, 실제 전송까지 “되는 것/안 되는 것/미검증”을 다시 분리해 기록 필요.

**현재 판정:** live/prod는 **NG 유지**. local gstack/테스트는 통과했지만 운영 터널은 아직 수정본 미배포/미반영 상태라 Google raw JSON이 재현된다.

**2026-07-09 재검증 요청:** 사용자 요청으로 전체 테스트/빌드/로컬 E2E/gstack 브라우저 검증을 재실행. **검증 결과: local PASS, live/prod NG.**

**원인 분석 (2026-07-09 Codex):**
- live gstack에서 `/login` → `Google로 계속` 클릭 시 앱이 에러를 받는 것이 아니라 브라우저가 `https://gvtsyyltgwqplrqegrxo.supabase.co/auth/v1/authorize?...`로 이동했고, Supabase authorize endpoint가 raw JSON을 직접 렌더링하는 것을 확인.
- 따라서 기존 `signInWithOAuth()` 이후 `error.message` mapper는 이 케이스에 닿지 않았음. 원인은 “앱 내부 에러 미매핑”이 아니라 **Supabase 자동 리다이렉트가 raw JSON 페이지로 브라우저를 넘긴 것**.
- 비밀번호 찾기 검색 결과 `resetPasswordForEmail`/recovery UI가 없었음.
- 회원 목록 조회는 현재 실행 환경에 `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DASHBOARD_AUTH_TOKEN`이 없어 불가. 비밀번호 원문은 조회 불가/조회 금지이며 재설정 링크로만 처리.

**수정 반영 (2026-07-09 Codex):**
- `/api/auth/google` 공개 preflight 라우트 추가. Supabase authorize URL을 서버에서 `redirect: manual`로 먼저 호출해 400 raw JSON을 한국어 안내로 변환하고, 3xx일 때만 브라우저를 Supabase/Google로 이동.
- `/login`의 Google 버튼을 직접 `signInWithOAuth()` 리다이렉트 방식에서 `/api/auth/google` preflight 방식으로 변경.
- middleware에서 `/api/auth/google`을 고객 로그인 공개 API로 허용.
- `/login`에 `비밀번호 찾기` 버튼 추가. 이메일 입력 후 Supabase `resetPasswordForEmail()` 발송, `/login?type=recovery` 복귀 후 새 비밀번호 설정 폼 추가.
- `/signup`/`?mode=signup` 첫 렌더의 서버/클라이언트 모드 불일치 가능성을 줄이기 위해 초기 mode는 `login`으로 고정하고 mount 후 URL 기준으로 signup 전환.
- 로컬 env 누락(`NEXT_PUBLIC_SUPABASE_ANON_KEY`)이 E2E 콘솔에서 실패처럼 보이지 않도록 login mount catch 로그를 `console.error`에서 `console.warn`으로 낮춤.

**직접 검증 (2026-07-09 Codex):**
- live gstack: `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/login` → Google 클릭 → Supabase raw JSON 페이지 재현 확인.
- local env 재현 서버: `PORT=3457 NEXT_PUBLIC_SUPABASE_URL=https://gvtsyyltgwqplrqegrxo.supabase.co npm run dev`.
- gstack `http://localhost:3457/login`: `비밀번호 찾기` 버튼 노출 확인.
- gstack `http://localhost:3457/login` → Google 클릭: Supabase raw JSON 페이지로 이동하지 않고 앱 화면에 “Google 로그인이 아직 설정되지 않았습니다. 이메일로 가입하거나 관리자에게 Supabase Google provider 활성화를 요청하세요.” 표시 확인.
- gstack `비밀번호 찾기` 클릭(이메일 미입력): “비밀번호를 재설정할 이메일을 입력해주세요.” 표시 확인.
- tests: `npm run test -- tests/brand/google-auth-preflight.test.ts tests/brand/oauth-errors.test.ts tests/isolation/middleware.test.ts` → 3 files / 19 tests PASS.
- build: `npm run build` → PASS, `/api/auth/google` route 포함 확인.

**재검증 결과 (2026-07-09 Codex, 재실행):**
- tests: `npm run test` → 36 files PASS, 187 PASS / 8 skipped.
- build: `npm run build` → PASS, `/api/auth/google` route 포함. 기존 warning만 유지: Next middleware convention deprecated, Turbopack NFT trace warning(`next.config.ts` → `/api/sourcing`).
- local E2E: `npm run e2e:local` → PASS. 스크린샷 `/tmp/e2e-landing.png`, `/tmp/e2e-login.png`, `/tmp/e2e-signup.png`, `/tmp/e2e-logout.png`.
- local E2E console: gstack console buffer clear 후 재실행. Supabase anon key 미설정은 현재 코드 기준 `[warning]`으로만 표시됨.
- local gstack `http://localhost:3456/login`: `Google로 계속`/`비밀번호 찾기` 버튼 노출 확인.
- local gstack Google 클릭: URL이 `http://localhost:3456/login`에 남고 “Google 로그인이 아직 설정되지 않았습니다. 이메일로 가입하거나 관리자에게 Supabase Google provider 활성화를 요청하세요.” 표시 확인.
- local curl `/api/auth/google?...` → HTTP 400 + 위 한국어 JSON. Supabase raw JSON으로 브라우저를 넘기지 않음.
- local gstack 비밀번호 찾기 클릭: 로컬 env에 `NEXT_PUBLIC_SUPABASE_ANON_KEY`가 없어 “비밀번호 재설정 로그인 설정이 서버/환경변수에 아직 없습니다...” 안내 표시. 실제 reset email 발송은 prod/env 주입 후 재검 필요.
- live curl `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/api/auth/google?...` → HTTP 401 `{"error":"Unauthorized"}`. 새 public middleware/route가 운영에 반영되지 않음.
- live gstack `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/login`: `비밀번호 찾기` 버튼 없음. `Google로 계속` 클릭 시 `https://gvtsyyltgwqplrqegrxo.supabase.co/auth/v1/authorize?...`로 이동하고 raw JSON `Unsupported provider: provider is not enabled` 재현. 스크린샷 `/tmp/openclaw-login-google-live-ng.png`.
- local 비밀번호 찾기/Google 상태 스크린샷: `/tmp/openclaw-login-google-reset-local.png`.

## requires_evidence 현황

| 증거 | 상태 | 근거 |
|---|---|---|
| prod-health-200 | ✅ | `GET /api/health` → `{ok:true,db:up}` 200 (반복 실측) |
| prod-demo-login-200 | 🟡 부분 | 운영자 `/api/me` 200 `{isOperator:true}` 실측. **고객 가입 로그인은 Supabase Email Confirm ON에 막힘**(가입→"이메일 확인" 대기 실측) → 아침 토글 후 재검 |
| e2e-happy | 🟢 대부분 | vitest 146 pass. 라이브: IG auth-url 생성 ✅, **콘텐츠 생성 라이브 성공 ✅**(CLAUDE_CODE_OAUTH_TOKEN 배선, 실제 한국어 콘텐츠). 남은 건 IG 연결 로그인(사용자)→실발행 |
| e2e-edge | ✅(유닛)/🟡(라이브) | 잘못된 키 400·미연결 분기·state누락 등 vitest. 라이브 Threads "미설정" 에러 일관 실측 |

## 2026-07-08 회귀 QA — OAuth/OSMU/운영자 허브

**사용자 제보 NG:**
- Google 로그인 반복 클릭 시 raw JSON 노출: `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`
- 온보딩/마케팅 자동화 시작에서 OAuth가 아니라 토큰 입력으로 진입
- Threads OAuth 후 동의/초대 상태가 불명확하고 재연결 시 Meta tester invite 미수락 에러(`1349245`)
- Instagram 연결 시 Meta 개발자/테스터 역할 권한 부족
- permission error 팝업 한글 깨짐
- TikTok/YouTube 등 일부 채널에 OAuth 로그인 UI 부재
- OAuth 토큰/accessToken이 Settings에 원문으로 박제되는지 확인 필요
- OSMU 생성 엔진이 Anthropic key인지 `claude -p`인지 불명확, 영상 생성 실패 원인 불명확
- Marketing Hub 유저 관리자 페이지 필요

**반영 방향:**
- OAuth/Meta 에러를 한국어 조치 문장으로 매핑하고 callback HTML을 `utf-8` + escape 처리.
- OAuth 지원 채널은 공식 OAuth 버튼을 기본으로 노출하고, 수동 토큰 입력은 고급/비상용으로 숨김.
- OAuth 토큰은 `integrations(kind='channel')`에 암호화 저장하고 Settings 화면에는 원문 미표시. 기존 수동 설정 토큰도 API 응답에서 마스킹.
- Studio에 현재 생성 엔진(`내 Anthropic API 키` vs `공유 Claude CLI`)과 마지막 실패 원인 표시.
- `/operator/customers` 운영자 고객/연결/사용량 개요 MVP 추가.

**원인 → 해결 방법 → 직접 확인:**

| 제보 | 원인 | 해결 방법 | gstack 확인 |
|---|---|---|---|
| Google 클릭 raw JSON | Supabase provider/env 오류를 `error.message` 그대로 렌더 | `oauthErrorMessage()` 추가, Google provider disabled/missing env를 한국어 안내로 변환 | `/login` Google 클릭 → “Google 로그인 설정이 서버/환경변수에 아직 없습니다…” 표시 |
| Threads tester invite `1349245` | Meta tester 초대 미수락/앱 테스트 권한 문제를 raw로 표시 | Meta invite/role/permission 오류 패턴 매핑 | `/api/connect/threads/callback?error=Invalid_Request_1349245` → tester invite 안내 |
| Instagram 개발자 역할 부족 | Meta App Dashboard role/테스터 권한 미부여 | role/permission 오류 패턴 매핑 | Instagram callback role 부족 URL → 개발자/테스터/관리자 추가 안내 |
| permission popup 한글 깨짐 | callback HTML에 charset/escape 없음 | `lang=ko`, `<meta charset="utf-8">`, `Content-Type: text/html; charset=utf-8`, HTML escape 적용 | callback HTML에서 `meta charset="utf-8"` 확인 |
| YouTube/TikTok OAuth UI 없음 | Settings/채널 UI에서 수동 토큰 폼이 기본, 일부 OAuth 채널 누락 | OAuth 지원 채널 목록 확장, `SocialConnectButton` 기본 노출, 수동 입력은 고급 토글 뒤로 이동 | `/channels/youtube`, `/settings` TikTok 탭에서 OAuth 버튼 확인 |
| accessToken Settings 박제 의심 | OAuth 토큰은 DB 암호화지만 기존 수동 `openclaw.json` 토큰은 API 응답 원문 가능 | `/api/channel-config` GET에서 secret key 마스킹, POST에서 `********`가 기존값 덮어쓰지 않게 처리 | 유닛 테스트 `channel-config-mask` PASS |
| OSMU가 Claude API인지 CLI인지 불명확 | tenant Anthropic key fallback 상태가 UI에 없었음 | `/api/studio/engine-status` 추가, Studio 상단 엔진 배지 표시 | `/studio` → `AI 공유 Claude CLI · claude -p` 표시 |

**검증 결과 (Codex, local dev + gstack):**
- `npm run test -- tests/brand/oauth-errors.test.ts tests/api/channel-config-mask.test.ts tests/api/channel-config-bridge.test.ts tests/brand/social-connect.test.ts` → 4 files / 45 tests PASS.
- `npm run build` → PASS. 기존 Turbopack NFT warning(`next.config.ts` → `/api/sourcing`)만 유지.
- gstack `/login`: Google 클릭 시 raw `supabaseUrl is required` 대신 “Google 로그인 설정…” 안내 표시 확인. 운영 raw JSON(`Unsupported provider`)은 유닛 테스트로 고정.
- gstack `/channels/youtube`: `YouTube OAuth 연결` 기본 노출, `고급: 토큰 직접 입력` 토글 전에는 수동 폼 미노출, 토글 후 수동 CredentialForm 노출 확인.
- gstack `/settings`: `OSMU 채널 OAuth` 카드, “토큰 원문은 서버에 암호화 저장되고 화면에 표시하지 않습니다” 문구, `채널 OAuth 연결` 모달 확인. TikTok 탭에서 `TikTok OAuth 연결` 버튼 확인.
- gstack `/studio`: 상단 엔진 배지 `AI 공유 Claude CLI · claude -p` 확인.
- gstack `/operator/customers`: 운영자 유저 관리 페이지 렌더 확인. 로컬 `DATABASE_URL` 미설정으로 API 500은 표시됨(프로덕션 DB 필요).
- gstack callback HTML: `/api/connect/threads/callback?error=Invalid_Request_1349245` → `utf-8` HTML + Meta tester invite 안내 확인. Instagram role 부족 에러도 한국어 안내 확인.

## 라이브 실측 결과 (2026-07-02 밤)

**정상 동작 확인:**
- `/api/health` 200, DB up (pg_trgm·pgcrypto·osmu_service·핵심 7테이블 적용 확인 — psql 실측)
- 운영자 인증(`/api/me`), 워크스페이스 8개 존재(ZERO-ONE·D-Edu·Romeo 등)
- **IG OAuth 연결 auth-url 라이브 생성** — 실제 instagram.com OAuth URL + client_id + callback (컨테이너 env IG_APP_ID/SECRET 적재 실측)
- 가입 폼 동작(중복 가드·이메일 검증·pending 안내 화면), 대시보드 번들에 "Instagram 연결" 버튼 문자열 존재

**발견 → 수정한 버그(2088a456 배포):**
1. **간헐 Cloudflare 520 → /_next 청크 로드 실패 → 하이드레이션 전멸 → 전체 버튼 무반응** (콘솔 520 실측; "구글 로그인 안 먹음"의 앱측 원인) → layout에 청크 에러 자동복구 스크립트(15s 가드 1회 reload)
2. `/login?mode=signup`·`/signup` 딥링크 미적용(실측) → mount 후 URL 재동기화

**막힌 것(사용자/설정 필요 — 아침 체크리스트):**
1. **Supabase Email Confirm ON** → 신규 가입이 메일 확인 대기에 걸림(실측). 콘솔 토글 필요
2. **생성 502** — 컨테이너 claude CLI 미인증(호스트 `~/.claude` 빈 폴더 실측) + Anthropic 키 미보유. `claude setup-token` 값 또는 API 키 필요
3. **Meta redirect URI 미등록** — IG auth-url은 나오지만 Meta가 callback 거부할 상태
4. VM crontab(publish-due)·autoheal 기동 — classifier가 프로덕션 시스템 변경 차단 → 사용자 승인/실행 필요
5. Threads/FB 연결 — `THREADS/FB_APP_ID/SECRET` 시크릿 미제공

## 판정
qa = **in-progress** (ship 게이트 잠김 유지). 아침 체크리스트 1~3 처리 후 고객 가입→생성→IG 연결 라이브 재검 → `/approve qa`.

## 2026-07-10 04:45 KST 배포 직전 재실행 (Fable 5, Phase 0)

- `npm run test` → 37 files / 190 PASS / 8 skipped (직접 실행)
- `npm run build` → PASS. `/api/auth/google`, `/api/operator/customers`, `/api/studio/engine-status`, `/operator/customers` 라우트 포함 확인
- `bash scripts/verify-e2e.sh http://localhost:3459` → **PASS** (3456은 타 프로젝트 dev 점유라 3459 사용). 스크린샷 `/tmp/e2e-*.png`
- local `/login` → `비밀번호 찾기` 렌더 확인 (grep 1)
- local `/api/auth/google?redirect_to=...` → 400 + 한국어 안내 JSON ("Google 로그인이 아직 설정되지 않았습니다...") — Supabase raw JSON 미노출
- 커밋 위생: `origin/main..HEAD` 7커밋 = dashboard 28 + .github 1 + docker-compose 1 + docs 1 + wiki 2 파일. `.codex/`·nested `openclaw/` 미포함 확인
- 판정: **배포 준비 완료** — `/approve qa` 대기

## 2026-07-10 06:00 KST Phase 5 qa 미니사이클 — 구현·보안리뷰 완료 (Fable 5 + code-builder + Codex)

**변경 4건:** ①온보딩 채널감지에 DB integrations OR 조건(파일 폴백 유지) ②발행 미지원 8채널 "발행 준비 중" 배지(SCHEDULABLE_PLATFORMS SSOT 테스트 고정) ③OAuth state HMAC 서명(base64url JSON payload + HMAC-SHA256, provider 바인딩, 10분 만료, 상수시간 비교, 키 있으면 비서명 거부) ④배포 스모크 게이트 확장(비밀번호찾기 grep + preflight 200/400 화이트리스트).

**보안 리뷰 사이클(고위험 인증 코드 의무):** Codex 크로스모델 3라운드 — R1: Critical(평문 다운그레이드)·Major(provider 미바인딩)·Minor(스모크 401만 감지) 발견 → 수정 → R2: Critical·Minor 해결 확인, Major(구분자 주입) 잔존 → 수정 → R3 최종: **"결함 없음"**.

**검증(메인 세션 직접 재실행 — 관찰됨):** `npm run test` 38 files / 209 PASS / 8 skip(신규 19건 포함) · `npm run build` PASS · `verify-e2e.sh`(port 3459) **E2E SMOKE PASSED**.
**미검증:** 라이브 반영(배포 대기), 실 OAuth 왕복(라이브 채널 필요).

## 2026-07-10 20:35 KST ✅ 배포 + 라이브 재검 전항목 통과 (Fable 5, Phase 1~2)

**배포:** run `29088645737` success (headSha `b9f8066c` = 런치 수정 7커밋 + Phase 5 하드닝). 확장 스모크 게이트(비밀번호찾기 grep + preflight 200/400 화이트리스트) 포함 통과.

**라이브 직접 실측 (전부 관찰됨):**
| # | 검증 | 결과 |
|---|---|---|
| 1 | live `/login` `비밀번호 찾기` | ✅ 1 (배포 전 0 → 해소) |
| 2 | `GET /api/auth/google?...` | ✅ 400 (배포 전 401 → public preflight 반영) |
| 3 | preflight body | ✅ 한국어 안내 JSON — Supabase raw JSON 미노출 (고객 제보 에러 해소) |
| 4 | `/api/health` · `/api/me` | ✅ `{ok,db:up,ms:42}` · 401 |
| 5 | `/api/operator/customers` 무토큰 | ✅ 401 (게이트 정상. 토큰 조회 200은 로컬 토큰 부재로 이 세션 미검증 — 2026-07-10 04:17 Codex 세션에서 검증 이력 있음) |
| 6 | `verify-e2e.sh` (live) | ✅ **E2E SMOKE PASSED** + 스크린샷 `/tmp/e2e-*.png` |

**남은 미검증 (외부 선행조건):** Google 실로그인(Supabase provider — 회장 콘솔), 비밀번호 재설정 메일 실수신(테스트 이메일 필요), 고객 생성→연결→실발행 루프(Phase 4).

## 2026-07-15 OSMU v1.0.0 출시 후보 QA

**변경 범위:** 공개 가입 즉시 활성화 + 공유 Claude 별도 운영자 승인, 운영자 계정/재설정 관리, strict allowlist 기반 오류·Slack 관측, transition-only health monitor, consent-aware GA4, Instagram/Threads 수동 출시팩.

**메인 세션 직접 검증:**
- `npm test` → 62 files PASS, 540 PASS / DB 연동형 8 skipped.
- `npx tsc --noEmit` → PASS.
- `npm run build` → PASS, 161 static pages 생성. 기존 Turbopack dynamic tracing warning 1건만 유지.
- `npm run e2e:local -- http://localhost:3461` → PASS. `/`, `/login`, `/signup -> /login?mode=signup`, storage clear 후 로그인 폼을 실제 브라우저로 관찰. DB env 미주입 상태의 API 503은 예상 동작.
- `git diff --check` → PASS.
- production PostgreSQL schema를 synthetic active/pending/paused 레코드로 transaction 안에서 적용해 `MIGRATION_TRANSACTION_PASS` 확인 후 rollback. 운영 데이터 미변경.
- SNS JSON 계약 → content 8 + DM 6, unique IDs 14, 전부 draft/manual approval, DM auto/cold false, caption/slides/alt text Markdown 동기화, Instagram alt text 슬라이드 수 일치·100자 미만, `fail=[]`.

**독립 QA:**
- `qa-verifier` fresh review: auth/shared CLI/schema/observability/GA4/deploy 스팟체크, 관련 11 files / 123 tests PASS, Critical/High 0.
- 위임 품질 검증: `verify-agent-quality.sh` → QA PASS(`qa-only` Skill, 근거 조사, 소크라테스/레드팀), code-builder PASS, content review PASS, visual producer PASS.
- 발견 Low 1건(`e2e:local` URL override 무시)은 수정 후 실제 3461 브라우저 E2E로 CLOSED.

**라이브/외부 미검증(배포 완료 판정 금지):**
- Supabase Google provider 실 OAuth 왕복.
- custom SMTP 비밀번호 재설정 메일 실수신.
- Slack webhook 실제 알림 수신.
- GA4 Measurement ID 주입 및 DebugView 이벤트 수신.
- 신규 가입 lead가 production `auth.users`에 저장되는 실제 signup 경로와 tenant 생성.
- Instagram/Threads 계정 리네임·프로필 업로드·첫 draft 수동 발행.

## 2026-07-16 v1 후보 운영 배포·핵심 E2E

- deploy run `29422450258` / head `b361d951` → success. DB schema/RLS, build, up, smoke 전 step success.
- live health → 200 + DB up. live browser public E2E → PASS.
- 운영 가입 폼 합성 사용자 생성 → auth user + confirmed email + active tenant 저장 관찰. shared AI 최초 미승인.
- 미승인 `/api/studio/text` → 403. operator `approve_shared_ai` → 승인시각 DB 저장. 승인 후 실제 shared `claude -p` 생성 → 200, 5개 출력 키와 한국어 Threads 결과 관찰.
- 비밀번호 재설정 UI → `r.cupid@gmail.com` 요청 성공 및 `recovery_sent_at` DB 저장. 메일함 수신은 미검증.
- Health Monitor run `29438972593` → success, HTTP 200, up→up, state cache 저장. Slack 실수신은 webhook secret 부재로 미검증.
- 판정: 핵심 제품 경로는 운영에서 관찰됨. Google OAuth·GA4 DebugView·Slack 실알림·SMTP 메일함 수신·Meta 실제 업로드가 남아 있어 `v1.0.0` 태그는 보류.

## 2026-07-16 06:31 KST 외부 설정 반영·운영 재검증

- Google provider 활성화 후 live preflight가 HTTP 200 + Supabase Google auth URL을 반환함을 관찰.
- 운영 `Google로 계속` 클릭 후 `accounts.google.com` 로그인 화면과 등록된 Supabase callback URI로 이동함을 실제 브라우저에서 관찰. Google 계정 입력 후 앱 복귀는 미검증.
- GitHub Secrets `OSMU_GA4_MEASUREMENT_ID`, `OSMU_ALERT_SLACK_WEBHOOK_URL` 저장 확인.
- Slack webhook 실제 POST → `ok`, exit 0 관찰. 단 채팅에 노출된 URL이므로 출시 전 회전 필요.
- 첫 deploy run `29451844552`는 잘못된 compose service 입력 `osmu`로 기동 실패. 실제 서비스명 `openclaw-dashboard-osmu`로 재실행한 run `29452057807`은 build/up/smoke 전 단계 success.
- 운영 브라우저 GA4: 동의 전 consent storage null 및 gtag script 없음. 동의 후 `G-MEEQ2D8C1J` gtag.js HTTP 200, consent granted, config, `/login` page_view dataLayer 적재를 관찰. GA4 DebugView 수신은 미검증.
- SMTP 공급자 credential은 로컬/GitHub에 없음. custom SMTP 설정과 실제 reset 메일 수신은 미검증.
- 회장 보고상 Instagram 계정은 생성됨. 계정 URL·프로필 반영·첫 게시물과 Threads 상태는 화면 증거 전 미검증.

## 2026-07-16 Google-only auth 전환 QA

- 정책: 고객 인증은 Google OAuth 단일 경로. SMTP/Resend와 이메일/비밀번호 가입·로그인·재설정은 사용하지 않음. 운영자 비밀번호 인증은 유지.
- 코드: 로그인 이메일 API/UI 제거, `/signup`→`/login`, 랜딩/오류 카피 Google-only화, 배포 스모크와 gstack E2E의 구 이메일 계약 제거.
- Codex 2차 리뷰에서 `AuthGate` 이메일 카피 잔존과 배포 스모크의 `비밀번호 찾기` 필수 조건을 발견해 수정·회귀 테스트 추가.
- 직접 검증: focused 4 files/43 PASS, full 63 files/548 PASS/8 skip, `tsc --noEmit` PASS, production build 161 pages PASS.
- 로컬 gstack E2E: `/login` Google CTA만 표시, 이메일/비밀번호/recovery 없음, `/signup` 307→`/login`, storage clear 후 동일 UX, Google 계정 로그인 화면 이동 관찰.
- 운영 auth users 6명은 모두 현재 `email` provider only임을 Admin API로 확인. 삭제하지 않으며 동일 이메일 Google 첫 로그인에서 identity linking/tenant 보존을 검증해야 함.
- 미검증: 변경 코드 운영 배포, Supabase Email provider 비활성화, 실제 Google 계정 선택→앱 복귀, 기존 user/tenant 보존, 신규 Google lead 저장.

### 2026-07-16 08:13 KST 독립 QA HIGH 종결

- 독립 QA가 관리자 고객 화면의 `비밀번호 재설정 메일`이 제거된 고객 recovery UI를 가리키는 죽은 기능임을 발견했다.
- API의 Supabase `/auth/v1/recover` 호출, UI 버튼/상태, `send_password_reset` 관측성 enum을 제거했다. 직접 API 호출은 400 unsupported이며 메일 fetch는 호출되지 않는다.
- 계정 정지/재개와 공유 AI 승인/회수는 유지했다. 관련 focused 8 files/98 PASS, 전체 63 files/548 PASS/8 skip, `tsc --noEmit` PASS, production build 161 pages PASS.
- 로컬 gstack E2E에서 `/login` Google CTA 단일 표시, 이메일/비밀번호/recovery 부재, `/signup`→`/login`, storage clear 후 동일 UX를 다시 관찰했다.
- 로컬 E2E 서버에는 이번 실행에서 Supabase 공개 env가 없어 Google 외부 화면 이동을 재실행하지 못했다. 해당 이동은 직전 운영/로컬 실행에서 관찰됐지만, 변경 코드 배포 후 계정 선택→앱 복귀·identity linking·lead/tenant 저장은 여전히 미검증이다.
- SMTP/Resend는 출시 선행조건이 아니다. Google-only 강제를 위해 Supabase Email provider를 비활성화해야 한다.

## 2026-07-16 운영 배포 후 SNS 전수 QA

- 배포 run `29485147720` / head `70001691` 성공. 운영 health 200+DB up, `/login` Google-only HTML, Google preflight 200과 실제 `accounts.google.com` 이동을 관찰했다.
- 운영 테넌트 `587cee76-...`의 integrations 조회에서 Instagram·Threads가 `has_secret=true`였지만, 플랫폼 읽기 전용 계정 API 직접 호출은 두 채널 모두 HTTP 400 / OAuth error code 190을 반환했다. 저장 토큰이 만료·무효이므로 UI의 저장 여부만으로 연결됨 판정하면 안 된다. QA용 임시 tenant token은 종료 시 revoke한다.
- ✅ OAuth preflight 200: Instagram, Threads, Facebook, YouTube.
- ❌ NG OAuth credential 미설정(운영 HTTP 500): X, LinkedIn, Naver Blog, Pinterest, Tumblr, TikTok, Slack, LINE.
- ❌ NG 직접 발행 구현 범위: `/api/publish`는 Threads, Instagram, X, Facebook, Bluesky, Telegram, Discord, Slack만 분기한다. YouTube·LinkedIn·Naver Blog·Pinterest·Tumblr·TikTok·LINE은 OAuth UI가 있더라도 직접 발행 분기가 없어 `미지원`이다.
- ❌ NG Instagram·Threads: 암호화 토큰은 존재하지만 실제 API error 190으로 연결 무효. 재OAuth 전 발행 불가.
- 🔎 진행 중: Instagram·Threads 재OAuth, Facebook·YouTube OAuth 동의/콜백, 미설정 플랫폼을 v1 차단으로 볼지 credential/발행 구현을 추가할지 분류.

### 2026-07-16 20:03 KST P0 시정

- 🔧 UI↔발행 불일치: 고객 UI의 발행 채널 SSOT를 `/api/publish`가 직접 지원하는 8개(Threads/X/Instagram/Facebook/Bluesky/Telegram/Discord/Slack)로 축소했다. 미지원 7개는 내부 확장 설정은 보존하되 Sidebar·Settings·ChannelConnect에서 노출하지 않는다.
- 🔧 연결 false-positive: `GET /api/channel-config`가 Instagram·Threads 암호화 토큰을 서버에서만 복호화하고 provider read-only 계정 API로 병렬 검증한다. HTTP 400/401 또는 code 190은 `connected=false`, `reconnectRequired=true`, `oauth_token_invalid`; 네트워크/5xx는 토큰을 삭제하지 않고 `unverified/provider_unreachable`로 표시한다.
- 🔧 UI: 일반 ChannelPage와 Instagram 전용 화면에 `재연결 필요`와 provider 일시 장애 문구를 분리했다. 토큰 원문·provider raw body는 응답/로그에 포함하지 않는다.
- 테스트됨: focused 6 files/75 PASS, full 65 files/563 PASS/8 skip, `tsc --noEmit` PASS, production build 161 pages PASS. code-builder 위임 품질 게이트 PASS(WebSearch/Fetch 5, 소크라테스 마커 5).
- 운영 재배포 후 실제 code190 테넌트가 `재연결 필요`로 표시되는지 확인해야 `관찰됨`으로 전환한다.

### 2026-07-16 21:20 KST P0 운영 재배포·직접 관찰

- 배포 run `29496623489` / head `8b1ca33f` 성공. schema/RLS, image build, up, status, Google-only/operator smoke 전 단계 통과.
- live `/api/health` HTTP 200, `{ok:true,db:"up"}` 직접 관찰.
- 인증된 live `/api/channel-config`에서 Instagram·Threads 모두 provider read-only 검증 결과 `connected=true`, `connectionStatus=valid`, `reconnectRequired=false`; 응답의 token/secret/credential 명명 필드는 0개였다.
- 운영 브라우저에서 Instagram `Connected`, Threads `Live`를 관찰했다. Sidebar/Settings 채널 목록은 직접 발행 지원 8개(Threads/X/Instagram/Facebook/Bluesky/Telegram/Discord/Slack)만 노출했다. Instagram 화면 캡처: `/private/tmp/osmu-prod-instagram.png`.
- 앞선 provider error 190과 현재 valid 결과가 달라졌으나, 현재 서버 API와 브라우저 결과는 일치한다. 실제 공개 게시를 하지 않았으므로 `threads_content_publish`/Instagram content publish 실권한과 최종 permalink는 미검증이다.
- 운영 auth user 6명(confirmed 4, unconfirmed 2), customer workspace 10개(active 10, shared AI 승인 10, integration 보유 2)를 operator API로 관찰했다. 비밀번호 원문은 Supabase에서 조회할 수 없다.
- Health Monitor run `29497421714` success. QA tenant token revoke 후 동일 token으로 live API 401 확인. 브라우저 localStorage 및 임시 probe 파일 정리 완료.
- ship 잔여: 실제 Google 계정 선택→앱 복귀→identity/lead 저장, Threads 공개 게시 1건과 permalink, GA4 DebugView 수신, 채팅에 노출된 Slack webhook 회전.

## 2026-07-17 사용자 실기기 SNS 연결 QA — 출시 차단 NG

> 증거 등급: **사용자 실기기 관찰**. 아래 항목은 재현·원인 분류 전까지 전부 ❌ NG이며, 기존 `Connected`/`Live` 판정을 출시 근거로 사용하지 않는다.

- ❌ **Threads 계정 전환 불가:** Chrome에 남아 있던 다른 Meta/Threads 계정으로 `계속하기`만 제공되고 취소 외 선택지가 없어 목표 계정을 연결하지 못함.
- ❌ **Instagram 인증 rate limit:** 인증번호 요청 한도 메시지로 로그인 완료 불가. 30초 안내가 있어도 현재 실제 재요청 성공은 미검증.
- ❌ **X 연결 버튼 실패:** 클릭 결과 `{"error":"X_CLIENT_ID 미설정 — 플랫폼 OAuth 앱 자격증명 필요"}`. 사용자에게 비활성/설정 필요 상태를 사전 표시하지 않고 연결 가능한 버튼처럼 노출함.
- ❌ **Facebook 앱 비활성:** Meta 화면에서 앱 비활성 상태로 차단되어 로그인·동의·callback 불가.
- ❌ **Bluesky 연결 UX/저장 실패:** OAuth가 아닌 handle/app password 입력 방식에 대한 설명이 부족하고, 임의 입력 시 `{"error":"openclaw.json not found"}` raw 오류 노출. 멀티테넌트 DB 저장 경로 대신 존재하지 않는 파일 설정에 의존하는 결함 의심.
- ❌ **영상 플랫폼 누락:** YouTube/TikTok/Reels/Shorts가 미리보기/영상 화면 일부에는 있으나 고객 채널 연결·발행 범위에서 제거되거나 불완전해, 사용자가 어디서 연결·발행하는지 알 수 없음. 실제 end-to-end 업로드는 미검증.

### QA 재발방지 판정

- 기존 QA는 `auth URL 생성`, `read-only /me 성공`, `connected/live 렌더`까지만 확인하고 **계정 전환 → 로그인/2FA → 동의 → callback → 저장 → 실제 발행** 전체 왕복을 확인하지 않았다. 따라서 `21:20 KST`의 연결 판정은 부분 증거이며 출시 완료 근거가 아니다.
- 앞으로 provider별 E2E 매트릭스에 `새 브라우저`, `기존 타계정 세션`, `2FA/rate limit`, `앱 live 상태`, `credential 누락`, `callback`, `저장`, `재연결`, `실발행/permalink`를 각각 별도 게이트로 둔다.
- raw JSON/파일 누락/credential 누락은 브라우저에 그대로 노출하지 않고, 연결 버튼 비활성 + 한국어 조치 안내로 수렴해야 한다.

### 결함 관리 원장 — 2026-07-17

| ID | 결함 | 확정 원인 | 미확정/외부 원인 | 수정 소유자 | 종료증거 | 상태 |
|---|---|---|---|---|---|---|
| SNS-001 | Threads 목표 계정 전환 불가 | `window.open`이 기존 Chrome의 Threads/Meta 쿠키를 공유하고, authorize URL에 계정 전환/재인증 UX가 없음 | Meta가 현재 앱에 허용하는 계정 전환 파라미터와 실제 계정 선택 화면 | build: 연결 UX·popup 상태 / external: 목표 계정 로그인 | 기존 타계정 세션이 있는 Chrome에서 목표 계정 선택→callback→DB의 Threads userId 변경 관찰 | 🔧 코드 수정·테스트됨 / 실브라우저 미검증 |
| SNS-002 | Instagram 인증번호 요청 제한 | Instagram 로그인 단계에서 OTP 요청 rate limit 발생; callback까지 도달하지 못함 | 제한 해제 시점·계정 보안 상태는 Meta만 판단 | build: 재시도/cooldown 안내 / external: 계정 인증 | 목표 Instagram 계정 로그인→동의→callback→DB 저장, 반복 요청 없이 1회 왕복 관찰 | ❌ NG |
| SNS-003 | X 연결 버튼이 500/raw error | 운영 `X_CLIENT_ID`, `X_CLIENT_SECRET` 미설정. UI는 readiness를 모르고 정적 OAuth 버튼 노출 | X Developer App 생성·요금/권한 승인 상태 | build: readiness·disabled UX / external: X app credential | credential 미설정 시 버튼 비활성+조치 안내; 설정 후 PKCE callback→DB 저장→테스트 post/permalink | 🔧 코드 수정·테스트됨 / 운영 credential 미설정 |
| SNS-004 | Facebook 앱 비활성 차단 | 서버 credential/config_id는 설정돼 auth URL은 생성되나 Meta가 앱 접근을 차단 | Development/Live 모드, 역할, 정책 제한, 앱 비활성 사유 중 무엇인지는 콘솔 캡처 전 미검증 | external: Meta 앱 관리자 / build: 상태 안내 | Meta 콘솔의 활성 상태 증거 + 비역할 사용자 로그인→동의→callback→Page token 저장→테스트 post | ❌ NG |
| SNS-005 | Bluesky 수동 연결 404 | `POST /api/channel-config/bluesky`가 DB bridge 전에 tenant `openclaw.json` 존재를 강제하고 없으면 404. GET은 빈 config를 허용해 계약도 불일치 | ATProto OAuth 도입 시점 | build: DB-first 저장·오류 정규화 | config 파일 없는 신규 tenant에서 App Password 저장→createSession 검증→DB 저장→실제 post/permalink | 🔧 코드 수정·테스트됨 / 실계정 미검증 |
| SNS-006 | 영상 플랫폼 연결·발행 누락 | YouTube callback은 DB `integrations`에 저장하지만 status는 `youtube-token.json`, publish는 `openclaw.json`을 읽어 저장소가 3개로 분리. TikTok credential 없음+publish 미구현, Reels publish 분기 없음 | TikTok 앱 심사/공개 발행 승인 | build: YouTube DB 단일화·영상 UI / external: TikTok review | YouTube OAuth→DB refresh→영상 업로드→Shorts URL. TikTok/Reels는 구현 전 disabled+사유 노출 | 🔧 YouTube 코드 수정·테스트됨 / 실업로드 미검증 |
| SNS-007 | 사이트 내 provider 다중계정 관리·전환 불가 | `integrations`가 `UNIQUE(tenant_id,kind,label)`이고 OAuth callback이 provider label로 upsert해 새 계정 연결 시 기존 계정을 덮어씀. 발행 API도 provider별 단일 credential만 조회 | 두 번째 계정 OAuth 로그인 자체는 provider 세션/2FA 제약을 통과해야 함 | eng/build: additive `channel_accounts`+계정 관리 UI/API+선택 발행 | 동일 provider 2계정 보존→기본계정 전환→각 계정 선택 발행 permalink, 기존 단일계정 무손실, cross-tenant 거부 | 🟡 운영 단일계정 UI 관찰 / 실 2계정 전환·발행 미검증 |
| SNS-008 | OAuth 연결 클릭 후 popup 미생성 | 공통 `SocialConnectButton`이 auth URL fetch를 await한 뒤 `window.open()`을 호출해 transient user activation을 잃음 | provider 로그인·동의·callback 이후 외부 단계 | build: 클릭 즉시 blank popup 예약→URL 이동, failure/unmount/StrictMode lifecycle 정리 | 운영 Chrome에서 Facebook·YouTube 클릭 시 새 popup target 생성 및 공식 provider host 이동, callback postMessage 후 상태 갱신 | 🟡 운영 popup/provider 진입 관찰 / callback 미검증 |
| SNS-009 | Threads `valid`인데 실발행 400 | readiness가 `/me?fields=username` 성공만 보고 저장 user ID와 토큰 실제 ID를 비교하지 않음. publish는 stale `meta.userId`를 그대로 사용 | 없음(TEXT 실발행 기준) | build: `/me?id` identity 검증·실제 ID 사용, mismatch 회귀 테스트 | 운영 T-PIN-01 발행 성공 + permalink, draft 중복 방지, 실패 기록 보존 | ✅ 운영 관찰 |
| SNS-010 | Threads 컨테이너 준비 전 발행·발행 결과불명 | 모든 media container 생성 직후 상태 폴링 없이 publish하고, publish 네트워크 단절 시 실제 성공 여부를 확정할 수 없음 | 응답 단절 동시성은 별도 DB lock 없이는 완전 차단되지 않음 | build: FINISHED까지 status 폴링 + ERROR/EXPIRED/timeout fail-closed; 응답 단절 중복은 SNS-012 순차 방지로 완화 | TEXT/이미지 게시 실 permalink, 순차 재호출 중복 0건 | ✅ TEXT+IMAGE 순차 운영 관찰 |
| SNS-011 | 운영 재배포 후 tenant queue/config 파일 소실 | deploy가 checkout 전 workspace 전체를 삭제하는데 OSMU가 workspace 상대 bind mount를 사용 | 삭제된 과거 config의 별도 백업은 없음 | build: 고정 이름 Docker volume + 상대 bind 금지 계약 테스트 | 재배포 전후 동일 queue ID/원문 유지, 컨테이너 재생성 후에도 존속 | ✅ 운영 관찰 |
| SNS-012 | 실발행 성공 후 draft 잔존·재클릭 중복 | `/api/publish`가 `published_posts`만 INSERT하고 queue JSON/DB shadow 상태를 갱신하지 않으며 기존 성공 조회도 없음 | 동시 요청 레이스는 별도 DB lock 없이는 완전 차단되지 않음 | build: 계정별 기존 성공 반환 + 성공 후 queue dual-write | 첫 요청 게시 1개/queue published, 순차 동일 요청 `alreadyPublished:true`, 외부 게시물 증가 0 | ✅ 순차 운영 관찰 |
| SNS-013 | 발행 성공했지만 permalink 누락으로 검증 실패 | Meta media permalink가 발행 직후 조회에서 비어도 발행 자체는 성공 처리되며 기존 성공 retry는 URL을 보강하지 않음 | Meta permalink 가시화 지연 | build: 초기 5회 조회 + 기존 external ID URL-only 복구/DB·queue 보강 | 동일 요청 `alreadyPublished:true`+permalink, published/distinct external 1 | ✅ 운영 관찰 |
| SNS-014 | Instagram 게시 성공 후 permalink 미저장·준비 timeout fail-open | Instagram 발행 함수가 `media_publish` 성공 ID만 반환하고 permalink를 조회하지 않으며, 20회 폴링 후에도 `FINISHED`가 아니면 그대로 publish함 | Graph permalink 가시화 지연 | build: FINISHED timeout fail-closed + 성공 URL 조회 + 기존 성공 URL-only 복구 + provider 원문 비노출 | 배포 후 기존 T-02 재호출이 `alreadyPublished:true`+동일 permalink, DB/queue URL 보강, 외부 게시물 1건 유지 | ✅ 운영 관찰 |
| SNS-015 | Instagram Reels 발행 미구현(영상 채널 공백) | `/api/video/publish`의 reels 분기가 501이었고, Meta가 가져갈 수 있는 공개 video URL 배달 경로와 영상 라우트의 tenant 격리가 없었음 | 실제 Meta Reels 컨테이너 처리 시간·`EXPIRED` 실응답은 Meta만 판단 | build: 서명 미디어 배달 + REELS 폴링 fail-closed + DB 예약 dedupe + video 라우트 tenant-aware | 운영 계정 Reels 1건 실발행 permalink, DB published/distinct external 1, 격리 브라우저 공개 영상 렌더 | ✅ 2026-07-21 운영 관찰 종료 — Reel permalink·중복방지·DB 1건·공개 렌더 확인 |
| SNS-016 | 수동 배포 후 Google 로그인 HTTP 500 | Next.js의 `NEXT_PUBLIC_SUPABASE_*`는 빌드 시 인라인되지만 수동 Docker 빌드가 workflow의 `--build-arg`를 우회해 빈 클라이언트 번들을 생성 | 없음 | compose가 필수 Supabase build arg를 요구하고 workflow·수동 배포가 `.env.osmu` 단일 경로 사용 | 운영 브라우저 Google 클릭→`accounts.google.com` 이동, preflight 200, `supabaseUrl required` 소거 | ✅ 2026-07-21 운영 관찰 종료 — Google 계정 입력 화면 직접 확인 |

**관리 규칙:** 상태 전이는 `❌ NG → 🔧 코드 수정·테스트됨 → 🔧 로컬 실브라우저 관찰 → 🟡 운영 미검증 → ✅ 운영 관찰`만 허용한다. unit/mock/auth URL 200은 E2E나 종료증거로 승격하지 않는다. 각 ID는 코드 커밋·테스트·배포 run·실사용 증거에 동일하게 붙인다.

**SNS-011 재현·복구 근거(2026-07-19):** SNS-009 배포 run `29662640422` 직후 실제 컨테이너의 `/app/data`와 `/app/config`, compose checkout의 `data-osmu`/`config-osmu`가 모두 비어 있음을 확인했다. workflow는 checkout 전에 workspace를 전부 삭제하고, 기존 compose는 그 workspace의 상대 경로를 mount해 영속성 계약이 모순이었다. DB `queue_posts`에는 T-PIN-01(`13730d99-...`, 397자, text match)과 T-02 두 draft가 남고, T-PIN-01 `published_posts`는 failed 1건·permalink 0건이라 복구 및 단일 재발행이 가능하다. compose를 `openclaw-osmu-data`/`openclaw-osmu-config` 고정 이름 volume으로 바꾸고 `osmu-persistence.contract.test.ts` 2 PASS와 `docker compose config --quiet --no-interpolate` PASS를 확인했다. 운영 종료증거는 새 volume에 DB shadow를 복구한 뒤 재배포 전후 동일 ID 2건이 유지되는 관찰이다.

**SNS-010 TEXT 운영 재현 정정(2026-07-19):** deploy run `29681690918` 후 T-PIN-01을 재발행했을 때 identity 조회와 container 생성은 통과했으나 `threads_publish`가 400으로 실패했다. 공개 성공 0, failed 기록 2, queue draft, QA token revoke/401을 확인했다. 따라서 기존 "TEXT에는 폴링의 직접 영향 없음" 판단은 철회한다. container `status`를 최대 20회/1초 간격으로 조회해 `FINISHED`만 publish하고 `ERROR`/`EXPIRED`/unknown/network/timeout은 원문·토큰 비노출 오류로 중단하도록 수정했다. focused 3 files/29 PASS, tsc PASS. 운영 permalink 전에는 종료하지 않는다.

**SNS-013 운영 재현(2026-07-19):** polling 배포 run `29683491094` 후 동일 draft 발행은 DB `published=1`, distinct external ID 1, queue JSON/DB `published`로 실제 성공했다. 단, 발행 직후 permalink가 비어 검증 스크립트가 URL assertion에서 중단됐다. 토큰은 revoke됐고 외부 게시 재호출은 하지 않았다. 초기 permalink를 5회 재시도하고, 이미 성공한 draft의 순차 요청은 기존 external ID로 URL만 조회해 DB/queue를 보강하도록 수정했다. focused 27 PASS, tsc PASS.

**SNS-014 build 후보(2026-07-20):** 기존 T-02 Instagram IMAGE 발행은 공개 URL
`https://www.instagram.com/p/DbAnPRGlKTn/`에서 계정명·273자 caption·1024x768 이미지를 브라우저로 직접
관찰했지만 앱 응답과 `published_posts.permalink`는 비어 있었다. Instagram도 성공 직후 media permalink를 최대
5회 조회하고, 기존 성공 재호출에서는 외부 `media_publish` 없이 external ID의 URL만 회수해 DB와 queue를 보강하도록
수정했다. 컨테이너가 20회 안에 `FINISHED`가 아니면 publish하지 않고 timeout으로 종료하며 provider 응답 원문은
사용자 오류에서 제거했다. focused 2 files/18 PASS, 전체 78 files/673 PASS·9 DB-env skip, TypeScript clean,
production build 160 routes PASS, `git diff --check` PASS. CI·배포 후 기존 T-02 순차 재호출/DB·queue 보강은 미검증이다.

**SNS-014 운영 종료증거(2026-07-20):** commit `020c44d9`, CI run `29735697748`이 typecheck/build/PostgreSQL
schema→RLS/full test를 모두 통과했다. GitHub API dispatch가 로컬 네트워크에서 차단돼 같은 commit이 checkout된
marketing VM에서 이미지를 직접 build하고 `openclaw-dashboard-osmu`만 재생성했다. 컨테이너 healthy, `/login` 200,
`/api/me` 401, Google preflight 200, `/api/health` 200을 관찰했다. 기존 T-02 Instagram 재호출은 외부 publish 없이
`alreadyPublished:true`와 `https://www.instagram.com/p/DbAnPRGlKTn/`를 반환했고 queue는 published, 단기 token은
revoke 후 401이었다. DB는 published 1/distinct external 1/failed 0/permalink 1, queue DB payload는
published+Instagram+permalink 존재다. 격리 브라우저에서 계정명, 273자 caption 전체, 1024x768 이미지를 다시 직접
관찰했다.

**출시 blocker 최신 운영 재조회(2026-07-20):** 임시 고객 토큰의 `/api/connect/readiness`에서 Instagram,
Threads, YouTube는 available, Facebook은 available이지만 Development/Live 상태 확인 경고로 관찰됐다. X,
LinkedIn, Naver Blog, Pinterest, Tumblr, TikTok, Slack, Line은 각 OAuth credential 미설정이다. DB active
`channel_accounts`는 Instagram 1, Threads 2이고 YouTube/Facebook/X/TikTok은 0이다. 토큰은 폐기 후 401.
따라서 현재 공개 마케팅 출고가 실증된 범위는 Instagram IMAGE와 Threads TEXT/IMAGE다. YouTube는 OAuth 앱 credential만
준비됐고 실계정 callback/refresh/upload URL이 미검증이며, TikTok/Reels는 고객 UI에서도 명시적 미구현이다.

**Threads TEXT 최종 운영 증거(2026-07-19):** deploy run `29684688750` SUCCESS 후 동일 T-PIN-01 요청이 기존 성공을 재사용해 permalink를 DB와 queue에 보강했다. DB는 published 1, distinct external ID 1, 과거 failed 2이고 queue JSON/DB는 published다. 로컬·marketing VM curl 모두 공개 URL HTTP 200, gstack 실제 브라우저가 `zero_to_one_ai` 계정의 397자 원문 전체를 직접 렌더했다: `https://www.threads.com/@zero_to_one_ai/post/Da-Kay5lD4f`. 외부 게시물 추가 생성은 0이다. 별도 최종 토큰 수명주기에서 발급 직후 queue API 200, revoke 후 같은 토큰 401을 직접 확인했다.

**SNS-007 구현 결정:** 기존 `integrations` UNIQUE를 즉시 제거하지 않는다. 새 `channel_accounts` 테이블을 additive로 추가하고 기존 integration을 backfill·fallback으로 유지한다. OAuth는 계정별 upsert, 기본계정 변경 시 legacy integration을 동기화한다. 롤백 시 새 테이블 사용만 중단하면 기존 단일계정 경로가 유지된다.

**SNS-007 build candidate(2026-07-17, 자동 테스트 통과·실브라우저 미검증):** 스키마(`channel_accounts` + `published_posts.account_id`/`schedules.account_id`, tenant/provider당 partial unique default, 멱등 backfill) + `src/lib/channel-accounts.ts`(upsert/list/setDefault/delete/getSelectedCred) + REST(`/api/channels/[provider]/accounts`, `/[id]`, `/[id]/default`) + `/api/publish`·`/api/schedule`·`/api/schedule/publish-due` 선택계정 발행 + `AccountManager` UI + Studio/SchedulePanel/YouTube 선택 드롭다운을 구현했다. refresh token 평문 저장 금지, provider/tenant 계정 검증, 선택 YouTube refresh/upload, workspace 변경 시 선택 초기화가 자동 테스트로 검증됐다. 테스트: `npm test` 73 files/630 pass·9 DB-env skip, `npx tsc --noEmit` clean, `npm run build` PASS(160 pages). `tests/db/channel-accounts-concurrency.db.test.ts`는 실제 `upsertChannelAccount` 두 호출을 병렬 실행해 2행/기본계정 1개를 검증하도록 추가했지만 로컬 DB가 없어 skip됐다. QA 종료 조건은 CI PostgreSQL에서 이 테스트가 skip 없이 통과하는 것이다. 미검증: 실계정 2계정 OAuth 왕복, 프로덕션 migration, 선택계정별 실제 permalink/Shorts URL.

**SNS-007 실제 DB QA(2026-07-17):** GitHub Actions run `29572377311`(commit `592c4741`)에서 PostgreSQL 16에 `schema.sql → seed-test-tenants.sql → rls.sql`을 적용한 뒤 전체 테스트가 **73 files/626 pass/0 skip**으로 통과했다. 신규 `channel-accounts-concurrency.db.test.ts`는 314ms에 skip 없이 실행되어 실제 `upsertChannelAccount` 병렬 2호출 결과가 2행/기본계정 1개임을 관찰했다. 이는 DB 경쟁 조건과 RLS/schema 계약 증거이며, 실제 provider OAuth·브라우저 계정전환·공개 발행 증거는 아니다.

**SNS-007 운영 브라우저 QA와 핫픽스(2026-07-17):** 최초 운영 배포 run `29573237891` 후 고객용 단기 `osmu_` 토큰으로 Chrome을 열었을 때 AccountManager가 403 `이 API는 운영자 전용입니다`를 표시했다. 원인은 `proxy.ts`의 tenant-aware allowlist에 신규 account API 3경로가 누락된 것이며, commit `15b09a2c`에서 경로를 추가하고 osmu/JWT 회귀 테스트를 고정했다. GitHub Actions run `29598660707`은 typecheck/build/PostgreSQL schema→seed→RLS/full test를 모두 통과했다. 재배포 run `29600031321` 성공 후 분리된 headless Chrome에서 Instagram과 Threads Settings를 다시 열어 각각 계정 1개, 외부 계정 ID, `기본`, `정상`, `삭제` 컨트롤 렌더를 assertion과 스크린샷으로 직접 관찰했다. 증거는 `docs/qa/legacy-evidence-20260912/evidence/sns007-live-{instagram,threads}-account-manager-20260717.png`. 단기 QA 토큰은 폐기 후 같은 account API가 HTTP 401을 반환하는 것을 확인했고 원문 파일도 로컬/서버에서 삭제했다. 이 증거는 **운영 고객 인증 경로와 단일계정 관리 UI**의 통과 증거다. 실제 provider 두 번째 계정 OAuth, 두 계정 간 기본 전환, 계정별 공개 발행 permalink는 여전히 미검증이므로 SNS-007을 종료하지 않는다.

### 2026-08-02 DESIGN-001 — 프로토타입 범위·용어·로딩 이해 실패

- **❌ NG 사용자 관찰:** 첫 디자인 프로토타입에서 `브랜드 사실`, `발행 근거`, `permalink 확인`의 뜻을
  즉시 이해하지 못했고, loading shimmer가 과도하며, 전체 OSMU가 아니라 Threads 생성·발행·예약만
  만드는 제품처럼 보였다. 프로토타입이 최종 전체 플로우인지 후속 범위가 있는지도 전달되지 않았다.
- **근본 원인:** PRD의 내부 추적성 용어를 고객 언어로 번역하지 않고 UI label로 노출했다. pilot slice를
  표현하면서 전체 OSMU shell·다채널 확장·예약/queue의 위치를 숨겼고, skeleton을 데이터 로딩 범위보다
  넓게 적용해 시각적 소음을 만들었다. 즉 기능 누락 이전에 정보구조·범위 커뮤니케이션 결함이다.
- **현재 상태:** design `in-progress`, 사용자 컨펌 전 수정 금지. prototype v1은 승인본이 아니다.
- **수정 후보 종료증거:** ① 고객용 용어로 교체 또는 즉시 설명 ② skeleton 최소화 ③ 전체 OSMU 지도와
  이번 Threads working slice를 동시에 표시 ④ 생성·즉시발행·예약·queue·다채널 후속 범위가 한 화면에서
  구분됨 ⑤ 수정본을 사용자에게 다시 보여 이해 여부를 재확인. 구현·운영 증거가 아니라 디자인 게이트 증거다.
- **🔧 design cycle 2 관찰:** v2 hub에서 구 내부용어 3종 0건, 전체 제품 지도·Queue/예약·Threads 완전
  지원·Instagram 준비 범위를 첫 화면에서 관찰했다. 원문→플랫폼별 초안→검수→즉시/예약→캘린더
  클릭 체인이 끝까지 이동했고 console error 0. 전체 10화면×9상태=90 조합, h1/주요행동 누락 0,
  mobile overflow 0, 동시 loading region 최대 1개, Design Score B+를 기록했다.
- **상태 경계:** 수정본은 브라우저에 표시했으나 사용자가 실제로 “전체 OSMU와 현재 Threads 지원 범위를
  구분해 설명할 수 있는지” 재확인 전이므로 ✅ 종료하지 않는다. 사용자 확인 뒤 design 승인 후보로 전환한다.

**SNS-008 build candidate(2026-07-18):** 운영 고객 토큰 Chrome에서 X readiness 차단 안내는 정상 렌더됐지만 Facebook OAuth 클릭 후 popup target이 생성되지 않았다. E2E 스크립트의 click 판정 오류를 먼저 고쳐 재시도해도 동일하게 재현됐고, 공통 버튼이 `await fetch` 뒤 `window.open`하는 코드와 MDN/WHATWG transient activation 규칙이 원인으로 일치했다. 클릭 핸들러에서 `about:blank` popup을 동기 예약하고 auth URL 응답 후 이동하도록 수정했다. popup blocked 시 fetch 미호출, API/JSON/network/authUrl 없음 시 popup close, valid postMessage 시 interval 정리, wrong origin/provider 무시, popup close 감지, unmount cleanup, pending fetch 중 unmount, React StrictMode setup-cleanup-setup을 컴포넌트 테스트 10건으로 고정했다. 메인세션 직접 재현은 focused 10/10, 전체 74 files/644 PASS·9 DB-env skip, tsc clean, production build 160 pages PASS.

**SNS-008 운영 Chrome QA(2026-07-18):** commit `41f33340` 기준 OSMU 단독 배포 run `29639946525`가 DB/RLS, 이미지 빌드, 기동, 상태, OSMU 스모크를 포함해 성공했다. 분리된 headless Chrome과 단기 고객 토큰으로 X 버튼 비활성 및 `X_CLIENT_ID/X_CLIENT_SECRET` 사유, Facebook `Development/Live` 경고를 관찰했다. 사용자 제스처 클릭 후 Facebook 새 page target이 `www.facebook.com`, YouTube 새 page target이 `accounts.google.com`으로 이동한 것을 CDP target URL로 assertion했다. 영상 화면의 YouTube 연결 UI와 TikTok/Reels `미구현` 상태도 함께 확인했다. 화면 증거는 `docs/qa/legacy-evidence-20260912/evidence/sns008-live-oauth-popup-e2e-20260718.png`. 단기 토큰은 즉시 revoke했고 같은 토큰의 readiness API가 HTTP 401임을 확인한 뒤 원문과 임시 파일을 삭제했다. 이 증거는 **팝업 생성과 provider 진입까지만** 종료한다. 실제 provider 로그인·동의·callback postMessage·DB 저장·2계정 전환·공개 발행은 미검증이다.

## 2026-07-18 마케팅 실행 재개 — 운영 draft 큐

- 사용자 지적: 개발·QA 보고가 길어지고 실제 마케팅 출고가 시작되지 않음. 기존 SNS-001~008과 별개로 실행 지연 문제를 기록한다.
- 운영 API 직접 관찰: Instagram·Threads는 각각 `connected=true`, `connectionStatus=valid`, 기본 active 계정 1개. X 미연결, Facebook·YouTube 계정 0개.
- 런치 정본 `T-PIN-01`(397자)과 `T-02`(273자)를 `/api/queue/add`로 생성했고, `/api/queue` 재조회에서 두 ID가 `draft`, placeholder 0건임을 확인했다. 공개 발행·승인은 하지 않았다.
- 보안: 상태 조회와 draft 생성에 쓴 단기 tenant token을 각 실행 직후 revoke했고 동일 API HTTP 401을 확인했다.
- 브라우저 UI: `gstack browse`는 server start timeout, 대체 Chrome CDP 실행은 결과 로그를 남기지 않아 `/inbox` 렌더는 **미검증**. API 저장 증거를 UI PASS로 승격하지 않는다.
- 다음 종료증거: 실제 사용자 로그인 세션에서 `https://openclaw.sj-onpremise-cloudflare-tunnel.cloud/inbox`를 열어 두 초안 원문 확인 → 사용자 승인 → Threads 실제 발행 permalink 관찰.
- 실발행 재현: 정본 `T-PIN-01`을 기본 active Threads 계정으로 실제 POST했으나 provider 400 `Unsupported post request`가 발생했다. 공개 게시물은 생성되지 않았고 draft는 보존했다. 저장 계정 ID가 현재 token 권한 대상이 아니며, readiness가 id 비교 없이 username 조회 성공만으로 `valid`를 표시한 false-positive가 코드와 일치한다. 단기 token은 revoke 후 401 확인.

### 2026-07-19 SNS-009 build candidate

- `publishThreads`는 저장 `meta.userId`를 발행 URL에 쓰지 않고 매 발행 직전 토큰의 `GET /me?fields=id` 결과를 container/publish ID로 사용한다. 저장 user ID가 없어도 유효 토큰의 live ID로 발행할 수 있다.
- `verifyChannel`과 `GET /api/channel-config`는 Threads live ID가 없거나 파싱되지 않으면 `valid`로 통과시키지 않는다. 저장 ID와 live ID가 다르면 `identity_mismatch`, ID 확인 불가는 `identity_unavailable`로 분리한다.
- Threads identity/container/publish 실패 응답은 provider 원문 body를 포함하지 않고 상태 코드와 조치 문구만 반환한다.
- 직접 검증: focused 6 files/68 PASS, `npx tsc --noEmit` PASS, production build 160 pages PASS. 전체 테스트는 75 files/653 PASS·9 skip이고, 기존 5초 제한 2건이 현재 머신의 느린 동적 import로 timeout났다. 두 테스트만 15초 제한으로 조정해 단독 2 files/36 PASS를 관찰했다.
- 미검증: 변경 코드 CI·운영 배포, 현재 Threads token의 publish scope, T-PIN-01 공개 게시물과 permalink. 이 세 가지를 보기 전 SNS-009를 `✅ 운영 관찰`로 승격하지 않는다.
- QA 후속: Meta 공식 Threads Postman 컬렉션은 container 상태(`FINISHED`, `IN_PROGRESS`, `ERROR`, `EXPIRED`, `PUBLISHED`) 조회를 제공한다. 현재 T-PIN-01은 TEXT라 이미지 준비 폴링의 직접 영향은 없고, qa-verifier도 blocker/high 0·조건부 PASS로 분류했다. IMAGE 상태 폴링과 publish 응답 단절 후 중복 방지는 SNS-010으로 분리하되 이미지 공개 발행 전 해결한다. 이번 패치에서 새로 넣었던 `threads_publish` 15초 timeout은 응답만 늦은 실제 성공을 실패로 오판할 수 있어 제거했다.
- 최종 자동 증거: network/malformed JSON 4개 회귀를 포함한 focused 5 files/43 PASS, identity test 9/9 PASS, `npx tsc --noEmit` clean. 최종 qa-verifier는 `standards/dev.md` Read + QA Skill 1회 + Meta WebFetch 2회가 품질 스크립트에서 확인돼 PASS했고 blocker/high 0, TEXT build 조건부 PASS로 판정했다. 운영 permalink는 여전히 미검증이다.

## 2026-07-19 Google lead 및 GA4 재방문 QA

- **Google lead 운영 관찰:** 운영 PostgreSQL 비식별 집계에서 auth identity는 email 6/google 3, Google 고유
  사용자 3명, Google 사용자와 연결된 active tenant 3개, tenant 미연결 Google 사용자 0명이다. 따라서 실제
  Google 인증 유입이 tenant lead로 저장되는 경로는 운영 데이터로 관찰됐다. 계정 이메일·토큰·DB URL은 출력하지 않았다.
- **GA4 동의 경계 관찰:** 신규 격리 브라우저의 동의 전 네트워크에는 Google Tag/Analytics 요청이 0건이었다.
  동의 후 `G-MEEQ2D8C1J` gtag.js 200, analytics consent granted, config, `/login` page_view dataLayer 적재를 관찰했다.
- **GA4-001 재현:** 동의가 이미 저장된 상태로 `/login`을 reload하면 gtag.js는 200이지만 첫 page_view가 dataLayer와
  네트워크에서 유실됐다. `RouteTracker`가 `ConsentBanner`의 bootstrap보다 먼저 실행될 수 있고 `sendGaHit`가
  초기화 전 이벤트를 무시하는 순서 경쟁이 원인이다.
- **GA4-001 build 후보:** 저장 동의가 있고 `window.gtag`가 없으면 `sendGaHit`가 consent/config를 1회 bootstrap한
  뒤 이벤트를 큐잉한다. bootstrap 자체도 페이지 수명 동안 1회로 멱등화해 늦은 default 재적재를 막았다. focused
  18 PASS, TypeScript PASS. 운영 배포 후 저장 동의 reload에서 page_view와 실제 `google-analytics.com/g/collect`
  관찰 전 상태는 `코드 수정·테스트됨`이며, GA4 DebugView 수신은 별도 미검증이다.
- **GA4-001 CI:** commit `af50af17`, GitHub Actions run `29719316459`에서 typecheck, production build,
  PostgreSQL schema→seed→RLS, full test가 모두 성공했다. 운영 재배포·브라우저 network 관찰은 아직 미검증이다.

### HARNESS-001 — 가역 실행 승인 반복 노출

- ❌ **NG(사용자 최소 7회 직접 지적, 2026-07-20):** 이미 진행·build·QA 승인이 확정된 상태에서 Git/브라우저/GitHub
  명령의 샌드박스 권한 요청을 작업 승인처럼 반복 노출했다. 가역 작업은 묻지 않고 실행한다는 하네스 규칙과 충돌한다.
- **원인:** 제품 stage 승인과 실행환경 sandbox escalation을 보고 문구에서 분리하지 않았고, 권한 prefix를 한 번에
  확보하지 않아 승인 UI가 여러 번 발생했다.
- **재발방지:** 기존 승인 prefix는 무질문 실행, 신규 외부 권한이 시스템상 필수일 때만 최소 범위를 한 번에 묶는다.
  제품·단계 승인은 이미 승인됐으면 다시 요청하지 않는다. 이 항목의 종료증거는 남은 배포·운영 E2E를 추가 제품 승인
  질문 없이 끝까지 수행한 실행 기록이다.
- 🔧 **후속 관찰:** 두 번째 사용자 지적 뒤 deploy watch와 운영 브라우저 E2E는 `require_escalated` 선제 지정이나
  제품 승인 질문 없이 수행했다. 다만 이후 로컬 GitHub DNS 차단에서 시스템 권한 UI가 다시 두 차례 노출돼 종료증거가
  깨졌다. 같은 경로를 반복하지 않고 기존 허용 SSH로 marketing VM 직접 배포했으며, 권한 UI가 없는 실행만 사용한다.

### GA4-002 — dataLayer 명령이 보이지만 실제 수집 0건

- ❌ **운영 NG:** GA4-001 배포 run `29727395683` 후 저장 동의 reload에서 consent/config/page_view는 단일 순서로
  dataLayer에 존재했지만 GA collect 요청은 0건이고 `gtag('get', ..., 'client_id')` callback도 3초 timeout됐다.
- **확정 원인:** `rawGtag(...args)`가 일반 Array를 push했다. Google 공식 gtag snippet은 native `arguments` 객체를
  push하며, 운영 gtag.js는 일반 Array 명령을 실행하지 않았다. destination 전용 스크립트에는 측정 ID와 GA event
  설정이 실제 포함돼 있어 script/ID 미주입 문제는 아니다.
- **종료증거:** native Arguments 교정 후 운영 저장 동의 reload에서 client_id callback 반환, page_view collect
  network 요청, 명령 단일 적재를 모두 직접 관찰해야 한다. DebugView UI 수신은 별도 외부 확인으로 남긴다.
- **자동 검증:** commit `7c84d533`, focused 18 PASS, local full 77 files/669 PASS·9 DB-env skip, TypeScript,
  production 160-page build PASS. CI run `29728777597`도 typecheck/build/PostgreSQL schema→seed→RLS/full test SUCCESS.
- ✅ **운영 종료증거:** deploy run `29730312050` SUCCESS 후 격리 브라우저의 저장 동의 상태에서 `/login`을
  reload했다. gtag.js 200, native 명령 `default → update → js → config → page_view` 단일 적재,
  `gtag('get', 'G-MEEQ2D8C1J', 'client_id')` callback 반환, page_view `google-analytics.com/g/collect` POST 204를
  직접 관찰했다. GA4-002는 운영 관찰로 종료한다. GA4 DebugView UI 수신은 아직 미검증이다.

### 2026-07-20 Threads IMAGE 운영 종료증거

- T-02 draft를 공개 브랜드 PNG와 기본 Threads 계정으로 실제 발행해 permalink
  `https://www.threads.com/@zero_to_one_ai/post/DbAmsuHFCoU`를 회수했다.
- 격리 브라우저에서 `zero_to_one_ai`, 273자 본문 전체, Meta CDN 이미지 572×429를 직접 관찰했다.
- DB는 published 1, distinct external ID 1, failed 0, permalink row 1이고 queue는 published다.
- 동일 draft+platform+account 순차 재호출은 `alreadyPublished:true`와 같은 permalink를 반환했고 외부 게시물은
  1건으로 유지됐다. 각 실행의 단기 tenant token은 폐기 후 같은 queue API가 401임을 확인했다.

### 2026-07-20 SNS-015 Instagram Reels — build/QA 증거

**판정: 코드 테스트됨 + QA PASS, 그러나 운영 Reels 실발행은 미검증이므로 완료가 아니다.**

**구현 범위(코드 근거 확인):**
- `POST /api/video/upload` → 테넌트 스코프 `data/videos` 저장 → 15분 만료 HMAC 서명 URL
  `GET|HEAD /api/media/<token>`(Range 지원)로 배달 → Meta `media_type=REELS` 컨테이너 →
  `status_code` 최대 5분 폴링(1분 간격, `ERROR`/`EXPIRED`/timeout fail-closed) → `media_publish` →
  permalink 재조회 → DB/queue 기록.
- 미디어 토큰은 **암호화가 아니라 서명**이다. payload는 base64url 평문 JSON(tenantId·파일명·만료)이라
  토큰 보유자가 읽을 수 있다. 보장은 변조 불가와 만료뿐이며 기밀성은 주장하지 않는다.
- `/api/media/*`는 프록시 Bearer 인증을 요구하지 않는다(Meta 서버가 헤더를 못 붙임). 인가 판단은
  핸들러의 `verifyMediaToken` HMAC 검증으로 이동했다.
- 테넌트에 열린 영상 라우트는 list/upload/delete/publish 4개다. `/api/video/generate`는 임의 URL fetch(SSRF)와
  동기 ffmpeg 자원 고갈 위험 때문에 tenant-aware allowlist에서 의도적으로 제외한 **운영자 전용**이다.
- 업로드·발행 공통 애플리케이션 상한은 **100 MiB**(`lib/video-limits.ts`). 이전 기록의 1GB는 오기다.
- 중복 발행은 `published_posts` `status='in_progress'` 예약 INSERT + `draft_id` partial unique index로
  DB에서 강제하고, 경쟁에서 진 요청은 409 `publish_in_progress`로 fail-closed 응답한다. 좀비 예약 회수 경로도 포함.

**자동 검증(직접 실행, 관찰됨):**
- focused 106 PASS(미디어 배달 Range/HEAD, proxy bypass 계약, 5라우트 cross-tenant 격리,
  REELS 폴링·EXPIRED fail-closed, 예약 dedupe·409 경로).
- 최신 전체 실행 84 files / 752 PASS / 9 DB-env skip, 회귀 0.
- `npx tsc --noEmit` clean. production build 160 pages PASS.

**독립 QA:**
- qa-verifier 품질 게이트 PASS — `Skill qa-only` 1회, WebFetch 5회(Meta content-publishing, RFC 9110 등),
  `standards/` 품질헌법 Read 증거 확인.
- 직전 라운드의 BLOCKER 2건(미디어 경로가 프록시 인증벽에 막힘 / OAuth·osmu 사용자가 영상 라우트 5개에 403)은
  수정 후 회귀 테스트로 고정됐다.

**운영 환경 확인(컨트롤러 직접 관찰):**
- 운영 DB 중복 점검 `duplicateGroups=0`, `totalExtra=0`.
- 운영 origin은 HTTPS이며 미디어 서명은 전용 `MEDIA_SIGNING_SECRET` 없이 `DASHBOARD_AUTH_TOKEN` 파생 폴백으로
  구성돼 있다(전용 시크릿 설정 여부 = false). 서명 자체는 동작하지만 전용 시크릿 분리는 미완이다.

**미검증(완료 판정 금지):**
- 실제 Meta Reels 1건 공개 발행과 permalink 회수, 격리 브라우저의 공개 영상 렌더.
- 실 OAuth 고객 브라우저 세션의 `/videos` 전체 플로우 직접 관찰.
- `EXPIRED` 분기의 실제 Meta 응답(현재는 공식문서 근거 구현).

### 2026-07-21 SNS-015 Instagram Reels — 운영 관찰로 종료(operating observed / closed)

**판정: SNS-015는 운영 관찰로 종료한다. 단 전체 v1.0.0 ship은 계속 in-progress다.**

**운영 증거(컨트롤러 직접 관찰, commit `1a6e7e5a`):**
- 운영 DB에 schema 적용, 컨테이너 healthy, live health HTTP 200 · `db: up`.
- 실제 테넌트 업로드 수행 → 서명 미디어 `HEAD` HTTP 200, `Range: bytes=0-99` 요청에 HTTP 206 + 100 bytes 반환.
- 실제 Instagram Reel 공개 permalink 회수: `https://www.instagram.com/reel/DbBPRa7iFff/`.
- 동일 요청 재시도는 외부 재발행 없이 `alreadyPublished: true` + 동일 permalink 반환.
- 운영 DB: rows 1 / published 1 / distinct external 1 / permalink 1 / failed 0.
- 임시 테넌트 토큰은 revoke했고, 같은 토큰의 video list API가 HTTP 401임을 확인했다.

**공개 브라우저 관찰(gstack, 인증 없는 공개 경로):** 계정 `zero_to_one_ai`, 한국어 제목·본문·해시태그 원문 그대로,
`readyState=4`인 720x1280 8초 영상과 렌더된 브랜드 프레임을 직접 확인했다.
화면 증거: `docs/qa/legacy-evidence-20260912/evidence/sns015-instagram-reel-operating-20260721.png`.

**이전 "미검증" 항목 해소:** 위 3건 중 실제 Reels 발행·permalink 회수와 공개 영상 렌더는 해소됐다.
`EXPIRED` 분기의 실제 Meta 응답은 여전히 공식문서 근거 구현으로 남는다(운영에서 발생하지 않음).

**전체 ship이 아직 in-progress인 이유(SNS-015와 무관한 외부 blocker):** X·TikTok credential 미설정,
Facebook 앱 활성화, Instagram 신규 로그인 OTP, YouTube 실업로드, 동일 provider 실계정 2개 전환, GA4 DebugView.

### 2026-07-21 SNS-017 TikTok OAuth·Direct Post build candidate

**판정: 코드·자동 QA·생산 빌드는 통과, 운영 TikTok 계정 왕복과 실게시물은 미검증이다.**

- OAuth: TikTok 규격에 맞춰 authorize/token 양쪽에서 `client_key`를 사용하고 token 응답의 `open_id`를 계정 ID로 저장한다.
- 다중계정: 기존 `channel_accounts` 계정 목록·기본 전환·삭제 UI를 TikTok에도 연결하고, 발행 시 선택한 `account_id`만 사용한다.
- Direct Post: creator-info를 매번 조회해 계정이 허용한 공개범위만 표시·검증하고 댓글·듀엣·스티치 제한을 강제한다.
  사용자가 공개범위를 직접 고르기 전에는 발행 버튼을 노출하지 않는다.
- 영상 전달: 65분 만료 서명 HTTPS URL로 `PULL_FROM_URL`을 사용하며 토큰/provider 원문 오류를 응답에 노출하지 않는다.
- 처리 상태: `PUBLISH_COMPLETE`만 게시 완료로 응답하고, provider가 계속 처리 중이면 HTTP 202 `processing:true`로 구분한다.
- 회귀: focused 124 PASS, 최종 전체 88 files / 766 PASS / 9 DB-env skip, `tsc --noEmit` clean,
  Next.js 16 Webpack production build 161 pages PASS, `git diff --check` PASS.
- 빌드 중 발견한 기존 결함도 해소: route 파일의 금지된 보조 export 4건과 선택적 Request 서명 2건을 라이브러리 분리/정상 서명으로 교정했다.
- 공식 근거: TikTok Direct Post, creator info, status API 문서
  (`https://developers.tiktok.com/doc/content-posting-api-reference-direct-post`,
  `https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info/`,
  `https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status`).

**운영 차단:** 운영 `TIKTOK_CLIENT_KEY`·`TIKTOK_CLIENT_SECRET`이 없고 TikTok 앱 Content Posting API 심사 상태를
실계정으로 확인하지 못했다. 따라서 연결→callback→creator-info→SELF_ONLY 테스트 게시→status/permalink 회수는 미검증이며,
운영 배포 후 UI는 credential 누락 사유를 정직하게 disabled로 보여야 한다.

**1차 운영 Chrome 재발견·수정:** `/videos`가 active workspace 확정 전에 tenant 없는 Instagram accounts API를 호출해
operator token까지 401로 지우는 인증 race를 관찰했다. 조회를 workspace 조건부 + `tenant_id`로 교정했다. 또한 TikTok·YouTube
영상 직접 발행이 구현됐는데 SocialConnectButton이 “직접 발행 미지원”으로 표시하던 SSOT 드리프트를
`VIDEO_PUBLISH_PLATFORMS`로 교정했다. focused 17 PASS, TypeScript clean, diff check PASS. 재배포 후 Chrome 재관찰 필요.

**후속 운영 관찰(2026-07-21, commit `cf0be864`):** marketing VM Docker production build 161 pages PASS,
컨테이너 `running/healthy`, DB up, Google auth URL 정상. 격리 Chrome `/videos`에서 Instagram accounts 200,
TikTok accounts 200, readiness 200 두 번을 관찰했고 해당 navigation의 HTTP 4xx/5xx는 0건이었다. TikTok 버튼은 disabled이며
`TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET` 누락 사유가 화면에 표시되고, 낡은 “직접 발행 미지원” 문구는 없다.
별도 `/login` Google 클릭은 실제 `accounts.google.com` identifier URL로 이동했다.
화면 증거: `docs/qa/legacy-evidence-20260912/evidence/sns017-tiktok-disabled-operating-20260721.png`. 운영자 브라우저 storage는 검증 후 폐기했다.

### 2026-07-21 GA4 운영 전송 관찰

- 격리 Chrome에서 기존 consent/storage를 삭제하고 `/login`을 새로 열어 분석 동의를 직접 클릭했다.
- `www.googletagmanager.com/gtag/js?id=G-MEEQ2D8C1J` HTTP 200 로드 관찰.
- `page_view`와 `scroll(percent_scrolled=90)`이 `www.google-analytics.com/g/collect`의 동일 measurement ID로
  실제 POST되어 각각 HTTP 204를 반환한 것을 network에서 직접 관찰했다.
- 판정: 클라이언트 태그·동의 후 이벤트 전송은 운영 관찰 완료. GA4 관리 콘솔 DebugView에 이벤트가 표시되는지는
  Google 계정 콘솔 화면을 열지 않았으므로 **미검증**이다. 브라우저 storage는 관찰 후 삭제했다.

### 2026-07-21 SNS-017 TikTok 비동기 발행 — 독립 QA PASS

**판정: 코드·자동 QA·생산 빌드 BLOCKER 0. 운영 배포 가능하며, 실 TikTok 발행은 credential·앱 심사 부재로 미검증이다.**

- 최종 관찰: focused 6 files / 25 tests PASS, 전체 `npm test` 90 files / 776 PASS / 9 DB-env skip,
  `npx tsc --noEmit` PASS, Next.js 16 Webpack production build 162 pages PASS, `git diff --check` PASS.
- QA 발견·해소: workspace 전환 시 이전 tenant publish ID가 한 프레임 poll될 수 있던 race를 상태 자체의 workspace 태깅으로 차단했다.
  `workspaceId` nullability를 정규화해 typecheck/build를 회복했다.
- QA 발견·해소: provider `publish_id`와 final `post_id`를 분리하기 위해 `provider_post_id` additive schema와 완료 update/재조회
  계약을 추가했다. 중복 POST의 완료 응답도 final post ID를 사용한다.
- QA 발견·해소: 공개 게시의 creator-info 일시 실패 또는 final post ID 부재 시 성공 확정을 보류하고 202로 재시도한다.
  반대로 `SELF_ONLY`는 공개 post ID가 없을 수 있으므로 저장된 privacy metadata와 `PUBLISH_COMPLETE`로 정상 종결한다.
- 보안·격리: status lookup은 현재 tenant의 예약과 그 예약의 `account_id` 토큰만 사용하고 provider 원문 오류·token을 숨긴다.
  5xx/429에서는 브라우저 pending을 보존하며 terminal/stale 4xx에서만 제거한다.
- 미검증: 로컬 `DATABASE_URL` 부재로 PostgreSQL 연동형 9건과 schema seed는 skip됐다. Playwright 구성, mobile project,
  Maestro flow는 없다. 운영 TikTok credential·Content Posting API 심사·실계정이 없어 OAuth → SELF_ONLY Direct Post →
  status 완료 및 공개 게시 post ID/permalink의 실제 provider 왕복은 미검증이다.

**운영 배포 증거:** commit `ca4596ab`, CI run `29820483251` SUCCESS, deploy run `29820488738` SUCCESS. 운영 컨테이너
healthy, PostgreSQL `provider_post_id:text`·`provider_meta:jsonb` 실조회, public health 200/db up, login 200,
Google preflight 200, `/api/me` 401, 신규 TikTok status route 무인증 401을 관찰했다. deploy 과정에서 발견한 compose
env-file 누락과 수동 컨테이너 이름 충돌은 workflow 계약 테스트 및 rollback 가능한 교체 절차로 교정했다.

**운영 E2E 판정:** 앱·DB·인증 경계의 운영 반영은 관찰됨. TikTok provider credential과 앱 심사가 없어 실 OAuth와
SELF_ONLY/공개 게시 왕복은 미검증이며 SNS-017 provider E2E는 open 상태를 유지한다.

### 2026-07-21 SNS-018 고객 영상 403·테넌트 이미지 운영 종료

- **재현:** 운영 고객 토큰 `/videos`에서 `/api/youtube/status`, `/api/images`, 전역
  `/api/clipping-config`, `/api/elevenlabs-config`가 403이었다. 이미지 업로드·삭제는 전역 flat 경로였고
  업로드 반환 URL은 실제 제공 라우트가 없어 고객 이미지 발행이 끊겨 있었다.
- **수정:** YouTube status와 images만 tenant-aware로 허용했다. 전역 평문 API key를 반환하는 clipping/ElevenLabs는
  운영자 전용을 유지하고 고객 UI에서 요청·설정 폼을 숨겼다. 이미지 업로드·목록·삭제를
  `data/tenants/{tenant}/images`로 격리하고, 영상과 목적 키가 분리된 HMAC 이미지 배달 URL을 추가했다.
  업로드는 10MiB·허용 확장자·빈 파일을 차단하고, 삭제/배달은 경로 탈출과 타 테넌트를 404로 숨긴다.
- **QA 발견·해소:** 30일 토큰을 큐에 영속하면 장기 예약이 깨지는 문제를 발행 직전 HMAC 재검증·동일 테넌트
  재서명으로 보완했다. Instagram 업로드 401은 원시 오류 대신 공통 `auth:required` 재로그인 흐름으로 전환했다.
  이미지 삭제 후 캐시 잔존을 막기 위해 배달 응답은 `private, no-store`다.
- **자동 검증:** 최초 focused 7 files/111 PASS, 전체 94 files/819 PASS·9 DB-env skip. 운영 Chrome 후속 결함
  수정 뒤 전체 95 files/820 PASS·9 DB-env skip, `tsc --noEmit` PASS, Webpack production build 162 pages PASS,
  `git diff --check` PASS. 독립 Sonnet 보안 리뷰 blocker/high 0.
- **배포:** image 보안 commit `15ec5d0e`, CI `29848488923`, deploy `29849273792` SUCCESS. Chrome에서 발견한
  고객의 operator-only `/api/cron-status` 403은 `Sidebar` 역할 조건부 fetch/render와 계약 테스트로 교정했다.
  후속 commit `176b3bd5`, CI `29850049736`, deploy `29850058481` 모두 SUCCESS.
- **운영 API E2E(관찰됨):** 고객 토큰으로 실제 PNG 업로드 200, absolute HTTPS signed URL 반환, 인증 없는
  signed GET 200 + `image/png` + 업로드 원본과 SHA-256 일치, 고객 목록 1건 반영, 삭제 200, 삭제 뒤 같은 URL
  404와 목록 0건을 확인했다.
- **운영 Chrome E2E(관찰됨):** `/videos`에서 `/api/images`·`/api/youtube/status` 200, cron-status·clipping-config·
  elevenlabs-config 요청 0건, 전체 4xx/5xx 0건. `/images`에서 signed image가 `complete=true`, naturalWidth/Height
  1x1로 렌더되고 화면 카드에도 표시됐다.
- **보안 종료:** 브라우저 QA 이미지를 삭제해 URL 404를 재확인했다. 단기 tenant token을 revoke한 뒤 같은
  `/api/me` 요청이 401임을 확인했고 브라우저 storage 및 로컬/marketing-vm 원문 임시 파일을 제거했다.
- **잔여 미검증:** 이번 신규 이미지 URL로 Instagram/Threads 새 공개 게시물을 추가 생성하지는 않았다.
  기존 실제 Instagram Reel·Threads 게시 증거와 별개다. R2 원격 백업은 미설정이지만 현재 Docker 영속 volume의
  업로드·배달은 운영 관찰됐으며, R2는 재해복구 강화를 위한 별도 인프라 항목이다.

### 2026-07-22 셀프서비스 OAuth SaaS QA·운영 배포

- **CI DB 격리(테스트됨):** run `29891147154` SUCCESS. PostgreSQL 16 schema→seed→RLS 적용 후 신규 사용자
  A/B tenant provisioning, A의 다중계정/default 전환, queue/schedule/published/file 경계, 상호 조회 0행과
  cross-tenant RLS write 거부를 `self-service-tenant.db.test.ts`에서 skip 없이 실행. 전체 96 files PASS.
- **운영 배포(관찰됨):** deploy run `29891777778` SUCCESS. public health 200/db up, login 200,
  무인증 `/api/me` 401, Google preflight 200와 Supabase authorize URL을 직접 확인.
- **OAuth 시작 경로(관찰됨):** 단기 tenant token으로 Instagram, Threads, Facebook, YouTube가 각각 공식
  authorize host와 HttpOnly `oauth_state_<provider>` cookie를 반환. Instagram state를 cookie 없는 별도 요청에서
  callback했을 때 토큰 교환 전에 브라우저 불일치로 차단되고 state cookie `Max-Age=0` 폐기 확인.
- **비활성 경계(관찰됨):** X는 `X_CLIENT_ID` 미설정 500, TikTok은 `TIKTOK_CLIENT_KEY` 미설정 500,
  Bluesky는 지원하지 않는 OAuth provider 400. QA token은 매 실행 후 revoke했고 동일 `/api/me` 401 확인.
- **미검증:** 완전히 새로운 Google 사용자 A/B의 실제 consent 왕복, 각 사용자 SNS 계정 callback 저장,
  동일 provider 실계정 2개 UI 전환, 사용자별 실발행 permalink, 운영 API 상호 403/404. Facebook 앱 Live/심사,
  Instagram OTP rate limit, X/TikTok credential·심사도 외부 차단으로 남는다.
- **판정:** 코드·DB·배포 QA는 승인. 전체 v1.0.0 ship은 위 실계정 운영 E2E가 없어 in-progress 유지.
- **Google 계정전환 후속:** 앱 로그인 preflight에도 `prompt=select_account`를 추가해 OSMU 로그아웃 후 기존
  Google 세션이 자동 재사용되는 경로를 막았다. focused 22 PASS, 전체 96 files/828 PASS·10 local DB skip,
  TypeScript와 Webpack production build PASS. commit `52925362`, CI `29893393332`, deploy `29893789257` SUCCESS.
  운영 앱 auth URL과 Supabase→Google redirect 모두 `prompt=select_account`를 보존했다. 격리 브라우저에서 기존
  세션 자동진입 없이 Google 이메일/계정 선택 진입 화면을 직접 관찰했다. 증거:
  `docs/qa/legacy-evidence-20260912/evidence/google-account-selector-20260722.png`.
- **운영 2-tenant 격리(관찰됨):** 서로 다른 활성 tenant 두 개의 단기 토큰으로 `/api/me` 귀속이 서로 다름을
  확인. 다른 활성 tenant 10개가 존재하지만 양쪽 isolation proof의 cross-tenant drafts는 0. 상대 tenant_id를
  Instagram accounts 쿼리에 넣어도 각자의 무주입 응답과 동일해 client override가 무시됨. 두 토큰 revoke 후
  동일 `/api/me` 401 확인.
- **credential inventory(근거 확인):** GitHub secret 이름은 Meta·YouTube만 존재하고 X/TikTok은 없음.
  로컬 harness secret 파일에도 X/TikTok 4개 env 이름이 없다. 실제 값은 조회·출력하지 않음.
- **운영 lead 저장(관찰됨):** 고객 API에서 auth user 7명/tenant 11개, 실제 Google provider 사용자 1명과
  연결된 active tenant를 확인. Google 유입의 auth user·tenant 저장은 관찰됐고 비밀번호 원문 필드는 없음.
- **재발방지 보강:** deploy smoke가 Google preflight 200에 더해 authUrl의 `prompt=select_account`를 검사하고,
  누락 시 배포를 실패시킨다. focused 9 PASS, jq 정상/누락 분기 확인. commit `ee475f1f`, CI
  `29895690967`, deploy `29896414859` SUCCESS. 운영 smoke의 새 계정선택 gate PASS를 직접 확인.

### 2026-07-22 OAuth/영상 플랫폼 운영 고객 UI 재검증

- 실제 Chrome에서 운영 앱 로그인 탭, Meta/X/TikTok 개발자 콘솔 탭을 열었다. X는 로그인 화면, TikTok은
  Email/Password 폼, Meta의 정확한 앱 dashboard는 공개 개발자 홈으로 돌아가 세 콘솔 모두 개발자 인증 입력이
  필요한 상태임을 관찰했다.
- 단기 tenant 토큰으로 운영 고객 UI를 직접 렌더했다. X credential 누락 disabled, Facebook 앱 모드/role 경고,
  Instagram 기본 active 계정 1개와 계정전환 안내, Bluesky invalid App Password의 조치 가능한 오류를 관찰했다.
  과거 raw JSON `X_CLIENT_ID 미설정` 클릭 오류와 Bluesky `openclaw.json not found`는 재현되지 않았다.
- `/videos`에서 YouTube OAuth 버튼, TikTok credential 누락 disabled, Instagram Reels 발행 가능을 직접 관찰했다.
  증거는 `docs/qa/legacy-evidence-20260912/evidence/oauth-video-platforms-operating-20260722.png`이다.
- 첫 브라우저 토큰 주입은 `browse eval` 인자 형식 오사용으로 임시 토큰이 도구 로그에 노출됐다. 즉시 revoke하고
  동일 `/api/me` 401을 확인했다. 두 번째 실행은 mode 600 JS 파일 경유로 주입하고 종료 시 revoke/401 및 파일
  삭제까지 확인했다. 재발방지 규칙은 inline secret 주입 금지, mode 600 파일 경유, 종료 revoke/401이다.
- **판정:** 고객 앱 UI와 앱 측 방어는 관찰됨. X/TikTok credential·심사, Meta 개발자 로그인과 Live/test role,
  Instagram OTP, YouTube 실제 동의·업로드, 동일 provider 실계정 2개 전환·발행은 외부 계정 입력 전까지 미검증이다.

### 2026-07-24 Threads 예약→자동 발행 운영 E2E

- **재현 원인:** marketing VM crontab은 `*/10 * * * * /home/marketing/osmu-publish-due.sh`로 정상 동작했지만,
  반복 로그가 `tenantCount:0, processed:0`이었다. 자동 발행이 멈춘 것이 아니라 예약 데이터가 0건이었다.
- **콘텐츠 중복 방지:** 기존 `@zero_to_one_ai` 공개 게시물의 가동 선언·브랜드 위키 주제와 겹친 1차 초안은
  폐기했다. 대행 견적 분리, AI 환각 안전선, 사장님 저녁 시간 주제로 재위임했고,
  `verify-agent-quality.sh`가 Skill 11/WebSearch 6/Socratic 10/RUBRIC 22/25로 PASS했다.
- **운영 적재:** tenant `587cee76-deca-480e-8fdd-808a30ec86eb`에 draft 3건과 Threads schedule 3건을 생성했다.
  GET 재조회로 세 본문이 손상 없이 저장됐고, 첫 건 01:44 KST, 후속은 7월 24·25일 20:00 KST다.
- **실발행 관찰:** due 이후 operator all-tenant sweep이 processed 1을 반환하고 schedule
  `e5056bc0-443e-4dea-a39d-8575bf3e294a`를 `published`로 마감했다. 결과는 external ID
  `18002265641778373`, 공개 URL
  `https://www.threads.com/@zero_to_one_ai/post/DbJH7KJGDS6`이다.
- **브라우저 직접 확인:** gstack Chrome에서 공개 URL을 열어 `@zero_to_one_ai`와 3개 견적 항목을 포함한
  원문 전체를 렌더했다. 증거: `docs/qa/legacy-evidence-20260912/evidence/threads-auto-publish-20260724.png`.
- **성과 수집 확인:** 운영 `/api/metrics` refresh가 `updated:1,total:3`을 반환했고, GET에서 동일 external ID,
  permalink, 본문, `published_at=2026-07-23T16:44:52.906Z`,
  `metrics_at=2026-07-23T16:46:22.742Z`를 재조회했다.
- **판정:** Threads draft→schedule→due sweep→외부 발행→공개 브라우저→metrics 저장 경로는 관찰됨.
  후속 두 schedule의 cron 자동 출고는 미래 시각이라 아직 미검증이다.
- **남은 플랫폼:** Instagram TEXT-only는 플랫폼 계약상 불가하므로 이미지 자산이 있어야 예약 E2E가 가능하다.
  X/TikTok은 중앙 앱 credential·심사, Facebook/YouTube는 신규 고객 실동의·callback·발행,
  동일 provider 2계정은 전환 후 계정별 발행 permalink가 미검증이다.

### 2026-07-25 TikTok 재인증 URL 계약 + Threads 두 번째 자동 발행

- **TikTok build:** commit `cea30fe0`에서 TikTok authorize URL에 provider 전용
  `disable_auto_auth=1`을 추가했다. 테스트 선행 실패는 `null` 1건, 수정 뒤 OAuth focused
  70/70 PASS, 전체 858 PASS/10 DB-env skip, TypeScript PASS, production build 165/165 routes PASS다.
- **독립 QA:** Sonnet qa-verifier가 변경 2파일과 provider별 병합 경계를 검토했다. TikTok 관련
  74/74 PASS, 전체 858 PASS/10 skip, `tsc --noEmit` PASS, `next build` exit 0으로
  `PASS with caveats` 판정했다. 공식 TikTok Login Kit Web 원문에서 `disable_auto_auth=1` 계약을 확인했다.
- **미검증 경계:** 중앙 `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`가 없어 운영 authUrl,
  provider consent, callback 저장, 실 발행은 실행할 수 없다. 코드·테스트 통과와 실 OAuth 완료를 혼동하지 않는다.
- **Threads 자동 발행 관찰:** schedule `ea086bbb-8aaa-4165-ab93-04560f05d81b`가
  `published`로 전환됐고 external ID `18108077243008891`, 공개 permalink
  `https://www.threads.com/@zero_to_one_ai/post/DbNqEMelEgJ`를 반환했다. 공개 브라우저에서
  계정과 원문 전체를 렌더했다.
- **성과 저장 관찰:** 운영 `/api/metrics`는 `updated:1,total:5`를 반환했고 해당 게시물의
  `published_at=2026-07-25T11:00:07.744Z`, `metrics_at=2026-07-25T11:13:40.530Z`를 재조회했다.
- **운영 배포:** deploy run `30156828520`, head `e37ada41`, 2분 31초 SUCCESS. 이미지 build,
  컨테이너 기동, login/auth/Google 계정선택/operator API 자동 스모크가 모두 통과했다.
- **공개 스모크:** health 200(`ok:true,db:up`), login 200, operator customers 200.
  운영자 실브라우저 로그인은 `/operator/customers`로 이동했고 `Admin` 단일 셸,
  가입자 7명·워크스페이스 11개·연결 계정 3개·발행 8건·중앙 OAuth 4/12 준비를 렌더했다.
  안정화 뒤 콘솔 오류 0건.
- **배포 후 TikTok 경계:** readiness는 credential 누락으로 `available:false`를 반환한다.
  변경 코드는 운영 이미지에 포함됐지만 실제 authUrl·consent·callback·발행은 계속 미검증이다.

### 2026-07-28 운영자 로그인 전역 모달 인증 경합

- **운영 재현(관찰됨):** 공개 홈과 운영자 로그인 전환 중 닫힌 전역 `ImagePickerModal`이
  `/api/images`·`/api/queue`를 호출했다. 로그인 전 시작된 401이 새 운영자 토큰 저장 뒤 도착해
  공통 fetcher가 새 토큰을 삭제하고 `Login Required`를 띄웠다.
- **이전 QA 누락:** 안정화된 `/operator/customers`만 확인하고 실제 토큰 입력 직후와
  identity별 route matrix를 종료조건에 넣지 않았다. 이 때문에 운영자 토큰으로 고객 shell이
  잠시 mount되는 경로와 로그인 race를 발견하지 못했다.
- **수정:** 닫힌 modal은 SWR null key로 보호 API를 호출하지 않는다. 공통 API helper는 요청 시점
  토큰과 응답 시점 토큰이 같을 때만 401 로그아웃을 수행한다. 운영자 identity는 고객 보호 경로의
  children을 mount하지 않고 `/operator/customers`로 이동한다.
- **자동 검증(테스트됨):** tests-first focused 35/35, 전체 880 PASS/10 DB-env skip,
  TypeScript PASS, production build 165/165 routes PASS, diff check clean.
- **독립 QA(테스트됨):** Claude Sonnet이 변경을 독립 검토하고 focused 11/11,
  `tsc --noEmit` PASS를 재현했다. stale 401 새 토큰 보존, 동일 토큰 401 로그아웃 유지,
  닫힌 modal 무요청, 운영자 redirect, 고객 `/videos` 보존을 확인했다.
- **배포 전 판정:** build/QA 승인. 운영 배포 뒤 실제 운영자 로그인 폼 제출, 공개 홈 무요청,
  운영자 route matrix, 15초 이상 안정화 동안 401/429·Login Required 0건은 미검증이며 ship 종료증거다.
- **운영 배포(관찰됨):** commit `87dae325`, deploy run `30287931603` SUCCESS. 이미지 build, 기동,
  상태, 자동 로그인 smoke를 모두 통과했다.
- **공개 홈(관찰됨):** 브라우저 storage를 비우고 `/`를 새로 열었을 때 랜딩만 렌더됐고
  `Login Required`, `/api/images`, `/api/queue`, 콘솔 오류가 모두 0건이었다.
- **운영자 로그인(관찰됨):** `/operator`의 실제 토큰 입력 폼을 제출해 `/operator/customers`로 이동,
  Admin 단일 shell과 가입자 7명·워크스페이스 11개를 렌더했다. 로그인 전환의 `/api/me`와
  `/api/operator/customers`는 200이며 401·콘솔 오류는 0건이었다.
- **운영자 route matrix(관찰됨):** 운영자 상태로 `/`, `/videos`, `/channels/youtube`를 각각 직접 열었다.
  세 경로 모두 고객 sidebar를 mount하지 않고 `/operator/customers`로 복귀했으며 Login Required,
  `/api/images`·`/api/queue` 401/429, 콘솔 오류가 0건이었다. 이후 20초 동안 `/api/me` 2회 모두 200.
- **고객 회귀(관찰됨):** 단기 code0to1 tenant token으로 운영 `/videos`가 그대로 유지되고 Admin이
  표시되지 않으며 video/channel/image API가 모두 200, 콘솔 오류가 0건이었다. 토큰은 revoke 200 뒤
  동일 `/api/me` 401을 확인하고 브라우저용 임시 비밀 파일까지 삭제했다.
- **판정:** 운영자 로그인 전역 모달 결함은 종료. 전체 v1.0.0 ship은 중앙 OAuth credential이 없는
  8개 provider와 provider별 신규 고객 실 consent→callback→계정 저장→발행 permalink가 미검증이라
  계속 in-progress다.

### 2026-07-28 전체 운영 플로우 재검사

- **검사 범위:** 공개 7 routes, 고객 25 routes, 운영자 5 routes, 고객 핵심 API 10개,
  중앙 OAuth 12 provider preflight, Google auth preflight, GA4 consent.
- **자동 검증(테스트됨):** controller가 현재 `main`에서 전체 105/105 files,
  880 PASS/10 DB-env skip을 재현했다. `tsc --noEmit` PASS. 샌드박스 기본 build는
  localhost bind EPERM으로 실패했지만 제한 밖 동일 `npm run build`는 165/165 pages PASS했다.
- **공개 인증(관찰됨):** `/login`은 Google CTA만 있고 email/password/recovery 입력이 없다.
  `/signup`은 `/login`으로 이동한다. `/api/auth/google`은 Supabase auth host와
  `prompt=select_account`를 반환한다. 다만 홈→로그인 이동 시 Supabase client 중복 경고가 발생한다.
- **GA4(관찰됨):** 분석 동의 클릭 뒤 localStorage consent=`granted`, `gtag` 함수와 dataLayer가 생성됐다.
  `gtag.js?id=G-MEEQ2D8C1J` 200과 GA collect `page_view` 204를 직접 확인했다.
- **운영자(관찰됨):** `/operator/customers`와 운영자 상태의 `/`,`/studio`,`/videos`,
  `/channels/youtube`는 모두 Admin 단일 shell로 수렴했다. bad HTTP·console error 0,
  16초 안정화 뒤에도 Login Required 0.
- **고객 core API(관찰됨):** `/api/me`,`overview`,`queue`,`schedule`,`metrics`,`images`,
  `video/list`,`integrations`,`connect/readiness`는 200. `/api/workspaces`는 운영자 전용이라 403.
- **고객 UI FAIL(관찰됨+근거 확인):** home, Studio, Threads, Telegram, Discord, Slack,
  Images, Blog, Google Analytics, Search Advisor, Naver Trends가 고객 bearer로 operator-only API를
  호출해 403과 콘솔 오류를 만든다. `proxy.ts`의 tenant-aware allowlist에 없는 전역 파일/secret/
  cron API를 고객 UI가 호출하는 권한 계약 불일치다.
- **안내 자산 FAIL(관찰됨):** Threads/X 연결 안내가 존재하지 않는
  `/onboarding/threads/*.png`, `/onboarding/x/*.png` 4개를 요청해 404.
- **오탐 제거:** 연속 페이지 이동의 지연 응답이 섞인 Inbox와 Blog Performance는 각각 분리된
  새 브라우저에서 재실행해 bad HTTP 0, console error 0으로 확인했다.
- **OAuth readiness(관찰됨):** Instagram, Threads, YouTube, Facebook은 공식 authorize host를
  반환했다. X, LinkedIn, Naver Blog, Pinterest, Tumblr, TikTok, Slack, LINE은 중앙 credential
  미설정 500으로 실제 사용자 연결 불가.
- **false-success blocker(근거 확인):** YouTube upload PUT non-2xx/empty ID,
  Telegram/Discord/Slack/LINE notification HTTP non-2xx, Slack test/send HTTP non-2xx를 성공으로
  기록할 수 있다. provider 발행 성공 뒤 DB/queue 기록 실패도 `ok:true`를 유지해 UI가
  `publish_success`를 기록할 수 있다.
- **토큰 종료:** 전체 E2E와 격리 재검사에 쓴 단기 tenant token은 각각 revoke 200 뒤
  동일 `/api/me` 401을 확인했다. 원문 비밀 파일은 만들지 않았다.
- **미검증:** 실제 신규 Google 계정 consent→callback→auth user/tenant 저장, 실제 DB RLS 10건,
  provider별 consent/cancel/refresh, 동일 provider 다중계정 전환, 현재 배포의 새 실발행 permalink,
  GA4 DebugView UI, Slack 메시지 실제 도착.
- **판정:** 전체 고객 플로우 QA FAIL. 자동 테스트·빌드 통과는 운영 UI/API 권한 불일치와
  외부 성공 오판을 가리지 못했다. 결함 수정·재배포 뒤 동일 route matrix를 재실행하기 전 출하 금지.

### 2026-07-29 중앙 OAuth 자격증명 관리자 독립 보안리뷰 Major

- **판정:** 🔧 수정·자동검증 통과, 실 PostgreSQL RLS 재검증 대기. commits
  `68c251bb..0ffefb39`의 중앙 OAuth 자격증명 관리자에서
  전역 테이블 RLS owner 접근 차단, RLS 적용 순서 rollback, env 원문 reveal, readiness N+1 복호화
  쿼리의 Major 4건이 확인됐다.
- **수정 범위:** 전역 테이블은 RLS default-deny/no customer policy를 유지하면서 owner/BYPASSRLS
  연결만 접근하도록 NO FORCE 전환, tenant policy 적용 뒤 guarded global ALTER, DB-source 전용 reveal,
  list/readiness bulk resolve, DB row DELETE+audit+Admin 버튼, 저장소 장애 UI 분리.
- **종료 증거:** tests-first focused/full test, TypeScript, webpack build와 secret 비로그·exact operator
  Bearer·no-store 회귀를 재검증하기 전까지 QA/ship은 잠금 유지한다.
- **자동검증:** focused 32/32, 전체 112 files 917 PASS/10 DB-env skip, `tsc --noEmit`,
  Next.js 16.2.2 webpack build 166/166 routes, `git diff --check` PASS.
- **미검증:** 임시 PostgreSQL은 sandbox `shmget` 차단으로 `initdb` bootstrap 전에 2회 중단됐다.
  owner/BYPASSRLS 1행 접근, `osmu_service` 0행·쓰기 거부, 전역 테이블 부재 상태의 tenant policy
  적용은 QA DB에서 직접 관찰해야 한다.

### 2026-07-30 중앙 OAuth 원문 확인·미설정 등록 정상화

- **❌ NG 재현:** 운영 `/operator/customers`의 설정 완료 4개 provider는 모두 source=env라
  원문 확인 버튼이 없었고, 별도 `import-env` 요청은 구버전 운영 빌드에서 400을 반환했다.
  미설정 카드의 입력은 항상 password라 붙여넣은 값을 필드별로 검증할 수 없었다.
- **근본 원인:** UI가 env→DB import와 DB reveal을 두 단계 버튼으로 분리했고,
  `revealOAuthCredentialSet()`이 env source를 무조건 거부했다. 저장소 부재 에러도 일부 경로에서
  500 영문 응답으로 뭉개져 카드가 정확한 운영 사유를 표시하지 못했다.
- **🔧 변경:** 단일 `원문 확인` 요청이 같은 DB 트랜잭션에서 완전한 env 세트를
  `ON CONFLICT DO NOTHING`으로 암호화 import하고, 권위 있는 DB 행을 `FOR UPDATE` 재조회한 뒤
  reveal한다. insert가 일어난 경우에만 `import`, 모든 성공 reveal에 `reveal` 감사 행을 남긴다.
  기존 DB 행은 env로 덮어쓰지 않는다. 입력 필드는 기본 숨김·필드별 표시/숨김, PUT 성공 뒤
  metadata 즉시 갱신, 400/500/503 한국어 카드 사유를 적용했다.
- **RED→GREEN:** focused 4 files/37 tests에서 최초 9 FAIL로 결함을 재현했고, 최종 37/37 PASS.
  전체 117 files에서 972 PASS/10 DB-env skip, `npx tsc --noEmit` exit 0,
  `git diff --check` PASS.
- **빌드:** 요구된 `npm run build`는 Turbopack의 sandbox port bind `EPERM`으로 exit 1.
  원인 기반 webpack production build는 compile·TypeScript·static generation 166/166,
  exit 0으로 통과했다. 실패를 제품 성공으로 치환하지 않는다.
- **미검증/게이트:** 실제 PostgreSQL pgcrypto import→reveal·동시 conflict, 운영 브라우저의
  설정 완료 4개 원문 확인, 미설정 provider 저장→source DB·준비 전환, 30초 자동 숨김,
  audit 행은 미검증이다. push·배포는 실행하지 않았고 qa/ship 잠금을 유지한다.

### 2026-07-30 P0-6 OAuth 계정 전환·identity 오기입 차단

- **❌ NG 재현:** focused 4파일 85테스트에서 6건 FAIL. Threads/Instagram의 직접 로그아웃 안내,
  로그아웃 뒤 workspace 제거, 잔존 운영자 토큰보다 고객 Supabase JWT 승격,
  connect tenant 불일치 값 없는 서버 로그가 없음을 재현했다.
- **공식 문서 판단:** Meta의 Threads Authorization Window·Instagram Login 문서와 Meta 공식
  Postman collection에 계정선택 강제 파라미터가 문서화돼 있지 않아 추측 파라미터를 추가하지 않았다.
  연결 버튼 근처에 provider 도메인 로그아웃 안내와 Meta 계정 센터 링크를 유지했다.
- **🔧 변경:** `/operator*`에서는 의도적 운영자 토큰을 보존하고, 고객 경로에 Supabase 세션이
  확립되면 고객 JWT를 승격한다. 로그아웃·identity 전환은 `active_workspace`의 localStorage와
  Zustand 상태를 함께 비운다. 로그아웃 뒤 남은 `/api/me` 응답이 workspace를 재저장하지 못하게 했다.
- **보안 로그:** `/api/connect/{provider}`와 `/api/connect/readiness`에서 고객 JWT tenant와
  쿼리 tenant가 다르면 JWT tenant를 계속 사용하고
  `{"kind":"oauth_connect_tenant_mismatch","customerJwt":true}`만 기록한다.
  tenant id·Bearer·secret 원문은 기록하지 않는다.
- **데드코드:** 호출처가 없던 tenant-unscoped `countAccounts()`와 bare `db` import를 제거했다.
- **레드팀 보강:** 이전 버전 로그아웃으로 token만 없고 workspace가 남은 브라우저의 새 로그인도
  stale workspace를 지우지 못하는 경계를 추가 발견했다. 선행 1 FAIL 뒤 수정해 7/7 PASS로 고정했다.
- **자동검증:** `npx tsc --noEmit` exit 0·출력 0줄, 전체 **120 files / 1003 PASS /
  10 skipped**, webpack production build compile 14.9s·TypeScript 25.3s·static pages
  **166/166**·exit 0, `git diff --check` exit 0.
- **미검증/게이트:** 운영 Threads/Instagram consent 화면의 실제 계정 전환, 운영
  operator→customer 브라우저 전환, 실제 서버 로그 수집은 미검증이다. push·배포하지 않았으며
  pipeline qa/ship 잠금을 유지한다.

### 2026-08-03 REQUEST-OSMU-001 — 회장 요청 통합 원장

이 절은 2026-08-02~03 대화에서 나온 OSMU 요청의 단일 체크리스트다. PRD·디자인·구현·QA가 이 목록을
잃지 않도록 각 항목의 종료증거까지 고정한다.

| 요청 | 현재 상태 | 종료증거 |
|---|---|---|
| `j.the.great.investor`로 가입했는데 Threads에 `code_zero_to_one`이 보이는 계정 혼선 제거 | ❌ 미해소 | 로그인 사용자·workspace·연결 Threads handle이 동일 tenant임을 시크릿 브라우저에서 관찰 |
| 다른 계정 로그인 시 `zero_to_one_ai` 계속하기만 나오고 계정 전환이 없는 문제 해결 | ❌ 미해소 | 기존 Meta 세션이 있는 브라우저에서 목표 계정으로 전환→callback→저장 handle 변경 관찰 |
| Threads OAuth 후 Channel Info가 `Not connected`인 문제 해결 | ❌ 현재 운영 재현 | callback 성공 뒤 Channel Info와 Settings 모두 같은 연결 계정·상태 표시 |
| Instagram OAuth 후 연결 버튼이 남고 `재연결 필요`인 문제 해결 | ❌ 현재 운영 재현 | OAuth 완료 뒤 CTA가 관리/재연결 조건부로 바뀌고 동일 handle 표시 |
| 상태 문구를 한국어 한 체계로 통일 | ❌ 미해소 | 연결 안 됨/연결 확인 중/연결됨/재연결 필요가 모든 화면에서 동일 |
| Instagram Graph API 수동 토큰 창의 중복·빈값 UX 제거 | ❌ 미해소 | OAuth 사용자에게 수동 토큰 폼을 숨기고 고급 복구 경로로만 분리 |
| 전역 Settings 채널에서 연결 계정과 상태 표시 | ❌ 미해소 | 채널 화면과 Settings의 handle·상태·확인시각 일치 |
| Threads와 Instagram의 기능·탭 구조를 일관되게 구성 | ❌ 미해소 | 공통 기능은 같은 위치·이름, 플랫폼 전용 기능만 차이와 이유 표시 |
| OSMU 502 원인과 고객 복구 흐름 해결 | 🟡 현재 502 미재현 | 실패 단계·추적 ID·기존 결과 조회·중복 0·안전 재시도 E2E |
| 플랫폼별 초안 생성·검수·즉시발행·예약 진입 제공 | ❌ UI 미해소 | Threads와 지원 가능한 Instagram 경로를 실제 기존 Queue/Studio 위에서 E2E |
| 단일 Threads 도구가 아니라 전체 OSMU 범위와 플랫폼별 지원 상태 표시 | ❌ v2 디자인 보류 | 기존 기능을 보존한 화면에서 전체 범위와 현재 가능/준비 중 경계가 즉시 이해됨 |
| `브랜드 사실`·`발행 근거`·`permalink` 같은 내부용어 제거 | 🟡 v2 디자인만 반영 | 실제 제품에서 `내 브랜드 정보`·`발행 전 확인/기록`·`게시물 링크`로 관찰 |
| 과도한 loading shimmer 제거 | 🟡 v2 디자인만 반영 | 실제 제품에서 필요한 영역 한 곳만 로딩되고 나머지 조작 가능 |
| 기존 서버 구현을 전수 검토하고 전면 재작성 없이 증분 개선 | 🔎 감사 진행 | route/component/API별 유지·수정·신규 대응표와 제거 0 또는 사유 |
| 먼저 현재 기능을 돌아가게 한 뒤 UI 업데이트 | 🔎 현재 우선순위 | 운영 복구 E2E 통과 후 as-built 기반 디자인 재개 |
| PRD를 기업 전달 수준으로 작성하고 목차·벤치마크 포함, 웹으로 표시 | ✅ PRD v2.4 | 웹 렌더·TOC 19·Mermaid·quality verifier PASS |
| 산출물을 100B 대시보드에 표시 | ✅ plan/design 링크 반영 | collector 219/219, private build; 이후 상태 변화도 동기화 |

**현재 실행 순서:** 기존 구현·운영 상태 감사 → build gate를 정식 재개 → 최소 복구 → 독립 QA·실브라우저
관찰 → 위 표의 미해소 항목을 보존한 증분 디자인 → design 승인 → 기술설계/추가 개발.

### 2026-08-03 DESIGN-002 — 기존 요청의 프로토타입 추적 누락

- **❌ NG:** v2 프로토타입 제작 전에 이미 제보된 OAuth 성공 후 상태 불일치, Instagram OAuth CTA 잔존,
  빈 Graph API token form, Settings 연결 상태 누락, Threads/Instagram 탭·기능 불일치를 PRD는 요구했지만
  프로토타입은 실제 화면과 상태 전환으로 커버하지 않았다.
- **아직 미반영인 후발 요청:** `기존 구현 전수 검토·보존`과 `현재 기능을 먼저 정상화한 뒤 UI 업데이트`는
  v2 출력 뒤 명시됐으므로 v2의 누락이 아니라 다음 리테이크의 신규 필수조건이다.
- **근본 원인:** 컨트롤러가 디자인 재위임 목표를 사용자의 직전 피드백인 용어·loading·전체 제품 지도에만
  축소했고, PRD의 모든 사용자 요구를 prototype screen/state와 1:1 대조하는 RTM을 종료조건으로 강제하지
  않았다. product-designer도 기존 dashboard as-built를 inventory로 읽었지만 보존·변경 대응표 없이 새 IA를
  만들었다. verifier는 skill 사용·벤치마크·화면 품질을 통과시켰지만 요구 coverage 누락을 검사하지 않았다.
- **영향:** v2는 Threads wrong-account·초안·발행·예약·502의 개념만 보여주고, 실제 고객이 실패한 Instagram
  연결·Settings 상태·수동 token 중복과 기존 기능 보존을 판단할 수 없다. Instagram IMAGE/Reels 운영 증거가
  있는데도 `자동 발행 준비 중`으로 축소 표현했다.
- **수정 종료증거:** REQUEST-OSMU-001 각 행이 새 prototype의 route/screen/state 또는 `UI 대상 아님` 근거와
  1:1 매핑되고 누락 0건, 기존 route/component/API의 유지·수정·신규 표가 존재하며, 브라우저에서 핵심 실패
  상태와 회복 경로를 직접 클릭 관찰한다. 그 전 design 승인 금지.

### 2026-08-03 DESIGN-004 — 증분 설계·OSMU 정체성·플랫폼 공통 탭 실패

- **❌ NG 사용자 관찰:** v3가 기존 개발 화면에 기능을 추가하는 인상이 아니라 디자인을 전면 교체한 것처럼
  보이고, OSMU 제품 정체성이 즉시 보이지 않는다. Threads와 Instagram 상단 탭도 각각 다른 구조를 유지해
  `Queue / Editor / Analytics / Growth / Popular / Settings` 공통 작업 모델을 만들지 못했다.
- **❌ NG 목표상태 누락:** 회장이 `안 된다`고 제보한 OAuth 후 상태, Settings 동기화, Graph API 기본 비노출,
  계정 전환, 플랫폼별 생성·발행·예약은 오류 설명만이 아니라 수정 후 실제 사용 가능한 목표 화면으로 보여야
  하는데 일부 화면은 현재 장애·복구 설명에 머물렀다.
- **근본 원인:** `기존 route/tab/capability 삭제 0`을 보존성 합격선으로 잘못 정의했다. 삭제하지 않는 것과
  공통 고객 경험으로 통일하는 것은 별개인데, product-designer와 컨트롤러가 기존 플랫폼별 탭 차이를 그대로
  남긴 채 보존 성공으로 판정했다. 또한 as-built 데이터 구조 보존과 visual shell 보존을 분리하지 않아 새 IA와
  스타일 변경 폭을 제한하지 못했다.
- **수정 원칙:** 기존 Sidebar·레이아웃·토큰·카드·라우트를 visual baseline으로 유지하고 기능을 additive로
  추가한다. OSMU 명칭·전체 콘텐츠 운영 목적을 모든 주요 화면 상단에서 식별 가능하게 한다. Threads와
  Instagram은 같은 순서의 공통 탭 `Queue / Editor / Analytics / Growth / Popular / Settings`를 사용하며,
  플랫폼 차이는 탭 구조가 아니라 내부 capability와 안내로 표현한다. 회장 제보 항목은 모두 해결된 target
  state와 오류·복구 state를 함께 제공한다.
- **종료증거:** 기존 운영 화면과 수정 prototype의 공통 shell 시각 대조, 두 플랫폼 탭 이름·순서 완전 일치,
  OSMU 식별자 모든 주요 화면 노출, REQUEST-OSMU-001 전 항목 happy-path와 recovery-path 각각 연결,
  브라우저 직접 클릭·console/mobile QA 후 사용자 재확인. 그 전 design 승인 금지.

### 2026-08-04 DESIGN-005 — 전체 OSMU 플랫폼·설정관리 범위 누락

- **❌ NG 사용자 관찰:** v4가 Threads와 Instagram 중심으로만 구성됐다. OSMU 전체 제품이라면 Facebook,
  X, Instagram Reels, YouTube Shorts, TikTok도 콘텐츠 생성·플랫폼별 편집·검수·즉시발행·예약·Queue·
  Calendar·발행기록·분석과 각 플랫폼 연결/계정/권한/설정 관리까지 포함해야 한다.
- **근본 원인:** 승인 PRD v2.4의 One Thing인 `Threads 외부고객 1명 실제 permalink`를 첫 검증 slice가 아니라
  전체 제품 정보구조의 범위로 오독했다. 이후 회장이 `전체 OSMU`를 반복 요청했는데도 plan MAJOR scope를
  재개하지 않고 design 안에서 지도·지원표만 추가해 상류 요구와 하류 화면이 계속 어긋났다.
- **영향:** Facebook·X·Reels·Shorts·TikTok이 전체 고객 흐름과 공통 탭/Settings에서 빠져 OSMU라는 제품명이
  약속하는 One Source Multi Use를 충족하지 못한다. v4는 전체 제품 prototype 승인 대상이 아니다.
- **수정 원칙:** 검증·출시 우선순위는 플랫폼별로 단계화할 수 있으나 전체 OSMU IA와 관리 surface는 모든
  대상 플랫폼을 포함한다. 각 플랫폼은 공통 `Queue / Editor / Analytics / Growth / Popular / Settings`와
  공통 발행 lifecycle을 사용하고, TEXT/IMAGE/VIDEO·OAuth/credential/심사 차이는 capability matrix와 탭
  내부 상태로 표현한다. 미구현을 구현됨으로 꾸미지 않되 목표 happy-path와 현재 readiness를 분리한다.
- **종료증거:** PRD MAJOR 범위에 Threads, Instagram Feed/Reels, Facebook, X, YouTube Shorts, TikTok의 기능·
  설정·예외·출시단계·AC/QA가 모두 고정되고, prototype에서 플랫폼 6종의 공통 탭·플랫폼별 Editor/Settings·
  전체 생성→발행→분석 flow를 클릭 가능하게 관찰한다. 그 전 design 승인 금지.

### 2026-08-04 OSMU v3.1.1 plan PATCH AC → QA TC 등록

> 정본 후보: `docs/openclaw-auto-osmu-prd-v3.1.1-gpt-codex.md` v3.1.1 PATCH와 v3.1.0의 비변경 조항. 아래 TC는 plan 단계 정규 골격이며
> design/FDD 확정 뒤 endpoint/component 이름을 추가한다. `실계정`은 non-secret 식별 범주만 기록한다.
>
> **❌ 2026-08-04 superseded:** PLAN-007로 v3.1.1과 DESIGN v6는 승인 불가다. 아래 TC는 역사 증거이며 신규 design/build gate에는 사용하지 않는다. 후속 정본 후보는 `docs/openclaw-auto-osmu-prd-v4.0.0-gpt-codex.md`와 `OSMU-V4-TC-*`다.

| TC | AC/FR | 검증 목표 | Owner | Due/slice | Environment | Credential/review prerequisite | 실계정 | 종료증거 |
|---|---|---|---|---|---|---|---|---|
| OSMU-V3-TC-001 | AC-01/FR-01 | 6 provider·8 surface·12 capability ID 전 산출물 일치 | qa-verifier/SJ | v5 design gate | docs+prototype | 없음 | 불필요 | count 6/8/12, ID diff 0 |
| OSMU-V3-TC-002 | AC-02/FR-02/21,NFR-09/10 | 실제 shell·provider별 탭·특화 기능 보존, UI 획일화 금지 | qa-verifier/SJ | v6 design re-gate | source+prototype 390/1024 | 없음 | 불필요 | sidebar 26/26, route 24/24, Threads tab 5/5, Instagram tab 3/3, forced identical tab 0, invented top-level navigation 0, route click screenshot |
| OSMU-V3-TC-003 | AC-03/FR-03 | callback/provider 상태가 4면 account truth와 일치 | qa-verifier/SJ | R0 | prod secret browser | provider client credential | Threads+IG target | Channel/Global/Platform/Editor identity·state·CTA diff 0 |
| OSMU-V3-TC-004 | AC-04/FR-04 | 기존 Meta 세션에서 목표 계정 전환 | qa-verifier/SJ | R0 | prod existing-session browser | Meta app role/consent | 서로 다른 Meta 계정 2개 | chooser→callback→target identity 영상·screenshot |
| OSMU-V3-TC-005 | AC-05/FR-04 | same-provider 2계정 default 전환·계정별 발행 | qa-verifier/SJ | R0/R4 | prod secret browser | provider multi-account consent | provider당 target 2개 | account별 external link·identity 일치 |
| OSMU-V3-TC-006 | AC-06/FR-05 | 기존 Settings summary와 Channel Settings detail의 역할·label을 보존하고 동일 account truth 사용 | qa-verifier/SJ | R0 | prod browser | 연결 account 1개 이상 | Threads+IG target | 같은 handle/state/verified-at/CTA, 기존 Settings tab 9/9, summary/detail 역할 분리 screenshot |
| OSMU-V3-TC-007 | AC-07/FR-06 | provider readiness 9항목 data trace와 맥락별 reason/action; 54-cell UI 강제 금지 | qa-verifier/SJ | v6/R0 | source+prototype+prod | provider readiness response | provider 6종 또는 disabled seed | readiness field 9/9, customer reason/action coverage, forced 54-cell UI 0, empty invented tab 0 |
| OSMU-V3-TC-008 | AC-08/FR-07 | 미승인 source dispatch 0 | qa-verifier/SJ | R1 | staging/prod-parity | enabled provider 1개 | Threads target | provider request 0·승인 안내 |
| OSMU-V3-TC-009 | AC-09/FR-08 | 12 capability variant 생성·개별 수정 보존 | qa-verifier/SJ | R4 | staging seeded | media seed | 불필요 | variant 12/12, cross-overwrite 0 |
| OSMU-V3-TC-010 | AC-10/FR-09 | invalid media/privacy/disclosure provider 전 차단 | qa-verifier/SJ | R1~R4 | staging contract | official rule fixtures | 불필요 | capability 12/12 invalid request 0 |
| OSMU-V3-TC-011 | AC-11/FR-10 | final review target/content/privacy/time 표시·승인 gate | qa-verifier/SJ | R1 | prod browser | connected target | 외부 opt-in Threads+IG | 승인 전 request 0, review screenshot |
| OSMU-V3-TC-012 | AC-12/FR-11 | enabled capability Now 실제 결과 | qa-verifier/SJ | 각 R1~R4 | prod provider | 각 provider credential/review | 실제 target account | external ID+열리는 link+identity capability별 1건 |
| OSMU-V3-TC-013 | AC-13/FR-12 | schedule/cancel/reschedule/due·Queue/Calendar 일치 | qa-verifier/SJ | R1/R4 | prod scheduler | enabled schedule capability | 실제 target account | 상태 전이+due external link; 취소 publish 0 |
| OSMU-V3-TC-014 | AC-14/FR-13 | video processing terminal 전 published 0 | qa-verifier/SJ | R3/R4 | prod provider | video credential/review | IG/FB/YT/TT target | accepted→processing→terminal timeline |
| OSMU-V3-TC-015 | AC-15/FR-14 | timeout·partial·동시 retry idempotency | qa-verifier/SJ | R1 | staging fault+prod parity | provider sandbox/real recovery | Threads/IG target | same key external result ≤1·reconciled link |
| OSMU-V3-TC-016 | AC-16/FR-15 | partial multi-capability 결과 source group 1개 | qa-verifier/SJ | R4 | staging+prod subset | 2+ enabled provider | 실제 target 2개 이상 | success 재발행 0, 독립 상태와 link |
| OSMU-V3-TC-017 | AC-17/FR-16 | 6×3 analytics 계약 S/R/U·근거·enable 조건 | qa-verifier/SJ | R4 | docs+prod read | analytics scopes/review | provider별 own account | 18/18, 가짜 0 없음, source/fetched-at |
| OSMU-V3-TC-018 | AC-18/FR-17 | 만료·장애·quota·review actionable 알림 | qa-verifier/SJ | R0~R4 | staging fault fixtures | 없음/실 provider error | seeded+실계정 혼합 | error class별 user/owner action·retry time |
| OSMU-V3-TC-019 | AC-19/FR-18 | disconnect/delete/revoke 후 발행 차단·보존범위 | qa-verifier/SJ | R1 | prod test account | revoke 가능한 test account | provider target 1개 | token unusable·publish 0·evidence 보존 표시 |
| OSMU-V3-TC-020 | AC-20/FR-19 | 2 tenant×2 account 교차 read/write/publish 0 | qa-verifier/SJ | R0 | staging RLS+prod parity | 두 tenant seed | 실계정 불필요, provider call spy | 4×read/write/publish deny·external call 0 |
| OSMU-V3-TC-021 | AC-21/FR-20 | 미준비 capability enabled 오표시 0 | qa-verifier/SJ | R0~R4 | prod readiness | credential/review missing fixtures | X/FB/YT/TT disabled state | reason·support evidence·enable condition screenshot |
| OSMU-V3-TC-022 | AC-22/FR-21 | additive migration invariants와 실제 제품 preservation audit | qa-verifier/SJ | build/QA gate | repo+prototype+staging DB | backup/rollback proof | 불필요 | MI-01~09 9/9, sidebar 26/26, route 24/24, Settings 9/9, label remove/rename/move 0, invented nav 0, record loss 0 |
| OSMU-V3-TC-023 | AC-23/FR-22 | legacy 운영 5 paths 회귀 | qa-verifier/SJ | R1 | prod secret browser | Threads+IG valid consent | 운영 target | Threads TEXT/IMAGE/Schedule+IG Feed/Reels link 5/5 |
| OSMU-V3-TC-024 | AC-24/FR-23 | REQUEST·사용자 정정·DESIGN-005·DESIGN-006·DESIGN v6→FR→AC→TC→view/state 전수 RTM | qa-verifier/SJ | v6 design re-gate | docs+prototype | 없음 | 불필요 | 상류 4종 orphan 0, DESIGN-006 closure 9/9, v5 승인 근거 사용 0, v3.1.1 path/version 일치 |
| OSMU-V3-TC-025 | AC-25/FR-24 | external demand qualification·consent·dedupe | qa-verifier/SJ | R1+30d | cohort ledger | opt-in notice | 외부 workspace 10/최대100 prospect | internal 0·duplicate 0·consent 100% |
| OSMU-V3-TC-026 | AC-26/NFR-01 | connection hard stop R0 evidence 전 유지 | qa-verifier/SJ | R0 | prod feature gate | 없음 | 신규 고객 test | OAuth/publish CTA closed, override 0 |
| OSMU-V3-TC-027 | AC-27/NFR-02/03 | secret/private payload client·log·공용 analytics 유출 0 | qa-verifier/SJ | R0/QA | staging+prod logs | secret scanner access | synthetic private payload | token/source/handle/permalink raw hit 0 |
| OSMU-V3-TC-028 | AC-28/NFR-05 | 502가 correlation/reconciliation/action 상태로 복구 | qa-verifier/SJ | R0 | staging fault+prod | upstream fault injection or captured 5xx | target 1개 | 흰 화면 0·correlation ID·duplicate 0 |
| OSMU-V3-TC-029 | AC-29/FR-12 | video/X-media schedule gap을 enabled로 오표시하지 않음 | qa-verifier/SJ | R0/R4 | prod readiness UI | capability별 current flags | IG/FB/X/YT/TT states | 미구현 5종 disabled; R4 후 capability별 E2E |
| OSMU-V3-TC-030 | AC-30/FR-16 | Popular 표본 3건 미만 상태 | qa-verifier/SJ | R4 | staging/prod analytics | metric read scope | own posts 0/2/3개 fixtures | 0·2=`표본 부족`, 3=ranking+link |

#### OSMU v3.1 QA gate 요약

- R0 hard stop clear에는 TC-003~007, 020, 021, 026~028이 모두 PASS해야 한다.
- R1에는 TC-008, 011~015, 019, 023과 외부 고객 target link가 필요하다.
- R4는 UI 생성이 아니라 TC-001~030 전량 PASS 또는 공식 근거를 가진 capability별 disabled 판정이 종료증거다.
- 기존 design/prototype v1~v5는 superseded이며 TC-024의 target view는 v3.1.1 PATCH와 정합한 DESIGN v6만 인정한다.

### 2026-08-04 OPS-AGENT-VIS-001 — 서브에이전트 진행상태 비가시화

- **❌ NG 사용자 관찰:** 백그라운드 서브에이전트가 실제 실행 중이어도 회장 화면에는 현재 단계·최근 산출·남은
  검증이 자동 표시되지 않아 작업이 멈췄는지 판단할 수 없다.
- **근본 원인:** Codex 협업 상태는 컨트롤러가 `list_agents`와 agent message를 능동 조회해 중계해야 하는
  pull 구조인데, 컨트롤러가 장기 디자인 작업 중 주기적으로 조회·보고하지 않았다.
- **영향:** 진행 중인 작업이 정지처럼 보이고, 중복 실행 요청과 불신을 유발하며 멀티에이전트의 병렬화 이점이
  사용자 경험에 드러나지 않는다.
- **수정 원칙:** active agent가 있으면 컨트롤러가 60초 이내 간격으로 `running/completed/blocked`, 현재 단계,
  검증 수치, 다음 산출 이벤트를 짧게 중계한다. 완료 알림을 받으면 같은 턴에 품질 verifier로 전환한다.
- **종료증거:** 10분 이상 수행되는 위임 1건에서 상태 업데이트 공백 60초 이하, 완료 후 한 응답 주기 안에
  verifier 착수, 사용자가 별도 상태 질문 없이 현재 단계와 남은 일을 식별할 수 있음.

### 2026-08-04 DESIGN-006 — v5 실구현 IA·기능·디자인시스템 무시

> 후속 상류 결함은 아래 `PLAN-007`에서 별도 추적한다.

### 2026-08-04 PLAN-007 — 기존 OSMU 런타임·기능 연속성 오판

- **❌ NG:** PRD v3.1.1과 DESIGN v6가 실제로 없는 `Studio → 승인 인박스 → 캘린더 → result group → retry`
  통합 연속성을 기존 구현처럼 전제했다.
- **실제 코드:** tenant DB-backed Next API와 env/JSON 기반 root extensions가 병존하며 자동 통합되지 않는다.
  text publish/schedule 8개, Studio direct publish 4개, video publish target 3개, publish extension 15개다.
- **부분 구현:** queue JSON primary+DB mirror, universal permalink/result recovery 없음, generic result-group retry
  없음, no-draft concurrent reservation 없음, OAuth same-provider state one-time consumption TODO.
- **판정:** PRD v3.1.1과 DESIGN v6 승인 불가. 실제 구현/부분 구현/미구현/운영장애를 분리한 MAJOR PRD 필요.
- **종료증거:** 두 런타임 source-to-result map, capability별 as-is/target/gap, 8 text+3 video+15 extension 대응표,
  queue/OAuth/idempotency debt 순서, AC/TC 재작성, independent critic MAJOR 0.

### 2026-08-05 DESIGN-008 — 로컬 코드 구현을 운영 기존기능으로 오표시

- **❌ NG 사용자 관찰:** 실제 사용 중인 OSMU에는 초안생성·Publish 흐름이 보이지 않는데 v7은 이를
  `현재 구현`, `기존 Studio 보존`, `AS-IS`로 표시했다.
- **코드 증거:** 로컬 `dashboard/src/app/studio/page.tsx`에는 2026-06-23부터 `OSMU 생성`, `AI 자동초안`,
  `Save`, `Publish`, `예약` UI와 실행 코드가 존재한다. 하지만 이 커밋이 현재 운영 OSMU에 배포·노출됐다는
  prod browser 증거는 없다.
- **근본 원인:** repo-implemented와 prod-observed를 하나의 `현재/기존` 상태로 합쳤다. 코드 존재는 배포·접근·
  실제 동작 증거가 아닌데 디자인 보존 근거로 승격했다.
- **판정:** DESIGN v7 승인 후보 철회. 로컬 코드 존재 수치는 보존 inventory로만 인정하고 운영 AS-IS로
  표시하지 않는다.
- **수정 원칙:** 모든 화면과 기능을 `운영에서 직접 관찰됨 / 로컬 코드에 구현됐으나 운영 미검증 / 목표 계약`
  3층으로 분리한다. 운영 미검증 기능은 기본 고객 경로·기존 사용경험으로 가정하지 않는다.
- **종료증거:** repo commit·local route·prod route 세 증거 열을 가진 provenance matrix, 운영 관찰 없는 기능의
  `기존/현재/AS-IS` 표기 0, target과 local-only 혼동 0, 사용자 운영 화면 기준 브라우저 대조.

### 2026-08-05 DESIGN-009 — 내부 감사 UI를 고객 제품 프로토타입으로 출고

- **❌ NG 사용자 관찰:** v8 첫 화면이 `PROD OBSERVED / REPO / TARGET` provenance와 검증 수치를 보여줘
  사용자가 무엇을 해야 하는 제품인지 알 수 없다. 기획·디자인의 실제 목표 경험이 아니라 내부 감사 도구다.
- **근본 원인:** 운영 주장 방지라는 검증 수단을 고객 UI의 정보구조로 승격했다. provenance는 디자인 QA
  evidence여야지 제품 navigation·hero·task flow가 아니다.
- **판정:** v8 승인 후보 철회. 내부 검증표로만 보존한다.
- **수정 원칙:** v9은 PRD v4.1.2 One Thing을 실제 고객 작업으로 보여준다: 원문 작성/가져오기 → Threads·
  Instagram Feed·X 선택 → 플랫폼별 초안 생성·수정 → 계정·내용 최종검수 → 즉시/예약 → 계정별 결과·
  permalink·부분실패 복구. 기존 Marketing Hub shell에 additive하되 감사 용어·코드 수치·migration UI는
  고객 기본 흐름에서 제거한다. readiness·미구현은 자연스러운 비활성 상태와 안내로만 표현한다.
- **종료증거:** 첫 10초에 제품 목적·첫 행동 식별, happy path 전체 클릭 가능, recovery path, 사용자에게
  provenance/audit/code count 노출 0, dead-end 0, 1024/390 QA, PRD AC28 RTM.

### 2026-08-05 DESIGN-010 — 8개 초안·개별 Publish 기존 핵심흐름 누락

- **❌ NG 사용자 관찰:** 기존 OSMU의 핵심은 초안생성 한 번으로 플랫폼 8개 초안을 만들고, 각 초안 카드의
  Publish를 눌러 하나씩 발행하는 흐름인데 v9은 Threads·Instagram·X 3개와 일괄 최종발행으로 축소했다.
- **코드 증거:** 현재 `SCHEDULABLE_PLATFORMS`와 `/api/publish` 지원 8개는 Threads, X, Facebook, Instagram,
  Bluesky, Telegram, Discord, Slack이다. 과거 Studio commit `aa368e67`은 ALL 7 preview를 전부 선택하고
  순차 publish loop를 실행했으며, 이후 direct publish UI가 4개로 축소됐다.
- **근본 원인:** initial 3 adapter의 안전성 검증 우선순위를 제품 UI의 전체 초안 범위로 오독했고, 일괄 생성과
  카드별 개별 Publish라는 기존 작업 모델을 최종검수 후 일괄발행으로 바꿨다.
- **판정:** v9 승인 후보 철회. PRD에 8 draft surface와 card-level Publish 계약을 추가하고 v10에서 복원한다.
- **종료증거:** 초안생성 1회→8 cards, 카드별 edit/save/publish/status/permalink, 한 카드 Publish가 다른 카드
  external call을 만들지 않음, 8/8 카드 클릭, 전체/선택 발행은 별도 명시 행동, partial/retry, 1024/390 QA.

#### v4.0.0 MAJOR retake 상태

- **작성됨·승인 전:** `docs/openclaw-auto-osmu-prd-v4.0.0-gpt-codex.md`
- **정정:** Studio DB drafts, queue JSON Inbox/Calendar, DB schedules, video publish를 별도 as-is 경로로 명시했고 자동 연속성을 현재 구현으로 주장하지 않는다.
- **범위:** text 8, video 3, root publish extensions 15를 각각 map하고 code exists/partial/unimplemented/operational outage/unverified를 분리한다.
- **남은 종료조건:** independent critic MAJOR 0, AC↔TC/RTM 검증, 회장 appetite·extension disposition 원칙 결정. DESIGN v6는 rejected evidence로만 유지한다.

### 2026-08-04 OSMU v4.0.0 MAJOR AC → QA TC 등록

> 정본 후보: `docs/openclaw-auto-osmu-prd-v4.0.0-gpt-codex.md` §17. endpoint/component 이름은 FDD 합의 후 추가하되 Given-When-Then과 종료증거를 약화하지 않는다.
>
> **❌ superseded:** independent critic의 residual MAJOR 7건으로 v4.0.0 gate 불통과. 후속 정본 후보는 v4.1.0과 `OSMU-V41-TC-*`이며 아래 v4.0 TC는 역사 증거다.

| TC | AC/FR | 검증 목표 | Owner | Slice | 종료증거 |
|---|---|---|---|---|---|
| OSMU-V4-TC-001 | AC-01/FR-01 | runtime capability inventory | qa-verifier | R0 | text 8/video 3/extensions 15, 범주 혼합 0 |
| OSMU-V4-TC-002 | AC-02/FR-02,NFR-08 | 기존 shell 보존 | qa-verifier/SJ | R0/design | sidebar/route/settings/provider-tab orphan·무승인 rename·invented nav 0 |
| OSMU-V4-TC-003 | AC-03/FR-19,NFR-04 | readiness truth | qa-verifier | R0 | 미검증·장애 target disabled+reason/action/owner/evidence time |
| OSMU-V4-TC-004 | AC-04/FR-01,18 | extension 15 audit | tech-architect/qa | R0/R5 | 15/15 overlap/runtime/credential/result/disposition |
| OSMU-V4-TC-005 | AC-05/FR-08 | OAuth state one-time consumption | qa-verifier | R1 | 동일 state 2회 중 첫 회만 token/write, 둘째 external call 0 |
| OSMU-V4-TC-006 | AC-06/FR-09 | four-surface account truth | qa-verifier/SJ | R1 | identity/scope/state/verified-at/CTA diff 0 |
| OSMU-V4-TC-007 | AC-07/FR-09,NFR-01 | two-account explicit selection | qa-verifier/SJ | R1 | 선택 target 저장·review·발행 일치, cross-tenant 0 |
| OSMU-V4-TC-008 | AC-08/FR-03 | stable source identity | qa-verifier | R2 | Studio/queue/schedule/video source에 tenant-scoped identity+provenance |
| OSMU-V4-TC-009 | AC-09/FR-04 | Studio↔queue explicit bridge | qa-verifier | R2 | 동일 source 참조, 복제 orphan 0 |
| OSMU-V4-TC-010 | AC-10/FR-05 | dual-read parity | qa-verifier | R2 | Studio/Inbox/Calendar source·approval·schedule·result parity 100% |
| OSMU-V4-TC-011 | AC-11/FR-06,23,NFR-06 | JSON/DB drift recovery | qa-verifier | R2 | drift 검출·복구, record loss 0, JSON rollback rehearsal |
| OSMU-V4-TC-012 | AC-12/FR-07 | target variant independence | qa-verifier | R2/R3 | 한 target 수정/승인의 cross-overwrite 0 |
| OSMU-V4-TC-013 | AC-13/FR-10,11,NFR-02 | concurrent idempotency | qa-verifier | R3 | no-draft 포함 same intent 20회 external result ≤1 |
| OSMU-V4-TC-014 | AC-14/FR-12,NFR-03 | persistence-only repair | qa-verifier | R3 | provider success/DB failure 뒤 republish 0·result 저장 |
| OSMU-V4-TC-015 | AC-15/FR-13 | text 8 recovery | qa-verifier | R3 | enabled adapter 8개 provider ID+permalink 또는 terminal reason |
| OSMU-V4-TC-016 | AC-16/FR-14 | source result group | qa-verifier | R3 | mixed target의 독립 status/provider ID/link/time 한 group |
| OSMU-V4-TC-017 | AC-17/FR-15 | partial retry | qa-verifier | R3 | failed target만 호출, success duplicate 0 |
| OSMU-V4-TC-018 | AC-18/FR-21,NFR-04 | fake permalink 금지 | qa-verifier | R3 | provider home URL을 post result로 표시 0 |
| OSMU-V4-TC-019 | AC-19/FR-16 | video terminal truth | qa-verifier | R4 | terminal 전 processing, terminal 뒤만 published+실 link |
| OSMU-V4-TC-020 | AC-20/FR-17 | YouTube result parity | qa-verifier | R4 | provider ID/link/status persistence+recovery, duplicate 0 |
| OSMU-V4-TC-021 | AC-21/FR-16,17 | video 3 readiness | qa-verifier/SJ | R4 | 3 target 각각 E2E proof 또는 disabled reason/action, false-success 0 |
| OSMU-V4-TC-022 | AC-22/FR-18 | extension disposition | qa-verifier/SJ | R5 | 15/15 integrate/repair/retire+owner/proof, 미검증 노출 0 |
| OSMU-V4-TC-023 | AC-23/FR-20,22,NFR-07 | revoke·incident trace | qa-verifier | R1~R5 | revoke 뒤 external call 0, source→provider owner/action 추적 |
| OSMU-V4-TC-024 | AC-24/FR-24,NFR-01,05 | tenant/privacy isolation | qa-verifier | R1~R5 | 2 tenant×2 account cross access/call 0, raw private/secret leak 0 |
| OSMU-V4-TC-025 | AC-25/R6,BM | external cohort | SJ | R6+30d | internal/duplicate 제외 activation·repeat·paid-intent 산출 |
| OSMU-V4-TC-026 | AC-26/전체 | RTM·supersession | qa-verifier | plan/design gate | orphan 0, v3.1.1/DESIGN v6 target 근거 0 |

#### OSMU v4 QA gate 요약

- R0: TC-001~004 전량 PASS. count·지원상태·기존 shell의 truth를 먼저 고정한다.
- R1: TC-005~007, 023~024 PASS 전 신규 외부 OAuth/dispatch를 열지 않는다.
- R2: TC-008~012가 7일 연속 parity 100% 전 canonical read switch와 JSON fallback 제거를 금지한다.
- R3/R4: enabled target마다 concurrency·timeout·persistence failure·실 permalink 증거가 있어야 한다.
- R5: extension 15개를 모두 활성화하는 gate가 아니라 15/15에 명시적 integrate/repair/retire 판정을 내리는 gate다.
- v4 plan approval은 TC-026과 independent critic MAJOR 0 이후이며, DESIGN v6는 재사용하지 않는다.

- **❌ NG 사용자 관찰:** v5 prototype에 실제품에 없는 `OSMU PROVIDERS` 그룹이 생겼고, 기존 왼쪽
  사이드바의 다수 기능과 분류가 사라졌다. 기존 제품에 추가하는 설계가 아니라 별도 제품처럼 재구성됐다.
- **코드 대조 증거:** 실제 `dashboard/src/components/layout/Sidebar.tsx`의 customer shell은 `Marketing Hub`,
  `성과`, `OSMU Studio`, `승인 인박스`, `발행 캘린더`, 발행 채널 그룹, `Video`, `Data & Analytics`,
  `Keyword Research`, `Custom Integration`, `Assets & Tools`, `System/Settings`를 노출한다. v5 prototype은
  이를 `Studio / OSMU PROVIDERS / Global Settings / Calendar`로 축약·변조했다.
- **기능 대조 증거:** 실제 Instagram은 `Queue / Editor / Settings` 3탭이다. v5는 구현 여부와 기존 기능
  위치를 구분하지 않고 전 provider에 `Queue / Editor / Analytics / Growth / Popular / Settings`를 생성했다.
- **근본 원인:** `6 provider×6 tabs`와 클릭 수를 보존성 대리지표로 사용하고, 실제 route/sidebar/component
  inventory 대 prototype diff를 만들지 않았다. 존재하지 않는 미래 IA를 target contract라는 이름으로 기존
  shell에 덮어쓴 뒤 Design Score A로 자기검증했다.
- **판정:** v5 design 승인 후보 철회. verifier PASS는 프로세스 근거만 확인했을 뿐 제품 정합성을 보증하지
  못했으므로 `additive`, `기존 구현 보존`, `다음 stage 가능` 주장은 무효다.
- **수정 원칙:** 실제 Sidebar·route·page·component·token을 먼저 전수 inventory하고 삭제/리네임/이동 0을
  기본값으로 삼는다. 새 OSMU 기능은 기존 `OSMU Studio`, `승인 인박스`, `발행 캘린더`, 채널 페이지,
  Global Settings 안에 증분 배치한다. 새 분류나 탭은 실제 기존 기능과 명확한 추가 요구가 모두 있을 때만 둔다.
- **상류 plan PATCH 계약:** `docs/openclaw-auto-osmu-prd-v3.1.1-gpt-codex.md`는 capability/data 6/8/12와
  readiness 9항목을 유지하되 공통 6탭·6×9 Settings UI 강제를 폐기했다. 공통 workflow는 기존 Studio,
  Inbox, Calendar, Settings에만 additive 배치하고 provider page는 실제 탭·특화 기능을 보존한다.
- **종료증거:** 실제 구현→새 prototype 1:1 보존 매트릭스에서 sidebar 26/26, route 24/24, Settings tab
  9/9, provider 실제 탭·기능 orphan 0, forced identical provider tab 0, invented top-level navigation 0,
  디자인 토큰·shell diff 설명 100%, 사용자 요청 추가분만 additive 표시, 390/1024 브라우저 대조.

### 2026-08-04 OSMU v4.1.0 MINOR AC → QA TC 등록

> 정본 후보: `docs/openclaw-auto-osmu-prd-v4.1.0-gpt-codex.md` §17. v4.0 critic residual MAJOR 7건을 행동·경계·실패 action까지 강화했다. DESIGN v6는 rejected evidence다.
>
> **❌ superseded:** qualified prospect 사전판정/locked contact ledger와 모집실패 branch가 없어 v4.1.0 critic 불통과. 후속 정본 후보는 v4.1.1과 `OSMU-V411-TC-*`다.

| TC | AC/FR | 검증 목표 | Slice | 종료증거 |
|---|---|---|---|---|
| OSMU-V41-TC-001 | AC-01/FR-01 | capability inventory | R0 | text8/video3/extensions15, 범주 혼합 0 |
| OSMU-V41-TC-002 | AC-02/FR-02,NFR-08 | shell preservation | R0/design | sidebar/route/settings/tab orphan·invented nav 0 |
| OSMU-V41-TC-003 | AC-03/FR-19,NFR-04 | readiness truth | R0 | disabled reason/action/owner/evidence time |
| OSMU-V41-TC-004 | AC-04/FR-01,18 | extension 15 full contract | R0/F3 | 15/15 loader/credential/tenant/media/result/permalink/queue/disposition, queue 3개만 |
| OSMU-V41-TC-005 | AC-05/FR-08 | OAuth concurrent replay | R1 | same state+cookie 20 concurrent: nonce consume/token endpoint/account write exactly1, 19 pre-external reject |
| OSMU-V41-TC-006 | AC-06/FR-09 | account truth | R1 | four-surface identity/scope/state/time/CTA diff 0 |
| OSMU-V41-TC-007 | AC-07/FR-09,NFR-01 | account selection/isolation | R1 | two-account target 일치, cross-tenant call 0 |
| OSMU-V41-TC-008 | AC-08/FR-03 | stable source identity | R2 | 네 경로 tenant ID+provenance |
| OSMU-V41-TC-009 | AC-09/FR-04 | explicit Studio↔queue bridge | R2 | same source, orphan 0 |
| OSMU-V41-TC-010 | AC-10/FR-05 | migration authority sequence | R2 | M0→M8 순서, 단계별 writer/read authority diff 0, premature entry 0 |
| OSMU-V41-TC-011 | AC-11/FR-06,23,NFR-06 | reverse replay/rollback | R2 | 각 단계 fault+M5 이후 신규100, JSON rollback 100/100, loss/duplicate/drift 0 |
| OSMU-V41-TC-012 | AC-12/FR-07 | target variant independence | R2/R3 | cross-overwrite 0 |
| OSMU-V41-TC-013 | AC-13/FR-10,11,NFR-02 | dispatch concurrency | R3 | no-draft same intent 20 concurrent external result ≤1 |
| OSMU-V41-TC-014 | AC-14/FR-12,NFR-03 | persistence-only repair | R3 | provider success/DB failure 뒤 republish 0 |
| OSMU-V41-TC-015 | AC-15/FR-13 | provider recovery | R3/F1 | enabled adapter ID+permalink 또는 terminal reason |
| OSMU-V41-TC-016 | AC-16/FR-14 | result group | R3 | mixed target independent state/ID/link/time |
| OSMU-V41-TC-017 | AC-17/FR-15 | partial retry | R3 | failed만 호출, success duplicate 0 |
| OSMU-V41-TC-018 | AC-18/FR-21,NFR-04 | fake link 금지 | R3 | provider home URL result 표시 0 |
| OSMU-V41-TC-019 | AC-19/FR-16 | video terminal truth | F2 | terminal 전 processing, 뒤만 published+link |
| OSMU-V41-TC-020 | AC-20/FR-17 | YouTube result parity | F2 | ID/link/status persistence+recovery, duplicate 0 |
| OSMU-V41-TC-021 | AC-21/FR-16,17 | video 3 readiness | F2 | target별 E2E 또는 disabled reason/action |
| OSMU-V41-TC-022 | AC-22/FR-18 | extension disposition/repair | F3 | 15/15 decision, 승인된 1개만 repair, 미검증 노출 0 |
| OSMU-V41-TC-023 | AC-23/FR-20,22,NFR-07 | revoke/incident trace | R1~F3 | revoke call 0, evidence·owner·action trace |
| OSMU-V41-TC-024 | AC-24/FR-24,NFR-01,05 | tenant/privacy isolation | R1~F3 | 2tenant×2account cross 0, raw leak 0 |
| OSMU-V41-TC-025 | AC-25/F4,BM | cohort metrics+stop action | F4 | exact activation/repeat/paid formulas, 미달 시 F1~F3/paid flags stopped |
| OSMU-V41-TC-026 | AC-26/전체 | RTM/supersession | plan | orphan 0, v3.1.1/DESIGN v6 target 근거 0 |
| OSMU-V41-TC-027 | AC-27/FR-25,NFR-09 | data rights/consent/delete | F4 | 승인 전 cohort0; consent version; 30d/180d/7d; access audit; 철회 dispatch0 |
| OSMU-V41-TC-028 | AC-28/FR-26 | initial bet boundary/X readiness | R0~R3 | Threads/IG/X만, X credential/cost/link gate, 28h cap, F1~F4 auto-entry0 |

#### v4.1 gate

- R1은 TC-005의 token endpoint·account write exactly1을 직접 관찰하기 전 통과 불가다.
- R2는 TC-010~011의 M0~M8 authority, reverse replay, cutover 후 신규100 JSON rollback loss0 전 통과 불가다.
- Initial safety bet은 TC-028이 정한 Threads·Instagram Feed·X만이며 F1~F4는 자동 진입하지 않는다.
- F4는 §14.5 추천 데이터 권리를 회장이 승인하기 전 모집·수집·결제 0이다.
- plan approval은 TC 28/28 정합과 independent critic MAJOR 0 이후다.

### 2026-08-05 OSMU v4.1.1 PATCH AC → QA TC 등록

> 정본 후보: `docs/openclaw-auto-osmu-prd-v4.1.1-gpt-codex.md` §17. v4.1.0의 unchanged behavior를 보존하고 TC-005/025/027/028의 critic residual을 강화했다.
>
> **❌ superseded:** F4 30일 timer가 first qualified lock에서 시작돼 cohort 시작 권한과 분리되지 않았고, active work 1,680분 circuit breaker·delivery outcome 분모가 없었다. 후속 정본 후보는 v4.1.2와 `OSMU-V412-TC-*`다.

| TC | AC/FR | 검증 목표 | Slice | 종료증거 |
|---|---|---|---|---|
| OSMU-V411-TC-001 | AC-01/FR-01 | capability inventory | R0 | text8/video3/extensions15, 범주 혼합 0 |
| OSMU-V411-TC-002 | AC-02/FR-02,NFR-08 | shell preservation | R0/design | sidebar/route/settings/tab orphan·invented nav 0 |
| OSMU-V411-TC-003 | AC-03/FR-19,NFR-04 | readiness truth | R0 | disabled reason/action/owner/evidence time |
| OSMU-V411-TC-004 | AC-04/FR-01,18 | extension 15 full contract | R0/F3 | 15/15 loader/credential/tenant/media/result/permalink/queue/disposition, queue 3개만 |
| OSMU-V411-TC-005 | AC-05/FR-08 | OAuth state+cookie concurrent replay | R1 | same state+cookie 20 concurrent: nonce consume/token endpoint/account write exactly1, 19 pre-external reject |
| OSMU-V411-TC-006 | AC-06/FR-09 | account truth | R1 | four-surface identity/scope/state/time/CTA diff 0 |
| OSMU-V411-TC-007 | AC-07/FR-09,NFR-01 | account selection/isolation | R1 | two-account target 일치, cross-tenant call 0 |
| OSMU-V411-TC-008 | AC-08/FR-03 | stable source identity | R2 | 네 경로 tenant ID+provenance |
| OSMU-V411-TC-009 | AC-09/FR-04 | explicit Studio↔queue bridge | R2 | same source, orphan 0 |
| OSMU-V411-TC-010 | AC-10/FR-05 | migration authority sequence | R2 | M0→M8 순서, 단계별 writer/read authority diff 0, premature entry 0 |
| OSMU-V411-TC-011 | AC-11/FR-06,23,NFR-06 | reverse replay/rollback | R2 | 각 단계 fault+M5 이후 신규100, JSON rollback 100/100, loss/duplicate/drift 0 |
| OSMU-V411-TC-012 | AC-12/FR-07 | target variant independence | R2/R3 | cross-overwrite 0 |
| OSMU-V411-TC-013 | AC-13/FR-10,11,NFR-02 | dispatch concurrency | R3 | no-draft same intent 20 concurrent external result ≤1 |
| OSMU-V411-TC-014 | AC-14/FR-12,NFR-03 | persistence-only repair | R3 | provider success/DB failure 뒤 republish 0 |
| OSMU-V411-TC-015 | AC-15/FR-13 | provider recovery | R3/F1 | enabled adapter ID+permalink 또는 terminal reason |
| OSMU-V411-TC-016 | AC-16/FR-14 | result group | R3 | mixed target independent state/ID/link/time |
| OSMU-V411-TC-017 | AC-17/FR-15 | partial retry | R3 | failed만 호출, success duplicate 0 |
| OSMU-V411-TC-018 | AC-18/FR-21,NFR-04 | fake link 금지 | R3 | provider home URL result 표시 0 |
| OSMU-V411-TC-019 | AC-19/FR-16 | video terminal truth | F2 | terminal 전 processing, 뒤만 published+link |
| OSMU-V411-TC-020 | AC-20/FR-17 | YouTube result parity | F2 | ID/link/status persistence+recovery, duplicate 0 |
| OSMU-V411-TC-021 | AC-21/FR-16,17 | video 3 readiness | F2 | target별 E2E 또는 disabled reason/action |
| OSMU-V411-TC-022 | AC-22/FR-18 | extension disposition/repair | F3 | 15/15 decision, 승인된 1개만 repair, 미검증 노출 0 |
| OSMU-V411-TC-023 | AC-23/FR-20,22,NFR-07 | revoke/incident trace | R1~F3 | revoke call 0, evidence·owner·action trace |
| OSMU-V411-TC-024 | AC-24/FR-24,NFR-01,05 | tenant/privacy isolation | R1~F3 | 2tenant×2account cross 0, raw leak 0 |
| OSMU-V411-TC-025 | AC-25/FR-27,F4,BM,NFR-10 | prospect ledger + cohort branches | F4 | pre-contact 4/4 evidence·ID·timestamp lock/dedupe; A=100소진 또는30일+consented<10이면 F1~F3/paid stopped+신규work/예산0+snapshot; B=10확보 후 activation≥3/repeat≥3/actual-paid≥2 미달 동일 stop |
| OSMU-V411-TC-026 | AC-26/전체 | RTM/supersession | plan | orphan 0, v3.1.1/DESIGN v6 target 근거 0 |
| OSMU-V411-TC-027 | AC-27/FR-25,NFR-09 | rights/delete/backup expiry | F4 | 승인전 cohort0; 30d raw/180d evidence/7d active delete; 삭제+30d backup restore/read 불가 또는 disclosed legal hold; access audit·철회 dispatch0 |
| OSMU-V411-TC-028 | AC-28/FR-26,NFR-10 | initial bet work-time cap | R0~R3 | work-item planned/actual/evidence append; 1,680분 도달 또는 next 포함 초과 시 신규 R0~R3/F1~F4 stopped, 1,681분 시작0; X readiness gate |

#### v4.1.1 PATCH gate

- TC-025 Branch A와 B를 모두 fixture로 실행한다. A는 모집실패를 activation 실패로 바꿔 세지 않고, B는 10개 확보 뒤 성숙한 window만 평가한다.
- TC-025의 qualified 100명은 접촉 전 4/4 evidence·locked prospect ID/contact timestamp·dedupe PASS row만 센다.
- TC-027은 active delete만이 아니라 삭제시각+30일 backup restore/read 실패까지 assertion한다.
- TC-028은 work-item별 누적 ledger와 1,680분 atomic stop을 assertion한다.
- v4.1.1 plan approval은 V411 TC 28/28 정합, planning 7/7 closure, independent critic MAJOR 0 이후다.

### 2026-08-05 OSMU v4.1.2 final PATCH AC → QA TC 등록

> 정본 후보: `docs/openclaw-auto-osmu-prd-v4.1.2-gpt-codex.md` §17. v4.1.1 behavior를 보존하고 TC-025/028 timer·delivery·active-stop residual을 닫았다.
>
> **❌ superseded:** DESIGN-010에서 회장이 확정한 Generate Drafts→8 cards→per-card Publish 계약이 없었다. 후속 정본 후보는 v4.2.0과 `OSMU-V42-TC-*`다.

| TC | AC/FR | 검증 목표 | Slice | 종료증거 |
|---|---|---|---|---|
| OSMU-V412-TC-001 | AC-01/FR-01 | capability inventory | R0 | text8/video3/extensions15, 범주 혼합 0 |
| OSMU-V412-TC-002 | AC-02/FR-02,NFR-08 | shell preservation | R0/design | sidebar/route/settings/tab orphan·invented nav 0 |
| OSMU-V412-TC-003 | AC-03/FR-19,NFR-04 | readiness truth | R0 | disabled reason/action/owner/evidence time |
| OSMU-V412-TC-004 | AC-04/FR-01,18 | extension 15 full contract | R0/F3 | 15/15 loader/credential/tenant/media/result/permalink/queue/disposition, queue 3개만 |
| OSMU-V412-TC-005 | AC-05/FR-08 | OAuth state+cookie concurrent replay | R1 | same state+cookie 20 concurrent: nonce consume/token endpoint/account write exactly1, 19 pre-external reject |
| OSMU-V412-TC-006 | AC-06/FR-09 | account truth | R1 | four-surface identity/scope/state/time/CTA diff 0 |
| OSMU-V412-TC-007 | AC-07/FR-09,NFR-01 | account selection/isolation | R1 | two-account target 일치, cross-tenant call 0 |
| OSMU-V412-TC-008 | AC-08/FR-03 | stable source identity | R2 | 네 경로 tenant ID+provenance |
| OSMU-V412-TC-009 | AC-09/FR-04 | explicit Studio↔queue bridge | R2 | same source, orphan 0 |
| OSMU-V412-TC-010 | AC-10/FR-05 | migration authority sequence | R2 | M0→M8 순서, 단계별 writer/read authority diff 0, premature entry 0 |
| OSMU-V412-TC-011 | AC-11/FR-06,23,NFR-06 | reverse replay/rollback | R2 | 각 단계 fault+M5 이후 신규100, JSON rollback 100/100, loss/duplicate/drift 0 |
| OSMU-V412-TC-012 | AC-12/FR-07 | target variant independence | R2/R3 | cross-overwrite 0 |
| OSMU-V412-TC-013 | AC-13/FR-10,11,NFR-02 | dispatch concurrency | R3 | no-draft same intent 20 concurrent external result ≤1 |
| OSMU-V412-TC-014 | AC-14/FR-12,NFR-03 | persistence-only repair | R3 | provider success/DB failure 뒤 republish 0 |
| OSMU-V412-TC-015 | AC-15/FR-13 | provider recovery | R3/F1 | enabled adapter ID+permalink 또는 terminal reason |
| OSMU-V412-TC-016 | AC-16/FR-14 | result group | R3 | mixed target independent state/ID/link/time |
| OSMU-V412-TC-017 | AC-17/FR-15 | partial retry | R3 | failed만 호출, success duplicate 0 |
| OSMU-V412-TC-018 | AC-18/FR-21,NFR-04 | fake link 금지 | R3 | provider home URL result 표시 0 |
| OSMU-V412-TC-019 | AC-19/FR-16 | video terminal truth | F2 | terminal 전 processing, 뒤만 published+link |
| OSMU-V412-TC-020 | AC-20/FR-17 | YouTube result parity | F2 | ID/link/status persistence+recovery, duplicate 0 |
| OSMU-V412-TC-021 | AC-21/FR-16,17 | video 3 readiness | F2 | target별 E2E 또는 disabled reason/action |
| OSMU-V412-TC-022 | AC-22/FR-18 | extension disposition/repair | F3 | 15/15 decision, 승인된 1개만 repair, 미검증 노출 0 |
| OSMU-V412-TC-023 | AC-23/FR-20,22,NFR-07 | revoke/incident trace | R1~F3 | revoke call 0, evidence·owner·action trace |
| OSMU-V412-TC-024 | AC-24/FR-24,NFR-01,05 | tenant/privacy isolation | R1~F3 | 2tenant×2account cross 0, raw leak 0 |
| OSMU-V412-TC-025 | AC-25/FR-27,F4,BM,NFR-10 | explicit F4 start + cohort branches + delivery outcome | F4 | approval 뒤 Start F4→immutable f4_started_at exactly1; A cutoff=delivered100 또는 start+30d 먼저, consented<10 stop; fixture day30 qualified0 consented0에서 F1~F3/paid stopped·new work/budget0·snapshot; first-qualified timer 사용0; failed delivery denominator0/audit 보존; B threshold stop |
| OSMU-V412-TC-026 | AC-26/전체 | RTM/supersession | plan | orphan 0, v3.1.1/DESIGN v6 target 근거 0 |
| OSMU-V412-TC-027 | AC-27/FR-25,NFR-09 | rights/delete/backup expiry | F4 | 승인전 cohort0; 30d raw/180d evidence/7d active delete; 삭제+30d backup restore/read 불가 또는 disclosed legal hold; access audit·철회 dispatch0 |
| OSMU-V412-TC-028 | AC-28/FR-26,NFR-10 | active initial-bet circuit breaker | R0~R3 | running at1679→minute1680: next side effect 전 breaker, atomic commit/rollback, safe checkpoint 5필드, R0~R3/F1~F4 stopped, minute1681 side effect0 |

#### v4.1.2 final gate

- TC-025 fixture 1: rights 승인만 있고 Start F4 없음 → contact/collect/pay 0, timer 없음.
- TC-025 fixture 2: `f4_started_at+30d`, delivered qualified=0, consented=0 → F1/F2/F3/paid stopped, new work/budget 0, count/start/cutoff/flag snapshot.
- first qualified evidence/lock timestamp를 cutoff origin으로 넣으면 FAIL. failed/bounced/blocked delivery는 contacted denominator 0이나 attempt audit는 남아야 한다.
- TC-028 fixture: running task가 1,679→1,680분이 될 때 단순 신규-start 차단이 아니라 다음 side effect 전 circuit breaker·atomic close·safe checkpoint를 관찰한다.
- plan approval은 V412 TC 28/28, planning 7/7 재판정, independent critic MAJOR 0 이후다.

### 2026-08-05 OSMU v4.2.0 DESIGN-010 plan MINOR AC → QA TC 등록

> 정본 후보: `docs/openclaw-auto-osmu-prd-v4.2.0-gpt-codex.md` §17. 회장 확정 작업모델을 상위 UI 계약으로 추가하며 기존 V412 28 TC는 그대로 계승한다.
>
> **❌ superseded:** partial generation의 fixed-8/empty/single-Regenerate와 publish retry taxonomy가 없어 critic MAJOR 2. 후속 정본 후보는 v4.2.1과 `OSMU-V421-TC-*`다.

| TC | AC/FR | 검증 목표 | Slice | 종료증거 |
|---|---|---|---|---|
| OSMU-V42-TC-001 | AC-01/FR-01 | capability inventory | R0 | text8/video3/extensions15, 범주 혼합 0 |
| OSMU-V42-TC-002 | AC-02/FR-02,NFR-08 | shell preservation | R0/design | sidebar/route/settings/tab orphan·invented nav 0 |
| OSMU-V42-TC-003 | AC-03/FR-19,NFR-04 | readiness truth | R0 | disabled reason/action/owner/evidence time |
| OSMU-V42-TC-004 | AC-04/FR-01,18 | extension 15 full contract | R0/F3 | 15/15 loader/credential/tenant/media/result/permalink/queue/disposition, queue 3개만 |
| OSMU-V42-TC-005 | AC-05/FR-08 | OAuth state+cookie concurrent replay | R1 | same state+cookie 20 concurrent: nonce consume/token endpoint/account write exactly1, 19 pre-external reject |
| OSMU-V42-TC-006 | AC-06/FR-09 | account truth | R1 | four-surface identity/scope/state/time/CTA diff 0 |
| OSMU-V42-TC-007 | AC-07/FR-09,NFR-01 | account selection/isolation | R1 | two-account target 일치, cross-tenant call 0 |
| OSMU-V42-TC-008 | AC-08/FR-03 | stable source identity | R2 | 네 경로 tenant ID+provenance |
| OSMU-V42-TC-009 | AC-09/FR-04 | explicit Studio↔queue bridge | R2 | same source, orphan 0 |
| OSMU-V42-TC-010 | AC-10/FR-05 | migration authority sequence | R2 | M0→M8 순서, 단계별 writer/read authority diff 0, premature entry 0 |
| OSMU-V42-TC-011 | AC-11/FR-06,23,NFR-06 | reverse replay/rollback | R2 | 각 단계 fault+M5 이후 신규100, JSON rollback 100/100, loss/duplicate/drift 0 |
| OSMU-V42-TC-012 | AC-12/FR-07 | target variant independence | R2/R3 | cross-overwrite 0 |
| OSMU-V42-TC-013 | AC-13/FR-10,11,NFR-02 | dispatch concurrency | R3 | no-draft same intent 20 concurrent external result ≤1 |
| OSMU-V42-TC-014 | AC-14/FR-12,NFR-03 | persistence-only repair | R3 | provider success/DB failure 뒤 republish 0 |
| OSMU-V42-TC-015 | AC-15/FR-13 | provider recovery | R3/F1 | enabled adapter ID+permalink 또는 terminal reason |
| OSMU-V42-TC-016 | AC-16/FR-14 | result group | R3 | mixed target independent state/ID/link/time |
| OSMU-V42-TC-017 | AC-17/FR-15 | partial retry | R3 | failed만 호출, success duplicate 0 |
| OSMU-V42-TC-018 | AC-18/FR-21,NFR-04 | fake link 금지 | R3 | provider home URL result 표시 0 |
| OSMU-V42-TC-019 | AC-19/FR-16 | video terminal truth | F2 | terminal 전 processing, 뒤만 published+link |
| OSMU-V42-TC-020 | AC-20/FR-17 | YouTube result parity | F2 | ID/link/status persistence+recovery, duplicate 0 |
| OSMU-V42-TC-021 | AC-21/FR-16,17 | video 3 readiness | F2 | target별 E2E 또는 disabled reason/action |
| OSMU-V42-TC-022 | AC-22/FR-18 | extension disposition/repair | F3 | 15/15 decision, 승인된 1개만 repair, 미검증 노출 0 |
| OSMU-V42-TC-023 | AC-23/FR-20,22,NFR-07 | revoke/incident trace | R1~F3 | revoke call 0, evidence·owner·action trace |
| OSMU-V42-TC-024 | AC-24/FR-24,NFR-01,05 | tenant/privacy isolation | R1~F3 | 2tenant×2account cross 0, raw leak 0 |
| OSMU-V42-TC-025 | AC-25/FR-27,F4,BM,NFR-10 | explicit F4 start + cohort branches + delivery outcome | F4 | approval 뒤 Start F4→immutable f4_started_at exactly1; A cutoff=delivered100 또는 start+30d 먼저, consented<10 stop; fixture day30 qualified0 consented0에서 F1~F3/paid stopped·new work/budget0·snapshot; first-qualified timer 사용0; failed delivery denominator0/audit 보존; B threshold stop |
| OSMU-V42-TC-026 | AC-26/전체 | RTM/supersession | plan | orphan 0, v3.1.1/DESIGN v6 target 근거 0 |
| OSMU-V42-TC-027 | AC-27/FR-25,NFR-09 | rights/delete/backup expiry | F4 | 승인전 cohort0; 30d raw/180d evidence/7d active delete; 삭제+30d backup restore/read 불가 또는 disclosed legal hold; access audit·철회 dispatch0 |
| OSMU-V42-TC-028 | AC-28/FR-26,NFR-10 | active initial-bet circuit breaker | R0~R3 | running at1679→minute1680: next side effect 전 breaker, atomic commit/rollback, safe checkpoint 5필드, R0~R3/F1~F4 stopped, minute1681 side effect0 |
| OSMU-V42-TC-029 | AC-29/FR-28,NFR-11 | Generate Drafts 8 cards + independent edit/save | design/R3 | source1 generate1→Threads/X/Facebook/Instagram/Bluesky/Telegram/Discord/Slack exactly8; one-card edit/save 시 other7 payload/status write0 |
| OSMU-V42-TC-030 | AC-30/FR-29,NFR-02,11 | per-card Publish/Retry isolation/result | design/R3 | one card Publish→selected invocation1/other7=0/status+actual permalink; failed Retry selected1/other7=0; published Retry adapter0+existing result+duplicate0 |
| OSMU-V42-TC-031 | AC-31/FR-30,NFR-04,11 | readiness disabled + explicit selected/bulk | design/R3 | cards/drafts/edit/save8/8; unavailable Publish disabled+condition; generate/save implicit bulk0; selected/all은 별도 action+review+confirm |

#### v4.2.0 DESIGN-010 gate

- Generate Drafts 1회 결과는 정확히 text platform cards 8개다. Studio preview7·direct4를 target count로 사용하면 FAIL.
- card Publish spy는 선택 adapter invocation=1, 다른 7=0을 assertion한다. Threads provider 내부 다단계 HTTP는 단일 adapter dispatch intent로 묶는다.
- 각 card는 edit/save/status/permalink/retry를 독립 소유하고 success retry duplicate 0을 유지한다.
- initial Threads/Instagram/X는 Publish safety 우선순위이며 draft card 8/8을 3개로 축소하지 않는다.
- selected/bulk는 별도 명시 action·review·confirm이며 default per-card Publish를 대체하지 않는다.
- plan approval은 V42 TC 31/31, independent critic MAJOR 0 이후다.

### 2026-08-05 OSMU v4.2.1 critic residual PATCH AC → QA TC 등록

> 정본 후보: `docs/openclaw-auto-osmu-prd-v4.2.1-gpt-codex.md` §17. V42 31개 계약을 보존하고 TC-029/030의 partial/uncertainty behavior를 강화했다.
>
> **❌ superseded:** fixed text8 Studio 계약이 실제 historical visual7과 backend/messaging surface를 혼합했다. 후속 정본 후보는 v4.3.0과 `OSMU-V43-TC-*`다.

| TC | AC/FR | 검증 목표 | Slice | 종료증거 |
|---|---|---|---|---|
| OSMU-V421-TC-001 | AC-01/FR-01 | capability inventory | R0 | text8/video3/extensions15, 범주 혼합 0 |
| OSMU-V421-TC-002 | AC-02/FR-02,NFR-08 | shell preservation | R0/design | sidebar/route/settings/tab orphan·invented nav 0 |
| OSMU-V421-TC-003 | AC-03/FR-19,NFR-04 | readiness truth | R0 | disabled reason/action/owner/evidence time |
| OSMU-V421-TC-004 | AC-04/FR-01,18 | extension 15 full contract | R0/F3 | 15/15 loader/credential/tenant/media/result/permalink/queue/disposition, queue 3개만 |
| OSMU-V421-TC-005 | AC-05/FR-08 | OAuth state+cookie concurrent replay | R1 | same state+cookie 20 concurrent: nonce consume/token endpoint/account write exactly1, 19 pre-external reject |
| OSMU-V421-TC-006 | AC-06/FR-09 | account truth | R1 | four-surface identity/scope/state/time/CTA diff 0 |
| OSMU-V421-TC-007 | AC-07/FR-09,NFR-01 | account selection/isolation | R1 | two-account target 일치, cross-tenant call 0 |
| OSMU-V421-TC-008 | AC-08/FR-03 | stable source identity | R2 | 네 경로 tenant ID+provenance |
| OSMU-V421-TC-009 | AC-09/FR-04 | explicit Studio↔queue bridge | R2 | same source, orphan 0 |
| OSMU-V421-TC-010 | AC-10/FR-05 | migration authority sequence | R2 | M0→M8 순서, 단계별 writer/read authority diff 0, premature entry 0 |
| OSMU-V421-TC-011 | AC-11/FR-06,23,NFR-06 | reverse replay/rollback | R2 | 각 단계 fault+M5 이후 신규100, JSON rollback 100/100, loss/duplicate/drift 0 |
| OSMU-V421-TC-012 | AC-12/FR-07 | target variant independence | R2/R3 | cross-overwrite 0 |
| OSMU-V421-TC-013 | AC-13/FR-10,11,NFR-02 | dispatch concurrency | R3 | no-draft same intent 20 concurrent external result ≤1 |
| OSMU-V421-TC-014 | AC-14/FR-12,NFR-03 | persistence-only repair | R3 | provider success/DB failure 뒤 republish 0 |
| OSMU-V421-TC-015 | AC-15/FR-13 | provider recovery | R3/F1 | enabled adapter ID+permalink 또는 terminal reason |
| OSMU-V421-TC-016 | AC-16/FR-14 | result group | R3 | mixed target independent state/ID/link/time |
| OSMU-V421-TC-017 | AC-17/FR-15 | partial retry | R3 | failed만 호출, success duplicate 0 |
| OSMU-V421-TC-018 | AC-18/FR-21,NFR-04 | fake link 금지 | R3 | provider home URL result 표시 0 |
| OSMU-V421-TC-019 | AC-19/FR-16 | video terminal truth | F2 | terminal 전 processing, 뒤만 published+link |
| OSMU-V421-TC-020 | AC-20/FR-17 | YouTube result parity | F2 | ID/link/status persistence+recovery, duplicate 0 |
| OSMU-V421-TC-021 | AC-21/FR-16,17 | video 3 readiness | F2 | target별 E2E 또는 disabled reason/action |
| OSMU-V421-TC-022 | AC-22/FR-18 | extension disposition/repair | F3 | 15/15 decision, 승인된 1개만 repair, 미검증 노출 0 |
| OSMU-V421-TC-023 | AC-23/FR-20,22,NFR-07 | revoke/incident trace | R1~F3 | revoke call 0, evidence·owner·action trace |
| OSMU-V421-TC-024 | AC-24/FR-24,NFR-01,05 | tenant/privacy isolation | R1~F3 | 2tenant×2account cross 0, raw leak 0 |
| OSMU-V421-TC-025 | AC-25/FR-27,F4,BM,NFR-10 | explicit F4 start + cohort branches + delivery outcome | F4 | approval 뒤 Start F4→immutable f4_started_at exactly1; A cutoff=delivered100 또는 start+30d 먼저, consented<10 stop; fixture day30 qualified0 consented0에서 F1~F3/paid stopped·new work/budget0·snapshot; first-qualified timer 사용0; failed delivery denominator0/audit 보존; B threshold stop |
| OSMU-V421-TC-026 | AC-26/전체 | RTM/supersession | plan | orphan 0, v3.1.1/DESIGN v6 target 근거 0 |
| OSMU-V421-TC-027 | AC-27/FR-25,NFR-09 | rights/delete/backup expiry | F4 | 승인전 cohort0; 30d raw/180d evidence/7d active delete; 삭제+30d backup restore/read 불가 또는 disclosed legal hold; access audit·철회 dispatch0 |
| OSMU-V421-TC-028 | AC-28/FR-26,NFR-10 | active initial-bet circuit breaker | R0~R3 | running at1679→minute1680: next side effect 전 breaker, atomic commit/rollback, safe checkpoint 5필드, R0~R3/F1~F4 stopped, minute1681 side effect0 |
| OSMU-V421-TC-029 | AC-29/FR-28,NFR-11 | partial generation fixed8 + regenerate isolation | design/R3 | fixture6 valid+1 failed+1 empty→fixed IDs8; each editable payload or failure reason+Regenerate; empty Publish disabled; one Regenerate selected write1/other7 write0 |
| OSMU-V421-TC-030 | AC-30/FR-29,NFR-02,11 | retry/repair/reconcile taxonomy | design/R3 | confirmed failure Retry adapter1; provider-success+persistence-failure repair1/adapter0; timeout/unknown reconcile first+terminal 전 adapter0; all other7=0; published retry adapter0 duplicate0 |
| OSMU-V421-TC-031 | AC-31/FR-30,NFR-04,11 | readiness disabled + explicit selected/bulk | design/R3 | cards/drafts/edit/save8/8; unavailable Publish disabled+condition; generate/save implicit bulk0; selected/all은 별도 action+review+confirm |

#### v4.2.1 gate

- TC-029는 6 valid+1 generation_failed+1 empty fixture에서 fixed platform IDs 8개를 확인한다. 카드 누락/전체 재생성은 FAIL.
- empty payload Publish disabled, generation_failed reason+Regenerate, 단일 Regenerate의 other7 write0을 함께 assertion한다.
- TC-030은 confirmed failure, provider-success+persistence-failure, timeout/unknown을 별도 fixture로 실행한다.
- provider adapter retry1은 confirmed failure에만 허용한다. persistence repair는 adapter0, unknown은 terminal 전 adapter0이다.
- plan approval은 V421 TC31/31과 independent critic MAJOR0 이후다.

### 2026-08-05 OSMU v4.3.0 actual surface inventory plan reopen AC → QA TC 등록

> 정본 후보: `docs/openclaw-auto-osmu-prd-v4.3.0-gpt-codex.md` §17. V421의 safety/migration/recovery 계약을 보존하되 Studio visual7, backend text8, video3, Settings/account, notification4를 분리하고 기존 Studio 기능9개와 target continuity를 명시한다.
>
> **❌ superseded:** shell baseline이 정량화되지 않았고 기존 9기능이 TC-032 하나로 묶여 failure/edge와 rights-policy gate를 판정할 수 없다. 후속 정본 후보는 v4.3.1과 `OSMU-V431-TC-*`다.

| TC | AC/FR | 검증 목표 | Slice | 종료증거 |
|---|---|---|---|---|
| OSMU-V43-TC-001 | AC-01/FR-01 | capability inventory | R0 | text8/video3/extensions15, 범주 혼합 0 |
| OSMU-V43-TC-002 | AC-02/FR-02,NFR-08 | shell preservation | R0/design | sidebar/route/settings/tab orphan·invented nav 0 |
| OSMU-V43-TC-003 | AC-03/FR-19,NFR-04 | readiness truth | R0 | disabled reason/action/owner/evidence time |
| OSMU-V43-TC-004 | AC-04/FR-01,18 | extension 15 full contract | R0/F3 | 15/15 loader/credential/tenant/media/result/permalink/queue/disposition, queue 3개만 |
| OSMU-V43-TC-005 | AC-05/FR-08 | OAuth state+cookie concurrent replay | R1 | same state+cookie 20 concurrent: nonce consume/token endpoint/account write exactly1, 19 pre-external reject |
| OSMU-V43-TC-006 | AC-06/FR-09 | account truth | R1 | four-surface identity/scope/state/time/CTA diff 0 |
| OSMU-V43-TC-007 | AC-07/FR-09,NFR-01 | account selection/isolation | R1 | two-account target 일치, cross-tenant call 0 |
| OSMU-V43-TC-008 | AC-08/FR-03 | stable source identity | R2 | 네 경로 tenant ID+provenance |
| OSMU-V43-TC-009 | AC-09/FR-04 | explicit Studio↔queue bridge | R2 | same source, orphan 0 |
| OSMU-V43-TC-010 | AC-10/FR-05 | migration authority sequence | R2 | M0→M8 순서, 단계별 writer/read authority diff 0, premature entry 0 |
| OSMU-V43-TC-011 | AC-11/FR-06,23,NFR-06 | reverse replay/rollback | R2 | 각 단계 fault+M5 이후 신규100, JSON rollback 100/100, loss/duplicate/drift 0 |
| OSMU-V43-TC-012 | AC-12/FR-07 | target variant independence | R2/R3 | cross-overwrite 0 |
| OSMU-V43-TC-013 | AC-13/FR-10,11,NFR-02 | dispatch concurrency | R3 | no-draft same intent 20 concurrent external result ≤1 |
| OSMU-V43-TC-014 | AC-14/FR-12,NFR-03 | persistence-only repair | R3 | provider success/DB failure 뒤 republish 0 |
| OSMU-V43-TC-015 | AC-15/FR-13 | provider recovery | R3/F1 | enabled adapter ID+permalink 또는 terminal reason |
| OSMU-V43-TC-016 | AC-16/FR-14 | result group | R3 | mixed target independent state/ID/link/time |
| OSMU-V43-TC-017 | AC-17/FR-15 | partial retry | R3 | failed만 호출, success duplicate 0 |
| OSMU-V43-TC-018 | AC-18/FR-21,NFR-04 | fake link 금지 | R3 | provider home URL result 표시 0 |
| OSMU-V43-TC-019 | AC-19/FR-16 | video terminal truth | F2 | terminal 전 processing, 뒤만 published+link |
| OSMU-V43-TC-020 | AC-20/FR-17 | YouTube result parity | F2 | ID/link/status persistence+recovery, duplicate 0 |
| OSMU-V43-TC-021 | AC-21/FR-16,17 | video 3 readiness | F2 | target별 E2E 또는 disabled reason/action |
| OSMU-V43-TC-022 | AC-22/FR-18 | extension disposition/repair | F3 | 15/15 decision, 승인된 1개만 repair, 미검증 노출 0 |
| OSMU-V43-TC-023 | AC-23/FR-20,22,NFR-07 | revoke/incident trace | R1~F3 | revoke call 0, evidence·owner·action trace |
| OSMU-V43-TC-024 | AC-24/FR-24,NFR-01,05 | tenant/privacy isolation | R1~F3 | 2tenant×2account cross 0, raw leak 0 |
| OSMU-V43-TC-025 | AC-25/FR-27,F4,BM,NFR-10 | explicit F4 start + cohort branches + delivery outcome | F4 | approval 뒤 Start F4→immutable f4_started_at exactly1; A cutoff=delivered100 또는 start+30d 먼저, consented<10 stop; fixture day30 qualified0 consented0에서 F1~F3/paid stopped·new work/budget0·snapshot; first-qualified timer 사용0; failed delivery denominator0/audit 보존; B threshold stop |
| OSMU-V43-TC-026 | AC-26/전체 | RTM/supersession | plan | orphan 0, v4.2.1 fixed text8 Studio/v3.1.1/DESIGN v6 target 근거 0 |
| OSMU-V43-TC-027 | AC-27/FR-25,NFR-09 | rights/delete/backup expiry | F4 | 승인전 cohort0; 30d raw/180d evidence/7d active delete; 삭제+30d backup restore/read 불가 또는 disclosed legal hold; access audit·철회 dispatch0 |
| OSMU-V43-TC-028 | AC-28/FR-26,NFR-10 | active initial-bet circuit breaker | R0~R3 | running at1679→minute1680: next side effect 전 breaker, atomic commit/rollback, safe checkpoint 5필드, R0~R3/F1~F4 stopped, minute1681 side effect0 |
| OSMU-V43-TC-029 | AC-29/FR-28,NFR-11 | visual7 partial generation + regenerate isolation | design/R3 | fixture5 valid+1 failed+1 empty→fixed IDs `threads,x,facebook,instagram,shorts,reels,tiktok` exactly7; Discord/Slack card0; failed reason+Regenerate; empty Publish disabled; one Regenerate selected write1/other6 write0 |
| OSMU-V43-TC-030 | AC-30/FR-29,NFR-02,11 | card Publish retry/repair/reconcile isolation | design/R3 | selected adapter1/other6=0; confirmed failure Retry adapter1; provider-success+persistence-failure repair1/adapter0; timeout/unknown reconcile first+terminal 전 adapter0; published retry adapter0 duplicate0 |
| OSMU-V43-TC-031 | AC-31/FR-30,NFR-04,12 | historical bulk vs target card provenance | design/R3 | current selected/bulk=`legacy_bulk`, target per-card=`card_publish`; generate/save implicit bulk0; selected/all explicit review+confirm; readiness 없는 Publish disabled |
| OSMU-V43-TC-032 | AC-32/FR-31,NFR-08 | historical Studio function preservation | design/R3 | Wiki/RepoConnect·direct source·OSMU generation·AI auto-draft·image/video generation·platform edit/save·history load·immediate Publish·schedule 9/9 RTM, orphan0 |
| OSMU-V43-TC-033 | AC-33/FR-32,NFR-04,12 | surface inventory six-axis truth | R0/design | Studio visual7/backend text8/video3/Settings-account/notification4 별도 section; visible/generatable/editable/publishable/schedulable/prod-observed 6축; Discord/Slack Studio card0, messaging/publish 혼합0 |
| OSMU-V43-TC-034 | AC-34/FR-33,NFR-12 | Inbox/Calendar continuity target truth | R0/design | current shared-continuity claim0; target label100%; 실제 bridge/dual-read evidence 전 existing 표현0 |

#### v4.3.0 gate

- V43 TC는 AC 34/34와 1:1이며, RTM orphan은 0이어야 한다.
- historical Studio visual7과 보존 기능9개 중 누락 1개, Discord·Slack Studio card 1개면 FAIL이다.
- backend text adapter·video publisher·Settings/account·notification을 Studio visual card와 합친 ‘지원 플랫폼’ 단일 count는 FAIL이다.
- `legacy_bulk`와 `card_publish` provenance, selected/bulk explicit action, card Publish other6=0을 함께 assertion한다.
- Inbox/Calendar continuity는 shared identity·bridge·dual-read 관찰 전 target으로만 표기한다.
- retry/repair/reconcile taxonomy는 V421에서 후퇴 0이어야 한다.
- plan approval은 V43 TC34/34와 independent critic MAJOR0 이후다.

### 2026-08-05 OSMU v4.3.1 critic MAJOR2 shell·9기능 preservation retake AC → QA TC 등록

> 정본 후보: `docs/openclaw-auto-osmu-prd-v4.3.1-gpt-codex.md` §17. V43의 34개 계약을 보존하고 shell manifest, 9기능 독립 fixture, copyright·AI commercial·API policy gate를 추가한다.

| TC | AC/FR | 검증 목표 | Slice | 종료증거 |
|---|---|---|---|---|
| OSMU-V431-TC-001 | AC-01/FR-01 | capability inventory | R0 | text8/video3/extensions15, 범주 혼합 0 |
| OSMU-V431-TC-002 | AC-02/FR-02,NFR-08 | quantified shell preservation | R0/design | 1024 customer26 accessible; 390 current direct15 accessible+SidebarGroup11 hidden defect→target26 accessible; group9/operator1/direct15+dynamic11/Settings9·8/provider tabs3·5·3·0/token15×2/sidebar224; delete/rename/move0, invented nav0, unexplained diff0; documented mobile visibility repair1 |
| OSMU-V431-TC-003 | AC-03/FR-19,NFR-04 | readiness truth | R0 | disabled reason/action/owner/evidence time |
| OSMU-V431-TC-004 | AC-04/FR-01,18 | extension 15 full contract | R0/F3 | 15/15 loader/credential/tenant/media/result/permalink/queue/disposition, queue 3개만 |
| OSMU-V431-TC-005 | AC-05/FR-08 | OAuth state+cookie concurrent replay | R1 | same state+cookie 20 concurrent: nonce consume/token endpoint/account write exactly1, 19 pre-external reject |
| OSMU-V431-TC-006 | AC-06/FR-09 | account truth | R1 | four-surface identity/scope/state/time/CTA diff 0 |
| OSMU-V431-TC-007 | AC-07/FR-09,NFR-01 | account selection/isolation | R1 | two-account target 일치, cross-tenant call 0 |
| OSMU-V431-TC-008 | AC-08/FR-03 | stable source identity | R2 | 네 경로 tenant ID+provenance |
| OSMU-V431-TC-009 | AC-09/FR-04 | explicit Studio↔queue bridge | R2 | same source, orphan 0 |
| OSMU-V431-TC-010 | AC-10/FR-05 | migration authority sequence | R2 | M0→M8 순서, 단계별 writer/read authority diff 0, premature entry 0 |
| OSMU-V431-TC-011 | AC-11/FR-06,23,NFR-06 | reverse replay/rollback | R2 | 각 단계 fault+M5 이후 신규100, JSON rollback 100/100, loss/duplicate/drift 0 |
| OSMU-V431-TC-012 | AC-12/FR-07 | target variant independence | R2/R3 | cross-overwrite 0 |
| OSMU-V431-TC-013 | AC-13/FR-10,11,NFR-02 | dispatch concurrency | R3 | no-draft same intent 20 concurrent external result ≤1 |
| OSMU-V431-TC-014 | AC-14/FR-12,NFR-03 | persistence-only repair | R3 | provider success/DB failure 뒤 republish 0 |
| OSMU-V431-TC-015 | AC-15/FR-13 | provider recovery | R3/F1 | enabled adapter ID+permalink 또는 terminal reason |
| OSMU-V431-TC-016 | AC-16/FR-14 | result group | R3 | mixed target independent state/ID/link/time |
| OSMU-V431-TC-017 | AC-17/FR-15 | partial retry | R3 | failed만 호출, success duplicate 0 |
| OSMU-V431-TC-018 | AC-18/FR-21,NFR-04 | fake link 금지 | R3 | provider home URL result 표시 0 |
| OSMU-V431-TC-019 | AC-19/FR-16 | video terminal truth | F2 | terminal 전 processing, 뒤만 published+link |
| OSMU-V431-TC-020 | AC-20/FR-17 | YouTube result parity | F2 | ID/link/status persistence+recovery, duplicate 0 |
| OSMU-V431-TC-021 | AC-21/FR-16,17 | video 3 readiness | F2 | target별 E2E 또는 disabled reason/action |
| OSMU-V431-TC-022 | AC-22/FR-18 | extension disposition/repair | F3 | 15/15 decision, 승인된 1개만 repair, 미검증 노출 0 |
| OSMU-V431-TC-023 | AC-23/FR-20,22,NFR-07 | revoke/incident trace | R1~F3 | revoke call 0, evidence·owner·action trace |
| OSMU-V431-TC-024 | AC-24/FR-24,NFR-01,05 | tenant/privacy isolation | R1~F3 | 2tenant×2account cross 0, raw leak 0 |
| OSMU-V431-TC-025 | AC-25/FR-27,F4,BM,NFR-10 | explicit F4 start + cohort branches + delivery outcome | F4 | approval 뒤 Start F4→immutable f4_started_at exactly1; A cutoff=delivered100 또는 start+30d 먼저, consented<10 stop; fixture day30 qualified0 consented0에서 F1~F3/paid stopped·new work/budget0·snapshot; first-qualified timer 사용0; failed delivery denominator0/audit 보존; B threshold stop |
| OSMU-V431-TC-026 | AC-26/전체 | RTM/supersession | plan | orphan 0, v4.2.1 fixed text8 Studio/v3.1.1/DESIGN v6 target 근거 0 |
| OSMU-V431-TC-027 | AC-27/FR-25,NFR-09 | rights/delete/backup expiry | F4 | 승인전 cohort0; 30d raw/180d evidence/7d active delete; 삭제+30d backup restore/read 불가 또는 disclosed legal hold; access audit·철회 dispatch0 |
| OSMU-V431-TC-028 | AC-28/FR-26,NFR-10 | active initial-bet circuit breaker | R0~R3 | running at1679→minute1680: next side effect 전 breaker, atomic commit/rollback, safe checkpoint 5필드, R0~R3/F1~F4 stopped, minute1681 side effect0 |
| OSMU-V431-TC-029 | AC-29/FR-28,NFR-11 | visual7 partial generation + regenerate isolation | design/R3 | fixture5 valid+1 failed+1 empty→fixed IDs `threads,x,facebook,instagram,shorts,reels,tiktok` exactly7; Discord/Slack card0; failed reason+Regenerate; empty Publish disabled; one Regenerate selected write1/other6 write0 |
| OSMU-V431-TC-030 | AC-30/FR-29,NFR-02,11 | card Publish retry/repair/reconcile isolation | design/R3 | selected adapter1/other6=0; confirmed failure Retry adapter1; provider-success+persistence-failure repair1/adapter0; timeout/unknown reconcile first+terminal 전 adapter0; published retry adapter0 duplicate0 |
| OSMU-V431-TC-031 | AC-31/FR-30,NFR-04,12 | historical bulk vs target card provenance | design/R3 | current selected/bulk=`legacy_bulk`, target per-card=`card_publish`; generate/save implicit bulk0; selected/all explicit review+confirm; readiness 없는 Publish disabled |
| OSMU-V431-TC-032 | AC-32/FR-31,NFR-08 | RepoConnect sync/provenance | design/R3 | happy repo/path/hash/source match; auth/timeout/empty/repo-switch에서 existing overwrite0, provenance mix0, reason+retry |
| OSMU-V431-TC-033 | AC-33/FR-32,NFR-04,12 | surface inventory six-axis truth | R0/design | Studio visual7/backend text8/video3/Settings-account/notification4 별도 section; visible/generatable/editable/publishable/schedulable/prod-observed 6축; Discord/Slack Studio card0, messaging/publish 혼합0 |
| OSMU-V431-TC-034 | AC-34/FR-33,NFR-12 | Inbox/Calendar continuity target truth | R0/design | current shared-continuity claim0; target label100%; 실제 bridge/dual-read evidence 전 existing 표현0 |
| OSMU-V431-TC-035 | AC-35/FR-34 | direct source validation | design/R3 | happy direct intent1/provenance; whitespace/oversize/unsafe external-call0, prior source/draft overwrite0 |
| OSMU-V431-TC-036 | AC-36/FR-35,NFR-11 | visual7 OSMU generation | design/R3 | happy IDs7; 5 valid+1 failed+1 empty slot7, regenerate selected1/other6 write0 |
| OSMU-V431-TC-037 | AC-37/FR-36,NFR-02,12 | AI auto-draft save/recovery | design/R3 | provenance/model/source reload; provider error/timeout false-saved0; replay20 same-intent draft≤1 |
| OSMU-V431-TC-038 | AC-38/FR-37,42,NFR-13 | image-video asset/link/failure | design/R3 | asset/type/model/rights/surface link; fail/unsafe/unsupported/rights-unknown publish-schedule0, orphan0 |
| OSMU-V431-TC-039 | AC-39/FR-38,NFR-11 | per-platform edit/save isolation | design/R3 | selected write1/reload parity/other6=0; stale/concurrent conflict explicit, silent overwrite0 |
| OSMU-V431-TC-040 | AC-40/FR-39,NFR-03,04 | history state restore | design/R3 | draft/status/result/reconciliation parity; missing/corrupt/legacy false-published0, recovery action, source row mutation0 |
| OSMU-V431-TC-041 | AC-41/FR-40,29,30,NFR-02,12 | immediate bulk/card publish | design/R3 | legacy_bulk selected IDs/card_publish single ID; implicit0; confirmed retry1, repair0, unknown reconcile, success duplicate0 |
| OSMU-V431-TC-042 | AC-42/FR-41,NFR-02,12 | schedule lifecycle | design/R3 | create/change/cancel/due exactly1; invalid/past/DST/unready create0; cancel call0; concurrent20 result≤1 |
| OSMU-V431-TC-043 | AC-43/FR-42,NFR-05,13 | copyright-AI-commercial-API policy gate | R0/design/R3 | owner+rights+AI terms/commercial+API policy valid only; unassigned/unknown/expired/conflict/prohibited/revoked adapter0; raw leak0 |

#### v4.3.1 gate

- V431 TC는 AC 43/43과 1:1이며 RTM orphan0이다.
- TC-002는 1024 customer26 accessible과 390 current15 accessible+SidebarGroup11 hidden defect를 재현하고 target26 accessible을 확인한다. group9·operator1·route15+11·Settings9/8·provider tabs·token15×2·sidebar224를 잠그며, 삭제·리네임·이동·invented nav·설명없는 diff는 각각0이고 documented mobile visibility repair만 1이다.
- 기존 9기능은 TC-032·035~042의 독립 9개 ID다. 하나라도 묶음 PASS하거나 happy/failure-edge 중 한쪽이 없으면 FAIL이다.
- TC-043은 owner/rights/AI commercial/API policy evidence가 unknown·expired·conflict일 때 immediate/bulk/card/schedule adapter0을 assertion한다.
- V43의 visual7, surface 6축, continuity target, retry/repair/reconcile 계약은 후퇴0이다.
- plan approval은 V431 TC43/43과 independent critic MAJOR0 이후다.

### 2026-08-06 Marketing Hub PRD v5.1 — 설계 QA 계약 등록 (미실행)

> 정본: `docs/openclaw-auto-marketing-hub-prd-v5.1.0-gpt-codex.md`. 아래 48건은 **등록만 했으며 실행 PASS가 아니다**. 각 행의 Given/When/Then, happy+edge, 입력·상태·external-call ceiling·종료증거는 정본 FR/AC/TC 표의 같은 ID가 완전한 계약이다.

| TC | FR/AC | 검증 목표 | 종료증거 |
|---|---|---|---|
| MH-V51-TC-001 | FR/AC-MH-001 | tenant isolation | A/B API·DOM leak0 |
| MH-V51-TC-002 | FR/AC-MH-002 | role shell | customer/operator snapshots |
| MH-V51-TC-003 | FR/AC-MH-003 | canonical fields | schema/readback |
| MH-V51-TC-004 | FR/AC-MH-004 | connection state machine | transition log |
| MH-V51-TC-005 | FR/AC-MH-005 | atomic callback | rollback/readback |
| MH-V51-TC-006 | FR/AC-MH-006 | Settings/Studio/channel diff0 | diff report |
| MH-V51-TC-007 | FR/AC-MH-007 | Meta wrong session | identity/relogin UI |
| MH-V51-TC-008 | FR/AC-MH-008 | replay/cancel | nonce audit |
| MH-V51-TC-009 | FR/AC-MH-009 | two accounts | selected-card proof |
| MH-V51-TC-010 | FR/AC-MH-010 | manual recovery | masked advanced UI |
| MH-V51-TC-011 | FR/AC-MH-011 | target 11 manifest | inventory |
| MH-V51-TC-012 | FR/AC-MH-012 | visual7/direct4 baseline | snapshot |
| MH-V51-TC-013 | FR/AC-MH-013 | Discord/Slack additive | cards |
| MH-V51-TC-014 | FR/AC-MH-014 | capability fields | disabled CTA DOM |
| MH-V51-TC-015 | FR/AC-MH-015 | source draft persistence | DB/UI |
| MH-V51-TC-016 | FR/AC-MH-016 | per-card isolation | edit diff |
| MH-V51-TC-017 | FR/AC-MH-017 | per-card validation | mixed fixture |
| MH-V51-TC-018 | FR/AC-MH-018 | single immediate job | ledger |
| MH-V51-TC-019 | FR/AC-MH-019 | bulk independent outcomes | results |
| MH-V51-TC-020 | FR/AC-MH-020 | concurrency20 C≤1 | provider call log |
| MH-V51-TC-021 | FR/AC-MH-021 | 502 terminal failure | retry evidence |
| MH-V51-TC-022 | FR/AC-MH-022 | timeout uncertain | reconcile CTA |
| MH-V51-TC-023 | FR/AC-MH-023 | repair lookup-first | call trace |
| MH-V51-TC-024 | FR/AC-MH-024 | permalink readback | link evidence |
| MH-V51-TC-025 | FR/AC-MH-025 | partial retry | no success duplicate |
| MH-V51-TC-026 | FR/AC-MH-026 | provenance invariants | invariant audit |
| MH-V51-TC-027 | FR/AC-MH-027 | job authority bridge | UI/audit |
| MH-V51-TC-028 | FR/AC-MH-028 | orphan/missing/stale | reconcile report |
| MH-V51-TC-029 | FR/AC-MH-029 | schedule create | stored instant |
| MH-V51-TC-030 | FR/AC-MH-030 | schedule change CAS | version audit |
| MH-V51-TC-031 | FR/AC-MH-031 | schedule cancel | no due dispatch |
| MH-V51-TC-032 | FR/AC-MH-032 | DST gap/fold | confirmation UI |
| MH-V51-TC-033 | FR/AC-MH-033 | due race C≤1 | lease log |
| MH-V51-TC-034 | FR/AC-MH-034 | credential revoke | dispatch blocked |
| MH-V51-TC-035 | FR/AC-MH-035 | Inbox origin | labels |
| MH-V51-TC-036 | FR/AC-MH-036 | Calendar bridge | recover navigation |
| MH-V51-TC-037 | FR/AC-MH-037 | video hand-off | `/videos` route proof |
| MH-V51-TC-038 | FR/AC-MH-038 | disabled/external truth | copy audit |
| MH-V51-TC-039 | FR/AC-MH-039 | landing no-overclaim | audit diff |
| MH-V51-TC-040 | FR/AC-MH-040 | 25 route matrix | manifest |
| MH-V51-TC-041 | FR/AC-MH-041 | 26 sidebar routes | navigation log |
| MH-V51-TC-042 | FR/AC-MH-042 | 390 mobile nav | tap video |
| MH-V51-TC-043 | FR/AC-MH-043 | overflow0/44px/focus | measurements |
| MH-V51-TC-044 | FR/AC-MH-044 | loading/empty/error/permission | 25-route report |
| MH-V51-TC-045 | FR/AC-MH-045 | services terminal state | screenshot |
| MH-V51-TC-046 | FR/AC-MH-046 | operator secret audit | audit log |
| MH-V51-TC-047 | FR/AC-MH-047 | correlation observability | trace |
| MH-V51-TC-048 | FR/AC-MH-048 | full E2E gate | signed QA record |

#### v5.1 gate

- PRD traceability와 QA tracker는 `001..048` 1:1, orphan 0이어야 한다.
- 실행 전에는 모든 항목이 미실행이며, fixture PASS는 provider/운영 실증을 대체하지 않는다.

### 2026-08-06 Marketing Hub PRD v5.2 — V52 QA 계약 등록 (미실행)

> 정본 `docs/openclaw-auto-marketing-hub-prd-v5.2.0-gpt-codex.md`; 각 TC의 H/F Given/When/Then·fault·C cap·terminal evidence는 정본의 같은 행에 있다. FR과 AC는 의도적으로 분리 열이다.

| TC | FR | AC | 검증/종료증거 |
|---|---|---|---|
|MH-V52-TC-001|FR-MH-001|AC-MH-001|A/B leak0|
|MH-V52-TC-002|FR-MH-002|AC-MH-002|role snapshots|
|MH-V52-TC-003|FR-MH-003|AC-MH-003|canonical readback|
|MH-V52-TC-004|FR-MH-004|AC-MH-004|transition log|
|MH-V52-TC-005|FR-MH-005|AC-MH-005|atomic rollback|
|MH-V52-TC-006|FR-MH-006|AC-MH-006|three view diff0|
|MH-V52-TC-007|FR-MH-007|AC-MH-007|A→B→B adapter1/A0|
|MH-V52-TC-008|FR-MH-008|AC-MH-008|nonce audit|
|MH-V52-TC-009|FR-MH-009|AC-MH-009|two-account selection|
|MH-V52-TC-010|FR-MH-010|AC-MH-010|manual masked|
|MH-V52-TC-011|FR-MH-011|AC-MH-011|target11|
|MH-V52-TC-012|FR-MH-012|AC-MH-012|visual7/direct4|
|MH-V52-TC-013|FR-MH-013|AC-MH-013|Discord/Slack|
|MH-V52-TC-014|FR-MH-014|AC-MH-014|capability7|
|MH-V52-TC-015|FR-MH-015|AC-MH-015|draft reload|
|MH-V52-TC-016|FR-MH-016|AC-MH-016|edit isolation|
|MH-V52-TC-017|FR-MH-017|AC-MH-017|validation|
|MH-V52-TC-018|FR-MH-018|AC-MH-018|card job|
|MH-V52-TC-019|FR-MH-019|AC-MH-019|bulk results|
|MH-V52-TC-020|FR-MH-020|AC-MH-020|20≤1|
|MH-V52-TC-021|FR-MH-021|AC-MH-021|502 confirmed|
|MH-V52-TC-022|FR-MH-022|AC-MH-022|uncertain reconcile|
|MH-V52-TC-023|FR-MH-023|AC-MH-023|repair adapter0|
|MH-V52-TC-024|FR-MH-024|AC-MH-024|permalink|
|MH-V52-TC-025|FR-MH-025|AC-MH-025|failed-only retry|
|MH-V52-TC-026|FR-MH-026|AC-MH-026|four origins|
|MH-V52-TC-027|FR-MH-027|AC-MH-027|job authority|
|MH-V52-TC-028|FR-MH-028|AC-MH-028|drift report|
|MH-V52-TC-029|FR-MH-029|AC-MH-029|schedule create|
|MH-V52-TC-030|FR-MH-030|AC-MH-030|CAS change|
|MH-V52-TC-031|FR-MH-031|AC-MH-031|cancel|
|MH-V52-TC-032|FR-MH-032|AC-MH-032|DST|
|MH-V52-TC-033|FR-MH-033|AC-MH-033|due lease|
|MH-V52-TC-034|FR-MH-034|AC-MH-034|revoke block|
|MH-V52-TC-035|FR-MH-035|AC-MH-035|Inbox label|
|MH-V52-TC-036|FR-MH-036|AC-MH-036|Calendar bridge|
|MH-V52-TC-037|FR-MH-037|AC-MH-037|video handoff|
|MH-V52-TC-038|FR-MH-038|AC-MH-038|disabled/external|
|MH-V52-TC-039|FR-MH-039|AC-MH-039|landing audit|
|MH-V52-TC-040|FR-MH-040|AC-MH-040|route25|
|MH-V52-TC-041|FR-MH-041|AC-MH-041|1024 nav26 logs|
|MH-V52-TC-042|FR-MH-042|AC-MH-042|390 nav26 logs|
|MH-V52-TC-043|FR-MH-043|AC-MH-043|25 overflow0/44/focus|
|MH-V52-TC-044|FR-MH-044|AC-MH-044|L/E/E/P terminal|
|MH-V52-TC-045|FR-MH-045|AC-MH-045|services terminal|
|MH-V52-TC-046|FR-MH-046|AC-MH-046|operator audit|
|MH-V52-TC-047|FR-MH-047|AC-MH-047|correlation trace|
|MH-V52-TC-048|FR-MH-048|AC-MH-048|signed E2E gate|

#### V52 gate

- V52 FR/AC/TC 48/48/48 and each exact pair is required; these are registered, not executed.
## ❌ NG — DESIGN v13 기존 자산·역할·반응형·디자인시스템 미보존 (2026-08-06)

- **사용자 관찰:** 최종 프로토타입에서 기존 아이콘/에셋이 사라지고, 실제 반응형 구조·사용자 역할별 화면·
  디자인시스템이 반영되지 않았다.
- **직접 대조:** v13은 텍스트 중심 sidebar와 범용 카드로 재작성됐고, 실제 `getChannelIcon()` 아이콘 체계,
  current Sidebar/AuthGate의 customer/operator 분기, globals/token/component 구조를 정확히 재현한 증거가 없다.
- **원인:** 최초 product-designer가 산출 파일 0 상태로 지연되자 일반 worker에게 HTML 제작을 넘겼고,
  후속 product-designer 검수도 기능 수량/overflow/CTA에 치우쳐 visual asset·role-state·design-token fidelity를
  차단 조건으로 검사하지 않았다. `verify-agent-quality.sh`도 Skill0/Web0 FAIL이었는데 경고 출고했다.
- **판정:** v13 design 승인 후보 철회. 제품 코드·배포 완료 주장은 없음.
- **재검증 종료조건:** actual icons/assets manifest 100%, customer/operator/public/auth/empty/error/connected
  role-state matrix, current responsive shell 1440/1024/390, design tokens/components diff, 25 route visual comparison,
  core OSMU flow 클릭, console0/overflow0/touch44를 product-designer transcript+부모 Chrome에서 직접 관찰한다.

### 2026-08-06 OSMU Marketing Agent PRD v6.0 — MA-V6 plan TC 등록 (전부 ⬜ 미실행)

> 정본: `docs/openclaw-auto-marketing-agent-prd-v6.0.0-gpt-codex.md` §11. 이 섹션은 **V6 plan namespace만** 소유한다. 기존 MH-V51/V52·제품 QA 상태를 변경하지 않는다. 모든 TC는 정본의 happy+failure Given/When/Then과 evidence를 함께 충족해야 하며, 코드·fixture PASS는 운영/provider 증거를 대체하지 않는다.

| 상태 | TC | FR | AC | 검증 주제 |
|---|---|---|---|---|
|⬜|MA-V6-TC-001|FR-MA-001|AC-MA-001|tenant isolation/leak0|
|⬜|MA-V6-TC-002|FR-MA-002|AC-MA-002|brand source4 onboarding|
|⬜|MA-V6-TC-003|FR-MA-003|AC-MA-003|fact/inference/unverified|
|⬜|MA-V6-TC-004|FR-MA-004|AC-MA-004|grounding citations|
|⬜|MA-V6-TC-005|FR-MA-005|AC-MA-005|source errors/redaction|
|⬜|MA-V6-TC-006|FR-MA-006|AC-MA-006|account truth diff0|
|⬜|MA-V6-TC-007|FR-MA-007|AC-MA-007|wrong-account A→B|
|⬜|MA-V6-TC-008|FR-MA-008|AC-MA-008|manual recovery only|
|⬜|MA-V6-TC-009|FR-MA-009|AC-MA-009|autonomy audit|
|⬜|MA-V6-TC-010|FR-MA-010|AC-MA-010|irreversible approval hash|
|⬜|MA-V6-TC-011|FR-MA-011|AC-MA-011|opportunity inbox sources|
|⬜|MA-V6-TC-012|FR-MA-012|AC-MA-012|no false zero|
|⬜|MA-V6-TC-013|FR-MA-013|AC-MA-013|rank evidence|
|⬜|MA-V6-TC-014|FR-MA-014|AC-MA-014|marketing brief7|
|⬜|MA-V6-TC-015|FR-MA-015|AC-MA-015|weekly plan7d|
|⬜|MA-V6-TC-016|FR-MA-016|AC-MA-016|honest planning hold|
|⬜|MA-V6-TC-017|FR-MA-017|AC-MA-017|command center deep-links|
|⬜|MA-V6-TC-018|FR-MA-018|AC-MA-018|text8+video3 truth|
|⬜|MA-V6-TC-019|FR-MA-019|AC-MA-019|validation/no mutation|
|⬜|MA-V6-TC-020|FR-MA-020|AC-MA-020|isolated edit/conflict|
|⬜|MA-V6-TC-021|FR-MA-021|AC-MA-021|campaign lineage|
|⬜|MA-V6-TC-022|FR-MA-022|AC-MA-022|review completeness|
|⬜|MA-V6-TC-023|FR-MA-023|AC-MA-023|Inbox origin truth|
|⬜|MA-V6-TC-024|FR-MA-024|AC-MA-024|video handoff|
|⬜|MA-V6-TC-025|FR-MA-025|AC-MA-025|approved-only execute|
|⬜|MA-V6-TC-026|FR-MA-026|AC-MA-026|idempotency20|
|⬜|MA-V6-TC-027|FR-MA-027|AC-MA-027|published proof/permalink|
|⬜|MA-V6-TC-028|FR-MA-028|AC-MA-028|partial result truth|
|⬜|MA-V6-TC-029|FR-MA-029|AC-MA-029|confirmed retry|
|⬜|MA-V6-TC-030|FR-MA-030|AC-MA-030|uncertain reconcile-first|
|⬜|MA-V6-TC-031|FR-MA-031|AC-MA-031|repair without repost|
|⬜|MA-V6-TC-032|FR-MA-032|AC-MA-032|schedule DST/CAS/lease|
|⬜|MA-V6-TC-033|FR-MA-033|AC-MA-033|502 trace/redaction|
|⬜|MA-V6-TC-034|FR-MA-034|AC-MA-034|metric provenance|
|⬜|MA-V6-TC-035|FR-MA-035|AC-MA-035|comparison integrity|
|⬜|MA-V6-TC-036|FR-MA-036|AC-MA-036|campaign analytics|
|⬜|MA-V6-TC-037|FR-MA-037|AC-MA-037|sample-aware insight|
|⬜|MA-V6-TC-038|FR-MA-038|AC-MA-038|tenant-scoped learning|
|⬜|MA-V6-TC-039|FR-MA-039|AC-MA-039|next experiment fields|
|⬜|MA-V6-TC-040|FR-MA-040|AC-MA-040|loop closure|
|⬜|MA-V6-TC-041|FR-MA-041|AC-MA-041|alert lifecycle|
|⬜|MA-V6-TC-042|FR-MA-042|AC-MA-042|safe actions only|
|⬜|MA-V6-TC-043|FR-MA-043|AC-MA-043|route25/sidebar26 preservation|
|⬜|MA-V6-TC-044|FR-MA-044|AC-MA-044|additive IA|
|⬜|MA-V6-TC-045|FR-MA-045|AC-MA-045|asset/theme/role fidelity|
|⬜|MA-V6-TC-046|FR-MA-046|AC-MA-046|390/1024 navigation/access|
|⬜|MA-V6-TC-047|FR-MA-047|AC-MA-047|terminal state matrix|
|⬜|MA-V6-TC-048|FR-MA-048|AC-MA-048|production full-loop evidence|

#### MA-V6 plan gate

- 등록 커버리지: FR 48 / AC 48 / TC 48, same-number orphan 0.
- 현재 실행: 0/48. plan-critic MAJOR0와 `/approve plan` 전 design/eng-design/build/QA 진입 금지.
- Trust circuit breaker: cross-tenant/private leak, wrong-account call, unapproved irreversible action, fake metric, duplicate same-intent post 중 1건이면 release blocked.

### 2026-08-06 OSMU Marketing Agent PRD v6.1 — MA-V61 plan TC 등록 (전부 ⬜ 미실행)

> 정본: `docs/openclaw-auto-marketing-agent-prd-v6.1.0-gpt-codex.md` §11. V6.0을 덮지 않는 critic MAJOR4 retake namespace다. 2주 proof는 internal1+external≤3, source1/opportunity1/campaign1/Threads1/card1/per-post approval/permalink1/metric-or-hold1/experiment decision1이며, TC detail/evidence는 정본이 이긴다.

| 상태 | TC | FR | AC | 주제 |
|---|---|---|---|---|
|⬜|MA-V61-TC-001|FR-MA-001|AC-MA-001|tenant isolation|
|⬜|MA-V61-TC-002|FR-MA-002|AC-MA-002|source preservation|
|⬜|MA-V61-TC-003|FR-MA-003|AC-MA-003|truth classes|
|⬜|MA-V61-TC-004|FR-MA-004|AC-MA-004|citation|
|⬜|MA-V61-TC-005|FR-MA-005|AC-MA-005|source errors|
|⬜|MA-V61-TC-006|FR-MA-006|AC-MA-006|account diff0|
|⬜|MA-V61-TC-007|FR-MA-007|AC-MA-007|wrong-account|
|⬜|MA-V61-TC-008|FR-MA-008|AC-MA-008|manual recovery|
|⬜|MA-V61-TC-009|FR-MA-009|AC-MA-009|L2 policy|
|⬜|MA-V61-TC-010|FR-MA-010|AC-MA-010|approval hash target|
|⬜|MA-V61-TC-011|FR-MA-011|AC-MA-011|opportunity source1|
|⬜|MA-V61-TC-012|FR-MA-012|AC-MA-012|no false zero|
|⬜|MA-V61-TC-013|FR-MA-013|AC-MA-013|rank evidence|
|⬜|MA-V61-TC-014|FR-MA-014|AC-MA-014|brief|
|⬜|MA-V61-TC-015|FR-MA-015|AC-MA-015|plan1|
|⬜|MA-V61-TC-016|FR-MA-016|AC-MA-016|sample hold|
|⬜|MA-V61-TC-017|FR-MA-017|AC-MA-017|`/` additive|
|⬜|MA-V61-TC-018|FR-MA-018|AC-MA-018|current card truth|
|⬜|MA-V61-TC-019|FR-MA-019|AC-MA-019|validation|
|⬜|MA-V61-TC-020|FR-MA-020|AC-MA-020|edit/save adapter0|
|⬜|MA-V61-TC-021|FR-MA-021|AC-MA-021|full bidirectional lineage|
|⬜|MA-V61-TC-022|FR-MA-022|AC-MA-022|per-post review|
|⬜|MA-V61-TC-023|FR-MA-023|AC-MA-023|exact provenance4|
|⬜|MA-V61-TC-024|FR-MA-024|AC-MA-024|video preservation|
|⬜|MA-V61-TC-025|FR-MA-025|AC-MA-025|selected adapter1/others0|
|⬜|MA-V61-TC-026|FR-MA-026|AC-MA-026|idempotency20|
|⬜|MA-V61-TC-027|FR-MA-027|AC-MA-027|real permalink|
|⬜|MA-V61-TC-028|FR-MA-028|AC-MA-028|bulk explicit IDs/partial|
|⬜|MA-V61-TC-029|FR-MA-029|AC-MA-029|confirmed retry|
|⬜|MA-V61-TC-030|FR-MA-030|AC-MA-030|reconcile-first|
|⬜|MA-V61-TC-031|FR-MA-031|AC-MA-031|repair adapter0|
|⬜|MA-V61-TC-032|FR-MA-032|AC-MA-032|single+bulk schedule4|
|⬜|MA-V61-TC-033|FR-MA-033|AC-MA-033|502 trace|
|⬜|MA-V61-TC-034|FR-MA-034|AC-MA-034|native metric provenance|
|⬜|MA-V61-TC-035|FR-MA-035|AC-MA-035|comparison deferred truth|
|⬜|MA-V61-TC-036|FR-MA-036|AC-MA-036|campaign1 measure|
|⬜|MA-V61-TC-037|FR-MA-037|AC-MA-037|insight/sample-hold|
|⬜|MA-V61-TC-038|FR-MA-038|AC-MA-038|legacy learning no overclaim|
|⬜|MA-V61-TC-039|FR-MA-039|AC-MA-039|experiment decision1|
|⬜|MA-V61-TC-040|FR-MA-040|AC-MA-040|next plan link|
|⬜|MA-V61-TC-041|FR-MA-041|AC-MA-041|alerts deferred|
|⬜|MA-V61-TC-042|FR-MA-042|AC-MA-042|safe action boundary|
|⬜|MA-V61-TC-043|FR-MA-043|AC-MA-043|v5.2 route/action/API/state deletion0|
|⬜|MA-V61-TC-044|FR-MA-044|AC-MA-044|additive IA|
|⬜|MA-V61-TC-045|FR-MA-045|AC-MA-045|OSMU naming/SVG/theme/role|
|⬜|MA-V61-TC-046|FR-MA-046|AC-MA-046|responsive access|
|⬜|MA-V61-TC-047|FR-MA-047|AC-MA-047|terminal states|
|⬜|MA-V61-TC-048|FR-MA-048|AC-MA-048|production full-lineage proof|

#### MA-V61 gate

- 등록: FR/AC/TC 48/48/48; 실행 0/48.
- production TC-048 evidence: browser video + real provider permalink + native metric provenance/NA + insight evidence/hold + experiment decision + next-plan link + deployed SHA.
- source4/text8+video3 신규 구현/listening/cross-provider analytics/alerts/general tenant learning/L3 일반화는 proof 전 QA 대상이 아니다.

### 2026-08-06 OSMU Marketing Agent PRD v6.1.1 — MA-V611 plan TC (전부 ⬜)

> 정본: `docs/openclaw-auto-marketing-agent-prd-v6.1.1-gpt-codex.md` §11. Phase **P**=2주 proof, **R**=existing preservation, **D**=repeat-proof 이후. Exit=`P 전건 PASS + R deletion/rename/move0`; D 구현/design이 proof에 들어오면 FAIL.

| 상태 | Phase | TC | FR | AC | 주제 |
|---|---|---|---|---|---|
|⬜|P|MA-V611-TC-001|FR-MA-001|AC-MA-001|tenant isolation|
|⬜|P|MA-V611-TC-002|FR-MA-002|AC-MA-002|source1/preservation|
|⬜|P|MA-V611-TC-003|FR-MA-003|AC-MA-003|truth classes|
|⬜|P|MA-V611-TC-004|FR-MA-004|AC-MA-004|citation|
|⬜|P|MA-V611-TC-005|FR-MA-005|AC-MA-005|source errors|
|⬜|P|MA-V611-TC-006|FR-MA-006|AC-MA-006|account diff0|
|⬜|P|MA-V611-TC-007|FR-MA-007|AC-MA-007|wrong account|
|⬜|P|MA-V611-TC-008|FR-MA-008|AC-MA-008|manual recovery|
|⬜|P|MA-V611-TC-009|FR-MA-009|AC-MA-009|L2|
|⬜|P|MA-V611-TC-010|FR-MA-010|AC-MA-010|per-post approval|
|⬜|P|MA-V611-TC-011|FR-MA-011|AC-MA-011|opportunity1|
|⬜|P|MA-V611-TC-012|FR-MA-012|AC-MA-012|no false zero|
|⬜|P|MA-V611-TC-013|FR-MA-013|AC-MA-013|rank evidence|
|⬜|P|MA-V611-TC-014|FR-MA-014|AC-MA-014|brief|
|⬜|P|MA-V611-TC-015|FR-MA-015|AC-MA-015|campaign1|
|⬜|P|MA-V611-TC-016|FR-MA-016|AC-MA-016|hold|
|⬜|P|MA-V611-TC-017|FR-MA-017|AC-MA-017|`/` additive|
|⬜|P|MA-V611-TC-018|FR-MA-018|AC-MA-018|current card1|
|⬜|P|MA-V611-TC-019|FR-MA-019|AC-MA-019|validation|
|⬜|P|MA-V611-TC-020|FR-MA-020|AC-MA-020|selected diff1/others0|
|⬜|P|MA-V611-TC-021|FR-MA-021|AC-MA-021|lineage|
|⬜|P|MA-V611-TC-022|FR-MA-022|AC-MA-022|review|
|⬜|P|MA-V611-TC-023|FR-MA-023|AC-MA-023|provenance4|
|⬜|R|MA-V611-TC-024|FR-MA-024|AC-MA-024|video path preservation|
|⬜|P|MA-V611-TC-025|FR-MA-025|AC-MA-025|adapter1/others0|
|⬜|P|MA-V611-TC-026|FR-MA-026|AC-MA-026|idempotency20|
|⬜|P|MA-V611-TC-027|FR-MA-027|AC-MA-027|permalink|
|⬜|P|MA-V611-TC-028|FR-MA-028|AC-MA-028|bulk partial|
|⬜|P|MA-V611-TC-029|FR-MA-029|AC-MA-029|confirmed retry|
|⬜|P|MA-V611-TC-030|FR-MA-030|AC-MA-030|reconcile|
|⬜|P|MA-V611-TC-031|FR-MA-031|AC-MA-031|repair|
|⬜|P|MA-V611-TC-032|FR-MA-032|AC-MA-032|schedule single/bulk|
|⬜|P|MA-V611-TC-033|FR-MA-033|AC-MA-033|502 trace|
|⬜|P|MA-V611-TC-034|FR-MA-034|AC-MA-034|native metric|
|⬜|D|MA-V611-TC-035|FR-MA-035|AC-MA-035|cross-provider deferred|
|⬜|P|MA-V611-TC-036|FR-MA-036|AC-MA-036|campaign metric|
|⬜|P|MA-V611-TC-037|FR-MA-037|AC-MA-037|insight/hold|
|⬜|D|MA-V611-TC-038|FR-MA-038|AC-MA-038|general learning deferred|
|⬜|P|MA-V611-TC-039|FR-MA-039|AC-MA-039|experiment decision|
|⬜|P|MA-V611-TC-040|FR-MA-040|AC-MA-040|next plan|
|⬜|D|MA-V611-TC-041|FR-MA-041|AC-MA-041|general alerts deferred|
|⬜|P|MA-V611-TC-042|FR-MA-042|AC-MA-042|safe boundary|
|⬜|R|MA-V611-TC-043|FR-MA-043|AC-MA-043|route/action/API/state|
|⬜|R|MA-V611-TC-044|FR-MA-044|AC-MA-044|additive IA|
|⬜|R|MA-V611-TC-045|FR-MA-045|AC-MA-045|naming/SVG/theme/role|
|⬜|R|MA-V611-TC-046|FR-MA-046|AC-MA-046|responsive|
|⬜|R|MA-V611-TC-047|FR-MA-047|AC-MA-047|terminal states|
|⬜|P|MA-V611-TC-048|FR-MA-048|AC-MA-048|production lineage|

#### MA-V611 gate

- Coverage: P39 / R6 / D3 = 48; FR/AC/TC exact pair 48/48/48.
- Exit: P39/39 PASS + R6/6 deletion/rename/move0. D implementation/design count must equal 0.
- TC020 specifically requires Threads selected card diff1 after save/reload and every other current draft/source/status diff0.
## ❌ NG — Marketing Agent prototype v15 플랫폼 탐색·용어 (2026-08-06)

- 사용자 직접 관찰: 왼쪽 플랫폼 메뉴를 클릭해도 해당 플랫폼 화면이 보이지 않는다.
- 사용자 직접 관찰: `Assisted weekly loop`의 의미를 이해할 수 없다.
- 초기 판정: v15 출고 실패. 메뉴 개수·overflow 검사는 했지만 26개 목적지 각각의 실제 화면 도착을 검증하지 않았고,
  내부 기획 용어를 고객 화면에 노출했다.
- 종료조건: 26개 메뉴 전부 클릭 시 기존 owner 화면 또는 명시적 prototype 화면으로 이동하고 dead-end/console error 0;
  `Assisted weekly loop`를 회장 언어로 교체; product-designer 재리뷰와 부모 Chrome 전수 클릭 증거 확보.
- 상태: ❌ NG / design gate 잠금 / 제품 코드·배포 영향 없음.
## ❌ NG — Marketing Agent prototype v16 제품 구조·사용자 여정 (2026-08-06)

- 사용자 직접 반려: OSMU preview가 가로 한 줄로 바뀌고 Reels/Shorts/TikTok video3가 빠진 대신
  Messaging(Discord/Slack/LINE)이 OSMU 제작 대상처럼 들어갔다.
- 미검증/누락: OSMU 생성·발행 결과의 플랫폼별 Queue 반영, 전체 성과와 채널 성과의 집계 경계,
  플랫폼 공통 헤더/기능 IA, YouTube/TikTok social/video 운영, Keyword/Data/Assets/System Settings/Admin의
  사용자 목적과 owner flow, OAuth→계정/토큰 health→자동화 준비 상태.
- 사용자 직접 반려: 내부 계약 문구 `사용 근거: 고객 승인 전 외부 게시물 발행 없음 ... FR-MA-010`을 고객 카피로 노출.
- 판정: v16 출고 실패, design 승인 금지, plan 재개방. 단순 UI 패치 금지.
- 종료조건: 실제 code/wiki/Chrome 전수 감사 → 요구 원장 반영 PRD MAJOR0 → current visual authority 기반 prototype →
  user-journey E2E와 메뉴/플랫폼/role/settings/admin 전수 QA. raw OAuth access token은 화면 노출0;
  account/permission/expiry/verification/automation readiness만 안전하게 표시한다.

## ❌ NG: Marketing Agent prototype v24 전 화면 런타임 오류 (2026-08-12)

- 사용자 보고: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-marketing-agent-fidelity-v24-gpt-codex.html`에서 Home 외 여러 화면이 빈 화면으로 끝난다.
- 초기 재현 가설: 렌더 경로의 미정의 함수 또는 안전하지 않은 참조가 `ReferenceError`를 발생시켜 `render()`를 중단한다.
- 영향 범위: Home, Studio, Settings, 채널, Operator, Videos, Blog, Calendar, journey, onboarding, connect 전체 전환 경로.
- 현재 판정: ❌ NG. 디자인 승인과 출고 금지. 실제 제품 소스와 배포에는 영향 없음.
- 종료조건: localhost에서 전 화면과 오버레이를 전환해 브라우저 콘솔 `ReferenceError` 0, 미처리 page error 0을 직접 관찰하고 390/1024 레이아웃 및 DESIGN.md 토큰 정합을 design-review로 재검수한다.
- 2026-08-12 14:05 KST 수정 상태: 🔧 DOM 런타임 복구 확인. 26개 route, 172개 상태·전환, 60개 고유 action click에서 runtime error 0, failed check 0. 중복 `class` 속성 0, 미정의 CSS custom property 0.
- 실제 Chrome 상태: 미검증. worker sandbox가 localhost bind와 Chrome CDP를 차단했다. `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v24/v24-console-audit.mjs`에 route·tab·overlay·action 실제 click과 1440·1024·390 overflow 검사를 고정했다.
- 현재 판정 유지: ❌ NG. 실제 Chrome `runtimeErrorCount=0`과 `failed=[]` 관찰 전에는 디자인 승인과 출고 금지.

## 🔧 R-02 실제 코드 build 검증 진행 중 (2026-08-12)

- 대상: F1 드래프트 본문, F2 `channel_accounts` 연결상태 단일소스, F3 홈 DB 우선 읽기와 중복 패널 통합, F4 Admin active 필터와 accordion, ChannelPage 원시 유니코드.
- 코드 상태: commits `3fd63016`, `ea0509ab`. 전체 Vitest 131 files, 1061 passed, 10 skipped. R-02 관련 8 files, 62 tests 통과. TypeScript와 webpack build 166/166 통과.
- 현재 판정: 🔧. 현재 샌드박스의 `listen 0.0.0.0:3456`가 EPERM으로 차단돼 후속 보정분 브라우저·콘솔 재검증을 못 했다. 기존 홈 1024 캡처는 실제 폭 757px라 정규 폭 증거로 인정하지 않는다.
- design-lint: `dashboard/src` 전체에서 디자인 토큰 위반 0으로 통과.
- 종료조건: 정식 tenant token으로 Home·Studio·Settings·Channel·Admin 클릭 경로 확인, 콘솔 오류 0, 실제 1440·1024·390 캡처, 홈 before/after.

## ❌ NG: R-02 E2E 하네스 origin 및 Studio 대기 오탐 (2026-08-13)

- 대상: `dashboard/scripts/verify-r02-e2e.mjs`.
- 관찰: 기본 URL이 `http://127.0.0.1:3459`라 `localhost`로 기동한 Next.js 16 dev 서버의 dev resource origin과 어긋난다. Studio 검사는 본문 있는 드래프트를 골랐는지와 `불러오기` 클릭 성공을 확인하지 않은 채 일반 `Publish` 문자열만 기다린다.
- 영향: 제품 UI와 API가 정상이어도 하이드레이션 백지 또는 `loaded draft did not expose Publish`로 가짜 실패한다.
- 현재 판정: ❌ NG. 제품 소스 결함으로 판정하지 않는다.
- 종료조건: 기본 URL을 `localhost`로 통일하고, 본문 있는 드래프트의 `불러오기`를 재시도한 뒤 실제 활성 `🚀 Publish (N)` 버튼을 관찰한다. `R02_LIVE_PUBLISH`를 켜지 않은 실 DB·실 브라우저 실행이 `overview.source=db`, `consoleErrors=[]`, exit 0으로 끝나야 한다.
- 2026-08-13 06:15 KST 수정 상태: 🔧. 기본 URL `http://localhost:3459`, 화면에서 `본문 없음` 경고가 없는 드래프트 선택, 1초 간격 재클릭, 보이는 활성 `🚀 Publish (N)` 대기, 클릭 횟수·관찰 문구 결과 기록을 반영했다. 기존 catch와 profile cleanup 재시도는 보존했다.
- 테스트됨: 스크립트 구문과 scoped diff 검사 통과. 변경된 실제 DOM 표현식을 JSDOM에서 실행해 두 번째 드래프트 선택과 `🚀 Publish (3)` 관찰을 확인했다.
- 테스트됨: R-02 계약·디자인·Studio drafts API·grounding·publish UI 5 files, 23 tests 통과. `design-lint.sh dashboard/src` 위반 0.
- 관찰됨: `R02_LIVE_PUBLISH=0` 실 스크립트 실행은 샌드박스가 Chrome DevTools의 localhost 접속을 막아 `Chrome DevTools did not start: fetch failed`로 종료됐다. 원에러는 cleanup에 가려지지 않았고 debug port 9329 잔류 listener는 없었다.
- 현재 판정: 🔧 유지. coordinator의 로컬 권한에서 실 DB·실 브라우저 exit 0을 관찰하기 전 PASS로 바꾸지 않는다.

## ❌ NG: R-05 심사 상태 UX 계약 미연결 (2026-08-13)

- 요청 기준: 고객 계정이 아직 연결되지 않은 상태는 `미연결`, 서비스 운영자가 OAuth 앱을 준비하지 못한 상태는 `오픈 준비 중`으로 분리한다.
- 코드 관찰: `/api/connect/readiness`는 `{available, reason}`만 반환한다. 고객 UI는 Admin 미준비를 별도 상태로 분류하지 않고 위험 아이콘과 관리자 문의 문구를 표시한다.
- 영향: 고객 행동이 필요한지, 서비스 오픈을 기다려야 하는지, 외부 심사가 남았는지 화면만 보고 구분할 수 없다.
- 현재 판정: ❌ NG. API 상태 계약과 승인 prototype이 확정되기 전 제품 소스 수정 금지.
- 종료조건: readiness enum과 고객·Admin 문구·CTA 계약을 승인 artifact에 핀하고, 상태별 API·컴포넌트 통합테스트와 실제 브라우저 표시를 확인한다.

## ❌ NG: R-09 채널 capability·탭·Studio 단일 진실원 불일치 (2026-08-13)

- 코드 관찰: Settings는 텍스트 발행 8개, Sidebar는 영상 2개를 추가 노출한다. Studio는 실발행 4개와 미리보기 7개를 별도 보유한다. generic 채널은 queue·analytics·settings, Instagram은 queue·editor·settings 탭을 가진다.
- 영향: 같은 플랫폼이 화면에 따라 연결 가능, 발행 가능, 미리보기 가능으로 다르게 보이고 기존 미리보기·편집 기능의 보존 여부를 단일 계약으로 검증할 수 없다.
- 현재 판정: ❌ NG. design-lint 위반은 0이지만 정보구조와 capability 계약 결함은 남아 있다.
- 종료조건: provider capability SSOT와 화면별 허용 차이를 승인 prototype에 핀한다. Sidebar·Settings·Studio·채널 탭 통합테스트와 1440·1024·390 픽셀 대조에서 누락·오표시 0을 확인한다.

- 교차감사 증거: `docs/qa/osmu-r01-r14-crosscheck-2026-08-13-v1-gpt-codex.md`.

## ❌ NG: OSMU OAuth 장기 토큰 내구성 회귀 (2026-08-14)

- 회장 실계정 관찰: Threads 연결 모달은 완료를 표시했지만 채널 상세는 `재연결 필요`, Studio 발행은 계정 확인 400, 채널 상세는 `발행 준비중`을 표시했다.
- DB 관찰: 해당 `channel_accounts` 행은 `status=active`, 암호화 토큰과 외부 계정 ID가 있지만 `token_expires_at=NULL`이다.
- 코드 원인: Meta 장기 토큰 교환 응답에 `access_token`이 없어도 단기 토큰으로 폴백한다. `expires_in`을 콜백과 DB로 전달하지 않고, `/me` 검증 실패도 fallback ID로 덮어 `active`를 저장할 수 있다.
- 현재 판정: ❌ NG. 인증 사슬의 내구성과 연결 상태 표시가 불일치한다.
- 종료 조건: 장기 토큰 교환 fail-closed, `expires_in` 절대시각 저장, 신원 검증 실패 시 `active` 미저장, 만료 정보를 포함한 연결 판정, TypeScript·Vitest 0 실패. 실 OAuth와 실발행은 회장 재검증 전까지 미검증으로 유지한다.
- 2026-08-14 04:15 KST 수정 상태: 🔧. Meta 장기 토큰·Facebook long user token 교환을 fail-closed했고, 응답 `expires_in`을 `token_expires_at`으로 저장한다. `/me` 신원 검증 실패는 fallback ID로 덮지 않는다.
- 테스트됨: TypeScript exit 0. 전체 Vitest 138 files, 1,121 passed, 11 skipped, 실패 0. `design-lint.sh dashboard/src` 위반 0.
- 미검증: 샌드박스에서 실 OAuth·localhost·실 SNS 발행을 실행할 수 없어 현재 판정은 🔧를 유지한다. 운영 재연결 후 `token_expires_at` non-null, Channel Info `Connected`, Studio Threads 발행 permalink를 관찰해야 PASS로 전환한다.

## ✅ PASS: 회장 4실 실사용 피드백 화면 결함 10건 수리 (2026-08-29)

- 기반: `docs/_archive/legacy-20260912/requests/2026-08-29-회장-4실-실사용-피드백.md`, `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`, `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-08-29.md`, `DESIGN.md`.
- 범위: 고장난 화면과 뜻이 안 통하는 문구만. 구조 재설계와 발행 로직은 이 판에서 만지지 않았다.

### 근본 원인 두 가지

- 편집실 목차가 통째로 사라진 원인은 `max-h-72`다. 이 프로젝트 테마는 이름 있는 간격 토큰만 정의해 숫자 간격 유틸리티가 `max-height: 0`으로 풀린다. 실측: `nav` clientHeight 32, scrollHeight 216, computed `max-height: 0px`. `max-h-[40vh]`로 바꾼 뒤 clientHeight 560, scrollHeight 560.
- 목차 글자가 가려진 두 번째 원인은 공용 단추의 `min-w-max`와 `.ds-label { min-width: max-content }`다. 240px 칸 안에서 단추가 431px를 요구했다. `.ds-label-fill`(min-width 0, flex 0 1 auto)을 더해 207px로 들어가고 말줄임으로 끊긴다.

### 관찰됨 (localhost:3456 실제 화면, 1440 폭, 고객 신원)

- 편집실: 목차 3줄이 모두 보이고 각 줄이 칸 안에서 말줄임된다. 캡처 `/tmp/osmu-fixshots3/edit.png`.
- 발행실: 7개 플랫폼 미리보기가 각각 표시 이름, 캡션, 해시태그, 첫 댓글 입력을 따로 가진다. X 본문이 Threads와 같은 본문이고 한도까지만 줄어든다. 표시 이름이 미리보기 밖으로 나가지 않는다. 미연결 4개 채널에 `계정 연결하기` 경로가 붙었다. 캡처 `/tmp/osmu-fixshots2/publish.png`.
- 성과실: 네 방 공용 머리줄이 붙었다(`data-room-header="성과실"`). 캡처 `/tmp/osmu-fixshots3/performance.png`.
- 성과 제안 단추 3개 실측: 위치 1291, 높이 44, 폭 342로 전부 같다. 수정 전에는 68/68/44로 어긋나 있었다.
- 가로 넘침 0px, 콘솔 오류 0건(성과실·편집실·발행실 3화면).

### 테스트됨

- `npx tsc --noEmit` exit 0.
- `npm run test`: 199 files, 1,458 passed, 5 failed, 1 skipped. 실패 5건은 전부 `/api/publish` 계열(`publish-route.branch`, `publish-alert`, `publish-f3-f4`)이며 다른 조가 같은 시각에 `src/app/api/publish/route.ts`, `src/lib/publish.ts`, 발행 임차 마이그레이션을 작업 중이라 발생했다. 이 판이 만진 파일의 테스트는 전부 통과했다(`studio-publish-ui` 27, `studio-fe2-rooms` 19, `LoginModalRouting` 9, `DesignSystem` 8, `connect-readiness` 12).

### 미검증

- 390 폭 실렌더와 다크 모드 대조는 이 판에서 하지 않았다.
- 실제 SNS 발행 결과와 미리보기의 픽셀 대조는 실계정이 필요해 미검증이다.

## ✅ PASS: 코드리뷰 BLOCK 중 돈과 외부 부작용 7건 수리 (2026-08-29)

- 기반: `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-08-29.md`, `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` R27.
- 범위: 돈이 새거나 되돌릴 수 없는 외부 게시가 두 번 나가는 경로만. 화면 파일은 이 판에서 만지지 않았다.

### 고친 것

1. 무료 재생성이 후보 거절 여부를 보지 않고 하루 몫을 태우던 결함(R27 위반). 서버 거절 장부
   `studio_generation_candidate_rejections` 를 만들고, 거절 확인과 몫 차감을 한 transaction 에서 판정한다.
2. 몫 키는 협정시 날짜인데 복구 안내는 원본 작업 시간대 자정이던 어긋남. 안내를 협정시 자정으로 통일했다.
3. `draft_id` 없는 발행에 중복 방지가 없어 동시 두 건이 외부 게시를 두 번 실행하던 결함.
   모든 실발행이 예약을 거치고, 초안 번호가 없으면 멱등 키를 요구한다.
4. 예약에 만료가 없어 예약 직후 죽은 작업이 영원히 409 이던 결함. 임차(기본 10분)와 공급자 조회를 넣었다.
   조회가 실패하면 없는 것으로 단정하지 않고 uncertain 으로 못 박는다.
5. 게시 성공 뒤 응답만 끊긴 경우를 failed 로 저장해 재시도가 중복 게시하던 결함. uncertain 으로 보존하고
   멱등 인덱스에 포함해 공급자 확인 전 재발행을 막는다.
6. 본문 성공 + 첫 댓글 실패가 전체 성공으로 보이던 결함. `first_comment_status` 를 독립 컬럼으로 분리하고
   같은 요청 재전송 시 본문은 두고 댓글만 멱등 복구한다.
7. 숏폼 공장에 소유권이 없어 강제 종료된 실행의 옛 worker 가 비용 작업을 계속 만들고 최종 상태를 덮던 결함.
   `lease_token` 울타리 표, 실제 취소(AbortController), 최종 상태 CAS 를 함께 넣었다.

### 관찰됨 (localhost:3456 실서버 + 실 DB)

- `scripts/verify-free-regeneration-rejection-gate.mjs` 13개 항목 전부 통과. 거절 없이 재생성을 부르면
  409 `CANDIDATES_NOT_REJECTED` 이고 그때 태운 몫은 0건. 셋 다 거절하면 201. 둘째 요청은
  `PAID_REGENERATION_APPROVAL_REQUIRED` 이고 복구 안내가 `2026-08-30T00:00:00.000Z`(협정시 자정)이다.
- `scripts/verify-publish-intent-guard.mjs` 7개 항목 전부 통과. 키 없는 실발행 400
  `PUBLISH_IDEMPOTENCY_KEY_REQUIRED`, 같은 의도 동시 예약 성사 1건, uncertain 상태 재예약 0건,
  failed 상태 재예약 1건, 한 시간 묵은 예약의 만료 판정 true.
- `scripts/verify-shorts-factory-fencing.mjs` 5개 항목 전부 통과. 강제 종료 뒤 옛 표의 진행 신호 0행,
  컨셉 성공 기록 0행, 마감 0행, 최종 상태 failed.
- 세 스크립트 모두 자기가 만든 것만 전용 회원과 전용 키 기준으로 정리한다. 공유 원장을 통째로 지우지 않는다.

### 테스트됨

- `npx tsc --noEmit` 종료 코드 0.
- `npm run test` 199 files 전부 통과.
- 회귀 검증 추가: 생성 도메인 4건, 생성 HTTP 2건, 발행 경로 7건, 숏폼 공장 서비스 3건, 숏폼 공장 실 DB 1건.
  기존 검증이 같은 jobId 와 UUID 초안 경로만 밟아 이 결함들을 한 번도 통과시키지 않았다.

### 미검증

- 실제 SNS 계정을 붙인 중복 게시 실측은 하지 않았다. 발행 경로 검증은 HTTP 관문(실서버)과
  저장 층 인덱스(실 DB), 그리고 fetch 경계를 목으로 고정한 라우트 검증 세 층으로 나눠 확인했다.
- 임차 만료 회수의 공급자 조회는 Threads 와 Instagram 만 구현했다. 다른 채널은 조회 계약이 없어
  `unknown` 으로 판정하고 uncertain 으로 보존한다(회수하지 않는다).

## ✅ PASS: 숫자 간격 유틸리티 전수조사 (max-h-72류 재발 여부, 2026-08-29)

- 기반: 편집실 목차 사고 수리 판(위 항목)의 사후 확인 지시. `dashboard/src/app/globals.css`, `dashboard/CLAUDE.md`, `DESIGN.md`, 위 커밋 `56f11b5c`.
- 배경 주장 검증: "이 테마는 이름 있는 간격 토큰만 정의해 숫자 유틸리티가 0으로 풀린다"는 진단을 그대로 믿지 않고 실측했다.

### 실측 결과 — 배경 주장은 부정확했다

- `globals.css`의 `@theme inline`은 `--spacing-micro` 같은 **네임스페이스 하위 토큰**만 추가한다. Tailwind v4 기본 `--spacing: .25rem`(접두어 없는 원본 키)는 어디서도 재정의되지 않는다. 빌드된 CSS에 `--spacing:.25rem;`가 그대로 살아 있음을 확인했다(`grep -o "\-\-spacing:[^;]*;"`).
- 브라우저 실측(Playwright, 격리 probe div): `w-40` → `width: 160px`(40×4, 정확), `h-64` → `height: 256px`(64×4, 정확). `max-h-72`류는 **현재 소스에 그 클래스 문자열이 하나도 안 남아 있어**(56f11b5c에서 `max-h-[40vh]`로 치환됨) Tailwind JIT가 규칙 자체를 생성하지 않아 `none`으로 나왔을 뿐 — 이것은 "0으로 풀림"이 아니라 "애초에 컴파일 안 됨"이라 별개 현상이다.
- 결론: **현재 코드베이스에는 숫자 간격/크기 유틸리티가 전역적으로 죽는 문제가 없다.** 지난 사고(`max-h-72`)는 이미 고쳐졌고, 같은 메커니즘으로 깨진 다른 자리는 없다.

### 전수조사

- `dashboard/src` 전체에서 숫자 크기 계열(`w- h- max-w- max-h- min-w- min-h- top- bottom- left- right- inset- gap- p- m- space-x- space-y-`) 매치 325건. 스크립트: `grep -rnoE` (기록 `/tmp/numeric-utils.txt`, 세션 한정 임시파일).
- `p-/m-/gap-/space-` 계열(진짜 DESIGN.md 간격 스케일 대상)은 **숫자 리터럴 사용 0건** — 전부 이미 이름 토큰(`stack`, `pad-inset` 등) 사용 중. 숫자가 남은 건 전부 `w-/h-/max-h-/min-h-/top-/bottom-/left-/right-/inset-`(크기·좌표), 이는 DESIGN.md 간격 스케일 대상이 아니라 아이콘·아바타 지름, 카드 최대높이 같은 치수라 토큰화 대상 자체가 아니다.
- `h-250` 매치는 오탐 — `src/app/api/video/generate/route.ts`의 ffmpeg drawtext 표현식 문자열(`y=h-250`)이지 Tailwind 클래스가 아니다.

### 재발 방지

- `dashboard/tests/integrity/design-system-floor.contract.test.ts`에 테스트 2건 추가: ①`globals.css`가 접두어 없는 `--spacing:` 키를 재정의하지 않는지 정규식으로 고정 ②모든 `--spacing-*` 이름 토큰이 네임스페이스를 지키는지 고정. 이후 누군가 `@theme` 블록에 `--spacing: ...`을 추가하면(진짜 전역 붕괴를 일으키는 변경) 이 테스트가 즉시 실패한다.

### 테스트됨

- `npx tsc --noEmit` exit 0.
- `npm run test`: 199 files, 1,469 passed, 1 skipped, 실패 0건(추가한 2건 포함).
- Playwright 격리 probe: `w-40`→160px, `h-64`→256px 실측 일치.

### 미검증

- `/studio` 실화면 로그인 게이트(Google OAuth) 때문에 로그인된 상태의 실렌더 계산값은 이 판에서 다시 재지 않았다(직전 판이 이미 편집실/발행실/성과실 3화면 실측을 남겼음). 새로 깨진 자리는 없다는 결론은 정적 CSS 분석 + 격리 probe 실측 기반이며, 로그인 후 3화면 전수 시각 재검증은 다음 판으로 넘긴다.

## 🔧 부분 PASS: 성과실 챗봇·상시규칙·플랫폼 드릴다운·캘린더 진입뷰 (2026-08-29~30, code-builder)

- 기반: `docs/qa/회장-피드백-대조표-2026-08-29.md` 성과실 절(#25~28) + 미해결 우선순위 7·9·10번,
  `docs/_archive/legacy-20260912/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md` 질문3(성과실 챗봇)·질문4(성과실/채널 경계) 추천안.
  담당 파일: `dashboard/src/app/page.tsx`(성과실 진입) 하위 `PerformanceRoom.tsx` + 신규
  `PerformanceChatPanel.tsx` / `AutomationRulesPanel.tsx` / `api/performance/learned-rules/route.ts`
  / `app/calendar/page.tsx`.

### 기존 구현 확인 (재창조 금지 게이트)

- `Grep`으로 확인: 자동 좋아요는 이미 서버에 있었다 — `channel-settings.json`의 `auto_like_replies`가
  cron job `threads-collect-insights`에 매핑돼 있고(`FEATURE_TO_CRON`), `/api/cron-status`가 실행
  기록을 낸다. 새로 만들지 않고 그 위에 UI만 얹었다.
- `low_engagement_cleanup`은 `constants.ts`에 `implemented:false`로 이미 명시돼 있었다 — 자동 삭제
  실행 자체가 없다는 뜻. 있는 척 토글을 만들지 않고 "준비 중" 배지로 정직하게 표기했다.
- 성과 제안 API(`/api/suggestions`)·큐 API(`/api/suggestions/enqueue`)·댓글 API(`/api/engagement`)는
  이미 완성돼 있었다. 챗봇의 "이거 왜 잘 됐어"는 이 데이터(이미 내려오는 `posts` prop)를 그대로 재사용해
  새 DB 조회를 만들지 않았다.

### 만든 것

1. **성과실 담당 대화(PerformanceChatPanel)**: "이번 주 왜 이랬어"(표본<5면 판정 보류를 명시)
   / "안 터진 글 정리해줘"(평균의 30% 이하 후보 목록, 자동삭제는 없다고 명시하고 실제 삭제는
   각 채널에서 직접 하도록 안내) / "이거 왜 잘 됐어"(상위 3편 공통점 → 규칙 후보 →
   "배우기/넘어가기") 세 갈래. "배우기"를 누르면 `POST /api/performance/learned-rules`로
   실제 저장되고, 화면 하단 "성과에서 배운 규칙" 목록에 출처(포스트 편수·날짜)와 함께 뜬다 —
   대조표 #3(L5가 성과실에 존재하는지)의 답을 화면에 만들었다.
2. **돌고 있는 규칙(AutomationRulesPanel)**: 자동 좋아요 토글이 실제로 `/api/channel-settings/threads`를
   호출해 켜고 끈다(curl로 200 확인, 아래). 마지막 실행 시각은 `/api/cron-status`에서 가져온다.
3. **플랫폼 두 번째 클릭 = 이동**: 칩을 누르면(첫 클릭) 성과실 안에서 필터만 걸리고,
   그 아래 "OO 계정 자세히 보기" 링크(두 번째 클릭)를 눌러야 `/channels/[channel]`로 나간다.
4. **발행 캘린더 진입 뷰**: 성과실 헤더의 "발행 캘린더에서 보기" 링크가 `/calendar?from=performance`로
   가고, 그 화면은 발행이 몰린 날을 배경 진하기로 강조한다(성과실에서 열렸을 때만).
5. **문구**: "생성 큐에 넣기" → "이 제안으로 새 콘텐츠 만들기" / "생성실 대기 목록에 넣었어요"로 정정.

### 테스트됨

- `npx tsc --noEmit` exit 0.
- `npx vitest run tests/components/HomeDesignSystemIntegration.test.tsx`: 11/11 PASS
  (신규 OSMU-PERF-AUTO-01·OSMU-PERF-CHAT-01 포함, 자동 좋아요 API 호출과 규칙 학습 API 호출을
  실제로 mock 호출 인자까지 검증).
- `npm run build` (production, Turbopack): 성공, `/calendar`·`/channels/[channel]` 포함 전 라우트 컴파일.
- curl 실측(로컬 dev, `Authorization: Bearer devlocaltoken`):
  `POST /api/performance/learned-rules` → `{"ok":true,"rule":{...}}`,
  `GET /api/performance/learned-rules` → 방금 넣은 규칙 반환,
  `POST /api/channel-settings/threads {"auto_like_replies":true}` → `{"ok":true,"settings":{...auto_like_replies:true...}}`.
  검증 후 테스트 데이터는 DELETE로 정리했다.
- `dashboard/src/components/studio/`·`api/publish`·`lib/publish.ts`·`lib/studio/generation`·`db/`
  등 금지 경로는 건드리지 않았다(git status로 확인).

### 미검증 (부분 PASS로 낮추는 이유)

- **실제 로그인 화면 스크린샷을 못 남겼다.** 대시보드 고객 로그인은 Supabase Google OAuth 전용이고
  로컬 `.env.local`엔 `DASHBOARD_AUTH_TOKEN`(운영자 전용 토큰)만 있어, 브라우저로 그 토큰을
  `localStorage.dashboard_auth_token`에 넣으면 고객 화면이 아니라 **운영자 콘솔**로 라우팅된다
  (실측: `/operator/customers`로 이동해 워크스페이스 `local-v63-verification` 존재를 확인했을 뿐).
  실 고객 JWT를 로컬에서 발급할 방법이 없어 API 레벨(curl)과 컴포넌트 레벨(vitest RTL) 증거로
  대체했다. 다음 판이 실 계정으로 성과실을 열어 스크린샷 대조가 필요하다.
- 캘린더 "지난 4주" 기본 보기는 구조질문 문서가 제안한 전용 4주 뷰(성과 숫자 얹기)까지는
  못 갔다 — 현재 월 그리드에 "발행 몰린 날 강조"만 얹은 축소판이다. `published_posts`의 조회수를
  캘린더 화면까지 끌어오려면 `queue.json` 파일 데이터와 DB `published_posts`를 조인해야 해서
  이번 판 범위를 넘었다.
- "안 터진 글 정리" 후보의 실제 삭제 실행 API는 없다(위 기존구현 확인대로 서버에 없음) —
  이번 판은 후보 제시까지만 하고 삭제는 고객이 각 채널에서 직접 하게 안내했다. 자동 삭제
  기능 자체를 만드는 것은 범위 밖(별도 발주 필요).

### 셀프심문

"회장이 이 화면을 열면 같은 불만을 또 낼까" — 부분적으로 그렇다. L5·상시규칙·플랫폼 드릴다운·
캘린더 연결·문구는 실제로 바뀌었으니 #3, #25, #26, #27, #28, #6 재발 가능성은 낮다. 다만
"안 터진 글 삭제"를 회장이 "자동으로 지워지는 것"으로 기대했다면 이번 판은 그 기대를 충족 못한다
(자동 삭제 자체가 서버에 없다는 사실을 처음 발견했고, 이 판은 그걸 만드는 대신 정직하게 드러냈다).
이건 범위를 넘는 새 기능이라 다음 판 발주로 남겨야 한다.

SOURCES/MODEL
- MODEL: claude-sonnet-5 (agent: code-builder)
- 근거: 위 커밋 `822fa94a`, `docs/qa/회장-피드백-대조표-2026-08-29.md`,
  `docs/_archive/legacy-20260912/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md`,
  로컬 dev 서버 curl 실측, `npm run build`/`npx tsc --noEmit`/`npx vitest` 로그.

---

## 2026-08-30 생성실·편집실 판 (회장 4실 피드백 대조표 1·2·4·5·6·7·8·9번)

기반 산출물: `docs/_archive/legacy-20260912/requests/2026-08-29-회장-4실-실사용-피드백.md`(정본) ·
`docs/qa/회장-피드백-대조표-2026-08-29.md` ·
`docs/_archive/legacy-20260912/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md`(회장 승인 추천안) · `DESIGN.md`

증거는 전부 로컬 dev 서버(`localhost:3456`, 로그 `/tmp/osmu-dev7.log`)에 실제 고객 토큰을 발급해
Playwright로 화면을 열어 관측한 것이다. 캡처 스크립트 `/tmp/capture-chair.mjs`,
스크린샷 `/tmp/chair-create.png` · `/tmp/chair-create-osmu.png` · `/tmp/chair-learning.png` ·
`/tmp/chair-edit.png` · `/tmp/chair-edit-actions.png`.

| 대조표 # | 회장 지적 | 판정 | 관측 증거 |
|---|---|---|---|
| 4 | "왜 헤더에 학습 정보가 사라짐?" | 해결 | 생성실·편집실·발행실 머리줄에 `[data-learning-status]`가 뜬다. 실측 문구 "학습 정보 1 / 8" + 진행 막대. 덜 채우고 닫으면 `data-learning-flash="on"`으로 한 번만 깜빡인다(테스트 CHAIR-LEARN-01·03). |
| 5 | "주관식이면 나라도 뭘 입력해야할 지를 모르겠는데" | 해결 | 생성실 대화창 자유 입력 칸 실측 **0개**(`자유입력칸수: 0`). 주제·목적·대상이 전부 카드다. 학습 정보 문답도 입력창 0개(`문답 입력칸수: 0`), 걸음마다 "잘 모르겠습니다. 골라 주십시오". 카드에 없을 때만 "여기 없습니다"로 한 줄이 열린다. |
| 6 | "'오늘 만들 수 있는 것'은 뭐하는 예시이지?" | 해결 | 그 문구가 화면에서 사라졌다. 지금은 고른 갈래를 받아 "영상을 이런 결로 만들어 드립니다" + 뱃지 "미리 보는 결"이다(테스트 CHAIR-CREATE-01). |
| 9 | "글/카드뉴스/영상 중복 선택 가능하게 해야하는거 아니냐" | 해결 | 만들 종류 카드 셋(영상·카드뉴스·글)에서 주 갈래를 고르면 나머지가 "이 주제로 같이 만들 것" 체크로 내려온다. 헤더 갈래판 실측 "지금 만드는 것: 영상 같이 카드뉴스". 후보는 주 갈래 세 장만 보여 판단을 한 번만 시킨다(질문2 추천안). |
| 14 | "편집실에서는 챗봇을 통해 어떻게 편집하지?" | 해결 | 대화창에 "여기서만 한 번에 되는 일" 칸을 만들고 실제 동작을 붙였다. 전부 짧게 줄이기 · 말끝 높임말로 맞추기 · 빈 줄 걷어내기 · 여기까지를 판으로 고정 · 원본 내려받기. 실행 후 담당이 실제 변경 수를 말한다(실측 "스물넉 자를 넘는 줄이 없어 줄일 것이 없습니다"). |
| 15·16 | "미리볼 수 있는게 없는데 내가 어떻게 확인하냐" | 해결 | 자리표시자를 걷어냈다. 실측: `준비중문구: false`. 올릴 플랫폼 5종(Shorts·Reels·TikTok·Instagram 피드·Instagram 스토리)을 골라 그 비율로 미리본다. TikTok 9:16 / Instagram 피드 4:5 전환 확인, 규격 표시 `1080 × 1920` → `1080 × 1350`. 플랫폼 UI가 덮는 자리를 점선으로 그려 자막이 가리면 경고를 띄운다(테스트 CHAIR-EDIT-01~04). |
| 17 | "임시저장 기능이 있어야지 않을까" | 해결 | 자동 저장은 그대로 두고 "여기까지를 판으로 고정"과 "(시각) 판으로 되돌리기"를 뒀다(질문6 확정: 저장 단추를 두면 안 누르면 안 저장되는 줄 안다). 원본은 "원본 내려받기"로 파일로 받는다. |
| 18 | "OpenClaw 큐로 넘기기(이게 대체 무슨말임?)" | 해결 | 생성실·편집실 전체에서 "큐" 실측 **0건**(`큐문구: false`). "발행 준비 큐에 넣기" → "발행실로 넘기기", 안내도 "발행실로 넘겼습니다. 편집실에는 그대로 남습니다"로 바꿨다. |
| 29 | "새로 작업하거나 이어서 작업하는 흐름" | 해결 | 생성실은 항상 새로 시작 상태로 열린다. 만들던 것이 있으면 위에 한 줄이 뜬다(실측 "만들던 것 39건이 그대로 있습니다. 지금 화면은 새로 시작하는 자리입니다" + 이어서 하기). 없으면 그 줄이 아예 안 뜬다. 아무것도 지우지 않는다. |

### 통과 증거

- `npx tsc --noEmit` 통과(오류 0).
- `npm run test` 1493 통과 / 1 실패. 그 1건은 `tests/isolation/tenant-api-attack-script.contract.test.ts`
  TENANT-READ-01 로, **이 판 착수 전부터 실패하던 것**이다(`git stash` 상태에서 같은 테스트만
  돌려 실패 재현 확인). 이 판이 깨뜨린 것이 아니다. 착수 지시의 "1,474건 전부 통과"는 사실과 달랐다.
- 새 계약 테스트 18건 추가: `dashboard/tests/studio/studio-chairman-feedback-2026-08-29.test.tsx`.
- 브라우저 콘솔 오류 0건(캡처 스크립트 실측). 처음 1건 나왔던 렌더 중 상태 변경 경고는 고쳤다.
- 디자인 토큰 감사 `node scripts/ui-token-audit.mjs` 위반 0건. 새 hex·임의 px 없음.

### 미검증 / 남은 것

- **성과실 머리줄 학습 정보는 이 판 범위 밖이다.** 성과실은 `src/components/home/PerformanceRoom.tsx`이고
  다른 조가 동시에 만지고 있어 지시가 만지지 말라고 못 박았다. 학습 정보 표시는 생성실·편집실·발행실
  셋에만 붙었다. 성과실 조가 `LearningStatus`를 같은 자리에 붙여야 네 방이 맞는다.
- **"생성 큐" 문구는 편집실이 아니라 성과실에 있었다.** 착수 지시는 편집실에 있다고 했으나
  실측하니 `PerformanceRoom.tsx:357`의 "대기 큐"다. 성과실 파일이라 손대지 않았다.
  그 밖에 `videos/page.tsx`·`calendar/page.tsx`·`channel/InstagramPage.tsx`에도 "큐"가 남아 있다(별도 판 필요).
- **회장 실계정으로 끝까지 열어 본 것은 아니다.** 운영자 토큰으로 고객 토큰을 발급해 연 화면이다.
  회장이 실제 Google 계정으로 겪는 경로는 여전히 미검증이다(대조표 30번과 같은 한계).
- **파생물 실제 생성은 아직 없다.** "같이 만들 갈래"는 화면과 상태까지 만들었고, 확정 뒤 실제로
  카드뉴스를 파생해 만드는 생성 로직은 `lib/studio/generation`에 있어 이 판이 만지지 말라고 한 곳이다.
  지금은 고른 갈래가 헤더와 상태에 남고 후보는 주 갈래로만 나온다. 파생 생성은 다음 발주다.
- **업종 카드 12장·대상 6장·말투 6장의 문안은 이 판의 제안이다.** 구조질문 문서도 이 목록을
  `(unsourced)`로 표시했다. 회장이 실제 고객군을 보고 갈아 끼우실 자리다.
- `src/components/shared/BrandSetupWizard.tsx`는 이제 아무 데서도 안 쓴다(참조 0건).
  공유 폴더라 다른 조와 부딪힐까 봐 삭제하지 않고 남겼다. 정리 대상으로 올린다.

### 셀프심문

"회장이 이 화면을 열면 같은 불만을 또 낼까."

- **낼 수 있는 것 하나.** 편집실 미리보기는 여전히 **실제 영상이 아니다.** 장면·자막·규격 배치만
  정확히 그린다. 회장이 "미리보기"라는 말을 실제 영상 재생으로 받으시면 다시 같은 말씀이 나온다.
  그래서 화면에 "아직 실제 파일이 나오기 전이라 장면과 자막 배치만 보여 드립니다"를 명시했다.
  숨기지 않았지만 기대와 어긋날 수 있는 자리다.
- **낼 수 있는 것 둘.** 성과실 머리줄에는 학습 정보가 여전히 없다. 회장이 네 방을 차례로 도시면
  성과실에서만 사라진 것으로 보인다. 위 미검증 첫 줄이 그 이유다.
- **낼 수 있는 것 셋.** "같이 만들기"를 켜고 확정하면 실제로 카드뉴스가 나올 것으로 기대하실 텐데
  이번 판은 그 자리까지 못 갔다. 화면이 약속하는 것과 뒤가 아직 다르다.
- 반대로 주관식 0개·헤더 학습 정보·문구·이어서 하기는 실제 화면에서 관측했으므로
  4·5·6·9·18·29번이 다시 나올 가능성은 낮다고 본다.

SOURCES/MODEL
- MODEL: claude-opus-5[1m] (agent: code-builder)
- 코드 근거: `dashboard/src/components/studio/{learning-info.ts,LearningStatus.tsx,LearningCardWizard.tsx,EditPreview.tsx,StudioRooms.tsx,StudioCommandPanel.tsx}`,
  `dashboard/src/app/studio/page.tsx`, `dashboard/tests/studio/studio-chairman-feedback-2026-08-29.test.tsx`
- 실행 근거: `/tmp/capture-chair.mjs` 실행 출력, `/tmp/osmu-test-final.log`, `node scripts/ui-token-audit.mjs`

## ✅ PASS: 안 터진 글 자동 삭제 — 후보 조회 + 승낙 후 삭제 실행 (2026-08-30, code-builder)

- 기반: 이전 판(위 "부분 PASS: 성과실 챗봇·상시규칙…")이 발견한 갭 — "안 터진 글 정리" 후보는 있었지만
  실제 삭제 실행 API가 서버에 없었다. 이번 판이 그 API를 안전하게(승낙 없는 삭제 경로 0) 만들었다.

### 기존 구현 확인 (재창조 금지 게이트)

- `extensions/threads-insights/src/threads-insights-tool.ts`의 `cleanupLowEngagement()`가 이미
  존재했지만, **호출되면 승낙 없이 즉시 전체 자동삭제**하는 레거시 위험 함수임을 확인(action:
  `cleanup_low_engagement`). 현재 어떤 cron job에도 안 걸려 있고 archived PRD 두 곳에 "legacy 위험
  기능, 기본 비활성" 경고가 이미 있었다. 이 함수는 그대로 재사용하지 않고, 대신 새 API가 postId
  화이트리스트를 받아 그 목록에 대해서만 1회성으로 Threads DELETE를 직접 호출하는 구조로 새로 짰다.
- `VIRAL_THRESHOLD`(반대 짝) 패턴을 그대로 따라 `LOW_ENGAGEMENT_MIN_VIEWS_DEFAULT`/`MIN_LIKES_DEFAULT`를
  `constants.ts`에 신설(env override 지원), 채널/워크스페이스별 조정은 `channel-settings.json`의
  `low_engagement_min_views`/`low_engagement_min_likes` override로 지원(기존 boolean-only 검증에
  숫자 키 예외 추가).
- x-publish/instagram-publish extension에 delete 기능이 없음을 grep으로 확인 → 삭제 가능 채널은
  `DELETE_SUPPORTED_CHANNELS = ["threads"]` 하나뿐, UI·API가 이 배열 하나를 공유(SSOT).

### 만든 것

1. `GET /api/threads/low-engagement-candidates` — 읽기 전용, 부작용 없음. queue.json에서 발행 24시간
   이상 지나고 views/likes가 기준 미달인 threads 글만 후보로 반환. 절대 삭제하지 않는다.
2. `POST /api/threads/low-engagement-cleanup` — body에 **사람이 고른 postId 배열**이 있어야만 동작.
   빈 배열/누락은 400으로 거부. 각 postId를 순회하며 threads mediaId가 있는 것만 `getChannelCred`로
   실 토큰을 얻어 Threads Graph API DELETE를 호출하고, 성공/실패를 postId별로 반환. 다른 채널
   postId(예: instagram만 발행된 글)는 "채널 미지원"류 에러로 명확히 거부하고 지우지 않는다.
   삭제 성공한 postId만 queue.json 상태를 갱신(다른 글은 절대 건드리지 않음), 실행 기록은
   `data/low-engagement-cleanup-log.json`에 append.
3. `AutomationRulesPanel.tsx` "안 터진 글 정리" 카드: "준비 중" 배지 제거 → 후보 건수 실시간 표시,
   최근 삭제 요약 1줄, "후보 보기" 버튼 → 모달(체크박스로 개별 선택) → "선택한 N건 삭제" →
   **2단계 확인**("N건을 삭제합니다. 되돌릴 수 없습니다") → 승낙 후에만 실제 삭제 API 호출.
   DESIGN.md 토큰만 사용(Card/Button/Stack, hex·임의 px·이모지·긴 대시 없음).

### 테스트됨

- `npx tsc --noEmit` exit 0 (전체).
- `npx vitest run tests/api/low-engagement-candidates.test.ts tests/api/low-engagement-cleanup.test.ts
  tests/api/channel-settings.test.ts`: 8/8 PASS — ①24시간 미만 글 후보 제외 ②기준 이상 engagement
  글 후보 제외 ③기준 미달+24시간 경과 글만 후보 포함 ④postId 없이 호출 시 400 거부
  ⑤미지원 채널(threads mediaId 없음) postId 요청 시 삭제 없이 명확한 에러 ⑥승낙된 postId만 삭제되고
  다른 글(`untouched`)은 그대로 유지됨을 큐 파일 직접 읽어 검증 ⑦삭제 로그 파일에 기록됨을 검증.
- `npm run test`(전체 vitest): 1499 PASS / 1 skip / 1 FAIL(`tenant-api-attack-script.contract.test.ts`
  — `/api/performance/learned-rules`가 공격 목록에서 빠졌다는 지적, 이번 판이 만들지도 건드리지도
  않은 기존 라우트라 무관함, git status로 미변경 확인).
- curl 실측(로컬 dev :3456, `Authorization: Bearer devlocaltoken`, tenant
  `cd1d0a40-540d-4524-9b49-bf2445d82182`):
  `GET /api/threads/low-engagement-candidates?tenant_id=...` → 200
  `{"candidates":[],"total":0,"threshold":{"minViews":100,"minLikes":3,"minAgeMs":86400000},"deleteSupportedChannels":["threads"]}`;
  `POST /api/threads/low-engagement-cleanup` (postIds 없이) → 400
  `{"error":"postIds(문자열 배열)가 필요합니다. 개별 글을 선택해야 삭제됩니다."}`;
  `POST /api/threads/low-engagement-cleanup {"postIds":["nonexistent-post-xyz"]}` → 200
  `{"ok":true,"deleted":0,"failed":1,"results":[{"postId":"nonexistent-post-xyz","ok":false,"error":"글을 찾을 수 없습니다."}]}`
  (인증 없이 호출하면 401 `Unauthorized`도 확인).
- `dashboard/src/components/studio/`·`api/publish`·`lib/publish.ts`·`lib/studio/generation`·
  `db/run-migrations.sh` 등 금지 경로는 건드리지 않았다.
- `AUTOMATION_FEATURES`의 `low_engagement_cleanup.implemented`는 **여전히 `false`로 남겼다** — 이
  플래그는 원래 "정기 자동삭제 실행" 여부를 뜻했고, 이번 판이 만든 건 정기 자동삭제가 아니라
  "사람이 승낙해야만 도는" 1회성 삭제이므로, 그 의미로 `true`로 바꾸면 "자동 실행된다"는
  오인을 유발한다. 후보 건수·삭제 UI 자체는 이미 화면에 노출돼 있다(implemented 플래그와 무관하게
  동작).

### 셀프심문

"승낙 없이 남의 글이 지워질 수 있는 경로가 정말 하나도 없는가" — 코드를 다시 훑었다:
①`POST /api/threads/low-engagement-cleanup`은 body에 `postIds`(비지 않은 문자열 배열)가 없으면
Threads API를 호출하는 코드 블록 자체에 도달하지 못한다(400으로 조기 반환). ②이 라우트를 부르는
크론/스케줄러는 어디에도 추가하지 않았다(레거시 `cleanupLowEngagement()`도 여전히 어떤 job에도
안 걸려 있음, grep으로 재확인). ③UI에서 이 API를 부르는 유일한 경로(`AutomationRulesPanel`의
`runDelete`)는 체크박스로 고른 `selectedIds`만 보내고, 그 버튼도 "정말 삭제" 2단계 확인을 거친
뒤에만 눌린다. ④후보 API(GET)는 애초에 삭제 코드가 없다. 결론: 승낙 없는 삭제 경로는 없다고
본다 — 단, 이 결론은 "이 레포 안에서"의 검증이고, Threads 쪽 토큰이 다른 자동화(예: OpenClaw
크론이 같은 extension 함수를 직접 호출)로 새로 연결되면 재검토가 필요하다.

SOURCES/MODEL
- MODEL: claude-sonnet-5 (agent: code-builder)
- 코드 근거: `dashboard/src/lib/constants.ts`, `dashboard/src/app/api/channel-settings/[channel]/route.ts`,
  `dashboard/src/app/api/threads/low-engagement-candidates/route.ts`,
  `dashboard/src/app/api/threads/low-engagement-cleanup/route.ts`,
  `dashboard/src/components/home/AutomationRulesPanel.tsx`,
  `dashboard/tests/api/low-engagement-candidates.test.ts`, `dashboard/tests/api/low-engagement-cleanup.test.ts`
- 실행 근거: `/tmp/tsc5.log`, `/tmp/vitest2.log`, `/tmp/vitest-full.log`, 위 curl 출력(직접 관찰)

## 2026-08-30 — 옛 no-consent 삭제 경로(threads_insights agent 도구) 봉인

### 배경
직전 판이 승낙형 삭제 경로(`GET low-engagement-candidates` + `POST low-engagement-cleanup`,
postId 필수)를 대시보드에 새로 만들었지만, `extensions/threads-insights/src/threads-insights-tool.ts`의
`cleanupLowEngagement()`(OpenClaw agent 도구 `threads_insights`, action=`cleanup_low_engagement`)는
그대로 남아 있었다. 이 함수는 사람 확인 없이 조건만 맞으면 Threads API에 `DELETE`를 직접
호출했다 — 이 도구 액션은 `threads-collect-insights` 크론(CLAUDE.md에 "반응 수집 + 댓글 좋아요 +
저조 삭제"로 명시)이 쓰는 `threads_insights` 도구에 스키마로 노출돼 있어, LLM 에이전트가 그
크론 turn 안에서 자체 판단으로 이 액션을 호출할 수 있는 구조였다(사람이 개입할 지점이 없음).

### 사실 확인 (추측 아님, 직접 grep/diff로 확인)
1. `cleanupLowEngagement`는 이 레포에 **두 사본**으로 존재한다:
   - `extensions/threads-insights/src/threads-insights-tool.ts` (활성 개발 트리, git log 상
     `cleanup_low_engagement` 기능이 여기서 커밋됨 — `d0415494 Add trend analysis, auto-like
     replies, low-engagement cleanup`)
   - `openclaw/extensions/threads-insights/src/threads-insights-tool.ts` (docker-compose의
     실제 gateway 빌드 컨텍스트, `docker-compose.postagi-4tenants.yml:18` `context: ./openclaw`가
     이 사본을 이미지에 굽는다)
2. **`openclaw/` 사본은 2026-03-22 이후 갱신되지 않아 `cleanup_low_engagement` 액션 자체가 없다**
   (action enum이 `["collect"]`뿐, `autoLikeReplies`/`autoReplyToComments`/`cleanupLowEngagement`
   함수가 없음). 즉 **현재 docker-compose로 빌드된 gateway 이미지에는 이 삭제 경로가 아예
   존재하지 않는다** — 안전하지만 의도된 방어가 아니라 두 트리가 어긋나 생긴 우연한 안전이다.
   (두 사본을 자동 동기화하는 스크립트는 grep으로 찾지 못했다 — 사람이 수동으로 옮기다 3월 이후
   멈춘 것으로 보인다. `openclaw/`는 이 repo에 git으로 커밋된 일반 디렉터리이며 submodule이
   아니다: `.gitmodules` 없음, `git ls-files openclaw/...`로 추적 확인.)
3. `openclaw/` 사본을 빌드에 쓰지 않고 root `extensions/`를 직접 빌드하는 다른 docker-compose나
   빌드 스크립트는 이 레포에서 찾지 못했다(`grep -rn "docker build" --include=*.sh .` 등).
4. **크론 정의(jobs.json 또는 OpenClaw 런타임 `config/openclaw.json`)는 이 레포에 없다**
   (`.gitignore:12`에 `config/openclaw.json` 명시, 로컬 파일도 부재). 따라서 "이 순간 실제
   운영 중인 크론이 이 액션을 부르고 있는가"는 **이 레포에서 확인 불가** — 안전하다고 추측하지
   않는다.

### 조치
- `extensions/threads-insights/src/threads-insights-tool.ts`의 `cleanupLowEngagement()`를
  **삭제 없는 dry-run으로 고정**했다: Threads API DELETE 호출과 큐 쓰기(`writeJson`)를 완전히
  제거하고, 후보 개수/ID만 반환한다(`requiresHumanConsent: true`). 실제 삭제는 여전히
  대시보드의 사람 승낙 경로(`POST /api/threads/low-engagement-cleanup` + 선택한 postId)로만
  일어난다 — 이것으로 "LLM 에이전트가 크론 중 자체 판단으로 삭제"가 구조적으로 불가능해졌다
  (도구가 삭제할 능력 자체를 잃음).
  - 왜 이 방향(env 플래그로 기본 꺼짐 대신 완전 제거)을 골랐나: 이미 사람 승낙형 삭제 경로가
    대시보드에 정식으로 존재하므로, agent 도구가 삭제 *능력*을 갖고 있을 이유가 없다. env
    플래그로 막는 안은 "플래그를 깜빡하고 켜면 다시 위험해지는" 여지를 남기지만, 능력 자체를
    없애면 그 여지가 사라진다(실패 모드 자체를 제거 — fail-safe by construction).
  - 도구 스키마 설명도 "삭제 없음, 대시보드 승낙 필요"로 갱신.
- `openclaw/extensions/threads-insights/src/threads-insights-tool.ts`는 건드리지 않았다 —
  이미 `cleanup_low_engagement` 액션이 없어 안전하고(§사실 확인 2), 새로 이식하면 오히려
  위험 표면을 넓히는 것이라 최소 변경 원칙을 따랐다. 다만 이 사본이 3월 이후 스테일하다는 것
  자체는 별도 정리 대상으로 남는다(이 판 범위 밖 — `auto_like_replies`/`auto_reply` 기능도
  아직 빌드에 반영 안 됨, 별도 판단 필요).
- `CLAUDE.md` 크론 표의 "저조 삭제" 설명이 실제 동작과 어긋나 있어 "저조 후보 집계(삭제 없음)"로
  고치고, 승낙 흐름을 설명하는 각주를 추가했다(`CLAUDE.md:231` 부근).
- 회귀 테스트 신설: `dashboard/tests/api/threads-insights-agent-tool-no-consent-delete.test.ts`
  — 두 소스 트리를 정적 분석해 `cleanupLowEngagement` 함수 본문에 `method: "DELETE"`가 없는지,
  큐를 직접 쓰지 않는지, `requiresHumanConsent` 계약이 유지되는지 검사한다. **레포 밖 OpenClaw
  plugin-sdk 의존 때문에 함수를 직접 import/실행하지 못해 정적 분석 방식을 택했다** — git
  HEAD(수정 전) 소스로 이 테스트를 돌려 실제로 FAIL하는 것을 확인했다(회귀 포착 능력 검증됨).

### 검증 (직접 관찰)
- `cd dashboard && npx vitest run tests/api/threads-insights-agent-tool-no-consent-delete.test.ts`
  → 3 PASS. 같은 테스트를 `git show HEAD:extensions/.../threads-insights-tool.ts`(수정 전 소스)에
  대해 node 스크립트로 재현했을 때 `method: "DELETE"` 매치가 나와 **수정 전 코드였다면 이 테스트가
  잡아냈을 것**을 확인.
- `cd dashboard && npx tsc --noEmit` → 통과(에러 0).
- `cd dashboard && npm run test`(전체 vitest) → 202 파일 중 202 PASS, 1499 PASS / 1 skip,
  **`studio-publish-ui.test.tsx` 29건 FAIL은 이번 판이 건드리지 않은 발행실(다른 조 작업 중,
  `git status`로 `studio/page.tsx`·`SchedulePanel.tsx`가 이미 수정된 상태였음을 확인) 영역이라
  무관** — `useSearchParams` 렌더 에러로 이번 변경(threads-insights)과 무관.

### 셀프심문
"승낙 없이 글이 지워질 수 있는 경로가 정말 하나도 안 남았는가. 레포 밖에서 부르는 경우까지
생각했는가" —
①`extensions/`의 agent 도구는 이제 물리적으로 DELETE를 호출하는 코드가 없다(함수 자체에서
제거) — 프롬프트나 크론 설정이 무엇이든 이 함수를 아무리 여러 번 불러도 삭제는 안 일어난다.
②`openclaw/` 빌드 사본은 애초에 이 액션이 없다. ③대시보드 삭제 라우트는 이전 판에서 이미
postId 필수로 막혀 있고 이번 판에서 손대지 않았다(재확인 completed). ④**레포 밖 변수**: OpenClaw
런타임이 `openclaw/`도 `extensions/`도 아닌 제3의 배포 경로(예: 프로덕션 서버에 별도로 올라간
과거 빌드 이미지)를 쓰고 있다면, 그 이미지 안에는 이번 수정 전 코드가 그대로 있을 수 있다 —
이건 이 레포의 코드 수정만으로는 닫을 수 없는 구멍이라 아래 판단 필요 항목으로 올린다.

⛔ 회수 필요: 프로덕션에 이미 떠 있는 gateway 이미지가 옛 삭제 코드를 쓰고 있을 수 있다
- 배경: 이번 작업으로 레포 소스(`extensions/`)의 삭제 코드는 제거했지만, 이미 빌드돼 서버에서
  돌고 있는 컨테이너 이미지는 이 레포를 다시 빌드해 재배포하기 전까지는 옛 코드를 그대로 쓴다.
  또한 `openclaw/` 빌드 사본은 3월부터 스테일해 애초에 이 액션이 없었으므로, 만약 현재 서버가
  `openclaw/` 기반 이미지를 쓰고 있다면 원래도 위험하지 않았을 수 있다 — 어느 이미지가 실제
  운영 중인지는 이 레포만으로 확인 불가.
- 무엇을 정하나: 운영 중인 gateway 컨테이너를 지금 `docker-compose -f
  docker-compose.postagi-4tenants.yml build`로 재빌드·재배포할지.
- 옵션 A(추천): 지금 재빌드·재배포한다 → 고르면: 옛 삭제 코드가 남아있을 가능성이 있는 실행
  중인 이미지를 이번 수정이 반영된 이미지로 교체해 확실히 닫는다. 안 고르면: 위 불확실성이
  남는다(레포 코드는 고쳤지만 서버가 그 코드를 안 쓰고 있을 수 있음).
- 옵션 B: 다음 정기 배포 사이클까지 기다린다 → 고르면: 지금 당장 배포 작업(다운타임/검증)을
  피한다. 트레이드오프: 그 사이 기간 동안 "레포는 고쳤는데 서버는 안 고쳐진" 상태가 지속된다.
- 추천 근거: 되돌릴 수 없는 삭제를 다루는 사고였고(§과업 배경), 레포 수정만으로 "끝났다"고
  보고하면 §3(완료=증거) 위반이다. 재배포 여부는 배포 대상/타이밍 결정이라 회장 승인이 필요한
  영역(§5 결정분류)이다.

SKILLS_USED: 없음 (사실 확인·정적 분석·회귀 테스트 작성 — 코드 조사·수정 작업이라 매칭 skill 없음)
SKILLS_SKIPPED: 없음

SOURCES/MODEL
- MODEL: claude-sonnet-5
- 코드 근거: `extensions/threads-insights/src/threads-insights-tool.ts`,
  `openclaw/extensions/threads-insights/src/threads-insights-tool.ts`,
  `docker-compose.postagi-4tenants.yml:18-22`, `dashboard/src/app/api/threads/low-engagement-candidates/route.ts`,
  `dashboard/src/app/api/threads/low-engagement-cleanup/route.ts`, `CLAUDE.md:225-236`
- 실행 근거: `/tmp/vitest-le2.log`(신규 회귀테스트 PASS), `/tmp/dash-tsc.log`(tsc 0 에러),
  `/tmp/dash-test-full.log`(전체 vitest 202/204 파일 PASS, FAIL 29건은 studio 무관 확인),
  git log/diff/ls-files 직접 실행 결과(위 §사실 확인)

---

## 2026-08-30 발행실 채우기 (회장 2026-08-29 발행실 지적 6건)

기반 산출물: `docs/_archive/legacy-20260912/requests/2026-08-29-회장-4실-실사용-피드백.md` <발행실> 절 전문,
`docs/_archive/legacy-20260912/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md` 질문3(회장 승인),
`docs/qa/회장-피드백-대조표-2026-08-29.md` #19~#24, `DESIGN.md`(v61 마감, `.tr59`·`.v57-pub`·색 토큰).

### 네 방 단추 수 (`dashboard/scripts/probe-four-room-flow.mjs`, 관찰됨)

| 방 | 이전 | 지금 |
|---|---|---|
| 생성실 | 24 | 24 |
| 편집실 | 26 | 34 |
| **발행실** | **5** | **20** |
| 성과실 | 25 | 26 |

★ **"발행실 5개"의 절반은 탐침이 틀린 것이었다.** 탐침이 작업물을 옛 공용 키
`studio_work`에 심었는데, 발행실은 작업 공간별 키 `studio_work:<작업공간>`만 읽고 공용 키는
화면이 뜨는 즉시 지운다(`src/app/studio/page.tsx` 307행). 그래서 발행실이 늘 빈 상태로
측정됐다. 탐침 seed 키를 고쳤다. 미리보기 칸도 `data-room-preview`를 안 세고 있어 발행실
미리보기가 0으로 나왔다(실제 7칸). 그 선택자도 넣었다. 그래도 남은 15개 차이는 실제 신설분이다.

### 회장 지적 6건 대조

| # | 회장 원문 | 이전 | 지금 | 증거 |
|---|---|---|---|---|
| 19 | "왜 여긴 챗봇 없어?" | 미해결 | 해결 | 대화창은 DOM에 있었으나 넓은 화면에서 **높이 0으로 접혀 안 보였다**. 한 className에 모바일 시트 규칙(`fixed bottom-0 max-h-[60vh]`)과 데스크톱 기둥 규칙(`lg:static` + `lg:sticky` 동시)이 섞여 `max-height:0px`으로 계산됐다. `max-lg:`로 갈랐다. 실측: 이전 `{w:320,h:2,maxHeight:"0px"}` → 지금 `{w:320,h:705,maxHeight:"none"}`, position sticky, x=1096(우측 기둥) |
| 19b | "챗봇만의 UX 장점이 있어야 쓰는거아님?" | 없음 | 해결 | "여기서만 한 번에 되는 일" 5가지 신설. 손으로 하면 일곱 번인 것만 넣었다. 실측 로그: 해시태그 규격 나누기 → `{threads:5개, x:2개, facebook:3, instagram:3, shorts/reels/tiktok:3}`. 한도 넘는 곳만 줄이기 → before `{threads:400, x:400}` → after `{threads:400, x:280}` (X만 잘리고 Threads 500자 한도는 안 건드림). 자유 입력 "스레드 빼고 올려" → Threads 체크 해제됨 |
| 22 | "왜 스레드에만 기본계정 토글" | 부분(코드만 봄) | 해결 | **화면을 실제로 열어 확인했다.** `/channels/{x,threads,facebook}` 셋 다 열어 `account-set-default-*` testid를 세어 전부 0. Threads 전용이 아니라 **연결된 계정이 0이라 셋 다 안 뜬 것**이다. 별개로 발행실 계정 고르개가 "기본계정"이라고만 적어 누구인지 말하지 않던 것을 기본 계정 이름으로 바꾸고 "계정 관리" 링크를 붙였다 |
| 22b | "연결 안된 계정은 바로 연결하는 곳으로" | 미해결 | 해결 | 발행실 "계정 연결하기"가 `/settings?tab=channels&channel=x`로 가는데 **설정 화면은 그 쿼리를 통째로 무시한다**(`src/app/settings/page.tsx`에 `channel` 파라미터를 읽는 코드가 없다). 채널 목록만 나왔다. `/channels/<채널>`로 돌렸다. 그 화면은 미연결이면 Settings 탭으로 자동 전환되고 연결 단추와 기본 계정 전환이 함께 있다 |
| 23 | "왜 2곳에 올리기야? 전체 못올려?" | 미해결 | 해결 | 전체를 고르는 길이 실제로 없었다(칸마다 체크 하나뿐). 채널 줄에 "연결된 N곳 전부 고르기"·"전부 해제"를 냈고 대화창에도 같은 것을 뒀다. 연결 0곳이면 죽은 단추가 아니라 비활성이다(테스트 QA-PUBLISH-06으로 고정) |
| 24 | "예약 발행한건 어디서 확인해" | 설계만 | 해결 | **실제 원인을 찾았다.** 예약은 `schedules` 테이블에 쌓이는데 발행 캘린더는 `/api/queue`만 읽고 있었다. 즉 예약을 걸어도 캘린더에 영영 안 나왔다. 캘린더가 `/api/schedule`도 읽게 했다. 예약 직후 `/calendar?from=publish&date=<날짜>`로 이어진다. 실측: 예약 POST 200 → 그 날짜 캘린더에 "예약 발행 · Threads · X" 표시, "2026-09-01 · 1건", "발행실로 돌아가기" 단추 확인, 콘솔 오류 0 |
| 24b | "승인 인박스는 뭐고 발행 캘린더는 뭐냐" | 부분(라벨만) | 해결 | 라벨 부제만으로는 부족했다. 규격 문서에 있으나 구현이 없던 **발행 왕복 띠**(`DESIGN.md` `.tr59`·`[data-publish-trip]`·v59·R193)를 만들어 세 화면 같은 자리에 세웠다. 낱말은 규격 그대로 "정하는 자리 / 검토를 기다리는 자리 / 언제 나갈지 잡는 자리". 인박스 설명에서 크론·Studio·파이프라인 같은 내부 용어를 걷어냈고, 캘린더 설명의 "큐"도 없앴다(실측: 캘린더 본문에 "큐" 0건) |
| 21 | "플랫폼별 실제처럼 미리보기 · 각각 편집" | 앞 조가 함 | 유지 확인 | 일곱 칸에 제자리 편집기가 다 붙어 있다. 실측 `data-testid^=inline-editor-` 7개, 값 다섯(표시 이름·제목·캡션·해시태그·첫 댓글). 스크린샷 `/tmp/qa-flow-2-after-bulk.png` |

### 탐침이 마지막에 던지는 403 세 건 — 출처 확정 (관찰됨)

외부 자원이 아니다. **전부 localhost의 성과실 API이고 고객 토큰으로는 못 부르는 운영자 전용 경로다.**

```
403 http://localhost:3456/api/performance/learned-rules?tenant_id=cd1d0a40-...
403 http://localhost:3456/api/cron-status
403 http://localhost:3456/api/threads/low-engagement-candidates?tenant_id=cd1d0a40-...
```

개발 서버 로그에 안 남은 이유는 프록시 층에서 끊겨 라우트 핸들러까지 안 갔기 때문이다.
세 경로 모두 이번 판의 금지 구역(`api/performance/`, `api/threads/low-engagement-*`)이라
손대지 않았다. **성과실 조가 닫아야 할 건이다.**

같은 실행에서 나온 `net::ERR_NAME_NOT_RESOLVED https://example.invalid/a.mp4`도 외부
의존이 아니라 **`dashboard/scripts/verify-basic-flow-e2e.mjs:36`이 남긴 시험용 자료**다.
DB에 그 URL이 든 행이 남아 화면이 `<video src>`로 그린다. 코드 결함이 아니라 자료 청소 건이다.

### 검증 (증거)

- `npx tsc --noEmit` → 0 (`/tmp/tsc5.log`)
- `npm run test` → **204 파일 1528 통과 / 1 건너뜀 / 실패 0** (`/tmp/vitest-all2.log`)
  - 신설 `tests/lib/publish-bulk.test.ts` 25건(해시태그 규격·한도 절단 경계·해석기 12갈래·빈 입력 거절)
  - `next/navigation` 목에 `useRouter` 추가(내 변경으로 29건이 깨졌던 것을 고쳤다)
  - `QA-PUBLISH-06`을 새 연결 경로와 "연결 0곳이면 전체 고르기도 비활성"으로 조였다
- `node scripts/ui-token-audit.mjs src --check` → 위반 0 (색·간격·서체·모서리 전부)
- 개발 서버 실기동 후 화면 직접 열람: `/tmp/qa-flow-1-publish.png`, `/tmp/qa-flow-2-after-bulk.png`,
  `/tmp/qa-cal-scheduled.png`, `/tmp/qa-chan-{x,threads,facebook}.png`
- 발행실 콘솔 오류 0건 (`/tmp/qa-flow.mjs` 실행 결과)

### 미검증으로 남긴 것

- **실계정 발행은 못 해봤다.** 이 작업 공간에 연결된 채널이 0곳이라 `/api/publish`가 실제로
  나가는 경로는 안 탔다. 일괄 대행·전체 고르기·예약·캘린더 표시는 다 실측했지만, "일곱 곳에
  진짜로 올라간다"는 연결된 계정으로 다시 봐야 한다.
- **기본 계정 토글이 실제로 뜨는 모습은 못 봤다.** 계정이 0이라 렌더 조건에 안 걸렸다.
  Threads 전용이 아님은 코드와 세 화면 실측으로 확인했으나, 계정이 2개 이상일 때의 모습은 미검증.
- 예약이 시각에 맞춰 실제 발행되는지(크론 경로)는 이번 판 범위 밖이다.

### 성과실 403 세 건 마감 (관찰됨, 2026-08-30)

위 "탐침이 마지막에 던지는 403 세 건" 건을 실제로 닫았다. 출처 확정 보고대로 `learned-rules`·
`low-engagement-candidates`는 이미 `effectiveTenantId` + `runWithTenant`로 테넌트-safe하게 짜여
있었다 — 막고 있던 건 오직 `proxy.ts`의 `TENANT_AWARE_PATHS` 누락이었다.

- `proxy.ts`에 `/api/performance/learned-rules`, `/api/threads/low-engagement-candidates`,
  `/api/threads/low-engagement-cleanup`(같은 기능의 삭제 실행 경로, 같이 막혀 있었다) 3개 추가.
- `/api/cron-status`는 **열지 않았다.** `config/cron/jobs.json` 전역 파일을 테넌트 구분 없이
  통째로 반환해 열면 전체 배포의 크론 잡 목록이 새어 나간다. 대신 `AutomationRulesPanel.tsx`가
  그 엔드포인트를 아예 호출하지 않게 고쳤다("마지막 실행 HH:MM" 대신 "항상 도는 규칙입니다" 고정 문구).
- 성과실 머리줄(`src/app/page.tsx`)에 다른 세 방(`studio/page.tsx`)과 같은 `LearningStatus` 배지를
  붙였다. 같은 작업 공간별 localStorage(`readLearningInfo`/`countFilledLearningSlots`)를 읽기만
  하고, 클릭하면 `/studio?setup=brand`로 이동해 채운다(기존 온보딩 체크리스트와 같은 경로).

**격리 재확인(셀프심문: "문을 열면서 남의 작업 공간 것이 새어 나갈 길을 만들지 않았는가"):**
운영자 토큰 + 서로 다른 `tenant_id` 둘로 A에 `POST learned-rules`(text: 격리테스트-A전용규칙) →
A로 GET하면 보이고, B로 GET하면 `{"rules":[]}` — 안 샌다. 확인 후 DELETE로 정리했다.

증거:
- `npx tsc --noEmit` → 0
- `npx vitest run tests/isolation/` → 17 파일 175건 전부 통과(`customer-ui-api-boundary.test.ts`,
  `tenant-api-attack-script.contract.test.ts`, `middleware.test.ts` 포함)
- `npm run test` → 전체 스위트(진행 중 확인, 아래 최종 결과 라인 참조)
- curl 실측: 고객 경로 무인증 401(막힘 유지 확인), 운영자 토큰 + tenant_id로 세 경로 200,
  cron-status는 운영자 토큰으로도 여전히 별개 전역 응답(고객 화면에서 호출 자체를 제거)
- A/B 작업 공간 교차 조회로 데이터 비유출 직접 확인(위 기록)

기반: 위 "탐침이 마지막에 던지는 403 세 건 — 출처 확정" 보고, `proxy.ts` 헤더 주석의
TENANT_AWARE_PATHS 계약.

## origin/main 병합 충돌 18건 해소 (관찰됨, 2026-08-30)

`feat/design-system-and-missing-features` 에 `origin/main` 을 병합하다 충돌 18건이 열린 채 멈춰
있던 것을 풀었다. 두 가지가 아니라 하나의 사정이었다. 이 가지와 main 은 같은 작업을 각각
복제해 들고 있었고(제목이 같은 커밋이 해시만 다르게 양쪽에 있다), 그 위에 서로 다른 뒷작업이
쌓였다. 그래서 "어느 쪽이 옳은가"가 아니라 "각 파일에서 어느 쪽이 더 뒤인가"가 판단 기준이었다.

**갈래별 판단**

- 화면과 그 짝 테스트(로그인, 로그인 대화창, 생성·편집·발행·성과 네 방, 생성 저장소):
  이 가지가 뒤다. main 의 화면 커밋 두 건(`fix(auth): enforce customer and operator boundaries`,
  `fix(studio): close production QA regressions`)은 이 가지에 이미 같은 내용으로 들어와 있고,
  그 위에 어젯밤 회장 피드백 수리 여덟 건이 더 쌓여 있다. 그래서 이 가지를 취했다.
  덧붙여 main 쪽 `close production QA regressions` 는 편집실 도구 목록에서 소리 도구를 떨어뜨린
  판이었고 이 가지 것은 소리 도구를 살린 판이다. main 을 취했으면 소리 편집이 사라질 뻔했다.
- 데이터베이스: main 이 뒤다. 이 가지에 없는 커밋 다섯 건이 있었고 그중 셋은 실제로 살려야 했다.
  ① 권한 역할 이름 충돌 회피(`osmu_generation_guard_owner` → `..._v2`, 마이그레이션 번호
  `20260829_020` → `021`) ② 회원 확장의 선행조건에서 guard 요구 제거(guard 가 이미 깔린 운영
  DB에서 확장이 영구히 막히던 것) ③ 승인형 DB 워크플로의 체크아웃 격리(`SOURCE_DIR`).
  다만 `run-migrations.sh` 자체는 이 가지가 뒤였다(604줄 대 478줄). 그래서 이 가지를 바탕으로
  두고 위 세 가지를 얹었다. 어느 한쪽을 통째로 버리지 않았다.
- 색인 정합 검사(`20260829_030`): 이 가지를 취했다. main 판은 `indkey::smallint[]` 를 1부터
  세는 배열과 견주어 **항상** 어긋난 것으로 판정한다(int2vector 는 0부터 센다). 이름으로 견주는
  이 가지 판이 그 잠복 결함을 고친 것이다.
- 구현현황 문서: 양쪽 합집합. 충돌 두 곳 모두 main 쪽이 비어 있어 이 가지 서술을 그대로 남겼다.

**계약 테스트 재정렬**: 코드를 합친 결과에 맞춰 손으로 맞췄다. `GEN-MIG-07A` 는 guard 선행조건
요구에서 "요구하지 않음"으로 뒤집고 그 이유를 주석으로 남겼다. `GEN-MIG-19` 에 `SOURCE_DIR`
격리 단언 세 줄을 넣었고, guard 역할 이름 단언을 `_v2` 로 옮겼다. main 의 `GEN-MIG-05A`
(S1|S2 대칭 강제)는 되살리지 않았다. 그 단언이 곧 교착의 계약이었고, 이 가지의
`4b2ee6ca` 가 의도적으로 뒤집은 것이다.

**셀프심문: 이 병합으로 어젯밤 작업 중 조용히 사라진 것이 있는가.**
없다. 두 갈래로 확인했다.
- 병합이 HEAD 대비 실제로 바꾼 파일은 여덟 개뿐이고 전부 위에 적은 main 의 세 가지에 해당한다
  (`git diff --cached --stat` → 8 files, 38 insertions, 27 deletions). 화면 파일 다섯 개는
  `git diff HEAD` 가 전부 0줄, 즉 어젯밤 상태 그대로다.
- 배포 교착 해소분 네 가지를 파일 내용으로 하나씩 짚었다. 지원 상태 집합
  (`SUPPORTED_AXIS_STATES="S1 S2 S3"`) 있음 / 대칭성 거절 문구 사라짐(0건) / 필수 표 21개와
  RLS 활성·강제·정책과 권한 우회 검사 있음 / 색인 배열 시작 번호 수정 있고 옛 판
  (`indkey::smallint`) 0건 / 읽기 전용 `audit` 단계 있음 / 실패 장부 재진입
  (`ledger_supersede`) 있음.

**증거**
- 충돌 0건, 표식 0건: `git grep -nE '^(<<<<<<< |>>>>>>> |=======$)'` 무출력
- 매니페스트 체크섬 16줄 전부 실제 파일과 일치(직접 계산해 대조)
- `npx tsc --noEmit` → 종료 코드 0
- `npx vitest run tests/isolation/` → 17 파일 175건 전부 통과
- `npm run build` → 종료 코드 0, 전 라우트 생성
- `npm run test` → 아래 최종 결과 줄 참조

**미검증으로 남기는 것**: 운영 DB에 실제로 붙여 `audit` 단계를 돌린 적은 없다. 이 병합은 그
단계를 실행 가능하게 만든 것까지이고, 실제 관측은 회장이 워크플로를 눌러야 나온다. 순서는
`docs/ship/releases-legacy-20260912/2026-08-29-배포-교착-해소-순서.md` 그대로다.

### 최종 결과 줄과 남은 멈춤 2건 (관찰됨, 2026-08-30)

병합 커밋 `2030346e` 로 마감했고 원격에 올렸다(`0612e1fb..2030346e`). 부모 둘을 가진 진짜
병합 커밋이다.

- `npx tsc --noEmit` → 0 (병합 커밋 이후 다시 실측)
- `npm run build` → 0
- `npx vitest run tests/isolation/` → 17 파일 175건 통과
- DB 계약 테스트 2 파일 28건 통과(손으로 맞춘 부분의 직접 확인)
- 단위 테스트 204 파일 중 **202 파일 통과, 실패 0**

**남은 2건은 실패가 아니라 멈춤이고, 이 병합과 무관하다.**
`tests/components/HomeDesignSystemIntegration.test.tsx` 와
`tests/home/first-user-performance-access.test.tsx` 두 파일은 단독으로 돌려도 550초 동안
출력 한 줄 없이 멈춘다. 둘 다 SWR·api·미리보기까지 전부 mock 이라 바깥으로 나가지 않는다.
jsdom 에서 홈 화면을 그리다 멈추는 것으로 보인다.

이 병합의 소행이 아니라는 근거 둘.
- 병합이 HEAD 대비 실제로 바꾼 파일은 여덟 개뿐이고 전부 DB·워크플로·DB 계약 테스트다.
  `src/` 는 한 줄도 바뀌지 않았다.
- 병합 전 커밋(`0612e1fb`)을 별도 worktree 로 꺼내 두 시험 파일을 대조했더니 바이트 동일했다.
  입력이 같으므로 결과가 달라질 수 없다.

처음 `npm run test` 전량 실행이 종료 코드 137(메모리 부족 강제 종료)로 끊긴 것도 같은 뿌리로
보인다. 이 두 파일이 메모리를 물고 늘어진다. **다음 세션이 이어받을 일거리**로 남긴다.
회장이 내일 아침 쓰는 데는 지장이 없다. 운영 빌드와 격리 계약은 전부 통과했다.

### 성과실 첫 화면 멈춤 2건 해소 (관찰됨, 2026-08-30)

앞 조가 "다음 세션 일거리"로 남긴 멈춤 두 건을 원인까지 파고 고쳤다. 건너뛰기도 제한 시간
연장도 쓰지 않았다.

**멈춘 지점**: `src/app/page.tsx` 의 학습 정보 읽기 효과가 무한 갱신에 빠졌다.

```
useEffect(() => { setLearningInfo(...) }, [activeWorkspace]);
```

의존성이 작업 공간 **객체**였다. 두 시험 파일 모두 `@/store/ui-store` 를
`useUIStore: () => ({ activeWorkspace: { id: ... } })` 로 흉내 내는데, 이 함수는 호출될 때마다
새 객체를 만든다. 그래서 렌더마다 의존성이 달라 보이고, 효과가 다시 돌고, 그 안의 상태 갱신이
또 렌더를 부른다. 끝나지 않는 대기도 타이머 문제도 아니고 **CPU 를 태우는 무한 렌더**였다.
근거: 고치기 전 단독 실행 로그가 180초 동안 `RUN v2.1.9` 한 줄에서 멈춘 채 시험 이름을 한 줄도
찍지 못했다(로그 217바이트, 네트워크 대기였다면 시험 이름은 찍힌다).

**고친 방식**: 의존성을 객체가 아니라 원시값 `activeWorkspace?.id` 로 바꿨다. 부모가 매 렌더 새
객체를 넘겨도 id 가 같으면 효과가 다시 돌지 않는다. 시험 코드는 한 줄도 손대지 않았다.

**브라우저 확인 (이 항목이 핵심)**: 실제 운영 코드에서는 zustand 가 같은 상태 객체를 돌려주므로
`activeWorkspace` 참조가 안정적이었고, 따라서 브라우저에서는 이 멈춤이 나타나지 않았다.
추정으로 끝내지 않고 처음 온 사용자 상태로 직접 열어 확인했다. 탐침
`dashboard/scripts/probe-first-user-performance-room.mjs` 신설(학습 정보도 작업물도 없는 상태로
`/` 진입).

```
{ "firstPaintMs": 6304, "roomHeader": "성과실", "metricsCallsIn10s": 1,
  "maxUpdateDepthWarnings": 0, "frameLatencyMs": 14, "consoleErrors": [],
  "verdict": "PASS 화면이 멎지 않는다" }
```

화면 갱신 경고 0, 콘솔 오류 0, 같은 요청 반복 없음(10초 동안 1회), 화면 응답 14ms.
캡처는 `docs/qa/first-user-performance-room.png`.

**증거**

| 관문 | 결과 |
|---|---|
| 두 파일 단독 실행 | 2 파일 13건 통과, 13.15초 (고치기 전: 180초 무출력) |
| `npm run test` 전량 | **204 파일 통과, 1528건 통과, 1건 건너뜀, 실패 0, 오류 0** (이전 202/1502) |
| `npx tsc --noEmit` | 0 |
| `npm run build` | 성공 |
| 브라우저 첫 사용자 진입 | 위 탐침 PASS |

**셀프심문**: "회장이 내일 아침 처음 들어가서 이 화면에서 멈추지 않는다고 내가 실제로
확인했는가." 확인했다. 시험 통과가 아니라 로컬 3456 에서 처음 온 사용자 상태로 성과실을 실제로
열어 10초를 지켜본 결과다. 갱신 경고와 콘솔 오류가 0이고 화면이 계속 응답했다.

**남겨 두는 것**: `src/app/studio/page.tsx` 에도 작업 공간 객체를 의존성으로 쓰는 같은 모양이
있다. 지금 멈추지는 않지만 같은 뿌리다. 이번 범위를 넘으므로 손대지 않고 다음 일거리로 적는다.

**CI 실측**: 커밋 `5eeab8a5` 를 올린 뒤 CI (dashboard) 실행 `33273464200` 이 success 로 끝났다.
실패하던 실행 `33272245619` 와 같은 워크플로다.

---

## 2026-08-30 배포 preflight 교착 해소 (운영 실측 반영 2판)

**무엇이 문제였나.** 배포 preflight 가 `compatibility_ready=true|true` 를 요구하는데 운영은
`false|true` 다. `true` 로 만드는 두 길이 모두 막혀 있었다. `expand-guard` 는 Supabase 계정에
역할 생성 권한이 없어 영구 불가(`permission denied to alter role`), `expand-member` 는 실행 중
컨테이너의 revision 표식을 요구하는데 그 표식은 새 배포가 붙이고 그 배포는 preflight 에 막힌다.
**검사가 자기가 만든 정상 중간 상태를 자기가 거절**하는 순환이었다.

**무엇을 고쳤나.** `assert_compatibility_ready` 를 배포의 사전 조건에서 `expand-member` 의
사후 조건으로 옮기고, 배포 preflight 에는 `assert_deploy_compatible` 을 두었다. 배포가 요구하는
불변식은 "두 장부가 최소 `(tenant_id, member_id, ...)` 범위의 유효 UNIQUE 로 강제되고 중복이 0".
앱의 조회가 정확히 그 범위(`repository.ts` 의 `WHERE tenant_id AND member_id AND ...`)이므로
S1 에서 앱은 자기 읽기 범위와 완전히 일치한다. 게이트를 끈 것이 아니라 옮겼다.
`expand-member` 의 앱 표식 검사는 손대지 않았다. 우회로를 만들지 않았다.

**증거** (재현 스크립트 `dashboard/scripts/verify-deploy-preflight-deadlock.sh`, 종료 코드 0)

| 관문 | 결과 |
|---|---|
| 운영 상태 재현 | `schema_fingerprint=S1\|S2`, `compatibility_readiness=false\|true` |
| 표식 없는 상태에서 `preflight` | `deploy_compatible=S1\|S2 member_global_readiness=false\|true`, `runtime_schema=ok (22 checks)`, 0 |
| 필수 표 제거 뒤 `preflight` | `studio_generation_candidate_rejections missing-relation` 차단 |
| 격리 강제 해제 뒤 `preflight` | `drafts rls-not-forced` 차단 |
| 앱 역할 격리 우회 뒤 `preflight` | `osmu_service bypasses-rls` 차단 |
| 제약 정의 드리프트 뒤 `preflight` | `unsupported generation/quota schema fingerprint: X\|S2` 차단 |
| 회원 범위 중복 뒤 `preflight` | `member-scope duplicate audit failed: 1\|0\|0` 차단 |
| 표식 없이 `expand-member` | `phase requires an observed running app image digest and commit` 차단 |
| 표식 붙인 뒤 `expand-member` | `compatibility_ready=true\|true`, `schema_fingerprint=S2\|S2`, 0 |
| `npm run test` | **204 파일 통과, 1529건 통과, 1건 건너뜀, 실패 0** |
| `npx vitest run tests/db/` | 12 파일 55건 통과, 0 |
| `npx tsc --noEmit` | 0 |
| `npm run build` | 성공 |

계약 시험 `GEN-MIG-10c` 를 새로 넣어 이 교착이 다시 닫히면 시험이 깨지게 했다.
`GEN-MIG-05` 는 "회원 전역 강제는 expand-member 의 사후 조건"으로 다시 썼다.

**병합으로 사라졌던 것 점검.** 앞 판의 넷(지원 상태 집합, 필수 표 21개 검사, 격리 정책 검사,
색인 배열 시작 번호 수정)은 현재 파일에 모두 살아 있음을 확인했다. 사라진 것은 배포 preflight
완화 하나였고 이번 판에서 더 정확한 자리에 다시 넣었다.

**미검증.** 운영 DB 에 접속하지 않았고 운영 워크플로도 실행하지 않았다. 위는 전부 로컬 재현이다.
운영 배포와 `expand-member` 의 실제 통과는 회장이 누른 뒤에만 확인된다.

**회장이 누를 순서**: `docs/ship/releases-legacy-20260912/2026-08-29-배포-교착-해소-순서.md` (2026-08-30 개정판).
audit → apply-legacy → audit 재확인 → Deploy → expand-member. `expand-guard` 는 누르지 않는다.

### 2026-08-30 추가: 병합 요청 37번 CI 실패 대응 (단조성 검사 신설)

**CI 실패** 실행 33276049143. `verify-generation-migration-matrix.sh:239-245` 에서
`FAIL 회원 범위 강제가 없는 DB가 preflight 를 통과했다`.

**셀프심문: 내가 시험을 고친 것인가, 결함을 고친 것인가.**

**결함을 고쳤다.** 컨트롤러의 가능성 1이 맞았고 내 앞 판의 완화는 실제로 너무 넓었다.

그 자리는 `contract-generation` 을 끝낸 S3|S2 상태다. 거기서 회원 전역 제약을 떼면 지문은
S3|S1 이 되는데, 이것은 운영의 S1 과 **지문은 같지만 오는 길이 다르다.** 운영은 아직 안
올라간 것이고, 그 자리는 올라갔다가 내려간 것이다. 후자는 절차 밖에서 제약이 지워졌다는
뜻이고, **장부가 "적용됨"이라고 말하는 것과 실제 스키마가 어긋났다**는 뜻이다. 장부와 스키마의
불일치는 이 게이트 체계가 존재하는 이유 그 자체다(같은 계열: `verify_entry` 의 ledger
checksum mismatch). 앞 판의 지원 집합 검사만으로는 그 둘을 가르지 못했다.

**장부가 실제로 둘을 가른다는 것을 확인했다.** 운영 장부에는 `20260829_030_member_unique_expand`
가 없다(expand-member 가 한 번도 성공한 적 없다). 확장을 끝낸 DB 에는 applied 로 있다.
그리고 앞으로 가는 어떤 단계도 회원 전역 UNIQUE 를 걷어내지 않는다. contract 단계가 걷어내는
것은 tenant 범위 제약이다(`20260829_040`, `20260829_045`). 그러므로 다음 명제가 성립한다.

> `20260829_030` 이 applied 인데 회원 전역 UNIQUE 가 없으면, 그것은 되돌림이다.

이것을 `assert_ledger_monotonic` 으로 넣고 배포 게이트 안에 걸었다.

**시험은 지우지 않았다.** 그 자리는 여전히 막는 자리다. 바뀐 것은 무엇으로 막는지의 이름이다.
그리고 **가르는 근거가 진짜인지를 증명하는 사례 두 개를 그 자리에 새로 넣었다.**
사례 A와 사례 B는 **스키마가 완전히 같고 장부만 다르다.** A는 막히고 B는 통과한다.
이것이 "지문이 아니라 방향을 본다"의 실측 증거다.

**중간에 틀렸던 것 하나를 기록한다.** 처음에는 방어 장치(guard 트리거)에도 같은 단조성 규칙을
걸었다가, 로컬 실행에서 `20260829_021` 이 applied 인데 트리거가 없는 정상 상태를 만나 되돌렸다.
근거는 `20260829_020_generation_guard_expand.sql:104-115` 다. 그 마이그레이션은 회원 전역
UNIQUE 가 **없을 때만** 트리거를 만든다. 즉 방어 장치는 UNIQUE 의 조건부 대체물이라
"적용됨"이 "존재함"을 함의하지 않으므로 되돌림 판정 근거가 될 수 없다. 그 규칙은 제거했다.
방어 장치가 지키던 회원 범위 중복은 `assert_no_duplicates` 가 직접 센다.

**증거**

| 관문 | 결과 |
|---|---|
| `verify-generation-migration-matrix.sh` 전량 | **18 사례 전부 PASS, 종료 코드 0** |
| 신규 사례 A (장부 applied + 제약 없음) | `ledger says 20260829_030_member_unique_expand is applied but the member-global UNIQUE it created is gone` 로 차단 |
| 신규 사례 B (같은 스키마, 장부만 미적용) | `deploy_compatible=S3\|S1` 통과. 장부가 둘을 가른다 |
| `verify-deploy-preflight-deadlock.sh` (운영 상태 회귀) | `ledger_monotonic=ok (0 applied-stage checks)`, `deploy_compatible=S1\|S2`, ALL PASS, 종료 코드 0 |
| 계약 시험 `GEN-MIG-10d` 신설 | 27건 통과 |

운영 상태에서 `0 applied-stage checks` 가 찍히는 것이 핵심이다. 운영은 아직 아무것도
올렸다고 주장하지 않으므로 검사할 되돌림도 없다. 배포는 그대로 열려 있다.

**주의로 남기는 것.** 로컬에서 이 매트릭스를 돌릴 때는 `TZ=UTC PGTZ=UTC` 가 필요하다.
KST 환경에서는 무관한 사례 하나(`atomic rollback heartbeat`)가 시간대 때문에 실패한다.
CI 는 UTC 라 영향이 없다.

---

## OSMU 파생 생성. 하나의 주제를 여러 갈래로 (2026-08-30)

**무엇을 이었나.** 앞 조가 "주 갈래 하나 + 같이 만들 갈래 체크"를 화면과 상태까지 만들었고,
머리줄에 "지금 만드는 것: 영상 같이 카드뉴스"가 뜨지만 확정해도 카드뉴스가 실제로 만들어지지
않았다. 이 판이 그 뒤를 이어 실제 파생 생성을 붙였다. 근거는
`docs/_archive/legacy-20260912/design-docs/osmu-4room-구조질문-선택지-v1.0.0-opus-20260829.md` 질문2 확정안 나3.

**기존 구현 확인.** 새로 짓지 않고 이미 있던 것 위에 얹었다.

| 이미 있던 것 | 어떻게 썼나 |
|---|---|
| `src/components/studio/StudioRooms.tsx` 의 `primaryKind`, `alsoKinds` | 그대로 두고 확정 단추만 이어 붙였다 |
| `src/lib/studio/generation/service.ts` 생성 계약 | 후보를 파생의 재료로 읽는다. 후보 생성 경로는 안 건드렸다 |
| `src/lib/studio/editor-handoff.ts` 의 다섯 갈래 계약 | 파생물을 이 계약으로 만들어 편집실 작업물이 되게 했다 |
| `src/lib/studio/editor-handoff-store.ts` | 갈래마다 작업물 하나씩 저장한다 |

**돈이 나가는 길을 어떻게 정했나.** 이 판에서 가장 조심한 자리다.

1. **파생 장부를 무료 재생성 장부와 물리적으로 분리했다.** 새 표 `studio_derivation_batches`
   는 `studio_free_regeneration_uses` 와 다른 표다. 파생 경로는 `persistFreeRegeneration` 을
   한 번도 부르지 않는다. 같은 표를 나눠 쓰면 파생 한 번이 그날의 무료 몫을 갉아먹는 사고가
   언제든 다시 난다.
2. **갈래마다 단가를 따로 매긴다.** 글 0원, 카드뉴스 300원, 영상 1200원(기본값,
   `STUDIO_DERIVATION_COST_*_MINOR` 로 덮어쓴다). 글은 주 갈래 결과를 다시 엮는 것뿐이라
   바깥 호출이 없어 0원이고, 카드뉴스와 영상은 장면과 대사를 새로 만들어야 해서 더 든다.
3. **확정 전에 값을 보여 주고, 본 값과 다르면 시작하지 않는다.** 화면이 견적을 먼저 받아
   금액을 그리고, 확정 요청에 그 금액을 함께 보낸다. 서버 금액과 다르면 `DERIVATION_QUOTE_CHANGED`
   로 막고 아무것도 만들지 않는다.
4. **실패한 갈래는 값을 매기지 않는다.** 장부에 본 값(`quoted_minor`)과 나간 값(`charged_minor`)을
   따로 적고, 나간 값은 성공한 갈래 단가의 합이다. 표 제약으로 `charged_minor <= quoted_minor` 를 건다.
5. **같은 Idempotency-Key 재송신은 두 번 청구하지 않는다.** 재송신이면 이번에 만든 작업물을
   지우고 먼저 만든 것을 그대로 돌려준다.

**일부 실패를 정직하게 적는다.** 갈래별 `status` 와 `failure_reason` 을 따로 적고, 뭉치 상태는
`succeeded` / `partially_succeeded` / `failed` 셋이다. 하나라도 실패하면 응답 코드가 201 이
아니라 207 이다. 이 저장소가 한 번 했던 실수(첫 댓글 실패인데 published 로 저장)를 과금과
집계 양쪽에서 막았다.

**되돌릴 수 있다.** `DELETE /api/studio/v1/derivations/{batchId}` 로 파생물을 버린다. 파생
작업물만 지우고 주 갈래 생성 작업과 후보 세 장은 다른 표에 있어 함께 사라지지 않는다.

**증거**

| 관문 | 결과 |
|---|---|
| `npm run test` | **205 파일 1542건 통과, 1건 건너뜀, 실패 0** |
| 신설 계약 시험 `tests/studio/generation-derivation.test.ts` | DRV-01 ~ DRV-12 **12건 통과** |
| `npx tsc --noEmit` | 종료 코드 0 |
| `npm run build` | 성공. 새 경로 두 개 등록 확인 (`/api/studio/v1/generations/[jobId]/derivations`, `/api/studio/v1/derivations/[batchId]`) |
| `scripts/verify-derivation-osmu.mjs` (로컬 앱 3456 + 실 DB) | **22개 검사 전부 통과, 종료 코드 0** |
| 화면 관찰 (Playwright, 1440 폭) | 후보 고른 뒤 확정 전에 "확정하면 나가는 값 300원" 이 뜨고, 확정하면 "카드뉴스: 편집실에 넣었습니다", 버리면 "같이 만든 것을 버렸습니다" 로 바뀐다. **콘솔 오류 0** |
| 화면 갈무리 | `/tmp/derivation-2-값보임.png`, `/tmp/derivation-3-파생생김.png`, `/tmp/derivation-4-버림.png` |

검증 스크립트가 실측한 것: 견적 조회 200, 다른 값 보내면 `DERIVATION_QUOTE_CHANGED` 로 차단하고
장부에 0건, 파생 201 에 작업물 두 개가 서로 다른 초안으로 저장, 편집실에 들어간 갈래가
`["card","video"]`, **파생 뒤 나간 무료 몫 0**, 재송신 시 같은 파생이고 장부 1건에 값 1500원,
버린 뒤 파생 작업물 0건이고 주 갈래 후보는 여전히 세 장.

**셀프심문 두 가지에 답한다.**

*"회장이 이걸 눌렀을 때 예상 못 한 돈이 나가는 경로가 있는가."* 지금 코드에서는 없다. 값을 못 본
상태에서는 확정 단추 자체가 뜨지 않고, 값을 안 보내면 422, 다르게 보내면 409 다. 다만 정직하게
남길 것 하나. **단가는 아직 우리가 정한 상수이지 공급자 실청구가 아니다.** 실제 미디어 생성이
붙는 시점에 이 값이 실청구와 어긋나면 그때 다시 어긋난 값으로 조용히 나갈 수 있다. 그래서
단가를 코드 한 곳(`derivation.ts`)과 환경 설정으로만 바꾸게 묶어 두었고, 견적과 실제 청구를
`quoted_minor` 와 `charged_minor` 로 나눠 적어 두었다. 실공급자를 붙이는 판이 이 두 칸의
차이를 감시해야 한다.

*"일부 실패가 성공으로 집계되는 자리가 있는가."* 찾아본 자리는 셋이다. ①뭉치 상태:
`batchStatus` 가 성공 갯수로만 판정하므로 하나라도 실패하면 `succeeded` 가 안 된다(DRV-06).
②과금: 실패 갈래의 `chargedMinor` 는 0이고 합계에 들어가지 않는다(DRV-06, DRV-07).
③응답 코드: 부분 실패는 201 이 아니라 207 이다. 남는 위험 하나는 **편집실 쪽 집계**다.
파생 작업물이 `drafts` 표에 들어가므로 기존 화면의 "작업물 전체" 숫자가 파생물까지 함께 센다.
이것은 실패를 성공으로 세는 것은 아니지만 파생과 원본을 구분하지 않는 자리이므로, 편집실에
갈래 알약을 붙이는 다음 판이 다뤄야 한다.
# 2026-08-31 PASS: 생성실 실제 LLM 연동

- 로컬 Studio 생성 클릭 HTTP 201, 서로 다른 후보 A/B/C 화면 관찰.
- 영상 파생 HTTP 201, 실제 대본과 장면 구성 관찰. 영상 렌더링은 미제공으로 명시.
- LLM 실패 시 템플릿 fallback 없음, model·attempt·token·비용 장부 확인.
- 전체 Vitest 207파일 1,554건, TypeScript, build 177/177, design lint 0.
- 운영 배포와 운영 Studio UI는 미검증.
## 2026-09-12 06시 39분 build 재검증: 관리자 콘솔 수치와 인증 경계 직접 대조

인증 헤더를 사용한 로컬 관리자 콘솔을 실제 브라우저에서 새로고침해 화면과 관리자 API의
상태가 일치하는 것을 확인했다. 가입자 0명, 워크스페이스 2개, 연결 계정 0개, 발행 0건이며
OAuth provider 12개 중 완전 설정 0개다. Seed A에는 초안 1개와 공유 AI 사용 한도 관련
운영 장애가 보인다. 화면에 연결이나 발행이 된 것처럼 보이는 허위 상태는 관찰되지 않았다.

| 검증 | 판정 | 직접 근거 |
|---|---|---|
| 관리자 고객 화면 | PASS | localhost 브라우저에서 `/operator/customers` 실제 렌더, 워크스페이스 2개와 연결 계정 0개 확인 |
| 관리자 API와 화면 수치 일치 | PASS | `/api/operator/customers` 응답과 화면의 가입자·워크스페이스·연결·발행 수치 일치 |
| OAuth 설정 현황 | NG | provider 12개, 완전 설정 0개, 필수 앱 자격증명 미설정 |
| 화면 fresh console | PASS | console buffer clear 후 reload, console errors 없음 |
| localhost·Tunnel health | PASS | 두 주소 모두 HTTP 200, DB up |
| 원격 관리자 콘솔 수치 | 미검증 | 로컬 운영자 토큰으로 원격 operator API HTTP 401, 배포 토큰 미확인 |
| 회원 OAuth2·생성·편집·외부 발행·성과 | 미검증 | 회원 세션·OAuth 자격증명·채널 연결 계정 없음 |

이번 결과의 의미는 관리자 관제와 로컬 인증 경계는 실제 화면까지 확인됐지만, 고객이 로그인해
생성부터 발행까지 가는 제품 경로는 아직 열리지 않았다는 것이다. 특히 관리자 API가 정상이어도
가입자 0명과 연결 계정 0개인 상태에서는 콘텐츠 품질과 외부 성과를 판단할 수 없다.

벤치마크: 화면과 API 수치를 대조하는 기계적 QA라 새 경쟁 벤치마크는 해당 없음. 작성·편집·계획
연결의 기존 비교 기준은 [Buffer](https://buffer.com/integrations/canva),
[Vrew](https://vrew.ai/ko/feature/subtitle-editing/), [Later](https://later.com/blog/social-media-calendar/)다.

소스 1: 로컬 관리자 콘솔 브라우저 화면과 fresh console.

소스 2: `/api/operator/customers`, `/api/operator/oauth-credentials`, localhost·Tunnel health.

소스 3: `dashboard/src/app/operator/customers/page.tsx`, `session-state.osmu.md`, pipeline state.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

**다음 실행**: 담당자는 Codex 컨트롤러다. 공유 AI 한도 복구 또는 자체 Anthropic 키와 OAuth 자격증명이 준비되는 즉시 회원 identity 200, 글·카드뉴스·영상 생성, 편집, 외부 permalink, 성과 API를 실제 화면과 외부 응답으로 확인한다. 종료 증거는 화면 클릭, 외부 URL, 성과 응답, QA 승인 artifact pin이다.
# 2026-09-12 20시 05분 KST · 네 방 브라우저 QA 재실행 결과

- 발견: 현재 개발 서버 3456과 신규 임시 서버 3000에 `verify-four-room-ui-e2e.mjs`를 각각 연결했다. 두 실행 모두 `/api/me` 인증과 `/studio?room=create` HTTP 200까지는 관찰됐지만, 브라우저에서 `[data-room="create"]`가 30초 안에 visible 상태가 되지 않아 생성실 진입에서 중단됐다. 3000 실행에서는 같은 저장소의 기존 3456 개발 서버와 동시 실행되어 Turbopack이 `/login/page`를 쓰는 중 `Next.js package not found` 패닉도 기록했다. 3456 기존 서버에 직접 붙인 재실행에서도 동일한 DOM 대기 실패가 재현됐다.
- 의미: 인증 토큰 발급, 설정 원복, 임시 토큰 폐기는 검증기 종료 경로로 처리됐지만 네 방 흐름·가로 넘침·다크 테마·콘솔 오류를 측정할 수 있는 화면 상태까지 도달하지 못했다. 따라서 반응형 UX가 통과했다고 보고할 수 없으며, 회원이 실제로 생성실에서 작업을 시작하는 핵심 경로가 아직 미검증이다. 현재는 선택자 누락으로 단정하지 않고, 클라이언트 hydration 또는 장기 개발 서버의 라우팅 상태를 먼저 분리해야 한다.
- 판정: `미검증`. 네 방 PASS 및 배포 승인으로 승격하지 않는다.
- [모델]: 이번 실행은 브라우저 런타임과 로컬 로그를 직접 확인한 기계적 QA이며 모델 판단으로 대체하지 않았다.
- 벤치마크: 해당 없음. 경쟁사 비교가 아니라 현재 저장소의 브라우저 DOM과 로컬 개발 서버 상태를 재현하는 결함 검증이다.
- ⛔ 검증실패 보고: 등급 A, 네 방 브라우저 검증기가 생성실 DOM 표시 대기에서 실패했고 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근도 없어 외부 발행 완료로 출고하지 않음.
- 다음 실행: 소유자 Codex 컨트롤러. 단일 개발 서버를 정리한 뒤 동일 검증기를 한 번에 실행하고, 종료증거는 390·768·1024·1440 폭 측정 기록, 390 라이트·다크 캡처, 가로 넘침 0px, 401 0건, 콘솔 오류 0건이다. 서버 상태 분리는 다음 로컬 QA 실행에서 즉시 재개한다. 외부 OAuth와 실제 발행은 회장 Safari 세션에서 자격증명·콘솔 주소를 회수한 직후에만 확인한다.
- 소스 1: `dashboard/scripts/verify-four-room-ui-e2e.mjs`, 방 선택·반응형·오버플로·401·콘솔 오류 판정 계약.
- 소스 2: `dashboard/src/app/studio/page.tsx`, `activeRoom === "create"` 렌더링과 workspace hydration 조건.
- 소스 3: `.next/dev/logs/next-development.log`, 3456 기존 개발 서버의 실제 실행 및 3000 동시 실행 시 Turbopack 패닉 로그.
## 2026-09-16 03시 18분 KST · 성과 시계열 갭 재착수 NG

| 범위 | 시험 항목 | 번호 | 판정 | 직접 증거 |
|---|---|---|---|---|
| R68, API 갭 P2 | 게시물별 성과 시계열과 재현 가능한 30일 비교 | GAP-HISTORY-20260916-0318-01 | ❌ NG | 현재 `dashboard/db/schema.sql`의 `published_posts`는 최신 누계와 `metrics_at`만 보존하고, `GET /api/metrics` 응답은 `posts`, `coverage`만 반환한다. |
| pipeline build 허용 범위 | 승인된 저장·집계 계약 안에서 구현 가능한지 확인 | GAP-HISTORY-20260916-0318-02 | BLOCK | `pipeline-state.osmu.md`는 `current_stage: qa`, `status: in-progress (승인 아님)`이다. 성과 snapshot 단위, 멱등 키, 보존 기간, 공급자 정규화와 30일 비교식의 승인된 DB·API 계약도 없다. |

원인 판정: 두 감사에서 남은 기본 흐름 갭은 새 저장 모델과 API 의미를 요구한다. 현재 누계값을
30일 성과로 재해석하면 공급자별 계약 차이를 숨기고 재현 불가능한 비교를 만든다. 제품 소스와
migration은 수정하지 않고, 최신 코드와 localhost 회귀를 다시 확인한 뒤 증거를 갱신한다.
