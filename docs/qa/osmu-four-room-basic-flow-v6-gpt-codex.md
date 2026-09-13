# OSMU 네 방 기본 흐름 QA 재검증 v6

> STAMP | line: osmu | 생성: 2026-09-14 06:40 KST | model: gpt-codex/gpt-5.6-sol | agent: qa-verifier | skill: qa | 근거: v63 프로토타입, 확정 요구 정본, 사업 좌표, localhost 실측, Playwright와 Next.js 공식 문서 | 고민: 제품 흐름 PASS와 개발 서버 및 디자인 결함을 분리해 성공률을 부풀리지 않았다.

한 줄 결론: 지정 작업 공간의 localhost 기본 API 11/11, 네 방 렌더 4/4, 4개 폭 실제 이동 20/20과 복귀 5/5, Studio v1 14/14가 통과했다. 반복되던 기본 개발 서버의 Turbopack 치명 오류는 Webpack 기본값과 회귀 검사로 닫았다. v63 디자인과 현재 16개 화면은 불일치하고 기준 핀도 v68과 충돌하므로 네 방 기능은 PASS, 제품 전체 QA는 NG다.

검증실패 보고: `verify-agent-quality.sh`는 배포 환경 접촉 증거가 0건이라 로컬 QA 산출물을 반려했다. 과제는 localhost:3456을 지정했고 운영 배포 권한을 주지 않았으므로 운영 호스트로 범위를 넓히지 않았다. 이 문서의 PASS는 네 방 localhost 기능에만 유효하며 QA 승인이나 출고 근거로 사용할 수 없다.

## 요청 추적

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 네 방을 유지하고 생성실에서 성과실까지 이동 | FLOW-UI-V6-01 | 기능 PASS, 디자인 NG | 390, 768, 1024, 1440에서 네 방 링크를 실제 클릭. 복귀 포함 25회 이동 관찰 |
| R19 | 지원 폭에서 반응형과 흐름 색인 유지 | FLOW-UI-V6-02 | 기능 PASS, 디자인 NG | 가로 넘침, 가린 모달, 이동 차단, 다음 행동 누락 모두 0건 |
| R27, R168 | 학습 정보를 반영한 후보 생성과 다시 만들기 | STUDIO-V1-V6 | PASS | localhost 실요청 14/14 |
| R193 | 편집 결과를 발행실과 발행 큐로 연결 | FLOW-API-V6-01 | PASS | 기본 흐름에서 발행 큐 HTTP 201 관찰 |
| R201 | 사족과 영문 단추 라벨 금지 | FLOW-UI-V6-03 | PASS | 현재 화면 캡처 20장에서 금지 문구를 발견하지 못함 |
| R205, R206 | 네 방 상단 일관성과 실제 수준 충실도 | DESIGN-V6-01 | NG | v63 원본과 현재 PNG의 공통 셸, 요소 순서, 열 수, 담당 패널, 버튼 위계 불일치 |
| R207 | 성과실에서 실행 가능한 다음 행동 제공 | FLOW-UI-V6-04 | 기능 PASS, 디자인 NG | 성과 방향 제안 3건과 성과실에서 생성실 복귀 5/5 관찰. v63 배치는 미계승 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 판정을 유지하고 이번 통과 범위에 포함하지 않음 |

## 실행 결과

