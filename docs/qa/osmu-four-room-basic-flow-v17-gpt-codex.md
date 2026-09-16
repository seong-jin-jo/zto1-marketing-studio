<!--
STAMP
line: osmu
artifact: 네 방 기본 흐름 QA v17
created_at: 2026-09-16 18:42 KST
model: gpt-codex/gpt-5
agent: qa-verifier
skills: qa, 실제 앱 결함 재현, 수정, 전 기능 회귀와 증거 기록에 사용
basis: docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html, docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md, wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md
benchmark: https://playwright.dev/docs/emulation, https://playwright.dev/docs/screenshots
deliberation: 기능 관통 PASS와 승인 시안 불일치를 분리해 제품 전체 PASS로 과장하지 않았다.
-->

# 네 방 기본 흐름 QA v17

## 결론

localhost 기능 범위는 수정 후 PASS다. 생성실의 실제 AI 후보 생성부터 편집실 인계, 발행 큐,
성과 제안 재인계까지 11/11을 통과했다. 네 방은 390, 768, 1024, 1440에서 총 20화면이
그려졌고 가로 넘침, 전체 화면 모달, 탐색 가림, 브라우저 401, 콘솔 오류는 모두 0건이다.

제품 전체 QA는 NG를 유지한다. 과제 지정 v63과 pipeline 승인 v68 핀이 충돌하며, 이번 실제 화면은
v63과 배치 속성 단위로 일치하지 않는다. 운영 동적 URL과 실제 외부 채널 발행도 미검증이다.

## 끊긴 곳과 수정

첫 실제 생성은 `STUDIO_LLM_PROVIDER_UNAVAILABLE`로 실패했다. 3,044바이트의 실제 후보 프롬프트를
CLI에 직접 보내 재현하니 `OAuth session expired and could not be refreshed`가 반환됐다. 짧은 호출은
남은 access token으로 통과해 실행 파일 정상으로 오인될 수 있었다.

근본 원인은 cron과 launchd로 시작한 감독 서버가 macOS 로그인 키체인 세션 식별자를 잃는 구조였다.
감독이 ConsoleUser의 `kSCSecuritySessionID`를 읽어 `SECURITYSESSIONID`로 복구하게 했고, 앱은 Claude
CLI 자식에게 운영체제와 네트워크 최소 환경만 전달하되 이 로그인 세션은 보존하게 했다. 앱 비밀값,
상위 Claude 실행 상태, 임시 설정 경로는 자식에게 전달하지 않는다. 회귀 테스트
`QA-FLOW-RUNTIME-03`과 자식 환경 격리 테스트를 추가했다.

수정 커밋은 `327500b0`, 타입 계약 보수 커밋은 `e7b8dc0d`다. 최종 네 방 단면 재검증에서는
AuthGate의 늦은 client navigation과 다음 직접 이동이 겹쳐 성과실 `goto`가 `ERR_ABORTED`로 한 번
취소됐다. 목표 주소 확인 뒤 해당 오류에만 딱 한 번 재시도하도록 탐침을 보강하고 계약 테스트를
추가했다. 이 검증기 수정 커밋은 `71495ef5`다.

## 직접 관찰 증거

| 항목 | 판정 | 증거 |
|---|---|---|
| 백엔드 기본 흐름 | PASS | 최종 localhost 실제 요청 11/11. `logs/diff/osmu-four-room-flow-20260916-v17/commands/29-basic-flow-final2.log` |
| 네 방 단면 | PASS | 최종 4/4 렌더, 가린 모달 0, 브라우저 401 0, 콘솔 오류 0. 최초 재실행의 `ERR_ABORTED`는 `commands/25-probe-four-room-final.log`, 수정 후 통과는 `commands/30-probe-four-room-final2.log` |
| 사람 클릭 네 폭 | PASS | 390 라이트와 다크, 768, 1024, 1440에서 생성실부터 성과실까지 20화면, 성과실에서 생성실 복귀 5/5. `commands/31-four-room-ui-final2.log` |
| Studio v1 | PASS | 인증 거절, 유효 생성, 조회, 시간대별 생성, 무료 다시 만들기 14/14. `commands/32-studio-v1-final2.log` |
| 전체 테스트 | PASS | 최종 371파일, 2,387건 통과, 조건부 3건 제외. `commands/33-npm-test-after-probe-fix.log` |
| TypeScript | PASS | 검증기 수정 후 정확한 `npx tsc --noEmit`, 종료 코드 0. `commands/34-tsc-after-probe-fix.log` |
| production build | PASS | Next.js 16.2.2, 184/184 정적 페이지 생성. 기존 NFT 추적 경고 1건. `commands/19-npm-build.log` |
| schema, seed, RLS | PASS | schema, 지정 seed, RLS 멱등 적용. pgcrypto, pg_trgm, osmu_service 확인. `commands/20-schema-seed.log` |
| 디자인 lint | PASS | 8pt 밖 임의 px, 인라인 style, 토큰 밖 hex 위반 0. `commands/21-design-lint.log` |
| mobile typecheck와 Maestro | 해당 없음 | 별도 Expo 또는 모바일 소스와 Maestro flow가 없는 Next.js 제품이다. `docs/구현현황.md`의 기존 제품 구조와 레포 검색으로 확인 |

