<!--
STAMP
line: osmu
artifact: 네 방 기본 흐름 QA v26
created_at: 2026-09-19 07:22 KST
model: gpt-codex/gpt-5
agent: qa-verifier
skills: qa, localhost 실앱 재현, 반응형 클릭, 전체 회귀와 증거 기록
basis: docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html, docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md, wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md
benchmark: https://playwright.dev/docs/emulation, https://playwright.dev/docs/locators, https://playwright.dev/docs/screenshots
deliberation: 현재 HEAD 실행본의 화면 이동 통과와 실제 생성 공급자 한도 실패를 분리하고, 회귀 검사 자체의 낡은 기대값과 병렬 부하 제한시간도 실제 계약에 맞춰 바로잡았다.
-->

# 네 방 기본 흐름 QA v26

## 결론

제품 전체 판정은 NG다. localhost의 네 방 렌더와 반응형 이동은 통과했지만 실제 생성 공급자가
7일 사용량 100%에 도달해 생성실 첫 단계에서 기본 흐름과 Studio v1이 중단됐다. 사용량 실측은
2026-09-19 18:59 KST 초기화를 가리킨다. 외부 한도이므로 제품 코드를 우회 수정하지 않았다.

화면 범위는 PASS다. 네 방 단면 4/4, 390 라이트와 다크 및 768, 1024, 1440의 20화면,
성과실에서 생성실 복귀 5/5를 실제 링크 클릭으로 관찰했다. 가린 모달, 가로 넘침, 탐색 가림,
브라우저 401과 콘솔 오류는 모두 0건이다.

## 직접 관찰 증거

| 항목 | 판정 | 증거 |
|---|---|---|
| 실행본 health | PASS | `GET /api/health` HTTP 200, DB up, 88ms, `build_commit=e7eea1fa82bb5f67d6a76e8297bd5bfb75a74905`. `logs/diff/osmu-four-room-flow-20260919-v26/health-owned-body.json` |
| 백엔드 기본 흐름 | NG | 첫 생성이 후보 0장과 `STUDIO_LLM_PROVIDER_RATE_LIMITED`로 종료. `verify-basic-flow-e2e-owned.log` |
| 공급자 원인 분리 | BLOCK | `usage-check.sh` 실측 `seven_day used=100.0%`, 리셋 2026-09-19 18:59 KST. 별도 Anthropic 키는 환경과 작업 공간에 없음. |
| 네 방 단면 | PASS | 생성실, 편집실, 발행실, 성과실 4/4 렌더. 가린 모달, 401, 콘솔 오류 0. `probe-four-room-flow-owned.log` |
| 사람 클릭 네 폭 | PASS | 390 라이트와 다크, 768, 1024, 1440에서 20/20, 성과실에서 생성실 복귀 5/5. `verify-four-room-ui-e2e-owned.log`, `captures-owned/` |
| Studio v1 | NG | 인증 없음 401, 멱등 키 없음 400, 빈 본문 422는 통과. 정상 생성은 기대 201 대신 HTTP 429와 공급자 한도 코드로 종료돼 이후 항목 미실시. `verify-studio-v1-e2e-owned.log` |
| 전체 테스트 | PASS | `npm run test`: 378파일, 2,434건 통과, 3건 제외, 종료 코드 0. `npm-test-final2.log` |
| TypeScript | PASS | 공유 `.next/dev/types/validator.ts` 동시 쓰기 중 직접 실행은 실패했다. 현재 repo 구조를 보존한 `/private/tmp` 격리 복사본에서 `next typegen`과 정확한 `npx tsc --noEmit`을 다시 실행해 둘 다 종료 코드 0. `typecheck-isolated-final3.log` |
| production build | PASS | 활성 dev 서버와 분리한 APFS 복사 디렉터리에서 compile 성공, 정적 화면 185/185, 종료 코드 0. 첫 격리 시도는 복사된 자기참조 `node_modules/node_modules` 링크 때문에 실패했고 이를 분리한 최종 실행만 판정에 사용. `npm-build-final.log` |
| schema, seed, RLS | PASS | 로컬 CI PostgreSQL에 schema, seed, RLS와 legacy migration 멱등 적용. fingerprint `S3|S3`. `seed-schema-rls.log` |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`: 토큰 위반 0. `design-lint.log` |
| 릴레이 품질 게이트 | FAIL | `verify-agent-quality.sh`가 운영 배포 환경 접촉 증거 0건으로 반려. 이번 과제는 localhost 범위였고 운영 검증은 미검증으로 유지한다. `verify-agent-quality.log` |
| mobile typecheck와 Maestro | 해당 없음 | 별도 Expo 앱과 Maestro flow가 없는 Next.js 제품이다. 390 Chromium 실화면을 직접 눌렀다. |
| 운영 배포와 외부 SNS | 미검증 | 이번 과제는 localhost:3456 범위다. 운영 배포 버전과 외부 공개 게시를 확인하지 않았다. |

Playwright 공식 문서의 명시 viewport, 접근 가능한 역할과 이름 기반 locator, 전체 페이지 캡처 원칙을 적용했다.
동적 URL은 `http://localhost:3456`이다. QA PNG와 로그는
`logs/diff/osmu-four-room-flow-20260919-v26/`에 있고, 기준 PNG는
`docs/design/captures/osmu-four-room-prototype-v63-20260912/`에 있다.