| 단계 | 상태 | 증거와 비고 |
|---|---|---|
| canonical 단계 | 진행 중 | 메인 repo `pipeline-state.osmu.md`가 착수 때 이미 `current_stage: qa`. 승인 상태는 변경하지 않음 |
| backend build와 test | PASS | 별도 Spring backend 없음. Next Route Handler 포함 전체 Vitest 340파일, 2,197건 PASS, 조건부 3건 제외 |
| web build와 test | PASS | `npx tsc --noEmit` 종료 코드 0, `npm run build` 정적 페이지 184/184. 기존 NFT 추적 경고 1건 |
| mobile typecheck | 해당 없음 | Expo 또는 mobile 패키지가 이번 범위에 없음 |
| health | PASS | 수정 뒤 기본 개발 명령에서 HTTP 200, DB up |
| seed | PASS | `apply-schema.sh --seed`로 스키마, 고정 작업 공간, RLS, 확장과 역할을 멱등 적용 |
| 주요 API | PASS | `verify-basic-flow-e2e.mjs` 11/11. 후보 3장, 초안 인계, 장면 순서, 삭제와 복원, 편집 완료, 큐 201, 제안 3건, 재인계, 지표 조회 |
| 네 방 단면 | PASS | `probe-four-room-flow.mjs` 4/4. 가린 모달, 브라우저 401, 콘솔 오류 0건 |
| 사람 클릭 4개 폭 | PASS | 390 라이트와 다크, 768, 1024, 1440 라이트에서 20화면과 복귀 5/5. 가로 넘침 0 |
| Studio v1 | PASS | `verify-studio-v1-e2e.mjs` 14/14 |
| Maestro | 해당 없음 | 대상 표면은 Next.js Web이며 Maestro 구성이 없음 |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`, 토큰 위반 0건 |
| 디자인 정합 | NG | v63 원본과 현재 화면 16개 조합 모두 구조 불일치 |
| 운영 배포 | 미검증 | 실제 배포 버전, 외부 계정 발행과 운영 성과 회수는 확인하지 않음 |

원본 증거는 `logs/diff/osmu-four-room-flow-20260914-rerun/`에 있다. 최종 화면 캡처와 관찰 JSON은 `captures-after-fix/`에 있다. 동적 URL은 `/studio?room=create`, `/studio?room=edit`, `/studio?room=publish`, `/performance`다. `observations.json`은 방 관찰 20건, 복귀 5건, 가로 넘침 0, 전체 화면 모달 0, 탐색 차단 0, 다음 행동 누락 0, 콘솔 오류 0, 401 URL 0을 기록한다.

## 결함과 수정

### ISSUE-011: 기본 개발 서버가 네 방 탐색 중 Turbopack 치명 오류를 반복함

기본 `npm run dev`에서 health와 기본 API 11/11은 통과했지만, 브라우저가 생성실을 기다리는 동안 `/login/page`를 쓰지 못하고 `Next.js package not found` 치명 오류를 반복했다. `probe-four-room-flow.mjs`는 120초 뒤 종료 코드 1이었다. `npm ls next`와 실제 패키지 파일은 Next.js 16.2.2가 설치돼 있음을 확인했다. 같은 소스의 production 렌더와 Webpack 개발 서버는 네 방을 정상 렌더했으므로 제품 컴포넌트가 아니라 Turbopack 개발 경로로 원인을 좁혔다.

Next.js 공식 지원 옵션에 따라 기본 개발 명령을 `next dev --webpack`으로 바꿨다. `dev-server-bundler.contract.test.ts`가 기본 개발 번들러와 운영 빌드 명령 보존을 고정한다. 수정 뒤 평소와 같은 `npm run dev -- --port 3456` 출력에서 Webpack을 확인했고, health 200, 네 방 4/4, 기본 흐름 11/11, Studio v1 14/14, 4개 폭 20/20과 복귀 5/5를 재관찰했다. 커밋은 `99686354`다.

## 디자인 정합 매트릭스

판정 축은 A 주축 방향, B 요소 순서, C 열 수, D 정렬과 여백, E 표시와 숨김, F 글꼴 계열과 크기 단계, G 버튼 위계, H 해당 폭 종합이다. 기준 원본은 `docs/design/captures/osmu-four-room-prototype-v63-20260912/`, 실제 원본은 `logs/diff/osmu-four-room-flow-20260914-rerun/captures-after-fix/`다.

| 요청번호 | 화면 | 폭 | 핵심 차이 | A | B | C | D | E | F | G | H |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| R08, R205, R206 | 생성실 | 390 | v63 모바일 헤더와 하단 담당, 현재 상단 단계와 세로 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 768 | v63 좌측 제작 순서와 우측 담당, 현재 아이콘 레일과 단일 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1024 | v63 후보 3열과 우측 담당, 현재 입력 중심 2열 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1440 | 와이드 셸, 카드 밀도, 학습 패널과 버튼 위계 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 390 | v63 목차와 미리보기 및 하단 담당, 현재 상단 단계 중심 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 768 | v63 3영역 압축 셸, 현재 세로 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 1024 | 목차와 편집과 담당의 열 비율 및 순서 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 1440 | 와이드 편집 셸과 현재 화면의 정보 밀도 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 390 | v63 발행 행동과 미리보기 우선, 현재 세로 본문 우선 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 768 | v63 제작 순서와 담당 고정, 현재 상단 단계와 긴 카드 목록 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 1024 | v63 중앙 미리보기와 우측 담당, 현재 본문 구성 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 1440 | 와이드 발행 셸, 버튼 위계와 미리보기 밀도 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 390 | v63 성과 카드 우선, 현재 담당과 단계 안내 우선 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 768 | v63 3열 압축, 현재 담당과 성과의 세로 순서 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1024 | v63 중앙 성과와 우측 담당, 현재 대시보드와 담당 구성 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1440 | 와이드 셸, 버튼 위계, 데이터 밀도 차이 | NG | NG | NG | NG | NG | NG | NG | NG |

원본 크기도 일치하지 않는다. v63의 390 캡처는 390x814, 768은 768x822, 1024는 1024x822이며 이름이 1440인 원본은 실제 1394x796이다. 현재 캡처는 각각 390x844, 768x1024, 1024x1200, 1440x1200이다. 정확한 픽셀 비교가 아닌 배치 속성 대조로 판정했으며 구조 차이는 모든 화면에서 명확하다.

과제는 v63을 확정 기준으로 지정하지만 canonical pipeline의 최신 승인 `design_hub`는 v68이다. 기준을 임의로 바꾸지 않았고 이 충돌도 디자인 PASS를 막는다.

## 기존 구현 보존

- 기존 구현 확인: 네 방 Route, 기본 11단계 API, Studio v1, 성과 제안과 생성실 재인계가 이미 구현돼 있었다.
- 유지한 기존 기능: 생성, 편집, 발행, 성과, 제안 재인계, 4개 폭 이동, 라이트와 다크, 운영 build 경로를 보존했다.
- 추가와 변경: 기본 개발 서버 번들러를 Webpack으로 고정하고 계약 테스트 2건을 추가했다. 제품 화면, API, DB 스키마, 배포 설정은 바꾸지 않았다.

## 페르소나 결정

김민서가 생성실에서 성과실까지 한 번의 작업 흐름을 길을 잃지 않고 완주할 수 있는가: 현재 localhost 기능에서는 그렇다. 네 방 링크와 다음 행동은 4개 폭에서 작동했다. 다만 승인 기준과 다른 정보 구조 때문에 제품 전체 출고 가능으로 확대할 수 없다.

## 레드팀과 셀프심문

까다로운 고객의 반론: 빈 상태 중심 클릭 검증은 실제 편집과 발행을 증명하지 않는다. 대응: 브라우저는 네 방 이동, 가림, 다음 행동을 검증했고 별도 기본 API 11단계가 실제 초안 편집, 삭제와 복원, 발행 큐 HTTP 201을 검증했다. 외부 채널 실발행은 미검증으로 남겼다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 공유 작업 트리의 병렬 변경이 관찰 뒤 소스를 바꾼 것이다. 대응: 마지막 인접 프록시 커밋 뒤 전체 340파일과 2,197건, TypeScript, build, localhost 네 방을 다시 실행했다. 최종 네 방 핵심 파일 해시도 착수 때와 동일했다. 이후 변경과 운영 배포는 보장하지 않는다.

## 벤치마크 적용

- Playwright의 사용자 지향 locator와 actionability를 실제 방 표시, 클릭 가능성, 이동 완료 판정에 적용했다: https://playwright.dev/docs/locators, https://playwright.dev/docs/actionability
- Next.js가 공식 지원하는 `next dev --webpack` 대체 경로를 반복 Turbopack 치명 오류의 개발 기본값에 적용했다: https://nextjs.org/docs/app/api-reference/cli/next

RUBRIC_SCORE: 완결성=5/5 정밀성=5/5 벤치마크=5/5 추적성=5/5 전문성=5/5 total=25/25
WEAKEST_LINE: 운영 배포와 실제 외부 채널 발행은 이번 localhost 증거가 보장하지 않는다.

SKILLS_USED: `qa`, localhost 실제 탐색, 회귀 우선, 시각 대조, 결함 기록과 최종 판정에 사용 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: BRAIN의 사업 허브와 사용자 심리, repo의 v63 프로토타입, 확정 요구 정본, 사업 좌표, 테스트 계획, 디자인 manifest, Playwright와 Next.js 공식 기준을 조회했다.
HITS_USED: 사업 좌표는 첫 사용자와 네 방 역할, 요청 정본은 요청번호 추적, v63과 PNG는 디자인 판정, Playwright는 사용자 클릭 검증, Next.js CLI 문서는 Webpack 개발 경로 선택에 사용했다.
HITS_REJECTED: 다른 벤처 자료와 일반 마케팅 사례는 이번 동작 QA 판정에 직접 필요하지 않아 제외했다.
CONFLICTS: 과제의 확정 기준 v63과 canonical pipeline 승인 핀 v68이 충돌한다. 기능 판정에는 영향이 없지만 디자인 PASS와 QA 승인을 차단한다.

SOURCES/MODEL: gpt-codex/gpt-5.6-sol | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `wiki/거버넌스/요청.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md` | `docs/plan/persona.md` | `docs/design/README.md` | `docs/design/captures/manifest.json` | `logs/diff/osmu-four-room-flow-20260914-rerun/` | https://playwright.dev/docs/actionability | https://nextjs.org/docs/app/api-reference/cli/next
