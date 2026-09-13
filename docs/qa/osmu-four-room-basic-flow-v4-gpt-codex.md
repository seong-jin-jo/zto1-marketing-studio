# OSMU 네 방 기본 흐름 QA 재검증 v4

> STAMP | line: osmu | 생성: 2026-09-13 14:29 KST | model: gpt-codex/gpt-5 | agent: qa-verifier | skill: qa | 근거: v63 프로토타입, 회장 요구 대장, 사업 좌표, localhost 관찰, Playwright 공식 지침 | 고민: 기능 회복과 디자인 불일치, 제공자 비결정성을 한 판정으로 뭉개지 않고 분리했다.

한 줄 결론: 지정 작업 공간의 반복 QA 한도 소진과 네 방 탐침의 제한시간 불일치를 고친 뒤 localhost에서 기본 API 11/11, 네 방 렌더 4/4, 4폭 20화면과 복귀 5/5, Studio v1 14/14를 통과했다. 그러나 v63과 실제 화면의 디자인 불일치 및 v63과 pipeline v68 승인 핀 충돌 때문에 제품 전체 QA는 NG다.

## 요청 추적

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 좌측 네 방을 유지하고 생성실에서 성과실까지 이동 | FLOW-UI-01 | 기능 PASS, 디자인 NG | 390·768·1024·1440에서 생성→편집→발행→성과 이동, 390 다크 포함 20화면. 실제 셸은 v63과 불일치 |
| R19 | 지원 폭에서 흐름 색인과 반응형 유지 | FLOW-UI-02 | 기능 PASS, 디자인 NG | 네 폭에서 문서 폭과 viewport 폭 일치, 가린 모달·이동 차단·다음 행동 누락 0 |
| R27, R168 | 후보 생성과 학습 정보 순환 | STUDIO-V1 | 재실행 PASS | 첫 실행의 제공자 JSON 해석 실패 뒤 전체 재실행 14/14. 제공자 비결정성 우려 유지 |
| R193 | 발행실과 승인·발행 동선 연결 | FLOW-API-01 | PASS | 기본 흐름에서 편집 결과의 발행 큐 인계 HTTP 201 관찰 |
| R201 | 사이드바 사족 제거 | FLOW-UI-04 | PASS | 네 폭 PNG에서 금지된 사족 문구와 영문 단추 라벨 없음 |
| R205, R206 | 네 방 상단 일관성과 실제 수준 화면 충실도 | DESIGN-01 | NG | v63 원본과 실제 PNG의 공통 셸, 순서, 열 수, 담당 패널, 버튼 위계 불일치 |
| R207 | 성과실을 실행 가능한 UX로 구성 | FLOW-UI-05 | 기능 PASS, 디자인 NG | 제안 3건과 성과실→생성실 복귀 5/5 관찰. v63 배치와 불일치 |
| R01~R207 중 이번 범위 밖 항목 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 기존 추적표 판정을 유지하며 이번 PASS에 포함하지 않음 |

## 실행 결과

