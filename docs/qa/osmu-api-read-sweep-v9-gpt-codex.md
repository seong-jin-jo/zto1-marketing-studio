# OSMU API 읽기 경로 전수 재실사 v9

한 줄 결론: 현재 localhost 개발 앱의 GET Route Handler 105개를 기본 검사 설정으로 전부 실호출한 결과는 정상 92개, 계약상 거절 13개, HTTP 500과 요청 실패 0개다. 개발 서버 콜드 컴파일을 네 개씩 시작해 전수 검사를 멈추게 하던 검사기 기본 동시성은 1로 고치고 회귀 테스트로 고정했다.

STAMP | line: osmu-api-sweep091413 | 생성: 2026-09-14 14:00 KST | model: gpt-codex/gpt-5 | agent: qa-verifier | skill: qa | 근거: localhost HTTP 원본, 전체 Vitest, TypeScript, production build, seed, 기본 흐름과 Studio v1 E2E, 2026-08-28 및 v8 실사 | 고민: 제품 응답 고장과 Next 개발 서버의 콜드 컴파일 정체를 분리하고, 두 현상을 모두 원본으로 남겼다.

## 1. 범위와 입력

- 대상: `dashboard/src/app/api/**/route.ts` 중 `GET`을 내보내는 105개 경로.
- 환경: `http://localhost:3456`, `dashboard/.env.local`, 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`.
- 최종 원본: `logs/diff/osmu-api-read-sweep-20260914-1313-final.json`.
- 최종 관찰: 2026-09-14 13:50:09 KST, HEAD `d5a612cc60dc164ac9b19d8efc53349145b1405c`, 기본 동시성 1.
- 판정: 2xx와 3xx는 정상이다. 입력 오류, 없는 자원, 인증 경계, 외부 설정 부재를 구체적으로 설명하는 4xx와 503은 의도된 거절이다. 일반 500, 설명되지 않은 5xx, 요청 실패와 전체 시간 초과는 고장이다.
- 경로 정리: 요청의 `wiki/product/사업좌표-OSMU와-ZERO-ONE.md`는 이동돼 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`를 읽었다. `docs/test-plan.md`와 `docs/ONE_THING.md`는 없다. 기존 FDD 테스트 계획, `docs/plan/one-thing.md`, 페르소나 문서를 대체 입력으로 읽었으며 canonical 문서 부재는 제품 전체 QA의 문서 갭으로 남긴다.
- 디자인 기준: 사용자 지정 v63과 dev 발행실의 1440 PNG를 이번 턴에 원본 크기로 각각 열어 대조했다. pipeline의 최신 승인 핀은 v68이어서 기준 충돌도 남아 있다. 이번 변경은 검사기와 회귀 테스트뿐이고 화면을 바꾸지 않았다.

| 1440 발행실 배치 축 | v63 시안 | dev 실화면 | 판정 |
|---|---|---|---|
| 주축과 공통 셸 | OpenClaw 브랜드 헤더, 왼쪽 세로 네 방, 중앙 미리보기, 오른쪽 담당 | 로컬 검증 작업 공간 헤더, 왼쪽 세로 네 방과 채널군, 상단 가로 네 방, 중앙 카드, 오른쪽 담당 | NG |
| 요소 순서 | 연결 안내, 작업물 행동, 세 플랫폼 미리보기 | 온보딩 진행, 연결 경고, 학습 기준, 선택 요약, 행동, 플랫폼 카드 | NG |
| 열 수 | 중앙 플랫폼 미리보기 세 열 | 중앙 본문 한 열 아래 플랫폼 카드 세 열 | NG |
| 정렬과 여백 | 좁은 상단 전역 헤더와 압축된 작업물 카드 | 큰 상태 띠와 다단 안내 카드가 세로 공간을 선점 | NG |
| 표시와 숨김 | 작업물 3곳 선택과 발행 행동 표시 | 작업물 0곳, 연결 계정 0곳, 학습 정보와 첫 콘텐츠 행동 표시 | 상태가 달라 직접 일치 판정 불가 |
| 글꼴 단계 | 브랜드와 작업물 중심의 굵은 단계 | 운영 안내와 상태 숫자 중심의 굵은 단계 | NG |
| 단추 위계 | 지금 발행이 주 행동 | 첫 콘텐츠 만들기와 채널 연결이 주 행동 | 상태 차이로 일치 판정 불가 |

