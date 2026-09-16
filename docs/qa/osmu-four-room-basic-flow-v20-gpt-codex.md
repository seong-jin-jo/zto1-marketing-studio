<!--
STAMP
line: osmu
artifact: 네 방 기본 흐름 QA v20
created_at: 2026-09-17 06:19 KST
model: gpt-codex/gpt-5
agent: qa-verifier
skills: qa, localhost 실앱 재현, 반응형 클릭, 전체 회귀와 증거 기록에 사용
basis: docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html, docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md, wiki/product/사업좌표-OSMU와-ZERO-ONE.md
benchmark: https://playwright.dev/docs/emulation, https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
deliberation: 기능 통과, 검증기 환경 실패, 승인 디자인 불일치를 분리했다.
-->

# 네 방 기본 흐름 QA v20

## 결론

localhost 기능 범위는 PASS다. HEAD `7f5564ea` 와 일치하는 실행본에서 생성실
후보 3장부터 편집 인계, 발행 큐, 성과 제안 재인계까지 실제 요청 11/11을 최종
통과했다. 네 방 단면 4/4, Studio v1 14/14, 390 라이트와 다크 및 768, 1024,
1440의 20화면과 성과실에서 생성실 복귀 5/5도 통과했다.

제품 전체 QA는 NG다. 과제가 지정한 v63과 canonical pipeline이 승인한 v68 핏이 충돌한다.
v63 원본과 현재 16개 라이트 화면은 배치 속성 단위로 일치하지 않거나 동일 콘텐츠
상태가 아니다. 운영 동적 URL의 실제 배포 버전과 외부 채널 실발행도 미검증이다.

## 직접 관찰 증거

| 항목 | 판정 | 증거 |
|---|---|---|
| 실행본 귀속과 health | PASS | `GET /api/health` HTTP 200, DB up, `build_commit=7f5564ea469690bc240f994aff9cc64a63be8b02`, 현재 HEAD 일치. `commands/19-health-final.json` |
| 백엔드 기본 흐름 | PASS | 최초와 seed 후 최종 실제 요청 11/11. 후보 3장, 편집 상태 변경, 발행 큐 HTTP 201, 제안 3건, 생성 큐 재인계. `commands/16-verify-basic-flow-final.txt` |
| 네 방 단면 | PASS | 최초와 seed 후 최종 4/4. 가린 모달 0, 401 0, 콘솔 오류 0. `commands/17-probe-four-room-final.txt` |
| 사람 클릭 네 폭 | PASS | 390 라이트·다크, 768, 1024, 1440에서 생성실→편집실→발행실→성과실 클릭 20/20, 성과실→생성실 5/5. 가로 넘침, 탐색 가림, 모달, 401, 콘솔 오류 0. `commands/18-verify-four-room-ui-final.txt`, 원본 `captures-final/` |
| Studio v1 | PASS | 인증 거절, 멱등, 유효 생성, 조회, 시간대별 생성, 무료 다시 만들기 14/14. `commands/04-verify-studio-v1-e2e.txt` |
| 전체 테스트 | PASS | `npm run test`, 374파일·2,414건 통과, 조건부 3건 제외. `commands/05-npm-test.txt` |
| TypeScript | PASS | 정확한 `npx tsc --noEmit` 종료 코드 0. `commands/06-tsc-noemit.txt` |
| production build | 최종 PASS | 최초 symlink 격리 build는 Turbopack 파일시스템 root 제약으로 검증기 환경 NG. `node_modules` 실복사 격리 디렉터리 재검증은 compile 성공, 184/184, 종료 0. 기존 NFT 추적 경고 1건. `commands/07-npm-build.txt`, `commands/08-npm-build-copy.txt` |
| schema, seed, RLS | PASS | `.env.local` 주입 후 `apply-schema.sh --seed` 멱등 적용. pgcrypto, pg_trgm, osmu_service 확인. `commands/11-apply-schema-seed-rls.txt` |
| 주요 API curl | PASS | health, metrics, drafts HTTP 200. 비밀값을 출력하지 않고 최상위 키와 건수만 기록. `commands/13-curl-health-major-api.txt` |
| QA 토큰 정리 | PASS | 이번 실행의 최신 토큰 10/10 폐기 확인. 2026-09-15부터 남아 있던 검증 토큰 1개도 제품 API로 HTTP 200 폐기해 활성 `qa-four-room-*` 토큰 0건. `commands/20-token-cleanup.txt` |
| 디자인 lint | PASS | 8pt 밖 임의 px, 인라인 style, 토큰 밖 hex 위반 0. `commands/12-design-lint.txt` |
| mobile typecheck와 Maestro | 해당 없음 | 별도 Expo 프론트와 Maestro flow가 없는 Next.js 제품이다. 390px은 Chromium에서 직접 관찰했다. |

