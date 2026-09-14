# OSMU API 읽기 경로 전수 재실사 v8

한 줄 결론: 고정된 최신 소스로 localhost:3456의 GET Route Handler 105개를 실제 호출한 최종 결과는 정상 92개, 계약상 거절 13개, HTTP 500과 요청 실패 0개다. 최초 실사에서 드러난 생성 장부 연결 오류의 일반 500 누출을 고치고 회귀 테스트를 남겼지만, 제품 전체 QA와 운영 배포는 NG 또는 미검증이다.

STAMP | line: osmu-api-sweep091409 | 생성: 2026-09-14 10:05 KST | model: gpt-codex/gpt-5.6-sol | agent: qa-verifier | skill: qa | 근거: localhost HTTP 원본, 전체 Vitest, TypeScript, production build, seed, 기본 흐름과 Studio v1 E2E, 2026-08-28 및 v7 실사 | 고민: 실제 제품 500과 Next 개발 서버의 동시 콜드 컴파일 실패를 같은 장애로 세지 않되 둘 다 증거에 남겼다.

## 1. 범위와 판정 기준

- 대상: `dashboard/src/app/api/**/route.ts` 중 `GET`을 내보내는 105개 경로.
- 환경: `http://localhost:3456`, `dashboard/.env.local`, 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`.
- 최종 원본: `logs/diff/osmu-api-read-sweep-20260914-091409-final.json`.
- 최종 관찰 시각: 2026-09-14 09:59:28 KST.
- 최종 HEAD: `e0c66d1427cb9f579fb65a15794a7b337e8bc9a4`.
- 소스 고정: 실행 전후 `dashboard/src` 합성 SHA-256이 `5f276662869c8aef8126c48e0d3969afa810d10971bb763e2c9b58fabd942f5b`로 같고, HEAD도 같았다.
- 판정: 2xx와 3xx는 정상이다. 잘못된 식별자, 없는 자원, 인증 경계, 설정 부재를 구체적으로 설명하는 4xx와 503은 의도된 거절이다. HTTP 500, 설명되지 않은 5xx, 요청 실패, 전체 시간 초과는 고장이다.
- 정본 경로 정리: 요청의 `wiki/product/사업좌표-OSMU와-ZERO-ONE.md`는 이동돼 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`를 읽었다. canonical `docs/test-plan.md`는 없어 `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md`를 사용했다.

## 2. 최종 관찰 결과

| 구분 | 수 | 판정 |
|---|---:|---|
| GET 정상 | 92 | PASS |
| GET 의도된 거절 | 13 | PASS |
| HTTP 500 | 0 | PASS |
| 설명되지 않은 5xx | 0 | PASS |
| 요청 실패 또는 전체 시간 초과 | 0 | PASS |

최종 health도 HTTP 200이었다. v7 원본과 현재 원본을 경로, 상태, 분류 세 열로 기계 대조한 결과 차이는 0건이다.

## 3. 최초 고장과 수정

최초 실호출에서는 `/api/studio/v1/derivations/<없는 UUID>`가 38,980ms 뒤 HTTP 500과 `INTERNAL_ERROR`를 반환했다. 즉시 같은 요청을 반복했을 때는 404였고, 48개 동시 요청도 모두 404였다. 서버 기록의 애플리케이션 처리 30.3초는 Postgres 드라이버 기본 연결 제한시간 30초와 일치했다.

근본 원인은 생성 읽기 저장소가 일시적인 Postgres 연결 오류를 계약 오류로 바꾸지 않아 일반 500으로 누출한 구조다. `findDerivation`과 인접한 `findJob`의 읽기 경계에서 연결 제한시간, 연결 종료, 연결 거절과 초기화 오류를 재시도 가능한 HTTP 503 `GENERATION_DB_UNAVAILABLE`로 변환했다. 정상적인 없는 자원은 기존 404를 유지한다.

| 변경 | 결과 |
|---|---|
| `dashboard/src/lib/studio/generation/repository.ts` | 생성 작업과 파생 작업 읽기의 일시적 DB 연결 오류를 재시도 가능한 503으로 분류 |
| `dashboard/tests/studio/generation-read-connection-error.regression-1.test.ts` | 파생 작업 연결 제한시간, 생성 작업 연결 종료, 일반 쿼리 오류 3가지 계약 고정 |
| 수정 커밋 | `25330905 fix(studio): classify transient generation read failures` |
| 수정 뒤 최종 실호출 | 해당 없는 파생 작업 404, 전체 105개 중 HTTP 500과 요청 실패 0 |

