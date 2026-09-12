# OSMU API 읽기 경로 전수 재실사 v6

한 줄 결론: localhost:3456의 GET 105개와 HEAD 1개를 실제 호출한 결과 정상 92개, 의도된 거절 13개, HTTP 500과 요청 실패 0개였다. 제품 API 결함은 없었고, 개발 서버의 콜드 컴파일을 제품 장애로 오판하던 실사 도구의 제한시간을 고쳤다.

STAMP | line: osmu | 생성: 2026-09-13 06:00 KST | model: gpt-codex/gpt-5.6-sol | agent: qa-verifier | skill: qa | 근거: live HTTP, 전체 회귀, build, seed, E2E, 2026-08-28 및 v5 실사 대조 | 고민: 설정 부재와 없는 자원은 계약상 거절로 분리하고, 설명 없는 5xx와 요청 실패만 고장으로 잡았다.

## 범위와 판정 기준

- 대상: `dashboard/src/app/api/**/route.ts`에서 GET을 내보내는 105개 경로와 명시적 HEAD 1개.
- 환경: `http://127.0.0.1:3456`, `dashboard/.env.local`, 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`.
- 최종 원본: `logs/diff/osmu-api-read-sweep-20260913-0537.json`.
- 최종 실행: commit `f2d3b3e2`, 요청 제한시간 120초, 2026-09-13 05:50 KST 관찰 완료.
- API 소스 합성 SHA-256: `01b693904709418393dd64b94999659920a890d149c3599f321d362e8601bdd7`. 실행 전후 동일했다.
- 판정: 2xx와 3xx는 정상이다. 입력 오류, 인증 경계, 없는 자원, 설정 부재를 설명하는 4xx와 503은 의도된 거절이다. HTTP 500, 설명되지 않은 5xx, 요청 실패는 고장이다.

## 현재 결과

| 구분 | 수 | 판정 |
|---|---:|---|
| GET 정상 | 92 | PASS |
| GET 의도된 거절 | 13 | PASS |
| HTTP 500 | 0 | PASS |
| 요청 실패 | 0 | PASS |
| HEAD 없는 미디어 토큰 | 1 | HTTP 404, 의도된 거절 |

### 의도된 거절 13개

| 경로 | HTTP | 관찰한 계약상 이유 |
|---|---:|---|
| `/api/card-slides/<없는 UUID>` | 400 | 잘못된 묶음 번호 |
| `/api/connect/threads` | 503 | Threads OAuth 앱 자격증명 미설정 |
| `/api/engagement` | 404 | 지정 작업 공간의 발행 글 없음 |
| `/api/figma-mcp/callback` | 400 | OAuth 상태 불일치 |
| `/api/higgsfield/asset/<없는 파일>` | 404 | 자산 없음 |
| `/api/images/deliver/<없는 토큰>` | 404 | 전달 토큰 없음 |
| `/api/isolation-proof` | 401 | 테넌트 토큰 없음 |
| `/api/media/<없는 토큰>` | 404 | 미디어 토큰 없음 |
| `/api/studio/v1/derivations/<없는 UUID>` | 404 | 파생 작업 없음 |
| `/api/studio/v1/generations/<없는 UUID>` | 404 | 생성 작업 없음 |
| `/api/studio/v1/shorts-factory/runs/<없는 UUID>` | 404 | 숏폼 공장 실행 없음 |
| `/api/tiktok/creator-info` | 400 | 테넌트 확인 불가 |
| `/api/tiktok/publish-status` | 400 | 테넌트 확인 불가 |

## 실사 도구 결함과 수정

첫 실행은 15초 고정 제한시간 때문에 정상 79, 의도된 거절 13, 요청 실패 13이었다. 60초로 다시 실행하자 정상 90, 의도된 거절 13, 요청 실패 2였고, 실패 경로는 `/api/notification-settings`와 `/api/nsa-data`였다. 같은 서버에서 두 경로를 단독 호출하면 각각 HTTP 200, 본문 SHA-256 `98f702f2...`와 `447174b5...`였다.

서버 로그에서 각 경로의 Next.js 최초 컴파일이 순차로 발생했고, 최종 120초 실행에서는 두 경로가 각각 5.855초와 6.755초에 HTTP 200을 반환했다. 제품 결함이 아니라 공유 개발 서버의 콜드 컴파일과 실사 도구의 고정 제한시간이 만든 거짓 실패였다.

수정은 `API_SWEEP_TIMEOUT_MS` 환경 변수와 JSON의 `request_timeout_ms` 증거 필드를 추가하고 기본값을 120초로 올린 것이다. 잘못된 값은 시작 전에 거절한다. 회귀 테스트 `api-read-sweep-timeout.regression-1.test.ts`가 기본값, 사용자 지정값, 증거 필드를 고정한다. 관련 커밋은 `b25005aa`, `f2d3b3e2`다.

| 실행 | 제한시간 | 정상 | 의도된 거절 | 요청 실패 | 판정 |
|---|---:|---:|---:|---:|---|
| 05:17 KST | 15초 | 79 | 13 | 13 | NG, 원인 분리 전 |
| 05:35 KST | 60초 | 90 | 13 | 2 | NG, 두 경로 단독 재확인 |
| 05:50 KST | 120초 | 92 | 13 | 0 | PASS |

## 지난 실사와 달라진 곳

| 기준 | 2026-08-28 문서 | 당시 실제 정적 분모 | 2026-09-13 v5 | 현재 v6 |
|---|---:|---:|---:|---:|
| GET 분모 | 84 | 95 | 105 | 105 |
| 정상 | 79 | 문서 미집계 | 92 | 92 |
| 의도된 거절 | 인증 2, 호출값 누락 3 | 문서 미집계 | 13 | 13 |
| 발견한 500 | 2, 당일 수정 | 2, 당일 수정 | 0 | 0 |
| 요청 실패 | 0 | 0 | 0 | 0 |

2026-08-28 뒤 추가된 읽기 경로는 10개다. 먼저 `/api/engagement`, `/api/operator/incidents`, `/api/studio/v1/shorts-factory/runs`, `/api/studio/v1/shorts-factory/runs/[runId]`가 추가됐다. 이후 `/api/performance/learned-rules`, `/api/studio/generation-history`, `/api/studio/learning`, `/api/studio/v1/derivations/[batchId]`, `/api/studio/v1/generations/[jobId]/derivations`, `/api/threads/low-engagement-candidates`가 추가됐다.

v5와 v6의 경로 집합, HTTP 상태, 정상과 거절 건수는 같다. 분류 문자열만 `의도된 거절`에서 검토 전 원문인 `의도된 거절 후보`로 남아 있었고, 응답 본문을 확인해 최종 판정에서 의도된 거절로 확정했다.

v5 증거 기준 이후 구현이 달라진 GET 4개는 모두 현재 소스로 HTTP 200이었다.

| 변경 경로 | 변경 요지 | 현재 관찰 |
|---|---|---|
| `/api/higgsfield/transactions` | 거래 JSON 파서를 공용 함수로 분리 | 200 |
| `/api/metrics` | TikTok 성과 수집 지원 보강 | 200 |
| `/api/performance/learned-rules` | 학습 규칙 조회와 판단 보강 | 200 |
| `/api/studio/learning` | 학습 정보 정제 함수를 공용 함수로 분리 | 200 |

## 회귀와 동작 증거

| 검증 | 관찰 결과 |
|---|---|
| 집중 회귀 | 4파일, 31건 PASS |
| 전체 Vitest | 311파일, 2,077건 PASS, 3건 스킵, 실패 0 |
| TypeScript | `npx tsc --noEmit`, 오류 0 |
| Web build | Next.js 16.2.2, 정적 페이지 182/182, exit 0. 기존 NFT 추적 경고 1건 |
| seed | `apply-schema.sh --seed`, 멱등 적용과 작업 공간 upsert PASS |
| health | 시드 직후 1회 HTTP 503과 DB down, 이어서 3회 연속 HTTP 200과 DB up. 최종 DB 확인 4ms |
| 기본 흐름 | `verify-basic-flow-e2e.mjs`, 11/11 PASS |
| Studio v1 | `verify-studio-v1-e2e.mjs`, 14/14 PASS |
| 디자인 lint | `design-lint.sh dashboard/src`, 위반 0 |
| Mobile과 Maestro | 별도 모바일 제품이 없어 해당 없음 |
| 운영 배포 | 하지 않음 |

시드 직후 health 503은 후속 세 번에서 재현되지 않았고 기본 흐름과 Studio v1도 모두 통과했다. 단발성 관찰을 숨기지 않되 지속 장애로 단정하지 않는다. 다음 동일 현상이 반복되면 DB 연결 풀과 시드 직후 연결 회수 구간을 별도 추적한다.

## 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98 | 발행 성과를 측정하고 다음 생성 판단으로 되돌림 | API-READ-ALL | PASS | metrics를 포함한 GET 105개 전수 실호출, HTTP 500과 요청 실패 0 |
| R104 | 고객, 운영자, 작업 공간 인증 경계 | API-AUTH-BOUNDARY | PASS | 올바른 토큰은 handler 도달, 격리 탐침 무토큰은 401 |
| R200, R207 | 성과 학습 규칙과 Studio 학습 정보 조회 | API-LEARNING-READ | PASS | 변경된 `/api/performance/learned-rules`, `/api/studio/learning` 각각 200 |
| R01~R207 | 이번 API 읽기 범위 밖 확정 요구 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 누락으로 PASS 처리하지 않음 |

전환 가능 TC는 API-READ-ALL, API-AUTH-BOUNDARY, API-LEARNING-READ다. 제품 전체 QA 단계 승인과 배포 전환은 불가하다.

## 제품 전체 판정

API 읽기 범위는 PASS다. 승인 프로토타입 v63과 pipeline 핀 v68이 충돌하고, 기존 디자인 정합 행렬의 공통 셸, 열 수, 담당 패널, 요소 순서, 버튼 위계가 NG다. 실제 외부 OAuth, 채널 발행, 운영 배포도 미검증이다. 따라서 제품 전체 QA와 배포는 NG를 유지한다.

상위 QA 품질 검증은 배포 환경 접촉 증거가 0건이라 FAIL을 반환했다. 이번 과제는 localhost:3456 실사로 명시됐으므로 범위를 임의로 운영 환경까지 넓히지 않았다. 로컬 API 읽기 PASS를 운영 QA PASS로 확장하지 않는다.

페르소나 결정: 초보 1인 사업자 박도윤은 현재 로컬 환경에서 API 읽기 실패로 생성, 편집, 발행 큐, 성과 재진입이 막히지 않는다. 외부 계정 연결부터 실제 공개와 성과 수집까지 완료할 수 있다는 증거는 없다.

## 레드팀과 셀프심문

레드팀: 제한시간을 늘리기만 하면 실제 지연 결함을 숨길 수 있다. 그래서 실패한 두 경로를 단독 호출해 200과 본문 해시를 관찰하고, 최종 전수 실행에서 두 경로를 포함한 105개가 모두 응답하는지 다시 확인했다. 4xx와 503도 응답 사유를 읽지 않은 채 정상으로 뭉개지 않았다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 공유 작업 트리가 전수 실행 중 바뀌어 검사 소스와 최종 소스가 달라진 경우다. API 합성 해시를 실행 전후 비교해 동일함을 확인했고, v5 뒤 구현이 바뀐 GET 4개도 최종 원본에서 전부 200임을 확인했다. localhost 결과를 운영 성공으로 확장하지 않았다.

## 벤치마크 적용

- Next.js Route Handlers 공식 문서의 메서드 export를 검사 분모로 사용했다.
- RFC 9110의 의미에 따라 호출자 오류인 4xx와 서버 실패인 5xx를 분리했다.
- 회장 정본의 직접 관찰 원칙을 적용해 테스트와 mock이 아닌 localhost 응답 코드와 본문 해시를 원본으로 남겼다.

RUBRIC_SCORE: 재현성=5/5 범위완결=5/5 판정정확성=5/5 증거추적=5/5 정직성=5/5 total=25/25

WEAKEST_LINE: 시드 직후 health 503은 재현되지 않아 원인이 확정되지 않았으며, 반복 시 별도 결함으로 다시 열어야 한다.

SKILLS_USED: qa, 전수 API 실호출, 회귀, E2E, 증거 기록 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: OSMU + 끝내기 우선 + 직접 검증 + 초보 1인 사업자
HITS_USED: BRAIN의 OSMU 사업 좌표와 끝내기 우선 원칙을 사용해 생성, 발행, 성과 읽기와 직접 관찰을 검증 축으로 고정했다.
HITS_REJECTED: 일반 마케팅 심리와 다른 벤처 자료는 API 상태 판정 근거가 아니어서 제외했다.
CONFLICTS: 외부 HTTP 기준과 회장 정본 사이 충돌 없음. 승인 프로토타입 v63과 pipeline의 디자인 핀 v68은 충돌하므로 제품 전체 QA를 NG로 유지했다.

SOURCES: `CLAUDE.md` | `dashboard/CLAUDE.md` | `pipeline-state.osmu.md` | `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md` | `docs/plan/one-thing.md` | `docs/plan/persona.md` | `docs/design/README.md` | `docs/design/captures/manifest.json` | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `docs/_archive/legacy-20260912/audit/openclaw-api-live-sweep-2026-08-28.md` | `docs/qa/osmu-api-read-sweep-v5-gpt-codex-20260913-0248.md` | `logs/diff/osmu-api-read-sweep-20260913-0537.json` | https://nextjs.org/docs/app/getting-started/route-handlers | https://www.rfc-editor.org/rfc/rfc9110.html

MODEL: gpt-codex/gpt-5.6-sol / qa-verifier
