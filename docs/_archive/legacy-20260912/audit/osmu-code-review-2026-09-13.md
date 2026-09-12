# OSMU 최근 24시간 코드 리뷰

STAMP | line: osmu | 생성: 2026-09-13 08:29 KST | model: gpt-codex/gpt-5 | agent: code-reviewer | skill: review | 근거: 승인 프로토타입 v63, DESIGN.md, 회장 확정 요구 대장, 사업 좌표, 고정 커밋 diff, localhost 실측, AWS·PostgreSQL·OWASP 공식 문서 | 고민: 초록 테스트가 실제 런타임과 실패 계약을 검증하는지 역방향으로 확인했다.

한 줄 결론: 최근 24시간 47개 커밋에는 운영 복제본 누락, 발행 취소 경합, 고객 예약 취소 차단, 성과 오분류, 자산 전달 단절, 돈 검증기 단절, 승인 시안 이탈을 포함한 MAJOR 22건이 있어 머지를 차단한다.

## 리뷰 범위와 증거

- 고정 범위: `8652fb5b29fecad7aa688b99ad1c2bab534d2fc4..39d32c58510565df52f330d01c0ac0d96cb0256d`
- 범위 규모: 커밋 47개, 파일 185개, 추가 16,135줄, 삭제 311줄
- 승인 기준: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`, `DESIGN.md`, `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`, `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`
- localhost 관찰: 지정 작업 공간으로 health 200, metrics 200, learned-rules 200, queue 200을 확인했다. 이는 후속 미커밋 수정이 섞인 현재 공유 작업 트리의 관찰이며, 고정 커밋의 결함 해소 증거로 쓰지 않았다.
- 자동 검증: `npm run test` 311파일, 2,077건 통과, 3건 스킵. `npx tsc --noEmit` 통과. `verify-basic-flow-e2e.mjs` 11/11 통과. `verify-studio-v1-e2e.mjs` 14/14 통과. 모두 현재 공유 작업 트리 기준이다.
- 직접 재현: 고정 커밋의 옛 정규식으로 fixture를 읽으면 `legacyFixtureMatch=false`. Higgsfield 페이지 객체 `{"cursor":"5","items":[{"credits":3}]}`를 운영 route 로직에 넣으면 `SyntaxError`가 났다.

## MAJOR

1. [회귀 위험] `extensions/threads-queue/src/threads-queue-tool.ts:155` — claim과 `verify_claim`을 루트 복제본에만 넣었지만 실제 Compose는 `docker-compose.postagi-4tenants.yml:28`의 `./openclaw`을 빌드하고, `openclaw/extensions/threads-queue/src/threads-queue-tool.ts:77`은 여전히 여섯 동작만 가진 구버전이다 / `queue-claim.ts:8-14`의 "같은 글을 두 워커가 동시에 가져갈 수 없다", "공급자 호출 직전 반드시 재검증" 계약과 어긋난다 / 큐 확장의 진실원을 하나로 합치고 Compose가 빌드하는 소스를 직접 검사하는 이미지 계약 테스트를 둬라. 재현: 현 Compose 이미지에서 `get_approved`를 두 번 호출하면 claimToken과 `verify_claim` 없이 같은 승인 글 스냅샷을 다시 받을 수 있다.

2. [회귀 위험] `extensions/threads-queue/src/threads-queue-tool.ts:245` — 큐를 잠금 없이 읽고 413행에서 전체 파일을 다시 써서 dashboard 취소 API의 fresh-read 잠금을 무력화한다 / `queue-claim.ts:9-12`의 단일 claim과 최신 상태 재검증 계약과 어긋난다 / 모든 큐 writer가 같은 잠금 안에서 fresh-read mutation을 하게 만들거나 DB의 조건부 갱신으로 claim을 원자화하라. 재현: A가 approved 파일을 읽은 뒤 B가 취소 200을 받고, A가 옛 queue를 저장하면 canceled와 `claim=null`이 approved와 활성 claim으로 되살아난다.

3. [회귀 위험] `extensions/threads-queue/src/queue-claim.ts:130` — 토큰이 있을 때만 소유권을 확인한다. 도구는 `threads-queue-tool.ts:219`에서 claimToken을 optional로 선언하고, `verify_claim`과 `update_channel`은 누락을 null로 넘기며, `release_claim`은 토큰을 아예 검사하지 않는다 / 같은 파일 222행의 "Required for verify_claim/release_claim"와 어긋난다 / 세 동작 모두 claimToken을 필수로 받고 누락, 불일치, 만료를 fail-closed 처리하며 release와 update를 토큰 기반 원자 갱신으로 묶어라. 재현: 워커 A가 claim한 글에 워커 B가 토큰 없이 verify, published update, release를 호출해도 통과한다.

4. [회귀 위험] `extensions/threads-queue/src/threads-queue-tool.ts:418` — 응답에 `mustVerifyBeforePublish: true`만 적었고 외부 발행 동작에 검증을 결합하지 않았다. `extensions/threads-publish/src/threads-publish-tool.ts:107`, `extensions/x-publish/src/x-publish-tool.ts:133`, `extensions/instagram-publish/src/instagram-publish-tool.ts:105`는 claimToken 없이 곧바로 공급자 `fetch`를 실행한다 / `queue-claim.ts:11-12`의 "공급자 호출 직전에 반드시" 계약과 어긋난다 / 게시 도구가 queue id와 claimToken을 필수로 받아 같은 실행에서 최신 상태를 확인한 직후에만 공급자를 호출하게 하라. 재현: get_approved 뒤 취소 200을 받은 다음 verify를 생략하고 publish 도구를 직접 부르면 대외 게시가 일어나며 사후 update만 막힌다.

5. [회귀 위험] `dashboard/src/app/api/metrics/route.ts:328` — 수집 대상 일부가 실패해도 하나만 갱신되면 `{ok:true}` 전체 성공으로 반환한다. UI는 `dashboard/src/app/page.tsx:75-76`에서 `collectionBlocked`가 아니면 성공 토스트만 낸다 / 부분 실패를 전체 성공으로 세지 말라는 요청과 어긋난다 / `updated < total`을 부분 실패로 분류하고 failed 수와 채널별 사유를 반환해 성공과 경고를 함께 표시하라. 재현: 대상 두 건 중 한 공급자만 성공시키면 응답은 `updated:1,total:2,ok:true`이고 화면은 한 건 성공만 말한다.

6. [회귀 위험] `dashboard/src/app/api/metrics/route.ts:77` — DB 트랜잭션 안에서 여러 공급자 API를 직렬 호출하고 행별 갱신까지 한다. 풀은 `dashboard/src/lib/db.ts:21`에서 5개뿐이라 느린 수집 다섯 건이 다른 작업 공간의 DB 요청까지 굶길 수 있다 / 사업 좌표의 "여덟 컨셉이 동시에 돈다"와 멀티 작업 공간 격리 요구에 어긋난다 / 짧은 트랜잭션에서 대상을 claim한 뒤 외부 호출은 밖에서 제한된 동시성으로 수행하고, 결과만 별도 짧은 트랜잭션에서 일괄 반영하라. 재현: 공급자 응답을 제한시간 직전까지 늦추고 metrics POST 여섯 건을 병렬 호출하면 다섯 연결이 외부 I/O 동안 점유된다.

7. [회귀 위험] `dashboard/src/lib/queue-mirror-outbox.ts:107` — DB 미러 실패를 쌓는 drain 함수는 정의와 테스트의 수동 호출만 있고 실제 API, cron, worker 호출이 없다 / 15행의 "나중에 같은 항목을 다시 밀어 두 저장소를 맞춘다" 계약과 AWS transactional outbox의 정기 relay 요구에 어긋난다 / 운영 worker나 scheduler에 drain을 배선하고 재시도 횟수, 적체, 최종 실패를 관측 가능하게 하라. 재현: DB를 끊고 취소해 `deferred`를 만든 뒤 DB를 복구해도 어떤 운영 경로도 drain을 부르지 않아 DB는 옛 상태로 남는다.

8. [회귀 위험] `dashboard/src/lib/queue-mirror-outbox.ts:41` — 쓰기마다 `.slice(-MAX_ENTRIES)`로 오래된 미수렴 항목을 조용히 버린다 / 106행의 "성공한 항목만 outbox에서 빠진다" 계약과 어긋난다 / 미수렴 항목은 자동 폐기하지 말고 상한에서 쓰기를 거절하고 경보를 내거나 내구성 큐로 옮겨라. 재현: DB 장애 중 서로 다른 글 501건을 기록하면 첫 번째 실패가 수렴 없이 사라진다.

9. [회귀 위험] `dashboard/src/components/queue/UnifiedPostCard.tsx:107` — 취소 응답의 `persistence.db`, `partiallyPublished`, `alreadyPublishedChannels`를 버리고 108행에서 무조건 "발행 중지됨" 성공을 표시한다 / API `dashboard/src/app/api/queue/[postId]/cancel/route.ts:101-113`의 "DB가 밀린 사실"과 "이미 대외에 올라간 채널을 화면이 말해야 한다"는 계약과 어긋난다 / 응답을 타입으로 받고 deferred면 동기화 대기 경고를, 부분 발행이면 이미 올라간 채널과 다음 행동을 표시하라. 재현: DB 미러를 실패시키거나 한 채널을 published로 둔 뒤 취소하면 UI는 완전 중지와 같은 성공 문구만 낸다.

10. [회귀 위험] `dashboard/src/components/studio/DeliveredMedia.tsx:119` — 재서명 응답이 현재 `src`와 같은 요청인지 검사하지 않는다. 102행 cleanup은 언마운트만 막아 주소나 작업 공간이 바뀐 뒤 A의 늦은 응답이 B를 덮을 수 있다 / 작업 공간별 자산 격리와 "주소 교체 뒤 늦은 응답이 화면을 되돌리지 않게 한다"는 100행 자체 계약에 어긋난다 / effect별 취소 플래그 또는 request id를 두고 응답 적용 전 현재 attemptKey와 일치하는지 확인하라. 재현: 만료 URL A의 응답을 늦추고 B로 rerender한 뒤 B, A 순서로 완료하면 화면이 A의 URL로 되돌아간다.

11. [회귀 위험] `dashboard/tests/studio/generation-fixture.ts:24` — fixture를 JSON import로 바꿨지만 `dashboard/scripts/verify-free-quota-timezone-attack.mjs:18`, `dashboard/scripts/verify-free-regeneration-rejection-gate.mjs:50`, `dashboard/scripts/verify-derivation-osmu.mjs:50`은 여전히 옛 객체 리터럴을 정규식으로 잘라 eval한다 / 사업 좌표의 "무료에서 유료로 넘어가는 경계, 몫, 멱등이 실제로 지켜져야 한다"와 어긋난다 / 세 검증기도 같은 JSON fixture를 직접 import하고 CI에서 요청 전 단계까지 실행하라. 재현: 고정 커밋 소스로 옛 정규식을 실행하면 `legacyFixtureMatch=false`이며 이어지는 `m[1]` 또는 `literal[1]`에서 요청 전에 죽는다.

12. [회귀 위험] `dashboard/src/app/api/higgsfield/transactions/route.ts:8` — 페이지 객체도 읽는 새 `parseTransactionItems`를 만들었지만 운영 route는 여전히 첫 `[`부터 JSON.parse하고 실패를 25행에서 HTTP 200 `ok:false`로 감춘다 / 실제 크레딧 사용을 추적해야 하는 돈 계약과 어긋난다 / route에서 공용 파서를 사용하고 파싱 실패는 비 2xx로 반환하며 route 수준 테스트를 추가하라. 재현: 운영 로직에 `{"cursor":"5","items":[{"credits":3}]}`를 넣으면 `SyntaxError`가 나고 API 계약상 HTTP 200 실패가 된다.

13. [회귀 위험] `dashboard/src/components/home/PerformanceDashboard.tsx:20` — 실제 `/performance`는 `dashboard/src/app/performance/page.tsx:3`에서 계속 `@/app/page` 구현을 쓰는데 거의 같은 복제본을 만들고 계약 테스트를 새 복제본으로 옮겼다 / 테스트는 회장이 여는 실제 경로를 검증해야 한다는 완료 계약과 어긋난다 / 구현을 공용 컴포넌트 하나로 합치고 두 route가 그것만 import하며 테스트가 route 연결까지 검증하게 하라. 재현: 고정 커밋의 `src/app/page.tsx`에 금지 API나 두 번째 PerformanceRoom을 넣어도 `r02-acceptance-contract`, `v24-home-density`, `customer-ui-api-boundary`는 복제본만 읽어 통과한다.

14. [회귀 위험] `dashboard/src/app/api/performance/learned-rules/route.ts:133` — 같은 범위의 앞선 구현은 되돌릴 때 규칙만 inactive로 만들고 판단 이력은 남겼다. 최종 POST는 그런 기존 accepted 판단을 찾으면 연결 규칙의 `active`를 확인하지 않고 `reused:true` 성공으로 돌려준다 / UI `dashboard/src/components/home/PerformanceChatPanel.tsx:252`의 "다음 생성부터 참고합니다"와 실제 활성 규칙이 어긋난다 / 남은 accepted 판단이 inactive 또는 missing 규칙을 가리키면 복구하거나 명시적 stale 충돌로 처리하고 중간 버전 데이터 migration을 둬라. 재현: included commit `4df0e276` 형식대로 active=false 규칙과 accepted decision을 저장한 뒤 같은 후보를 POST하면 200 reused지만 생성이 읽을 활성 규칙은 없다.

15. [회귀 위험] `dashboard/src/proxy.ts:99` — 새 고객 경로 `/api/schedule/[id]`와 `/api/schedule/[id]/cancel`을 만들었지만 exact allowlist에는 `/api/schedule`과 `/api/schedule/publish-due`만 있다 / route `dashboard/src/app/api/schedule/[id]/route.ts:16-30`은 tenant 인증과 조건부 갱신을 갖춘 고객용 취소 계약인데 proxy가 handler 전에 막으므로 확정된 예약 취소 기능과 어긋난다 / 두 동적 경로를 tenant-aware allowlist에 넣고 실제 proxy를 통과하는 고객 bearer 계약 테스트를 추가하라. 재현: 유효한 고객 토큰으로 두 경로를 호출하면 route의 400, 404, 409가 아니라 proxy 403을 받는다.

16. [회귀 위험] `dashboard/src/lib/publish.ts:582` — X는 100건, YouTube와 Meta는 각각 50건에서 입력을 자르지만 caller는 전체 DB 행을 돌며 요청하지 않은 나머지를 `dashboard/src/app/api/metrics/route.ts:162`, 216, 250에서 계정 불일치, 권한 거절, 영상 없음으로 영구 표시한다 / 미조회와 실제 공급자 누락을 구분해야 하는 성과 진실 계약과 어긋난다 / 전체 ID를 공급자 한도별 chunk로 순회하고 helper가 attemptedIds를 돌려 실제 요청한 ID만 누락 판정하라. 재현: 같은 작업 공간에 X 101건 또는 Meta와 YouTube 51건을 만들면 마지막 행은 공급자에게 묻지도 않고 실패 표식을 받는다.

17. [회귀 위험] `dashboard/src/lib/publish.ts:716` — Facebook `post_reactions_by_type_total`의 객체 값을 number로 단언해 721행에서 likes에 그대로 넣고, `dashboard/src/app/api/metrics/route.ts:227`은 숫자 DB 필드에 바인딩한다 / helper의 `likes:number` 반환 계약과 "지표 이름을 채널별로 올바르게 매핑한다"는 687-688행 설명에 어긋난다 / Graph 응답을 런타임 검증하고 반응 유형 값을 합산한 숫자로 정규화하며 parse failure를 분리하라. 재현: `value:{like:2,love:1}` 응답이면 likes가 객체가 되어 숫자 갱신이 실패한다.

18. [회귀 위험] `dashboard/src/components/studio/StudioRooms.tsx:715` — 무료 글자 카드는 컴포넌트 로컬 data URL 배열에만 저장되어 편집, 초안, 미디어, 발행 흐름으로 전달되거나 영속화되지 않는다 / 986행의 "올릴 규격 그대로"라는 화면 약속과 생성에서 발행까지 이어지는 네 방 계약에 어긋난다 / data URL을 작업 공간 미디어 저장소의 자산으로 영속화하고 상위 draft와 편집 및 발행 handoff에 연결하라. 재현: 글자 카드로 만들기를 눌러 미리보기를 본 뒤 새로고침하거나 편집실과 발행실로 이동하면 결과가 사라진다.

19. [회귀 위험] `dashboard/src/components/studio/DeliveredMedia.tsx:20` — 복구기는 `/api/media/` 토큰만 파싱하지만 큐 이미지는 `dashboard/src/app/api/images/route.ts:46`의 `/api/images/deliver/` 전용 토큰을 쓰며 서명 목적도 다르다 / `dashboard/src/lib/image-token.ts:7-9`의 30일 뒤에도 예약 발행과 복구가 가능해야 한다는 계약과 어긋난다 / 목적별 검증 파서와 재발급 경로를 만들고 HMAC과 tenant를 확인한 뒤만 새 토큰을 내라. 재현: 30일 지난 image-purpose URL을 DeliveredMedia에 넣으면 만료 선감지가 false이고 로드 실패 뒤에도 filename을 못 얻어 재서명하지 못한다.

20. [승인 시안 이탈] `dashboard/src/components/home/LearningDecisionsDialog.tsx:78` — `fixed inset-0`과 `aria-modal=true`로 성과실 전체를 덮는 모달을 신설했다 / `DESIGN.md:642-644`의 "화면을 덮는 층은 만들지 않는다", "예외는 390 대화 시트에만"과 프로토타입 `v63:8100-8104,14561-14566`의 `/learn` 별도 화면 계약에 어긋난다 / 학습 정보 화면으로 이동시키거나 GNB 아래 비중첩 패널로 펼쳐라. 재현: 성과실에서 학습 판단 후 학습 정보 보기를 누르면 전체 화면 스크림이 뜬다.

21. [승인 시안 이탈] `dashboard/src/components/home/LearningDecisionsDialog.tsx:109` — 확정 이력에 `sourceLabel`과 저표본 표시를 렌더하지 않아 판단 이유와 신뢰 한계가 사라진다 / 프로토타입 `v63:8112-8115`의 `why`, `base`, "근거가 아직 얇습니다"와 `DESIGN.md:658`의 "후보마다 근거, 표본 수, 얇으면 얇다는 표시" 계약에 어긋난다 / 승낙과 거절 이력 모두에 저장된 근거, 표본, 기간, 범위, 저표본 표시를 남겨라. 재현: 표본 10건 미만 후보를 판단하고 이력을 열면 구체 근거와 얇음 표시가 없다.

22. [승인 시안 이탈] `dashboard/src/components/home/PerformanceChatPanel.tsx:316` — 승인된 선택 문구 `그렇게 해`, `아니`를 `배우기`, `배우지 않기`로 임의 변경했다 / 프로토타입 `v63:8115-8116`의 버튼 원문과 확정 요구 대장의 사족 문구 금지 계약에 어긋난다 / 승인 원문으로 복원하고 두 행동의 같은 위계는 유지하라. 재현: 성과실 학습 후보의 두 버튼을 v63 원문과 대조하면 불일치한다.

## MINOR

1. [토큰 위반] `dashboard/src/components/home/LearningDecisionsDialog.tsx:79` — 일반 학습 이력 스크림에 플레이어 전용 `bg-player-surface/70` 토큰을 썼다 / `DESIGN.md:115`의 player 토큰은 재생기 전용이라는 계약과 어긋난다 / 덮는 층을 제거하되 화면이 남으면 일반 surface semantic token을 써라. 재현: 클래스와 DESIGN 토큰 정의를 대조한다.

2. [회귀 위험] `dashboard/src/app/api/performance/learned-rules/route.ts:123` — 판단 이력이 무제한 증가하고 매 POST마다 전체 배열을 잠금 안에서 동기 JSON 읽기, 선형 검색, 전체 쓰기한다 / 다중 작업 공간 동시 운영과 이벤트 루프를 막지 않아야 한다는 서버 운영 기준에 어긋난다 / 기록 상한과 cursor pagination을 두거나 유일 키가 있는 DB 테이블과 비동기 I/O로 옮겨라. 재현: 판단 10,000건 파일에서 POST를 병렬 실행해 이벤트 루프 지연과 직렬 대기를 측정한다.

3. [회귀 위험] `dashboard/src/app/api/performance/learned-rules/route.ts:73` — GET 성공 응답이 tenant 유무에 따라 `{rules:[]}` 또는 `{rules,decisions}`로 달라진다 / 클라이언트 `PerformanceChatPanel.tsx:34-37`의 decisions 필수 응답 계약과 어긋난다 / 모든 2xx에서 같은 빈 배열 스키마를 유지하라. 재현: tenant 없는 GET과 정상 tenant GET의 최상위 키를 비교한다.

4. [회귀 위험] `dashboard/src/components/studio/PlatformPreview.tsx:451` — DeliveredMedia 교체 때 기존 영상 `preload="metadata"`를 전달하지 않아 브라우저 기본 정책에 맡겼다 / 세 플랫폼 미리보기가 동시에 뜨는 화면의 불필요한 대용량 전송 방지 기준과 어긋난다 / `preload="metadata"` 또는 의도한 `none`을 명시하고 DOM 속성과 전송량 회귀 테스트를 둬라. 재현: Shorts, Reels, TikTok 미리보기를 함께 렌더하고 세 video의 preload 속성과 네트워크 전송량을 본다.

## 셀프심문

질문: 내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?

답: 발행 중지를 눌러 성공 문구를 봤는데 일부 채널은 이미 올라가 있거나 실제 Compose 발행기가 취소 안전장치 없는 구버전이라 이후에도 게시되는 문제다. MAJOR 1, 2, 4, 9로 돌아가 실제 런타임 정본, 경합, 공급자 호출 결합, UI 응답 소비를 다시 확인했으므로 PASS를 주지 않는다.

## 4축 판정

- 승인 시안 이탈: 지적 3건
- 회귀 위험: 지적 22건. MAJOR 19건, MINOR 3건
- 토큰 위반: 지적 1건
- 무기록 삭제: 문제없음. 고정 범위의 삭제 파일은 0개였고 UI 부품 삭제 diff도 없었다.

REVIEW_VERDICT: BLOCK(MAJOR 있음)

## 벤치마크 적용

- AWS Transactional Outbox: outbox는 쓰는 것만으로 끝나지 않고 별도 relay가 정기적으로 처리해야 한다. MAJOR 7의 판정에 적용했다. https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
- PostgreSQL Explicit Locking: 공유 상태 경쟁은 같은 원자 경계와 명시적 잠금으로 조정해야 한다. MAJOR 2와 3의 판정에 적용했다. https://www.postgresql.org/docs/current/explicit-locking.html
- OWASP Multi-Tenant Security: 모든 계층에서 tenant context를 전파하고 공유 자원 소비를 제한해야 한다. MAJOR 6과 10의 판정에 적용했다. https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html

SKILLS_USED: review. 고정 diff 설정, 다각도 공격 리뷰, 요구 대조, 테스트와 localhost 증거 분리를 적용했다.
SKILLS_SKIPPED: 없음.

SOURCES: `pipeline-state.osmu.md`, 승인 프로토타입 v63, `DESIGN.md`, 회장 확정 요구 대장, OSMU 사업 좌표, `wiki/거버넌스/결정.md`, `wiki/거버넌스/실수.md`, `docs/구현현황.md`, BRAIN OSMU 제품 허브, 고정 커밋 diff, AWS Transactional Outbox, PostgreSQL Explicit Locking, OWASP Multi-Tenant Security Cheat Sheet.
MODEL: gpt-codex/gpt-5

KNOWLEDGE_QUERY: OSMU 사업 좌표에서 돈 경계, 멱등, 다중 작업 공간 격리 요구를 조회하고 BRAIN OSMU 제품 허브에서 원본부터 성과와 다음 제안까지의 루프를 조회했다. 외부에서는 transactional outbox relay, PostgreSQL 동시성 잠금, multi-tenant shared-resource isolation을 조회했다.
HITS_USED: OSMU 사업 좌표는 돈과 격리 판정 기준으로, BRAIN OSMU 허브는 성과 환류 계약으로, AWS와 PostgreSQL과 OWASP 공식 문서는 outbox, 동시성, 격리 판정의 외부 기준으로 채택했다.
HITS_REJECTED: 일반 UI 모달 관행과 경쟁 제품 사례는 승인 프로토타입과 DESIGN.md가 더 강한 계약이므로 판정 기준에 쓰지 않았다.
CONFLICTS: pipeline-state의 현재 승인 design_hub는 v68이지만 과제는 v63을 명시했다. 이번 리뷰는 회장 요청의 명시 핀 v63을 따랐고, 핀 충돌 자체는 별도 Stage Controller 정합 문제로 남긴다.
