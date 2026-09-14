# OSMU 읽기 API 전수 재실사 v4

한 줄 결론: `localhost:3456`의 빌드 서버에서 GET 읽기 경로 105개와 별도 HEAD 1개를 실제 호출했다. GET은 정상 92개, 계약상 거절 13개, HTTP 500과 요청 실패 0개였다. 발견한 파생 작업 조회 500은 수정하고 회귀 테스트를 추가했다. 읽기 API 범위는 PASS지만 전체 Vitest 4건 실패 때문에 제품 전체 QA는 NG다.

STAMP | line: osmu-api-read-sweep | 생성: 2026-09-12 22:14 KST | model: gpt-codex/gpt-5 | agent: qa-verifier | skill: qa | 근거: localhost 실제 요청, 전후 JSON, 전체 회귀 | 고민: 개발 서버 최초 컴파일 타임아웃과 제품 응답 실패를 서로 다른 실행으로 분리했다.

## 실사 조건

- 대상: `dashboard/src/app/api/**/route.ts`에서 GET을 export하는 105개 파일. 명시적 HEAD는 `/api/media/[token]` 1개다.
- 앱: `http://127.0.0.1:3456`, 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`.
- 최종 실사 커밋: `fdaa82e1f04dafbd36168d9ba471c607df56737e`.
- API 소스 해시: 실사 전후 모두 `d888c583be5d28f9a1f9e7ab85d0a942469cbf124596a7c96a76260945d0aed9`.
- 자격증명: `dashboard/.env.local`의 운영자 토큰과 Studio 개발 토큰을 경로별로 사용했다. 결과 파일에서 토큰 원문 0건을 확인했다.
- 원본 증거: `logs/diff/osmu-api-read-sweep-20260912-before.json`, `logs/diff/osmu-api-read-sweep-20260912-after.json`.
- 개발 서버 컴파일 노이즈: `after-cold-dev.json`, `after-dev-timeout.json`에 보존했다. 두 실행의 요청 실패는 Next 개발 서버가 경로별 최초 컴파일에 15초를 넘긴 결과다. 같은 소스를 production build로 구동한 최종 실행은 요청 실패 0개다.

## 기반 입력과 경로 정합

- 회장 지정 v63 프로토타입 `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`의 네 방 계약을 확인했다.
- 현재 `pipeline-state.osmu.md`의 최신 승인 핀은 v68 허브이고, 과거 승인 블록은 v64다. v63은 이번 요청의 비교 기반으로만 사용했다. 이 작업은 API 경계 수정이므로 화면 정합 판정은 새로 올리지 않았다.
- 회장 요구 대장 지정 파일은 현재 정본 `wiki/거버넌스/요청.md`를 가리키는 보관 포인터다.
- 지정된 `wiki/product/사업좌표-OSMU와-ZERO-ONE.md`는 존재하지 않는다. 이동된 실제 파일 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`를 읽었다.
- `docs/design/README.md`, `ui-architecture.md`, `screen-inventory.md`, `user-flow.md`, `captures/manifest.json`을 확인했다. 원격 배포 버전과 승인 시안 픽셀 정합은 여전히 미검증이다.

## 전후 판정

| 판정 | 수정 전 개발 서버 | 수정 후 빌드 서버 | 판단 |
|---|---:|---:|---|
| 정상 | 91 | 92 | 실제 2xx와 3xx |
| 계약상 거절 | 11 | 13 | 400, 401, 404, 503의 응답 의미 확인 |
| HTTP 500 | 1 | 0 | 파생 작업 조회 수리 |
| 요청 실패 | 2 | 0 | 개발 최초 컴파일 시간과 제품 응답을 분리 |
| 합계 | 105 | 105 | 분모 동일 |

명시적 HEAD `/api/media/[token]`은 없는 토큰에서 HTTP 404였다. redirect는 정상으로 세지 않았고 최종 실행에는 3xx가 없었다.

## 발견한 고장과 수정

| 고장 | 근본 원인 | 수정 | 회귀 증거 |
|---|---|---|---|
| `/api/studio/v1/derivations/00000000` HTTP 500 | 동적 `batchId`를 UUID 검증 없이 PostgreSQL에 전달 | GET과 DELETE 입구에서 잘못된 UUID를 400 `INVALID_RESOURCE_ID`로 거절 | `derivation-route-invalid-id.regression-1.test.ts` GET·DELETE 2건 PASS, localhost 400 관찰 |
| 유효 UUID 조회도 HTTP 500 | `20260830_010_studio_derivations.sql`이 실행 manifest에서 누락되어 로컬 DB에 테이블이 없었음 | migration을 manifest에 등록하고 모든 migration SQL의 등록 완전성 계약 추가 | manifest·runner 30건 PASS, 로컬 migration 적용 뒤 없는 UUID 404 관찰 |

