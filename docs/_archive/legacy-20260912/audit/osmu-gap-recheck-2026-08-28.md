# 갭 감사 재확인 2026-08-28

## 2026-09-19 03시 10분 갭 재확인: 성과 시계열 build 게이트와 실앱 생성 BLOCK

두 기반 감사, 회장 요구 대장, v63 프로토타입, 사업 좌표와 현재 schema, migration, 성과 Route
Handler를 다시 대조했다. 감사 당시의 다른 없음과 부족 항목은 현재 구현돼 있다. 기본 흐름에서
지금도 없는 것은 게시물별 성과 관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교다.

| 계약 | 현재 판정 | 직접 증거 |
|---|---|---|
| 게시물별 성과 이력 | 없음 | `published_posts`는 최신 누계와 `metrics_at`만 보존한다. 관측 시각별 이력 table과 migration이 없다. |
| 재현 가능한 30일 비교 | 없음 | 지정 작업 공간 `GET /api/metrics`는 HTTP 200, 키 `coverage`, `posts`, 게시물 0건이다. `history`, `comparison`은 없다. |
| 공정과 기술계약 | BLOCK | `pipeline-state.osmu.md`는 `qa`, `in-progress`, 승인 아님이다. 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준이 승인되지 않았다. |
| 실행본 귀속 | 제품 소스 동일 | localhost health는 HTTP 200, DB up, build `d0bc4f7b`다. 현재 HEAD `e4e6885d`까지 `dashboard/src`, `dashboard/db`, `dashboard/package.json` diff는 0건이다. |
| 전체 단위 및 통합 | PASS | `npm run test`는 378파일, 2,431건 통과, 3건 제외, 종료 코드 0이다. |
| TypeScript와 디자인 토큰 | PASS | `npx tsc --noEmit`과 `design-lint.sh src` 종료 코드 0, 토큰 위반 0이다. |
| Web production build | 조건부 NG | 격리 HEAD에서 `npm run build`는 Next.js 16 Turbopack의 한국어 주석 code frame panic으로 종료 코드 1이다. 같은 소스를 `npx next build --webpack`으로 빌드하면 185/185와 종료 코드 0이다. |
| 기본 흐름 실앱 | NG | 지정 작업 공간에서 첫 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 후보 0장으로 종료 코드 1이다. |
| Studio v1 실앱 | NG | 401, 400, 422 거절은 통과했다. 정상 생성은 기대 201 대신 HTTP 200의 같은 공급자 오류로 종료 코드 1이다. |
| 제품 소스 | 변경 없음 | 승인 없는 DB와 API 의미를 선택하지 않았다. 새로 되는 것으로 전환된 항목은 없다. |

공유 생성 공급자의 7일 사용량은 `usage-check.sh` 실측 100%이고 2026-09-19 19:00 KST에
초기화된다. 이 실앱 실패는 성과 시계열 계약 부재와 별개이며, 필수 E2E 통과 조건도 현재 충족하지
못한다.

외부 공식 계약도 저장 의미를 먼저 합의해야 한다는 결론을 지지한다. YouTube Analytics는 시작일,
종료일, 지표와 차원으로 기간을 정의한다. TikTok Video Query는 영상별 조회수, 좋아요, 댓글과
공유의 현재 누계값을 반환한다. 두 공급자를 하나의 기간 비교로 묶으려면 원본 의미와 로컬 관측값을
분리해 보존하는 승인 계약이 필요하다.

레드팀: 최신 누계 두 번의 차이를 최근 30일 성과로 표시하면 화면은 채울 수 있다. 수집 누락과
누계 감소를 기간 성과로 오판하고 같은 결과를 재계산할 수 없어 기본 흐름 완성으로 볼 수 없다.

셀프심문: 이 차단이 틀렸다면 승인된 관측 이력 migration과 `history`, `comparison` API 계약이
있거나 현재 공정이 build여야 한다. pipeline, schema, migration, Route Handler와 실제 응답에서
어느 조건도 찾지 못했다.

회수 필요: 컨트롤러와 tech-architect가 snapshot 저장 모델, 멱등 키, 보존 기간, 공급자별 원본과
정규화 지표, 최근 30일과 직전 30일 비교식, 표본 부족 기준을 합의하고 eng-design을 승인한 뒤
build를 다시 열어야 한다. 공급자 한도 초기화 뒤 두 필수 localhost E2E도 종료 코드 0을 회복해야
한다.

STAMP | line: osmu-gapfill091903-codex | 생성: 2026-09-19 03:10 KST | model: gpt-codex/gpt-5 | agent: code-builder | skill: 없음 | 근거: 두 갭 감사, pipeline, schema와 Route Handler, localhost 실제 요청, 전체 회귀, 공식 공급자 문서 | 고민: 반복된 구현 발주라도 QA 공정과 미승인 저장 계약을 우회하지 않았다.

SKILLS_USED: 없음. 기존 Next.js와 PostgreSQL 성과 저장 build에 직접 대응하는 설치 스킬이 없다. SKILLS_SKIPPED: `qa`는 신규 DB와 API 기술계약 선택을 대신할 수 없어 적용하지 않았다.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 관측 이력, 재현 가능한 30일 비교, YouTube 기간 보고와 TikTok 누계 성과 계약을 검색했다.
HITS_USED: BRAIN business index와 OSMU 관련 문서, repo 사업 좌표, 두 갭 감사, v63 성과 계약, Google YouTube Analytics와 TikTok Video Query 공식 문서를 잔여 갭과 저장 계약 선행 필요성 판정에 사용했다.
HITS_REJECTED: 일반 마케팅 자료와 TikTok Research API는 고객용 저장 및 비교 계약의 근거가 아니어서 제외했다.
CONFLICTS: 외부 공식 계약과 회장 정본의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀은 충돌하지만 이번 비화면 판정에는 영향을 주지 않는다.

SOURCES: 두 갭 감사 | v63 프로토타입 | 회장 요구 대장 | OSMU 사업 좌표 | `dashboard/db/schema.sql` | `dashboard/src/app/api/metrics/route.ts` | https://developers.google.com/youtube/analytics/reference/reports/query | https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query

MODEL: gpt-codex/gpt-5 / code-builder

## 2026-09-18 12시 16분 갭 재확인: 성과 시계열 기술계약 미승인과 전체 회귀 NG로 build 회수

두 기반 감사와 현재 schema, migration, 성과 Route Handler를 대조했다. 감사 당시의 다른 없음과
부족 항목은 현재 구현돼 있다. 기본 흐름에서 지금도 없는 것은 게시물별 성과 관측 이력과 재현
가능한 최근 30일 대 직전 30일 비교다.

| 계약 | 현재 판정 | 직접 증거 |
|---|---|---|
| 게시물별 성과 이력 | 없음 | `published_posts`는 최신 누계와 `metrics_at`만 보존한다. 관측 시각별 이력 table과 migration이 없다. |
| 재현 가능한 30일 비교 | 없음 | `GET /api/metrics`는 `posts`, `coverage`를 반환하고 `history`, `comparison` 계약이 없다. |
| 공정과 기술계약 | BLOCK | `pipeline-state.osmu.md`는 `qa`, `in-progress`, 승인 아님이다. 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준이 승인되지 않았다. |
| 기본 흐름 실앱 | PASS | 현재 HEAD를 임시 기동한 localhost:3456에서 `verify-basic-flow-e2e.mjs` 11/11을 관찰했다. |
| Studio v1 실앱 | PASS | 같은 실행본에서 `verify-studio-v1-e2e.mjs` 14/14를 관찰했다. |
| TypeScript | PASS | 개발 서버 종료 후 `npx tsc --noEmit` 재실행 종료 코드 0이다. |
| 전체 단위 및 통합 | NG | `npm run test`는 377파일 중 3파일, 2,431건 중 7건 실패했다. 실패 파일 3개를 다시 돌리자 publish 32/32와 shorts factory 5/5는 통과했고 `V77-CREATE-NETWORK-03`만 10초 timeout으로 남았다. 전체 명령은 아직 통과하지 않았다. |
| 제품 소스 | 변경 없음 | 승인 없는 DB와 API 의미를 선택하지 않았고 필수 전체 회귀도 NG다. 새로 되는 것으로 전환된 항목은 없다. |

외부 공식 계약도 저장 의미를 먼저 합의해야 한다는 결론을 지지한다. YouTube Analytics는 시작일,
종료일, 지표와 차원으로 기간을 정의한다. TikTok Video Query는 영상별 조회수, 좋아요, 댓글과
공유의 현재 누계값을 반환한다. 두 공급자를 하나의 기간 비교로 묶으려면 원본 의미와 로컬 관측값을
분리해 보존하는 승인 계약이 필요하다.

레드팀: 최신 누계 두 번의 차이를 최근 30일 성과로 표시하면 화면은 채울 수 있다. 그러나 수집
누락과 누계 감소를 기간 성과로 오판하고 같은 결과를 재계산할 수 없어 기본 흐름 완성으로 볼 수 없다.

셀프심문: 이 차단이 틀렸다면 승인된 관측 이력 migration과 history 및 comparison API 계약이
있어야 한다. pipeline, schema, migration, Route Handler와 실제 응답 계약에서 찾지 못했다.

회수 필요: 컨트롤러와 tech-architect가 snapshot 저장 모델, 멱등 키, 보존 기간, 공급자별 원본과
정규화 지표, 최근 30일과 직전 30일 비교식, 표본 부족 기준을 합의하고 eng-design을 승인한 뒤
build를 다시 열어야 한다. `V77-CREATE-NETWORK-03` timeout 원인을 해소하고 전체 `npm run test`도
종료 코드 0을 회복해야 한다.

STAMP | line: osmu-gapfill091811-codex | 생성: 2026-09-18 12:16 KST | model: gpt-codex/gpt-5 | agent: code-builder | skill: 없음 | 근거: 두 갭 감사, pipeline, schema와 Route Handler, localhost 실제 요청, 전체 회귀, 공식 공급자 문서 | 고민: 실앱 두 흐름 통과와 별개로 미승인 저장 계약과 전체 회귀 실패를 완료로 포장하지 않았다.

SKILLS_USED: 없음. 기존 Next.js와 PostgreSQL 성과 저장 build에 직접 대응하는 설치 스킬이 없다. SKILLS_SKIPPED: `qa`는 신규 DB와 API 기술계약 선택을 대신할 수 없고 이번 과제의 제품 결함 자동 수정까지 승인받지 않아 적용하지 않았다.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 관측 이력, 재현 가능한 30일 비교, YouTube 기간 보고와 TikTok 누계 성과 계약을 검색했다.
HITS_USED: BRAIN business index와 OSMU 관련 문서, repo 사업 좌표, 두 갭 감사, v63 성과 계약, Google YouTube Analytics와 TikTok Video Query 공식 문서를 잔여 갭과 저장 계약 선행 필요성 판정에 사용했다.
HITS_REJECTED: 일반 마케팅 자료와 TikTok Research API는 고객용 저장 및 비교 계약의 근거가 아니어서 제외했다.
CONFLICTS: 외부 공식 계약과 회장 정본의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀은 충돌하지만 이번 비화면 판정에는 영향을 주지 않는다.

SOURCES: 두 갭 감사 | v63 프로토타입 | 회장 요구 대장 | OSMU 사업 좌표 | `dashboard/db/schema.sql` | `dashboard/src/app/api/metrics/route.ts` | https://developers.google.com/youtube/analytics/reference/reports/query | https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query

MODEL: gpt-codex/gpt-5 / code-builder

## 2026-09-18 03시 36분 갭 재확인: 성과 시계열 기술계약과 Studio v1 회귀 NG로 build 회수

두 기반 감사, 현재 schema와 migration, 성과 Route Handler, 테스트를 다시 대조했다. 감사 당시의
다른 없음과 부족 항목은 현재 코드에 구현돼 있다. 기본 흐름에서 지금도 없는 것은 게시물별 성과
관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교 하나다.

| 계약 | 현재 판정 | 직접 증거 |
|---|---|---|
| 게시물별 성과 이력 | 없음 | `published_posts`는 최신 누계와 `metrics_at`만 보존한다. 관측 시각별 이력 table과 migration이 없다. |
| 재현 가능한 30일 비교 | 없음 | 지정 작업 공간 `GET /api/metrics` HTTP 200. 응답 키는 `coverage`, `posts`, 게시물 0건이며 `history`, `comparison`이 없다. |
| 공정과 기술계약 | BLOCK | `pipeline-state.osmu.md`는 `qa`, `in-progress`, 승인 아님이다. 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준이 승인되지 않았다. |
| 실행본 귀속 | 확인 | localhost health HTTP 200, DB up, 실행 제품과 현재 HEAD는 `8cc2dd4f5d61a099834271d5419e5bc8838f480a`다. |
| 전체 회귀 | PASS | 실제 PostgreSQL에 schema, seed, RLS와 legacy migration을 적용한 직렬 전체 실행에서 376파일, 2,429건 통과, 1건 제외, 종료 코드 0이다. 병렬 실행의 정리 단계 교착 1건은 해당 파일 단독과 직렬 전체에서 재현되지 않았다. |
| 타입과 디자인 토큰 | PASS | `npx tsc --noEmit`, `design-lint.sh src` 종료 코드 0, 토큰 위반 0이다. |
| 기본 흐름 실앱 | PASS | 최신 HEAD의 localhost:3456에서 11/11 통과했다. |
| Studio v1 실앱 | NG | 인증과 입력 거절, 정상 생성, 조회까지 10/14 통과했다. 후보 전체 거절 2건, 무료 재생성 상태, 대체 후보 확인 4건이 실패했다. |
| 제품 소스 | 변경 없음 | 승인 없는 DB schema와 API 의미를 선택하지 않았다. 새로 되는 것으로 전환된 항목은 없다. |

