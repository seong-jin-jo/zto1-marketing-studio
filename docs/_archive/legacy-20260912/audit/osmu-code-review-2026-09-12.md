# OSMU 최근 24시간 코드리뷰, 2026-09-12

## 결론

최근 24시간 커밋 13개, `443da936` 다음부터 `532e37f`까지를 공격적으로 리뷰했다. MAJOR 10건이므로 머지와 QA 승격을 막는다. 가장 위험한 결함은 고객의 발행 중지 요청이 프록시에서 403으로 차단되는 것, 중지가 200으로 끝나도 이미 작업을 가져간 발행기가 외부 게시를 계속할 수 있는 것, 필수 E2E 두 개가 감사 대상 HEAD에서 요청 전에 죽는데 QA 문서는 PASS라고 기록한 것이다.

## 범위와 직접 증거

- 대상: 2026-09-12 05:48 KST부터 19:54 KST까지 커밋 13개, 29파일, 추가 1,280줄, 삭제 66줄.
- 기반 산출물: `pipeline-state.osmu.md`의 `approved_artifacts`, 승인 PRD, 현재 design hub v68, 회장이 지정한 v63 프로토타입, `DESIGN.md`, 요구 대장 정본 `wiki/거버넌스/요청.md`, 사업 좌표를 읽었다.
- 프로토타입: v63 HTML을 실제 Chrome에서 1440px로 렌더해 열었고, 성과 후보의 근거, 표본, 동등한 수락과 거절, 결정 후 되돌리기 계약을 확인했다. 현재 핀 v68은 소스 전체를 열어 확인했다.
- 격리 실측: localhost:3456 health는 HTTP 200, DB up. 지정 작업 공간에 임시 고객 토큰을 발급해 `/api/me` 200, `/api/performance/learned-rules` 200을 확인했다. 같은 토큰의 `/api/queue/probe-do-not-exist/cancel`은 403 `이 API는 운영자 전용입니다`, 운영자 토큰은 같은 요청이 핸들러까지 가서 404였다. 임시 토큰은 HTTP 200으로 폐기했다.
- 커밋 기준 검증: 별도 detached worktree의 `532e37f`에서 `npm run test`는 288파일, 1,963건 통과, 3건 제외, exit 0. `npx tsc --noEmit`은 exit 0.
- 필수 E2E: 같은 detached HEAD에서 `verify-basic-flow-e2e.mjs`와 `verify-studio-v1-e2e.mjs`가 모두 fixture 파싱 `SyntaxError`로 exit 1. 현재 공유 작업트리의 미커밋 수정본은 파싱을 지나 localhost에 실제 요청했지만 서버 실행 환경과 `.env.local`의 Studio 자격이 달라 401로 exit 1. 따라서 두 E2E는 어느 기준에서도 PASS로 적을 수 없다.
- 격리 공격 결과: 신규 라우트 내부의 `effectiveTenantId`와 `runWithTenant`에서는 교차 작업 공간 읽기나 쓰기 경로를 발견하지 못했다. 결함은 격리 우회가 아니라 유효 고객까지 막는 접근 회귀다.

## MAJOR

MAJOR: [회귀 위험] dashboard/src/proxy.ts:82 — 새 `/api/queue/[postId]/cancel`이 고객 허용 목록에 없어 유효한 작업 공간 고객도 403을 받는다 / 화면은 `UnifiedPostCard.tsx:104`에서 “아직 올라가지 않은 채널은 발행을 멈춥니다”라고 약속하지만 `proxy.ts:334`와 `proxy.ts:353`이 핸들러 전에 운영자 전용으로 차단한다 / 동적 queue 라우트를 포함하는 허용 목록 계약 테스트를 만들고 cancel 경로를 테넌트 허용 목록에 등록한다 / 재현: 지정 작업 공간의 유효 임시 고객 토큰으로 존재하지 않는 post ID를 POST했을 때 404가 아니라 403을 직접 관찰했다. 예약 글 ID로 호출하면 글은 계속 발행 가능 상태로 남는다.

