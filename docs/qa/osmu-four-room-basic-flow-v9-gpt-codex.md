# OSMU 네 방 기본 흐름 QA 재검증 v9

> STAMP | line: osmu | 생성: 2026-09-14 18:36 KST | model: gpt-codex/gpt-5 | agent: qa-verifier | skill: qa | 근거: v63 프로토타입, 확정 요구 정본, 사업 좌표, localhost 실요청, Playwright 원본 캡처 | 고민: 화면 관통 성공 뒤에도 검증용 고객 토큰 폐기 실패가 종료 코드 0에 숨는 문제를 제품 성공과 분리해 수리했다.

한 줄 결론: 현재 localhost의 네 방 기능은 기본 API 11/11, 단면 4/4, 4개 폭 20/20과 복귀 5/5, Studio v1 14/14로 통과했다. 검증용 고객 토큰 폐기 실패 은폐를 수정하고 활성 테스트 토큰 잔여를 0건으로 만들었다. 지정 v63과 현재 16개 화면의 구조가 달라 디자인 정합과 제품 전체 QA는 NG다.

⛔ 검증실패 보고: localhost 네 방 기능과 검증기 수리는 통과했지만 운영 또는 stage 배포 환경, 외부 채널 실발행, v63 디자인 정합은 통과하지 않았다. 이 문서는 제품 전체 QA 승인이나 배포 근거가 아니다.

## 요청 추적

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 네 방 관통 | FLOW-API-V9 | PASS | localhost 기본 흐름 11/11. 후보 3장, 편집, 발행 큐 HTTP 201, 성과 제안 3건과 생성실 재인계 관찰 |
| R08, R19, R207 | 네 방 렌더와 390, 768, 1024, 1440 실제 이동 | FLOW-UI-V9 | 기능 PASS, 디자인 NG | 단면 4/4, 20개 방 화면과 성과실에서 생성실 복귀 5/5. 가로 넘침, 가린 모달, 탐색 차단, 401, 콘솔 오류 0건 |
| R27, R168 | Studio v1 생성과 무료 다시 만들기 경계 | STUDIO-V1-V9 | PASS | localhost 실요청 14/14 |
| R104 | 검증용 고객 자격증명을 남기지 않음 | FLOW-PROBE-CLEANUP-V9 | 수정 후 PASS | 폐기 전용 60초 제한시간, 실패 종료 코드 1 계약 추가. 실앱 재실행 종료 코드 0, 활성 `qa-four-room-*` 토큰 0건 |
| R201 | 사족과 영문 단추 라벨 금지 | FLOW-COPY-V9 | PASS | 원본 캡처 20장에서 영문 단추 라벨을 발견하지 못함 |
| R205, R206 | v63 디자인 계승 | DESIGN-V9 | NG | v63과 현재 공통 셸, 주축, 요소 순서, 열 수, 담당 패널, 버튼 위계가 다름 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL-V9 | 이월 | 기존 전건 추적표를 유지하고 이번 기능 PASS에 포함하지 않음 |

## 실행 결과

