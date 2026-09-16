<!--
STAMP
line: osmu
created_at: 2026-09-16 12:19 KST
model: gpt-codex/gpt-5
agent: code-reviewer
skills: review
scope: 2026-09-15 17:16:46 KST부터 2026-09-16 11:28:25 KST까지 착륙한 커밋과 f4b0f5a5..e5a4487e 순변경
basis: pipeline-state.osmu.md approved_artifacts, DESIGN.md v37, 지정 v63 프로토타입, 회장 요구 대장, 사업 좌표
benchmarks: Google YouTube resumable upload, Cloudflare R2 object deletion and lifecycle, PostgreSQL uniqueness concurrency
deliberation: 공급자 부작용과 내부 기록, 다중 프로세스 자원 상한, 부분 성공 표기를 각각 분리해 공격했다.
-->

# OSMU 최근 24시간 코드 공격 리뷰 R3

한 줄 결론: MAJOR 10건, MINOR 1건이다. 일부 채널을 빼고 발행한 결과가 전체 성공으로 저장되고, YouTube 중복 업로드와 외부 성공 뒤 내부 기록 유실, 다중 서버 자원 상한 우회가 가능하므로 머지를 막아야 한다.

## 범위와 계약

- 검토 창: 2026-09-15 17:16:46 KST부터 2026-09-16 11:28:25 KST까지다.
- 커밋: 시간 창에 착륙한 67개다. 첫 커밋의 부모 `f4b0f5a5188ef6343e22d9ed4cbebd79b05d0bcc`부터 끝 커밋 `e5a4487e84fe297b5738bb56c522f33f3f171cf9`까지 그래프 범위는 병합 이력 포함 79개다.
- 순변경: 239개 파일, 추가 8,649줄, 삭제 526줄이다. 삭제 파일은 0개다.
- 승인 핀: `pipeline-state.osmu.md:236-240`의 v68 디자인 허브와 `DESIGN.md` v37이다. 이 승인 블록에는 PRD 핀이 없다.
- 지정 시안: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`을 실제로 열어 네 방, 224px과 56px 사이드바, 1024 겹침, 상태와 흐름 계약을 확인했다. v68 승인 파일도 함께 열었다. 순수 시각 편차는 자동 MAJOR로 쓰지 않았다.
- 요청 원장: 지정 파일과 정본 `wiki/거버넌스/요청.md`를 확인했다. 지정된 `wiki/product/사업좌표-OSMU와-ZERO-ONE.md`는 없고 실제 이동 경로 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md:45-59`를 읽었다.
- 구현 현황: `docs/구현현황.md`에서 기존 채널, 발행, 네 방 구현 기록을 확인했다. 새 구조로 재해석하지 않았다.
- 현재 작업 트리: 공유 작업 트리의 대규모 미커밋 문서 이동과 다른 세션 변경은 범위에서 제외했다. 아래 지적은 고정 커밋 범위의 코드에만 귀속했다.

## MAJOR

MAJOR: [회귀 위험] dashboard/src/app/studio/page.tsx:1265 — 한도 초과 채널을 `blockedPlatforms`로 발행 대상에서 빼지만 1411행의 초안 상태와 1419행 이후 최종 결과에는 차단 채널을 실패나 부분 성공으로 포함하지 않아, 남은 채널 한 곳만 성공해도 `published` 저장과 `발행 완료` 토스트가 나온다 / 과제의 확정 공격 항목은 "부분 실패를 전체 성공으로 세는 곳"이고, 같은 화면도 일부 실패를 `partial`로 저장하는 계약을 이미 가진다 / 차단 채널을 명시적 `failed` 또는 `skipped_by_validation` 결과에 넣고 초안 상태를 `partial`로 저장하며 성공과 제외 채널을 함께 보여줘야 한다.

재현: Threads와 X를 함께 선택하고 X 본문만 280 가중 문자를 넘긴다. Threads가 성공하면 X는 호출되지 않았는데 초안은 `published`, 최종 토스트는 `발행 완료`가 된다.

MAJOR: [승인 시안 이탈] dashboard/src/app/studio/page.tsx:1276 — 고객 토스트에 긴 대시 `—`가 들어갔다 / `DESIGN.md:860`은 "em dash와 en dash"를 금지하고 과제도 "긴 대시 금지"를 확정했다 / 마침표로 두 문장으로 나누거나 쉼표로 바꾸고 런타임 문자열까지 검사하는 계약 테스트를 추가해야 한다.