외부 공식 계약도 저장 의미를 먼저 합의해야 한다는 결론을 지지한다. YouTube Analytics는 시작일,
종료일, 지표와 차원으로 기간을 정의한다. TikTok Video Query는 영상별 조회수, 좋아요, 댓글과
공유의 누계값을 반환한다. 두 공급자를 하나의 기간 비교로 묶으려면 원본 의미와 로컬 관측값을
분리해 보존하는 승인 계약이 필요하다.

레드팀: 최신 누계 두 번의 차이를 최근 30일로 표시하면 화면은 빨리 채울 수 있다. 수집 누락과
누계 감소를 기간 성과로 오판하고 같은 결과를 재계산할 수 없어 기본 흐름 완성으로 볼 수 없다.

셀프심문: 이 차단이 틀렸다면 승인된 관측 이력 migration과 history 및 comparison API 계약이
있어야 한다. pipeline, 데이터 모델, schema, migration, Route Handler와 실제 응답에서 찾지 못했다.

회수 필요: 컨트롤러와 tech-architect가 게시물별 snapshot 저장 모델, 멱등 키, 보존 기간,
공급자별 원본과 정규화 지표, 최근 30일과 직전 30일 비교식, 표본 부족 기준을 합의하고 eng-design을
승인한 뒤 build를 다시 열어야 한다. Studio v1 회귀도 14/14를 회복해야 한다.

STAMP | line: osmu-gapfill091803-codex | 생성: 2026-09-18 03:36 KST | model: gpt-codex/gpt-5 | agent: code-builder | skill: 없음 | 근거: 두 갭 감사, pipeline, schema와 Route Handler, localhost 실제 요청, 전체 회귀, 공식 공급자 문서 | 고민: 반복 발주라도 QA 공정과 미승인 저장 계약, 실패한 Studio v1 검증을 우회하지 않았다.

SKILLS_USED: 없음. 기존 Next.js와 PostgreSQL 성과 저장 build에 직접 대응하는 설치 스킬이 없다. SKILLS_SKIPPED: `qa`는 신규 DB와 API 기술계약 선택을 대신할 수 없고 이번 과제 범위를 제품 결함 수정으로 넓히지 않기 위해 적용하지 않았다.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 관측 이력, 재현 가능한 30일 비교, YouTube 기간 보고와 TikTok 누계 성과 계약을 검색했다.
HITS_USED: BRAIN business index와 OSMU 관련 문서, repo 사업 좌표, 두 갭 감사, v63 성과 계약, Google YouTube Analytics와 TikTok Video Query 공식 문서를 잔여 갭과 저장 계약 선행 필요성 판정에 사용했다.
HITS_REJECTED: 일반 마케팅 자료와 TikTok Research API는 고객용 저장 및 비교 계약의 근거가 아니어서 제외했다.
CONFLICTS: 외부 공식 계약과 회장 정본의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀은 충돌하지만 이번 비화면 판정에는 영향을 주지 않는다.

SOURCES: 두 갭 감사 | v63 프로토타입 | 회장 요구 대장 | OSMU 사업 좌표 | `wiki/5-hubs/hub-eng/architecture/data-model.md` | `dashboard/db/schema.sql` | `dashboard/src/app/api/metrics/route.ts` | https://developers.google.com/youtube/analytics/reference/reports/query | https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query

MODEL: gpt-codex/gpt-5 / code-builder

## 2026-09-17 23시 15분 갭 재확인: 성과 시계열 기술계약과 실앱 회귀 NG로 build 회수

두 기반 감사, 현재 schema와 migration, 성과 Route Handler, 테스트를 다시 대조했다. 감사 당시의
다른 없음·부족 항목은 현재 코드에 구현돼 있다. 기본 흐름에서 지금도 없는 것은 게시물별 성과
관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교 하나다.

| 계약 | 현재 판정 | 직접 증거 |
|---|---|---|
| 게시물별 성과 이력 | 없음 | `published_posts`는 최신 누계와 `metrics_at`만 보존한다. 관측 시각별 이력 table과 migration이 없다. |
| 재현 가능한 30일 비교 | 없음 | 지정 작업 공간 `GET /api/metrics` HTTP 200. 응답 키는 `coverage`, `posts`, 게시물 0건이며 `history`, `comparison`이 없다. |
| 공정과 기술계약 | BLOCK | `pipeline-state.osmu.md`는 `qa`, `in-progress`, 승인 아님이다. 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준이 승인되지 않았다. |
| 실행본 귀속 | 부분 확인 | localhost health HTTP 200, DB up, 실행 `7c9c9050`, 현재 HEAD `8e4585e7`. 두 커밋 사이 성과 route, schema, migration과 두 필수 E2E 스크립트 변경은 0건이다. |
| 전체 회귀 | PASS | Vitest 374파일·2,416건 통과, 3건 제외. TypeScript 종료 0. |
| 기본 흐름 실앱 | NG | `verify-basic-flow-e2e.mjs` 최초와 재실행 모두 첫 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 후보 0장으로 종료 코드 1이다. 서버 고정 원인은 `exit_nonzero`다. |
| Studio v1 실앱 | NG | 인증·멱등 키·빈 본문 거절은 401·400·422로 통과했다. 정상 생성은 기대 201 대신 HTTP 200의 같은 공급자 오류를 받아 종료 코드 1이다. |
| 제품 소스 | 변경 없음 | 승인 없는 DB 스키마와 API 의미를 선택하지 않았고, 두 필수 실앱 E2E도 통과하지 못했다. 새로 되는 것으로 전환된 항목은 없다. |

외부 공식 계약도 저장 의미를 먼저 합의해야 한다는 결론을 지지한다. YouTube Analytics는
시작일, 종료일, 지표와 차원으로 기간을 정의한다. TikTok 영상 조회 계약은 영상별 조회수,
좋아요, 댓글과 공유의 누계값을 반환한다. 두 공급자를 하나의 기간 비교로 묶으려면 원본 의미와
로컬 관측값을 분리해 보존하는 승인 계약이 필요하다.

레드팀: 최신 누계 두 번의 차이를 최근 30일로 표시하면 화면은 빨리 채울 수 있다. 수집 누락과
누계 감소를 기간 성과로 오판하고 같은 결과를 재계산할 수 없어 기본 흐름 완성으로 볼 수 없다.

셀프심문: 이 차단이 틀렸다면 승인된 관측 이력 migration과 history·comparison API 계약이 있어야
한다. pipeline, 데이터 모델, schema, migration, Route Handler와 실제 응답에서 찾지 못했다.

회수 필요: 컨트롤러와 tech-architect가 게시물별 snapshot 저장 모델, 멱등 키, 보존 기간,
공급자별 원본과 정규화 지표, 최근 30일과 직전 30일 비교식, 표본 부족 기준을 합의하고 eng-design을
승인한 뒤 build를 다시 열어야 한다. 생성 공급자 실앱 회귀도 두 필수 E2E가 통과할 때까지 NG다.

STAMP | line: osmu-gapfill091723-codex | 생성: 2026-09-17 23:15 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 근거: 두 갭 감사, pipeline, schema와 Route Handler, localhost 실제 요청, 전체 회귀, 공식 공급자 문서 | 고민: 반복 발주라도 QA 공정과 미승인 저장 계약, 실패한 실앱 검증을 우회하지 않았다.

SKILLS_USED: 없음. 기존 Next.js와 PostgreSQL 성과 저장 build에 직접 대응하는 설치 스킬이 없다. SKILLS_SKIPPED: `qa`는 신규 DB와 API 기술계약 선택을 대신할 수 없고 이번 과제 범위를 제품 결함 수정으로 넓히지 않기 위해 적용하지 않았다.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 관측 이력, 재현 가능한 30일 비교, YouTube 기간 보고와 TikTok 누계 성과 계약을 검색했다.
HITS_USED: BRAIN business index, repo 사업 좌표, 두 갭 감사, v63 성과 계약, Google YouTube Analytics와 TikTok Video Query 공식 문서를 잔여 갭과 저장 계약 선행 필요성 판정에 사용했다.
HITS_REJECTED: 일반 마케팅 자료와 TikTok Research API는 고객용 저장 및 비교 계약의 근거가 아니어서 제외했다.
CONFLICTS: 외부 공식 계약과 회장 정본의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀은 충돌하지만 이번 비화면 판정에는 영향을 주지 않는다.

SOURCES: 두 갭 감사 | v63 프로토타입 | 회장 요구 대장 | OSMU 사업 좌표 | `wiki/5-hubs/hub-eng/architecture/data-model.md` | `dashboard/db/schema.sql` | `dashboard/src/app/api/metrics/route.ts` | https://developers.google.com/youtube/analytics/reference/reports/query | https://developers.tiktok.com/docs/en/tiktok-api-v1-video-query

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 2026-09-17 19시 22분 갭 재확인: 성과 시계열 기술계약 미승인으로 build 회수

두 기반 감사를 현재 schema, migrations, 성과 Route Handler와 다시 대조했다. 감사 당시의 다른
없음·부족 항목은 현재 코드에 구현돼 있고, 기본 흐름에서 지금도 없는 것은 게시물별 성과 관측
이력과 재현 가능한 최근 30일 대 직전 30일 비교 하나다.

| 계약 | 현재 판정 | 직접 증거 |
|---|---|---|
| 게시물별 성과 이력 | 없음 | `published_posts`는 최신 누계와 `metrics_at`만 보존한다. 관측 시각별 이력 table과 migration이 없다. |
| 재현 가능한 30일 비교 | 없음 | 지정 작업 공간 `GET /api/metrics` HTTP 200. 응답 키는 `posts`, `coverage`, 게시물 0건이며 `history`, `comparison`이 없다. |
| 공정과 기술계약 | BLOCK | `pipeline-state.osmu.md`는 `qa`, `in-progress`, 승인 아님이다. 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준이 승인되지 않았다. |
| 회귀 | PASS | Vitest 374파일·2,416건 통과, 3건 제외. TypeScript 종료 0. localhost 기본 흐름 11/11과 Studio v1 14/14 통과. |
| 제품 소스 | 변경 없음 | 승인 없는 DB 스키마와 API 의미를 워커가 선택하지 않았다. 새로 되는 것으로 전환된 항목은 없다. |

외부 공식 계약도 같은 결론을 지지한다. YouTube Analytics는 시작일·종료일·지표·차원으로 기간을
정의하지만 TikTok Video Query는 영상별 누계 수치를 반환한다. 두 공급자를 하나의 기간 비교로
묶으려면 원본 의미와 로컬 관측값을 분리해 보존하는 승인 계약이 먼저 필요하다.

레드팀: 최신 누계 두 번의 차이를 최근 30일로 표시하면 빠르지만 수집 누락과 누계 감소를 기간
성과로 오판한다. 같은 결과를 다시 계산할 수 없으므로 기본 흐름 완성으로 볼 수 없다.

셀프심문: 이 차단이 틀렸다면 승인된 관측 이력 migration과 history·comparison API 계약이 있어야
한다. pipeline, data model, schema, migrations, Route Handler와 실제 응답에서 찾지 못했다.

⛔ 회수 필요: 컨트롤러와 tech-architect가 게시물별 snapshot 저장 모델, 멱등 키, 보존 기간,
공급자별 원본과 정규화 지표, 최근 30일과 직전 30일 비교식, 표본 부족 기준을 합의하고 eng-design을
승인한 뒤 build를 다시 열어야 한다.

STAMP | line: osmu-gapfill091719-codex | 생성: 2026-09-17 19:22 KST | model: gpt-codex/gpt-5 | agent: code-builder | skill: 없음 | 근거: 두 갭 감사, pipeline, schema와 Route Handler, localhost 실제 요청, 전체 회귀, 공식 공급자 문서 | 고민: 반복 발주라도 QA 공정과 미승인 저장 계약을 우회하지 않았다.

SKILLS_USED: 없음. 기존 Next.js와 PostgreSQL 성과 저장 build에 직접 대응하는 설치 스킬이 없다. SKILLS_SKIPPED: `qa`는 신규 DB와 API 기술계약 선택을 대신할 수 없어 적용하지 않았다.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 관측 이력, 재현 가능한 30일 비교, YouTube 기간 보고와 TikTok 누계 성과 계약을 검색했다.
HITS_USED: BRAIN business index, repo 사업 좌표, 두 갭 감사, v63 성과 계약, Google YouTube Analytics와 TikTok Video Query 공식 문서를 잔여 갭과 저장 계약 선행 필요성 판정에 사용했다.
HITS_REJECTED: 일반 마케팅 자료와 TikTok Research API는 고객용 저장 및 비교 계약의 근거가 아니어서 제외했다.
CONFLICTS: 외부 공식 계약과 회장 사업 정본의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀은 충돌하지만 이번 비화면 판정에는 영향을 주지 않는다.

