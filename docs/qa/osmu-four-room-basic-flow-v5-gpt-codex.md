# OSMU 네 방 기본 흐름 QA 재검증 v5

> STAMP | line: osmu | 생성: 2026-09-14 03:35 KST | model: gpt-codex/gpt-5 | agent: qa-verifier | skill: qa | 근거: v63 프로토타입, 회장 요구 정본, 사업 좌표, localhost 실측, Playwright 공식 지침 | 고민: 기능 완주와 디자인 불일치를 별도 판정해 로컬 기능 통과가 제품 전체 통과로 번지지 않게 했다.

한 줄 결론: 지정 작업 공간의 localhost 기본 API 11/11, 네 방 렌더 4/4, 4개 폭의 실제 이동 20/20과 복귀 5/5, Studio v1 14/14가 통과했다. 캡처 증거 경로 결함은 회귀 테스트와 함께 고쳤다. 그러나 v63 대비 16개 화면의 디자인 정합이 모두 NG이고 기준 핀도 v68과 충돌하므로 제품 전체 QA는 NG다.

## 요청 추적

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 네 방 흐름을 유지하고 생성실에서 성과실까지 이동 | FLOW-UI-01 | 기능 PASS, 디자인 NG | 390, 768, 1024, 1440에서 생성실부터 성과실까지 링크를 실제 클릭. 현재 셸은 v63과 불일치 |
| R19 | 지원 폭에서 흐름 색인과 반응형 유지 | FLOW-UI-02 | 기능 PASS, 디자인 NG | 4개 폭에서 가로 넘침, 가린 모달, 이동 차단, 다음 행동 누락 0건 |
| R27, R168 | 학습 정보를 반영한 후보 생성과 다시 만들기 | STUDIO-V1 | PASS | 14/14 첫 실행 통과 |
| R193 | 발행실과 승인 및 발행 동선 연결 | FLOW-API-01 | PASS | 편집 결과를 발행 큐로 넘긴 요청 HTTP 201 관찰 |
| R201 | 사이드바 사족 제거 | FLOW-UI-04 | PASS | 20개 현재 화면 캡처에서 금지 사족과 영문 단추 라벨을 발견하지 못함 |
| R205, R206 | 네 방 상단 일관성과 실제 수준 충실도 | DESIGN-01 | NG | v63 원본과 현재 PNG의 공통 셸, 요소 순서, 열 수, 담당 패널, 버튼 위계 불일치 |
| R207 | 성과실을 실행 가능한 UX로 구성 | FLOW-UI-05 | 기능 PASS, 디자인 NG | 성과 방향 제안 3건과 성과실에서 생성실 복귀 5/5 관찰. v63 배치는 미계승 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 판정을 유지하고 이번 통과 범위에 포함하지 않음 |

## 실행 결과