## 4. 의도된 거절 13개

| 경로 | HTTP | 관찰한 계약상 이유 |
|---|---:|---|
| `/api/card-slides/<없는 UUID>` | 400 | 잘못된 카드 묶음 번호 |
| `/api/connect/threads` | 503 | Threads OAuth 앱 자격증명 미설정 또는 불완전 |
| `/api/engagement` | 404 | 지정 작업 공간의 발행 글 없음 |
| `/api/figma-mcp/callback` | 400 | OAuth 상태 불일치 |
| `/api/higgsfield/asset/<없는 파일>` | 404 | 자산 없음 |
| `/api/images/deliver/<없는 토큰>` | 404 | 전달 토큰 없음 |
| `/api/isolation-proof` | 401 | 테넌트 토큰 없음 |
| `/api/media/<없는 토큰>` | 404 | 미디어 토큰 없음 |
| `/api/studio/v1/derivations/<없는 UUID>` | 404 | 파생 작업 없음 |
| `/api/studio/v1/generations/<없는 UUID>` | 404 | 생성 작업 없음 |
| `/api/studio/v1/shorts-factory/runs/<없는 UUID>` | 404 | 숏폼 공장 실행 없음 |
| `/api/tiktok/creator-info` | 400 | 토큰에서 테넌트 확인 불가 |
| `/api/tiktok/publish-status` | 400 | 토큰에서 테넌트 확인 불가 |

`/api/connect/threads`의 503은 예외 누출이 아니다. 응답 본문이 외부 OAuth 설정 부재를 명시한다. 나머지 12개도 각 응답 본문에서 입력, 없는 자원, 인증 경계를 확인했다.

## 5. 지난 실사와 달라진 곳

| 기준 | 2026-08-28 문서 | 당시 실제 정적 분모 | 2026-09-14 v7 | 2026-09-14 v8 |
|---|---:|---:|---:|---:|
| GET 분모 | 84 | 95 | 105 | 105 |
| 정상 | 79 | 문서 미집계 | 92 | 92 |
| 의도된 거절 | 인증 2, 호출값 누락 3 | 문서 미집계 | 13 | 13 |
| 실사 중 발견한 HTTP 500 | 2, 당일 수정 | 2, 당일 수정 | 0 | 1, 수정 뒤 0 |
| 최종 요청 실패 | 0 | 0 | 0 | 0 |

2026-08-28 문서 분모 84개와 당시 커밋의 실제 정적 분모 95개는 일치하지 않았다. 당시 실제 정적 분모 뒤 추가된 GET 10개는 다음과 같다.

- `/api/engagement`
- `/api/operator/incidents`
- `/api/performance/learned-rules`
- `/api/studio/generation-history`
- `/api/studio/learning`
- `/api/studio/v1/derivations/[batchId]`
- `/api/studio/v1/generations/[jobId]/derivations`
- `/api/studio/v1/shorts-factory/runs`
- `/api/studio/v1/shorts-factory/runs/[runId]`
- `/api/threads/low-engagement-candidates`

v7과 v8의 최종 경로, 상태, 분류는 같다. 달라진 것은 실사 중 발견한 생성 장부 연결 오류의 계약 보강이다. v7 뒤 변경된 `/api/metrics`를 포함한 최신 코드도 최종 실사에서 HTTP 200이었다.

## 6. 콜드 컴파일 실패 분리

최종 고정 실행 직전 같은 HEAD와 소스 해시에서 병렬 콜드 실사를 한 번 수행했을 때 `/api/connect/threads/callback`이 Next 오류 HTML과 HTTP 500을 반환했다. 개발 서버 기록은 Route Handler가 만들지 않는 `Unexpected end of JSON input`을 남겼다. 해당 경로는 쿼리가 없으면 HTTP 200 HTML로 `code/state 누락`을 설명하는 계약이다.

새 전용 개발 서버에서 이 경로만 5회 연속 호출한 결과 첫 요청 3,905ms, 이후 32ms부터 56ms였고 모두 HTTP 200과 기대 문구를 반환했다. 그래서 이 500은 제품 Route Handler 결함이 아니라 제한 병렬 요청이 Next 개발 서버의 최초 컴파일과 겹친 측정 환경 오류로 분리했다. 다만 원본 `logs/diff/osmu-api-read-sweep-20260914-091409-final-commit.json`은 삭제하지 않고 진단 증거로 남겼다. 최종 전수 측정은 경로를 먼저 예열하고 동일한 제한 병렬성 4로 처음부터 다시 수행했다.