MAJOR: [회귀 위험] extensions/threads-queue/src/threads-queue-tool.ts:345 — 발행기가 `get_approved`로 가져간 스냅샷에는 claim, lease, 공급자 호출 직전 재검증이 없어 cancel API가 200을 반환한 뒤에도 외부 게시가 진행될 수 있다 / cancel route 주석 `dashboard/src/app/api/queue/[postId]/cancel/route.ts:16`의 “아직 pending 인 채널만 canceled”와 확인창 `UnifiedPostCard.tsx:104`의 “발행을 멈춥니다”에 어긋난다 / 공급자 호출 직전에 공유 상태를 같은 잠금 아래 재확인하거나 claimed 상태와 취소 토큰을 도입한다 / 재현: worker A가 `get_approved` 응답을 받은 직후 고객 B가 cancel 200을 받고, A가 보관한 본문으로 공급자 게시 후 `update_channel`을 호출하면 게시가 실제로 발생한다.

MAJOR: [회귀 위험] dashboard/src/app/api/queue/[postId]/cancel/route.ts:58 — JSON 취소 뒤 `mirrorQueuePost`의 false를 무시하고 `{ok:true}`를 반환해 부분 실패를 전체 성공으로 센다 / `queue-store.ts:33`은 UUID 불일치, DB 오류, 작업 공간 불일치에서 예외가 아니라 false를 반환하지만 UI `UnifiedPostCard.tsx:106`은 이를 성공 토스트로 바꾼다 / 파일과 DB 결과를 분리해 응답하고 재시도 가능한 outbox 또는 상태 버전으로 두 저장소를 수렴시킨다 / 재현: 비 UUID queue ID 또는 DB 쓰기 실패 상태에서 취소하면 파일은 canceled, DB는 approved로 남는데 API 200과 “발행 중지됨”이 표시된다.

MAJOR: [회귀 위험] dashboard/src/app/api/queue/[postId]/cancel/route.ts:41 — 일부 채널이 이미 published여도 최상위 상태를 canceled로 덮어 실제 발행물을 성과 표본에서 숨긴다 / “이미 올라간 채널은 그대로 유지됩니다”라는 `UnifiedPostCard.tsx:104` 문구와 달리 `low-engagement-candidates/route.ts:67` 및 `PerformanceChatPanel.tsx:109`는 최상위 published만 읽는다 / 부분 발행 후 취소를 표현하는 상태 계약을 만들거나 성과 소비자를 채널별 published 기준으로 바꾼다 / 재현: Threads published, X pending인 글을 취소하면 Threads 채널 정보는 남지만 post.status가 canceled가 되어 성과실과 저성과 후보에서 빠진다.

MAJOR: [회귀 위험] dashboard/src/app/api/queue/[postId]/cancel/route.ts:34 — channels가 없는 레거시 published 또는 failed 글은 종료 상태 검사 없이 canceled로 바뀐다 / 같은 파일 `:35`의 “이미 전부 끝났거나 실패했다. 조용히 덮어쓰지 않는다”는 주석과 실제 조건 `channelKeys.length > 0`이 충돌한다 / 취소 가능 최상위 상태를 approved 또는 명시적 scheduled로 제한하고 채널 없는 레거시 항목은 정규화 후 판정한다 / 재현: `{status:"published"}`이고 `channels`가 없는 글에 POST하면 cancellable 0인데도 409가 아니라 post.status와 canceledAt이 덮인다.

MAJOR: [회귀 위험] dashboard/scripts/verify-basic-flow-e2e.mjs:22 — 감사 대상 HEAD의 필수 E2E 두 개가 fixture의 첫 번째 `return {`를 잘못 추출해 네트워크 요청 전 `candidate.title` SyntaxError로 죽는데 QA 문서는 PASS로 확정했다 / `verify-studio-v1-e2e.mjs:12`도 같은 정규식이고 `docs/qa/qa-tracker.md:19`는 “전체 회귀 295파일 1,990건”, `:20`은 “기본 흐름 11/11, Studio 14/14”라고 적지만 detached HEAD 실측은 288파일 1,963건과 E2E 두 건 exit 1이다 / fixture 객체를 정규식과 eval로 파싱하지 말고 실행 가능한 fixture 모듈 또는 JSON fixture를 공유하고, 커밋된 HEAD에서 증거 수치를 다시 생성한다 / 재현: `532e37f` detached worktree에서 요구된 두 node 명령을 실행하면 둘 다 API 호출 전에 같은 SyntaxError로 종료된다.