시안 원본은 `docs/design/captures/osmu-four-room-prototype-v63-20260912/1440-light-publish.png`, dev 원본은 `docs/design/captures/live-20260912/authenticated-fe3/studio-publish-1440.png`다. 시각 비교는 1440 한 폭만 이번 턴에 직접 확인했다. 다른 폭은 새 직접 관찰이 없으므로 미검증이다. 이 증거로 디자인 PASS를 주장하지 않는다.

## 2. 최종 관찰 결과

| 구분 | 수 | 판정 |
|---|---:|---|
| GET 정상 | 92 | PASS |
| GET 의도된 거절 | 13 | PASS |
| HTTP 500 | 0 | PASS |
| 설명되지 않은 5xx | 0 | PASS |
| 요청 실패 또는 전체 시간 초과 | 0 | PASS |

마지막 개발 health는 HTTP 200, `db=up`이었다. 최종 원본과 직전 v8 원본을 경로, 상태, 분류로 기계 대조한 결과 추가 0개, 삭제 0개, 변경 0개다.

## 3. 의도된 거절 13개

| 경로 | HTTP | 응답 본문에서 확인한 이유 |
|---|---:|---|
| `/api/card-slides/<없는 UUID>` | 400 | 카드 묶음 번호 형식 오류 |
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

`/api/connect/threads`의 503은 설정 부재를 명시한 준비 상태 경계다. 나머지 12개도 각 본문이 입력, 없는 자원 또는 인증 경계를 설명했다. 일반 401 안내 문구는 노출되지 않았다.

## 4. 최초 실패와 수정

기존 개발 서버에 기본 동시성 4로 보낸 첫 실호출 원본은 정상 58개, 계약상 거절 8개, 요청 실패 4개, 전체 시간 초과 35개였다. `/api/publish`, `/api/publish/first-comment-capabilities`, `/api/queue`, `/api/r2-config` 요청이 제한시간에 걸렸고 이후 경로는 전체 예산이 끝나 실행되지 않았다. 같은 시각 개발 서버는 콜드 Route Handler를 컴파일하면서 CPU를 계속 사용했고 health도 제한시간 안에 응답하지 못했다. 제품 HTTP 500 응답은 없었다.

같은 빌드를 `next start`로 실행하자 동시성 4에서도 105개 전부가 약 4초 안에 정상 또는 계약상 거절로 끝났다. 새 `next dev --webpack` 서버에서 순차 실행하자 콜드 컴파일을 포함해 105개 전부 끝났다. 따라서 고장은 Route Handler가 아니라 개발 서버 콜드 컴파일을 동시에 네 개씩 시작한 검사기 기본값이다.

| 변경 | 결과 |
|---|---|
| `dashboard/scripts/verify-api-read-sweep.mjs` | 기본 동시성을 4에서 1로 변경. production이나 예열 환경은 명시 환경 변수로 1부터 12까지 선택 가능 |
| `dashboard/tests/api/api-read-sweep-dev-concurrency.regression-1.test.ts` | 기본값 1과 제한된 명시 override 계약 고정 |
| 수정 커밋 | `d5a612cc fix(qa): API-READ-20260914-1313-02 cold route compile concurrency` |
| 수정 뒤 기본값 전수 실호출 | 정상 92, 계약상 거절 13, HTTP 500과 요청 실패 0 |

구현 위치는 `dashboard/scripts/verify-api-read-sweep.mjs:20`부터 `dashboard/scripts/verify-api-read-sweep.mjs:35`, 회귀 위치는 `dashboard/tests/api/api-read-sweep-dev-concurrency.regression-1.test.ts:5`부터 `dashboard/tests/api/api-read-sweep-dev-concurrency.regression-1.test.ts:17`이다. 화면 코드는 바꾸지 않았고 새 화면 캡처는 만들지 않았다. 디자인 판정은 같은 날 v7의 원본 PNG 대조 NG를 그대로 유지한다.

## 5. 지난 실사와 달라진 곳

| 기준 | 2026-08-28 문서 | 당시 실제 정적 분모 | 2026-09-14 v8 | 현재 v9 |
|---|---:|---:|---:|---:|
| GET 분모 | 84 | 95 | 105 | 105 |
| 정상 | 79 | 문서 미집계 | 92 | 92 |
| 의도된 거절 | 인증 2, 호출값 누락 3 | 문서 미집계 | 13 | 13 |
| 실사 중 발견한 HTTP 500 | 2, 당일 수정 | 2, 당일 수정 | 1, 수정 뒤 0 | 0 |
| 최종 요청 실패 | 0 | 0 | 0 | 0 |