코드 커밋은 `87c3014b`, `fdaa82e1`이다. 마이그레이션 적용 뒤 `studio_derivation_batches` 15개 열과 tenant 정책 1개를 직접 확인했다.

## 계약상 거절 13개

| 경로 | 상태 | 근거 |
|---|---:|---|
| `/api/card-slides/[batchId]` | 400 | 없는 카드 묶음 식별자 |
| `/api/connect/threads` | 503 | Threads OAuth 앱 자격증명 미설정 |
| `/api/engagement` | 404 | 작업 공간에 발행 글 없음 |
| `/api/figma-mcp/callback` | 400 | OAuth 상태 불일치 |
| `/api/higgsfield/asset/[file]` | 404 | 파일 없음 |
| `/api/images/deliver/[token]` | 404 | 전달 토큰 없음 |
| `/api/isolation-proof` | 401 | tenant 증명이 없는 격리 탐침 |
| `/api/media/[token]` | 404 | 미디어 토큰 없음 |
| Studio v1 읽기 3개 | 401 | production이 개발용 Studio bearer를 거절 |
| TikTok 읽기 2개 | 400 | tenant 고객 토큰 미제공 |

Studio v1 세 경로는 개발 서버에서 올바른 개발 토큰으로 다시 호출했다. 파생 작업 404, 생성 작업 파생 목록 200, 생성 작업 404였다. 숏폼 실행 상세도 404였고 목록은 workspace 누락 시 422, 전수 실사 쿼리에서는 200이었다. 어느 경로도 500이 아니었다.

## 지난 실사 대비

| 비교 항목 | 2026-08-28 문서 | 2026-08-29 v3 | 이번 v4 | 변화 |
|---|---:|---:|---:|---|
| 문서 보고 GET 수 | 84 | 99 | 105 | 최초 문서 대비 +21, 직전 전수표 대비 +6 |
| 당시 실제 정적 GET 수 | 95 | 99 | 105 | 실제 분모 기준 +10, 직전 대비 +6 |
| 정상 | 79 | 89 | 92 | 직전 대비 +3 |
| 계약상 거절 | 2로 보고 | 10 | 13 | 인증과 없는 자원 경계를 분리 |
| HTTP 500 | 수정 전 2 | 0 | 수정 후 0 | 이번에 새 500 1건 발견 후 제거 |
| 요청 실패 | 미기록 | 0 | 0 | 빌드 서버 최종 실행 기준 |

| v3 이후 새 경로 | 이번 상태 | 판단 |
|---|---:|---|
| `/api/performance/learned-rules` | 200 | 정상 |
| `/api/studio/generation-history` | 200 | 정상 |
| `/api/studio/learning` | 200 | 정상 |
| `/api/studio/v1/derivations/[batchId]` | 개발 404, production 401 | 없는 자원과 인증 경계 정상 |
| `/api/studio/v1/generations/[jobId]/derivations` | 개발 200, production 401 | 정상 |
| `/api/threads/low-engagement-candidates` | 200 | 정상 |

삭제된 읽기 경로는 0개다. 8월 28일 문서는 84행만 보고해 당시 95개 전건의 경로별 표가 없으므로, 정확한 경로 집합 대조는 전건 99행을 보존한 v3를 사용했다.

## 회귀와 단계 판정

| 검증 | 판정 | 직접 증거 |
|---|---|---|
| production build | PASS | Next 16.2.2, 정적 페이지 182/182, 기존 NFT 추적 경고 1건 |
| TypeScript | PASS | `npx tsc --noEmit`, exit 0 |
| 신규 회귀 | PASS | 파생 ID 2건, migration manifest 1건, 기존 migration runner 27건. 총 30건 PASS |
| health curl | PASS | 개발·빌드 서버 모두 HTTP 200, DB `up` |
| seed | PASS | 멱등 seed 적용, 지정 작업 공간 `active` 재조회 |
| 읽기 API | PASS | GET 105개와 HEAD 1개 실제 요청. 500과 요청 실패 0 |
| 기본 흐름 E2E | PASS | `verify-basic-flow-e2e.mjs` 11/11 |
| Studio v1 E2E | PASS | `verify-studio-v1-e2e.mjs` 14/14 |
| design lint | PASS | `dashboard/src` 위반 0 |
| 전체 Vitest | NG | 297파일 중 294 PASS, 3 FAIL. 2,000건 중 1,993 PASS, 4 FAIL, 3 skip |
| mobile와 Maestro | 해당 없음 | 별도 모바일 앱 없음 |
| 디자인 정합 | NG 유지 | 이번 변경은 API와 DB 경계다. 승인 시안 matched pair를 재판정하지 않음 |

