<!--
STAMP
line: osmu
created_at: 2026-09-16 00:51 KST
model: gpt-codex/gpt-5
agent: code-reviewer
skills: review
scope: 2026-09-15 00:04:44 KST 기준 직전 24시간, 90e785e3..af4f21cf 순변경
basis: pipeline-state.osmu.md approved_artifacts, DESIGN.md v37, v63 요구 시안, v68 승인 시안, 회장 요구 대장, 사업 좌표
benchmarks: OWASP API4:2023, Node.js fs access 문서
deliberation: 통과한 자동검증을 완료 증거로 오인하지 않고 고객 경계, 파일 경합, 외부 발행 불확실성, 검증기 자체의 거짓 성공을 역방향으로 공격했다.
-->

# OSMU 최근 24시간 코드 공격 리뷰

한 줄 결론: MAJOR 17건이다. 고객 기능 403, 첫 큐 파일 파손, 잠금 밖의 큐 덮어쓰기, 복구 불가능한 발행 불명 상태, 배포에 없는 공개 저장소 설정, 중복 외부 발행, 오류를 정상으로 세는 검증기가 있어 머지를 막아야 한다.

## 범위와 계약

- 검토 창: 2026-09-15 00:04:44 KST에 고정한 직전 24시간이다.
- 순변경: `90e785e39d72795dbca5c6587c253eb846f48234..af4f21cfbef7b82ca2a511709e67da53395304d8`, 171개 파일, 추가 9,680줄, 삭제 428줄이다.
- 승인 핀: `pipeline-state.osmu.md:236-239`의 v68 디자인 허브와 `DESIGN.md` v37이다. 승인된 PRD 핀은 현재 블록에 없다. PRD v8.2.1은 `상태: in-review`라 계약 근거가 아닌 위험 대조 자료로만 읽었다.
- 추가 요구 시안: `openclaw-auto-4room-v63.html`을 실제 렌더하고 원문을 열었다. `R190`의 앞으로, 뒤로 단추 삭제는 확정 요구이므로 결함으로 세지 않았다.
- 요구 정본: 지정 파일은 이동 안내 포인터였다. 포인터가 지시한 `wiki/거버넌스/요청.md`에서 R100, R172, R176, R190, R201과 최근 작업 원문을 대조했다.
- 직접 관찰: localhost:3456 health 200, 기본 흐름 11/11, Studio v1 14/14, 고객 임시 토큰으로 카드뉴스 생성 403, 발급 토큰 폐기 200, 첫 큐 파일 0바이트와 JSON 파싱 오류, API 검증기 오류 본문 3종의 정상 오분류를 관찰했다.

## MAJOR

MAJOR: [승인 시안 이탈] dashboard/src/components/layout/Sidebar.tsx:307 - 저장값이 없는 첫 방문을 펼침으로 초기화하고 393행에서 224px 고정 열로 본문을 민다 / `DESIGN.md:157`은 "1024는 좌 56px 자동 축소", `DESIGN.md:261-262`는 "1024에서 펼치면 224px 패널이 56px 레일 위로 임시 겹침, 본문 폭은 바뀌지 않는다"고 확정했다 / 1024의 기본 상태를 56px로 만들고 펼침은 레일 위 오버레이로 처리해야 한다.

재현: 새 브라우저 컨텍스트에서 `customer_sidebar_collapsed`를 비운 뒤 1024px로 고객 화면을 열면 사이드바가 224px로 시작하고 본문 폭이 줄어든다.

MAJOR: [승인 시안 이탈] dashboard/src/components/layout/Sidebar.tsx:413 - 접힌 상태에서 `RoomFlowNav` 전체를 DOM에서 제거해 네 방 상시 이동과 현재 위치가 함께 사라진다 / `DESIGN.md:161-165`는 사이드바 맨 위 네 방을 유지하고 접히면 "아이콘과 현재 항목 강조만 남는다"고 했고, 요구 대장 `wiki/거버넌스/요청.md:449-500`은 사이드바 네 방 삭제가 회장 지시 날조였다고 바로잡았다 / 접힌 레일에도 네 방 아이콘과 현재 위치를 남기고 글자만 접근성 방식으로 접어야 한다.

재현: 데스크톱에서 사이드바 접기를 누른 뒤 `aside section[aria-label="한 편의 제작 순서"]`를 찾으면 네 방 이동 자체가 없다.