## 7. 회귀와 동작 증거

| 검증 | 직접 관찰 결과 |
|---|---|
| API 전수 실호출 | GET 105개, 정상 92, 의도된 거절 13, HTTP 500과 요청 실패 0 |
| 소스 고정 | 실행 전후 HEAD와 `dashboard/src` 합성 SHA-256 동일 |
| 신규 회귀 | 생성 장부 읽기 오류 계약 3건 PASS |
| 전체 Vitest | 현재 코드 345파일 PASS, 2,254건 PASS, 조건부 3건 제외, 실패 0 |
| TypeScript | `npx tsc --noEmit`, 종료 코드 0 |
| Web production build | Next.js 16.2.2, 정적 페이지 184/184, 종료 코드 0 |
| build 경고 | 기존 NFT import 추적 경고 1건, build 성공과 분리해 잔존 기록 |
| seed | `apply-schema.sh --seed`, 멱등 스키마, 고정 작업 공간, RLS, 확장 2개, `osmu_service` 역할 확인 |
| production health | `next start`로 구동한 build의 `/api/health` HTTP 200과 DB up 관찰 |
| 기본 흐름 | `verify-basic-flow-e2e.mjs`, 생성, 편집, 발행 큐, 성과 재인계 11/11 PASS |
| Studio v1 | `verify-studio-v1-e2e.mjs`, 인증 거절, 생성, 조회, 재생성 경합 14/14 PASS |
| 최종 개발 health | 전수 실사 뒤 HTTP 200 |
| 디자인 lint | `design-lint.sh dashboard/src`, 토큰 위반 0 |
| Mobile과 Maestro | 별도 모바일 제품이 없어 해당 없음 |
| 운영 배포와 외부 채널 실발행 | 미검증 |

전체 테스트와 최종 실사 사이에 성과 코드가 커밋 `e0c66d14`로 바뀌었다. 이 커밋 뒤 전체 Vitest 2,254건, TypeScript, production build, 두 E2E와 최종 105개 실사를 다시 수행했으며 최종 실사 전후 HEAD와 소스 해시가 같았다.

## 8. 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98 | 발행 성과를 읽고 다음 생성 판단으로 되돌림 | API-READ-ALL-V8 | PASS | `/api/metrics`, `/api/engagement`, 제안과 학습 GET을 포함한 105개 실호출, 500과 요청 실패 0 |
| R104 | 고객, 운영자, 작업 공간 인증 경계 | API-AUTH-BOUNDARY-V8 | PASS | 인증된 경로는 handler 응답, 무토큰 격리 탐침은 401, 13개 비정상 상태는 본문으로 계약 확인 |
| R200, R207 | 성과 학습 규칙과 Studio 학습 정보 조회 | API-LEARNING-READ-V8 | PASS | `/api/performance/learned-rules`, `/api/studio/learning` 각각 HTTP 200 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 판정을 유지하고 이번 PASS에 포함하지 않음 |

전환 가능 TC는 `API-READ-ALL-V8`, `API-AUTH-BOUNDARY-V8`, `API-LEARNING-READ-V8`이다. 제품 전체 QA 승인과 배포 전환은 불가하다.

## 9. 제품 전체 판정

이번 변경은 서버 읽기 오류 계약뿐이고 화면 구조와 스타일을 바꾸지 않았다. v7의 승인 시안과 dev 실화면 대조 결과를 유지한다. 승인 시안 `docs/design/captures/osmu-four-room-prototype-v63-20260912/1440-light-publish.png`와 dev 실화면 `docs/design/captures/live-20260912/authenticated-fe3/studio-publish-1440.png`은 공통 셸, 요소 순서, 카드 열 구성, 버튼 위계가 일치하지 않아 디자인 정합 NG다. `docs/design/captures/manifest.json`도 실제 production Supabase JWT, 운영자 캘린더, 원격 배포를 미검증으로 남긴다.

API 읽기 범위만 PASS다. 제품 전체 QA와 배포는 NG를 유지한다.

검증실패 보고: 등급=상위 QA 품질 검증 FAIL. 사유=운영 또는 stage 배포 환경 접촉 증거가 0건이고 이번 과제는 localhost:3456으로 범위가 고정됐다. 출고여부=localhost API 읽기 범위 증거로만 출고하며 제품 전체 QA 승인과 배포 근거로는 출고하지 않는다.