위 `commands/`와 `captures-final/`은 모두
`logs/diff/osmu-four-room-flow-20260917-v20/` 아래에 있다. 동적 로컬 URL은
`http://localhost:3456`이다. 실제 운영 배포 버전은 미확인이다.

Playwright 공식 emulation 문서의 고정 viewport 방법을 써서 네 폭을 재현했다. W3C Reflow의
정보·기능 손실 및 양방향 스크롤 없음을 `documentWidth`와 다음 행동 표시로 확인했다.

## 디자인 정합 행렬

기준은 v63 HTML과 `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v63/` PNG다.
현재 원본은 v20 `captures-final/`이다. 390 다크는 동작과 대비 확인에 포함했고, 행렬은
v63과 대응 가능한 라이트 16화면을 분모로 삼았다.

| 화면 | 폭 | 주축 방향 | 요소 순서 | 열 수 | 정렬·여백 | 표시·숨김 | 글꼴 단계 | 버튼 위계 | 판정과 근거 |
|---|---:|---|---|---|---|---|---|---|---|
| 생성실 | 390 | 세로 일치 | v63 후보·학습·담당과 현재 단계·입력·예시 순서 불일치 | 1열 | 상단 도구와 본문 간격 불일치 | v63 후보 미리보기 없음 | 제목 단계 다름 | v63 후보 선택과 현재 학습 채우기 우선 | NG, `390-light-create.png` |
| 생성실 | 768 | 세로 중심 일치 | 390과 같은 순서 이탈 | 현재 1열, v63 분할 | 본문 폭 다름 | 후보 미리보기 차이 | 단계 다름 | 주 행동 다름 | NG, `768-light-create.png` |
| 생성실 | 1024 | 가로 혼합 | v63 후보·학습·담당과 현재 입력·예시·담당 순서 다름 | v63 3축, 현재 2축 중심 | 본문과 담당 폭 다름 | 재개 띠와 학습 띠 차이 | 단계 다름 | 주 행동 다름 | NG, `1024-light-create.png` |
| 생성실 | 1440 | 가로 혼합 일치 | 세부 순서 불일치 | 양쪽 다열이나 열 책임 다름 | 카드 폭과 여백 다름 | 현재 상단 네 단계와 재개 띠 추가 | 단계 다름 | 주 행동 다름 | NG, `1440-light-create.png` |
| 편집실 | 390 | 세로 | v63 목차·미리보기·대사·담당과 현재 빈 상태 순서 불일치 | 동일 상태 아님 | 빈 상태 카드 비중 다름 | 편집 도구 미표시 | 동일 상태 아님 | v63 편집 행동과 현재 생성실 이동 | NG, `390-light-edit.png` |
| 편집실 | 768 | 세로 | 390과 같은 상태 불일치 | 동일 상태 아님 | 상단과 빈 카드 간격 다름 | 편집 도구 미표시 | 동일 상태 아님 | 주 행동 다름 | NG, `768-light-edit.png` |
| 편집실 | 1024 | 가로 혼합 | v63 편집 3축과 현재 빈 상태 2축 불일치 | 동일 상태 아님 | 본문과 담당 폭 다름 | 편집 도구 미표시 | 동일 상태 아님 | 주 행동 다름 | NG, `1024-light-edit.png` |
| 편집실 | 1440 | 가로 혼합 | v63 목차·미리보기·대사와 현재 빈 상태·담당 불일치 | 동일 상태 아님 | 넓은 빈 패널 중심 | 핵심 편집 도구 미표시 | 동일 상태 아님 | 주 행동 다름 | NG, `1440-light-edit.png` |
| 발행실 | 390 | 세로 | v63 채널 미리보기와 현재 학습 띠·빈 작업 순서 다름 | 1열 | 카드 높이와 구획 다름 | 첫 화면에 미리보기 미표시 | 단계 다름 | v63 발행과 현재 생성실 이동 | NG, `390-light-publish.png` |
| 발행실 | 768 | 세로 | 390과 같은 상태 불일치 | 동일 상태 아님 | 본문 구획 다름 | 미리보기가 첫 viewport 밖 | 단계 다름 | 주 행동 다름 | NG, `768-light-publish.png` |
| 발행실 | 1024 | 가로 혼합 | v63 연결 안내·발행 행동·미리보기와 현재 학습·빈 작업·담당 순서 다름 | v63 본문·담당 2축, 현재 미리보기 2열+담당 | 카드 폭과 여백 다름 | 현재 7개 미리보기는 아래 표시 | 단계 다름 | v63 선택 발행과 현재 연결 우선 | NG, `1024-light-publish.png` |
| 발행실 | 1440 | 가로 혼합 일치 | 세부 순서 불일치 | 본문·담당 2축 안의 미리보기 3열 | 밀도와 여백 다름 | 현재 빈 작업 경고 추가 | 단계 다름 | 우선 행동 다름 | NG, `1440-light-publish.png` |
| 성과실 | 390 | 세로 일치 | v63 표본·판정·채널·지표와 현재 방 머리·담당·판정 순서 다름 | 1열 | 담당 패널 위치 다름 | 현재 첫 viewport에 지표 미표시 | 제목 단계 다름 | v63 채널·제안과 현재 담당 질문 우선 | NG, `390-light-performance.png` |
| 성과실 | 768 | 세로 중심 일치 | 390과 같은 순서 이탈 | 지표 전환 시점 다름 | 패널 여백 다름 | 담당 위치 다름 | 단계 다름 | 우선 행동 다름 | NG, `768-light-performance.png` |
| 성과실 | 1024 | 가로 혼합 | v63 판정 중심과 현재 담당 우측 고정 순서 다름 | 지표 열 수 다름 | 본문과 담당 폭 다름 | 예시 지표 표시 차이 | 단계 다름 | 우선 행동 다름 | NG, `1024-light-performance.png` |
| 성과실 | 1440 | 가로 혼합 일치 | v63 결론·비교 막대·지표와 현재 표본 부족·연결 안내·예시 지표 순서 다름 | 양쪽 4개 지표, 하위 열 책임 다름 | 카드 폭과 여백 다름 | 현재 담당·예시 데이터 표시 | 단계 다름 | 우선 행동 다름 | NG, `1440-light-performance.png` |

