# OSMU API 읽기 경로 전수 재실사 v7

한 줄 결론: localhost:3456에서 현재 GET Route Handler 105개를 실제 호출한 결과 정상 92개, 계약상 거절 13개, HTTP 500과 요청 실패 0개였다. API 읽기 범위는 PASS지만 개발 서버의 Turbopack 치명 로그, 디자인 정합, 운영 배포는 NG 또는 미검증으로 남긴다.

STAMP | line: osmu-sweep091405 | 생성: 2026-09-14 06:04 KST | model: gpt-codex/gpt-5.6-sol | agent: qa-verifier | skill: qa | 근거: localhost HTTP 원본, 전체 Vitest, TypeScript, production build, seed, 기본 흐름과 Studio v1 E2E, 2026-08-28 및 v6 실사 | 고민: 공유 작업 트리의 소스 변경과 서버 재시작이 섞인 실행은 폐기하고 GET 소스 해시가 고정된 실행만 채택했다.

## 목차

1. 범위와 판정 기준
2. 현재 관찰 결과
3. 의도된 거절 13개
4. 지난 실사와 달라진 곳
5. 실패 실행 배제와 근본 원인
6. 회귀와 동작 증거
7. 요청 번호 승계
8. 제품 전체 판정
9. 레드팀과 셀프심문
10. 벤치마크 적용

## 1. 범위와 판정 기준

- 대상: `dashboard/src/app/api/**/route.ts` 중 `GET`을 내보내는 105개 경로.
- 환경: `http://localhost:3456`, `dashboard/.env.local`, 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`.
- 원본 증거: `logs/diff/osmu-api-read-sweep-20260914-final-v2.json`.
- 관찰 시각: 2026-09-14 05:40:22 KST.
- 실행 기록 커밋: `8a055508`. 실행 뒤 GET이 없는 영상 자막 경로와 테스트 수정 커밋이 추가됐지만, GET 소스 합성 SHA-256은 실행 전후 `a011035aabbc73c19f9862f5f493ef5d9b806c6d922e0d87a3258399de37e5f1`로 동일했다.
- 판정: 2xx와 3xx는 정상이다. 잘못된 식별자, 없는 자원, 인증 경계, 설정 부재를 구체적으로 설명하는 4xx와 503은 의도된 거절이다. HTTP 500, 설명되지 않은 5xx, 요청 실패, 전체 시간 초과는 고장이다.
- 정본 경로 정리: 요청에 적힌 `wiki/product/사업좌표-OSMU와-ZERO-ONE.md`는 현재 없고, 이동된 정본 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`를 읽었다.

## 2. 현재 관찰 결과

| 구분 | 수 | 판정 |
|---|---:|---|
| GET 정상 | 92 | PASS |
| GET 의도된 거절 | 13 | PASS |
| HTTP 500 | 0 | PASS |
| 설명되지 않은 5xx | 0 | PASS |
| 요청 실패 또는 전체 시간 초과 | 0 | PASS |

고장난 GET이 없어 제품 Route Handler를 수정하지 않았다. 콜드 컴파일 제한시간 회귀는 기존 `dashboard/tests/api/api-read-sweep-timeout.regression-1.test.ts`가 유지되며 최종 전체 Vitest에 포함돼 통과했다.

## 3. 의도된 거절 13개

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

`/api/connect/threads`의 503은 서버 예외가 아니다. 응답 본문이 설정 부재를 명시하고 있어 준비되지 않은 외부 연동 경계로 분리했다. 나머지 12개도 각각 잘못된 입력, 없는 자원, 인증 경계를 본문으로 확인했다.

## 4. 지난 실사와 달라진 곳

| 기준 | 2026-08-28 문서 | 당시 실제 정적 분모 | 2026-09-13 v6 | 2026-09-14 v7 |
|---|---:|---:|---:|---:|
| GET 분모 | 84 | 95 | 105 | 105 |
| 정상 | 79 | 문서 미집계 | 92 | 92 |
| 의도된 거절 | 인증 2, 호출값 누락 3 | 문서 미집계 | 13 | 13 |
| 발견한 HTTP 500 | 2, 당일 수정 | 2, 당일 수정 | 0 | 0 |
| 요청 실패 | 0 | 0 | 0 | 0 |

2026-08-28 문서 분모 84개와 당시 커밋의 실제 정적 분모 95개는 일치하지 않았다. 현재는 무시 규칙에 가려지는 `tenants` 경로도 포함하도록 `rg --no-ignore`와 파일시스템 재귀 탐색을 대조해 105개를 분모로 고정했다.

2026-08-28 당시 실제 정적 분모 뒤 추가된 GET은 10개다.

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

v6와 v7의 경로 집합, HTTP 상태, 분류는 모두 같다. v6 뒤 구현이 달라진 현재 작업 트리의 GET 5개도 전부 HTTP 200이었다.