MAJOR: [회귀 위험] dashboard/src/components/home/PerformanceChatPanel.tsx:200 — 같은 성과 후보를 두 탭에서 만들면 무작위 candidateId가 달라 서버 중복 및 반대 판단 방지가 우회된다 / API `learned-rules/route.ts:94`는 candidateId만 비교하고, 새 경합 테스트 `learned-rule-decisions.integration.test.ts:101`은 실제 UI와 달리 두 요청에 같은 고정 ID를 넣는다 / 서버가 text, 정렬한 sourcePostIds, 관찰 기간으로 정규 후보 지문을 계산하고 그 값에 유일성을 건다 / 재현: 같은 작업 공간을 두 탭에서 열어 동일 후보를 만든 뒤 한 탭은 수락, 다른 탭은 거절하면 ID가 달라 둘 다 201이 되고 활성 규칙과 반대 거절 이력이 동시에 남는다.

MAJOR: [승인 시안 이탈] dashboard/src/components/home/PerformanceChatPanel.tsx:281 — 고객이 결정하기 전에는 후보 문장과 조회 상위 수치만 보이고 표본 수, 관찰 기간, 적용 범위, 근거 부족 표시가 없다 / v63 `openclaw-auto-4room-v63.html:14563`의 “근거로 몇 번 중 몇 번인지와 며칠을 봤는지를 같이 적습니다”, `:14566`의 “규칙 문장과 표본 수와 관찰 기간과 실리는 범위가 한 줄” 계약에 어긋난다 / 두 결정 버튼 바로 위 후보 행에 표본, 기간, 적용 범위, 한계를 함께 표시한다 / 재현: “이거 왜 잘 됐어”로 후보를 만든 뒤 버튼을 누르기 전 화면에서 표본 N건, 관찰 기간, 다음 생성 적용 범위를 확인할 수 없다.

MAJOR: [승인 시안 이탈] dashboard/src/app/api/performance/learned-rules/route.ts:146 — 결정을 되돌릴 API가 없고 DELETE는 활성 규칙만 끈 채 decisions를 그대로 보존하며 화면에도 되돌리기 단추가 없다 / v63 `openclaw-auto-4room-v63.html:14036`의 “정하시면 그 줄만 상태가 바뀌고 되돌리기가 남습니다”에 어긋난다 / 판단 이력과 활성 규칙을 원자적으로 되돌리는 계약, 권한, UI 상태를 추가한다 / 재현: 수락 또는 거절 뒤 최근 학습 판단에서 되돌리기를 찾을 수 없고, DELETE를 호출해도 `route.ts:154`가 decisions를 그대로 돌려 같은 candidateId의 반대 판단은 계속 409가 된다.

MAJOR: [승인 시안 이탈] dashboard/src/components/home/PerformanceChatPanel.tsx:331 — 최근 판단 상세 최대 5건을 성과실 담당 패널에 상주시켜 학습 정보 소유권을 뒤집었다 / `DESIGN.md:159`의 “선택 학습의 상세는 작업 화면과 분리된 별도 창이 소유한다”와 `:160`의 “선택 학습의 상세를 본문에 상주시키지 않는다”에 어긋난다 / 성과실에는 완료 피드백과 학습 정보 진입만 남기고 상세 이력은 별도 학습 정보 화면으로 옮긴다 / 재현: 판단 이력이 하나 이상인 작업 공간에서 성과실을 열면 규칙 문장, 표본, 기간, 범위가 패널 하단에 항상 보인다.

## MINOR

MINOR: [회귀 위험] dashboard/src/components/home/PerformanceChatPanel.tsx:216 — 판단 저장의 409, 500, 네트워크 실패를 catch하지 않아 오류 상태와 안내가 없고 `void decideRule` 호출에서 처리되지 않은 Promise rejection이 생길 수 있다 / v63이 요구하는 수락과 거절의 동등한 완료 상태, 실패 상태 존재 계약에 어긋난다 / 오류를 잡아 후보를 유지하고 실패 이유와 재시도를 표시하는 컴포넌트 테스트를 추가한다 / 재현: 같은 후보의 반대 판단이 먼저 저장돼 API가 409를 내면 버튼만 다시 활성화되고 성공도 실패도 말하지 않는다.

MINOR: [회귀 위험] dashboard/src/app/api/performance/learned-rules/route.ts:91 — 판단 이력과 입력 문자열에 보관 상한과 길이 제한이 없고 매 POST와 GET이 동기 파일 전체를 읽고 복사하고 다시 쓴다 / 다중 작업 공간 서비스의 가용성 계약과 Node 파일 시스템의 동시 수정 주의사항에 어긋난다 / 입력 크기, tenant별 보관 기간과 최대 건수, 페이지네이션 또는 DB unique index를 둔다 / 재현: 한 작업 공간에서 큰 text와 sourceLabel을 포함한 판단을 수천 번 저장하면 `file-io.ts:20`과 `:83`이 커진 파일 전체를 동기 처리해 이벤트 루프와 공유 디스크를 압박한다.

