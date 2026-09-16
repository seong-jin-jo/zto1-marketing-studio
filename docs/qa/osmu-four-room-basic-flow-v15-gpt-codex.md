# OSMU 네 방 기본 흐름 QA 재검증 v15

> STAMP | line: osmu | 생성: 2026-09-16 03:18 KST | model: gpt-codex/gpt-5.6-sol | agent: qa-verifier | skill: qa | 근거: v63 프로토타입, 확정 요구 정본, 사업 좌표, localhost 실요청, Playwright 원본 캡처 | 고민: 공유 서버 종료를 제품 실패와 분리하고 실행 커밋이 일치하는 단일 서버에서 전 동선을 재검증했다.

한 줄 결론: 커밋 `4a44136d`의 localhost 실행본에서 네 방 기능은 API 11/11, 단면 4/4, 4개 폭 방 화면 20/20, 성과실에서 생성실 복귀 5/5, Studio v1 14/14로 끊김 없이 통과했다. 다만 확정 디자인 핀이 v63과 v68로 충돌하고 Next 개발 타입 생성물이 손상되므로 제품 전체 QA와 배포는 NG다.

## 요청 추적

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 백엔드 기본 흐름 관통 | FLOW-API-V15 | PASS | 지정 작업 공간 localhost 실요청 11/11. `commands/08-basic-flow-controlled.log` |
| R08, R19, R207 | 네 방 렌더와 390, 768, 1024, 1440 실제 클릭 이동 | FLOW-UI-V15 | PASS | 단면 4/4, 화면 20/20, 복귀 5/5. 가린 모달, 가로 넘침, 브라우저 401, 콘솔 오류 0건. `captures-final/observations.json` |
| R27, R168 | Studio v1 생성, 조회, 거절, 무료 다시 만들기 | STUDIO-V1-V15 | PASS | 동일 서버 실요청 14/14. `commands/11-studio-v1-controlled.log` |
| R104 | QA 임시 자격증명 정리 | FLOW-CLEANUP-V15 | PASS | 최종 UI 검증 종료 코드 0. 단, 서버가 중간 종료된 첫 시도의 토큰 1건은 폐기 응답을 받지 못해 별도 운영 점검 필요 |
| 필수 회귀 | TypeScript, seed, 디자인 lint | FLOW-REGRESSION-V15 | 범위 PASS | 손상된 `.next/dev/types`를 `/tmp`에 보존 이동한 뒤 정확한 `npx tsc --noEmit` 종료 0. schema, seed, RLS 종료 0. 디자인 토큰 위반 0 |
| R193, R205, R206 | 승인 프로토타입과 UI 계승 계약 | DESIGN-V15 | NG | 과제 지정 v63과 canonical 승인 v68 핀이 충돌한다. 현재 구현은 v63의 방별 3열 정보 구조와 모든 폭에서 불일치 |
| R01부터 R207 중 이번 범위 밖 | 회장 확정 요구 승계 | REQ-ALL-V15 | 이월 | 이번 네 방 직접 관련 요청만 실행 판정하고 나머지는 이월 |
| 제품 전체 | 운영 배포와 외부 채널 실발행 | QA-QUALITY-GATE-V15 | NG | localhost 기능 범위만 관찰. 운영 배포 버전과 실제 외부 발행은 미검증 |

## 실행 결과

