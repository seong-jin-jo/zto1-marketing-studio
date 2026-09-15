# OSMU 네 방 기본 흐름 QA 재검증 v12

> STAMP | line: osmu | 생성: 2026-09-15 06:35 KST | model: gpt-codex/gpt-5 | agent: qa-verifier | skill: qa | 근거: v63 프로토타입, 확정 요구 정본, 사업 좌표, localhost 실요청, Playwright 원본 캡처 | 고민: 기능 회귀를 수리하되 화면 정합 실패와 커밋되지 않은 테스트 변경을 숨기지 않았다.

한 줄 결론: 현재 작업트리의 네 방 기능은 기본 API 11/11, 단면 4/4, 4개 폭 방 화면 20/20, 성과실에서 생성실 복귀 5/5, Studio v1 14/14로 통과했다. v63과 현재 16개 화면의 구조가 다르고 정적 계약 테스트 변경 1건이 커밋되지 않아 제품 전체 QA와 배포는 NG다.

검증실패 보고: 등급=제품 전체 QA NG, 사유=v63 디자인 정합 실패, 운영 배포 미검증, 테스트 변경 1건 커밋 훅 차단, 출고여부=localhost 기능 회귀 증거로만 출고하며 QA 승인과 배포 근거로는 출고하지 않음.

## 요청 추적

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08, R166, R172 | 생성실부터 성과실까지 네 방 관통 | FLOW-API-V12 | 수정 후 PASS | 지정 작업 공간에서 최종 localhost 기본 흐름 11/11. 후보 3장, 편집 순서 변경, 삭제와 복원, 발행 큐 HTTP 201, 성과 제안 3건과 생성실 재인계를 관찰 |
| R08, R19, R207 | 네 방 렌더와 390, 768, 1024, 1440 실제 이동 | FLOW-UI-V12 | 기능 PASS, 디자인 NG | 단면 4/4, 방 화면 20/20, 성과실에서 생성실 복귀 5/5. 가로 넘침, 전체 화면 모달, 탐색 가림, 브라우저 401, 콘솔 오류 0건 |
| R27, R168 | Studio v1 생성과 무료 다시 만들기 경계 | STUDIO-V1-V12 | PASS | localhost 실요청 14/14 |
| R104 | 검증용 고객 자격증명을 남기지 않음 | FLOW-PROBE-CLEANUP-V12 | PASS | 모든 검증 뒤 활성 `qa-four-room-*` 토큰 0건 |
| R201 | 사족, 긴 대시와 영문 단추 라벨 금지 | FLOW-COPY-V12 | PASS | 전체 회귀의 UI 카피 계약 통과. 현재 캡처의 단추는 한국어이고 UI 직접 문자열 긴 대시 금지 계약도 통과 |
| R193, R205, R206 | 확정 프로토타입의 발행실과 공통 셸 계승 | DESIGN-V12 | NG | v63과 현재 공통 셸, 주축, 요소 순서, 열 수, 담당 패널, 글꼴 단계와 버튼 위계가 다름 |
| R01부터 R207 중 이번 범위 밖 | 확정 요구 전건 누락 방지 | REQ-ALL-V12 | 이월 | 요구 정본을 유지하고 이번 네 방 기능 PASS에 포함하지 않음 |

## 실행 결과