| 변경 경로 | 변경 요지 | v7 관찰 |
|---|---|---:|
| `/api/higgsfield/transactions` | 거래 파서와 오류 경계 보강 | 200 |
| `/api/metrics` | 성과 잠금, freshness, 부분 실패, HTTP 상태 보강 | 200 |
| `/api/performance/learned-rules` | 학습 판단과 조회 경계 보강 | 200 |
| `/api/publish` | Instagram 발행 시도 상태 보존 | 200 |
| `/api/studio/learning` | 공유 작업 트리의 학습 정보 정제 변경 | 200 |

## 5. 실패 실행 배제와 근본 원인

최종 증거 전에 세 종류의 무효 실행을 배제했다.

1. 첫 두 실행은 진행 중 GET Route Handler가 변경돼 중단했다. 서로 다른 소스를 한 결과로 섞을 수 없기 때문이다.
2. 다음 실행은 시작 health가 30초 안에 응답하지 않았고 첫 요청 중 개발 서버가 재시작됐다. 첫 요청은 109초 뒤 연결 실패, 나머지 104개는 즉시 연결 실패해 전건 요청 실패로 끝났다. 이 JSON은 삭제하고 증거로 쓰지 않았다.
3. 빌더가 종료된 뒤 전용 개발 서버를 제한시간 안에 띄우고, health 200을 확인한 뒤 105개를 다시 호출했다. 최종 health도 200이었고 GET 소스 해시가 실행 전후 동일했다.

근본 원인은 제품 GET 105개의 공통 고장이 아니라 공유 개발 서버의 동시 재컴파일과 재시작이었다. 최종 단독 실사 로그에는 Turbopack 치명 로그가 없었다. 별도 E2E 개발 서버에서는 `/login` endpoint 작성 중 `Next.js package not found` 치명 로그가 반복됐으므로 개발 서버 로그 청정성은 NG로 유지한다.

## 6. 회귀와 동작 증거

| 검증 | 직접 관찰 결과 |
|---|---|
| API 전수 실호출 | GET 105개, 정상 92, 의도된 거절 13, HTTP 500과 요청 실패 0 |
| 전체 Vitest | 339파일 PASS, 2,194건 PASS, 조건부 3건 제외, 실패 0 |
| TypeScript | `npx tsc --noEmit`, 종료 코드 0 |
| Web production build | Next.js 16.2.2, 정적 페이지 184/184, 종료 코드 0 |
| build 경고 | 기존 NFT 동적 추적 경고 1건, build 성공과 분리해 잔존 기록 |
| seed | `apply-schema.sh --seed`, 멱등 스키마 적용, 고정 작업 공간 upsert, 확장 2개와 `osmu_service` 역할 확인 |
| production health | build 결과를 `next start`로 구동해 HTTP 200 관찰 |
| production E2E 인증 경계 | 개발용 작업 공간 토큰을 `TOKEN_INVALID` 401로 거절, 계약상 정상. 필수 E2E는 개발 서버에서 재실행 |
| 기본 흐름 | `verify-basic-flow-e2e.mjs`, 생성, 편집, 발행 큐, 성과 재인계 11/11 PASS |
| Studio v1 | `verify-studio-v1-e2e.mjs`, 인증 거절, 생성, 조회, 재생성 경합 14/14 PASS |
| 최종 개발 health | 두 E2E 뒤 HTTP 200 |
| 디자인 lint | `design-lint.sh dashboard/src`, 토큰 위반 0 |
| Mobile과 Maestro | 별도 모바일 제품이 없어 해당 없음 |
| 운영 배포와 외부 채널 실발행 | 미검증 |

전체 테스트 중간 실행은 동시 개발 중이던 자막 계약과 코드 모양에 결합된 발행실 검사에서 실패했다. 자막 빌더의 수정 뒤 자막 계약 15건이 통과했다. 발행실 검사는 `save` 호출이 한 줄이어야 한다는 비기능 조건을 제거하고, 카드 재합성 실패 방어가 저장과 발행실 이동보다 앞서는지만 검증하도록 수정했다. 집중 4건과 최종 전체 2,194건이 통과했고 수정 커밋은 `e56f660b`다.

## 7. 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98 | 발행 성과를 읽고 다음 생성 판단으로 되돌림 | API-READ-ALL-V7 | PASS | `/api/metrics`, `/api/engagement`, 제안과 학습 GET을 포함한 105개 실호출, 500과 요청 실패 0 |
| R104 | 고객, 운영자, 작업 공간 인증 경계 | API-AUTH-BOUNDARY-V7 | PASS | 인증된 경로는 handler 응답, 무토큰 격리 탐침은 401, production의 개발 토큰은 401 |
| R200, R207 | 성과 학습 규칙과 Studio 학습 정보 조회 | API-LEARNING-READ-V7 | PASS | `/api/performance/learned-rules`, `/api/studio/learning` 각각 HTTP 200 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 판정을 유지하고 이번 PASS에 포함하지 않음 |

전환 가능 TC는 `API-READ-ALL-V7`, `API-AUTH-BOUNDARY-V7`, `API-LEARNING-READ-V7`이다. 제품 전체 QA 승인과 배포 전환은 불가하다.