| 단계 | 상태 | 증거와 비고 |
|---|---|---|
| canonical 단계 | 진행 중 | `pipeline-state.osmu.md`가 착수 때 이미 `current_stage: qa`. 승인 상태는 변경하지 않음 |
| backend | PASS | 별도 Spring backend 없음. Next Route Handler 기본 흐름 11/11 |
| 전체 `npm run test` | NG | 착수 전체 실행은 366파일, 2,345건 PASS와 조건부 3건 제외. 최종 재실행에서는 발행 경계 2건이 각각 5초 timeout으로 실패했고 이후 회귀는 종료 전 중단. 최신 전체 PASS로 인정하지 않음 |
| web TypeScript | 재생성 후 PASS | Next 16.2.2 dev가 `.next/dev/types/routes.d.ts`를 잘라 생성해 최초 실패. 정식 `next typegen` 결과를 유지하고 손상 dev 생성물을 `/tmp/osmu-next-dev-types-broken-v15-20260916-0310`에 보존 이동한 뒤 정확한 `npx tsc --noEmit` 종료 0 |
| mobile | 해당 없음 | Expo 또는 mobile 패키지가 이번 범위에 없음 |
| health | PASS | 통제 서버 첫 health HTTP 200, DB up, `build_commit=4a44136d…`와 시작 HEAD 일치 |
| seed | PASS | schema, 지정 작업 공간, seed, RLS 멱등 적용 종료 0 |
| 주요 API | PASS | 기본 흐름 11/11, Studio v1 14/14 |
| Playwright | PASS | 390 라이트와 다크, 768, 1024, 1440 라이트 화면 20/20, 복귀 5/5 |
| Maestro | 해당 없음 | 대상은 Next.js Web이며 Maestro 구성이 없음 |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`, 위반 0 |
| 디자인 정합 | NG | v63과 현재 UI의 구조 불일치, 승인 핀 충돌 |
| 운영 배포 | 미검증 | localhost 이외 배포본과 외부 계정 실발행은 확인하지 않음 |

실행 중 다른 워커 소유 서버가 내려간 첫 시도는 390 라이트 성과실에서 timeout과 health HTTP 000을 남겼다. 이를 제품 결함으로 세지 않고 QA가 시작과 종료를 소유한 서버에서 전체를 다시 실행했다. 최종 원본은 `logs/diff/osmu-four-room-flow-20260916-v15/captures-final/`이고 동적 URL은 `/studio?room=create`, `/studio?room=edit`, `/studio?room=publish`, `/performance`다.

## 디자인 정합 매트릭스

판정 축은 A 주축 방향, B 요소 순서, C 열 수, D 정렬과 여백, E 표시와 숨김, F 글꼴 계열과 크기 단계, G 버튼 위계, H 해당 폭 종합이다.

| 요청번호 | 화면 | 폭 | 핵심 차이 | A | B | C | D | E | F | G | H |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| R08, R205, R206 | 생성실 | 390 | v63 후보 카드와 하단 담당, 현재 상단 단계와 입력 중심 세로 흐름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 768 | v63 좌측 제작 순서와 우측 담당, 현재 아이콘 레일과 단일 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1024 | v63 후보 3열과 우측 담당, 현재 입력 중심 2열 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1440 | 와이드 셸, 카드 밀도, 학습 패널과 버튼 위계가 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 390 | v63 목차와 미리보기 및 하단 담당, 현재 단계 중심 세로 흐름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 768 | v63 3영역 압축 셸, 현재 빈 상태와 세로 본문 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 1024 | 목차, 편집, 담당의 열 비율과 순서가 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 1440 | v63 영상 편집 3열, 현재 빈 상태와 우측 담당 2열 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 390 | v63 발행 행동과 미리보기 우선, 현재 세로 본문 우선 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 768 | v63 제작 순서와 담당 고정, 현재 상단 단계와 카드 목록 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 1024 | v63 중앙 미리보기와 우측 담당, 현재 연결 안내와 카드 구성이 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 1440 | 와이드 발행 셸, 버튼 위계와 미리보기 밀도가 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 390 | v63 성과 카드 우선, 현재 담당과 단계 안내 우선 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 768 | v63 3열 압축, 현재 담당과 성과의 세로 순서 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1024 | v63 중앙 성과와 우측 담당, 현재 대시보드와 담당 구성이 다름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1440 | 와이드 셸, 버튼 위계와 데이터 밀도가 다름 | NG | NG | NG | NG | NG | NG | NG | NG |

## 기존 구현 보존과 페르소나 결정

- 기존 구현 확인: 네 방 Route, 기본 11단계 API, Studio v1, 성과 제안과 생성실 재인계, 4개 폭 검증기가 이미 있었다.
- 유지한 기존 기능: 생성, 편집, 발행, 성과, 제안 재인계, 라이트와 다크, 모바일 메뉴를 보존했다.
- 추가와 변경: 브라우저 검증기의 Next client navigation 대기를 주소 문자열 관찰로 바꾸고 회귀 테스트를 남긴 작업트리를 검증했다. 화면, API 계약과 DB 스키마는 변경하지 않았다.
- 페르소나 결정: 김민서는 현재 localhost 기능에서 생성실부터 성과실까지 길을 잃지 않고 완주할 수 있다. 다만 승인 디자인 정합과 운영 실발행은 별도 NG다.

## 레드팀과 셀프심문

까다로운 고객의 반론: 자동 스크립트가 녹색이어도 실제 화면이 잘리거나 다음 행동이 가려질 수 있다. 대응: 네 폭 원본 20장을 남기고 390 생성실, 768 편집실, 1024 발행실, 1440 성과실을 직접 열어 요소 순서, 가림, 잘림과 다음 행동을 관찰했다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 검증 서버가 현재 소스와 다른 실행본일 가능성이다. 대응: 통제 서버의 첫 health `build_commit`과 시작 HEAD가 `4a44136d`로 같은 것을 확인하고 그 서버 하나에서 네 live suite를 연속 실행했다. 이후 HEAD의 문서 전용 커밋은 실행 제품 코드 판정에 포함하지 않았다.

## 벤치마크 적용

- Playwright emulation의 명시적 viewport를 390, 768, 1024, 1440에 적용했다: https://playwright.dev/docs/emulation
- Playwright screenshot API로 원본 PNG를 폭별로 분리 보존했다: https://playwright.dev/docs/screenshots
- ConsoleMessage API를 이용해 콘솔 오류 0건을 별도 판정했다: https://playwright.dev/docs/api/class-consolemessage

RUBRIC_SCORE: 완결성=4/5 정밀성=5/5 벤치마크=5/5 추적성=5/5 전문성=4/5 total=23/25
WEAKEST_LINE: Next 개발 타입 생성물 손상은 도구 결함으로 분리했지만 영구 해결은 아직 아니다.

SKILLS_USED: `qa`, 실서버 동선, 회귀 우선, 화면 원본 관찰, 실패 원인 분리에 사용 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: BRAIN의 OSMU 사업 좌표, repo의 v63 프로토타입, 확정 요구 정본, 디자인 README와 captures manifest, Playwright 공식 viewport, screenshot, console 기준을 조회했다.
HITS_USED: 사업 좌표는 첫 사용자와 네 방 역할, 요청 정본은 요청번호 추적, v63은 디자인 판정, Playwright 문서는 실제 클릭과 4폭 캡처 기준에 사용했다.
HITS_REJECTED: 다른 벤처 자료와 과거 미측정 사업 수치는 localhost 기능 통과 근거가 아니므로 제외했다. 루트 `docs/test-plan.md`와 `docs/ONE_THING.md`는 존재하지 않아 읽지 못했다.
CONFLICTS: 과제의 확정 기준 v63과 canonical pipeline 승인 핀 v68이 충돌한다. 기능 판정에는 영향이 없지만 디자인 PASS와 QA 승인을 차단한다.

SOURCES/MODEL: gpt-codex/gpt-5.6-sol | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `pipeline-state.osmu.md` | `docs/design/captures/manifest.json` | `logs/diff/osmu-four-room-flow-20260916-v15/captures-final/` | https://playwright.dev/docs/emulation | https://playwright.dev/docs/screenshots | https://playwright.dev/docs/api/class-consolemessage