재현: 일부 채널만 글자 한도를 넘긴 뒤 지금 발행을 누르면 `한도를 넘은 곳은 빼고 발행합니다 — ...`가 화면에 노출된다. 전체 Vitest의 기존 긴 대시 테스트는 이 템플릿 문자열을 놓치고 통과했다.

MAJOR: [회귀 위험] dashboard/src/app/api/video/publish/route.ts:206 — YouTube는 외부 resumable upload를 시작하기 전에 발행 예약을 만들지 않고, 성공 뒤 261행에서만 `published_posts`를 넣는다. 같은 `draft_id`의 동시 요청은 둘 다 외부 업로드를 끝낸 뒤 한 INSERT만 unique index를 통과하고, 271행은 두 번째 충돌을 삼킨 채 둘 다 `ok:true`를 반환한다. 유효한 `draft_id`가 없으면 266행의 무작위 UUID가 중복 방지를 완전히 우회한다 / 사업 좌표 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md:59`는 "돈이 걸린 계약"의 멱등이 실제로 지켜져야 한다고 확정하고, Google 공식 resumable upload 계약은 세션 URI를 저장해 중단된 같은 업로드를 조회하고 이어가라고 한다 / 공급자 호출 전에 안정된 draft 또는 idempotency key로 `in_progress` 예약을 원자 생성하고 upload URL과 상태를 저장한 뒤, 재요청은 새 `videos.insert`가 아니라 기존 세션 상태 조회와 재개로 수렴시켜야 한다.

재현: 같은 영상, 계정, `draft_id`로 두 요청을 동시에 보낸다. 둘 다 206행을 지나 별도 YouTube 세션을 만들고 업로드한다. 두 번째 DB INSERT는 충돌하지만 오류가 숨겨져 두 응답 모두 200 성공이고 외부 영상은 두 개가 된다.

MAJOR: [회귀 위험] dashboard/src/app/api/video/publish/route.ts:662 — Reels 외부 발행 뒤 `published_posts` 확정 UPDATE가 실패해도 671행의 빈 catch가 이를 숨기고 681행 사용량 기록 뒤 `ok:true`를 반환한다 / 과제는 "부분 실패를 전체 성공으로 세는 곳"을 공격하라고 했고, 같은 텍스트 발행 경로는 외부 성공 뒤 기록 실패를 재발행 금지 복구 상태로 반환한다 / 외부 성공과 내부 확정 실패를 `partial`과 `retryPublish:false`로 반환하고, 외부 ID를 담은 영속 reconciliation outbox로 내부 행을 수렴시켜야 한다.

재현: Instagram이 Reels ID를 반환한 직후 DB UPDATE만 실패시킨다. 고객은 성공 응답을 받지만 예약 행은 `in_progress`로 남아 다음 요청이 409로 막히고 성과실은 게시물을 찾지 못한다.

MAJOR: [회귀 위험] dashboard/src/lib/usage-events.ts:20 — 발행 사용량 INSERT 실패를 디버그 환경에서만 로그로 남기고 항상 성공으로 끝낸다. `/api/usage`는 `dashboard/src/app/api/usage/route.ts:76-85`에서 `usage_events`만 집계하므로 외부 발행은 성공했지만 발행 수, 쿼터, 향후 과금 장부는 영구히 0으로 남을 수 있다 / 이 변경의 주석 자체가 "실제 발행 2건인데 발행 0"을 고치려는 목적이라고 적었고 과제는 돈이 새는 경로와 부분 실패의 성공 처리를 공격하라고 했다 / 공급자 성공 응답을 재시도하게 만들지 말고, 발행 예약과 같은 멱등 키를 가진 outbox를 같은 DB 트랜잭션에 기록해 usage event가 성공할 때까지 재처리해야 한다.

재현: 외부 Threads 발행과 `published_posts` 저장은 성공시키고 `usage_events` INSERT만 실패시킨다. API는 200 성공을 반환하지만 성과실의 오늘 발행 수는 그대로이며 실패 재처리 단서도 없다.

MAJOR: [회귀 위험] dashboard/src/lib/studio/subtitle-work-limit.ts:9 — `active`, `activeTenants`, `waiting`이 프로세스 메모리라 테넌트당 1개와 전체 2개 제한이 서버 인스턴스마다 따로 생긴다 / 사업 좌표 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md:59`는 "프로세스 메모리에 있으면 서버를 늘릴 때 몫이 배로 늘어 사업 자체가 성립하지 않는다"고 확정한다 / Postgres advisory lock이나 만료되는 영속 permit으로 테넌트와 전체 상한을 공유하고, 다중 인스턴스 경합과 연결 중단 대기자 취소를 검증해야 한다.

