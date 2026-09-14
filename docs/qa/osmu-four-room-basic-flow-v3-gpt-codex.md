# OSMU 네 방 기본 흐름 QA 재검증 v3

> STAMP | line: osmu | 생성: 2026-09-13 12:01 KST | model: gpt-codex/gpt-5 | agent: qa-verifier | skill: qa | 근거: v63 프로토타입, 회장 요구 대장, 사업 좌표, localhost 관찰, Playwright 공식 지침, WCAG 2.2 | 고민: 네 방 기능 통과, 검증기 결함, 디자인 불일치, 외부 한도 차단을 서로 다른 판정으로 보존했다.

한 줄 결론: localhost의 네 방 기본 흐름은 검증기 제한시간 결함을 고친 뒤 실제 API 11/11, 네 방 렌더 4/4, 4폭 20화면과 복귀 5/5로 통과했다. 그러나 Studio v1 최종 재실행은 공유 AI 월간 한도 소진으로 HTTP 429였고, v63 디자인과 실제 화면도 불일치하므로 제품 전체 QA는 NG다.

⛔ 검증실패 보고: 상위 `verify-agent-quality.sh`는 배포 환경 접촉 증거가 0건이라 FAIL을 반환했다. 과제는 localhost:3456을 명시했고 배포 권한을 주지 않았으므로 운영 호스트로 범위를 넓히지 않았다. 이 문서의 PASS는 네 방 로컬 기능에만 유효하며 출고 승인으로 사용할 수 없다.

## 요청 추적

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 좌측 네 방을 유지하고 생성실에서 성과실까지 이동 | FLOW-UI-01 | 기능 PASS, 디자인 NG | 390·768·1024·1440에서 생성→편집→발행→성과 이동 5세트 성공. 실제 셸은 v63과 불일치 |
| R19 | 지원 폭에서 흐름 색인과 반응형 유지 | FLOW-UI-02 | 기능 PASS, 디자인 NG | 네 폭에서 가로 넘침·가린 모달·이동 차단·다음 행동 누락 0 |
| R27, R168 | 후보 생성과 학습 정보 순환 | STUDIO-V1 | NG | 앞선 같은 소스 실행은 14/14였으나 최종 실행의 정상 생성 단계가 `STUDIO_LLM_QUOTA_EXHAUSTED`, HTTP 429로 차단됨 |
| R193 | 발행실과 승인·발행 동선 연결 | FLOW-UI-03 | 이동 PASS, 디자인 NG | 발행실 렌더와 다음 행동 관찰. v63 발행 패널 배치와 불일치 |
| R201 | 사이드바 사족 제거 | FLOW-UI-04 | PASS | 네 폭 캡처에서 금지된 사족 문구 없음 |
| R205, R206 | 네 방 상단 일관성과 실제 수준 화면 충실도 | DESIGN-01 | NG | v63 원본과 실제 PNG의 공통 셸, 순서, 열 수, 담당 패널, 버튼 위계 불일치 |
| R207 | 성과실을 실행 가능한 UX로 구성 | FLOW-UI-05 | 기능 PASS, 디자인 NG | 제안 3건과 성과실→생성실 복귀 5/5 관찰. v63 배치와 불일치 |
| R01~R207 중 이번 범위 밖 항목 | 확정 요구 전건 누락 방지 | REQ-ALL | 이월 | 이번 네 방 기본 흐름 범위 밖 요구는 기존 추적표 판정을 유지하며 PASS로 간주하지 않음 |

## 직접 관찰 결과