SOURCES: 두 갭 감사 | v63 프로토타입 | 회장 요구 대장 | OSMU 사업 좌표 | `wiki/5-hubs/hub-eng/architecture/data-model.md` | `dashboard/db/schema.sql` | `dashboard/src/app/api/metrics/route.ts` | https://developers.google.com/youtube/analytics/reference/reports/query | https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query

MODEL: gpt-codex/gpt-5 / code-builder

## 2026-09-17 11시 14분 갭 재확인: 성과 시계열 기술계약 미승인으로 build 회수

두 기반 감사를 현재 API, schema, migration, 테스트와 대조했다. 감사 당시 없던 댓글 행동,
성과 제안 인계, 성과 0건 가설, Threads 답글 권한, 다중 플랫폼 성과 수집, 첫 댓글, 학습 판단,
편집 이력, 통합 발행 상태와 검토 요청은 현재 코드에 있다. 기본 흐름에서 지금도 없는 항목은
게시물별 성과 관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교 하나다.

| 계약 | 현재 판정 | 직접 증거 |
|---|---|---|
| 게시물별 성과 이력 | 없음 | `published_posts`는 최신 누계와 `metrics_at`만 보존한다. 관측 시각별 이력 table과 migration이 없다. |
| 재현 가능한 30일 비교 | 없음 | 지정 작업 공간 `GET /api/metrics` HTTP 200. 최상위 키는 `coverage`, `posts`, 게시물 0건이며 `history`, `comparison`이 없다. |
| 실행본 귀속 | PASS | localhost health HTTP 200, DB up, 실행 `build_commit=2280089f`. 실행 커밋부터 현재 HEAD `7f730581`까지 제품 경로 `dashboard/src`, `dashboard/db`, `dashboard/tests`, `dashboard/scripts` diff는 0건이다. |
| 기본 흐름 실앱 | 조건부 PASS | 첫 실행은 AI 출력이 길이 상한에 걸려 JSON 파싱 실패, 후보 0장으로 NG였다. 재실행은 생성, 편집, 발행 큐, 성과 제안 재인계와 지표 조회 11/11 통과했다. 생성 출력 비결정성은 남는다. |
| Studio v1 실앱 | PASS | 인증 거절, 입력 거절, 정상 생성, 후보 3장, 조회와 무료 다시 만들기 14/14 통과했다. |
| 전체 회귀 | PASS | `npm run test` 374파일, 2,414건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. |
| 신규 구현 | BLOCK | 현재 공정은 `qa`, 승인 아님이다. 관측 단위, 중복 방지 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준의 승인 기술설계가 없다. 제품 소스 변경은 0건이다. |

기술 선택지는 세 가지다.

| 선택지 | 장점 | 비용과 위험 |
|---|---|---|
| A. `published_post_metric_snapshots` 별도 table | 관측값을 불변 행으로 남겨 기간 재계산, 중복 방지, RLS, 보존 정책을 명시할 수 있다 | migration, 수집 트랜잭션, 정리 작업과 공급자 정규화 계약이 필요하다 |
| B. 공급자 기간 보고서를 조회할 때마다 계산 | YouTube처럼 기간 조회를 지원하는 채널은 저장량이 적다 | TikTok Video Query 등 누계만 주는 채널과 의미가 달라지고 과거 결과 재현성이 공급자에 종속된다 |
| C. `provider_meta` JSONB에 관측 배열 저장 | 새 table 없이 빨리 붙일 수 있다 | 동시 갱신, 중복 제거, 보존과 인덱싱이 약하고 행이 계속 커진다 |

추천은 A다. 승인해야 할 최소 계약은 하루 1회 UTC 관측, `(tenant_id, published_post_id,
observed_date)` 고유 키, 원본 누계와 정규화된 네 지표 보존, 400일 보존, 최근 30일과 직전 30일의
동일 길이 비교, 구간당 발행물 5건 미만이면 표본 부족 판정이다. 이 값들은 제안이며 승인 정본이
아니므로 migration과 API에 반영하지 않았다.

외부 계약 대조: YouTube Analytics는 `startDate`, `endDate`, `metrics`, `dimensions`로 기간을
직접 정의한다. TikTok Video Query는 영상별 누계 `view_count`, `like_count`, `comment_count`,
`share_count`를 반환한다. 하나의 비교 계약으로 묶으려면 공급자별 원본 의미와 로컬 관측값을
분리해 보존해야 한다.

레드팀: 최신 누계 두 번의 차이는 빨리 만들 수 있지만 수집 누락, 게시 시점, 누계 감소를 구분하지
못한다. 기간을 다시 계산할 수 없으므로 완료로 볼 수 없다. 별도 table도 관측 누락을 0으로
간주하면 거짓 감소를 만든다. 그래서 구간 coverage와 표본 부족을 응답에 함께 둬야 한다.

셀프심문: 차단 판단이 틀렸다면 승인된 migration과 history, comparison 응답 계약이 있어야 한다.
pipeline, architecture, schema, migration, Route Handler와 실제 응답에서 찾지 못했다.

⛔ 회수 필요: 컨트롤러와 tech-architect가 위 다섯 계약값과 공급자 정규화를 합의하고 eng-design을
승인한 뒤 build를 다시 열어야 한다. 그 뒤 migration, 수집 시 snapshot 저장, history와 comparison
응답, 정상과 거절과 경합 테스트를 구현한다.

STAMP | line: osmu-gapfill091711-codex | 생성: 2026-09-17 11:14 KST | model: gpt-codex/gpt-5 | agent: code-builder | skill: 없음 | 근거: 두 갭 감사, pipeline, schema와 Route Handler, localhost 실제 요청, 전체 회귀, 공식 공급자 문서 | 고민: 승인 없는 저장 계약을 지어내 재현 불가능한 30일 비교를 만들지 않았다.

SKILLS_USED: 없음. 기존 Next.js와 PostgreSQL 성과 저장 build에 직접 대응하는 설치 스킬이 없다. SKILLS_SKIPPED: `qa`는 제품 결함 자동 수정 루프이므로 신규 DB와 API 기술계약 선택에는 적용하지 않았다.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 관측 이력, 재현 가능한 30일 비교, YouTube 기간 보고와 TikTok 누계 성과 계약을 검색했다.
HITS_USED: BRAIN business index와 ZERO-ONE Marketing Studio, repo 사업 좌표, 두 갭 감사, v63 프로토타입, YouTube Analytics와 TikTok 공식 문서를 잔여 갭과 선택지 판정에 채택했다.
HITS_REJECTED: 일반 마케팅 심리, 다른 벤처 자료, TikTok Research API는 고객 계정 성과 저장 계약의 근거가 아니어서 제외했다.
CONFLICTS: 회장 정본과 공급자 공식 계약의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀은 충돌하지만 이번 비화면 판단에는 영향을 주지 않는다.

SOURCES: 두 갭 감사 | v63 프로토타입 | 회장 요구 대장 | OSMU 사업 좌표 | `wiki/5-hubs/hub-eng/architecture/data-model.md` | `dashboard/db/schema.sql` | `dashboard/src/app/api/metrics/route.ts` | https://developers.google.com/youtube/analytics/reference/reports/query | https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query

MODEL: gpt-codex/gpt-5 / code-builder

## 2026-09-16 23시 10분 갭 재확인: 성과 시계열 계약 미승인, 실앱 회귀 NG

두 기반 감사, 현재 데이터 모델, migration, 성과 Route Handler, 최신 localhost 응답을 대조했다.
생성, 편집, 발행, 성과 수집과 제안 재인계는 이미 구현돼 있다. 기본 흐름에서 지금도 없는 것은
게시물별 성과 관측 이력과 재현 가능한 최근 30일 대 직전 30일 비교다.

| 계약 | 현재 판정 | 직접 증거 |
|---|---|---|
| 게시물별 성과 이력 | 없음 | `published_posts`는 최신 누계와 `metrics_at`만 보존한다. `wiki/5-hubs/hub-eng/architecture/data-model.md`도 시계열 snapshot과 재현 가능한 30일 비교를 별도 미정 계약으로 명시한다. |
| 재현 가능한 30일 비교 | 없음 | 최신 HEAD와 일치하는 localhost의 지정 작업 공간 `GET /api/metrics`는 HTTP 200, 최상위 키 `posts`, `coverage`, 게시물 0건이다. `history`, `comparison`은 없다. |
| 신규 구현 | 차단 | `pipeline-state.osmu.md`의 현재 단계는 `qa`, 승인 아님이다. 관측 단위, 멱등 키, 보존 기간, 공급자 정규화, 비교식과 표본 부족 기준도 승인되지 않았다. |
| 전체 회귀 | PASS | HEAD `df5c4daa`에서 `npm run test` 371파일, 2,388건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. |
| 실제 앱 귀속 | PASS | `/api/health` HTTP 200, DB up, 실행 `build_commit`과 현재 HEAD가 `df5c4daa`로 일치한다. |
| 기본 흐름 실앱 | NG | `verify-basic-flow-e2e.mjs`가 첫 생성의 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 후보 0장으로 종료 코드 1. 서버 로그의 직접 원인은 Claude CLI 자식 `exit_nonzero`다. 같은 launch context와 모델의 최소 CLI 대조 요청은 exit 0이라 실행 파일과 전역 인증 장애는 제외했고, 실패는 전체 생성 입력 경로로 좁혔다. 자식 stderr를 보안상 버려 그 아래 원인은 미검증이다. |
| Studio v1 실앱 | NG | 401, 400, 422 거절은 통과했다. 정상 생성은 기대 201 대신 HTTP 200과 같은 공급자 오류를 받아 종료 코드 1. |
| 제품 소스 | 변경 없음 | 신규 migration, API와 기능 테스트를 만들지 않았다. 현재 QA 단계와 미승인 기술설계를 우회하지 않았다. |
| 증거 커밋 | PASS | 이번 절, QA 트래커 절, 전용 세션 상태만 부분 staging해 원자 커밋했다. 착수 전부터 있던 다른 세션 변경은 포함하지 않았다. |

이번 실행에서 새로 되는 것으로 전환된 항목은 없다. YouTube Analytics는 시작일, 종료일,
지표와 선택적 차원으로 기간 보고서를 정의한다. TikTok Video Query는 영상별 누계 조회수,
좋아요, 댓글, 공유 수를 반환한다. 두 공급자를 같은 기간 비교로 묶으려면 로컬 관측 이력 또는
공급자별 기간 보고서 저장과 집계 계약을 먼저 확정해야 한다.

레드팀: 최신 누계 두 번의 차이만 저장하면 화면은 빨리 채울 수 있다. 수집 누락, 게시 시점 차이,
누계 감소를 구분하지 못해 같은 기간을 다시 계산할 수 없으므로 기본 흐름 완성으로 볼 수 없다.

셀프심문: 이 차단이 틀렸다면 승인된 게시물별 관측 이력 migration과 API 비교 계약이 있어야 한다.
pipeline, 데이터 모델, schema, migration, Route Handler와 실제 응답을 교차 확인했지만 발견하지 못했다.

회수 필요: 컨트롤러와 tech-architect가 관측 저장 단위, 멱등 키, 보존 기간, 공급자별 누계와 기간
지표 정규화, 최근 30일과 직전 30일 비교식, 표본 부족 기준을 합의하고 eng-design을 승인한 뒤
build를 다시 열어야 한다. 생성 공급자 실앱 회귀도 원인을 해결한 뒤 두 필수 E2E를 다시 통과해야 한다.

STAMP | line: osmu-gapfill091623 | 생성: 2026-09-16 23:10 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 근거: 두 갭 감사, current pipeline, data-model, schema와 Route Handler, 최신 localhost metrics와 health, 전체 회귀, 두 실앱 E2E | 고민: 미승인 저장 계약과 실패한 실앱 검증을 우회해 거짓 30일 비교를 만들지 않았다.

SKILLS_USED: 없음. 설치된 코드 구현 스킬 중 기존 Next.js와 PostgreSQL 성과 저장 build에 직접 대응하는 스킬이 없다. SKILLS_SKIPPED: `qa`는 QA 단계의 체계적 수정 스킬이다. 이번 code-builder 과제는 신규 기술계약과 build 게이트에서 차단돼 적용하지 않았다.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 시계열, 재현 가능한 30일 비교, YouTube 기간 보고 계약과 TikTok 누계 성과 필드를 검색했다.
HITS_USED: BRAIN business index와 ZERO-ONE Studio 계획, repo 사업 좌표, 두 갭 감사, v63 성과실, repo data-model, YouTube Analytics와 TikTok 공식 계약을 잔여 갭과 재현성 판정에 채택했다.
HITS_REJECTED: 일반 마케팅 심리, 다른 벤처 자료와 TikTok Research API는 이번 고객용 저장 단위와 승인 계약의 근거가 아니어서 제외했다.
CONFLICTS: 회장 정본과 외부 공식 계약의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀은 충돌하며 이번 비화면 판정에서 어느 쪽도 임의 선택하지 않았다.