페르소나 결정: 초보 1인 사업자는 현재 로컬 환경에서 읽기 API의 일반 500 때문에 생성, 편집, 발행 큐, 성과 재진입이 막히지 않는다. 외부 계정 연결부터 실제 공개와 성과 수집까지 완료된다는 증거는 없다.

## 10. 레드팀과 셀프심문

레드팀: 까다로운 운영자는 첫 500이 반복되지 않았으니 결함이 아니라고 하거나, 반대로 콜백 500까지 제품 고장으로 세야 한다고 공격할 수 있다. 첫 500은 연결 오류가 일반 500으로 새는 코드 경계를 확인하고 회귀 테스트로 고정했다. 콜백 500은 Route Handler 단독 5회와 예열 뒤 전수 실행에서 모두 200이었고 Next 개발 서버 내부 오류 HTML이어서 측정 환경 실패로 분리했다. 두 실패 원본은 모두 보존했다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 공유 작업 트리가 실행 중 바뀌었거나 의도된 503을 정상으로 세탁한 경우다. 실행 전후 HEAD와 전체 `dashboard/src` 해시를 비교했고, 13개 거절의 HTTP와 본문을 전부 확인했다. Threads 503은 설정 부재를 명시하므로 서비스 준비 경계로 남겼으며 성공 200으로 바꾸지 않았다.

## 11. 벤치마크 적용

- Next.js Route Handlers 공식 문서의 `route.ts` 메서드 export를 검사 분모로 사용했다.
- RFC 9110의 상태 의미를 따라 호출자 입력과 인증 문제인 4xx, 일시적 서비스 불가인 503, 처리 결함인 일반 500을 분리했다.
- 회장 정본의 직접 관찰 원칙에 따라 mock이나 build 결과가 아니라 localhost 상태코드와 응답 본문을 최종 판정 근거로 썼다.

RUBRIC_SCORE: 재현성=5/5 범위완결=5/5 판정정확성=5/5 증거추적=5/5 정직성=5/5 total=25/25

WEAKEST_LINE: 로컬 읽기 경로는 깨끗하게 통과했지만 운영 배포와 외부 채널에서 같은 경계를 관찰하지 않았다.

SKILLS_USED: qa, API 전수 실호출, 실패 원인 분리, 전체 회귀, build, seed, E2E, 증거 기록 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: OSMU 사업 좌표, 끝내기 우선, 직접 검증, 초보 1인 사업자, HTTP 상태 의미, Next.js Route Handler 분모
HITS_USED: BRAIN의 OSMU 사업 좌표와 끝내기 우선 원칙을 사용해 생성, 발행, 성과 읽기를 핵심 경로로 고정하고, 공식 Next.js 및 RFC 문서로 분모와 상태 판정을 고정했다.
HITS_REJECTED: 일반 마케팅 심리와 다른 벤처 자료는 API 상태 판정 근거가 아니어서 제외했다.
CONFLICTS: 외부 HTTP 기준과 회장 정본 사이 충돌 없음. 사용자 과제의 v63 프로토타입과 canonical pipeline의 v68 승인 핀은 충돌하므로 제품 전체 QA를 NG로 유지했다.

SOURCES: `CLAUDE.md` | `dashboard/CLAUDE.md` | `pipeline-state.osmu.md` | `docs/구현현황.md` | `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md` | `docs/plan/persona.md` | `docs/plan/one-thing.md` | `docs/design/README.md` | `docs/design/ui-architecture.md` | `docs/design/screen-inventory.md` | `docs/design/user-flow.md` | `docs/design/captures/manifest.json` | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/거버넌스/요청.md` | `wiki/거버넌스/결정.md` | `wiki/거버넌스/실수.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `docs/_archive/legacy-20260912/audit/openclaw-api-live-sweep-2026-08-28.md` | `docs/qa/osmu-api-read-sweep-v7-gpt-codex.md` | `logs/diff/osmu-api-read-sweep-20260914-091409.json` | `logs/diff/osmu-api-read-sweep-20260914-091409-final.json` | https://nextjs.org/docs/app/getting-started/route-handlers | https://www.rfc-editor.org/rfc/rfc9110.html

MODEL: gpt-codex/gpt-5.6-sol / qa-verifier