| 검증 | 판정 | 관찰 증거 |
|---|---|---|
| 단계 상태 | PASS | canonical `pipeline-state.osmu.md`의 `current_stage: qa` 확인. 단계·승인 상태는 변경하지 않음 |
| localhost health | PASS | `GET /api/health` HTTP 200, `ok=true`, `db=up`, 39ms |
| DB seed | PASS | 지정 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`에 멱등 seed 실행 후 `active`, `team`, `shared_cli_approved=true` 확인 |
| 기본 API 흐름 | PASS | `verify-basic-flow-e2e.mjs` 최종 11/11. 후보 3장, 초안 인계, 순서 변경, 삭제·복원, 편집 완료, 큐 201, 지원 여부, 제안 3건, 재인계, 지표 읽기 |
| 네 방 렌더 | PASS | `probe-four-room-flow.mjs` 최종 4/4. 가린 모달 0, 브라우저 401 0, 콘솔 오류 0 |
| 사람 클릭 4폭 | PASS | 390 라이트·다크, 768·1024·1440 라이트에서 20화면과 성과실→생성실 복귀 5/5. 가로 넘침·전체화면 덮개·이동 차단·다음 행동 누락 0 |
| Studio v1 | NG | 앞선 실행은 14/14 PASS. 최종 재실행은 정상 생성 단계가 공유 AI 월간 한도 소진으로 HTTP 429, 이후 장기 대기를 중단함. 현재 통과로 보고하지 않음 |
| 집중 회귀 | PASS | 제한시간 회귀와 인접 무결성 테스트 3파일 통과 |
| 전체 Web 회귀 | PASS | Vitest 319파일, 2,106건 PASS, 3건 skip, 실패 0 |
| TypeScript | PASS | `npx tsc --noEmit` exit 0 |
| production build | PASS | 현재 소스를 임시 독립 디렉터리에서 build, 정적 페이지 183/183. 기존 NFT 추적 경고 1건 |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`, 토큰 위반 0 |
| mobile·Maestro | 해당 없음 | 대상 표면은 Next.js Web이며 Expo 또는 Maestro 구성 없음 |
| 운영 배포 | 미검증 | 이번 과제는 localhost:3456 범위. 실제 배포 버전, 외부 계정 발행, 운영 성과 회수는 확인하지 않음 |

원본 증거는 `logs/diff/osmu-four-room-flow-20260913-v3/captures/observations.json`과 같은 폴더의 PNG 20장이다. `observations.json`은 대기 제한 120초, 화면 관찰 20건과 복귀 5건, 브라우저 401 0건, 콘솔 오류 0건을 보존한다. 동적 URL은 `/studio?room=create`, `/studio?room=edit`, `/studio?room=publish`, `/performance`다.

## ISSUE-007 원인과 수정

첫 실행은 390 라이트 성과실 데이터 준비를 고정 30초 안에 보지 못해 실패했다. 즉시 재실행은 통과했지만, 최종 재검증에서는 편집실에서 발행실로 이동하는 URL 대기도 같은 고정 30초에 걸렸다. 서버 로그에서 공유 Next 개발 서버의 콜드 컴파일과 배경 API가 20초에서 37초 이상 걸렸고, 수정 후 390 성과실은 90초를 넘긴 뒤 정상 준비됐다.

제품 화면을 바꾸지 않고 QA 검증기의 준비·URL·방 표시 제한시간을 하나의 `FOUR_ROOM_READY_TIMEOUT_MS` 정책으로 통합하고 기본값을 120초로 올렸다. 잘못된 값은 시작 전에 거절한다. 회귀 테스트는 준비, URL, 방 표시, 최초 이동이 모두 같은 제한시간을 쓰며 고정 30초가 남지 않음을 검증한다.

- `d8a65e3d`: 성과실 준비 제한시간과 회귀 테스트 추가
- `7e39d0a7`: URL 이동·방 표시·최초 이동까지 같은 제한시간으로 통합
- 회귀: `dashboard/tests/integrity/four-room-performance-ready-timeout.regression-1.test.ts`

## 디자인 정합 매트릭스

판정 축은 A 주축 방향, B 요소 순서, C 열 수, D 정렬·여백, E 표시·숨김, F 글꼴 계열·크기 단계, G 버튼 위계, H 해당 폭 종합이다. 기준 원본은 `docs/design/captures/osmu-four-room-prototype-v63-20260912/`, 실제 원본은 `logs/diff/osmu-four-room-flow-20260913-v3/captures/`다.

| 요청번호 | 화면 | 폭 | v63 기준과 실제 차이 | A | B | C | D | E | F | G | H |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| R08, R205, R206 | 생성실 | 390 | 모바일 헤더·접힌 담당과 실제 상단 단계·세로 담당 카드 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 768 | v63 중간 셸과 실제 아이콘 레일·담당 위치 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1024 | v63 이름 있는 방 레일·후보 3열·우측 담당과 실제 2열·인라인 담당 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실 | 1440 | 와이드 셸과 카드 밀도·버튼 위계 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
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
| R205, R206, R207 | 성과실 | 1024 | v63 방 레일·중앙 성과·우측 담당과 실제 대시보드·인라인 제안 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실 | 1440 | 와이드 셸과 버튼 위계·정보 밀도 차이 | NG | NG | NG | NG | NG | NG | NG | NG |