SOURCES: 두 갭 감사 | v63 프로토타입 | 회장 요구 대장과 정본 요청 원장 | OSMU 사업 좌표 | `wiki/5-hubs/hub-eng/architecture/data-model.md` | `dashboard/db/schema.sql` | `dashboard/src/app/api/metrics/route.ts` | https://developers.google.com/youtube/analytics/reference/reports/query | https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 2026-09-15 23시 12분 갭 재확인: 성과 시계열 build 차단 유지

두 기반 감사와 03시 55분 이후 커밋, 현재 schema, migration, 성과 Route Handler를 다시
대조했다. 생성, 편집, 발행 큐, 성과 제안 재인계와 일곱 표시 플랫폼 성과 수집은 이미 구현돼
있다. 이후 변경은 네 방 화면과 QA 보강이며 게시물별 성과 이력은 추가되지 않았다. 지금도 없는
기본 흐름 항목은 게시물별 성과 snapshot과 재현 가능한 30일 비교 하나다.

| 계약 | 현재 판정 | 직접 증거 |
|---|---|---|
| 게시물별 성과 이력 | 없음 | 현재 `published_posts`는 최신 누계와 `metrics_at`만 갱신하고, 게시물과 관측 시각별 이력 table 또는 migration은 없다. `growth_metrics`는 채널 팔로워 이력이다. |
| 재현 가능한 30일 비교 | 없음 | 지정 작업 공간 localhost `GET /api/metrics` HTTP 200. 응답 최상위 키는 `coverage`, `posts`뿐이고 `history`, `comparison`은 없다. 게시물은 0건이다. |
| 생성, 편집, 발행, 성과 재인계 | 관찰됨 | localhost 기본 흐름 11/11과 Studio v1 14/14가 종료 코드 0으로 통과했다. |
| 전체 회귀 | 테스트됨 | `npm run test`에서 Vitest 362파일과 2,321건 통과, 3건 제외. `npx tsc --noEmit` 종료 0, 디자인 토큰 위반 0. |
| 신규 구현 | 차단 | `pipeline-state.osmu.md`는 `qa`, 승인 아님이다. snapshot 단위, 멱등 키, 보존 기간, 공급자 정규화와 최근 30일 비교식의 승인된 DB 및 API 계약이 없다. |

이번 실행에서 새로 되는 것으로 전환된 항목은 없다. 현재 누계값을 30일 값으로 표시하거나
`provider_meta`에 배열을 넣는 방식은 수집 누락, 중복 수집, 작업 공간 격리와 보존 정책을
검증하지 못한다. 새 table, 기존 JSONB, 공급자 기간 보고서 중 하나를 워커가 단독 선택하는
것도 금지된 DB 스키마와 아키텍처 결정이다. 제품 소스, migration과 기능 테스트는 수정하지
않았다.

외부 계약 대조: YouTube Analytics는 `startDate`, `endDate`, `metrics`와 선택적 `dimensions`로
기간 보고서를 정의한다. TikTok Video Query는 영상별 누계 `view_count`, `like_count`,
`comment_count`, `share_count`를 반환한다. 여러 공급자를 같은 30일 비교로 묶으려면 로컬
snapshot 또는 공급자별 기간 보고서의 저장·집계 계약이 먼저 필요하다.

레드팀: 최신 누계 두 번의 차이로 빠르게 증감률을 만들 수 있지만 수집 누락, 게시 시점 차이와
누계 감소를 구분하지 못한다. 화면은 완성처럼 보여도 같은 기간을 다시 계산할 수 없는 거짓
계약이 된다.

셀프심문: 이 차단이 틀렸다면 03시 55분 이후 게시물별 관측 이력을 보존하는 migration, 응답
계약 또는 승인된 기술설계가 추가됐어야 한다. 관련 커밋, schema, migrations, metrics Route
Handler, 실제 응답과 pipeline을 교차 확인했지만 추가되지 않았다.

회수 필요: 컨트롤러와 tech-architect가 snapshot 저장 단위, 멱등 키, 보존 기간, 공급자별
누계·기간 지표 정규화, 최근 30일과 직전 30일 비교식 및 표본 부족 기준을 합의하고 eng-design
산출물을 승인한 뒤 build 공정을 다시 열어야 한다.

STAMP | line: osmu-gapfill091523 | 생성: 2026-09-15 23:12 KST | model: gpt-codex/gpt-5 | agent: code-builder | skill: 없음 | 고민: 반복 발주와 최신 UI 변경에도 승인 없는 성과 저장 계약을 지어내지 않고 실물 증거로 차단을 재검증했다.

SKILLS_USED: 없음. 설치된 스킬 중 이 Next.js와 PostgreSQL 성과 저장 build에 직접 대응하는 스킬 없음. SKILLS_SKIPPED: qa는 QA 단계 소유이므로 사용자 지정 localhost 검증과 필수 회귀만 수행.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 시계열, 재현 가능한 30일 비교, YouTube 기간 보고 계약과 TikTok 누계 성과 필드를 검색했다.
HITS_USED: BRAIN의 ZERO-ONE Marketing Studio 맥락, repo 사업 좌표, 두 갭 감사, v63 성과실, YouTube Analytics와 TikTok 공식 계약을 잔여 갭과 재현성 판정에 채택했다.
HITS_REJECTED: 일반 마케팅 심리, 다른 벤처 자료와 공급자 Research API는 이번 고객용 저장 단위와 승인 계약의 근거가 아니어서 제외했다.
CONFLICTS: 회장 정본과 외부 공식 계약의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀은 충돌하며 이번 비화면 판정에서 어느 쪽도 임의 선택하지 않았다.

SOURCES: 두 갭 감사 | v63 프로토타입 | 회장 요구 대장과 정본 요청 원장 | OSMU 사업 좌표 | `dashboard/db/schema.sql` | `dashboard/src/app/api/metrics/route.ts` | https://developers.google.com/youtube/analytics/reference/reports/query | https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query

MODEL: gpt-codex/gpt-5 / code-builder

## 2026-09-15 03시 55분 갭 재확인: 남은 성과 시계열은 기술설계 회수

두 감사의 후속 구현, 2026-09-14 19시 18분 이후 커밋, 현재 schema와 Route Handler를 다시
대조했다. 생성, 편집, 발행 큐, 성과 제안 재인계와 일곱 표시 플랫폼 성과 수집은 이미 구현돼
있다. 이후 성과 경로 변경은 Claude CLI 실행환경 회귀뿐이어서 다시 만들지 않았다. 지금도 없는
기본 흐름 항목은 게시물별 성과 snapshot과 재현 가능한 30일 비교 하나다.

| 계약 | 현재 판정 | 직접 증거 |
|---|---|---|
| 게시물별 성과 이력 | 없음 | `published_posts`는 최신 누계와 `metrics_at`만 보존하고, `growth_metrics`는 채널 팔로워 이력이다. 게시물별 관측 이력 table과 migration은 없다. |
| 재현 가능한 30일 비교 | 없음 | 지정 작업 공간 localhost `GET /api/metrics` HTTP 200. 응답 최상위 키는 `coverage`, `posts`뿐이고 `history`, `comparison`은 없다. 게시물은 0건이다. |
| 생성, 편집, 발행, 성과 재인계 | 관찰됨 | 종료형 실제 요청에서 기본 흐름 11/11, Studio v1 14/14가 통과했다. |
| 전체 회귀 | 테스트됨 | Vitest 353파일과 2,293건 통과, 3건 제외. TypeScript 종료 0, production build 184/184, 디자인 토큰 위반 0. |
| 신규 구현 | 차단 | `pipeline-state.osmu.md`는 `qa`, 승인 아님이다. snapshot 단위, 멱등 키, 보존 기간과 30일 비교식의 승인된 DB 및 API 계약이 없다. |

이번 실행에서 새로 되는 것으로 전환된 항목은 없다. 현재 누계값을 30일 값으로 이름만 바꾸거나
`provider_meta`에 배열로 적재하면 기간 재현성, 중복 수집, 작업 공간 격리와 보존 정책을 검증할
수 없다. 새 table 또는 기존 JSONB, 공급자 기간 보고서 중 하나를 워커가 단독 선택하는 것도
금지된 DB 스키마와 아키텍처 결정이다. 제품 소스, migration과 기능 테스트는 수정하지 않았다.

외부 계약 대조: YouTube Analytics는 요청에 `startDate`, `endDate`, `metrics`와 선택적
`dimensions`를 명시해 기간 보고서를 만든다. TikTok Video Query는 영상별 `view_count`,
`like_count`, `comment_count`, `share_count` 누계값을 돌려준다. 따라서 여러 공급자를 한 30일
비교로 묶으려면 로컬 snapshot 또는 공급자별 기간 보고서의 저장·집계 계약이 먼저 필요하다.

레드팀: 최신 누계 두 개를 빼면 빠르게 증감률은 만들 수 있지만 수집 누락, 게시 시점 차이와
누계 감소를 구분하지 못해 같은 기간 결과를 재현할 수 없다. 화면은 완성처럼 보여도 제품
계약은 거짓이 된다.

셀프심문: 이 차단이 틀렸다면 2026-09-14 19시 18분 이후 게시물별 관측 이력을 보존하는
migration, API 응답 또는 승인된 기술설계가 추가됐어야 한다. 관련 커밋, schema, migrations,
metrics Route Handler, 실제 응답과 pipeline을 교차 확인했지만 추가되지 않았다.

회수 필요: 컨트롤러와 tech-architect가 snapshot 저장 단위, 멱등 키, 보존 기간, 공급자별
누계·기간 지표 정규화, 최근 30일과 직전 30일 비교식 및 표본 부족 기준을 합의하고 eng-design
산출물을 승인한 뒤 build 공정을 다시 열어야 한다.

STAMP | line: osmu-gapfill091503 | 생성: 2026-09-15 03:55 KST | model: gpt-codex/gpt-5 | agent: code-builder | skill: 없음 | 고민: 반복 발주라도 QA 공정과 미승인 DB 계약을 우회하지 않고 현재 실물 증거로 차단을 재검증했다.

SKILLS_USED: 없음. 설치된 스킬 중 이 Next.js와 PostgreSQL 성과 저장 build에 직접 대응하는 스킬 없음. SKILLS_SKIPPED: qa는 QA 단계 소유이므로 사용자 지정 localhost 검증만 수행.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 시계열, 재현 가능한 30일 비교, YouTube 기간 보고 계약과 TikTok 누계 성과 필드를 검색했다.
HITS_USED: BRAIN의 ZERO-ONE Marketing Studio 맥락, repo 사업 좌표, 두 갭 감사, v63 성과실, YouTube Analytics와 TikTok 공식 계약을 잔여 갭과 재현성 판정에 채택했다.
HITS_REJECTED: 일반 마케팅 심리, 다른 벤처 자료와 공급자 Research API는 이번 고객용 저장 단위와 승인 계약의 근거가 아니어서 제외했다.
CONFLICTS: 회장 정본과 외부 공식 계약의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀 충돌은 기존 상태이며 이번 비화면 판정에서 선택하지 않았다.

SOURCES: 두 갭 감사 | v63 프로토타입 | 회장 요구 대장과 정본 요청 원장 | OSMU 사업 좌표 | `dashboard/db/schema.sql` | `dashboard/src/app/api/metrics/route.ts` | https://developers.google.com/youtube/analytics/reference/reports/query | https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query | https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object?enter_method=left_navigation

MODEL: gpt-codex/gpt-5 / code-builder

## 2026-09-14 19시 18분 갭 재확인: 성과 시계열 계약 미승인으로 build 차단

두 감사와 현재 코드, live DB, localhost 응답을 다시 대조했다. 생성, 편집, 발행 큐, 성과 제안
재인계와 표시 플랫폼 수집은 이미 구현돼 있어 다시 만들지 않았다. 지금도 없는 항목은 게시물별
성과 snapshot과 같은 기간을 다시 계산할 수 있는 30일 비교 하나다.

| 계약 | 현재 판정 | 직접 증거 |
|---|---|---|
| 게시물별 성과 이력 | 없음 | live DB에서 이력 계열 테이블은 채널 팔로워용 `growth_metrics`뿐이다. `published_posts`는 최신 `views`, `likes`, `replies`, `reposts`, `metrics_at`만 보존한다. |
| 재현 가능한 30일 비교 | 없음 | 지정 작업 공간 localhost `GET /api/metrics` HTTP 200. 최상위 키는 `coverage`, `posts`이고 `history`, `comparison`은 없다. |
| 기본 흐름 | 관찰됨 | localhost 기본 흐름 11/11, Studio v1 14/14. |
| 전체 회귀 | 테스트됨 | Vitest 351파일과 2,291건 통과, 조건부 3건 제외. TypeScript 종료 0, production build 184/184, 디자인 토큰 위반 0. |
| 신규 구현 | 차단 | `pipeline-state.osmu.md`는 QA 진행 중이다. snapshot 단위, 멱등 키, 보존 기간과 비교식의 승인된 DB 및 API 계약이 없다. |