MAJOR: [회귀 위험] dashboard/src/proxy.ts:41 - 고객 허용 목록에서 `/api/card-news/generate`를 제거했지만 `dashboard/src/components/channel/InstagramPage.tsx:77`은 그대로 이 경로를 호출한다 / 확정 사업 흐름은 첫 후보를 만든 뒤 발행으로 이어져야 하고, 주석의 "Studio 생성 경로를 사용"한다는 대체 배선은 실제 소비자 코드에 없다 / 고객 화면을 테넌트, 비용 장부, 결과 manifest를 가진 새 생성 경로로 원자 교체한 뒤 옛 문을 닫거나 이 기능을 명시적으로 비활성화해야 한다.

재현: 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`의 임시 고객 토큰으로 `POST /api/card-news/generate`를 보내면 HTTP 403과 `이 API는 운영자 전용입니다`가 반환된다.

MAJOR: [회귀 위험] dashboard/src/app/api/card-news/outline/route.ts:26 - 고객에게 새로 연 공유 생성 경로가 정규식으로 잡은 임의 JSON을 스키마 검증 없이 200으로 반환하고 29행의 펼치기 순서 때문에 모델의 `success` 값이 서버 판정을 덮을 수 있다 / 외부 모델 출력은 신뢰 경계 밖이며 응답 계약은 슬라이드 문자열 배열, 캡션 문자열, 해시태그 문자열 배열이어야 한다 / 허용 키와 타입을 런타임 스키마로 검증하고 잘못된 출력은 성공 응답과 분리해야 한다. 같은 경계인 `ai-suggest/guide`와 `ai-suggest/keywords`도 함께 고쳐야 한다.

재현: 생성 모델이 `{"slides":"한 장","success":false}`를 반환하도록 대체하면 라우트는 배열 검증 없이 HTTP 200을 만들고 서버가 세운 성공값도 모델 값으로 덮인다.

MAJOR: [회귀 위험] openclaw/extensions/threads-queue/src/queue-lock.ts:12 - 없는 큐 파일을 14행의 `open(..., "a")`로 0바이트 생성한 뒤 콜백을 실행한다 / 실제 독자는 `openclaw/extensions/threads-queue/api.ts:30-34`와 `threads-queue-tool.ts:148-157`에서 빈 문자열을 그대로 `JSON.parse`하며 ENOENT만 초기값으로 처리한다 / 잠금 준비 시 유효한 빈 큐 JSON을 원자 초기화하거나 파일 생성과 첫 읽기를 하나의 초기화 계약으로 묶어야 한다.

재현: 새 임시 디렉터리의 없는 `queue.json`에 `withQueueLock`을 한 번 호출했다. 결과는 0바이트였고 `JSON.parse`는 `SyntaxError`를 냈다. 추가된 잠금 테스트는 18행에서 미리 `{}`를 써 이 첫 실행을 건너뛴다.

MAJOR: [회귀 위험] openclaw/extensions/threads-insights/src/threads-insights-tool.ts:160 - 큐를 잠금 밖에서 읽고 262행에서 전체 큐를 다시 쓴다 / 이번 변경은 `threads-queue-tool.ts:265-268`만 공용 잠금으로 감쌌으므로 수집기가 오래 들고 있던 큐가 고객 취소, 발행 청구, 공급자 결과를 덮을 수 있다 / 큐를 읽고 고쳐 쓰는 모든 도구를 같은 잠금 안으로 넣거나 단일 트랜잭션 저장소로 합쳐야 한다.

재현: 성과 수집기가 큐 A를 읽은 직후 다른 프로세스가 글을 취소하고 큐 B를 저장하게 한 뒤 수집기를 완료시키면 262행이 A 기반 전체 객체를 써 취소 상태를 되돌린다.

MAJOR: [회귀 위험] openclaw/extensions/threads-queue/src/queue-claim.ts:105 - 채널 하나가 `publishing`이면 만료된 청구도 영구 회수하지 않는데 복구 행동이 없다 / 발행 도구는 네트워크 불명 상태를 `result_unknown`으로 남기고, `threads-queue-tool.ts:170-174`의 행동 목록에는 공급자 조회나 조정이 없으며 470-480행은 청구 해제도 막는다 / 멱등 키와 공급자 식별자로 결과를 조회해 성공, 실패, 재시도 가능 상태로 조정하는 명시적 복구 행동을 추가해야 한다.

재현: 공급자가 게시물을 만든 뒤 응답 연결만 끊기게 하면 채널은 `publishing/result_unknown`으로 남고 lease가 지나도 새 워커가 청구하지 못하며 운영자도 해제할 수 없다.

MAJOR: [회귀 위험] openclaw/extensions/threads-publish/src/threads-publish-tool.ts:150 - Studio가 넘긴 로컬 `/images/` 완성본을 무조건 실패로 바꿔 Threads 이미지 발행을 제거했다 / v8.2.1 위험 대조 자료 258행은 완성 파일을 불변 참조나 공급자용 배달 핸들로 발행하는 흐름을 요구하고, 현재 제품은 이미지가 있는 큐 항목을 이미 만든다 / 짧은 만료와 소유권 검증을 가진 공급자용 배달 핸들을 연결한 뒤 차단을 해제해야 한다.

재현: 승인된 Threads 큐 항목의 `imageUrl`을 `/images/<tenant>/<file>`로 두고 발행하면 공급자 요청 전에 `보호된 이미지 배달 저장소가 준비되지 않아 발행하지 않았습니다`로 끝난다.

MAJOR: [회귀 위험] openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:85 - 로컬 이미지 발행에 `R2_PUBLIC_URL`을 필수로 요구하지만 배포 워크플로 `deploy-marketing.yml:215-218`은 이 값을 주입하지 않고 `.env.example:55`는 명시적으로 사용하지 않는다고 선언한다 / 배포 계약과 런타임 계약이 반대라 실제 배포에서 로컬 Instagram 발행은 항상 설정 오류가 된다 / 비공개 버킷의 서명된 단기 배달 주소를 쓰거나 배포와 비밀값 인벤토리를 합의된 단일 계약으로 맞춰야 한다.

재현: 현재 배포 워크플로가 만드는 환경 변수 집합으로 `/images/` Instagram 발행을 실행하면 88-90행에서 공급자 호출 전에 설정 오류가 난다.

MAJOR: [회귀 위험] openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:102 - 발행용 복사본은 `PutObjectCommand`로 영구 공개 경로에 쓰지만 성공, 부분 실패, 재시도 어디에도 삭제나 만료 정책이 없다 / 사용자 미디어가 공개 주소에 계속 남고 재시도마다 새 멱등 키 객체가 생겨 저장비와 개인정보 노출이 누적된다 / 객체 수명, 삭제 시점, 실패 보상, 버킷 수명주기 규칙을 발행 트랜잭션에 포함해야 한다.

재현: 같은 카드뉴스 발행을 공급자 오류로 세 번 재시도하면 서로 다른 키의 복사본이 남으며 파일에는 `DeleteObjectCommand` 호출이 하나도 없다.

MAJOR: [회귀 위험] dashboard/scripts/lib/api-sweep-contract.mjs:5 - HTTP 2xx JSON에서 `ok:false`만 실패로 보고 `success:false`, 최상위 `error`, 예상 배열 구조 위반은 모두 정상으로 분류한다 / 검증기는 부분 실패나 오류 본문을 전체 성공으로 세면 안 된다 / 라우트별 성공 스키마를 검사하고 최소한 `success:false`, 오류 필드, 예상 형태 위반을 실패로 분류해야 한다.

재현: 분류기에 `{"success":false,"error":"고장"}`, `{"error":"고장"}`, `[]`를 각각 HTTP 200 JSON으로 넣었고 세 건 모두 `정상`이 나왔다.

MAJOR: [회귀 위험] dashboard/scripts/verify-api-read-sweep.mjs:252 - 소스 해시와 리스너 PID가 실행 전후 같다는 사실만 검사하고 263행의 현재 Git 커밋을 보고서에 따로 적어 실행 중 서버가 그 커밋을 로드했는지는 증명하지 않는다 / 오래된 서버가 살아 있으면 새 소스 검증으로 포장된 거짓 성공이 가능하다 / 서버가 빌드 커밋을 health에서 반환하게 하고 검증 시작 전에 대상 커밋과 같음을 강제하거나 검증기가 대상 서버를 직접 기동해야 한다.

재현: localhost:3456의 `/api/health`는 200이지만 키가 `db`, `ms`, `ok`뿐이고 build SHA, commit, version이 모두 없다. 이 상태도 PID와 파일 해시가 안 바뀌면 `evidence_stable:true`가 된다.

MAJOR: [회귀 위험] dashboard/scripts/verify-four-room-ui-e2e.mjs:211 - 새 브라우저에 인증, 작업 공간, 테마만 넣고 `customer_sidebar_collapsed`를 설정하거나 폭별 기본값을 검증하지 않는다 / `DESIGN.md:157`과 261행의 1024 기본 56px 계약을 시험해야 하지만 실제 코드 `Sidebar.tsx:307-310`의 펼침 기본값을 그대로 받아 잘못된 224px 화면도 통과시킨다 / 1024에서 저장값 없는 초기 상태, 펼침 오버레이, 접힘 뒤 네 방 아이콘을 각각 치수와 DOM으로 단언해야 한다.

재현: 1024 컨텍스트의 초기 스크립트를 그대로 실행하면 접힘 저장값이 없고 사이드바는 224px로 열린다. 현재 검증은 방 본문과 현재 라벨만 확인해 승인 폭 이탈을 실패로 만들지 않는다.

MAJOR: [회귀 위험] dashboard/src/app/studio/page.tsx:72 - 모든 발행 요청을 45초에 중단하지만 YouTube 서버 업로드만 `dashboard/src/app/api/video/publish/route.ts:229-234`에서 최대 120초 실행한다 / 클라이언트 실패 뒤 서버와 공급자가 계속 성공할 수 있어 사용자가 재시도하면 같은 영상이 중복 게시된다 / 발행을 서버 작업과 멱등 키로 만들고 상태 조회로 조정하거나 클라이언트 제한을 전체 서버 기한보다 길게 두어 결과 불명을 별도 상태로 표시해야 한다.

재현: YouTube 업로드 응답을 60초에 끝내게 하면 화면은 45초에 실패로 닫히지만 서버 요청은 계속된다. 사용자가 다시 누르면 첫 업로드의 성공 여부를 확인하지 않고 두 번째 외부 요청이 시작된다.

MAJOR: [회귀 위험] dashboard/src/components/home/PerformanceDashboard.tsx:38 - 수집 실패 상세와 제외 목록을 POST 직후 React 상태에만 저장하고 새로고침 GET에서는 되살리지 않는다 / `/api/metrics`는 `metrics_blocked`를 반환하지만 `PerformanceRoom.tsx:805-808`은 일시 실패, 일시 제외, 영구 제외만 합치고 영속 `post.metrics_blocked`를 빠뜨린다 / GET의 영속 실패 코드와 증거를 표 행의 단일 원천으로 쓰고 POST 결과는 재조회로 수렴시켜야 한다.

재현: 성과 수집으로 `metrics_blocked`가 남은 글을 확인한 뒤 새로고침하면 POST에서 받은 실패 상세는 사라지고 해당 글의 실패 이유도 표에서 사라진다.

MAJOR: [회귀 위험] dashboard/src/app/api/video/subtitle/route.ts:46 - ffprobe가 실패하거나 제한시간을 넘으면 실제 길이를 모른 채 6초로 대체하고 142행의 최대 길이 검사를 통과시킨 뒤 164행에서 최대 180초 ffmpeg를 시작한다 / 새 자원 제한은 측정 실패를 짧은 영상으로 간주해 우회되며 테넌트별, 전역 동시 실행 제한도 없다 / 길이 측정 실패는 닫고, 자막 작업을 동시성 제한 작업 큐에서 실행하며 프로세스와 입력 자원 상한을 함께 강제해야 한다.

재현: `FFPROBE_BIN` 실패 또는 20초 제한 초과를 만들고 허용 용량 안의 긴 영상을 제출하면 `durationSec=6`으로 길이 관문을 통과해 ffmpeg 실행까지 간다.

MAJOR: [회귀 위험] dashboard/src/lib/anthropic.ts:24 - 고정 후보가 존재하는지만 보고 실행 권한을 확인하지 않은 채 모듈 로드시 영구 선택한다 / Node.js 문서상 파일 존재와 실행 가능성은 별개이며 추가된 회귀 테스트도 `anthropic-runtime.regression-1.test.ts:13-16`에서 문자열 존재만 확인한다 / 실행 권한을 확인하고 실제 spawn의 ENOENT, EACCES에서 다음 후보나 PATH로 한 번만 안전하게 폴백하는 동작 테스트가 필요하다.

재현: `~/.local/bin/claude`에 실행 권한 없는 파일을 두고 PATH에는 정상 Claude를 두면 resolver는 앞 파일을 선택하고 모든 생성이 EACCES로 실패하며 PATH 폴백이 없다.

## 검증 증거

| 검증 | 결과 | 증거 등급 |
|---|---|---|
| `npm run test` | 363개 파일 통과, 2,330건 통과, 3건 제외 | 테스트됨 |
| `npx tsc --noEmit` | 종료 코드 0 | 테스트됨 |
| `verify-basic-flow-e2e.mjs` | localhost:3456, 11/11 | 관찰됨 |
| `verify-studio-v1-e2e.mjs` | localhost:3456, 14/14 | 관찰됨 |
| 변경 OpenClaw 테스트 4개 | 4개 파일, 6건 통과 | 테스트됨 |
| 고객 카드뉴스 생성 | HTTP 403 확인, 임시 토큰 폐기 HTTP 200 | 관찰됨 |
| 첫 큐 파일 | 0바이트, JSON `SyntaxError` | 관찰됨 |
| API 응답 분류 | 오류 본문 3종 모두 `정상` | 관찰됨 |
| 시안 v63, v68 | 실제 HTML 렌더와 원문 대조 | 관찰됨 |
| 토큰과 문구 추가행 | 색상 리터럴, rgb, 인라인 스타일, 긴 대시 0건. UI 토큰 계약과 긴 대시 계약 테스트 통과 | 테스트됨 |
| 삭제 파일 | 제품 코드 범위 삭제 파일 0건 | 근거 확인 |

## 셀프심문

질문: 내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?

답: Instagram 채널 화면에서 카드뉴스 개요까지 만든 뒤 생성 단추를 누르면 고객 토큰이 403을 받는 문제다. 실제 요청으로 재현됐으므로 PASS를 줄 수 없다. 그다음은 1024 첫 방문에서 승인된 56px 레일이 아니라 224px 사이드바가 본문을 미는 문제다.

SKILLS_USED: review. 최근 변경 범위 고정, 위험 우선 diff 검토, LLM 신뢰 경계, 동시성, 자동검증 자체의 거짓 성공 점검에 사용했다.
SKILLS_SKIPPED: 없음. 코드 수정과 자동 수정은 역할 계약에 따라 실행하지 않았다.
SOURCES: https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/ , https://nodejs.org/api/fs.html , `pipeline-state.osmu.md`, `DESIGN.md`, v63 요구 시안, v68 승인 시안, `wiki/거버넌스/요청.md`, `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`, PRD v8.2.1 비승인 참고본
MODEL: gpt-codex/gpt-5
KNOWLEDGE_QUERY: BRAIN에서 ZERO-ONE Marketing Studio의 고객과 OSMU 루프를 조회하고, 레포에서 승인 핀, 사이드바 확정 요구, 발행 정확성, 돈과 멱등 제약을 좁혀 검색했다. 웹에서는 API 자원 고갈과 Node 실행 권한 확인의 공식 기준을 검색했다.
HITS_USED: BRAIN `idea-zero-one-marketing-studio.md`는 첫 고객과 제작, 발행, 성과 루프 확인에 사용했다. `DESIGN.md`와 요구 대장은 1024 레일과 네 방 상시 이동의 확정 계약이라 사용했다. OWASP API4와 Node.js 공식 문서는 자원 제한과 실행 가능성 판정 근거라 사용했다.
HITS_REJECTED: PRD v8.2.1은 in-review라 승인 계약으로 쓰지 않고 발행 위험 대조에만 사용했다. v63의 편집실 앞으로, 뒤로 단추는 R190에서 삭제가 확정돼 삭제 결함에서 제외했다.
CONFLICTS: 지정 v63과 현재 승인 핀 v68은 지위가 다르다. 공통 계약은 DESIGN.md v37과 양쪽 시안에서 일치하는 네 방, 56px 레일, 결과 보존만 적용했고 방별 시각 차이는 자동 MAJOR로 만들지 않았다.

## 4축 판정

- 승인 시안 이탈: 지적 2건
- 회귀 위험: 지적 15건
- 토큰 위반: 문제없음
- 무기록 삭제: 문제없음

REVIEW_VERDICT: BLOCK
