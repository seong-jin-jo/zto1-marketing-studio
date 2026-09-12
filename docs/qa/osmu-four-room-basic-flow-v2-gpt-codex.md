# OSMU 네 방 기본 흐름 QA 재검증 v2

> STAMP | line: osmu | 생성: 2026-09-13 06:22 KST | model: gpt-codex/gpt-5 | agent: qa-verifier | skill: qa | 근거: v63 프로토타입, 회장 요구 대장, 사업 좌표, localhost 관찰, Playwright 공식 지침, WCAG Reflow | 고민: 기능 통과와 디자인 불일치를 한 판정으로 뭉개지 않았다.

한 줄 결론: 현재 localhost 소스의 네 방 기능은 다시 끝까지 통과했다. 기본 API 11/11, 네 방 렌더 4/4, 4폭 20화면과 복귀 5회는 PASS다. 승인 기준 v63과 실제 화면의 공통 셸·열·요소 순서가 달라 디자인 정합과 제품 전체 QA는 NG다.

⛔ 검증실패 보고: 상위 `verify-agent-quality.sh`는 배포 환경 접촉 증거 0건으로 FAIL을 반환했다. 과제가 localhost:3456을 명시했으므로 운영 배포로 범위를 넓히지 않았다. 따라서 이 문서의 PASS는 로컬 기능 범위에만 유효하고 출고 승인이 아니다.

## 요청 추적

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 좌측 네 방을 유지하고 상단 단계는 작업물 전체로 편입 | FLOW-UI-01 | 기능 PASS, 디자인 NG | 네 방 링크로 생성→편집→발행→성과 이동 성공. 실제 데스크톱은 56px 아이콘 레일이라 v63의 이름 있는 방 레일과 불일치 |
| R19 | 390을 제외한 지원 폭에서 흐름 색인 유지 | FLOW-UI-02 | 기능 PASS, 디자인 NG | 390·768·1024·1440에서 다음 방 이동 성공. 768 이상 실제 색인의 위치·표현은 v63과 불일치 |
| R27, R168 | 후보 생성·다시 만들기와 학습 정보 순환 | STUDIO-V1 | 재실행 PASS, 우려 유지 | 첫 실행의 두 번째 생성이 `STUDIO_LLM_INVALID_OUTPUT`으로 NG. 즉시 전체 재실행은 14/14 PASS. 공급자 비결정성은 검증기가 숨기지 않음 |
| R193 | 승인 인박스·발행 캘린더를 헤더에서 발행실과 연결 | FLOW-UI-03 | 이동 PASS, 디자인 NG | 발행실 렌더와 다음 행동은 관찰됨. v63 헤더·발행 패널 구조와 다름 |
| R201 | 사이드바 사족 제거 | FLOW-UI-04 | PASS | 실제 네 폭 캡처에서 `지금 여기`, `다음` 사족 없음 |
| R205, R206 | 네 방 상단 일관성, 실제 수준 화면 충실도 | DESIGN-01 | NG | v63과 실제 PNG 대조에서 공통 셸, 요소 순서, 열 수, 우측 담당 패널이 불일치 |
| R207 | 성과실을 실행 가능한 UX로 구성 | FLOW-UI-05 | 기능 PASS, 디자인 NG | 성과실 렌더, 제안 3건, 생성실 복귀 5회 관찰. v63 성과실 배치와 버튼 위계는 불일치 |

## 직접 관찰 결과