제품 소스, migration과 테스트는 수정하지 않았다. 이 항목은 기본 흐름의 성과 단계에 가장
가깝지만 새 저장 구조와 응답 계약을 요구한다. 현재 누계값을 30일 값으로 이름만 바꾸거나
`provider_meta`에 배열로 적재하면 기간 재현성, 중복 수집, 작업 공간 격리와 보존 정책을
검증할 수 없다. 기술설계를 승인하고 build 공정을 다시 연 뒤 구현해야 한다.

벤치마크 적용: YouTube Analytics 공식 보고 API는 `startDate`, `endDate`, `metrics`와 선택
`dimensions`로 조회 기간과 집계축을 명시한다. TikTok 공식 Video Object의 조회수, 좋아요,
댓글과 공유 수는 누계값이다. 두 계약을 함께 보면 OSMU의 재현 가능한 30일 비교에는 로컬
snapshot 또는 공급자 기간 보고서의 명시적 계약이 필요하다는 추론이 성립한다.

레드팀: 최신 누계 두 개만 비교해도 화면은 완성처럼 보이지만 수집 누락과 게시 시점 차이 때문에
같은 30일 결과를 다시 만들 수 없다. 반대로 이번 턴에 테이블부터 만들면 QA 공정과 미승인
계약을 우회하므로 제품 코드를 변경하지 않았다.

셀프심문: 이 판정이 틀렸다면 현재 DB나 API에 게시물과 관측 시각별 성과 이력이 있어야 한다.
live `information_schema`, schema와 migration, metrics Route Handler, 실제 응답을 교차 확인했지만
그 계약은 없었다.

STAMP | line: osmu-gapfill091419 | 생성: 2026-09-14 19:18 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 고민: 반복 발주라도 QA 공정과 미승인 DB 계약을 우회하지 않고 실물 증거를 갱신했다.

SKILLS_USED: 없음. 설치된 스킬 중 이 Next.js와 PostgreSQL 성과 저장 build에 직접 대응하는 스킬 없음. SKILLS_SKIPPED: qa는 QA 단계 소유이므로 사용자 지정 localhost 검증만 수행.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 시계열, 재현 가능한 30일 비교, YouTube 기간 보고 계약과 TikTok 누계 성과 필드를 검색했다.
HITS_USED: BRAIN의 ZERO-ONE Marketing Studio 맥락, repo 사업 좌표, 두 갭 감사, YouTube Analytics와 TikTok 공식 계약을 잔여 갭과 재현성 판정에 채택했다.
HITS_REJECTED: 일반 마케팅 심리와 다른 벤처 문서는 게시물별 관측 단위와 API 계약의 근거가 아니어서 제외했다.
CONFLICTS: 회장 정본과 외부 공식 계약의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀 충돌은 기존 상태이며 이번 비화면 판정에서 선택하지 않았다.

SOURCES: 두 갭 감사 | v63 프로토타입 | 회장 요구 대장과 정본 요청 원장 | OSMU 사업 좌표 | `dashboard/db/schema.sql` | `dashboard/src/app/api/metrics/route.ts` | https://developers.google.com/youtube/analytics/reference/reports/query | https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object?enter_method=left_navigation

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 2026-09-14 15시 14분 갭 재확인: 승인 없는 성과 시계열은 구현하지 않음

두 감사, 현재 Route Handler와 DB schema를 다시 대조했다. 2026-09-14 11시 20분 이후 성과
이력 migration과 API 계약 추가 커밋은 없었다. 생성, 편집, 발행 큐, 성과 제안 재인계와 일곱
표시 플랫폼 수집기는 그대로 구현돼 있으며, 지금도 없는 항목은 게시물별 성과 snapshot과
재현 가능한 30일 비교 하나다.

| 계약 | 현재 판정 | 증거 |
|---|---|---|
| 게시물별 성과 이력 | 없음 | `published_posts`는 최신 누계와 `metrics_at`만 보존하고 게시물별 이력 테이블과 migration이 없음 |
| 재현 가능한 30일 비교 | 없음 | 지정 작업 공간 localhost `GET /api/metrics` HTTP 200. 최상위 키는 `coverage`, `posts`이고 `history`, `comparison`은 없음 |
| 기본 흐름 | 관찰됨 | localhost 기본 흐름 11/11, Studio v1 14/14 |
| 전체 회귀 | 테스트됨 | Vitest 348파일, 2,277건 통과와 3건 제외. TypeScript 오류 0, production build 184/184, 디자인 토큰 위반 0 |
| 신규 구현 | 차단 | `pipeline-state.osmu.md`의 현재 공정은 QA 진행 중이고 snapshot 저장 단위, 멱등 키, 보존 기간, 비교식의 승인된 DB와 API 계약이 없음 |

제품 소스, migration과 테스트는 수정하지 않았다. 최근 누계값을 30일 값으로 표시하거나
`provider_meta`에 배열을 임의 추가하면 같은 기간의 결과를 다시 만들 수 없고 작업 공간 격리,
중복 수집과 보존 정책도 검증할 수 없다. 기술설계에서 계약을 합의하고 build 공정을 다시 연 뒤
구현해야 한다.

벤치마크 적용: YouTube Analytics 공식 보고 API는 `startDate`, `endDate`, `metrics`, 선택
`dimensions`로 조회 범위와 집계축을 명시한다. OSMU도 30일 비교에 기준 시각, 기간, 표본과
집계식을 응답으로 보존해야 한다. 출처는 https://developers.google.com/youtube/analytics/reference/reports/query 다.

레드팀: 화면에 `최근 30일` 문구와 현재 누계를 붙인 채로 두면 사용자는 실제 30일 시계열로
오해한다. 다만 승인 없이 저장 구조를 만들면 더 큰 계약 이탈이므로 이번 턴은 거짓 완료를 막고
차단 상태를 유지했다.

셀프심문: 이 판정이 틀렸다면 11시 20분 이후 게시물별 성과 이력을 보존하는 migration 또는
API 응답이 추가됐어야 한다. 최근 커밋, schema, migrations와 `metrics`, `analytics`,
`home-metrics` 경로를 교차 검색했지만 해당 저장소와 응답 계약은 없었다.

STAMP | line: osmu-gapfill091415 | 생성: 2026-09-14 15:14 KST | model: gpt-codex/gpt-5 | agent: code-builder | skill: 없음 | 고민: 반복 발주라도 승인되지 않은 DB 계약을 지어내지 않고 잔여 갭과 정상 기본 흐름을 분리했다.

SKILLS_USED: 없음. 설치된 스킬 중 이 Next.js 성과 저장 build에 직접 대응하는 스킬 없음. SKILLS_SKIPPED: qa는 QA 단계 소유라 사용자 지정 localhost 검증만 수행.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 게시물별 성과 시계열, 재현 가능한 30일 비교와 YouTube Analytics 기간 계약을 검색했다.
HITS_USED: BRAIN의 ZERO-ONE Marketing Studio 아이디어, repo 사업 좌표, 두 갭 감사, YouTube Analytics 공식 보고 계약을 잔여 갭과 기간 재현성의 근거로 채택했다.
HITS_REJECTED: 일반 마케팅 심리와 다른 벤처 문서는 게시물 성과 저장 단위와 중복 계약의 근거가 아니어서 제외했다.
CONFLICTS: 회장 정본과 공식 기간 조회 계약의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀 충돌은 기존 상태이며 이번 비화면 차단 판정에서 고르지 않았다.

SOURCES: 두 갭 감사 | v63 프로토타입 | 회장 요구 대장과 정본 요청 원장 | OSMU 사업 좌표 | `dashboard/db/schema.sql` | `dashboard/src/app/api/metrics/route.ts` | YouTube Analytics 공식 문서

MODEL: gpt-codex/gpt-5 / code-builder

## 2026-09-14 11시 20분 갭 재확인: 성과 시계열은 승인 전이라 그대로 남음

두 감사와 현재 Route Handler, DB schema, localhost 응답을 다시 대조했다. 생성, 편집, 발행,
성과 제안 재인계와 일곱 표시 플랫폼의 provider 수집 경로는 이미 구현돼 있어 다시 만들지 않았다.
지금도 없는 항목은 게시물별 성과 snapshot과 재현 가능한 30일 비교 하나다.

| 계약 | 현재 판정 | 증거 |
|---|---|---|
| 게시물별 성과 이력 | 없음 | `published_posts`는 최신 누계와 `metrics_at`만 보존하며 게시물별 이력 테이블이 없음 |
| 재현 가능한 30일 비교 | 없음 | localhost `GET /api/metrics` HTTP 200 응답에 `history`, `comparison`이 없고 화면의 30일 문구는 현재 누계값을 비교함 |
| 기존 기본 흐름 | 관찰됨 | localhost 기본 흐름 11/11, Studio v1 14/14 |
| 전체 회귀 | 테스트됨 | Vitest 347파일, 2,275건 통과와 3건 제외, TypeScript 오류 0, production build 184/184 |
| 신규 구현 | 차단 | `pipeline-state.osmu.md`가 QA 진행 중이며 이력 보존 단위, 중복 기준, 보존 기간, 비교 의미의 승인된 DB·API 계약이 없음 |

제품 소스와 migration은 수정하지 않았다. 최신 누계값을 30일 이력으로 이름만 바꾸거나
`provider_meta` JSON에 임의로 누적하면 재현성, 중복 방지, RLS와 보존 정책이 불명확해진다.
정규화된 게시물 성과 snapshot 계약을 기술설계에서 합의하고 build 공정을 다시 연 뒤 구현해야 한다.

벤치마크 적용: YouTube Analytics 공식 보고 API는 조회 기간의 `startDate`, `endDate`, metric과
dimension을 요청에 명시한다. 그래서 OSMU의 30일 비교도 기간과 표본이 재현되는 계약이어야 하며,
현재 누계값만으로 대신할 수 없다. 출처는 https://developers.google.com/youtube/analytics/reference/reports/query 다.

레드팀: 표 하나와 현재 누계 비교를 추가하면 화면은 완성처럼 보이지만 31일째 같은 숫자를 다시
만들 수 없다. 데이터 계약 없는 UI 추가를 완료로 세지 않았다.

셀프심문: 이 차단이 틀렸다면 이미 재사용 가능한 게시물별 이력 저장소가 있어야 한다. schema와
성과 수집, analytics, metrics 경로를 교차 검색했지만 `growth_metrics`는 팔로워 시계열이고
게시물별 views, likes, replies, reposts 이력을 보존하지 않는다.

STAMP | line: osmu-gapfill091411 | 생성: 2026-09-14 11:20 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 고민: 현재 누계를 30일 이력으로 오인시키지 않고 승인 필요한 저장 계약을 드러냈다.

SKILLS_USED: 없음. 설치된 스킬 중 이 Next.js 성과 저장 build에 직접 대응하는 스킬 없음. SKILLS_SKIPPED: qa는 QA 단계 소유라 사용자 지정 회귀와 localhost 관찰만 수행.

KNOWLEDGE_QUERY: OSMU 기본 흐름의 발행 후 성과 시계열, 재현 가능한 30일 비교, YouTube Analytics 기간 계약을 검색했다.
HITS_USED: BRAIN의 ZERO-ONE Marketing Studio 아이디어, repo 사업 좌표, 두 갭 감사, YouTube Analytics 공식 보고 계약을 잔여 갭과 기간 재현성의 근거로 채택했다.
HITS_REJECTED: Buffer Insights는 다음 행동 UX에는 맞지만 저장 단위와 중복 계약의 공식 근거가 아니어서 구현 계약으로 쓰지 않았다.
CONFLICTS: 회장 정본과 공식 기간 조회 계약의 충돌은 없다. 사용자 지정 v63과 pipeline 승인 v68 디자인 핀 충돌은 기존 상태이며 이번 비화면 차단 판정에서 고르지 않았다.

SOURCES: 두 갭 감사 | 승인 v63 프로토타입 | 회장 요구 대장 | OSMU 사업 좌표 | `dashboard/db/schema.sql` | `dashboard/src/app/api/metrics/route.ts` | YouTube Analytics 공식 문서

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 2026-09-13 03시 43분 갭 갱신: TikTok 발행 성과 수집 연결

두 감사 문서의 잔여 항목을 현재 소스와 다시 대조했다. 생성, 편집, 발행 큐, 성과 제안 인계와
Threads, X, Instagram 피드, Facebook, Reels, YouTube와 Shorts 성과 수집은 이미 구현돼 있어
재구현하지 않았다. 기본 흐름의 발행 다음 단계에 가장 가까운 미구현 항목은 TikTok provider
성과 수집기였고, 게시물별 snapshot과 재현 가능한 30일 비교는 새 DB 계약이 필요해 이번 범위에서
제외했다.