재현: 같은 DB와 tenant를 쓰는 dashboard 인스턴스 둘에 자막 요청을 동시에 두 건씩 보낸다. 각 프로세스가 `active=0`에서 시작해 합계 네 ffmpeg 작업을 실행할 수 있다.

MAJOR: [회귀 위험] openclaw/extensions/threads-insights/src/threads-insights-tool.ts:165 — 수집 대상 조회와 187행의 공급자 호출이 큐 잠금 밖에 있고, 잠금은 222행의 결과 병합에만 걸린다. 두 수집기가 같은 스냅샷을 읽으면 같은 글을 두 번 조회하고 `collectCount`를 두 번 올려 한 관측 시점을 두 회로 소진한다 / 과제는 동시성과 돈이 새는 경로를 공격하라고 했고 이 코드는 `collectCount < 3`으로 유료 API 수집 횟수를 제한한다 / 잠금 안에서 글과 예정 수집 시각별 claim을 먼저 만들고, 공급자 호출 뒤 같은 claim만 확정하며 날짜 또는 관측 구간 키로 멱등 병합해야 한다.

재현: engagement가 없는 같은 큐에 `threads_insights collect`를 동시에 두 번 실행한다. 두 실행 모두 같은 post를 target으로 골라 공급자를 두 번 호출하고, 병합 뒤 `collectCount=2`가 되어 하루 한 번의 관측이 두 번으로 계산된다.

MAJOR: [회귀 위험] openclaw/extensions/threads-publish/src/threads-publish-tool.ts:284 — 임시 R2 객체 삭제 실패를 빈 catch로 버린다. 같은 결함이 `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:313`에도 있다 / 과제는 "돈이 새는가"를 공격하라고 했고 Cloudflare 공식 문서는 객체 삭제와 lifecycle 만료를 별도 동작으로 정의한다. 저장소에는 `threads/`와 `instagram/` 임시 prefix의 lifecycle 설정이나 삭제 재시도 장부가 없다 / 삭제 실패를 영속 cleanup queue에 기록해 재시도하고, 두 임시 prefix에 짧은 lifecycle 상한을 구성해 단일 삭제 실패가 무기한 저장으로 이어지지 않게 해야 한다.

재현: 공급자 발행은 성공시키고 `DeleteObjectCommand`만 네트워크 오류로 거절한다. 도구는 성공으로 끝나지만 R2 객체는 남고, 같은 상황이 반복될수록 저장 객체와 비용이 누적된다.

MAJOR: [회귀 위험] dashboard/scripts/lib/api-sweep-contract.mjs:8 — 정상 2xx의 빈 JSON 배열을 모두 `응답 구조 오류`로 분류한다 / `dashboard/src/app/api/images/route.ts:31`과 54행은 이미지가 없는 신규 작업 공간에 정상적으로 `[]`를 반환한다 / 경로별 성공 schema와 `allowEmpty` 계약을 두고 전역 빈 배열 휴리스틱을 없애야 한다.

재현: 지정 작업 공간으로 localhost의 `/api/images`를 호출해 HTTP 200과 `[]`를 직접 관찰했다. 같은 응답을 분류기에 넣자 `응답 구조 오류`가 나왔다.

MAJOR: [승인 시안 이탈] dashboard/src/components/layout/Sidebar.tsx:144 — 접힌 네 방 항목이 방 아이콘 대신 `01`부터 `04` 숫자 원으로 남고, 397행은 펼친 분기에만 `xl:sticky`를 붙여 접힌 56px 레일을 긴 화면에서 스크롤 밖으로 밀어낸다 / `DESIGN.md:663`은 "접히면 방은 아이콘"과 56px을 확정하고, 지정 v63의 `openclaw-auto-4room-v63.html:629-630`은 사이드바를 너비와 무관하게 `position:sticky;top:0`으로, 2318행은 접힘에서 방 번호를 숨기도록 구현한다 / 네 방의 승인 아이콘을 compact 상태에 유지하고 sticky를 접힘과 펼침 공통 셸 속성으로 올리며 1024 overlay만 별도 분기해야 한다.

재현: 1440px에서 사이드바를 접으면 방 항목은 숫자로만 보인다. 긴 Studio 본문을 아래로 스크롤하면 접힌 rail에 `sticky`가 없어 네 방 진입로 전체가 viewport 밖으로 사라진다.

## MINOR