| 단계 | 상태 | 증거와 비고 |
|---|---|---|
| canonical 단계 | 진행 중 | 메인 repo `pipeline-state.osmu.md`가 착수 때 이미 `current_stage: qa`. 승인 상태는 변경하지 않음 |
| backend build와 test | 수정 후 PASS | 별도 Spring backend 없음. Next Route Handler 포함 Vitest 360파일, 2,317건 PASS, 조건부 3건 제외 |
| web build와 test | PASS | `npx tsc --noEmit` 종료 코드 0. `npm run build` 184/184. 기존 NFT 추적 경고 1건 |
| mobile typecheck | 해당 없음 | Expo 또는 mobile 패키지가 이번 범위에 없음 |
| health | PASS | 최종 localhost:3456 listener PID 64529, HTTP 200, DB up, 52ms |
| seed | PASS | `apply-schema.sh --seed`로 schema, 지정 작업 공간, RLS, 확장과 역할을 멱등 적용 |
| 주요 API | 수정 후 PASS | `verify-basic-flow-e2e.mjs` 최종 11/11 |
| 네 방 단면 | PASS | `probe-four-room-flow.mjs` 4/4. 가린 모달, 브라우저 401, 콘솔 오류 0건 |
| 사람 클릭 4개 폭 | PASS | 390 라이트와 다크, 768, 1024, 1440 라이트에서 방 화면 20/20과 복귀 5/5. 관찰 25건 |
| Studio v1 | PASS | `verify-studio-v1-e2e.mjs` 14/14 |
| Maestro | 해당 없음 | 대상은 Next.js Web이며 Maestro 구성이 없음 |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`, 디자인 토큰 위반 0건 |
| 디자인 정합 | NG | v63 원본과 현재 16개 조합 모두 구조 불일치 |
| 상위 QA 품질 게이트 | FAIL | `verify-agent-quality.sh`가 배포 환경 접촉 증거 0건으로 반려 |
| 커밋 무결성 | NG | 큐 잠금 수정은 `800c970a`. 동시성 정적 계약 테스트 변경은 같은 `dashboard/tests` 아래 타 세션 미추적 파일 때문에 `commit-untracked-guard`가 차단해 작업트리에 남음 |
| 운영 배포 | 미검증 | 실제 배포 버전, 외부 계정 발행과 운영 성과 회수는 확인하지 않음 |

현재 화면 원본은 `logs/diff/osmu-four-room-flow-20260915-0635/captures/`다. 동적 URL은 `/studio?room=create`, `/studio?room=edit`, `/studio?room=publish`, `/performance`다. `observations.json`은 방 관찰 20건과 복귀 5건을 담고, 가로 넘침, 전체 화면 모달, 탐색 가림, 401 URL, 콘솔 오류가 모두 0건이다. 최종 검사 대상 합성 SHA-256은 `5d3802250d4067ab20d8cba39d0a75802804c8bb2c0022d477d9968a49b17822`다.

## 발견과 수정

첫 전체 회귀는 360파일 중 357파일 통과, 3파일 실패였다. 첫째, 발행 성공 배선 정적 계약이 현재 제한 동시성 구현을 예전 `Promise.all` 문자열로만 판정했다. 구현의 `runWithConcurrency(targets, PUBLISH_CONCURRENCY, ...)`를 직접 확인하도록 계약을 갱신했다. 둘째, 큐 잠금 재시도 총 1.55초가 13초 임계 구간 끝자락에 합류한 프로세스의 남은 2.8초보다 짧았다. 재시도 여유를 3.55초로 늘리고 최종 `ELOCKED`를 안정된 `queue lock timeout`으로 정규화했다.

수정 전 세 실패를 전체 회귀로 재현했고, 수정 후 표적 3파일 43건과 전체 360파일 2,317건이 통과했다. 큐 잠금 수정은 `800c970a`에 커밋했다. 정적 계약 테스트는 다른 세션 소유의 `dashboard/tests/db/local-ci-db-migrations.regression-1.test.ts`가 미추적 상태라 저장소 훅이 같은 경로 커밋을 차단했다. 해당 파일을 임의 포함하거나 옮겨 훅을 우회하지 않았다.

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
- 추가와 변경: 큐 잠금 재시도와 오류 정규화, 현재 제한 동시성 구현을 추적하는 정적 계약만 바꿨다. 화면, API 계약과 DB 스키마는 변경하지 않았다.

## 페르소나 결정

김민서가 생성실에서 성과실까지 길을 잃지 않고 완주할 수 있는가: 현재 localhost 기능에서는 그렇다. 네 방 링크와 다음 행동이 4개 폭에서 작동했고 성과실에서 생성실로 돌아왔다. 승인 기준과 다른 정보 구조 때문에 제품 전체 출고 가능으로 확대할 수는 없다.

## 레드팀과 셀프심문

까다로운 고객의 반론: 빈 상태 중심 클릭은 실제 편집과 발행을 증명하지 않는다. 대응: 브라우저는 네 방 이동과 가림을 검증했고 기본 API 11단계가 실제 초안 편집, 삭제와 복원, 발행 큐 HTTP 201을 검증했다. 외부 채널 실발행은 미검증으로 남겼다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 공유 개발 서버와 작업트리가 검증 중 바뀌어 증거 기준이 흔들렸을 가능성이다. 대응: 최종 실행에서 앱, API, Playwright와 회귀를 다시 돌리고 검사 대상 합성 해시를 남겼다. 다만 테스트 변경 1건은 커밋되지 않았으므로 깨끗한 체크아웃 통과로 확대하지 않았다.

## 벤치마크 적용

- Playwright actionability의 표시, 안정, 이벤트 수신, 활성 조건을 실제 클릭의 최소 기준으로 사용했다: https://playwright.dev/docs/actionability
- Playwright emulation의 명시적 viewport를 390, 768, 1024, 1440 실행에 적용했다: https://playwright.dev/docs/emulation
- Playwright 시각 비교 원칙에서 같은 폭의 기준 PNG와 실제 PNG를 분리 보존하는 방식을 차용했다: https://playwright.dev/docs/test-snapshots

RUBRIC_SCORE: 완결성=5/5 정밀성=5/5 벤치마크=5/5 추적성=5/5 전문성=4/5 total=24/25
WEAKEST_LINE: 커밋되지 않은 정적 계약 테스트 때문에 현재 초록은 깨끗한 체크아웃 증거가 아니다.

SKILLS_USED: `qa`, localhost 실제 탐색, 회귀 우선, 근본 원인 수정, 시각 대조와 최종 판정에 사용 / SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: BRAIN의 OSMU 사업 허브와 ZERO-ONE 고객 경계, repo의 v63 프로토타입, 확정 요구 정본, 이동된 사업 좌표, 테스트 계획, 디자인 README와 manifest, Playwright 공식 기준을 조회했다.
HITS_USED: 사업 좌표는 첫 사용자와 네 방 역할, 요청 정본은 요청번호 추적, v63과 원본 PNG는 디자인 판정, Playwright는 실제 클릭과 4폭 캡처 기준에 사용했다.
HITS_REJECTED: 역사적 persona와 One Thing의 미측정 사업 수치는 기능 통과 근거로 쓰지 않았다. 다른 벤처 자료와 일반 마케팅 사례는 이번 동작 QA에 직접 필요하지 않아 제외했다.
CONFLICTS: 과제의 확정 기준 v63과 canonical pipeline 승인 핀 v68이 충돌한다. 기능 판정에는 영향이 없지만 디자인 PASS와 QA 승인을 차단한다.

SOURCES/MODEL: gpt-codex/gpt-5 | `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/거버넌스/요청.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md` | `docs/plan/persona.md` | `docs/plan/one-thing.md` | `docs/design/README.md` | `docs/design/captures/manifest.json` | `logs/diff/osmu-four-room-flow-20260915-0635/captures/` | https://playwright.dev/docs/actionability | https://playwright.dev/docs/emulation | https://playwright.dev/docs/test-snapshots