## 디자인 정합 행렬

과제 지정 기준은 v63이다. 현재 16개 라이트 화면은 기능 이동 증거지만 v63의 공통 셸, 정보 순서,
열 책임과 상태가 다르다. 기준과 현재 캡처의 높이도 다르므로 픽셀 유사도를 PASS 근거로 쓰지 않고
배치 속성을 직접 대조했다. 390 다크는 동작과 테마 확인에만 포함했다.

| 화면 | 폭 | 주축 방향 | 요소 순서 | 열 수 | 정렬과 여백 | 표시와 숨김 | 글꼴 단계 | 버튼 위계 | 판정 |
|---|---:|---|---|---|---|---|---|---|---|
| 생성실 | 390 | 세로 일치 | v63 후보 중심, 현재 입력과 예시 중심 | 1열 | 상단 밀도 다름 | v63 후보 미리보기 없음 | 제목 단계 다름 | 후보 선택과 초안 만들기 우선순위 다름 | NG |
| 생성실 | 768 | 세로 중심 일치 | 390과 같은 순서 이탈 | 현재 1열, v63 분할 | 본문 폭 다름 | 후보 영역 차이 | 단계 다름 | 주 행동 다름 | NG |
| 생성실 | 1024 | 가로 혼합 | v63 후보, 학습, 담당과 현재 입력, 예시, 담당 순서 다름 | v63 3축, 현재 2축 중심 | 본문과 담당 폭 다름 | 재개 띠 차이 | 단계 다름 | 주 행동 다름 | NG |
| 생성실 | 1440 | 가로 혼합 | 세부 순서 다름 | 다열이나 열 책임 다름 | 카드 폭과 여백 다름 | 현재 상단 네 단계와 재개 띠 추가 | 단계 다름 | 주 행동 다름 | NG |
| 편집실 | 390 | 세로 | v63 편집 도구와 현재 상태 순서 다름 | 1열 | 카드 비중 다름 | 편집 도구 노출 상태 다름 | 단계 다름 | 편집과 복귀 우선순위 다름 | NG |
| 편집실 | 768 | 세로 | 상태와 순서 다름 | 1열 중심 | 상단과 본문 간격 다름 | 편집 도구 상태 다름 | 단계 다름 | 주 행동 다름 | NG |
| 편집실 | 1024 | 가로 혼합 | v63 편집 3축과 현재 본문, 담당 구조 다름 | 열 책임 다름 | 본문과 담당 폭 다름 | 핵심 도구 위치 다름 | 단계 다름 | 주 행동 다름 | NG |
| 편집실 | 1440 | 가로 혼합 | 목차, 미리보기, 대사 순서 다름 | 열 책임 다름 | 패널 폭 다름 | 도구 표시 상태 다름 | 단계 다름 | 주 행동 다름 | NG |
| 발행실 | 390 | 세로 | v63 채널 미리보기와 현재 학습, 작업 순서 다름 | 1열 | 카드 높이 다름 | 첫 화면 미리보기 상태 다름 | 단계 다름 | 발행과 복귀 우선순위 다름 | NG |
| 발행실 | 768 | 세로 | 390과 같은 순서 이탈 | 상태 다름 | 본문 구획 다름 | 미리보기 시작 위치 다름 | 단계 다름 | 주 행동 다름 | NG |
| 발행실 | 1024 | 가로 혼합 | 연결 안내, 발행 행동, 미리보기 순서 다름 | 미리보기와 담당 열 책임 다름 | 카드 폭 다름 | 7개 미리보기 위치 다름 | 단계 다름 | 선택 발행과 연결 우선순위 다름 | NG |
| 발행실 | 1440 | 가로 혼합 | 세부 순서 다름 | 본문과 담당 안의 미리보기 열 다름 | 밀도와 여백 다름 | 작업 경고 추가 | 단계 다름 | 우선 행동 다름 | NG |
| 성과실 | 390 | 세로 일치 | v63 표본, 판정, 지표와 현재 방 머리, 담당, 판정 순서 다름 | 1열 | 담당 위치 다름 | 첫 화면 지표 노출 다름 | 제목 단계 다름 | 제안과 담당 질문 우선순위 다름 | NG |
| 성과실 | 768 | 세로 중심 일치 | 390과 같은 순서 이탈 | 지표 전환 시점 다름 | 패널 여백 다름 | 담당 위치 다름 | 단계 다름 | 주 행동 다름 | NG |
| 성과실 | 1024 | 가로 혼합 | v63 판정 중심과 현재 담당 우측 구조 다름 | 지표 열 수 다름 | 본문과 담당 폭 다름 | 예시 지표 표시 다름 | 단계 다름 | 주 행동 다름 | NG |
| 성과실 | 1440 | 가로 혼합 | v63 결론, 비교, 지표와 현재 표본 부족, 연결, 예시 순서 다름 | 지표 수는 같으나 하위 열 책임 다름 | 카드 폭 다름 | 현재 담당과 예시 데이터 표시 | 단계 다름 | 주 행동 다름 | NG |

