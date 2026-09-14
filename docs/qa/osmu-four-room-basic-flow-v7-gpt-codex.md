# OSMU 네 방 기본 흐름 QA 재검증 v7

> STAMP | line: osmu | 생성: 2026-09-14 10:39 KST | model: gpt-codex/gpt-5 | agent: qa-verifier | skill: qa | 근거: v63 프로토타입, 확정 요구 정본, 사업 좌표, localhost 실요청, Playwright 원본 캡처 | 고민: 공유 개발 서버 교체로 생긴 전송 오류와 제품 결함을 분리하고, 최종 소스에서 전 검증을 다시 실행했다.

한 줄 결론: 최종 소스에서 기본 API 11/11, 네 방 렌더 4/4, 390, 768, 1024, 1440 실제 이동 20/20과 복귀 5/5, Studio v1 14/14, 전체 회귀 2,266건이 통과했다. 네 방 기능은 PASS다. 지정 v63과 현재 16개 화면의 구조가 모두 달라 디자인 정합과 제품 전체 QA는 NG다.

⛔ 검증실패 보고: `verify-agent-quality.sh`는 배포 환경 접촉 증거가 0건이라 이 로컬 QA 산출물을 반려했다. 과제는 localhost:3456을 지정했고 운영 배포 권한을 주지 않았으므로 운영 호스트로 범위를 넓히지 않았다. 이 문서의 PASS는 네 방 localhost 기능에만 유효하며 QA 승인이나 출고 근거로 사용할 수 없다.

## 요청 추적

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 네 방을 유지하고 생성실에서 성과실까지 이동 | FLOW-UI-V7-01 | 기능 PASS, 디자인 NG | 390, 768, 1024, 1440에서 실제 링크 클릭 20/20, 성과실에서 생성실 복귀 5/5 |
| R19 | 지원 폭에서 반응형과 흐름 색인 유지 | FLOW-UI-V7-02 | 기능 PASS, 디자인 NG | 가로 넘침, 전체 화면 모달, 탐색 차단, 다음 행동 누락 모두 0건 |
| R27, R168 | 학습 정보를 반영한 후보 생성과 무료 다시 만들기 | STUDIO-V1-V7 | PASS | localhost 실요청 14/14 |
| R193 | 편집 결과를 발행실과 발행 큐로 연결 | FLOW-API-V7-01 | PASS | 장면 순서 변경, 문장 삭제와 복원, 발행 큐 HTTP 201 관찰 |
| R201 | 사족과 영문 단추 라벨 금지 | FLOW-UI-V7-03 | PASS | 최종 캡처 20장에서 금지 문구를 발견하지 못함 |
| R205, R206 | 네 방 상단 일관성과 실제 수준 충실도 | DESIGN-V7-01 | NG | v63 원본과 현재 PNG의 공통 셸, 요소 순서, 열 수, 담당 패널, 버튼 위계가 다름 |
| R207 | 성과실에서 실행 가능한 다음 행동 제공 | FLOW-UI-V7-04 | 기능 PASS, 디자인 NG | 성과 제안 3건과 생성실 복귀 5/5. v63 정보 구조는 미계승 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 전건 추적표 판정을 유지하고 이번 기능 PASS 범위에 넣지 않음 |

## 실행 결과