| 단계 | 상태 | 증거와 비고 |
|---|---|---|
| canonical 단계 | 진행 중 | 메인 repo `pipeline-state.osmu.md`의 `current_stage: qa`, 승인 상태는 변경하지 않음 |
| backend build와 test | PASS | 별도 Spring backend 없음. Next Route Handler 포함 전체 Vitest 323파일, 2,119건 PASS, 3건 조건부 제외 |
| web build와 test | PASS | `npx tsc --noEmit` 종료 코드 0, `npm run build` 정적 페이지 183/183. 기존 NFT 추적 경고 1건 |
| mobile typecheck | 해당 없음 | 이번 대상에 Expo 또는 mobile 패키지가 없음 |
| health | PASS | 개발 서버 HTTP 200과 DB up. build 뒤 production 서버도 HTTP 200과 DB up |
| seed | PASS | `apply-schema.sh --seed` 완료. 고정 작업 공간과 현재 월 QA 사용량 fixture 복원 |
| 주요 API | PASS | `verify-basic-flow-e2e.mjs` 11/11. 후보 3장, 초안 인계, 장면 순서, 삭제와 복원, 편집 완료, 큐 201, 제안 3건, 재인계, 지표 조회 |
| 네 방 단면 | PASS | 개발 서버와 build 결과 각각 4/4. 가린 모달, 브라우저 401, 콘솔 오류 0건 |
| 사람 클릭 4개 폭 | PASS | 390 라이트와 다크, 768, 1024, 1440 라이트에서 20화면. 성과실에서 생성실 복귀 5/5 |
| Studio v1 | PASS | `verify-studio-v1-e2e.mjs` 14/14 첫 실행 통과 |
| Maestro | 해당 없음 | 대상 표면은 Next.js Web이며 Maestro 구성이 없음 |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`, 토큰 위반 0건 |
| 디자인 정합 | NG | v63 원본과 현재 화면 16개 조합 모두 구조 불일치 |
| 운영 배포 | 미검증 | 실제 배포 버전, 외부 계정 발행, 운영 성과 회수는 확인하지 않음 |

QA 원본은 `logs/diff/osmu-four-room-flow-20260914-031512/`에 있다. 화면 캡처 20장과 관찰 JSON은 `captures/post-fix/`에 있다. 동적 URL은 `/studio?room=create`, `/studio?room=edit`, `/studio?room=publish`, `/performance`다. `observations.json`은 준비 제한시간 120초, 방 관찰 20건, 복귀 5건, 콘솔 오류 0건, 401 URL 0건을 기록한다.

## 결함과 수정

### ISSUE-010: QA 캡처가 디자인 원본 폴더와 전체 페이지를 사용함

`verify-four-room-ui-e2e.mjs`의 기본 출력이 `docs/design` 아래였고 `fullPage: true`였다. 디자인 원본과 QA 결과를 분리해야 한다는 정본을 어기고, 동일 viewport에서 사용자가 보는 화면 대조도 흐렸다.

기본 출력은 `logs/diff/osmu-four-room-flow/captures`로 옮겼고 `fullPage: false`로 바꿨다. `four-room-capture-evidence.regression-1.test.ts`가 두 계약을 고정한다. 집중 회귀 1/1, 전체 회귀 2,119건, 수정 뒤 실제 20화면 재캡처가 통과했다. 커밋은 `561e859b`다. 제품 화면과 제품 API는 변경하지 않았다.

## 디자인 정합 매트릭스

판정 축은 A 주축 방향, B 요소 순서, C 열 수, D 정렬과 여백, E 표시와 숨김, F 글꼴 계열과 크기 단계, G 버튼 위계, H 해당 폭 종합이다. 기준 원본은 `docs/design/captures/osmu-four-room-prototype-v63-20260912/`, 실제 원본은 위 `logs/diff` 경로다.

| 요청번호 | 화면 | 폭 | 핵심 차이 | A | B | C | D | E | F | G | H |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| R08, R205, R206 | 생성실 | 390 | v63 모바일 헤더와 하단 담당, 현재 상단 단계와 세로 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 768 | v63 좌측 제작 순서와 우측 담당, 현재 아이콘 레일과 단일 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1024 | v63 후보 3열과 우측 담당, 현재 입력 중심 2열 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1440 | 와이드 셸, 카드 밀도, 학습 패널과 버튼 위계 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 390 | v63 목차와 미리보기 및 하단 담당, 현재 빈 상태와 상단 단계 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 768 | v63 3영역 압축 셸, 현재 빈 상태 단일 열 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 1024 | 목차와 편집과 담당의 열 비율 및 순서 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 1440 | 와이드 편집 셸과 현재 빈 상태의 정보 밀도 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 390 | v63 발행 행동과 미리보기 우선, 현재 학습 정보와 빈 본문 우선 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 768 | v63 제작 순서와 담당 고정, 현재 상단 단계와 긴 카드 목록 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 1024 | v63 중앙 미리보기와 우측 담당, 현재 학습과 빈 상태 중심 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 1440 | 와이드 발행 셸, 버튼 위계와 미리보기 밀도 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 390 | v63 성과 카드 우선, 현재 담당과 온보딩 우선 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 768 | v63 3열 압축, 현재 담당과 성과의 세로 순서 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1024 | v63 중앙 성과와 우측 담당, 현재 대시보드와 담당 구성 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1440 | 와이드 셸, 버튼 위계, 데이터 밀도 차이 | NG | NG | NG | NG | NG | NG | NG | NG |

원본 크기도 일치하지 않는다. v63의 390 캡처는 390x814, 768은 768x822, 1024는 1024x822이며, 이름이 1440인 원본은 실제 1394x796이다. 현재 캡처는 각각 390x844, 768x1024, 1024x1200, 1440x1200이다. 따라서 정확한 픽셀 비교는 불가능하고, 배치 속성의 육안 대조만 수행했다. 구조 차이는 모든 화면에서 명확해 디자인 QA는 FAIL이다.

과제는 v63을 확정 기준으로 지정하지만 canonical pipeline의 최신 승인 design_hub는 v68이다. 기준을 임의로 바꾸지 않았으며, 이 충돌도 디자인 PASS를 막는다.

## 기존 구현 보존

- 기존 구현 확인: 네 방 Route, 기본 11단계 API, Studio v1, 성과 제안과 생성실 재인계가 이미 구현돼 있었다.
- 유지한 기존 기능: 생성, 편집, 발행, 성과, 제안 재인계, 4개 폭 이동, 라이트와 다크를 제품 코드 변경 없이 검증했다.
- 추가와 변경: QA 캡처 경로와 viewport 증거 방식, 회귀 테스트 1개만 수정했다.

## 페르소나 결정

김민서가 생성실에서 성과실까지 한 번의 작업 흐름을 길을 잃지 않고 완주할 수 있는가: 현재 localhost 기능에서는 그렇다. 네 방 링크와 다음 행동은 4개 폭에서 작동했다. 다만 승인 기준과 다른 정보 구조 때문에 제품 전체 출고 가능으로 확대할 수 없다.

## 레드팀과 셀프심문

까다로운 고객의 반론: 빈 편집실과 빈 발행실을 통과한 것은 실제 작업물 편집과 발행을 검증한 것이 아니다. 대응: 화면 클릭 검증은 빈 상태의 다음 행동과 네 방 이동을 봤고, 별도 기본 API 11단계가 실제 초안 편집과 큐 HTTP 201을 검증했다. 외부 채널 실발행은 미검증으로 남겼다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 공유 작업트리의 병렬 변경이 관찰 뒤 소스를 바꾼 것이다. 대응: 전체 테스트와 build는 당시 작업트리 전체를 대상으로 수행했고, build 결과에서도 health 200과 네 방 4/4를 재관찰했다. 운영 배포와 이후 병렬 변경은 미검증으로 한정한다.

## 벤치마크 적용

- Playwright 사용자 지향 locator와 actionability를 실제 방 표시, 클릭 가능성, 이동 완료 판정에 적용했다: https://playwright.dev/docs/locators, https://playwright.dev/docs/actionability
- Playwright 화면 비교 원칙을 v63 원본과 현재 PNG의 viewport별 대조에 적용했다: https://playwright.dev/docs/test-snapshots

RUBRIC_SCORE: 완결성=5/5 정밀성=5/5 벤치마크=5/5 추적성=5/5 전문성=5/5 total=25/25
WEAKEST_LINE: 공유 작업트리의 이후 병렬 변경과 실제 운영 배포는 이번 localhost 증거가 보장하지 않는다.

SKILLS_USED: `qa`, localhost 실제 탐색, 증거 계약 수정, 회귀 우선, 시각 대조와 최종 판정에 사용 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: BRAIN의 OSMU 사업과 사용자 심리, repo의 v63 프로토타입, 요청 정본, 사업 좌표, 테스트 계획, 디자인 manifest, Playwright 공식 기준을 조회했다.
HITS_USED: 사업 좌표는 첫 사용자와 네 방 역할, 요청 정본은 요청번호 추적, v63과 PNG는 디자인 판정, Playwright는 클릭과 화면 대조 기준에 사용했다.
HITS_REJECTED: 다른 벤처 자료와 일반 마케팅 사례는 이번 동작 QA 판정에 직접 필요하지 않아 제외했다.
CONFLICTS: 과제의 확정 기준 v63과 canonical pipeline 승인 핀 v68이 충돌한다. 기능 판정에는 영향이 없지만 디자인 PASS와 QA 승인을 차단한다.

SOURCES/MODEL: gpt-codex/gpt-5 | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `wiki/거버넌스/요청.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md` | `docs/design/README.md` | `docs/design/captures/manifest.json` | localhost:3456 관찰 | Playwright 공식 문서