| 검증 | 판정 | 관찰 증거 |
|---|---|---|
| localhost health | PASS | `GET /api/health` HTTP 200, `db=up`, 38ms |
| 기본 API 흐름 | PASS | `verify-basic-flow-e2e.mjs` 11/11. 후보 3장, 초안 인계, 순서 변경, 문장 삭제·복원, 편집 완료, 큐 201, 지원 여부, 제안 3건, 제안 재인계, 지표 읽기 |
| 네 방 렌더 | PASS | `probe-four-room-flow.mjs` 4/4. 가린 모달 0, 브라우저 401 0, 콘솔 오류 0 |
| 사람 클릭 4폭 | PASS | 390 라이트·다크, 768·1024·1440 라이트에서 네 방 20화면과 성과실→생성실 복귀 5회. 가로 넘침 0, 전체 화면 덮개 0, 이동 차단 0, 다음 행동 누락 0 |
| Studio v1 | 조건부 PASS | 첫 실행 1건은 공급자 JSON 파싱 실패. 즉시 전체 재실행 14/14 PASS. 반복 실패를 성공으로 덮는 자동 재시도는 추가하지 않음 |
| DB seed | PASS | 지정 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`에 멱등 seed 실행, `active`, `team`, `shared_cli_approved=true` 확인 |
| 전체 Web 회귀 | PASS | Vitest 311파일, 2,077건 PASS, 3건 skip, 실패 0 |
| TypeScript | PASS | `npx tsc --noEmit` exit 0 |
| production build | PASS | 현재 소스를 임시 디렉터리에서 build, 정적 페이지 182/182. 기존 NFT 추적 경고 1건 |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`, 위반 0 |
| mobile·Maestro | 해당 없음 | 이 저장소의 대상 표면은 Next.js Web이며 Expo/mobile 앱이 없음 |
| 운영 배포 | 미검증 | 이번 과제는 localhost:3456 범위. 실제 배포 버전은 확인하지 않음 |

원본 증거는 `logs/diff/osmu-four-room-flow-20260913-qa-rerun/observations.json`과 같은 폴더의 PNG 20장이다. 동적 URL은 `/studio?room=create`, `/studio?room=edit`, `/studio?room=publish`, `/performance`다.

## 디자인 정합 매트릭스

판정 축: A 주축 방향, B 요소 순서, C 열 수, D 정렬·여백, E 표시·숨김, F 글꼴 계열·크기 단계, G 버튼 위계, H 해당 폭 판정.

| 요청번호 | 화면·상태 | 폭 | v63 기준 | 실제 구현 | A | B | C | D | E | F | G | H |
|---|---|---:|---|---|---|---|---|---|---|---|---|---|
| R08, R205, R206 | 생성실·기본 | 390 | 모바일 헤더와 접힌 담당, v63 카드 순서 | 상단 작업 단계와 세로 입력·담당 카드 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실·기본 | 768 | v63 중간 폭 셸·담당 관계 | 56px 아이콘 레일과 인라인 담당 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실·기본 | 1024 | 좌측 방 레일, 중앙 후보 3열, 우측 상시 담당 | 아이콘 레일, 중앙 2열, 담당 카드 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 생성실·기본 | 1440 | v63 와이드 3영역 | 실제 와이드 셸과 카드 밀도 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실·초안 | 390 | 모바일 편집 목차·미리보기·담당 | 빈 상태 중심 세로 흐름 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실·초안 | 768 | 중간 폭 편집 3영역 축약 | 목차·미리보기 열과 담당 위치 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실·초안 | 1024 | 목차, 편집, 담당 3열 | 실제 상태·열 비율·순서 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R08, R205, R206 | 편집실·초안 | 1440 | v63 와이드 편집 셸 | 실제 와이드 편집 셸과 밀도 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실·기본 | 390 | 모바일 미리보기·발행 행동 | 긴 카드 목록과 행동 순서 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실·기본 | 768 | v63 중간 폭 미리보기·담당 | 실제 카드 열·담당 위치 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실·기본 | 1024 | 중앙 미리보기 2열, 우측 상시 담당 | 긴 다중 카드 그리드, 인라인 담당 | NG | NG | NG | NG | NG | NG | NG | NG |
| R193, R205, R206 | 발행실·기본 | 1440 | v63 와이드 발행 셸 | 실제 와이드 발행 셸과 버튼 위계 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실·데이터 있음 | 390 | 모바일 성과 카드와 담당 진입 | 지표·제안 세로 흐름과 온보딩 띠 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실·데이터 있음 | 768 | v63 중간 폭 성과 셸 | 실제 섹션 순서·열 수 차이 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실·데이터 있음 | 1024 | 좌측 방 레일, 중앙 성과, 우측 담당 | 아이콘 레일, 성과 대시보드, 인라인 제안 | NG | NG | NG | NG | NG | NG | NG | NG |
| R205, R206, R207 | 성과실·데이터 있음 | 1440 | v63 와이드 성과 셸 | 실제 와이드 셸과 버튼 위계 차이 | NG | NG | NG | NG | NG | NG | NG | NG |