## 요청 번호 승계

| 요청번호 | 요청 요지 | 테스트번호 | 판정 | 증거 |
|---|---|---|---|---|
| R08 | 사이드바에서 네 방을 잇는다 | FLOW-UI-V20 | PASS | 네 방 4개, 네 폭, 성과실에서 생성실 복귀 5/5 |
| R19 | 지원 viewport에서 실제로 눌러 본다 | FLOW-UI-V20 | PASS | 390, 768, 1024, 1440과 390 다크 총 20화면 |
| R166, R172 | 생성부터 성과 재인계까지 기본 흐름을 먼저 살린다 | FLOW-API-V20 | PASS | 실제 요청 최종 11/11 |
| R193, R205, R206 | 승인 시안 계승과 화면 충실도 | DESIGN-CONF-V20 | NG | 16개 화면 모두 배치 속성 불일치 또는 동일 상태 미확보 |
| R207 | 성과실 UX와 학습 정보를 구성한다 | FLOW-PERF-V20 | 부분 PASS | 방향 제안 3건과 생성 큐 인계는 동작. v63 시각 정합 NG |
| R01부터 R207 및 세부 요청 232건 중 이번 범위 밖 | 회장 확정 요구 전건 | REQ-ALL-V20 | 이월 | 기존 정본 판정을 유지하고 이번 범위 관련 요청만 갱신 |