| 단계 | 상태 | 증거와 비고 |
|---|---|---|
| canonical 단계 | 진행 중 | 메인 repo `pipeline-state.osmu.md`가 착수 때 이미 `current_stage: qa`. 승인 상태는 변경하지 않음 |
| backend build와 test | PASS | 별도 Spring backend 없음. Next Route Handler 포함 Vitest 351파일, 2,291건 PASS, 조건부 3건 제외 |
| web build와 test | PASS | `npx tsc --noEmit` 종료 코드 0. `npm run build` 184/184. 기존 NFT 추적 경고 1건 |
| mobile typecheck | 해당 없음 | Expo 또는 mobile 패키지가 이번 범위에 없음 |
| health | PASS | localhost:3456 listener PID 33531, HTTP 200, DB up |
| seed | PASS | `apply-schema.sh --seed`로 schema, 지정 작업 공간, RLS, 확장과 역할을 멱등 적용 |
| 주요 API | PASS | `verify-basic-flow-e2e.mjs` 최종 11/11 |
| 네 방 단면 | 수정 후 PASS | `probe-four-room-flow.mjs` 4/4. 가린 모달, 브라우저 401, 콘솔 오류 0건. 활성 테스트 토큰 전후 0건 |
| 사람 클릭 4개 폭 | PASS | 390 라이트와 다크, 768, 1024, 1440 라이트에서 20화면과 복귀 5/5. 원본 20장과 관찰 25건 |
| Studio v1 | PASS | `verify-studio-v1-e2e.mjs` 14/14 |
| Maestro | 해당 없음 | 대상은 Next.js Web이며 Maestro 구성이 없음 |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`, 디자인 토큰 위반 0건 |
| 디자인 정합 | NG | v63 원본과 현재 16개 조합 모두 구조 불일치 |
| 운영 배포 | 미검증 | 실제 배포 버전, 외부 계정 발행과 운영 성과 회수는 확인하지 않음 |

원본은 `logs/diff/osmu-four-room-flow-20260914-1819/captures/`다. 동적 URL은 `/studio?room=create`, `/studio?room=edit`, `/studio?room=publish`, `/performance`다. `observations.json`은 방 관찰 20건과 복귀 5건, 콘솔 오류 0건, 401 URL 0건을 담는다. 최종 `dashboard/src`와 `dashboard/scripts` 합성 SHA-1은 `72b8c26d8b3a93c6f4591d9c8d4771e31d1d72e0`, 제품 `dashboard/src` 합성 SHA-1은 `0907e60927946f94fbbbd5fa78b9cd16e77f3399`다.

## 결함과 수정

### ISSUE-015: 화면 성공 뒤 임시 고객 토큰 폐기 실패가 숨음

첫 단면 실행은 네 방 4/4를 출력한 뒤 `임시 고객 토큰 폐기 실패: The operation was aborted due to timeout`을 출력했지만 종료 코드 0이었다. 원인은 화면 검증과 폐기 요청이 하나의 전체 마감시각을 공유해, 화면이 예산을 다 쓰면 폐기 요청이 사실상 1ms 안에 취소되는 구조였다. 4개 폭 검증기도 같은 구조와 강제 `process.exit(0)`을 갖고 있었다.

두 검증기에 본 검증 마감과 독립된 60초 폐기 요청을 두고, HTTP 실패나 예외가 나면 `process.exitCode = 1`로 실패하게 했다. 회귀 2건을 추가했고 관련 제한시간 계약까지 3파일 6건이 통과했다. 실앱 단면을 다시 실행해 종료 코드 0, 네 방 4/4, 폐기 전후 활성 probe 토큰 0건을 관찰했다. 과거 4개 폭 실행에서 남은 활성 테스트 토큰 2건은 라벨과 생성시각을 확인한 뒤 폐기했고 최종 활성 `qa-four-room-*` 잔여는 0건이다. 수정 커밋은 `4736aa9f`다.

## 디자인 정합 매트릭스

판정 축은 A 주축 방향, B 요소 순서, C 열 수, D 정렬과 여백, E 표시와 숨김, F 글꼴 계열과 크기 단계, G 버튼 위계, H 해당 폭 종합이다. 기준 원본은 `docs/design/captures/osmu-four-room-prototype-v63-20260912/`, 실제 원본은 이번 캡처 폴더다.

| 요청번호 | 화면 | 폭 | 핵심 차이 | A | B | C | D | E | F | G | H |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| R08, R205, R206 | 생성실 | 390 | v63 후보 카드와 하단 담당, 현재 상단 단계와 세로 입력 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 768 | v63 좌측 제작 순서와 우측 담당, 현재 아이콘 레일과 단일 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1024 | v63 후보 3열과 우측 담당, 현재 입력 중심 2열 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1440 | 와이드 셸, 카드 밀도, 학습 패널과 버튼 위계가 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 390 | v63 목차와 미리보기 및 하단 담당, 현재 단계 중심 세로 흐름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 768 | v63 3영역 압축 셸, 현재 빈 상태와 세로 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 1024 | 목차, 편집, 담당의 열 비율과 순서가 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 1440 | v63 영상 편집 3열, 현재 빈 상태와 우측 담당 2열 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 390 | v63 발행 행동과 미리보기 우선, 현재 세로 본문 우선 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 768 | v63 제작 순서와 담당 고정, 현재 상단 단계와 긴 카드 목록 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 1024 | v63 중앙 미리보기와 우측 담당, 현재 연결 안내와 카드 구성이 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 1440 | 와이드 발행 셸, 버튼 위계와 미리보기 밀도가 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 390 | v63 성과 카드 우선, 현재 담당과 단계 안내 우선 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 768 | v63 3열 압축, 현재 담당과 성과의 세로 순서 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1024 | v63 중앙 성과와 우측 담당, 현재 대시보드와 담당 구성이 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1440 | 와이드 셸, 버튼 위계와 데이터 밀도가 다름 | NG | NG | NG | NG | NG | NG | NG | NG |

과제는 v63을 확정 기준으로 지정하지만 canonical pipeline 최신 승인 `design_hub`는 v68이다. 이 충돌은 기능 판정에는 영향을 주지 않지만 디자인 PASS와 QA 승인을 막는다.

## 기존 구현 보존

- 기존 구현 확인: 네 방 Route, 기본 11단계 API, Studio v1, 성과 제안과 생성실 재인계, 4개 폭 검증기가 이미 있었다.
- 유지한 기존 기능: 생성, 편집, 발행, 성과, 제안 재인계, 라이트와 다크, 모바일 메뉴, production build를 보존했다.
- 추가와 변경: QA 검증용 고객 토큰 폐기와 실패 반환만 수정했다. 제품 화면, API 계약, DB 스키마는 바꾸지 않았다.

## 페르소나 결정

김민서가 생성실에서 성과실까지 길을 잃지 않고 완주할 수 있는가: 현재 localhost 기능에서는 그렇다. 네 방 링크와 다음 행동이 4개 폭에서 작동했고 성과실에서 생성실로 돌아왔다. 승인 기준과 다른 정보 구조 때문에 제품 전체 출고 가능으로 확대할 수는 없다.

## 레드팀과 셀프심문

까다로운 고객의 반론: 빈 상태 중심 클릭은 실제 편집과 발행을 증명하지 않는다. 대응: 브라우저는 네 방 이동과 가림을 검증했고 기본 API 11단계가 실제 초안 편집, 삭제와 복원, 발행 큐 HTTP 201을 검증했다. 외부 채널 실발행은 미검증으로 남겼다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 활성 토큰 0건이 현재 실행의 폐기 성공이 아니라 다른 세션의 정리 결과라는 점이다. 대응: 수정 뒤 단면 실행은 폐기 오류 없이 종료 코드 0이었고, 실행 직전과 직후 활성 probe 토큰이 모두 0건이었다. 4개 폭 실행 뒤 남은 활성 2건은 생성시각이 과거 실행으로 확인됐다.

## 벤치마크 적용

- Playwright 시각 비교 원칙에서 동일 환경과 일관된 스크린샷 입력을 차용했다: https://playwright.dev/docs/test-snapshots
- Playwright emulation의 명시적 viewport를 390, 768, 1024, 1440 실행에 적용했다: https://playwright.dev/docs/emulation
- WAI-ARIA modal 규칙의 배경 비활성화와 포커스 가둠 정의를 가린 모달 판정 기준으로 사용했다: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

RUBRIC_SCORE: 완결성=5/5 정밀성=5/5 벤치마크=5/5 추적성=5/5 전문성=5/5 total=25/25
WEAKEST_LINE: 운영 배포와 실제 외부 채널 발행은 이번 localhost 증거가 보장하지 않는다.

SKILLS_USED: `qa`, localhost 실제 탐색, 회귀 우선, 시각 대조, 결함 기록과 최종 판정에 사용 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: BRAIN의 OSMU 사업 허브, repo의 v63 프로토타입, 확정 요구 정본, 이동된 사업 좌표, 테스트 계획, 디자인 README와 manifest, Playwright와 WAI-ARIA 공식 기준을 조회했다.
HITS_USED: 사업 좌표는 첫 사용자와 네 방 역할, 요청 정본은 요청번호 추적, v63과 원본 PNG는 디자인 판정, Playwright는 실제 클릭과 4폭 캡처, WAI-ARIA는 가린 modal 판정에 사용했다.
HITS_REJECTED: 역사적 persona와 One Thing의 미측정 사업 수치는 기능 통과 근거로 쓰지 않았다. 다른 벤처 자료와 일반 마케팅 사례는 이번 동작 QA에 직접 필요하지 않아 제외했다.
CONFLICTS: 과제의 확정 기준 v63과 canonical pipeline 승인 핀 v68이 충돌한다. 기능 판정에는 영향이 없지만 디자인 PASS와 QA 승인을 차단한다.

SOURCES/MODEL: gpt-codex/gpt-5 | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/거버넌스/요청.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md` | `docs/plan/persona.md` | `docs/plan/one-thing.md` | `docs/design/README.md` | `docs/design/captures/manifest.json` | `logs/diff/osmu-four-room-flow-20260914-1819/captures/` | https://playwright.dev/docs/test-snapshots | https://playwright.dev/docs/emulation | https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