MINOR: [토큰 위반] dashboard/src/app/globals.css:176 — select 오른쪽 여백 `2rem`과 179행의 위치 `0.75rem`을 직접 넣었다 / `DESIGN.md:861`은 임의 간격 리터럴을 금지하고 885행은 기존 화면 간격을 4, 8, 12, 16, 24, 32로 제한한다 / 같은 32px과 12px을 공용 spacing token으로 치환해야 한다.

재현: 최근 추가된 select 규칙을 토큰 감사하면 두 spacing 선언이 `var(...)`가 아닌 리터럴로 남는다.

## 검증 증거

| 검증 | 결과 | 증거 등급 |
|---|---|---|
| localhost health | HTTP 200, DB up. 실행 `build_commit=80166cfe`, 검토 대상 끝 `e5a4487e`로 불일치 | 관찰됨, 귀속 NG |
| `verify-basic-flow-e2e.mjs` | 첫 생성이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 후보 0장으로 종료 | 관찰됨, NG |
| `verify-studio-v1-e2e.mjs` | 401, 400, 422 거절은 통과. 정상 생성은 오류 본문과 HTTP 200을 반환해 기대 201 대비 실패 | 관찰됨, NG |
| 실제 빈 목록 분류 | 지정 작업 공간 `/api/images`가 HTTP 200 `[]`, 분류기는 `응답 구조 오류` | 관찰됨, NG |
| `npm run test` | 369개 파일 통과, 2,373건 통과, 3건 제외 | 테스트됨, PASS |
| `npx tsc --noEmit` | 종료 코드 0 | 테스트됨, PASS |
| OpenClaw 표적 회귀 | queue lock, Threads insights, Threads publish, Instagram publish 4파일 8건 통과 | 테스트됨, PASS |
| 시안과 토큰 | v63 지정 프로토타입, v68 승인 핀, DESIGN v37 실제 파일 대조 | 근거 확인 |
| 삭제 파일 | 순변경에서 삭제 파일 0건. `InstagramPage` 카드 생성 함수 제거는 커밋 `1cd36c29` 제목과 `wiki/거버넌스/요청.md:70`에 생성실 이관 사유가 기록됨 | 근거 확인, 문제없음 |
| 디자인 픽셀 대조 | 코드 계약 리뷰 범위라 렌더 이미지의 시각 편차를 판정하지 않음 | 미검토 |
| 운영 배포와 외부 SNS 실발행 | 실행하지 않음 | 미검증 |

## 셀프심문

질문: 내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?

답: X 한도 초과 때문에 X만 빠졌는데 Threads 하나가 성공한 뒤 전체가 `발행 완료`로 저장되는 문제다. 그 다음은 YouTube를 연속으로 눌렀을 때 외부 영상은 중복인데 두 요청 모두 성공으로 끝나는 문제다. 둘 다 MAJOR로 확인했으므로 PASS를 줄 수 없다.

SKILLS_USED: review. 최근 커밋 범위, 승인 계약, 실제 서버, 회귀 테스트를 분리해 공격 검토하는 데 사용했다.
SKILLS_SKIPPED: 자동 수정은 사용자 금지로 실행하지 않았다. 서브에이전트 검토는 이번 역할이 단일 공격 리뷰와 정확한 파일 줄 귀속을 요구해 사용하지 않았다.
SOURCES: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol , https://developers.cloudflare.com/r2/objects/delete-objects/ , https://developers.cloudflare.com/r2/buckets/object-lifecycles/ , https://www.postgresql.org/files/developer/concurrency.pdf , `pipeline-state.osmu.md`, `DESIGN.md`, v63 지정 프로토타입, v68 승인 프로토타입, `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`, `wiki/거버넌스/요청.md`, `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`, `docs/구현현황.md`
MODEL: gpt-codex/gpt-5
KNOWLEDGE_QUERY: BRAIN business index에서 OSMU, ZERO-ONE, 돈, 멱등, 동시 공장을 조회하고 레포의 승인 핀, 확정 요구, 구현 현황으로 좁혔다. 웹에서는 YouTube resumable upload, R2 삭제와 lifecycle, PostgreSQL 동시 unique insert의 공식 자료를 조회했다.
HITS_USED: 사업 좌표 45-59행은 다중 공장과 돈, 멱등의 직접 계약이라 사용했다. Google 공식 문서는 업로드 세션 보존과 중단 상태 조회 근거로, Cloudflare 공식 문서는 객체 삭제와 lifecycle의 분리 근거로, PostgreSQL 자료는 unique 충돌이 외부 부작용을 되돌리지 못한다는 근거로 사용했다.
HITS_REJECTED: BRAIN의 일반 포트폴리오와 교육 문서는 이번 코드 상태 전이에 직접 적용할 계약이 없어 채택하지 않았다. v63과 v68의 순수 시각 차이는 코드 계약 리뷰 범위 밖이라 지적으로 쓰지 않았다.
CONFLICTS: 과제는 v63 대조를 명시하지만 pipeline 최신 승인 핀은 v68이다. 두 산출물과 DESIGN v37이 함께 확정한 네 방, 56px 접힘, 1024 겹침, 상태 보존만 계약으로 적용했다.

