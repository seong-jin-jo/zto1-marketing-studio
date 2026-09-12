<!--
STAMP
line: osmu
artifact: 네 방 기본 흐름 QA와 디자인 정합 행렬
created_at: 2026-08-29 10:39 KST
updated_at: 2026-09-13 02:50 KST
model: gpt-codex/GPT-5 (2026-09-13 재검증), gpt-codex/gpt-5.6-sol (기존 본문)
agent: qa-verifier
skills: qa, 결함 등록, 실제 앱 회귀, 반응형 관찰, 증거 기록에 사용
basis: docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html, docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md, wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md
benchmark: https://playwright.dev/docs/actionability, https://playwright.dev/docs/emulation
deliberation: 기능 동선 PASS와 상태 무관한 공통 셸 불일치를 분리해 거짓 전체 PASS를 막았다.
-->

# OSMU 네 방 기본 흐름 QA

## 2026-09-13 재검증 판정

한 줄 결론: localhost 네 방 기능 흐름은 검증기의 낡은 성과실 주소를 고친 뒤 범위 PASS다.
전체 QA는 승인 디자인 정합 NG와 외부 공개 발행 미검증 때문에 승인할 수 없다.

첫 health 요청은 같은 개발 서버를 사용하던 API 전수 실사가 라우트 네 개씩을 컴파일하면서 30초
안에 응답하지 못했다. 해당 실사가 끝난 뒤 같은 `localhost:3456`에서 health HTTP 200과 DB up을
확인했고 기본 흐름 11/11도 통과했다. 제품 health 실패로 세지 않고 공유 개발 서버의 동시 검증
부하로 기록한다.

`probe-four-room-flow.mjs`는 성과실을 옛 홈 주소 `/`에서 찾고 있어 실제 `/performance` 화면을
실패로 판정했다. probe 주소를 현재 제품 계약에 맞추고 회귀 계약을 추가한 커밋은 `80c09807`이다.
수정 후 probe는 네 방 렌더, 가린 모달 0건, 브라우저 401 0건, 콘솔 오류 0건으로 끝났다.