2026-08-28 문서의 84개와 당시 실제 정적 분모 95개는 일치하지 않았다. 당시 실제 분모 뒤 추가된 GET 10개는 `/api/engagement`, `/api/operator/incidents`, `/api/performance/learned-rules`, `/api/studio/generation-history`, `/api/studio/learning`, 생성 파생 읽기 2개, 숏폼 실행 읽기 2개, `/api/threads/low-engagement-candidates`다. 문서 수치 기준으로는 현재가 21개 많고, 당시 실제 정적 분모 기준으로는 10개 많다. v8과 v9 사이 경로, 상태와 분류 변화는 없다. v9의 변경은 실사 신뢰성을 위한 개발 서버 기본 동시성 보정뿐이다.

## 6. 회귀와 직접 동작 증거

| 검증 | 직접 관찰 결과 |
|---|---|
| API 전수 실호출 | GET 105개, 정상 92, 의도된 거절 13, HTTP 500과 요청 실패 0 |
| 첫 실패 원본 | 동시성 4 개발 서버에서 요청 실패 4, 전체 시간 초과 35, 제품 500 0 |
| production 분리 실행 | 같은 Route Handler 105개, 정상 92, 의도된 거절 13, 실패 0 |
| 신규 회귀 | 전용 1건 포함 집중 3파일 5건 PASS, 전체에도 포함 |
| 전체 Vitest | 348파일 PASS, 2,276건 PASS, 조건부 3건 제외, 실패 0 |
| TypeScript | `npx tsc --noEmit`, 종료 코드 0 |
| production build | Next.js 16.2.2, 정적 페이지 184/184, 종료 코드 0 |
| build 경고 | 기존 NFT import 추적 경고 1건, build 성공과 분리해 잔존 기록 |
| seed | schema, 고정 작업 공간 seed, RLS 멱등 적용. 확장 2개와 `osmu_service` 역할 확인 |
| 기본 흐름 | 생성, 편집, 발행 큐, 성과 재인계 11/11 PASS |
| Studio v1 | 인증 거절, 생성, 조회, 후보 거절, 무료 다시 만들기 경합 14/14 PASS |
| 최종 개발 health | HTTP 200, DB up |
| 디자인 lint | `design-lint.sh dashboard/src`, 토큰 위반 0 |
| Mobile과 Maestro | 별도 모바일 제품이 없어 해당 없음 |
| 운영 배포와 외부 채널 실발행 | 미검증 |

## 7. 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98 | 발행 성과를 읽고 다음 생성 판단으로 되돌림 | API-READ-ALL-V9 | PASS | `/api/metrics`, `/api/engagement`, 제안과 학습 GET을 포함한 105개 실호출, 500과 요청 실패 0 |
| R104 | 고객, 운영자, 작업 공간 인증 경계 | API-AUTH-BOUNDARY-V9 | PASS | 인증 경로 handler 응답, 무토큰 격리 탐침 401, 13개 비정상 상태 본문 확인 |
| R200, R207 | 성과 학습 규칙과 Studio 학습 정보 조회 | API-LEARNING-READ-V9 | PASS | `/api/performance/learned-rules`, `/api/studio/learning` 각각 HTTP 200 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 디자인, 운영 배포, 외부 채널 실발행은 이번 PASS에 포함하지 않음 |

전환 가능 TC는 `API-READ-ALL-V9`, `API-AUTH-BOUNDARY-V9`, `API-LEARNING-READ-V9`다. 제품 전체 QA 승인과 배포 전환은 불가하다.

## 8. 제품 전체 판정과 페르소나 답

API 읽기 범위만 PASS다. v63 원본과 현재 화면의 기존 8축 디자인 정합 NG, 사용자 지정 v63과 pipeline 승인 v68의 핀 충돌, canonical `docs/test-plan.md`와 `docs/ONE_THING.md` 부재, 운영 배포와 외부 채널 실발행 미검증을 유지한다. 같은 날 공격 리뷰에서 기록한 고객 격리 결함과 다수 MAJOR도 이 실사로 해소되지 않았다. 제품 전체 QA와 배포는 NG다.