## 4축 판정

- 승인 시안 이탈: 지적 2건
- 회귀 위험: 지적 8건
- 토큰 위반: 지적 1건
- 무기록 삭제: 문제없음

REVIEW_VERDICT: BLOCK

<!--
STAMP
line: osmu
created_at: 2026-09-16 09:12 KST
model: gpt-codex/gpt-5
agent: code-reviewer
skills: review
scope: 착수 시각 2026-09-16 08:21 KST 기준 직전 24시간, c2008b1a..6a51aaf3 순변경과 검증 중 관찰한 현재 작업 트리
basis: pipeline-state.osmu.md approved_artifacts, DESIGN.md v37, v63 지정 프로토타입, v68 승인 핀, 회장 요구 대장, 사업 좌표
benchmarks: Cloudflare R2 presigned URL and lifecycle, Playwright Page API, PostgreSQL explicit locking
deliberation: 성공 응답과 실제 공급자 결과, lease 회수, 다중 프로세스 비용 상한, 깨끗한 HEAD 재현성을 서로 분리해 공격했다.
-->

# OSMU 최근 24시간 코드 공격 리뷰 R2

한 줄 결론: MAJOR 11건, MINOR 1건이다. 외부 발행 0건을 전체 성공으로 닫을 수 있고, 실패와 결과 불명 발행은 영구 정지하며, R2 정리 실패와 프로세스별 자막 상한은 비용을 계속 늘릴 수 있다. 깨끗한 HEAD와 전체 테스트도 실패하므로 머지를 막아야 한다.

## 범위와 계약

- 검토 창: 착수 시각 기준 2026-09-15 08:21:54 KST부터 2026-09-16 08:21:54 KST까지다.
- 순변경: `c2008b1a580576a9b4ddff9822af5f695a0d0104..6a51aaf3a6179616bed04266e258cd35d712feec`, first-parent 31개 커밋, 시간 필터 전체 52개 커밋, 249개 파일, 추가 17,956줄, 삭제 589줄이다.
- 승인 핀: `pipeline-state.osmu.md:236-240`의 v68 디자인 허브와 `DESIGN.md` v37이다. 이 승인 블록에는 PRD 핀이 없다.
- 지정 시안: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`을 실제로 열어 네 방, 접힌 사이드바, 작업물 흐름과 상태 계약을 확인했다. 최신 승인 v68도 열었다. 두 시안의 순수 시각 차이는 MAJOR 근거로 쓰지 않았다.
- 요구 원장: 지정 파일은 15줄짜리 이동 안내다. 정본 `wiki/거버넌스/요청.md`와 실제 위치 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md:45-59`를 대조했다. 요청에 적힌 `wiki/product/사업좌표-OSMU와-ZERO-ONE.md`는 존재하지 않는다.
- 현재 작업 트리: 공유 작업 트리에 다른 세션의 미커밋 변경이 있다. 커밋 범위 결함과 섞지 않았고, 필수 테스트가 직접 잡은 긴 대시 1건만 별도 MAJOR로 표시했다.

## MAJOR

MAJOR: [회귀 위험] openclaw/extensions/threads-queue/src/threads-queue-tool.ts:520 - `skipped` 전이는 공급자 결과를 요구하지 않는데 565-570행은 세 채널이 전부 `skipped`여도 글 전체를 `published`로 바꾼다 / 과제의 확정 공격 항목은 "부분 실패를 전체 성공으로 세는 곳"이고 같은 함수도 `published`와 `failed`에는 공급자 결과를 요구한다 / 허용된 skip 사유와 계획된 채널을 검증하고 실제 성공 채널이 0개면 `published`가 아닌 별도 종결 상태로 닫아야 한다.

재현: 유효한 claim으로 Threads, X, Instagram을 공급자 호출 없이 차례로 `skipped`로 바꾼다. 세 번째 호출에서 `post.status=published`가 되고 claim이 해제된다.