원본 PNG는 `logs/diff/osmu-four-room-flow-20260916-v17/captures/`에 있다. QA 로그와 이 문서는
원본을 복제하지 않고 해당 경로를 참조한다. 동적 로컬 URL은 `http://localhost:3456`이며 검증 뒤
통제 서버를 종료했다. 실제 배포 버전은 미확인이다.

## 디자인 정합 행렬

비교 기준은 과제에 지정된 v63 원본과 같은 폭으로 저장된
`docs/design/prototypes/legacy-prototype-20260912/prototype/qa-flow-rerun-20260829-0210/`의 PNG다.
기능 검증은 PASS지만 시각 정합은 아래처럼 NG다.

| 화면 | 폭 | 주축 방향 | 요소 순서 | 열 수 | 정렬과 여백 | 표시와 숨김 | 글꼴 단계 | 버튼 위계 | 판정과 근거 |
|---|---:|---|---|---|---|---|---|---|---|
| 생성실 | 390 | 세로는 일치 | v63 예시, 학습 정보, 담당 순서와 현재 진행, 입력, 구조 순서가 다름 | 1열 | 상단 묶음과 카드 간격 다름 | v63 예시 카드가 현재에 없음 | 제목과 본문 단계 다름 | v63 주제 쓰기, 현재 학습 정보 채우기가 우선 | NG, `390-light-create.png` |
| 생성실 | 768 | 세로 중심은 일치 | 390과 같은 순서 이탈 | 현재 1열, v63 분할 구조 | 상단 단계와 본문 폭 다름 | 예시 카드 표시 차이 | 단계 다름 | 주 행동 다름 | NG, `768-light-create.png` |
| 생성실 | 1024 | 현재 가로 혼합 | v63 후보, 학습, 담당과 현재 입력, 후보, 담당 순서가 다름 | v63 3축, 현재 2축 중심 | 본문과 담당 폭 다름 | 진행 띠와 재개 띠 표시 차이 | 단계 다름 | 주 행동 다름 | NG, `1024-light-create.png` |
| 생성실 | 1440 | 가로 혼합은 일치 | 세부 순서 불일치 | 양쪽 모두 다열이나 열 책임이 다름 | 카드 폭과 여백 다름 | 현재 상단 네 단계와 재개 띠 추가 | 단계 다름 | 주 행동 다름 | NG, `1440-light-create.png` |
| 편집실 | 390 | 세로 | v63은 목차, 미리보기, 대사, 담당. 현재는 빈 상태와 이동 행동 | 비교 불가 | 빈 상태 높이와 간격 다름 | 상태가 달라 핵심 편집 도구 미표시 | 비교 불가 | v63 저장, 현재 생성실 이동 | NG, 같은 상태 캡처가 아님 |
| 편집실 | 768 | 세로 | 390과 같은 상태 불일치 | 비교 불가 | 비교 불가 | 편집 도구 미표시 | 비교 불가 | 주 행동 다름 | NG |
| 편집실 | 1024 | 가로 혼합 | v63 편집 3축, 현재 빈 상태 2축 | 비교 불가 | 본문과 담당 배치 다름 | 편집 도구 미표시 | 비교 불가 | 주 행동 다름 | NG |
| 편집실 | 1440 | 가로 혼합 | v63 목차, 미리보기, 담당과 현재 빈 상태, 담당 | 비교 불가 | 넓은 빈 패널 중심 | 핵심 편집 도구 미표시 | 비교 불가 | 주 행동 다름 | NG, `1440-light-edit.png` |
| 발행실 | 390 | 세로 | v63 일곱 채널 미리보기와 현재 학습 띠, 빈 상태 순서가 다름 | 1열 | 카드 높이와 구획 다름 | 현재 미리보기 미표시 | 단계 다름 | v63 채널 발행, 현재 생성실 이동 | NG, `390-light-publish.png` |
| 발행실 | 768 | 세로 | 390과 같은 상태 불일치 | 비교 불가 | 비교 불가 | 일곱 미리보기 미표시 | 비교 불가 | 주 행동 다름 | NG |
| 발행실 | 1024 | 가로 혼합 | v63 채널 묶음과 현재 빈 상태가 다름 | 비교 불가 | 비교 불가 | 일곱 미리보기 미표시 | 비교 불가 | 주 행동 다름 | NG |
| 발행실 | 1440 | 가로 혼합 | v63 텍스트, 영상, 카드뉴스와 현재 연결 안내, 빈 상태 순서가 다름 | v63 3열, 현재 빈 상태와 담당 2축 | 본문 밀도와 여백 다름 | 일곱 미리보기 미표시 | 단계 다름 | 주 행동 다름 | NG, `1440-light-publish.png` |
| 성과실 | 390 | 세로는 일치 | v63 연결, 진행, 판정, 제안, 반응. 현재 방 머리, 담당, 판정 순서 | 1열 | 상단과 담당 패널 위치 다름 | 현재 첫 화면에서 제안 카드가 아래로 밀림 | 제목 크기 단계 다름 | v63 연결과 제안, 현재 담당 질문이 먼저 | NG, `390-light-performance.png` |
| 성과실 | 768 | 세로 중심은 일치 | 390과 같은 순서 이탈 | 지표 열 전환 시점 다름 | 패널 여백 다름 | 담당 패널 표시 위치 다름 | 단계 다름 | 우선 행동 다름 | NG |
| 성과실 | 1024 | 가로 혼합 | v63 판정과 제안 중심, 현재 담당 우측 고정 | 지표와 제안 열 수 다름 | 본문과 담당 폭 다름 | 예시 지표 표시 차이 | 단계 다름 | 우선 행동 다름 | NG |
| 성과실 | 1440 | 가로 혼합은 일치 | 세부 순서와 담당 위치 불일치 | v63 제안 3열, 현재 첫 화면 판정 중심 | 카드 폭과 여백 다름 | 현재 예시 데이터와 담당 패널 노출 | 단계 다름 | 우선 행동 다름 | NG, `1440-light-performance.png` |