## 8. 제품 전체 판정

API 읽기 범위만 PASS다. `docs/design/captures/manifest.json`은 로컬 화면 9개 중 실제 production Supabase JWT, 운영자 캘린더, 픽셀 대조, 원격 배포를 미검증으로 남긴다. 기존 design-conformance-matrix도 승인 프로토타입 v63과 실제 화면의 공통 셸, 열 수, 요소 순서, 버튼 위계를 NG로 판정했다. 따라서 제품 전체 QA와 배포는 NG를 유지한다.

⛔ 검증실패 보고: 등급=상위 QA 품질 검증 FAIL. 사유=운영 또는 stage 배포 환경 접촉 증거가 0건이고 이번 과제는 localhost:3456으로 범위가 고정됐다. 출고여부=localhost API 읽기 범위 증거로만 출고하며 제품 전체 QA 승인과 배포 근거로는 출고하지 않는다.

페르소나 결정: 초보 1인 사업자는 현재 로컬 환경에서 읽기 API 500 때문에 생성, 편집, 발행 큐, 성과 재진입이 막히지 않는다. 외부 계정 연결부터 실제 공개와 성과 수집까지 완료된다는 증거는 없다.

## 9. 레드팀과 셀프심문

레드팀: 회의적인 운영자는 503 한 건과 반복된 Turbopack 치명 로그를 숨긴 PASS라고 공격할 수 있다. 503은 본문이 Threads OAuth 자격증명 부재를 명시한 계약상 준비 경계로 분리했고, Turbopack 오류는 API 정상 건수에 섞지 않고 개발 서버 로그 NG로 남겼다. 서버가 재시작된 전건 실패 실행도 삭제해 성공률 계산에 재사용하지 않았다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 공유 작업 트리가 실행 중 바뀌었거나, 4xx와 503을 근거 없이 정상 처리한 경우다. 그래서 GET 파일 내용의 합성 해시를 실행 전후 비교했고, 13개 비정상 상태의 응답 본문을 각각 읽었다. v6 JSON과 경로, 상태, 분류도 기계 대조해 추가, 삭제, 상태 변경이 0건임을 확인했다.

## 10. 벤치마크 적용

- Next.js Route Handlers 공식 문서의 `route.ts` 메서드 export를 검사 분모로 사용했다.
- RFC 9110의 상태 의미를 따라 호출자 입력과 인증 문제인 4xx를 서버 실패인 5xx와 분리했다.
- 회장 정본의 직접 관찰 원칙에 따라 mock이나 build 결과가 아니라 localhost 상태코드와 응답 본문을 최종 판정 근거로 썼다.

RUBRIC_SCORE: 재현성=5/5 범위완결=5/5 판정정확성=5/5 증거추적=5/5 정직성=5/5 total=25/25

WEAKEST_LINE: GET 전수 실사는 깨끗하게 통과했지만 별도 개발 E2E 서버의 Turbopack 치명 로그 원인은 이번 API 읽기 범위에서 고치지 않았다.

SKILLS_USED: qa, API 전수 실호출, 실패 재현 분리, 전체 회귀, build, seed, E2E, 증거 기록 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: OSMU 사업 좌표, 끝내기 우선, 직접 검증, 초보 1인 사업자, HTTP 상태 의미, Next.js Route Handler 분모
HITS_USED: BRAIN의 OSMU 사업 좌표와 끝내기 우선 원칙을 사용해 생성, 발행, 성과 읽기를 핵심 경로로 고정하고, 공식 Next.js 및 RFC 문서로 분모와 상태 판정을 고정했다.
HITS_REJECTED: 일반 마케팅 심리와 다른 벤처 자료는 API 상태 판정 근거가 아니어서 제외했다.
CONFLICTS: 외부 HTTP 기준과 회장 정본 사이 충돌 없음. 사용자 과제의 v63 프로토타입과 canonical pipeline의 v68 승인 핀은 충돌하므로 제품 전체 QA를 NG로 유지했다.

SOURCES: `CLAUDE.md` | `dashboard/CLAUDE.md` | `pipeline-state.osmu.md` | `docs/구현현황.md` | `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md` | `docs/plan/persona.md` | `docs/design/README.md` | `docs/design/ui-architecture.md` | `docs/design/screen-inventory.md` | `docs/design/user-flow.md` | `docs/design/captures/manifest.json` | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/거버넌스/요청.md` | `wiki/거버넌스/결정.md` | `wiki/거버넌스/실수.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `docs/_archive/legacy-20260912/audit/openclaw-api-live-sweep-2026-08-28.md` | `docs/qa/osmu-api-read-sweep-v6-gpt-codex-20260913-0600.md` | `logs/diff/osmu-api-read-sweep-20260914-final-v2.json` | https://nextjs.org/docs/app/getting-started/route-handlers | https://www.rfc-editor.org/rfc/rfc9110.html

MODEL: gpt-codex/gpt-5.6-sol / qa-verifier