기능 이동과 반응형 reflow는 통과했지만 디자인 QA는 레이아웃 속성 불일치 때문에 FAIL이다. 또한 과제는 v63을 확정 프로토타입으로 명시하지만 `pipeline-state.osmu.md`의 승인 핀은 v68을 지목한다. 두 기준이 충돌하므로 임의로 하나를 정본화하지 않았다.

## 기존 구현 보존과 변경

- 기존 구현 확인: 네 방 Route, 기본 11단계 API, Studio v1, 성과 제안·재인계가 이미 구현돼 있었다.
- 유지한 기존 기능: 생성, 편집, 발행, 성과, 제안 재인계, 네 폭 이동을 그대로 검증했다.
- 추가·변경한 것: 제품 코드는 수정하지 않았다. 재현 가능한 기능 단절이 없었고 공급자 JSON 실패를 QA 재시도로 숨기는 변경은 하지 않았다. QA 증거와 판정만 추가했다.

## 레드팀과 셀프심문

까다로운 고객의 반론: 화면 20장을 열었다고 실제 데이터가 네 방을 통과한 것은 아니다. 대응: 브라우저 20화면은 이동·가림·반응형만 증명하고, 데이터 인계는 별도의 기본 API 11/11에서 후보·초안·편집·큐·제안 재인계를 관찰해 분리 증명했다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 공유 개발 서버와 작업트리가 병렬 수정 중이라 캡처 뒤 소스가 다시 바뀌는 것이다. 대응: 최종 보고 직전에 health, 기본 흐름, 네 방 probe를 다시 실행해 현재 서버에서도 HTTP 200, 11/11, 4/4를 재확인했다. 그래도 운영 배포와 이후 변경은 미검증으로 남긴다.

## 벤치마크 적용

- Playwright 공식 locator·auto-wait 원칙을 따라 사용자에게 보이는 방 이름과 실제 클릭 결과를 기준으로 판정했다: https://playwright.dev/docs/locators, https://playwright.dev/docs/best-practices
- WCAG Reflow의 가로 스크롤 방지 원칙을 네 폭의 `documentWidth <= viewportWidth` 검사로 적용했다: https://www.w3.org/WAI/WCAG21/Understanding/reflow.html

SKILLS_USED: `qa`, 실제 localhost 탐색, 회귀 우선, 증거 등급 분리와 최종 판정에 사용 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: BRAIN의 OSMU 사업·유저심리, repo의 v63 프로토타입·요청 정본·사업 좌표·테스트 계획·디자인 manifest, Playwright와 WCAG 공식 기준을 조회했다.
HITS_USED: 사업 좌표는 네 방 역할 경계, 요청 정본은 R08·R19·R27·R168·R193·R201·R205·R206·R207 추적, v63과 PNG는 디자인 판정, 공식 웹 문서는 클릭·reflow 검증 기준에 사용했다.
HITS_REJECTED: 다른 벤처 자료와 일반 마케팅 사례는 이번 동작 QA 판정에 직접 필요하지 않아 제외했다.
CONFLICTS: 과제의 확정 기준 v63과 pipeline 승인 핀 v68이 충돌한다. 기능 판정에는 영향 없지만 디자인 PASS와 QA 승인을 차단한다.

SOURCES/MODEL: gpt-codex/gpt-5 · `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` · `wiki/거버넌스/요청.md` · `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` · `docs/design/README.md` · `docs/design/captures/manifest.json` · localhost:3456 관찰 · Playwright 공식 문서 · WCAG Reflow