## 기존 구현 확인과 보존

네 방 이동, 후보 생성, 편집 상태 변경, 발행 큐, 성과 제안과 생성실 재인계는 이미
구현돼 있었다. 제품 화면, API, DB schema와 생성 계약을 변경하지 않았다. 이번에는
실패한 build 격리 방식을 symlink에서 실복사로 바꾸어 검증했고, 오래 남은 QA 토큰 1개를 제품
API로 폐기했다. 제품 소스는 고치지 않았다.

## 페르소나 결정

질문: 바이브코딩 결과물을 이미 가진 1인 사업가가 생성실에서 시작해 성과실까지 길을 잃지 않는가?

답: 기능 경로에서는 그렇다. 네 폭 모두 실제 링크로 네 방을 이동했고 성과실에서 생성실로
돌아왔으며, 다음 행동이 보이고 가리는 모달과 가로 넘침이 없었다. 편집실과 발행실의
증거는 빈 작업 상태이고 v63 원본과 구조가 다르므로 전체 경험과 시각 계승은 합격 처리할 수 없다.

## 레드팀과 셀프심문

까다로운 고객은 클릭 이동이 된다는 사실만으로 승인 시안을 계승했다고 보지 않는다. 그래서
기능 PASS와 16화면 디자인 NG를 분리했고, 검증기의 격리 build 실패도 숨기지 않고
실복사 환경에서 184/184를 다시 확인했다.

이 결론이 틀렸다면 가장 그럴듯한 이유는 빈 상태의 편집실·발행실을 통과한 것이 실제 콘텐츠가
채워진 업무를 대변하지 못하기 때문이다. 백엔드 11단계는 채워진 인계를 검증했지만 화면 증거는
빈 상태 중심이다. 따라서 동일 콘텐츠 상태의 시각 정합은 미검증으로 남기고 제품 전체를 NG로 유지했다.

SKILLS_USED: qa, 실제 앱 재현, 전체 회귀, 반응형 클릭과 증거 기록에 사용 / SKILLS_SKIPPED: 없음

SOURCES: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html` | `docs/design/prototypes/legacy-prototype-20260912/prototype/qa-v63/` | `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md` | `wiki/product/사업좌표-OSMU와-ZERO-ONE.md` | `pipeline-state.osmu.md` | `docs/design/captures/manifest.json` | https://playwright.dev/docs/emulation | https://www.w3.org/WAI/WCAG22/Understanding/reflow.html

MODEL: gpt-codex/gpt-5 / qa-verifier

KNOWLEDGE_QUERY: BRAIN business 허브에서 ZERO-ONE Marketing Studio, OSMU 발행·성과 회수, 바이브코딩 결과물 보유 고객 경계를 검색했다.
HITS_USED: `wiki/business/pmf/idea-zero-one-marketing-studio.md`, 원본에서 발행과 성과 회수까지의 관통 흐름을 QA 기준으로 채택. `wiki/business/pmf/concept-제로원-고객경계-바이브코딩-결과물-보유자.md`, 결과물을 이미 가진 고객의 다음 단계라는 페르소나 경계를 채택.
HITS_REJECTED: 교육상품, 수익형 블로그, ZERO-ONE 후속 Builder 문서는 이 제품의 네 방 회귀와 직접 관련이 없어 사용하지 않았다.
CONFLICTS: 과제 지정 기준은 v63이지만 canonical `pipeline-state.osmu.md`의 최신 approved design_hub는 v68이다. 지시대로 v63을 대조했고 단일 핏이 정리될 때까지 디자인 QA는 NG다.