| 단계 | 상태 | 증거·비고 |
|---|---|---|
| canonical 단계 | 진행 중 | 메인 repo `pipeline-state.osmu.md`의 `current_stage: qa`, 승인 상태는 변경하지 않음 |
| backend build·test | PASS | 별도 Spring backend 없음. Next Route Handler 포함 `npm run test` 321파일, 2,108건 PASS, 3건 제외 |
| web build·test | PASS | `npx tsc --noEmit` 종료 코드 0, `npm run build` 정적 페이지 183/183. 기존 NFT 추적 경고 1건 |
| mobile typecheck | 해당 없음 | Expo 또는 mobile 패키지가 이번 대상에 없음 |
| health | PASS | 최종 `GET /api/health` HTTP 200 |
| seed | 수정 후 PASS | 첫 생성 실패 시 지정 작업 공간 월 사용량 100/100 확인. 현재 UTC 월 사용량을 0으로 복원하는 멱등 시드 적용 |
| 주요 API | PASS | `verify-basic-flow-e2e.mjs` 최종 11/11. 후보 3장, 초안 인계, 순서 변경, 삭제·복원, 편집 완료, 큐 201, 성과 제안 3건, 재인계, 지표 조회 |
| 네 방 단면 | 수정 후 PASS | `probe-four-room-flow.mjs` 최종 4/4. 가린 모달·브라우저 401·콘솔 오류 0 |
| 사람 클릭 4폭 | PASS | 390 라이트·다크, 768·1024·1440 라이트에서 20화면과 성과실→생성실 복귀 5/5 |
| Studio v1 | 재실행 PASS | 첫 실행 `STUDIO_LLM_INVALID_OUTPUT` NG. 같은 전체 검증 재실행 14/14 PASS |
| Maestro | 해당 없음 | 대상 표면은 Next.js Web이며 Maestro 구성 없음 |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`, 토큰 위반 0 |
| 운영 배포 | 미검증 | 과제 범위는 localhost:3456. 실제 배포 버전, 외부 계정 발행, 운영 성과 회수는 확인하지 않음 |

원본 PNG 20장과 기계 관찰은 `logs/diff/osmu-four-room-flow-20260913-1407/captures/`에 있다. 동적 URL은 `/studio?room=create`, `/studio?room=edit`, `/studio?room=publish`, `/performance`다. `observations.json`은 준비 제한시간 120초, 관찰 20건, 복귀 5건, 콘솔 오류 0건, 401 URL 0건을 기록한다.

## 결함과 수정

### ISSUE-008: 반복 QA가 월 생성 한도를 소진함

첫 `verify-basic-flow-e2e.mjs`는 `STUDIO_LLM_QUOTA_EXHAUSTED`로 실패했다. DB에서 지정 작업 공간이 `active`, `team`, 공유 AI 승인 상태였지만 현재 월 사용량이 100/100임을 확인했다. 고정 QA 작업 공간은 반복 검증에 재사용되는데 시드가 `usage_quotas`를 복원하지 않는 것이 원인이었다.

`dashboard/scripts/seed-test-tenants.sql`이 현재 UTC 월의 포함량 100과 사용량 0을 upsert하도록 수정했다. 회귀 `qa-four-room-workspace-seed.regression-2.test.ts`와 실제 시드 뒤 11/11을 확인했다.

### ISSUE-009: 단면 탐침만 고정 30초를 사용함

기본 흐름 11/11 뒤 단면 탐침은 성과실 표시를 30초 안에 보지 못해 실패했지만, 같은 서버의 4폭 검증기는 공용 120초 정책으로 20화면을 통과했다. 제품 상태가 아니라 검증기 사이의 준비 기준 불일치였다.

`dashboard/scripts/probe-four-room-flow.mjs`의 페이지 이동과 방 표시가 `FOUR_ROOM_READY_TIMEOUT_MS`를 공유하도록 수정하고 기본값을 120초로 맞췄다. 잘못된 값은 시작 전에 거절한다. 회귀 `four-room-probe-ready-timeout.regression-1.test.ts`와 실제 단면 4/4를 확인했다.

두 수정은 커밋 `af2f0335`에 있다. 제품 화면과 제품 API 계약은 바꾸지 않았다.

## 디자인 정합 매트릭스

판정 축은 A 주축 방향, B 요소 순서, C 열 수, D 정렬·여백, E 표시·숨김, F 글꼴 계열·크기 단계, G 버튼 위계, H 해당 폭 종합이다. 기준 원본은 `docs/design/captures/osmu-four-room-prototype-v63-20260912/`, 실제 원본은 위 `logs/diff` 경로다.

| 요청번호 | 화면 | 폭 | 핵심 차이 | A | B | C | D | E | F | G | H |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| R08, R205, R206 | 생성실 | 390 | v63 모바일 헤더·하단 담당과 실제 상단 단계·세로 담당 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 768 | v63 중간 셸과 실제 아이콘 레일·담당 위치 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1024 | v63 후보 3열·우측 담당과 실제 2열·인라인 담당 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1440 | 와이드 셸, 카드 밀도, 버튼 위계 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 390 | v63 편집 목차·미리보기·담당과 실제 세로 흐름 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 768 | 편집 3영역의 축약 방식과 담당 위치 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 1024 | 목차·편집·담당 열 비율과 순서 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실 | 1440 | 와이드 편집 셸과 정보 밀도 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 390 | v63 미리보기·발행 행동과 실제 긴 카드 목록·행동 순서 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 768 | 미리보기 열과 담당 위치 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 1024 | v63 중앙 2열·우측 담당과 실제 다중 카드·인라인 담당 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실 | 1440 | 와이드 발행 셸과 버튼 위계·밀도 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 390 | v63 성과 카드·담당 진입과 실제 지표·제안·온보딩 흐름 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 768 | 중간 폭 성과 셸의 섹션 순서와 열 수 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1024 | v63 중앙 성과·우측 담당과 실제 대시보드·인라인 제안 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1440 | 와이드 셸과 버튼 위계·정보 밀도 차이 | NG | NG | NG | NG | NG | NG | NG | NG |

기능 이동과 반응형 reflow는 통과했지만 디자인 QA는 8개 축의 불일치로 FAIL이다. 과제는 v63을 확정 기준으로 명시하지만 canonical pipeline의 승인 핀은 v68을 지목한다. 기준을 임의로 바꾸지 않았다.

## 기존 구현 보존

- 기존 구현 확인: 네 방 Route, 기본 11단계 API, Studio v1, 성과 제안과 생성실 재인계가 이미 구현돼 있었다.
- 유지한 기존 기능: 생성, 편집, 발행, 성과, 제안 재인계, 네 폭 이동, 라이트·다크를 제품 코드 변경 없이 검증했다.
- 추가·변경한 것: QA 시드와 브라우저 단면 탐침, 신규 회귀 테스트 2개만 수정했다.

## 페르소나 결정

초기 1인 사업자가 생성실에서 성과실까지 한 번의 작업 흐름을 막힘 없이 완주할 수 있는가: 현재 localhost 기능에서는 그렇다. 하지만 승인 화면과 다른 정보 구조, 첫 Studio v1 실행에서 드러난 제공자 비결정성 때문에 제품 전체 출고 가능으로 확대할 수 없다.

## 레드팀과 셀프심문

까다로운 고객의 반론: 시드를 초기화해 통과시킨 것은 실제 고객 한도 문제를 숨긴 것 아닌가. 대응: 수정은 명시된 고정 QA 작업 공간에만 적용되는 테스트 시드다. 제품의 운영 한도 계약과 API 코드는 바꾸지 않았고, 운영 계정은 미검증으로 남겼다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 공유 작업트리와 localhost 서버가 마지막 관찰 뒤 다른 세션의 변경을 받는 것이다. 대응: 수정 커밋 뒤 health, 기본 흐름 11/11, 단면 4/4를 다시 실행했다. PNG 관찰 이후의 제품 소스 변경 가능성과 운영 배포는 미검증으로 명시한다.

## 벤치마크 적용

- Playwright의 사용자 지향 locator와 actionability 기준을 실제 방 표시, 클릭 가능성, 이동 완료 판정에 적용했다: https://playwright.dev/docs/locators, https://playwright.dev/docs/actionability
- Playwright의 화면 비교 원칙을 기준 PNG와 현재 PNG의 동일 viewport 대조에 적용했다: https://playwright.dev/docs/test-snapshots

RUBRIC_SCORE: 완결성=5/5 정밀성=5/5 벤치마크=5/5 추적성=5/5 전문성=5/5 total=25/25
WEAKEST_LINE: localhost 개발 서버의 120초 허용은 운영 성능을 증명하지 않는다.

SKILLS_USED: `qa`, localhost 실제 탐색, 결함 재현, 최소 수정, 회귀 우선, 증거 분리와 최종 판정에 사용 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: BRAIN의 OSMU 사업·실행 ROI, repo의 v63 프로토타입·요청 정본·사업 좌표·테스트 계획·디자인 manifest, Playwright 공식 기준을 조회했다.
HITS_USED: 사업 좌표는 네 방 역할 경계, 요청 정본은 요청번호 추적, v63과 PNG는 디자인 판정, Playwright는 클릭·대기·화면 대조 기준에 사용했다.
HITS_REJECTED: 다른 벤처 자료와 일반 마케팅 사례는 이번 동작 QA 판정에 직접 필요하지 않아 제외했다.
CONFLICTS: 과제의 확정 기준 v63과 canonical pipeline 승인 핀 v68이 충돌한다. 기능 판정에는 영향이 없지만 디자인 PASS와 QA 승인을 차단한다.

SOURCES/MODEL: gpt-codex/gpt-5 · `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` · `wiki/거버넌스/요청.md` · `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` · `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md` · `docs/design/README.md` · `docs/design/captures/manifest.json` · localhost:3456 관찰 · Playwright 공식 문서