| 계약 | 현재 판정 | 증거 |
|---|---|---|
| TikTok provider 조회 | 테스트됨 | 공식 `/v2/video/query/`에 `video.list` 토큰과 영상 ID를 보내고 요청당 20개씩 분할 |
| 성과 축 변환 | 테스트됨 | `view_count`, `like_count`, `comment_count`, `share_count`를 views, likes, replies, reposts로 변환 |
| 발행물 갱신 | 테스트됨 | TikTok 발행 행 조회, 네 성과 수치와 `metrics_at` 갱신, 성공 시 막힘 표식 제거 |
| 실패 상태 보존 | 테스트됨 | 401과 403은 성과 권한 없음, 응답에 없는 영상은 영상 확인 불가로 게시물별 기록 |
| OAuth 조회 범위 | 테스트됨 | 신규 TikTok 연결 동의에 `video.list` 추가, 기존 `video.publish`와 사용자 조회 범위 보존 |
| 지원 범위 정합 | 관찰됨 | localhost GET 200, `collectionSupported:true`, `collector:tiktok_video_query`, 네 지표 확인 |
| 자격증명 거절 | 관찰됨 | 지정 작업 공간 localhost POST 400, TikTok을 포함한 연결 안내, 외부 provider 호출 없음 |
| 기본 흐름 회귀 | 테스트됨 | 기본 흐름 11/11, Studio v1 재실행 14/14, Vitest 307파일 2,054건 통과와 3건 스킵 |
| 빌드와 토큰 | 테스트됨 | TypeScript 오류 0, production 정적 페이지 182/182, 디자인 lint 위반 0 |
| 실제 TikTok 수치 회수 | 미검증 | 지정 작업 공간에 TikTok 자격증명과 발행물이 없어 외부 provider 성공 응답을 관찰하지 못함 |

이제 TikTok 발행물은 성과 화면에서 측정 미지원으로 표시되지 않는다. 연결 뒤 발행 영상이 있으면
성과 수집 요청이 실제 provider까지 이어지고, 과거 연결 토큰에 `video.list`가 없으면 권한 문제와
재연결 필요성을 표시한다. 남은 구조 갭은 게시물별 성과 snapshot과 재현 가능한 30일 비교다.

벤치마크 적용: TikTok 공식 Display API의 `video.list`, 요청당 영상 ID 20개, 다섯 공개 필드
계약을 그대로 사용했다. 별도 테이블이나 두 번째 자격증명 저장소를 만들지 않고 기존 발행 식별자와
성과 필드에 연결했다. 출처는 https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query 와
https://developers.tiktok.com/docs/en/tiktok-api-v2-video-object?enter_method=left_navigation 다.

레드팀: 지원 목록만 true로 바꾸면 실제 provider 호출과 DB 갱신이 없는 거짓 완료가 된다. provider
단위 테스트와 Route Handler 통합 테스트를 분리해 20개 분할, 실제 호출 payload, 게시물 조회와
네 수치 UPDATE를 각각 고정했다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 기존 TikTok 토큰에 새 `video.list` 범위가 없어
실계정 조회가 403으로 막히는 경우다. 그래서 외부 성공은 미검증으로 남기고 401과 403을 게시물별
권한 문제로 보존하며 재연결 안내가 나오게 했다.

STAMP | line: osmu-gapfill091303 | 생성: 2026-09-13 03:43 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 고민: 이미 있는 발행 식별자와 성과 필드를 재사용해 TikTok 수집만 닫고 DB 계약 변경은 피했다.

SKILLS_USED: 없음. 설치된 스킬 중 이 Next.js 성과 수집 build에 직접 대응하는 스킬 없음. SKILLS_SKIPPED: qa는 QA 단계 소유이므로 build 계약과 사용자 지정 E2E만 실행.

KNOWLEDGE_QUERY: OSMU 기본 흐름, 발행 후 성과 회수, TikTok video query와 공개 지표 계약을 검색했다.
HITS_USED: BRAIN의 ZERO-ONE Marketing Studio 아이디어, repo 사업 좌표, 두 갭 감사, TikTok 공식 API 문서를 기본 흐름과 provider 계약 근거로 채택했다.
HITS_REJECTED: 일반 마케팅 심리와 다른 벤처 자료는 이번 기술 연결의 계약 근거가 아니어서 제외했다.
CONFLICTS: 회장 정본과 TikTok 공식 조회 계약의 충돌은 없다. 사용자 지정 v63과 pipeline 최신 v68 디자인 핀 충돌은 기존 상태이며 이번 비화면 변경에서 판단하지 않았다.

SOURCES: 두 갭 감사 | 승인 v63 프로토타입 | 회장 요구 대장 | OSMU 사업 좌표 | `dashboard/src/lib/tiktok.ts` | `dashboard/src/app/api/metrics/route.ts` | TikTok 공식 API 문서

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 2026-09-12 23시 23분 갭 갱신: Instagram Reels 성과 수집 연결

두 감사 문서의 잔여 목록을 현재 소스와 다시 대조했다. X, Instagram 피드, Facebook,
YouTube와 Shorts 수집기는 이미 구현돼 있어 재구현하지 않았다. 실제로 남은 provider 수집기는
Instagram Reels와 TikTok이었다. 기본 흐름의 발행 다음 단계에 가장 가까우며 기존 Instagram
자격증명을 재사용할 수 있는 Reels 한 항목을 이번 build 대상으로 골랐다.

| 계약 | 현재 판정 | 증거 |
|---|---|---|
| Reels 발행물 조회 | 테스트됨 | `instagram_reels`, `reels` 저장 이름을 Instagram 피드와 함께 조회 |
| provider 연결 | 테스트됨 | Instagram 자격증명을 재사용하고 Reels에는 `views,likes,comments`를 요청해 Media ID별 수치 갱신 |
| 지원 범위 정합 | 관찰됨 | localhost GET 200, `collectionSupported:true`, `collector:instagram_media_insights`, 미발행 사유 `NO_PUBLISHED_POST` |
| 자격증명 거절 | 관찰됨 | 지정 작업 공간의 localhost POST 400, 연결 채널 없음 안내, 외부 조회와 DB 변경 없음 |
| 기본 흐름 회귀 | 테스트됨 | 전체 Vitest 302파일 2,023건 통과, 3건 스킵. 기본 흐름 11/11, Studio v1 14/14, TypeScript 오류 0, production build 182/182 |
| 실제 Instagram 수치 회수 | 미검증 | 지정 작업 공간에 연결 자격증명과 Reels 발행물이 없어 provider 성공 응답은 관찰하지 못함 |

이제 Reels는 수집 미지원으로 표시되지 않는다. 남은 구조 갭은 TikTok provider 수집기와 게시물별
성과 snapshot, 재현 가능한 30일 비교다. 이번 변경은 테이블, 외부 계약, 화면 구조를 늘리지 않았다.

벤치마크 적용: Meta 공식 Instagram API가 Reels 발행 결과를 Instagram Media ID로 다루는 계약을
따라, 별도 Reels 인증 저장소를 만들지 않고 기존 Instagram Media Insights 경로에 저장 이름만
합쳤다. 출처는 https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api 다.

레드팀: 지원 범위만 true로 바꾸면 실제 수집 쿼리가 Reels를 지나치는 거짓 완료가 된다. 라우트
통합 테스트가 Reels 행 조회, provider 호출, 수치 UPDATE를 한 묶음으로 검증하도록 고정했다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 Reels Media ID에서 피드와 다른 insight 지표
권한이 필요한 경우다. 로컬 성공 계약과 실제 앱의 정직한 미발행, 미연결 상태까지만 완료로 판정하고,
실제 provider 수치 회수는 자격증명과 발행물이 생길 때까지 미검증으로 남겼다.

STAMP | line: osmu-gapfill091223 | 생성: 2026-09-12 23:23 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 고민: 이미 있는 Instagram 수집기를 보존하고 누락된 Reels 저장 이름만 기본 흐름에 연결했다.

SKILLS_USED: 없음. 설치된 스킬 중 이 Next.js 성과 수집 build에 직접 대응하는 스킬 없음. SKILLS_SKIPPED: qa는 QA 단계 소유이므로 build 계약과 지정 E2E만 검증.

SOURCES: 두 갭 감사 | 승인 v63 프로토타입 | 회장 요구 대장 | OSMU 사업 좌표 | `dashboard/src/app/api/metrics/route.ts` | Meta Instagram API 공식 문서

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 2026-09-12 19시 36분 갭 갱신: 학습 후보 수락·거절 이력 구현·실측 완료

두 감사 문서를 현재 코드와 다시 대조했다. 수락한 규칙이 다음 생성에 들어가는 경로는 이미 있었지만,
성과실의 `배우지 않기`는 후보를 버릴 뿐 판단 이력을 남기지 않았고, 수락도 표본 수·관찰 기간·적용
범위를 보존하지 않았다. 이 항목을 성과가 다음 생성으로 돌아가는 기본 흐름의 가장 가까운 잔여 갭으로
선택했다.

| 계약 | 현재 판정 | 증거 |
|---|---|---|
| 수락 판단 보존 | 테스트됨·관찰됨 | localhost POST 201, 규칙 번호와 판단 번호 연결, 표본 6건·기간·출처·작업 공간 범위 재조회 |
| 거절 판단 보존 | 테스트됨·관찰됨 | localhost POST 201, 규칙 생성 없이 `rejected` 이력 재조회 |
| 잘못된 판단 거절 | 테스트됨·관찰됨 | localhost POST 400, `INVALID_DECISION` |
| 같은 후보 경합 | 테스트됨 | 동시 수락 두 건에서 판단 1건·규칙 1건, 201과 재사용 200 |
| 화면 이력 | 관찰됨 | 성과실에서 `최근 학습 판단`, `반영`·`안 함`, 표본·기간·적용 범위 표시. 브라우저 401 0건, 콘솔 오류 0건 |
| 기존 기본 흐름 | 테스트됨·관찰됨 | 기본 흐름 11/11, Studio v1 14/14, 전체 Vitest 295파일 1,990건 통과·3건 스킵 |

기존 `배우기`와 활성 규칙의 다음 생성 반영은 유지했다. 거절은 다음 생성에 넣지 않고 감사 이력에만
남긴다. 실제 수락 검증으로 만든 규칙은 요청 후 비활성화해 다음 생성에 영향을 남기지 않았다.

따라서 이 문서의 과거 잔여 세 항목 중 학습 후보 수락·거절 이력은 이제 닫혔다. 남은 것은 게시물별
성과 snapshot과 재현 가능한 30일 비교, Threads 외 실제 provider 성과 수집기 두 항목이다.

벤치마크 적용: Buffer Insights의 성과에서 다음 행동으로 이어지는 분석 원칙을 참고했다. OSMU는
자동 적용 대신 승인 프로토타입대로 사람의 수락·거절을 같은 무게로 받고 출처 이력을 보존한다.

레드팀: 규칙을 수락한 뒤 비활성화하면 판단 이력의 규칙 번호가 비활성 규칙을 가리킨다. 이력은 당시
판단을 보존하고 생성기는 활성 규칙만 읽으므로 감사 가능성과 현재 적용 상태가 섞이지 않는다.

셀프심문: 이 결론이 틀렸다면 화면에만 이력이 보이고 동시 요청에서 파일 갱신이 유실될 가능성이 가장
크다. `mutateJson` 경합 계약과 localhost POST·GET 재조회, 브라우저 렌더를 각각 확인했다.

STAMP | line: osmu-gapfill091219 | 생성: 2026-09-12 19:36 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 고민: 이미 있던 수락→생성 경로를 재창조하지 않고 누락된 판단 이력만 완결했다.

SKILLS_USED: 없음. 설치된 스킬 중 이 Next.js build 구현에 직접 대응하는 스킬 없음. SKILLS_SKIPPED: qa는 QA 단계 소유이므로 build 계약 테스트와 한정된 브라우저 관찰만 직접 수행.

SOURCES: `docs/_archive/legacy-20260912/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md` | 승인 v63 프로토타입 | 회장 요구 대장 | OSMU 사업 좌표 | `dashboard/src/app/api/performance/learned-rules/route.ts` | `dashboard/src/components/home/PerformanceChatPanel.tsx` | https://buffer.com/resources/meet-insights/

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 2026-09-12 18시 54분 갭 검증: 발행 중지 계약 테스트됨

앞선 감사에서 남은 “일곱 플랫폼을 아우르는 서버 측 발행 중지 계약”은 현재 코드에 구현돼 있었지만 검증 미실행으로 남아 있었다. `dashboard/tests/api/queue-cancel.test.ts`를 현재 브랜치에서 실행해 4개 계약을 모두 통과시켰다.

| 계약 | 현재 판정 | 증거 |
|---|---|---|
| pending 채널만 `canceled` 전환 | 테스트됨 | 승인 작업물 정상 경로 200, 파일 상태 반영 |
| published 채널 보존 | 테스트됨 | 부분 발행 경합에서 published 상태와 `publishedAt` 보존 |
| 전 채널 종료 시 거절 | 테스트됨 | HTTP 409, `NOTHING_TO_CANCEL`, 원 상태 보존 |
| 없는 작업물 거절 | 테스트됨 | HTTP 404 |

이 결과로 로컬 발행 중지 계약은 검증됐지만 실제 provider 발행을 취소하거나 외부 URL 생성을 막는 운영 관찰까지 닫힌 것은 아니다. 외부 AI·OAuth 자격증명과 승인된 새 배포가 준비된 뒤 회원 작업물 1건으로 발행 전 중지와 외부 상태를 직접 확인해야 한다.