| 단계 | 상태 | 증거와 비고 |
|---|---|---|
| canonical 단계 | 진행 중 | 메인 repo `pipeline-state.osmu.md`가 착수 때 이미 `current_stage: qa`. 승인 상태는 변경하지 않음 |
| backend build와 test | PASS | 별도 Spring backend 없음. Next Route Handler 포함 전체 Vitest 346파일, 2,266건 PASS, 조건부 3건 제외 |
| web build와 test | PASS | `npx tsc --noEmit` 종료 코드 0, `npm run build` 정적 페이지 184/184. 기존 NFT 추적 경고 1건 |
| mobile typecheck | 해당 없음 | Expo 또는 mobile 패키지가 이번 범위에 없음 |
| health | PASS | 최종 webpack localhost:3456에서 HTTP 200, DB up, 응답 3ms |
| seed | PASS | `apply-schema.sh --seed`로 schema, 지정 작업 공간, RLS, 확장과 역할을 멱등 적용 |
| 주요 API | PASS | `verify-basic-flow-e2e.mjs` 11/11. 후보 3장, 초안 인계, 순서 변경, 삭제와 복원, 편집 완료, 큐 201, 제안 3건, 재인계, 지표 조회 |
| 네 방 단면 | PASS | `probe-four-room-flow.mjs` 4/4. 가린 모달, 브라우저 401, 콘솔 오류 0건 |
| 사람 클릭 4개 폭 | PASS | 390 라이트와 다크, 768, 1024, 1440 라이트에서 20화면과 복귀 5/5. 가로 넘침 0 |
| Studio v1 | PASS | `verify-studio-v1-e2e.mjs` 14/14 |
| Maestro | 해당 없음 | 대상은 Next.js Web이고 Maestro 구성이 없음 |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`, 디자인 토큰 위반 0건 |
| 디자인 정합 | NG | v63 원본과 현재 16개 조합 모두 구조 불일치 |
| 운영 배포 | 미검증 | 실제 배포 버전, 외부 계정 발행과 운영 성과 회수는 확인하지 않음 |

원본 증거는 `logs/diff/osmu-four-room-flow-20260914-v7/captures/`에 있다. 동적 URL은 `/studio?room=create`, `/studio?room=edit`, `/studio?room=publish`, `/performance`다. `observations.json`에는 방 관찰 20건, 복귀 5건, 가로 넘침 0, 전체 화면 모달 0, 탐색 차단 0, 다음 행동 누락 0, 콘솔 오류 0, 401 URL 0이 기록돼 있다. 최종 화면과 실행에 사용한 `dashboard/src`와 `dashboard/scripts` 합성 SHA-256은 `9fb3ed473b15475efaa9753508f4ead4e7a0c965af6b3991f2996feb37bc721e`다.

## 결함과 수정

### ISSUE-012: 공유 서버 교체가 네 방 실패처럼 관찰됨

첫 단면 탐침은 생성실이 120초 안에 보이지 않아 종료 코드 1이었다. 두 번째 탐침은 네 방을 모두 그렸지만 실행 중 localhost:3456 서버 PID가 바뀌어 `ERR_CONNECTION_RESET`과 `ERR_INCOMPLETE_CHUNKED_ENCODING` 19건으로 실패했다. 제품 성공으로 세지 않고 QA tracker에 즉시 NG로 남겼다.

서버가 프로젝트 표준 `next dev --webpack`으로 안정화된 뒤 기본 스크립트를 인자 변경 없이 다시 실행했다. 최종 단면은 4/4, 4개 폭은 20/20과 복귀 5/5로 통과했고 401과 콘솔 오류가 0건이었다. 서버 교체는 실행환경 경합이었으며 제품 소스 수정으로 덮지 않았다.

### ISSUE-013: 공통 단추 회귀 검사가 새 44px 계약을 따라가지 못함

첫 전체 Vitest는 345파일 중 1파일의 단추 variant 3건이 실패했다. 공통 단추는 새 `ds-touch-target`으로 가로와 세로 44px 하한을 구현했지만 기존 검사는 제거된 `min-w-max` class를 계속 요구했다. 실제 DOM 계약을 보존하면서 `DesignSystem.test.tsx`가 `ds-touch-target` 존재와 `min-w-max` 부재를 검증하도록 고쳤다.

집중 회귀 20/20 뒤 전체 Vitest를 다시 실행해 346파일, 2,266건 통과와 조건부 3건 제외, 실패 0을 확인했다. 수정 커밋은 `92635f06`이다.

## 디자인 정합 매트릭스

판정 축은 A 주축 방향, B 요소 순서, C 열 수, D 정렬과 여백, E 표시와 숨김, F 글꼴 계열과 크기 단계, G 버튼 위계, H 해당 폭 종합이다. 기준 원본은 `docs/design/captures/osmu-four-room-prototype-v63-20260912/`, 실제 원본은 `logs/diff/osmu-four-room-flow-20260914-v7/captures/`다.

| 요청번호 | 화면 | 폭 | 핵심 차이 | A | B | C | D | E | F | G | H |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| R08, R205, R206 | 생성실 | 390 | v63 모바일 헤더와 하단 담당, 현재 상단 단계와 세로 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 768 | v63 좌측 제작 순서와 우측 담당, 현재 아이콘 레일과 단일 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1024 | v63 후보 3열과 우측 담당, 현재 입력 중심 2열 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1440 | 와이드 셸, 카드 밀도, 학습 패널과 버튼 위계가 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 390 | v63 목차와 미리보기 및 하단 담당, 현재 상단 단계 중심 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 768 | v63 3영역 압축 셸, 현재 세로 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 1024 | 목차, 편집, 담당의 열 비율과 순서가 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 1440 | v63 영상 편집 3열, 현재 빈 상태와 우측 담당 2열 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 390 | v63 발행 행동과 미리보기 우선, 현재 세로 본문 우선 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 768 | v63 제작 순서와 담당 고정, 현재 상단 단계와 긴 카드 목록 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 1024 | v63 중앙 미리보기와 우측 담당, 현재 본문 구성이 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 1440 | 와이드 발행 셸, 버튼 위계와 미리보기 밀도가 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 390 | v63 성과 카드 우선, 현재 담당과 단계 안내 우선 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 768 | v63 3열 압축, 현재 담당과 성과의 세로 순서 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1024 | v63 중앙 성과와 우측 담당, 현재 대시보드와 담당 구성이 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1440 | 와이드 셸, 버튼 위계, 데이터 밀도가 다름 | NG | NG | NG | NG | NG | NG | NG | NG |

v63의 390 캡처는 390x814, 768은 768x822, 1024는 1024x822이며 이름이 1440인 원본은 실제 1394x796이다. 현재 캡처는 각각 390x844, 768x1024, 1024x1200, 1440x1200이다. 픽셀 크기가 달라 배치 속성으로 판정했고 모든 화면에서 구조 차이가 명확하다.

과제는 v63을 확정 기준으로 지정하지만 canonical pipeline의 최신 승인 `design_hub`는 v68이다. 기준을 임의로 바꾸지 않았고 이 충돌도 디자인 PASS를 막는다.

## 기존 구현 보존

- 기존 구현 확인: 네 방 Route, 기본 11단계 API, Studio v1, 성과 제안과 생성실 재인계, 4개 폭 검증기가 이미 있었다.
- 유지한 기존 기능: 생성, 편집, 발행, 성과, 제안 재인계, 라이트와 다크, 모바일 메뉴, production build 경로를 보존했다.
- 추가와 변경: 새 44px 단추 계약에 맞게 공통 단추 회귀 예상만 갱신했다. 제품 화면, API, DB 스키마, 배포 설정은 바꾸지 않았다.

## 페르소나 결정

김민서가 생성실에서 성과실까지 한 번의 작업 흐름을 길을 잃지 않고 완주할 수 있는가: 현재 localhost 기능에서는 그렇다. 네 방 링크와 다음 행동이 4개 폭에서 작동했고 성과실에서 생성실로 돌아왔다. 다만 승인 기준과 다른 정보 구조 때문에 제품 전체 출고 가능으로 확대할 수 없다.

## 레드팀과 셀프심문

까다로운 고객의 반론: 빈 상태 중심 클릭은 실제 편집과 발행을 증명하지 않는다. 대응: 브라우저는 네 방 이동, 가림과 다음 행동을 검증했고 별도 기본 API 11단계가 실제 초안 편집, 삭제와 복원, 발행 큐 HTTP 201을 검증했다. 외부 채널 실발행은 미검증으로 남겼다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 공유 작업 트리의 병렬 변경이 관찰 뒤 소스를 바꾼 것이다. 대응: 최종 `dashboard/src`와 `dashboard/scripts` 합성 해시를 고정하고 전체 회귀, 기본 11단계, Studio v1, 네 방 단면과 4개 폭을 다시 실행했다. 이후 변경과 운영 배포는 보장하지 않는다.

## 벤치마크 적용

- Playwright의 사용자 지향 locator와 actionability를 실제 방 표시, 클릭 가능성, URL 이동 완료 판정에 적용했다: https://playwright.dev/docs/locators, https://playwright.dev/docs/actionability
- Playwright의 명시적 viewport와 screenshot 방식을 390, 768, 1024, 1440 원본 증거에 적용했다: https://playwright.dev/docs/emulation, https://playwright.dev/docs/screenshots

RUBRIC_SCORE: 완결성=5/5 정밀성=5/5 벤치마크=5/5 추적성=5/5 전문성=5/5 total=25/25
WEAKEST_LINE: 운영 배포와 실제 외부 채널 발행은 이번 localhost 증거가 보장하지 않는다.

SKILLS_USED: `qa`, localhost 실제 탐색, 회귀 우선, 시각 대조, 결함 기록과 최종 판정에 사용 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: BRAIN의 OSMU 사업 허브, repo의 v63 프로토타입, 확정 요구 정본, 사업 좌표, 테스트 계획, 디자인 manifest, Playwright 공식 기준을 조회했다.
HITS_USED: 사업 좌표는 첫 사용자와 네 방 역할, 요청 정본은 요청번호 추적, v63과 원본 PNG는 디자인 판정, Playwright는 사용자 클릭과 캡처 판정에 사용했다.
HITS_REJECTED: 다른 벤처 자료와 일반 마케팅 사례는 이번 동작 QA 판정에 직접 필요하지 않아 제외했다.
CONFLICTS: 과제의 확정 기준 v63과 canonical pipeline 승인 핀 v68이 충돌한다. 기능 판정에는 영향이 없지만 디자인 PASS와 QA 승인을 차단한다.

SOURCES/MODEL: gpt-codex/gpt-5 | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/거버넌스/요청.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md` | `docs/plan/persona.md` | `docs/design/README.md` | `docs/design/captures/manifest.json` | `logs/diff/osmu-four-room-flow-20260914-v7/captures/` | https://playwright.dev/docs/locators | https://playwright.dev/docs/screenshots