⛔ 검증실패 보고: 등급=상위 QA 품질 검증 FAIL / 사유=운영 또는 stage 배포 환경 접촉 증거가 0건이고 이번 과제는 localhost:3456으로 범위가 고정됨 / 출고여부=localhost API 읽기 범위 증거로만 출고하며 제품 전체 QA 승인과 배포 근거로는 출고하지 않음

페르소나 결정: 초보 1인 사업자는 현재 로컬 앱에서 읽기 API의 일반 500 때문에 생성, 편집, 발행 큐, 성과 재진입이 막히지 않는다. 외부 계정 연결부터 실제 공개와 성과 수집까지 끝난다는 증거는 없다.

## 9. 레드팀과 셀프심문

레드팀: 까다로운 운영자는 제품 코드가 아니라 검사기만 고쳤으니 결함을 덮었다고 공격할 수 있다. 첫 실행에는 제품 500이 없었고, 같은 빌드의 production 105개와 새 개발 서버 순차 105개가 모두 응답했다. 실패 원본을 삭제하지 않고 검사기 결함과 제품 응답을 분리했다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 순차 실행이 느린 장애를 숨기거나 공유 작업 트리 변경을 섞은 경우다. 각 요청의 120초 제한과 전체 300초 제한을 유지했고, 최종 실행은 105개 모두 그 예산 안에 끝났다. 원본에 HEAD, 경로별 시간, 상태, 응답 요약을 남겼고 v8과 기계 대조했다. 다만 공유 작업 트리의 다른 미커밋 제품 변경까지 이 커밋이 고정한다고 주장하지 않는다.

## 10. 벤치마크 적용

- Next.js Route Handlers 공식 문서의 `route.ts` 메서드 export를 검사 분모로 사용했다.
- RFC 9110의 상태 의미를 따라 호출자 입력과 인증 문제인 4xx, 설정이나 일시적 서비스 불가인 503, 처리 결함인 일반 500을 분리했다.
- 회장 정본의 직접 관찰 원칙에 따라 mock이나 build가 아니라 localhost 상태코드와 응답 본문을 최종 판정 근거로 썼다.

RUBRIC_SCORE: 재현성=5/5 범위완결=5/5 판정정확성=5/5 증거추적=5/5 정직성=5/5 total=25/25

WEAKEST_LINE: 로컬 읽기 경로는 전부 관찰했지만 운영 배포와 외부 채널 실제 공개는 확인하지 않았다.

SKILLS_USED: qa, 전수 실호출, 실패 분리, 회귀, build, seed, E2E, 증거 기록 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: OSMU 사업 좌표, 직접 검증, 초보 1인 사업자, HTTP 상태 의미, Next.js Route Handler 분모
HITS_USED: BRAIN의 OSMU 핵심 순환을 사용해 생성, 발행, 성과 읽기를 핵심 경로로 고정했고, 공식 Next.js와 RFC 문서로 분모와 상태 판정을 고정했다.
HITS_REJECTED: 일반 마케팅 심리와 다른 벤처 자료는 API 상태 판정 근거가 아니어서 제외했다.
CONFLICTS: 외부 HTTP 기준과 회장 정본 사이 충돌 없음. 사용자 과제의 v63과 canonical pipeline의 v68 승인 핀은 충돌하므로 제품 전체 QA를 NG로 유지했다.

SOURCES: `CLAUDE.md` | `dashboard/CLAUDE.md` | `pipeline-state.osmu.md` | `docs/구현현황.md` | `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md` | `docs/plan/one-thing.md` | `docs/plan/persona-v7.3.5.md` | `docs/design/README.md` | `docs/design/captures/manifest.json` | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/거버넌스/요청.md` | `wiki/거버넌스/결정.md` | `wiki/거버넌스/실수.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `docs/_archive/legacy-20260912/audit/openclaw-api-live-sweep-2026-08-28.md` | `docs/qa/osmu-api-read-sweep-v8-gpt-codex.md` | `logs/diff/osmu-api-read-sweep-20260914-1313-live.json` | `logs/diff/osmu-api-read-sweep-20260914-1313-production.json` | `logs/diff/osmu-api-read-sweep-20260914-1313-final.json` | https://nextjs.org/docs/app/getting-started/route-handlers | https://www.rfc-editor.org/rfc/rfc9110.html

MODEL: gpt-codex/gpt-5 / qa-verifier