## 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 사이드바와 상단 단계에서 네 방을 잇는다 | FLOW-UI-V26 | PASS | 네 방 4개, 네 폭, 성과실에서 생성실 복귀 5/5 |
| R19 | 지원 viewport에서 실제로 눌러 본다 | FLOW-UI-V26 | PASS | 390, 768, 1024, 1440과 390 다크 총 20화면 |
| R166, R172 | 생성부터 성과 재인계까지 기본 흐름을 우선한다 | FLOW-API-V26 | NG | 공유 생성 공급자 주간 한도로 첫 후보 생성 실패 |
| R193, R205, R206 | 승인 시안 계승과 화면 충실도 | DESIGN-CONF-V26 | NG | 16개 라이트 화면의 배치 속성이 v63과 불일치 |
| R207 | 성과실 UX와 학습 정보를 구성한다 | FLOW-PERF-V26 | 부분 PASS | 성과실 렌더와 생성실 복귀는 통과. 실제 생성 재인계는 공급자 한도로 중단 |
| R01부터 R207 및 세부 요청 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V26 | 이월 | 기존 정본 판정을 유지하고 이번 네 방 범위만 갱신 |

## 시안과 dev 실화면 육안 대조

2026-09-19 06:45 KST에 아래 시안과 dev 실화면을 원본 해상도로 각각 직접 열어 대조했다.

- 생성실 1440: v63은 후보 3장 선택과 회원 학습 정보가 첫 화면의 중심이다. 현재 화면은 주제 입력,
  구성 예시와 네 단계 가로 탐색이 중심이라 요소 순서, 열 책임, 버튼 위계가 다르다.
- 성과실 1440: v63은 실제 최근 30일 결론, 비교 막대와 지표가 첫 화면에 있다. 현재 화면은 표본 부족,
  채널 연결 행동과 예시 지표가 중심이라 표시 상태, 정보 순서와 담당 패널 폭이 다르다.
- 시안 원본: `docs/design/captures/osmu-four-room-prototype-v63-20260912/1440-light-create.png`,
  `docs/design/captures/osmu-four-room-prototype-v63-20260912/1440-light-performance.png`