MAJOR: [회귀 위험] openclaw/extensions/threads-queue/src/queue-claim.ts:105 - 채널이 `publishing`이면 lease가 만료돼도 재청구를 영구 차단하지만 공급자 결과를 조회해 수렴시키는 경로가 없다 / 사업 좌표 59행은 "멱등이 실제로 지켜져야 한다"와 "프로세스 메모리에 있으면 사업 자체가 성립하지 않는다"고 확정한다 / provider ID와 idempotency key로 `published`, `failed`, `retry-safe`를 판정하는 reconcile 동작과 만료 lease 회수 계약을 추가해야 한다.

재현: 공급자가 게시물을 만든 뒤 응답 연결만 끊기게 한다. `result_unknown` 기록 후 lease가 끝나도 `claimPost`는 계속 null을 반환한다.

MAJOR: [회귀 위험] openclaw/extensions/threads-publish/src/threads-publish-tool.ts:212 - 공급자 HTTP 실패는 `publishAttempt.state=provider_failed`만 기록하고 채널 상태는 `publishing`으로 남긴다. Instagram과 X도 같은 분리 구조다 / 과제는 부분 실패를 성공 또는 진행 중으로 남기는 곳을 공격하라고 했고 queue claim은 `publishing`을 영구 재청구 금지한다 / 공급자 실패 기록과 채널 `failed` 전이를 하나의 복구 가능한 트랜잭션 또는 outbox로 묶어야 한다.

재현: Threads container API가 HTTP 400을 반환하게 한 뒤 도구 호출 세션을 종료한다. `provider_failed`는 남지만 다음 cron이 글을 다시 가져오지 못한다.

MAJOR: [회귀 위험] openclaw/extensions/threads-publish/src/threads-publish-tool.ts:284 - 임시 R2 객체 삭제 실패를 빈 catch로 버린다. Instagram도 `instagram-publish-tool.ts:313`에서 모든 삭제 실패를 숨긴다 / 과제는 "돈이 새는가"를 공격하라고 했고 Cloudflare 문서는 서명 URL 만료가 접근 권한 만료일 뿐 객체 삭제가 아니며 객체 삭제에는 lifecycle 규칙이 별도로 필요하다고 설명한다 / 삭제 실패를 영속 cleanup queue에 기록해 재시도하고, `threads/`와 `instagram/` 임시 prefix에 짧은 lifecycle 상한을 두어야 한다.

재현: 공급자 발행은 성공시키고 `DeleteObjectCommand`만 네트워크 오류로 거절한다. 도구는 성공으로 끝나지만 객체는 남고 재시도 기록도 없다. 실행할 때마다 저장 객체와 비용이 누적된다.

MAJOR: [회귀 위험] dashboard/src/lib/studio/subtitle-work-limit.ts:9 - `active`, `activeTenants`, `waiting`이 프로세스 메모리라 테넌트당 1개와 전체 2개 제한이 서버 인스턴스마다 따로 생긴다 / 사업 좌표 59행은 서버를 늘렸을 때 몫이 배로 늘어나는 구조를 금지한다 / Postgres advisory lock이나 영속 lease로 테넌트 permit과 전체 permit을 공유하고 다중 인스턴스 경합 테스트를 추가해야 한다.

재현: 같은 DB와 tenant를 쓰는 dashboard 인스턴스 둘에 자막 요청을 동시에 두 건씩 보낸다. 각 프로세스는 `active=0`에서 시작해 합계 네 ffmpeg 작업을 실행할 수 있다.

MAJOR: [승인 시안 이탈] dashboard/src/components/layout/Sidebar.tsx:397 - 1440의 펼친 분기에만 `xl:sticky`가 있고 접힌 분기에는 sticky가 없어 56px 네 방 레일이 본문과 함께 위로 사라진다 / `DESIGN.md:161-165`는 "어디에 있든 한 번에 그 방으로 가는 상시 이동"과 "접히면 아이콘과 현재 항목 강조만 남는다"고 확정한다 / 너비 상태와 무관하게 데스크톱 rail에 sticky와 top을 유지하고 1024 overlay만 별도 규칙으로 좁혀야 한다.

재현: 1440px에서 사이드바를 접고 긴 Studio 본문을 아래로 스크롤한다. 56px 네 방 진입로가 viewport 밖으로 사라진다.

MAJOR: [회귀 위험] dashboard/src/app/studio/page.tsx:1358 - 텍스트 발행 요청을 45초에 끊고 예외를 일반 실패로 표시해 재발행 동선을 연다 / 서버 `dashboard/src/app/api/publish/route.ts:357-363`은 결과 불명을 `PUBLISH_STATE_UNCERTAIN`, `retryPublish:false`로 정의해 중복 발행을 막는다 / AbortError를 `확인 필요`로 분리하고 재발행을 잠근 뒤 draft와 플랫폼 상태를 조회해 실제 결과로 수렴시켜야 한다.