전체 Vitest 실패 4건은 이번 수정 파일 밖이다. `HomeDesignSystemIntegration` 2건은 진행 중인 성과실 자동 제안 변경과 기존 테스트가 불일치한다. `four-room-probe-readiness` 1건은 새 검증 계약과 현재 스크립트의 순서가 불일치한다. `ui-token-audit` 1건은 진행 중 UI 소스에서 직접 시각값 13건을 찾았다. 세 파일 집중 재실행에서도 4건이 다시 실패했다. 다른 세션의 미커밋 변경을 되돌리거나 범위를 넘겨 수정하지 않았으므로 전체 QA PASS는 선언하지 않는다.

## 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R128, R150, R151, R165, R171, R175 | 채널과 인증 경계를 실제 계약대로 보존 | API-READ-V4-01 | 범위 PASS | 연결 준비 503, TikTok tenant 경계 400, HTTP 500 0 |
| R207 | 성과와 학습 읽기 경로 제공 | API-READ-V4-02 | 범위 PASS | metrics, learned-rules, generation-history, learning 모두 200 |
| R01~R207 | 회장 확정 요구 전건 | REQ-ALL | 이월 | 이번 읽기 API 범위 밖의 기존 판정은 변경하지 않음 |
| 이번 요청 | GET 읽기 경로 전수 요청, 500 수리, 전회 대비 | API-READ-20260912-01~03 | API PASS, 전체 QA NG | 전후 JSON, 두 수정 커밋, 회귀 30건 |

## 페르소나 결정

질문: 김민서가 잘못된 요청, 없는 자원, 인증 경계, 서버 고장을 구분할 수 있는가?

답: 읽기 API 범위에서는 그렇다. 잘못된 파생 번호는 400, 형식은 맞지만 없는 파생 작업은 404, production 개발 토큰은 401, 구성되지 않은 Threads 연결은 503으로 나뉘며 설명되지 않은 500은 0개다. 전체 제품 회귀 4건이 남아 있어 제품 전체가 완전히 잘된다고 판정할 수는 없다.

## 레드팀과 셀프심문

레드팀 공격: 개발 서버에서 타임아웃이 많았는데 빌드 서버 성공만 택하면 불리한 증거를 버린 것이다. 반박과 수정: 개발 실행 세 개를 모두 보존했고, 최초 500은 개발 서버에서 수리 전후 500, 400, 404로 직접 대조했다. 최종 분모 판정만 경로 컴파일이 없는 build 결과로 분리했다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 production의 개발 토큰 거절 때문에 Studio 서비스 본문을 못 읽은 것이다. 그래서 동일 경로를 복원한 개발 서버와 올바른 토큰으로 별도 재호출했고 200, 404, 422 경계를 확인했다. 실제 원격 배포와 실고객 JWT는 이번 범위에서 미검증이다.

RUBRIC_SCORE: hook=5/5 detail=5/5 rhythm=4/5 voice=5/5 slop=5/5 total=24/25
WEAKEST_LINE: 8월 28일 문서의 누락 때문에 최초 실사와의 경로별 완전 대조는 불가능하고 v3 전건표를 보조 기준으로 썼다.

SKILLS_USED: qa. 실제 요청, 오류 분류, 회귀 테스트, 전체 검증, 증거 기록에 사용. / SKILLS_SKIPPED: 없음.

SOURCES: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `pipeline-state.osmu.md` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/거버넌스/요청.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `docs/_archive/legacy-20260912/audit/openclaw-api-live-sweep-2026-08-28.md` | `docs/_archive/legacy-20260912/audit/osmu-api-read-sweep-v3-gpt-codex-20260829-0915.md` | [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) | [Next.js Dynamic Segments](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes) | [RFC 9110 HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html) | [Playwright API testing](https://playwright.dev/docs/api-testing)

MODEL: gpt-codex/gpt-5 / qa-verifier

KNOWLEDGE_QUERY: BRAIN business 허브에서 OSMU, ZERO-ONE 실행과 직접 증거 원칙을 검색했다.
HITS_USED: `wiki/business/index.md`의 마무리와 직접 검증 원칙, 레포 사업 좌표의 OSMU 제품 역할을 채택했다.
HITS_REJECTED: 일반 마케팅과 교육 콘텐츠는 HTTP 읽기 계약 판정에 직접 관련이 없어 쓰지 않았다.
CONFLICTS: 벤치마크와 회장 정본의 충돌은 없다. 지정 사업 좌표 경로는 실제로 이동돼 있었다.