기능 이동과 반응형 reflow는 통과했지만 디자인 QA는 8개 축 전부의 불일치 때문에 FAIL이다. 또한 과제는 v63을 확정 기준으로 명시하지만 `pipeline-state.osmu.md`의 승인 핀은 v68을 지목한다. 기준을 임의로 바꾸지 않았다.

## 기존 구현 보존과 변경

- 기존 구현 확인: 네 방 Route, 기본 11단계 API, Studio v1, 성과 제안과 생성실 재인계가 이미 구현돼 있었다.
- 유지한 기존 기능: 생성, 편집, 발행, 성과, 제안 재인계, 네 폭 이동, 라이트·다크 모드를 제품 코드 변경 없이 검증했다.
- 추가·변경한 것: 제품 코드는 수정하지 않았다. QA 브라우저 검증기의 대기 정책과 그 회귀 테스트만 추가했다.

## 페르소나 결정

초기 1인 사업자가 생성실에서 성과실까지 막힘 없이 한 번의 작업 흐름을 완주할 수 있는가: 로컬 기능만 보면 그렇다. 그러나 승인 화면과 다른 정보 구조, 공유 AI 한도 소진 시 생성 불가 때문에 현재 제품 전체를 그 페르소나에게 출고할 수는 없다.

## 레드팀과 셀프심문

까다로운 고객의 반론: 화면 20장을 열었다고 데이터가 네 방을 통과한 것은 아니다. 대응: 브라우저 검사는 이동·가림·반응형만 증명하고, 데이터 인계는 별도의 실제 API 11/11에서 후보·초안·편집·큐·제안 재인계를 관찰했다. Studio v1의 현재 429는 그대로 NG로 남겼다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 공유 작업트리와 개발 서버가 병렬 변경 중이라 마지막 관찰 뒤 소스가 달라지는 것이다. 대응: 수정 후 전체 테스트, TypeScript, build, health, 기본 흐름, probe를 최종 재실행했다. 이후 변경과 운영 배포는 미검증으로 명시한다.

## 벤치마크 적용

- Playwright의 사용자 지향 locator와 actionability 기준을 방 이름, 실제 클릭 가능성, 이동 완료 판정에 적용했다: https://playwright.dev/docs/locators, https://playwright.dev/docs/actionability
- WCAG 2.2 Reflow를 네 폭의 `documentWidth <= viewportWidth`, Focus Not Obscured를 전체화면 덮개와 이동 차단 검사, Target Size를 디자인 기준 검토에 사용했다: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html, https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum, https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

RUBRIC_SCORE: 완결성=5/5 정밀성=5/5 벤치마크=5/5 추적성=5/5 전문성=5/5 total=25/25
WEAKEST_LINE: 공유 개발 서버 지연은 운영 성능을 증명하지 않는다.

SKILLS_USED: `qa`, localhost 실제 탐색, 회귀 우선, 증거 분리와 최종 판정에 사용 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: BRAIN의 OSMU 사업·유저심리, repo의 v63 프로토타입·요청 정본·사업 좌표·테스트 계획·디자인 manifest, Playwright와 WCAG 공식 기준을 조회했다.
HITS_USED: 사업 좌표는 네 방 역할 경계, 요청 정본은 요청번호 추적, v63과 PNG는 디자인 판정, 공식 웹 문서는 클릭·reflow·가림 검증 기준에 사용했다.
HITS_REJECTED: 다른 벤처 자료와 일반 마케팅 사례는 이번 동작 QA 판정에 직접 필요하지 않아 제외했다.
CONFLICTS: 과제의 확정 기준 v63과 pipeline 승인 핀 v68이 충돌한다. 기능 판정에는 영향이 없지만 디자인 PASS와 QA 승인을 차단한다.

SOURCES/MODEL: gpt-codex/gpt-5 · `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` · `wiki/거버넌스/요청.md` · `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` · `docs/design/README.md` · `docs/design/captures/manifest.json` · localhost:3456 관찰 · Playwright 공식 문서 · WCAG 2.2
