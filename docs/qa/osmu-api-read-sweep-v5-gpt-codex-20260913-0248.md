# OSMU API 읽기 경로 전수 재실사 v5

한 줄 결론: localhost:3456의 GET 105개와 HEAD 1개를 실호출한 결과 정상 92개, 의도된 거절 13개, 원인불명 500과 요청 실패 0개였다. 이번 재실사에서 새 코드 결함은 발견되지 않았다.

STAMP | line: osmu | 생성: 2026-09-13 02:48 KST | model: gpt-codex/gpt-5.6-sol | agent: qa-verifier | skill: qa | 근거: live HTTP, 전체 회귀, build, seed, E2E, 이전 실사 대조 | 고민: 인증·자원 부재·설정 부재를 고장으로 부풀리지 않되 설명 없는 5xx는 한 건도 통과시키지 않았다.

## 범위와 판정 기준

- 대상: `dashboard/src/app/api/**/route.ts`에서 GET을 export하는 105개 경로와 명시적 HEAD 1개.
- 환경: `http://127.0.0.1:3456`, `dashboard/.env.local`, 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`.
- 증거: `logs/diff/osmu-api-read-sweep-20260913.json`.
- 최초 전수 시점: commit `27c94381`, 2026-09-13 02:11 KST.
- 후속 소스 대조: HEAD `80c09807`, API 소스 합성 SHA-256 `00d4c436e309c376b28b0ed2cdaaba8396a768d085e82c943956d5cf27da1fb6`.
- 전수 뒤 동시 변경된 GET 3개는 현재 소스로 다시 호출했다. Higgsfield 거래, 성과 학습 규칙, Studio 학습 정보가 모두 HTTP 200이었다.
- 판정: 2xx와 3xx는 정상이다. 입력 오류, 인증 경계, 없는 자원, 설정 부재를 설명하는 4xx와 503은 의도된 거절이다. 설명 없는 500과 요청 실패는 고장이다.

## 현재 결과

| 구분 | 수 | 판정 |
|---|---:|---|
| GET 정상 | 92 | PASS |
| GET 의도된 거절 | 13 | PASS |
| 원인불명 HTTP 500 | 0 | PASS |
| 요청 실패 | 0 | PASS |
| HEAD 없는 미디어 토큰 | 1 | HTTP 404, 의도된 거절 |

### 의도된 거절 13개

| 경로 | HTTP | 계약상 이유 |
|---|---:|---|
| `/api/card-slides/<없는 UUID>` | 400 | 식별자 형식 오류 |
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
| `/api/tiktok/creator-info` | 400 | 테넌트 또는 TikTok 토큰 없음 |
| `/api/tiktok/publish-status` | 400 | 발행 식별자 형식 오류 |

## 이전 실사 대조

| 기준 | 2026-08-28 문서 | 2026-09-12 v4 | 현재 v5 |
|---|---:|---:|---:|
| 문서상 GET 분모 | 84 | 105 | 105 |
| 정상 | 79 | 92 | 92 |
| 의도된 거절 | 인증 거절 2, 호출자 값 누락 3 | 13 | 13 |
| 발견한 500 | 2, 같은 날 수정 | 0 | 0 |
| 요청 실패 | 문서상 0 | 0 | 0 |

2026-08-28 문서는 당시 실제 95개 중 84개만 표에 집계했다고 v4가 정정했다. 따라서 현재 105개는 문서상 분모보다 21개, 당시 정적 분모보다 10개 많다. v4와 현재의 route 집합은 같다.

v4 대비 HTTP 상태가 바뀐 경로는 4개다. Studio 개발 토큰으로 handler까지 도달하면서 파생·생성 상세가 401에서 404로, 생성의 파생 목록이 401에서 200으로 바뀌었다. 숏폼 공장 실행은 존재하지 않는 고정 UUID를 사용해 200에서 404로 바뀌었다. 모두 계약에 맞고 전체 분류 수는 92 대 13으로 동일하다.

v4 이후 커밋된 API 변경은 Reels 성과와 발행 중지 안전 보강이다. GET 경로 집합은 늘지 않았고 관련 읽기 경로는 전수 실사에서 2xx였다.

## 결함과 회귀

새 결함이 없어 제품 코드는 수정하지 않았다. 이전 v4에서 발견해 `87c3014b`와 `fdaa82e1`로 고친 잘못된 파생 작업 UUID 500과 migration manifest 누락은 집중 회귀 30건으로 다시 고정했다.

| 검증 | 관찰 결과 |
|---|---|
| 집중 회귀 | 3파일, 30건 PASS |
| 전체 Vitest | 302파일, 2,033건 PASS, 3건 스킵, 실패 0 |
| TypeScript | `npx tsc --noEmit`, exit 0 |
| Web build | Next.js 16.2.2, 정적 페이지 182/182, exit 0. 기존 NFT 추적 경고 1건 |
| seed | `apply-schema.sh --seed`, 멱등 적용과 작업 공간 upsert PASS |
| health | HTTP 200, `db: up` |
| 기본 흐름 | `verify-basic-flow-e2e.mjs`, 11/11 PASS |
| Studio v1 | 최초 12/14 뒤 재실행 14/14 PASS. 무료 재생성 POST가 한 번 예상 밖 200이었으나 즉시 수동 재호출은 409였고 재실행에서도 409였다. 비재현 관찰로 남긴다 |
| 디자인 lint | `design-lint.sh dashboard/src`, 위반 0 |
| Mobile과 Maestro | 별도 모바일 제품이 없어 해당 없음 |
| 운영 배포 | 하지 않음 |

전체 Vitest와 build는 최초 전수 시점 소스에서 통과했다. 이후 공유 작업 트리에서 바뀐 API GET 3개는 별도 실호출 200으로 재검증했다. 다른 세션의 미커밋 변경 전체를 이 보고서의 회귀 PASS로 확장하지 않는다.

## 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R68, R98 | 발행 성과를 측정하고 다음 생성 판단으로 되돌림 | API-READ-ALL | PASS | metrics를 포함한 GET 105개 전수 실호출, 원인불명 500 0 |
| R104 | 고객·운영자·작업 공간 인증 경계 | API-AUTH-BOUNDARY | PASS | 올바른 토큰은 handler 도달, 격리 탐침 무토큰은 401 |
| R200, R207 | 성과 학습 규칙과 Studio 학습 정보 조회 | API-LEARNING-READ | PASS | 동시 변경 뒤 `/api/performance/learned-rules`, `/api/studio/learning` 각각 200 |
| R01~R207 | 이번 API 읽기 범위 밖 확정 요구 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 누락으로 PASS 처리하지 않음 |

## 제품 전체 판정

API 읽기 범위는 PASS다. 그러나 승인 프로토타입 v63과 pipeline 핀 v68의 충돌, 공통 셸·열 수·담당 패널·요소 순서·버튼 위계 불일치가 기존 디자인 정합 행렬에서 NG다. 실제 외부 OAuth, 채널 발행, 운영 배포도 미검증이다. 따라서 제품 전체 QA와 배포는 NG를 유지한다.

⛔ 검증실패 보고: `verify-agent-quality.sh`의 상위 QA 게이트는 운영 또는 스테이징 환경 접촉 증거가 0건이라 반려했다. 이번 요청의 명시 범위는 localhost였고 배포는 하지 않았으므로, 로컬 API 읽기 PASS를 운영 QA PASS로 확장하지 않는다.

페르소나 결정: 초보 1인 사업자 박도윤은 현재 로컬 환경에서 API 읽기 실패로 작업이 막히지 않는다. 다만 외부 계정 연결과 실제 공개까지 완료할 수 있다고 판정할 증거는 없다.

## 레드팀과 셀프심문

레드팀: 4xx와 503을 모두 정상으로 뭉개면 실제 인증·설정 결함을 숨길 수 있다. 각 응답 본문의 사유를 확인하고 없는 자원, 잘못된 입력, 의도된 인증 경계, 설정 부재로만 제한했다. 설명 없는 5xx는 허용하지 않았다.

셀프심문: 이 결론이 틀렸다면 가장 그럴듯한 이유는 전수 직후 공유 작업 트리의 API 소스가 바뀐 경우다. 실제로 3개가 바뀌었기 때문에 소스 해시를 다시 계산하고 그 세 GET을 현재 소스로 재호출했다. 전체 제품 성공으로 범위를 넓히지 않았다.

## 벤치마크 적용

- Next.js Route Handlers 문서의 HTTP 메서드 export를 분모로 삼았다.
- RFC 9110의 상태 의미에 따라 caller 오류 4xx와 server failure 5xx를 분리했다.
- Playwright API testing 원칙처럼 UI와 독립된 HTTP 관찰 증거를 남겼다.

RUBRIC_SCORE: 재현성=5/5 범위완결=5/5 판정정확성=5/5 증거추적=5/5 정직성=5/5 total=25/25

SKILLS_USED: qa, 전수 API 실호출·회귀·E2E·증거 기록 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: OSMU + 끝내기 우선 + 직접 검증 + 초보 1인 사업자
HITS_USED: BRAIN의 OSMU 사업 좌표와 끝내기 우선 원칙을 사용해 생성·발행·성과 읽기와 직접 관찰을 검증 축으로 고정했다.
HITS_REJECTED: 일반 마케팅 심리와 다른 벤처 자료는 API 상태 판정 근거가 아니어서 제외했다.
CONFLICTS: 외부 HTTP 기준과 회장 정본 사이 충돌 없음. 외부 기준은 상태 분류에만 사용하고 제품 전체 승인은 기존 디자인 게이트를 유지했다.

SOURCES: `CLAUDE.md` | `dashboard/CLAUDE.md` | `pipeline-state.osmu.md` | `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md` | `docs/plan/one-thing.md` | `docs/plan/persona.md` | `docs/design/README.md` | `docs/design/captures/manifest.json` | `docs/_archive/legacy-20260912/audit/openclaw-api-live-sweep-2026-08-28.md` | `docs/qa/osmu-api-read-sweep-v4-gpt-codex-20260912-2214.md` | `logs/diff/osmu-api-read-sweep-20260913.json` | https://nextjs.org/docs/app/getting-started/route-handlers | https://www.rfc-editor.org/rfc/rfc9110.html | https://playwright.dev/docs/api-testing

MODEL: gpt-codex/gpt-5.6-sol / qa-verifier
