# OSMU 최근 24시간 코드 재리뷰

STAMP | line: osmu | 생성: 2026-09-13 16:27 KST | model: gpt-codex/GPT-5 | agent: code-reviewer | skill: review | 근거: 승인 프로토타입 v63, pipeline 승인 핀 v68, DESIGN.md v37, 회장 확정 요구 대장, 사업 좌표, BRAIN, 고정 커밋 diff, localhost 실측, 공식 문서 | 고민: 초록 회귀 테스트가 실제 실패 경계를 닫았는지와 테스트 장치 자체가 과금 및 시간 계약을 새로 깨뜨렸는지를 분리했다.

한 줄 결론: 최근 24시간 71개 커밋에는 작업 공간 밖 파일 반출, 승인물 바꿔치기 발행, 동시 writer 진입, 성과 수집 거짓 성공, 카드뉴스 발행물 불일치, 운영 DB 과금 장부 초기화를 포함한 MAJOR 25건이 남아 있어 머지를 차단한다.

## 리뷰 범위와 증거

- 고정 범위: `8652fb5b29fecad7aa688b99ad1c2bab534d2fc4..e65a1d1b1aecbc11ce589ecf9db4183bf4d4296e`
- 범위 규모: 커밋 71개, 파일 283개, 추가 20,440줄, 삭제 1,799줄
- 승인 기준: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`, pipeline의 v68 `design_hub`, `DESIGN.md`, `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`, `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`
- 직접 재현: queue lock 첫 작업은 12,502ms에 끝났지만 둘째 작업은 10,257ms에 진입했다. 임계구역이 2,245ms 겹쳤다.
- localhost 관찰: `localhost:3456` health는 HTTP 200이었다. metrics는 15초 안에 응답하지 않았다. 기본 흐름은 11/11, Studio v1은 14/14 통과했다.
- 자동 검증: `npm run test`는 종료 코드 0, `npx tsc --noEmit`은 종료 코드 0이었다. 초록 테스트는 아래 실패 경계를 닫았다는 증거가 아니다.
- 범위 구분: 리뷰 판단은 고정 커밋의 파일을 `git show`로 읽었다. localhost와 테스트는 동시 작업이 있는 현재 공유 작업 트리에서 실행했으므로 고정 커밋의 결함 해소 증거로 사용하지 않았다.

## MAJOR

MAJOR: [회귀 위험] `openclaw/extensions/threads-publish/src/threads-publish-tool.ts:90`, `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:35`: `/images/` 뒤 문자열을 `resolve()`한 뒤 허용 루트 내부인지 확인하지 않아 작업 공간 밖 파일을 외부 저장소로 반출할 수 있다 / `dashboard/src/lib/file-io.ts:10`의 경로 이탈 차단 계약과 어긋난다 / basename만 받고 정규화된 경로가 작업 공간별 이미지 루트 안인지 확인하며 서명된 tenant media URL만 허용하라. 재현: 승인 claim 뒤 이미지 값을 상위 경로로 바꾸면 작업 공간 밖 파일이 tmpfiles.org 또는 R2 업로드 입력으로 넘어간다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-publish/src/threads-publish-tool.ts:72`, `openclaw/extensions/x-publish/src/x-publish-tool.ts:132`, `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:93`: claim은 queue id와 token만 검증하고 실제 본문과 이미지는 호출자가 다시 넣은 값을 발행한다 / `openclaw/extensions/threads-queue/src/queue-claim.ts:205`의 승인된 pending을 publishing으로 전이한다는 계약과 어긋난다 / 승인 payload 또는 hash를 claim에 묶고 publisher는 큐에서 재조회한 승인값만 사용하라. 재현: 큐에는 승인 본문 A를 두고 같은 queue id와 token으로 본문 B를 넘기면 B가 게시되지만 큐의 A가 published로 기록된다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-queue/src/queue-lock.ts:39`, `openclaw/extensions/threads-queue/src/queue-lock.ts:68`: 10초가 지나면 살아 있는 lock도 지우며 heartbeat와 owner 확인이 없다 / 같은 파일 13행의 proper-lockfile과 같은 자물쇠라는 설명과 어긋난다 / 실제 proper-lockfile을 공유하거나 heartbeat, owner token, compare-and-release를 구현하라. 재현: 첫 callback을 12.5초 유지하고 10.2초 뒤 둘째 writer를 시작하자 둘째가 10,257ms에 진입했고 첫째는 12,502ms에 끝났다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-queue/src/threads-queue-tool.ts:405`: 만료 claim만 보고 재할당하며 채널의 `publishing`과 미해결 `publishAttempt`를 배제하지 않는다 / `openclaw/extensions/threads-queue/src/queue-claim.ts:61`의 외부 성공과 내부 기록 실패를 구분한다는 계약과 어긋난다 / 발행 중 글은 일반 재claim에서 제외하고 provider 호출 중 lease를 갱신하며 immutable attempt token을 사용하라. 재현: A의 provider 호출이 5분을 넘기면 B가 새 token으로 같은 글을 발행하고 A의 성공 기록은 claim mismatch로 거절된다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-queue/src/threads-queue-tool.ts:151`: 파일 없음, 권한 오류, 잘못된 JSON을 모두 빈 큐로 바꾼다 / 기존 큐 보존과 read-modify-write 원자성 계약에 어긋난다 / `ENOENT`만 빈 큐로 처리하고 파싱 및 I/O 오류는 fail-closed하며 복구 사본을 남겨라. 재현: `queue.json`을 잘못된 JSON으로 만든 뒤 add 또는 update를 호출하면 기존 글 전체가 사라진 새 큐로 덮인다.

MAJOR: [회귀 위험] `dashboard/src/lib/queue-mirror-outbox.ts:85`, `dashboard/src/lib/queue-mirror-outbox.ts:141`: 성공 항목을 revision 없이 postId만으로 지워 늦은 옛 성공이 최신 실패 outbox까지 삭제한다 / 같은 파일 15행의 나중에 두 저장소를 맞춘다는 계약과 어긋난다 / 상태 revision 또는 payload hash로 compare-and-delete하고 DB도 조건부 갱신하라. 재현: S1 mirror가 멈춘 사이 S2가 DB 실패로 outbox를 쓰고 S1이 성공하면 S2 항목까지 지워져 DB S1, 파일 S2, outbox 빈 상태가 된다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-publish/src/threads-publish-tool.ts:131`, `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:122`: 공급자가 확정 non-2xx를 반환해도 catch에서 모두 `result_unknown`으로 기록한다 / `wiki/거버넌스/결정.md:185`의 실패 사유를 버리지 않는다는 계약과 어긋난다 / 명시적 non-2xx는 `provider_failed`, 응답 결과가 실제로 불명확한 경우만 `result_unknown`으로 기록하라. 재현: Threads 컨테이너 생성 400도 unknown이 되어 정상 실패 재처리와 결과 확인이 모두 막힌다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:127`, `dashboard/src/app/api/schedule/[id]/route.ts:23`: provider 성공 뒤 기록 저장이 실패하면 schedule이 `processing`에 남지만 취소와 다음 sweep 대상에서 모두 제외된다 / publish-due 27행의 결과를 기록한 뒤 최종 상태로 닫는다는 계약과 어긋난다 / immutable attempt, 결과 outbox, `processing_at` lease와 stale recovery를 두라. 재현: 외부 게시 직후 `recordPublishedPost`를 실패시키면 외부 글은 존재하지만 재처리와 취소가 모두 막힌다.

MAJOR: [회귀 위험] `dashboard/src/lib/queue-store.ts:132`, `dashboard/src/app/api/queue/[postId]/delete/route.ts:22`: 파일 삭제 뒤 DB 삭제 실패를 삼키고 API는 `{ok:true}`를 반환하며 삭제 tombstone outbox도 없다 / `dashboard/src/lib/queue-mirror-outbox.ts:15`의 미러 실패를 드러내고 재시도한다는 계약과 어긋난다 / 삭제도 revision을 가진 tombstone outbox에 넣고 응답에 `deferred`를 명시하라. 재현: DB 중단 중 삭제하면 파일에서는 사라지고 HTTP 200이지만 DB 행은 남아 DB 읽기 전환 시 다시 나타난다.

MAJOR: [회귀 위험] `dashboard/src/app/api/metrics/route.ts:57`: 전 대상 실패 결과도 `partial=false`이면 HTTP 200을 반환한다 / `wiki/거버넌스/결정.md:175`의 제공자 거절을 성공으로 종료하지 않는다는 계약과 어긋난다 / `ok`, `collectionBlocked`, 실제 성공 수를 함께 판정해 성공 0건이면 비성공 상태를 반환하라. 재현: Threads 대상 1건의 insights가 403이면 `updated=0, failed=1, ok=false`인데 HTTP 200이다.

MAJOR: [회귀 위험] `dashboard/src/lib/publish.ts:640`, `dashboard/src/lib/publish.ts:693`, `dashboard/src/lib/tiktok.ts:94`: X, YouTube, TikTok의 뒤 batch 하나가 실패하면 앞 batch의 성공 metrics를 폐기한다 / 사업 좌표 59행의 돈과 멱등 계약에 어긋난다 / 성공 ID별 값과 실패 batch를 함께 반환하고 실패분만 재시도하라. 재현: X 101건에서 첫 100건 성공, 마지막 1건 429이면 101건 모두 blocked가 되고 재시도 때 성공한 100건의 쿼터를 다시 쓴다.

MAJOR: [회귀 위험] `dashboard/src/lib/publish.ts:749`, `dashboard/src/lib/publish.ts:762`, `dashboard/src/lib/metrics-collector.ts:174`: Meta 429, 5xx, timeout을 건너뛴 뒤 helper가 `ok:true`를 반환하고 누락 ID를 `insights_forbidden`으로 저장한다 / `wiki/거버넌스/결정.md:187`의 기다릴 문제와 조치할 문제를 구분한다는 계약과 어긋난다 / ID별 HTTP와 오류 종류를 보존하고 401, 403만 권한 오류로 분류하라. 재현: Reels insights 429가 재시도 가능 상태가 아니라 채널 재연결이 필요한 영구 권한 오류가 된다.

MAJOR: [회귀 위험] `dashboard/src/lib/metrics-collector.ts:70`, `dashboard/src/lib/metrics-collector.ts:222`: 모든 과거 글과 영구 차단 글을 매 요청마다 다시 읽고 concurrency 3은 요청 내부에서만 적용한다 / 사업 좌표 51행과 59행의 동시 실행과 몫 계약에 어긋난다 / tenant와 provider 단위 lease, freshness window, cursor와 LIMIT, blocked cooldown을 두라. 재현: 과거 2,000건인 작업 공간에 POST 10개를 동시에 보내면 같은 2,000건을 10번 조회하며 provider 호출이 최대 30개까지 겹친다.

MAJOR: [회귀 위험] `dashboard/src/lib/metrics-collector.ts:84`, `dashboard/src/lib/metrics-collector.ts:118`: Threads 본 조회와 실패 분류 조회에 AbortSignal이 없다 / 종료되는 검증과 부분 실패 격리 계약에 어긋난다 / 모든 provider fetch에 deadline을 두고 provider별 공정 큐와 전체 요청 마감을 둬라. 재현: 실제 `localhost:3456` metrics 요청이 15초 안에 끝나지 않았다. Threads 세 fetch를 무응답으로 두면 세 worker와 HTTP 응답이 함께 대기한다.

MAJOR: [회귀 위험] `dashboard/src/lib/metrics-collector.ts:51`: settings 전체를 잠금 밖에서 읽고 `writeJson`으로 되써 동시 설정 변경을 덮는다 / `dashboard/src/lib/file-io.ts:59`의 fresh read 후 atomic mutation 계약과 어긋난다 / 기존 `mutateJson`으로 `analyticsViewed`만 원자 갱신하라. 재현: metrics가 옛 settings를 읽은 사이 사용자가 채널 설정을 저장하면 metrics write가 옛 설정을 다시 써 새 값이 사라진다.

MAJOR: [회귀 위험] `dashboard/src/lib/metrics-collector.ts:228`, `dashboard/src/lib/metrics-collector.ts:237`: UPDATE의 실제 반영 행 수를 확인하지 않고 provider 성공 객체 수를 DB 저장 성공 수로 센다 / `wiki/거버넌스/결정.md:182`의 조용한 성공 금지와 어긋난다 / `RETURNING id` 또는 affected row count로 실제 저장 성공만 집계하라. 재현: 대상 조회 뒤 provider 응답 전에 행을 삭제하면 UPDATE 0행인데 `updated=1, failed=0, ok=true`다.

MAJOR: [회귀 위험] `dashboard/src/components/studio/StudioRooms.tsx:730`, `dashboard/src/app/api/images/upload/route.ts:91`: 카드 여러 장을 개별 저장하고 마지막에만 UI 상태에 연결해 중간 실패의 앞선 객체를 회수하지 않는다 / 사업 좌표 59행의 돈과 멱등 계약에 어긋난다 / batch id와 idempotency key를 쓰거나 실패 때 이미 저장한 filename을 보상 삭제하라. 재현: 5장 중 4번째 업로드를 503으로 만들고 재시도하면 1에서 3번 객체가 매번 고아로 남아 저장량과 PUT 비용이 누적된다.

MAJOR: [회귀 위험] `dashboard/src/lib/publish-return-context.ts:22`, `dashboard/src/app/studio/page.tsx:1312`: 새 다중 이미지 작업을 검토 대기나 발행 일정에서 복귀할 때 `imageUrl` 한 장만 복원한다 / v63 14652행의 다섯 장 카드뉴스 계약과 어긋난다 / return context에 검증된 `imageUrls` 배열을 포함하고 fallback ImgResult까지 복원하라. 재현: 5장을 검토 대기로 보낸 뒤 연결 draft가 없는 복귀 경로를 타면 첫 장만 남아 다음 발행이 단일 이미지로 축소된다.

MAJOR: [회귀 위험] `dashboard/scripts/verify-api-read-sweep.mjs:20`, `dashboard/scripts/verify-api-read-sweep.mjs:111`: 120초 제한을 GET 105개에 순차 적용하고 전체 deadline이 없어 최악 종료가 12,600초다 / 확정 요구 대장의 검증은 반드시 끝나는 명령이어야 한다는 계약과 어긋난다 / dev compile 준비를 분리하고 제한 병렬성, 짧은 route timeout, 전체 실행 마감을 둬라. 재현: 모든 route가 연결만 유지하면 210분 뒤에야 종료된다.

MAJOR: [회귀 위험] `dashboard/scripts/verify-four-room-ui-e2e.mjs:15`, `dashboard/scripts/verify-four-room-ui-e2e.mjs:103`, `dashboard/scripts/verify-four-room-ui-e2e.mjs:107`, `dashboard/scripts/verify-four-room-ui-e2e.mjs:116`: 콜드 컴파일과 사용자의 방 이동 및 데이터 준비를 같은 120초로 늘려 119초가 걸린 화면도 PASS로 만든다 / 사용자 상호작용 상한을 검증해야 한다는 요구와 어긋난다 / 서버 예열과 클릭 후 SLA를 분리하고 단계별 시간을 기록해 짧은 사용자 상한을 넘으면 실패시켜라. 재현: 각 방 이동 또는 성과 제안이 119초 걸려도 현재 조건에서는 PASS다.

MAJOR: [회귀 위험] `dashboard/scripts/probe-four-room-flow.mjs:6`, `dashboard/scripts/probe-four-room-flow.mjs:59`, `dashboard/scripts/probe-four-room-flow.mjs:61`: 같은 120초 값을 네 방 각각의 `goto`와 표시 대기에 따로 적용해 전체 실행 deadline 없이 최대 약 16분을 정상 PASS로 센다 / 종료되는 QA와 사용자 체감 시간 계약에 어긋난다 / 전체 deadline과 방별 사용자 체감 예산을 분리하고 cold compile 예열은 측정 구간 밖에서 한 번만 수행하라. 재현: 각 방의 DOMContentLoaded와 방 표시를 각각 119초 지연시켜도 마지막에 나타나기만 하면 83행의 PASS가 나온다.

MAJOR: [회귀 위험] `dashboard/scripts/seed-test-tenants.sql:20`, `dashboard/scripts/seed-test-tenants.sql:30`, `dashboard/scripts/apply-schema.sh:24`, `dashboard/scripts/apply-schema.sh:33`: 고정 QA 작업 공간의 이번 달 `generations_used`를 매번 0으로 되감지만 실행기는 대상 DB가 로컬, CI, 격리 DB인지 확인하지 않는다 / 사업 좌표 59행의 과금 한도와 멱등 계약에 어긋난다 / 명시적 테스트 환경 표식과 DB 식별자 허용 목록을 함께 요구하고 운영 및 공유 DB에서는 `--seed`를 거부하라. 재현: 운영 또는 공유 DB의 `DATABASE_URL`로 `apply-schema.sh --seed`를 실행하면 고정 UUID 테넌트를 생성하거나 승격하고 월 한도를 100/0으로 덮어써 반복 공급자 비용을 허용한다.

MAJOR: [승인 시안 이탈] `dashboard/src/components/studio/PlatformPreview.tsx:430`, `dashboard/src/app/studio/page.tsx:1139`: Instagram 미리보기는 실제 `imageUrls` 배열 대신 대표 이미지 한 장과 텍스트 슬라이드를 합치지만 발행은 실제 이미지 배열을 전송한다 / v63 14652행의 "카드뉴스 다섯 장을 좌우 화살표로 넘겨 봅니다", DESIGN.md 843행의 실제 카드뉴스 캐러셀 계약과 어긋난다 / PreviewMedia가 `imageUrls`를 받고 발행 요청과 동일한 배열만 캐러셀 source로 사용하게 하라. 재현: 글자 카드 5장을 만든 뒤 미리보기를 넘기면 1/6과 임시 텍스트 카드가 보이지만 실제 발행 배열은 5장이다.

MAJOR: [승인 시안 이탈] `dashboard/src/components/studio/StudioRooms.tsx:716`, `dashboard/src/app/studio/page.tsx:1139`: 카드 문구와 위치를 편집해도 최종 PNG를 다시 만들지 않고 생성 당시 `imageUrls`를 그대로 발행한다 / `wiki/거버넌스/요청.md:31`의 "카드뉴스는 이미지 위의 문구와 배치를 직접 고친다"와 41행의 전체 PNG 내보내기 계약에 어긋난다 / 단일 slide source로 편집 상태를 유지하고 현재 문구와 위치로 최종 PNG를 버전 저장한 뒤 그 URL만 검토, 발행, 다운로드에 써라. 재현: 첫 장 문구와 위치를 바꾸고 Instagram에 발행하면 화면 편집값이 아닌 원본 PNG가 올라간다.

MAJOR: [승인 시안 이탈] `dashboard/src/app/studio/page.tsx:1845`: 발행실 본문에 학습 기준 다섯 항목을 상주시켰다 / `DESIGN.md:159`의 선택 학습 상세는 별도 창이 소유한다, 160행의 본문 상주 금지, `wiki/거버넌스/요청.md:609`의 헤더에 있으면 본문에서 반복하지 않는다는 확정 요구와 어긋난다 / 본문 패널을 제거하고 헤더에서 별도 학습 창으로만 들어가게 하라. 재현: 발행실에 들어가면 헤더 학습 상태와 별개로 `publish-learning-context` 패널이 항상 보인다.

## MINOR

MINOR: [회귀 위험] `dashboard/tests/integrity/four-room-probe-ready-timeout.regression-1.test.ts:17`, `dashboard/tests/integrity/qa-four-room-workspace-seed.regression-2.test.ts:17`: 두 회귀 테스트가 실행 결과가 아니라 소스 문자열 존재만 검사해 거짓 양성을 만든다 / 실제 deadline 실패와 quota 최종값을 관찰해야 한다는 완료 계약과 어긋난다 / probe는 지연 서버로 전체 deadline 실패를 실행 검증하고 seed는 일회용 Postgres에서 적용 후 고정 UUID 행과 운영 DB 거부를 조회 단언하라. 재현: probe의 한 대기만 1초로 바꾸거나 seed의 고정 UUID를 다른 테넌트로 바꿔도 현재 문자열 단언은 통과한다.

## 4축 판정

- 승인 시안 이탈: 지적 3건
- 회귀 위험: 지적 23건. MAJOR 22건, MINOR 1건
- 토큰 위반: 문제없음. 최근 diff의 신규 색상, 인라인 style, 임의 spacing 리터럴에서 DESIGN.md 토큰 계약 위반을 확정하지 못했다.
- 무기록 삭제: 문제없음. 최근 diff의 삭제 파일과 기능 역방향 대조에서 사유 없는 제품 부품 삭제를 확정하지 못했다.

## 셀프심문

"내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?"

답: 카드뉴스에서 고친 문구가 실제 PNG와 발행물에 반영되지 않고, 실제 두 번째 장부터는 발행 전 미리볼 수도 없다는 문제다. 위의 승인 시안 이탈 MAJOR 두 건으로 확인했다.

REVIEW_VERDICT: BLOCK(MAJOR 있음)

SKILLS_USED: review
SKILLS_SKIPPED: 디자인 기계 탐지기는 설치되지 않아 기계 검사를 생략하고 DESIGN.md 및 코드 대조로 수행했다.
SOURCES: `pipeline-state.osmu.md`; `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`; pipeline 승인 v68 prototype; `DESIGN.md`; `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`; `wiki/거버넌스/결정.md`; `wiki/거버넌스/실수.md`; `wiki/거버넌스/요청.md`; `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`; `docs/구현현황.md`; `/Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/index.md`; `/Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/pmf/idea-zero-one-marketing-studio.md`; `/Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/pmf/concept-제로원-고객경계-바이브코딩-결과물-보유자.md`; `https://api-security.owasp.org/editions/2023/en/0x11-t10/`; `https://nodejs.org/api/path.html`; `https://www.postgresql.org/docs/current/explicit-locking.html`
MODEL: gpt-codex/GPT-5
KNOWLEDGE_QUERY: OSMU 원본 충실도, 멀티벤처 작업 공간 경계, 승인 발행 payload 결속, 파일 경로 정규화, Postgres 동시 변경, provider 부분 실패, 과금 quota 시드, 카드뉴스 실제 미리보기, QA 전체 deadline
HITS_USED: BRAIN의 OSMU 원본 충실도와 고객 결과물 소유 경계, OWASP의 무제한 자원 소비 위험, Node.js path 정규화 의미, PostgreSQL의 명시적 잠금과 동시 변경 원칙을 결함 우선순위와 재현 설계에 사용했다.
HITS_REJECTED: 범용 사업 문서, 시각 미세 편차, 범위 이전의 기존 영문 단추는 이번 고정 diff의 계약 이탈 증거가 아니어서 제외했다.
CONFLICTS: pipeline-state의 현재 design_hub 핀은 v68이지만 이번 과제는 v63을 확정 기준으로 지정했다. 사용자 지시대로 v63의 명시 계약을 우선 판정하고 v68은 교차 확인에만 사용했다.