## 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 사이드바에서 네 방을 잇는다 | FLOW-UI-V17 | PASS | 네 방 4개, 네 폭, 성과실에서 생성실 복귀 5/5 |
| R19 | 지원 viewport에서 실제로 눌러 본다 | FLOW-UI-V17 | PASS | 390, 768, 1024, 1440과 390 다크 총 20화면 |
| R166, R172 | 생성부터 성과 재인계까지 기본 흐름을 먼저 살린다 | FLOW-API-V17 | PASS | 실제 요청 11/11 |
| R193, R205, R206 | 승인 시안 계승과 화면 충실도 | DESIGN-CONF-V17 | NG | 16개 화면과 폭 조합 모두 배치 속성 불일치 또는 동일 상태 미확보 |
| R207 | 성과실 UX와 학습 정보를 구성한다 | FLOW-PERF-V17 | 부분 PASS | 방향 제안 3건과 생성 큐 인계는 동작. v63 시각 정합은 NG |
| R01부터 R207 및 세부 요청 232건 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V17 | 이월 | 기존 정본 판정을 유지하고 이번 범위 관련 요청만 갱신 |

## 페르소나 결정

질문: 콘텐츠 자동화를 처음 쓰는 1인 사업가가 생성실에서 시작해 성과실까지 길을 잃지 않는가?

답: 기능 경로만 보면 그렇다. 네 폭 모두 네 방 이동과 복귀가 되고, 가린 모달과 401과 콘솔 오류가
없었다. 다만 빈 편집실과 빈 발행실은 생성실로 돌아가는 길만 보여 주므로, 실제 콘텐츠가 화면 UI에
이어지는 동일 상태의 시각 검증 없이는 전체 경험을 합격 처리할 수 없다.

## 레드팀과 셀프심문

까다로운 고객은 테스트 숫자가 아니라 첫 생성이 실제로 만들어지고 다음 방에 이어지는지를 본다.
그래서 mock 결과를 제외하고 OAuth refresh 실패를 실제 3,044바이트 프롬프트로 재현한 뒤 localhost
11단계와 Studio v1 14건을 다시 통과시켰다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 빈 상태 화면의 이동 성공을 콘텐츠가 채워진 전체 사용성
성공으로 과장한 것이다. 그래서 기능 관통 PASS와 디자인 정합 NG를 분리하고, 운영 배포와 실제 외부
발행은 미검증으로 남겼다.

SKILLS_USED: qa, 실제 앱 재현, 수정, 전 기능 회귀, 반응형 증거 기록에 사용 / SKILLS_SKIPPED: 없음

SOURCES: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md` | `pipeline-state.osmu.md` | `docs/design/captures/manifest.json` | `docs/qa/osmu-v24-design-conformance-matrix-v1-gpt-codex.md` | https://playwright.dev/docs/emulation | https://playwright.dev/docs/screenshots

MODEL: gpt-codex/gpt-5 / qa-verifier

KNOWLEDGE_QUERY: BRAIN business 허브에서 ZERO-ONE 마케팅 스튜디오 제품 원칙, 자동화 서비스의 존재감, 기존 제품 기반 OSMU 흐름을 검색했다.
HITS_USED: `wiki/business/pmf/idea-zero-one-marketing-studio.md`, 기존 제품에서 원본을 받아 각색, 발행, 성과, 추천으로 잇는 고객 흐름을 QA 관통 기준으로 채택. `wiki/business/마케팅/concept-자동화-서비스-존재감.md`, 진행 상태와 투명성을 가림 모달과 다음 행동 판정 기준으로 채택.
HITS_REJECTED: BRAIN의 다른 사업체 마케팅 문서는 이 제품의 네 방 기능과 직접 관련이 없어 사용하지 않았다.
CONFLICTS: 과제 지정 기준은 v63이지만 canonical `pipeline-state.osmu.md`의 최신 approved design_hub는 v68이다. 이번 표는 지시대로 v63을 비교했으며 디자인 승인 판정은 단일 핀이 정리될 때까지 NG다.