재현: 공급자 응답을 46초 뒤에 반환시킨다. 서버나 공급자는 게시를 끝낼 수 있지만 화면은 실패로 표시하고 사용자가 같은 글을 다시 발행하게 만든다.

MAJOR: [회귀 위험] dashboard/Dockerfile:22 - `BUILD_COMMIT`은 OCI label에만 남고 런타임 `OSMU_BUILD_COMMIT`에는 전달되지 않는다 / `dashboard/src/app/api/health/route.ts:3-5`는 실행 프로세스에 주입된 SHA만 신뢰한다고 선언한다 / final image에 같은 SHA를 런타임 환경으로 보존하거나 compose runtime environment로 명시해야 한다.

재현: 배포 workflow와 같은 build arg로 이미지를 만들고 `/api/health`를 호출한다. image label에는 SHA가 있지만 응답은 `build_commit:"unknown"`이다.

MAJOR: [회귀 위험] dashboard/scripts/lib/api-sweep-contract.mjs:8 - 정상 2xx의 빈 JSON 배열을 전부 `응답 구조 오류`로 분류한다 / `/api/images`는 이미지가 없는 신규 고객에게 정상적으로 `[]`를 반환하므로 검증기가 정상 빈 상태를 장애로 바꾼다 / route별 성공 schema에서 빈 배열 허용 여부를 선언하고 전역 휴리스틱을 없애야 한다.

재현: `status=200`, `content-type=application/json`, `bodyText=[]`를 분류기에 넣으면 `응답 구조 오류`가 나온다.

MAJOR: [회귀 위험] dashboard/scripts/verify-four-room-ui-e2e.mjs:122 - 커밋된 HEAD는 Next.js client navigation에 `waitUntil:"commit"`을 기다리지만 같은 HEAD의 계약 테스트 `dashboard/tests/integrity/four-room-performance-ready-timeout.regression-1.test.ts:21`은 이를 명시적으로 금지한다 / Playwright 공식 문서에서 `commit`은 새 문서의 네트워크 응답과 document load 시작을 뜻하므로 history 기반 client navigation과 맞지 않는다 / 현재 작업 트리의 `waitForFunction(window.location...)` 수정처럼 구현과 테스트를 같은 커밋에 넣어 깨끗한 checkout이 통과하게 해야 한다.

재현: `git archive HEAD`로 두 파일만 꺼내 해당 Vitest를 실행했다. `waitUntil: "commit"` 검출로 1/1 실패했다. 현재 작업 트리에서는 미커밋 수정 때문에 같은 테스트가 통과한다.

MAJOR: [회귀 위험] dashboard/src/app/studio/page.tsx:2210 - 현재 미커밋 고객 UI에 긴 대시가 포함돼 확정 문구 계약 테스트가 실패한다 / 과제의 확정 요구는 "사족 문구, 긴 대시, 이모지, 영문 라벨" 금지이고 `v69copy-ui-copy-contract.test.ts:50-52`도 긴 대시 0건을 요구한다 / 짧은 문장 둘이나 마침표로 바꾸고 문구 계약 테스트와 함께 커밋해야 한다.

재현: 전체 Vitest에서 `src/app/studio/page.tsx:2210` 한 건을 검출해 `V69-COPY-04`가 실패했다.

## MINOR

MINOR: [토큰 위반] dashboard/src/app/globals.css:176 - select 간격에 `2rem`과 179행의 `0.75rem`을 직접 넣었다 / `DESIGN.md:154-156`은 간격을 4, 8, 12, 16, 24, 32, 48의 공용 토큰으로만 쓰라고 확정한다 / 같은 32px와 12px을 기존 spacing token으로 치환해야 한다.

재현: 최근 추가 CSS를 토큰 검사하면 select의 두 spacing 선언만 리터럴로 남는다.

## 검증 증거