- dev 원본: `logs/diff/osmu-four-room-flow-20260919-v26/captures-owned/1440-light-create.png`,
  `logs/diff/osmu-four-room-flow-20260919-v26/captures-owned/1440-light-performance.png`

두 쌍 모두 공통 셸, 정보 순서와 주 행동이 다르므로 디자인 정합은 NG다.

## 기존 구현 확인과 보존

네 방 이동, 생성 API, 편집 상태 변경, 발행 큐, 성과 제안과 생성실 재인계가 이미 구현돼 있었다.
제품 화면, API, DB schema와 생성 계약을 변경하지 않았다. 공유 공급자 한도를 모의 성공이나
하드코딩 후보로 우회하지 않았다.

## 회귀 검사 수정

제품 런타임 코드는 변경하지 않았다. 전체 회귀에서 현재 검증기 구현과 어긋난 정적 기대값 한 건과
병렬 부하에서만 300ms 안에 로컬 fixture 콜백을 받지 못하는 제한시간 회귀 한 건을 확인했다.

- API 읽기 전수검사 계약은 `collectEvidenceFiles(dashboardRoot)`가 시작과 종료에 각각 배선됐는지
  두 번 검사하도록 현재 구현에 맞췄다. 표적 계약 2/2가 통과했다.
- 고객 토큰 제한시간 회귀는 120ms 지연 fixture를 유지하면서 준비 한도를 1초, 전체 한도를 3초로
  늘렸다. 운영 탐침의 15초 단계 예산은 바꾸지 않았다. 표적 테스트를 연속 5회, 15/15 통과했다.
- 수정 뒤 전체 Vitest를 다시 돌려 378파일과 2,434건 통과, 3건 제외를 확인했다.

## 페르소나 결정

질문: 바이브코딩 결과물을 이미 가진 1인 사업가가 생성실에서 시작해 성과실까지 실제 업무를 끝낼 수 있는가?

답: 현재는 아니다. 네 폭에서 네 방을 잃지 않고 이동할 수 있지만 첫 후보 생성이 공유 공급자 한도로
중단된다. 화면 경로는 살아 있고 핵심 업무는 BLOCK이다.

## 레드팀과 셀프심문

까다로운 고객은 방이 그려진다는 이유로 제품이 된다고 보지 않는다. 실제 생성 11단계와 Studio v1을
별도로 실행해 첫 후보 실패를 제품 전체 NG로 유지했다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 공급자 한도가 리셋되면 코드 변경 없이 다시 통과할 수 있다는
점이다. 그래도 이번 관찰 시점의 사용자는 후보를 만들 수 없으므로 PASS로 소급하지 않는다. 리셋 뒤
같은 실행본에서 두 E2E를 다시 통과해야 전환할 수 있다.

SKILLS_USED: qa, 실제 앱 재현, 전체 회귀, 반응형 클릭과 증거 기록 / SKILLS_SKIPPED: 없음

SOURCES: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/design/captures/osmu-four-room-prototype-v63-20260912/` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `pipeline-state.osmu.md` | `docs/design/captures/manifest.json` | https://playwright.dev/docs/emulation | https://playwright.dev/docs/locators | https://playwright.dev/docs/screenshots

MODEL: gpt-codex/gpt-5 / qa-verifier

KNOWLEDGE_QUERY: BRAIN business 허브에서 ZERO-ONE Marketing Studio, OSMU 발행과 성과 회수, 바이브코딩 결과물 보유 고객 경계를 검색했다.
HITS_USED: `wiki/business/pmf/idea-zero-one-marketing-studio.md`, 생성부터 발행과 성과 회수까지를 QA 범위로 채택. `wiki/business/pmf/concept-제로원-고객경계-바이브코딩-결과물-보유자.md`, 결과물을 이미 가진 고객이 만든 것을 파는 단계라는 페르소나 경계를 채택.
HITS_REJECTED: 교육상품, 수익형 블로그, ZERO-ONE Builder 문서는 이번 네 방 회귀와 직접 관련이 없어 사용하지 않았다.
CONFLICTS: 과제 지정 기준은 v63이지만 canonical `pipeline-state.osmu.md`의 승인 디자인은 v68이다. 지시대로 v63을 대조했고 단일 핀이 정리될 때까지 디자인 QA는 NG다.