| 검증 | 판정 | 2026-09-13 직접 관찰 증거 |
|---|---|---|
| canonical 단계 | 진행 중 | 메인 repo `pipeline-state.osmu.md`의 `current_stage: qa`, 승인 전 |
| health | PASS | `/api/health` HTTP 200, `db: up`, 서버 측 DB 확인 58ms |
| seed | PASS | 멱등 시드 실행 뒤 지정 작업 공간 `active`, `team`, 공유 AI 승인 상태를 실제 DB에서 확인 |
| 기본 API 흐름 | PASS | `verify-basic-flow-e2e.mjs`, 생성부터 성과 제안 재인계까지 11/11 |
| Studio v1 | PASS | `verify-studio-v1-e2e.mjs`, 인증 거절과 생성·조회·후보 전건 거절·UTC 무료 재생성 경계 14/14 |
| 네 방 probe | NG 후 수정, PASS | 성과실 주소 `/`를 `/performance`로 수정. 네 방 렌더, 가린 모달·401·콘솔 오류 각 0 |
| 사람 클릭 반응형 | PASS | 390 라이트·다크, 768, 1024, 1440에서 20화면과 성과실→생성실 복귀 5건 |
| 전체 회귀 | PASS | `npm run test`, 302파일 2,033건 PASS, 3건 제외, 실패 0 |
| TypeScript | PASS | `npx tsc --noEmit`, 종료 코드 0 |
| production build | PASS | 공유 dev와 분리한 현재 소스 사본에서 정적 페이지 182/182, 종료 코드 0 |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`, 임의 px·인라인 style·토큰 밖 hex 위반 0 |
| mobile typecheck·Maestro | 해당 없음 | dashboard 웹 범위이며 별도 Expo 화면 계약 없음. 실패 숨김 옵션 사용 안 함 |
| 승인 v63 디자인 정합 | NG | 현재 PNG를 v63 원본과 직접 대조. 셸, 열 수, 담당 패널, 요소 순서, 버튼 위계 불일치 |
| 외부 공개 발행·성과 | 미검증 | 이번 범위는 발행 큐까지다. 외부 permalink와 배포 버전 증거 없음 |

실행 원본은
[`observations.json`](../../logs/diff/osmu-four-room-flow-20260913-0216/captures/observations.json)과
같은 폴더의 20개 PNG다. v63 원본은
[`docs/design/captures/osmu-four-room-prototype-v63-20260912`](../design/captures/osmu-four-room-prototype-v63-20260912)를
참조했다. 390 생성실, 768 편집실, 1024 발행실, 1440 성과실을 원본과 짝지어 직접 열었으며,
기존 속성별 NG 행렬과 같은 구조 차이를 재확인했다.

### 2026-09-13 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 네 방 이동 | FLOW-UI-01 | PASS | 네 방 20화면, 생성실→성과실 클릭과 성과실→생성실 복귀 5건 |
| R27 | 후보 거절 뒤 무료 재생성 | STUDIO-V1-REGEN | PASS | Studio v1 14/14 |
| R104 | 고객 인증 경계 | FLOW-AUTH-01 | PASS | 실제 임시 고객 토큰, 브라우저 401 0, 토큰 폐기 200 |
| R168 | 첫 생성과 학습 정보 | FLOW-11-GEN | PASS | 후보 3장과 편집실 인계 |
| R193 | 성과 제안에서 생성실 재진입 | FLOW-UI-RETURN | PASS | 네 폭과 390 다크에서 제안 3건, 생성실 복귀 5건 |
| R200, R207 | 성과실 UX와 학습 정보 | FLOW-PERF-01 | 기능 PASS, 디자인 NG | `/performance` 렌더와 제안 3건. v63 구조와 불일치 |
| R201 | 중복 안내 없이 방 이동 | FLOW-SIDEBAR-01 | PASS | 차단 모달과 이동 후 가린 메뉴 0건 |
| R206 | 승인 시안 수준 화면 충실도 | CONF-ALL | NG | 현재 PNG와 v63 원본의 속성별 구조 불일치 |
| R01~R207 | 이번 기본 흐름 밖 확정 요구 | REQ-ALL | 이월 | 기존 전건 추적표 유지. 범위 밖 항목을 PASS로 세지 않음 |

페르소나 결정 질문: 박도윤이 설명 없이 생성실에서 성과실까지 이동하고 다시 시작할 수 있는가?

답: 네 방 이동과 다음 행동에는 PASS다. 실제 공개 채널 발행과 승인 시안 정합에는 NG이므로 첫
콘텐츠의 공개와 성과 수집까지 혼자 완결할 수 있다고는 판정하지 않는다.

Design Score: D. 기능과 반응형은 통과했지만 승인 v63 대비 네 대표 화면의 구조 속성이 모두 NG라
합격선 B에 미달한다.

## 판정

네 방 기본 동선은 범위 PASS다. 지정 작업 공간의 실제 API 11단계, Studio v1 계약 14건,
실제 고객 토큰 브라우저의 네 방 4개 x 4폭과 390 다크, 성과실에서 생성실 복귀 5건이 통과했다.
가린 모달, 브라우저 401, 콘솔 오류, 가로 넘침은 각각 0건이다.

전체 QA 승인은 NG다. 사용자 지정 v63과 pipeline의 최신 승인 핀 v68이 충돌하며, v63 캡처와
현재 구현 사이에는 데이터 상태 차이 외에도 셸 열 수, 담당 패널 위치, 요소 순서, 버튼 위계가
구조적으로 다르다. 네 방 기능 흐름 PASS를 승인 디자인 정합 PASS로 확대하지 않는다.

## 발견과 수정

최초 `probe-four-room-flow.mjs`는 네 방을 모두 `false`로 출력하고도 종료 코드 0을 반환했다.
mock한 `/api/me`와 현재 인증 경계가 맞지 않았고 렌더 assertion도 없었다. 탐침을 실제 임시 고객
토큰 발급, 네 방 visible assertion, 가린 모달, 브라우저 401, 콘솔 오류 검사, 토큰 폐기로 바꿨다.
수정판 재실행은 네 방 4개 렌더와 오류 0건으로 종료 코드 0을 반환했다.

최초 Turbopack 장기 개발 서버는 `/api/health`가 5초 안에 응답하지 않았고 생성 요청은
`GENERATION_DB_TIMEOUT`으로 끝났다. 같은 소스를 제한 시간 webpack 개발 서버에서 실행하자
health HTTP 200, DB `up`, 기본 흐름 11/11이 재현됐다. 제품 코드는 수정하지 않았다. 이는 장기
개발 서버 정체라는 환경 위험이며, 운영 배포 안정성 증거로 쓰지 않는다.

이번 재검증에서는 두 결함을 추가로 찾았다. 고정 QA 작업 공간이 체험 한도 20건으로 seed되어
반복 검증 뒤 실제 생성이 HTTP 429로 막혔다. 고정 fixture를 공유 AI 승인 상태로 seed하고 현재
DB도 `active`, `team`, 승인 상태로 복원했다. 또한 네 방 클릭 검증기는 `link.click()` 뒤에 URL
대기를 시작해 빠른 Next.js 전환의 이미 지난 commit을 기다렸다. URL 대기와 클릭을 동시에 걸고
현재 폭과 방을 로그에 남겼다. 두 결함 모두 회귀 테스트를 추가했다.

## 실행 증거

| 검증 | 판정 | 직접 관찰 증거 |
|---|---|---|
| backend build와 test | PASS | Next 통합 backend를 포함한 `npm run test`, 299파일 PASS, 2,000건 PASS, 3건 제외 |
| web build와 test | PASS | `npm run build`, 정적 페이지 182/182. 기존 NFT 추적 경고 1건 유지 |
| mobile typecheck | 해당 없음 | 대상은 dashboard 웹 제품이며 별도 mobile 화면 계약이 없음 |
| TypeScript | PASS | `npx tsc --noEmit`, 종료 코드 0 |
| curl health | PASS | localhost:3456 `/api/health` HTTP 200, `db: up`, 43ms |
| seed | PASS | `seed-test-tenants.sql` 실행 뒤 지정 작업 공간이 `shared_cli_approved=true`, `active`, `team`임을 실제 DB에서 확인 |
| 주요 API 기본 흐름 | PASS | `verify-basic-flow-e2e.mjs`, 생성실부터 성과실까지 11/11 |
| Studio v1 계약 | NG 후 수정, PASS | 최초 교차 시간대 생성 HTTP 429와 TypeError. fixture와 검증기 수정 뒤 401, 400, 422, 201, 조회, 후보 전건 거절, UTC 무료 재생성 경계 14/14 |
| 요청된 네 방 탐침 | NG 후 수정, PASS | 수정 전 네 방 `false`인데 exit 0. 수정 후 네 방 `true`, 가린 모달, 401, 콘솔 오류 각각 0 |
| Playwright 사람 동선 | NG 후 수정, PASS | `logs/diff/osmu-four-room-flow-20260912-2220`, 390 라이트와 다크, 768, 1024, 1440에서 네 방 20화면과 성과실에서 생성실 복귀 5건 |
| 디자인 lint | PASS | `design-lint.sh dashboard/src`, 8pt 밖 px, 인라인 style, 토큰 밖 hex 위반 0 |
| Maestro | 해당 없음 | dashboard 웹 제품 범위. `optional:true` 우회 없음 |
| 승인 v63 전체 디자인 정합 | NG | 4폭 원본 PNG를 대조해 데이터 상태 차이와 별개인 셸, 열 수, 담당 패널, 순서, 버튼 위계의 구조 불일치를 관찰 |

전환 가능 범위는 네 방 기본 동선뿐이다. 종료 증거는 health HTTP 200, 기본 흐름 11/11,
Studio v1 14/14, Playwright 20화면과 왕복 5건이다. 전체 QA와 design gate는 전환 불가다.

## 디자인 픽셀 대조 판정

`standard-design.md` §16에 따라 v63 원본과 localhost 캡처를 직접 열었다. 데이터 상태 차이로
수치와 문구의 픽셀 차이는 판정에서 제외했지만, 상태와 무관한 공통 셸과 레이아웃 차이는 NG다.

| 화면과 폭 | 주축 방향 | 요소 순서 | 열 수 | 정렬·여백 | 표시·숨김 | 글꼴 계열·크기 단계 | 버튼 위계 | 판정·증거 |
|---|---|---|---|---|---|---|---|---|
| 생성실 390 | 둘 다 세로 | v63 하단 담당, 구현 본문 카드·패널 순서 다름 | 단일 열 | 상단과 본문 간격 다름 | v63 담당 접힘과 구현 패널 노출 규칙 다름 | 산세리프는 같으나 제목 단계 다름 | v63 다음 행동과 구현 선택 카드 위계 다름 | NG, 양쪽 `390-light-create.png` |
| 편집실 768 | v63 좌우 3열, 구현 세로 본문 | v63 목차·미리보기·담당, 구현 빈 상태·다음 행동 | 3열 대 1열 | 콘텐츠 시작선과 여백 다름 | v63 담당 패널 표시, 구현 없음 | 제목과 본문 단계 다름 | v63 편집 칩, 구현 생성실 복귀·비활성 이동 | NG, 양쪽 `768-light-edit.png` |
| 발행실 1024 | v63 좌우 3열, 구현 세로 긴 그리드 | 연결 안내·행동·미리보기 순서는 유지, 담당 위치는 다름 | 3열 대 2열 중심 | 카드 폭과 밀도 다름 | v63 고정 담당, 구현 상단 담당 카드 | 글꼴 계열은 유사하나 크기 단계 다름 | v63 단일 파란 발행, 구현 학습·전체 발행 분리 | NG, 양쪽 `1024-light-publish.png` |
| 성과실 1440 | 둘 다 좌우 구조 | v63 요약·지표·통한 것, 구현 빈 요약·제안·규칙 | 3열 대 2열 | 본문 최대폭과 섹션 간격 다름 | v63 좌측 전체 채널, 구현 아이콘 레일 | 제목과 지표 단계 다름 | v63 분석 중심, 구현 제안 생성 행동 중심 | NG, 양쪽 `1440-light-performance.png` |
| 네 방 390·768·1024·1440 | 생성→편집→발행→성과 순서 | 상단 4단계 순서 유지 | 반응형에서 가로 넘침 0 | 각 폭 문서폭=viewport | 차단 모달 0, 다음 행동 표시 | 동작 판정 대상 아님 | 링크 클릭 가능 | 기능 PASS, `logs/diff/osmu-four-room-flow-20260912-2220/observations.json` |

디자인 재검증 종료 조건은 승인 핀을 v63 또는 v68 중 하나로 단일화하고, 그 정본의 공통 셸과
일치하도록 구현한 뒤 네 방별 같은 폭과 같은 데이터 상태의 원본 PNG를 다시 대조하는 것이다.

## 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 사이드바 네 방과 방 이동 | FLOW-UI-01 | PASS | 네 방 20화면과 성과실에서 생성실 복귀 5건 |
| R27 | 후보 거절 뒤 무료 재생성 | STUDIO-V1-REGEN | NG 후 수정, PASS | 고정 QA fixture 월 한도 고갈을 수정하고 Studio v1 14/14로 후보 전건 거절과 회원 UTC 하루 경계 확인 |
| R89 | 제작 후 발행 시점 채널 연결 | FLOW-PUBLISH-01 | 부분 PASS | 발행실 렌더와 연결 안내 확인. 실제 외부 채널 발행은 미검증 |
| R104 | 고객 인증 경계 | FLOW-AUTH-01 | PASS | 실제 임시 고객 토큰으로 20화면, 401 0건, 토큰 폐기 HTTP 200 |
| R132 | 영상과 글 편집 흐름 | FLOW-EDIT-01 | 부분 PASS | 편집실 렌더와 다음 행동 확인. 이번 범위는 영상 기본 상태이며 글 전체 편집은 이월 |
| R150 | 플랫폼별 지원 기능 계약 | FLOW-11-CAP | PASS | 기본 흐름의 채널별 지원 여부 단계와 capability API HTTP 200 |
| R168 | 첫 생성과 학습 정보 | FLOW-11-GEN | PASS | 후보 3장, 생성 결과 편집실 인계, 실제 작업 공간 기록 |
| R193 | 성과 제안에서 생성실 재진입 | FLOW-UI-RETURN | NG 후 수정, PASS | 빠른 client navigation 대기 경쟁 조건 수정 뒤 5개 폭·테마 조합 모두 성과실 방향 제안 3건과 생성실 복귀 |
| R200, R207 | 성과실 UX와 학습 정보 | FLOW-PERF-01 | 기능 PASS, 디자인 NG | 성과실 5개 폭·테마 조합 렌더와 제안 3건. v63 공통 구조와 불일치 |
| R201 | 사이드바 사족 제거 | FLOW-SIDEBAR-01 | PASS | 네 방 링크 클릭 경로에 `지금 여기`, `다음` 중복 문구 없음 |
| R206 | 승인 시안 수준 화면 충실도 | CONF-ALL | NG | v63 대비 셸, 열 수, 담당 패널 위치, 요소 순서, 버튼 위계 불일치. v68 최신 핀과의 충돌도 미해소 |
| R01~R207 | 나머지 확정 요구 전건 | REQ-ALL | 이월 | 전건 정본 판정은 기존 요구 추적표와 `docs/qa/osmu-qa-2026-08-28.md`를 유지 |

## 페르소나 결정

질문: 첫 콘텐츠를 만드는 박도윤이 설명 없이 생성실에서 성과실까지 길을 잃지 않고 이동할 수 있는가?

답: 네 방 이동과 다음 행동 노출에는 PASS다. 4폭 모두 생성실에서 성과실까지 실제 링크로 이동했고
성과실에서 생성실로 돌아왔다. 그러나 승인 v63 공통 셸 정합 및 실제 공개 채널
발행을 확인하지 않았으므로, 처음부터 발행과 성과 학습까지 완성할 수 있다고 판정하지 않는다.

## 레드팀과 셀프심문

까다로운 고객은 링크가 열린다는 사실보다 후보 생성, 실제 미디어 편집, 채널 선택, 성과 학습이
한눈에 이어지는지를 본다. 이번 기능 증거는 그 동선만 보증한다. 데이터 상태가 다른 시안과 dev의
차이에서 상태 무관 구조 불일치를 분리해 design gate를 NG로 남겼다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 mock 기반 탐침과 exit 0을 실제 사용자 성공으로 오해하는
것이다. 탐침을 실제 고객 토큰과 visible assertion으로 바꾸고, 별도 4폭 실제 클릭 스크립트와 API
11단계로 교차 확인했다. 반대로 이 증거도 실제 외부 공개 발행과 운영 배포를 보증하지는 않는다.

## 벤치마크 적용

Playwright의 actionability 기준을 따라 force click을 쓰지 않고 요소가 보이고 안정적이며 이벤트를
받을 수 있을 때만 실제 클릭했다. viewport emulation 기준으로 390, 768, 1024, 1440을 각각 독립
browser context로 열었다. DOM 존재나 mock 탐침만으로 완료를 선언하지 않은 점을 차용했고,
승인 prototype 정합은 실제 원본 PNG 쌍을 열고 기능 통과와 구조 불일치를 분리했다.

SKILLS_USED: qa, 결함 등록, 실제 앱 회귀, 반응형 관찰, 증거 기록에 사용 / SKILLS_SKIPPED: 없음

SOURCES: docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html | docs/design/prototypes/legacy-prototype-20260912/prototype/osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html | docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md | wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md | /Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/pmf/idea-zero-one-marketing-studio.md | docs/eng-design/fdd-legacy-20260912/fdd/test-plan-r02-v1.0.0-opus.md | https://playwright.dev/docs/actionability | https://playwright.dev/docs/emulation

MODEL: gpt-codex/gpt-5.6-sol / qa-verifier

KNOWLEDGE_QUERY: business + OSMU + 기본 흐름 + 1인 사업자 + 끝내기 우선
HITS_USED: BRAIN `idea-zero-one-marketing-studio.md`와 repo 사업 좌표를 사용했다. 한 원본에서 여러 형식, 발행, 성과 피드백으로 이어지는 검증 축과 초보 1인 사업자 페르소나를 고정하기 때문이다.
HITS_REJECTED: 일반 마케팅 심리와 다른 벤처 자료는 네 방 동작 QA의 판정 근거가 아니어서 사용하지 않았다.
CONFLICTS: 외부 Playwright 기준과 회장 정본은 충돌 없음. 내부에는 사용자 지정 v63과 pipeline 최신 승인 핀 v68 충돌이 있어 디자인 PASS를 금지했다.