| 검증 | 결과 | 증거 등급 |
|---|---|---|
| `npm run test` | 369개 파일 중 7개 실패, 362개 통과. 2,372건 중 8개 실패, 2,361개 통과, 3개 제외. 긴 대시, YouTube 갱신 3회, 발행 UI, 오래된 영상 재사용, 이미지 지시문, 분석 이벤트 계약, 생성실 timeout 실패 | 테스트됨, NG |
| `npx tsc --noEmit` | 종료 코드 0 | 테스트됨, PASS |
| 깨끗한 HEAD 표적 테스트 | `four-room-performance-ready-timeout` 1/1 실패 | 테스트됨, NG |
| `verify-basic-flow-e2e.mjs` | localhost:3456, 지정 작업 공간. 첫 생성 요청이 `STUDIO_LLM_PROVIDER_UNAVAILABLE`, 후보 0장으로 종료 | 관찰됨, NG |
| `verify-studio-v1-e2e.mjs` | 인증 거절 401, 멱등 키 거절 400, 빈 본문 422는 통과. 정상 생성은 오류 envelope와 HTTP 200을 받아 기대 201 대비 실패 | 관찰됨, NG |
| 서버 귀속 | health HTTP 200, DB up, `build_commit=6a51aaf3`, 검토 대상 HEAD와 일치 | 관찰됨, PASS |
| 시안과 토큰 | v63 지정 프로토타입, v68 승인 핀, DESIGN v37 실제 파일 대조 | 근거 확인 |
| 삭제 파일 | 고정 순변경에서 삭제 파일 0건. R190이 승인한 영상 목차 앞뒤 단추 제거는 요구 대장에 사유가 기록됨 | 근거 확인, 문제없음 |
| 문구 스캔 | 고정 커밋 순변경에는 새 긴 대시, 이모지, 영문 단추 라벨 없음. 현재 미커밋 작업 트리 긴 대시 1건은 별도 MAJOR로 기록 | 테스트됨 |

## 셀프심문

질문: 내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?

답: 공급자 발행을 한 번도 하지 않았는데 세 채널이 모두 `skipped`가 되어 작업물 전체가 발행 완료로 보이는 문제다. 이어서 45초가 지난 실제 게시를 실패로 보고 다시 눌러 중복 발행하는 문제다. 둘 다 MAJOR로 확인했으므로 PASS를 줄 수 없다.

SKILLS_USED: review. 고정 커밋 범위, 승인 계약, 깨끗한 HEAD, 실제 서버를 분리해 공격 검토하는 데 사용했다.
SKILLS_SKIPPED: 자동 수정과 서브에이전트 검토는 실행하지 않았다. 사용자가 코드 수정 금지를 명시했고 현재 시스템이 서브에이전트 위임을 허용하지 않았다.
SOURCES: https://developers.cloudflare.com/r2/api/s3/presigned-urls/ , https://developers.cloudflare.com/r2/buckets/object-lifecycles/ , https://playwright.dev/docs/api/class-page , https://www.postgresql.org/docs/17/explicit-locking.html , `pipeline-state.osmu.md`, `DESIGN.md`, v63 지정 프로토타입, v68 승인 프로토타입, `wiki/거버넌스/요청.md`, `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`
MODEL: gpt-codex/gpt-5
KNOWLEDGE_QUERY: BRAIN business index에서 OSMU, ZERO-ONE, 발행, 격리, 부분 실패를 조회하고 레포 승인 핀, 확정 요구, 돈과 멱등 제약으로 좁혔다. 웹에서는 R2 객체 보관, Playwright navigation, PostgreSQL 잠금의 공식 문서를 조회했다.
HITS_USED: 레포 사업 좌표 45-59행은 다중 사업체, 동시 공장, 돈과 멱등의 직접 계약이라 사용했다. Cloudflare 공식 문서는 서명 URL 만료와 객체 lifecycle을 구분하는 근거로, Playwright 공식 문서는 `commit` 의미의 근거로, PostgreSQL 공식 문서는 프로세스 밖 동시성 대안 근거로 사용했다.
HITS_REJECTED: BRAIN의 일반 ZERO-ONE 포트폴리오와 교육 문서는 이번 코드 상태 전이에 직접 적용할 계약이 없어 채택하지 않았다. v63과 v68의 순수 시각 차이는 자동 MAJOR로 쓰지 않았다. 전체 테스트의 나머지 실패는 최근 고정 커밋 범위에 귀속되지 않아 별도 코드 지적으로 부풀리지 않았다.
CONFLICTS: 과제는 v63 대조를 명시하지만 pipeline 최신 승인 핀은 v68이다. 두 산출물과 DESIGN v37이 함께 확정한 네 방 상시 이동, 56px 접힘, 상태 보존만 계약으로 적용했다.

## 4축 판정

- 승인 시안 이탈: 지적 1건
- 회귀 위험: 지적 10건
- 토큰 위반: 지적 1건
- 무기록 삭제: 문제없음

REVIEW_VERDICT: BLOCK