## 셀프심문

“내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?” 고객이 예약 글에서 `발행 중지`를 눌러도 403이 나거나, 이미 worker가 가져간 글이 성공 안내 뒤 실제 채널에 올라가는 문제다. 둘 다 직접 요청과 실행 경로 대조로 확인했으므로 MAJOR로 유지한다.

## 벤치마크와 판단 기준

- Next.js Authentication 가이드: Route Handler와 데이터 접근 경계에서 권한을 확인하는 원칙을 프록시 허용 목록과 핸들러 대조에 사용했다. https://nextjs.org/docs/app/guides/authentication
- Next.js Data Security 가이드: 권한 검사를 데이터 계층 가까이에 두고 중앙화하는 기준을 tenant 격리 판정에 사용했다. https://nextjs.org/docs/app/guides/data-security
- Node.js File system 문서: Promise 기반 파일 작업조차 동기화되지 않으며 동시 수정에 주의해야 한다는 기준을 queue dual writer와 판단 이력 파일에 적용했다. https://nodejs.org/api/fs.html
- OWASP API Security BOLA: 객체 ID만 보지 않고 인증 주체와 작업 공간 경계가 실제로 묶이는지 확인했다. 신규 cancel 핸들러 안의 직접 IDOR은 발견하지 못했다. https://owasp.org/API-Security/editions/2019/en/dist/owasp-api-security-top-10.pdf

STAMP: line=osmu | created_at=2026-09-12 KST | model=gpt-6-astra | agent=code-reviewer | skill=review | decision=코드 수정 없이 최근 24시간 커밋과 detached HEAD 실행 결과만 판정

SKILLS_USED: review. 다중 관점으로 API 계약, 보안, 테스트, 성능, 유지보수, 디자인 계약, 레드팀을 분리 검토하고 루트에서 실측 재검증했다.

SKILLS_SKIPPED: 자동 수정 절차는 역할 계약상 금지되어 실행하지 않았다.

SOURCES: `pipeline-state.osmu.md`; 승인 PRD; `DESIGN.md`; v63·v68 프로토타입; `wiki/거버넌스/요청.md`; `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`; 최근 24시간 commit diff; localhost:3456 응답; detached HEAD 테스트 로그; 위 공식 웹 문서.

MODEL: gpt-6-astra / code-reviewer

KNOWLEDGE_QUERY: OSMU 코드리뷰의 승인 산출물, R168 학습 흐름, 테넌트 Route Handler 권한, 파일 기반 동시성, API 객체 권한 기준을 조회했다.

HITS_USED: v63의 근거·표본·기간·범위·되돌리기 계약, DESIGN.md의 상세 분리 계약, 요구 대장의 R168, Next.js·Node.js·OWASP 공식 문서를 채택했다.

HITS_REJECTED: v68 성과실은 파일 안에서 정보구조 확정 전 후보라고 명시되어 있어, 회장이 이번 리뷰에 직접 핀한 v63보다 우선하는 상세 계약으로 쓰지 않았다. 기존 03:20 리뷰는 당시 24시간 커밋과 실행 증거가 없어 현재 실측으로 대체했다.

CONFLICTS: pipeline-state의 현재 design hub는 v68이지만 이번 과제는 v63을 확정 프로토타입으로 직접 지정했다. 상세 학습 계약은 사용자 지시가 더 구체적이므로 v63을 우선했다.

- 승인 시안 이탈: 지적 3건.
- 회귀 위험: 지적 9건.
- 토큰 위반: 문제없음. 최근 UI 추가분에서 새 인라인 style, 디자인 색상 리터럴, 긴 대시, 이모지, 영문 단추 라벨을 발견하지 못했다. `text-card-image-theme.ts`의 hex는 기존 생성 이미지 팔레트를 이동한 것으로 제품 UI 토큰 신규 위반이 아니다.
- 무기록 삭제: 문제없음. 삭제 파일 0개이며, 제거된 `넘어가기`는 거절 이력 저장 흐름으로 대체됐고 카드 테마 상수 삭제분은 새 모듈로 같은 값을 이동했다.

REVIEW_VERDICT: BLOCK(MAJOR 있음)