벤치마크: 기존 서버 계약의 회귀 실행은 기계적 검증이라 새 벤치마크는 해당 없음. 발행 검토·중지 UX의 비교 기준은 [Buffer](https://support.buffer.com/en-us/articles/managing-and-approving-draft-posts-57li7M8tDA)다.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 및 Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

STAMP | line: osmu | 생성: 2026-09-12 18:54 KST | model: gpt-codex/현재 Codex 컨트롤러 | agent: qa-verifier | skill: qa | 고민: 코드에 이미 있는 취소 경계를 새로 만들지 않고 실제 계약 테스트 증거만 갱신했다.

SOURCES: `dashboard/src/app/api/queue/[postId]/cancel/route.ts` | `dashboard/tests/api/queue-cancel.test.ts` | `pipeline-state.osmu.md` | https://support.buffer.com/en-us/articles/managing-and-approving-draft-posts-57li7M8tDA

MODEL: gpt-codex/현재 Codex 컨트롤러

## 2026-09-12 04시 24분 갭 갱신: 학습 정보가 목적 선택에서 발행 전 기준까지 이어짐

이번 재확인에서 새로 발견한 갭은 목적 선택값의 저장 누락이었다. 생성실은 업종·고객·권리 선택과 학습 위저드 저장은 처리했지만, 생성 담당 문답에서 고른 콘텐츠 목표는 화면 상태로만 남겼다. 그래서 작업 공간이 배운 목표가 다음 생성과 발행실까지 이어지지 않았다. 목적 카드 제목과 예시를 학습 정본에 저장하고, 새 생성실 복원과 주제 제안 판정에 사용하도록 수정했다. 발행실에는 현재 작업 공간의 업종, 고객, 목표, 말투, 금지 표현을 보여 주는 기준판을 추가했다. 이 변경은 외부 API나 DB 스키마를 늘리지 않고 기존 학습 정보 경계를 바로잡는다.

| 계약 | 구현 | 검증 |
|---|---|---|
| 목적 선택의 작업 공간 저장 | `CreateRoom`의 목적 선택이 `writeLearningInfo`와 부모 상태 전달을 수행 | 테스트됨, 목적 저장 회귀 2건 |
| 저장 목적의 생성실 복원 | cardValue와 예시 문장을 카드 선택 판정에 사용 | 테스트됨, 저장 목적 복원 회귀 |
| 학습 기준의 발행실 가시성 | 발행실에 다음 생성·다시 만들기 기준판과 수정 버튼 표시 | 근거 확인, production build 포함 |
| 기존 생성·편집·발행 회귀 | 네 방 흐름과 기존 publish UI 계약 유지 | 테스트됨, 전체 286파일 1,974건 통과 |
| 회원 OAuth2와 외부 성과 | 실제 계정·OAuth provider·외부 permalink | 미검증, 연결 계정 0개와 자격증명 부재 |

이 갭을 닫은 방식은 Buffer의 작성기 내 편집·발행 연결, Vrew의 일괄 대본 편집, Later의 목표·형식·성과 연결을 참고했다. OSMU의 One Thing인 “만들고, 고치고, 올리고, 결과를 되받아 다음 제안으로 돌린다”를 유지하면서 학습 기준이 방 사이에서 사라지지 않는 최소 변경을 택했다. 외부 비교의 직접 근거는 [Buffer](https://buffer.com/integrations/canva), [Vrew](https://vrew.ai/ko/feature/subtitle-editing/), [Later](https://later.com/blog/social-media-calendar/)다.

소스 1: `dashboard/src/components/studio/StudioRooms.tsx`, `dashboard/src/app/studio/page.tsx`, `dashboard/tests/studio/learning-purpose-persistence.test.tsx`. 소스 2: BRAIN `wiki/business/pmf/idea-zero-one-marketing-studio.md`와 관련 OSMU 상태 문서. 소스 3: 공식 벤치마크, Vitest 286파일 1,974건, production build 182/182, localhost health 200.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명·Safari 세션 접근 부재, 외부 발행 완료로 출고하지 않음.

한 줄 결론: 이전 재확인 문서가 남았다고 적은 댓글 다섯 항목은 현재 코드에 모두 구현돼 있다. 2026-08-29 11:56 build는 기존 초안에서 현재 작업과 이어갈 방을 서버가 한 번만 판정하게 해 생성, 편집, 발행, 성과 흐름의 재개 갭을 닫았다.

이 문서는 `docs/_archive/legacy-20260912/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md`의 2026-08-28 현재 정정본이다. 원 감사의 당시 판정은 보존하되 새 작업 발주는 이 문서를 먼저 본다.

## 2026-09-12 실측 갱신: 발행 중지 경계는 검증됨. 전체 OSMU 흐름은 미검증

앞선 절의 "검증 미실행" 상태를 실제 실행 결과로 갱신한다. 예약 중지 정본과 승인 큐 중지 경로는 Next.js 동적 세그먼트 이름을 `[id]`로 통일했고 UUID 경계를 추가했다. 이 변경 뒤 `npm test` 285개 파일 1,972건 통과, 3건 스킵, 실패 0, `npx tsc --noEmit` 통과, `npm run build` 182개 정적 페이지 생성 성공을 확인했다. 관리자 bearer를 이용한 localhost 실요청에서도 예약 잘못된 ID 400, 없는 예약 404, 큐 없는 작업물 404를 관찰했다. 이 의미는 중지 동작의 서버 경계와 잘못된 입력의 사용자 오류 처리는 실제로 닫혔다는 것이다.

반면 기본 흐름 E2E를 실제 존재하는 로컬 workspace에 임시로 맞추어 생성부터 재시작했을 때, 장부 단계는 통과하고 공유 Claude 호출에서 `exit_nonzero`가 발생해 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 멈췄다. 원래 `.env.local`의 workspace ID는 로컬 DB에 없는 값이라 먼저 외래키 오류를 냈다. 운영 설정은 바꾸지 않았다. 따라서 생성·편집·외부 발행·성과의 전체 흐름을 닫았다고 판정하지 않는다.

관리자 read-only API는 정상 응답했지만 active workspace 2개, 연결 계정 0개, OAuth provider 12개 중 완전 설정 0개다. 로컬 DB의 `auth.users` 관계도 없다. 따라서 관리자 계정으로 일곱 채널을 연결한 상태도 아니며, 회원 OAuth2 로그인과 외부 permalink는 이번 실측에서 미검증이다.

소스 1: 실제 소스·테스트·`pipeline-state.osmu.md`. 소스 2: Next.js 동적 라우트 공식 로컬 문서. 소스 3: localhost:3456 실제 HTTP, 관리자 API 응답, 브라우저 E2E, Vitest·TypeScript·build 로그.

⛔ 검증실패 보고: 등급 A, 공유 Claude/Codex 실행 한도와 외부 OAuth 자격증명 부재, 발행 완료로 출고하지 않음.

## 2026-09-12 이번에 닫은 갭(코드 완료, 검증 미실행)

이 문서와 원 감사가 공통으로 남긴 잔여 네 항목(§`아직 남은 감사 항목`)을 현재 코드와 다시 대조했다.
"성과가 규칙을 고친다"는 이 문서 이후 별도로 이미 닫혀 있었다(`891d0577`, `learned-rules-context.ts`,
2026-09-10 확장 `learned-rules-merge.ts` — 재작업하지 않았다). 남은 네 항목 중 게시물별 성과 시계열,
학습 이력, Threads 외 provider 수집기는 DB 구조나 외부 자격증명이 필요해 이번에도 배제한다.
"일곱 플랫폼을 아우르는 서버 측 발행 중지 계약"만 기본 흐름(생성, 편집, **발행**, 성과)의 발행 단계에
직접 붙어 있고 새 DB나 외부 자격증명 없이 만들 수 있어 이번 build 대상으로 골랐다.

| 계약 | 구현 | 검증 |
|---|---|---|
| 대기 채널만 취소 | `queue.json`의 `channels[*].status === 'pending'`인 항목만 `canceled`로 전환 | 미검증(단위 계약 작성, 실행 못함) |
| 이미 종료된 채널 보존 | `published`/`failed`/`skipped` 채널은 손대지 않음 | 미검증 |
| 크론 경합 안전 | `mutateJson` fresh-read로 `threads-queue-tool.ts`의 `get_approved`→`update_channel`이 같은 순간에 일부 채널을 이미 끝냈어도 그 상태를 보고 나머지만 취소 | 미검증 |
| 취소할 것이 없으면 거절 | 대기 채널이 하나도 없으면(이미 전부 끝남) 409 `NOTHING_TO_CANCEL`, 기존 상태 보존 | 미검증 |
| 기존 흐름 보존 | 기존 승인, 삭제, 편집 인계, 큐 조회 경로는 그대로 유지(신규 라우트 추가만, 기존 라우트 수정 없음) | 근거 확인(diff 범위 확인) |

이번 build는 코드와 계약 테스트(`dashboard/tests/api/queue-cancel.test.ts` 4건)까지만 완료했다.
이번 세션에서 `npx vitest`·`npm run test`·`npx tsc --noEmit`·E2E 스크립트·localhost 실제 클릭 확인이
전부 Bash 명령 승인 차단으로 실행되지 못했다. 승인 후 `docs/qa/qa-tracker.md`의 같은 항목 표를
관찰 증거로 갱신해야 완료로 볼 수 있다. 자세한 내용은 `session-state.osmu.md` 2026-09-12 03시 18분 항목.

이번 범위에서 구현하지 않은 것: 게시물별 성과 시계열 snapshot과 30일 비교, 학습 후보 수락·거절 이력,
Threads 외 여섯 플랫폼의 실제 provider 성과 수집기. 이 셋은 그대로 남아 있다.

STAMP | line: osmu | 생성: 2026-09-12 03:18 KST | model: claude-sonnet-5 | agent: code-builder | skill: 없음 | 고민: 검증을 못 돌린 상태에서 "닫았다"고 쓰면 위조가 된다. 그래서 이 절 전체를 "코드 완료, 검증 미실행"으로 못 박았다.

SKILLS_USED: 없음. 코드 구현 전용 매칭 스킬 없음. SKILLS_SKIPPED: qa는 QA 단계 소유라 사용하지 않음.

SOURCES: `docs/_archive/legacy-20260912/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md` | `docs/_archive/legacy-20260912/audit/osmu-프로덕션수준-갭판정-v1.0.md` | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`

MODEL: claude-sonnet-5 / code-builder

## 2026-08-29 현재 작업 단일 계약 build

두 감사 문서의 미구현 및 부분 구현 항목을 현재 코드와 다시 대조했다. 댓글 행동, 성과 제안 큐 인계, 성과 0건 가설, 편집 장면 조작, 형식 검증, 첫 댓글, 발행 상태, 검토 후 복귀, 성과 수집 범위는 이미 구현돼 있어 제외했다. DB 구조나 외부 자격증명이 필요한 성과 snapshot, 학습 이력, 외부 수집기와 승인 시안이 지원하지 않는 서버 발행 중지도 제외했다. 그 결과 생성실 감사의 `현재 작업과 현재 단계 표시`를 기본 흐름에 가장 가까운 실제 갭으로 선택했다.

| 계약 | 구현 | 관찰 증거 |
|---|---|---|
| 현재 작업 단일 판정 | 최근 50개 초안 중 유효한 최신 작업을 서버가 하나만 고름 | 실제 작업 공간 GET 200, 초안 39건 중 현재 작업 1건 |
| 현재 방 판정 | 생성 전, 편집 중, 발행 준비 및 복구, 발행 완료를 생성실, 편집실, 발행실, 성과실로 매핑 | 실제 응답의 현재 단계 `발행실` 관찰 |
| 안전한 재개 | 응답의 현재 작업 ID가 같은 응답의 초안 목록에 있을 때만 `이어하기`를 노출하고 기존 초안 복원 경로를 사용 | 실제 응답에서 목록 일치 `예`, 화면 정상 및 ID 불일치 거절 계약 통과 |
| 기존 흐름 보존 | `작업물 전체`의 기존 네 방 단추, 초안 목록, 방별 화면과 발행 복귀 흐름을 유지 | 기본 흐름 11/11, Studio v1 12/12, 전체 회귀 통과 |
| 저장 시각 경계 | PostgreSQL 드라이버의 `Date`와 문자열 저장 시각을 같은 ISO 시각으로 정규화 | 첫 실요청에서 빈 현재 작업을 발견한 뒤 Date 회귀 계약 추가, 재요청에서 발행실 판정 관찰 |

첫 localhost 요청은 초안 38건을 반환했지만 `currentWork`가 비어 실패했다. 원인은 단위 테스트가 문자열 시각만 사용한 반면 실제 PostgreSQL 드라이버는 `Date` 객체를 반환한 것이었다. 드라이버 경계를 정규화하고 API 및 도메인 회귀 계약을 추가한 뒤 같은 실제 경로에서 HTTP 200, 초안 39건, 현재 단계 발행실, 목록 일치 예를 관찰했다. 자동 이동은 하지 않고 사용자가 `이어하기`를 눌렀을 때만 기존 작업을 복원하므로 최신 초안이 사용자의 의도와 다를 수 있는 위험도 제한했다.

최종 검증은 `npm run test` 199파일, 1,450건 통과와 조건부 1건 제외, `npx tsc --noEmit`, production build 174/174, 기본 흐름 11/11, Studio v1 12/12, design lint 위반 0이다. production build의 기존 NFT 추적 경고 1건은 유지됐다. 운영 배포와 실제 공개 채널 발행은 미검증이다.

레드팀: 가장 최근 초안이 사용자가 다시 열려는 작업과 다를 수 있다. 서버 판정은 자동 이동이나 자동 덮어쓰기를 하지 않고 명시적 재개 동작만 제공하며, 현재 작업 ID가 같은 tenant 초안 목록에 없으면 동작 자체를 숨긴다.

셀프심문: 이 계약이 틀렸다면 가장 그럴듯한 이유는 실제 DB 반환형을 mock이 재현하지 못한 경우다. 첫 실요청이 바로 그 결함을 드러냈고, `Date` 객체 회귀 테스트와 localhost 재요청을 최종 증거로 추가했다.

STAMP | line: osmu-gapfill082911 | 생성: 2026-08-29 11:56 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 고민: 별도 현재 작업 테이블을 만들지 않고 기존 tenant 초안 목록에서 안전하게 재개 가능한 한 건을 판정했다.

SKILLS_USED: 없음. 설치된 스킬 중 build 코드 구현에 직접 대응하는 스킬이 없다. SKILLS_SKIPPED: qa는 QA 단계의 브라우저 E2E 소유 스킬이라 사용하지 않았다.

SOURCES: `docs/_archive/legacy-20260912/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md` | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `DESIGN.md` | https://nextjs.org/docs/app/guides/backend-for-frontend | https://linear.app/docs/search

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 2026-08-29 성과 수집 범위 계약 build

원 감사와 직전 재확인의 `플랫폼별 실제 성과 수집 범위와 결측 이유의 단일 계약`을 선택했다. 생성, 편집, 발행 뒤 성과를 확인하는 기본 흐름의 마지막 경계이며, 기존 `/api/metrics`는 게시물만 반환해 값이 0인 이유를 구분할 수 없었다.

| 계약 | 구현 | 관찰 증거 |
|---|---|---|
| 일곱 대상 단일 응답 | Threads, X, Instagram, Facebook, YouTube Shorts, Instagram Reels, TikTok을 `coverage.version=v1` 한 응답으로 반환 | 실제 작업 공간 GET 200, `platforms` 7건 관찰 |
| 실제 지원 범위 | 현재 앱에서 수집기가 연결된 Threads만 `collectionSupported=true`, 수집기와 지표 목록을 명시 | 실제 응답에서 `threads_post_insights`, views·likes·replies·reposts 관찰 |
| 결측 이유 | 발행 없음, 수집 전, 부분 수집, 수집기 미구현을 코드와 한국어 설명으로 구분 | 임시 실제 DB 행에서 Threads `PARTIAL_COLLECTION`, X `COLLECTOR_NOT_IMPLEMENTED` 관찰 |
| 수집 진척 | 플랫폼별 발행, 수집, 미수집 건수와 마지막 수집 시각 제공 | Threads 발행 2건, 수집 1건, 미수집 1건 관찰 |
| 잘못된 집계 거절 | 음수, 정수가 아닌 건수, 수집 건수가 발행 건수보다 큰 입력을 계약 오류로 거절 | 정상·거절 단위 계약과 route 통합 계약 4/4 통과 |

작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`에 검증용 발행 행 3건을 잠시 넣어 실제 앱 응답을 관찰한 뒤 모두 삭제했고 잔여 0건을 확인했다. 기존 `posts` 응답과 Threads POST 수집 경로는 보존했다. 새 DB 구조와 provider 호출은 추가하지 않았다.

이번 build가 닫은 것은 수집 지원 범위와 결측 이유를 숨기지 않는 단일 계약이다. Threads 외 여섯 플랫폼의 실제 수집기는 여전히 미구현이며 응답에 그 사실을 명시한다. 실제 외부 provider 수치 수집과 운영 배포는 미검증이다.

검증 결과는 전체 Vitest 196파일, 1,408건 통과와 조건부 1건 제외, `npx tsc --noEmit`, production build 174/174, 기본 흐름 11/11, Studio v1 12/12, design lint 위반 0이다. production build의 기존 NFT 추적 경고 1건은 유지됐다.

STAMP | line: osmu-gapfill082907 | 생성: 2026-08-29 07:42 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 고민: 없는 수집기를 만든 척하지 않고 실제 지원 범위와 결측 이유를 기존 성과 API에 호환 방식으로 드러냈다.

SKILLS_USED: 없음. 설치된 스킬 중 build 코드 구현에 직접 대응하는 스킬이 없다. SKILLS_SKIPPED: qa는 QA 단계의 브라우저 E2E 소유 스킬이라 사용하지 않았다.

SOURCES: `docs/_archive/legacy-20260912/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md` | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `DESIGN.md` | https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api | https://developers.google.com/youtube/analytics/metrics

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 2026-08-29 이번 build에서 닫은 갭

원 감사와 직전 재확인의 `비율, 자막, 음악, 카드 등 형식별 서버 validation 완결`을 선택했다. 생성 결과를 편집하고 발행하기 직전의 기본 흐름에 붙어 있으며, 기존 코드는 편집값을 화면 로컬 상태에만 두어 잘못된 값도 서버가 거절할 수 없었다.

| 계약 | 구현 | 관찰 증거 |
|---|---|---|
| 승인 형식 단일 계약 | 영상 9:16·1:1·16:9, 카드 1:1·4:5, 자막 3단계, 속도 4단계, 목소리·배경·음악 허용 목록을 순수 도메인 계약으로 고정 | 정상·거절 단위 계약 통과 |
| 편집값 보존 | 편집실 선택값을 작업 공간 로컬 상태와 초안 payload에 저장하고 다시 불러옴 | 실제 작업 공간 초안 POST 200, GET 200, 카드 4:5 형식값 재조회 |
| 발행 전 차단 | Studio 발행 body에 `edit_format`을 넣고 `/api/publish`가 자격 조회와 provider 호출 전에 검증 | 잘못된 4:3 영상 비율을 localhost에서 HTTP 422 `INVALID_EDIT_FORMAT`으로 관찰 |
| 사전 검증 | `/api/content/validate`도 같은 계약을 사용 | 승인된 9:16, 1.25배 영상 형식을 localhost에서 HTTP 200, `valid:true`로 관찰 |
| 기존 흐름 보존 | 기존 생성, 편집 인계, 큐, 성과 제안 경로는 그대로 유지 | 기본 흐름 11/11, Studio v1 12/12 |

서버 계약이 받는 허용값은 승인 프로토타입 v63의 값과 일치한다. Next.js 공식 지침의 외부 시스템 전달 전 입력 검증 원칙을 적용했고, YouTube 공식 규격에서 세로·정사각·16:9 비율을 교차 확인했다. 실제 provider가 이 형식대로 영상이나 카드를 렌더하는지는 이번 범위에서 검증하지 않았다.

검증 결과는 전체 Vitest 193파일, 1,388건 통과와 조건부 1건 제외, `npx tsc --noEmit`, production build 174/174, design lint 위반 0이다. production build의 기존 NFT 추적 경고 1건은 유지됐다. 운영 배포와 실제 공개 채널 발행은 미검증이다.

STAMP | line: osmu-gapfill082903 | 생성: 2026-08-29 03:27 KST | model: gpt-codex/gpt-5.6-sol | agent: code-builder | skill: 없음 | 고민: 편집 화면에만 있던 값을 새 API나 DB 없이 기존 초안과 발행 경계에 연결했다.

SKILLS_USED: 없음. 설치된 스킬 중 build 코드 구현에 직접 대응하는 스킬이 없다. SKILLS_SKIPPED: qa는 QA 단계의 브라우저 E2E 소유 스킬이라 사용하지 않았다.

SOURCES: `docs/_archive/legacy-20260912/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md` | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `DESIGN.md` | https://nextjs.org/docs/app/guides/backend-for-frontend | https://support.google.com/youtube/answer/1722171?hl=en | https://support.google.com/youtube/answer/15424877?hl=en

MODEL: gpt-codex/gpt-5.6-sol / code-builder

## 두 감사 문서 대조 결과

이전 재확인 문서의 `아직 못 하는 것` 다섯 줄은 더 이상 개발 갭이 아니다.

| 이전 잔여 항목 | 현재 코드 근거 | 현재 판정 |
|---|---|---|
| 댓글과 반응의 본문 목록 | `GET /api/engagement`, `engagement_items` | 구현됨. 실 provider 읽기는 미검증 |
| 댓글 답글 초안 만들기 | `engagement-service.ts`, 성과실 댓글 행동 | 구현됨 |
| 답글 보내기 | engagement reply route와 경합 계약 | 구현됨. 실 provider 발송은 미검증 |
| 댓글 좋아요와 나중 처리 | like, defer 상태 전환과 DB 잠금 | 구현됨. 실 provider 좋아요는 미검증 |
| 댓글에서 편집실로 넘기기 | draft 생성과 `comment_id`, `draft_id` 인계 | 구현됨 |

따라서 댓글 저장 구조를 새로 만들지 않았다. 이미 승인된 migration과 서비스 위에 중복 구현하는 선택을 배제했다.

## 이번에 닫은 갭

원 감사의 발행실 항목 `inbox와 calendar에서 발행실로 복귀`를 선택했다. 생성, 편집, 발행, 성과의 기본 흐름 중 편집 결과를 검토하거나 예약한 뒤 다시 발행 상태로 돌아오는 연결이기 때문이다.

| 계약 | 구현 | 관찰 증거 |
|---|---|---|
| 검토 요청과 원 초안 연결 | Studio가 초안을 먼저 저장하고 queue에 `draftId`를 보존 | 정상 및 저장 실패 거절 계약 통과 |
| inbox 복귀 | 각 항목에 `발행실로 돌아가기` 링크와 source context 제공 | 실제 Chromium 클릭 후 발행실 도착 |
| calendar 복귀 | 선택 날짜의 각 항목에 같은 복귀 링크 제공 | 실제 Chromium 클릭 후 발행실 도착 |
| 발행 상태 복원 | 연결 초안의 플랫폼별 본문을 우선 사용하고, 본문 없는 편집 인계 초안은 queue 본문과 초안 메타데이터를 결합 | 실제 편집 인계 초안 제목과 `3곳에 올리기` 노출 |
| 잘못된 URL 거절 | queue 항목이 없거나 본문이 없으면 빈 작업물을 발행 가능 상태로 만들지 않음 | 거절 계약 통과 |

localhost 실요청에서 같은 queue 항목이 inbox와 calendar 각각에 대해 source, queue ID, draft ID, Studio 복귀 URL을 반환했다. Studio 복귀 페이지는 HTTP 200이었다. 미디어 없는 검증 항목으로 inbox와 calendar 링크를 실제 Chromium에서 눌렀고 브라우저 401과 콘솔 오류는 각각 0건이었다. 임시 queue와 고객 토큰은 검증 뒤 삭제했다.

## 아직 남은 감사 항목

이번 범위에서는 다음 원 감사 항목을 구현하지 않았다.

- 일곱 플랫폼을 아우르는 서버 측 발행 중지 계약
- 게시물별 성과 시계열 snapshot과 재현 가능한 30일 비교
- 학습 후보 수락 및 거절 이력
- Threads 외 여섯 플랫폼의 실제 provider 성과 수집기

현재 코드에 부분 구현이 있으므로 다음 작업 전에는 각 항목을 다시 실측해야 한다. 이 목록만 보고 새 스키마나 API를 만들면 안 된다.

## 검증

- `npm run test -- --maxWorkers=8 --minWorkers=1 --testTimeout=15000`: 187파일, 1,336건 통과, 조건부 6건 건너뜀
- `npx tsc --noEmit`: 통과
- `npm run build`: 정적 경로 174개 생성, exit 0. 기존 NFT 추적 경고 1건 유지
- 기본 흐름 E2E: 11/11
- Studio v1 E2E: 12/12
- UI 토큰 감사와 design lint: 위반 0건
- localhost Chromium: inbox 복귀, calendar 복귀, 401 0건, 콘솔 오류 0건

운영 배포, 실제 공개 채널 발행, 실 provider 댓글 행동은 미검증이다. 전체 v63 디자인 정합 NG와 단계 승인 보류도 유지한다.

STAMP | line: osmu-gapfill082823 | 생성: 2026-08-28 23:46 KST | model: gpt-5.6-sol | agent: code-builder | skill: pipeline | 고민: 이미 구현된 댓글 기능을 재창조하지 않고 기본 발행 흐름의 실제 단절을 선택했다.

SKILLS_USED: pipeline. build 허용 범위와 단계 gate 확인에 사용. SKILLS_SKIPPED: 설치 코드 구현 전용 매칭 스킬 없음.

SOURCES: `docs/_archive/legacy-20260912/audit/osmu-v62-api-gap-audit-v1-gpt-codex.md` | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `DESIGN.md` | https://support.buffer.com/en-us/articles/managing-and-approving-draft-posts-57li7M8tDA

MODEL: gpt-5.6-sol / code-builder
