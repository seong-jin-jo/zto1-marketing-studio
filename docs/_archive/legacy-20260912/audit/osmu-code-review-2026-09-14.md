# OSMU 최근 24시간 코드 공격 리뷰

STAMP

- 생성 시각: 2026-09-14 04:33 KST
- 모델: gpt-codex/gpt-5
- 에이전트: codex-code-review
- 스킬: review
- 감사 범위: `b4ec9dbdb4eaaa52a9b5d80766ab2927431c2811..acb981ea484a113eaef87ef82f05d4edc43334bf`
- 범위 규모: 커밋 47개, 파일 184개, 추가 10,001줄, 삭제 1,957줄
- 고민 한 줄: 성공 경로보다 승인값과 발행값 사이, 파일과 데이터베이스 사이, 외부 공급자와 내부 상태 사이의 끊어진 경계를 우선 공격했다.

## 한 줄 결론

MAJOR 19건으로 머지를 차단한다. 로컬 파일 탈출 2곳, 승인하지 않은 본문 발행, 실측으로 깨진 큐 잠금, 예약과 카드뉴스의 부분 실패, 성과 수집의 중복 과금 및 거짓 성공 경로가 남아 있다.

## 검토 기준과 범위

- 사용자 지정 프로토타입: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`
- 현재 `pipeline-state.osmu.md`의 최신 `approved_artifacts`는 v68을 가리킨다. 이번 과제는 사용자가 v63을 명시했으므로 v63을 시안 대조 기준으로 삼고, 핀 충돌 자체는 `CONFLICTS`에 남겼다.
- 승인 시안 핵심 원문: “Threads, X, Instagram, Facebook, Shorts, Reels, TikTok 일곱 개를 탭으로 넘기며 실제 올라갈 모습을 봅니다.”, “카드뉴스 다섯 장을 좌우 화살표로 넘겨 봅니다.”
- 디자인 정본 핵심 원문: “선택 학습의 상세를 본문에 상주시키지 않는다.”, “자동 저장 실패에서는 `발행실로 이동`을 비활성화한다.”
- 구현 정체성: 한 원본을 여러 채널 형식으로 만들고 발행한 뒤 성과를 다시 받는 OSMU 순환이 핵심이다.
- 현재 작업 트리는 다른 세션의 미커밋 변경이 많은 공유 작업 트리다. 코드 지적은 고정 커밋 범위의 diff로 판정했고, 실행 검증은 현재 작업 트리에서 수행했다.

## MAJOR

MAJOR: [회귀 위험] `openclaw/extensions/threads-publish/src/threads-publish-tool.ts:88` — `/images/`로 시작하기만 하면 뒤의 `../`를 제거하지 않은 채 `resolve(dataDir, "images", filename)`로 읽어 로컬 이미지 경계 밖 파일을 외부 `tmpfiles.org`에 업로드할 수 있다 / 사용자 과제의 “격리가 뚫리는가”와 테넌트 파일 격리 계약에 어긋난다. Node의 `path.resolve()`는 `..`를 정규화하므로 `/images/../../tenant-b/secrets.json`이 이미지 루트 밖으로 나간다 / 절대 실경로를 만든 뒤 이미지 루트의 하위인지 `relative()`로 검증하고, 허용된 파일명 규격만 받은 뒤 자체 테넌트 미디어 저장소를 사용해야 한다.

- 재현 시나리오: `image_url=/images/../../tenant-b/secrets.json`을 넣는다. 같은 계산을 Node로 실행하면 `/srv/tenant-b/secrets.json`이 되었고, 93행이 그 파일을 읽어 96행의 제3자 서버로 보낸다.

MAJOR: [회귀 위험] `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:34` — Threads와 같은 경로 탈출이 새 Instagram 발행기에 복제됐고, 탈출한 파일을 R2 공개 경로에 저장한다 / “격리가 뚫리는가”를 공격하라는 요구와 테넌트별 미디어 경계에 어긋난다 / 이미지 루트 하위 검증, 파일 확장자와 실제 MIME 검증, 테넌트가 소유한 자산 ID에서만 파일을 역참조하는 계약으로 바꿔야 한다.

- 재현 시나리오: `image_urls=["/images/../../tenant-b/secrets.json"]`을 넘긴다. `resolve("/home/node/data", "images", "../../tenant-b/secrets.json")`은 `/home/node/tenant-b/secrets.json`을 만들며, 60행이 그 내용을 R2로 올린다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-queue/api.ts:44`, `openclaw/extensions/threads-publish/src/threads-publish-tool.ts:72`, `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:93`, `openclaw/extensions/x-publish/src/x-publish-tool.ts:132` — claim은 큐 ID와 채널만 확인하고 승인 당시 본문과 미디어를 다시 읽거나 해시로 묶지 않는다. 발행 도구는 호출자가 새로 준 본문과 미디어를 그대로 공급자에게 보낸다 / `get_approved`가 반환한 작업물을 발행한다는 큐 계약과 승인 인박스 의미에 어긋난다 / claim에 승인 payload 해시를 저장하고 발행 시 큐에서 승인 payload를 다시 읽어야 한다. 호출자 payload를 허용한다면 승인 해시와 정확히 일치할 때만 공급자 호출을 열어야 한다.

- 재현 시나리오: 본문 A를 승인해 claim token을 받은 뒤 같은 `queue_id`와 token으로 본문 B를 `threads_publish`에 넘긴다. 83행은 상태만 통과시키고 113행은 B를 공급자 요청에 싣는다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-queue/src/queue-lock.ts:19` — 잠금 보유자가 살아 있어도 10초 동안 mtime을 갱신하지 않으면 다른 프로세스가 잠금 디렉터리를 지우고 진입하며, 원 보유자는 68행에서 새 보유자의 잠금까지 지울 수 있다 / 파일 주석의 “두 프로세스가 실제로 같은 자물쇠를 놓고 다툰다”와 상호 배제 계약에 어긋난다 / 소유자 토큰을 잠금 파일에 기록하고 heartbeat로 mtime을 갱신하며, 해제 시 자기 토큰이 맞을 때만 제거해야 한다. 검증된 잠금 라이브러리의 stale와 update 규약을 그대로 공유하는 편이 안전하다.

- 재현 시나리오: 첫 임계 구역을 13초 유지하고 10.2초 뒤 두 번째 작업을 시작했다. 실측 이벤트는 `first-enter 1ms`, `second-enter 10254ms`, `second-exit 10356ms`, `first-exit 13002ms`로 2.648초 겹쳤다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-queue/src/threads-queue-tool.ts:405`, `openclaw/extensions/threads-queue/src/queue-claim.ts:215` — 발행 중 lease가 만료되면 `get_approved`가 같은 글에 새 claim을 덮어쓰지만, 새 워커는 채널이 `publishing`이라 발행을 거절당하고 옛 워커는 claim token이 바뀌어 결과를 기록할 수 없다 / “중단된 호출은 복구 대상으로 남긴다”는 207행 계약과 “워커가 죽어도 큐가 멈추지 않게” 한다는 78행 계약에 어긋난다 / `publishing` 시도를 별도 복구 큐로 보내 공급자 idempotency key로 결과를 조회한 뒤 종결하고, 복구가 끝나기 전에는 claim을 교체하지 않아야 한다.

- 재현 시나리오: 공급자 응답 직전 워커를 멈춰 채널을 `publishing`으로 남기고 lease를 만료시킨다. 다음 `get_approved`는 새 token을 발급하지만 `beginPublishAttempt`는 `result-recovery-required`, 이전 결과 기록은 `claim-mismatch`로 끝난다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-publish/src/threads-publish-tool.ts:131`, `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:122` — 공급자가 명시적으로 non-2xx를 반환한 확정 실패도 공통 catch에서 모두 `result_unknown`으로 기록한다 / 큐 도메인은 `provider_failed`와 `result_unknown`을 분리했고, X 발행기는 같은 경우 `provider_failed`로 기록한다. 현재 코드는 그 상태 계약과 어긋난다 / 공급자 응답을 받기 전 네트워크 단절만 `result_unknown`, 명시적 non-2xx는 `provider_failed`로 기록해야 한다.

- 재현 시나리오: Threads 컨테이너 생성이 HTTP 400 또는 Instagram 컨테이너 생성이 HTTP 400을 돌려준다. 외부에 게시되지 않았음이 확정됐는데 188행과 203행은 결과 불명으로 남겨 안전한 재시도와 실패 집계를 막는다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-queue/src/threads-queue-tool.ts:597` — 새 analytics archive가 기존 파일 읽기, 권한, JSON parse 중 어느 하나라도 실패하면 기존 기록을 빈 배열로 간주해 새 기록만 덮어쓴다 / “published posts' engagement를 archive”한다는 주석과 성과 계보 보존 목적에 어긋난다 / ENOENT만 빈 이력으로 허용하고 나머지는 cleanup 전체를 실패시켜야 한다. 기존 파일을 검증한 뒤 원자 교체하고 백업 또는 append-only 저장을 사용해야 한다.

- 재현 시나리오: `analytics-history.json`을 잠시 읽지 못하게 하거나 JSON 끝 한 글자를 손상시키고 7일 지난 게시물 cleanup을 실행한다. 604행이 오류를 삼키고 619행이 과거 전체를 새 게시물 몇 건으로 교체한다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:167` — 예약을 `processing`으로 claim한 뒤 process가 죽었을 때 되살리는 lease 시각이나 reaper가 없다. 이후 조회는 `scheduled`만 고르므로 해당 예약이 영구 고아가 된다 / 코드의 `scheduled | processing | published | ...` 상태 계약과 부분 실패 복구 요구에 어긋난다 / `processing_at`, worker token, lease 만료를 저장하고 만료된 processing을 재수집하되 공급자 호출 idempotency와 결과 조회를 함께 둬야 한다.

- 재현 시나리오: 181행 UPDATE가 커밋된 직후 첫 공급자 호출 전에 프로세스를 종료한다. 다음 실행의 173행 조건은 그 예약을 다시 고르지 않으며 최종 상태도 기록되지 않는다.

MAJOR: [승인 시안 이탈] `dashboard/src/app/api/schedule/publish-due/route.ts:219` — 즉시 발행은 `image_urls` 여러 장을 지원하도록 바뀌었지만 예약 발행은 단일 `imageUrlFromPayload`만 읽고 Instagram에도 한 장만 전달한다 / 승인 시안의 “카드뉴스 다섯 장을 좌우 화살표로 넘겨 봅니다”와 “실제 올라갈 모습을 봅니다”에 어긋난다 / 예약 payload의 이미지 배열을 보존하고 각 URL을 재서명한 뒤 Instagram에 배열 전체를 넘겨야 한다. 채널별 장수 제한은 즉시 발행과 같은 한 계약에서 계산해야 한다.

- 재현 시나리오: 3장 카드뉴스를 Instagram에 예약한다. 저장 payload에 `img.imageUrls`가 있어도 294행은 `img.url`만 읽고 237행은 문자열 하나로 `publishInstagram`을 호출해 단일 게시물이 된다.

MAJOR: [회귀 위험] `dashboard/src/lib/publish.ts:366` — Instagram 캐러셀 자식 컨테이너를 순차 생성하면서 요청 deadline, 전체 시도 idempotency, 생성된 자식 정리 또는 복구 기록이 없다 / 부분 실패와 돈 누수를 공격하라는 요구, “한 장이라도 실패하면 반쪽 카드뉴스를 올리면 안 된다”는 카드 덱 계약에 어긋난다 / 전체 발행 attempt를 먼저 영속화하고 자식별 상태와 idempotency key를 기록해야 한다. 모든 fetch에 deadline을 두고 중단 후 결과 조회와 정리 절차를 제공해야 한다.

- 재현 시나리오: 10장 중 1∼8번 자식 생성은 성공하고 9번 요청이 끊기거나 무한 대기한다. 이미 만든 공급자 컨테이너는 남고 내부에는 자식 ID도 없으며, 사용자의 재시도는 처음부터 새 컨테이너를 만든다.

MAJOR: [회귀 위험] `dashboard/src/lib/studio/card-deck.ts:87` — 카드 한 벌을 저장할 때 앞 장 업로드 성공 뒤 뒷 장이 실패해도 성공한 객체를 지우거나 재사용할 식별자를 반환하지 않는다 / 함수 주석의 “한 장이라도 저장에 실패하면 전체를 실패로 본다”와 실제 저장 원자성이 어긋난다. UI 실패와 저장 실패가 달라 돈과 용량은 이미 소비된다 / batch ID와 결정적 object key를 먼저 만들고 조건부 덮어쓰기 또는 transaction manifest를 사용해야 한다. 실패 시 앞서 만든 객체를 회수하는 보상 작업도 필요하다.

- 재현 시나리오: 5장 덱에서 1∼4장 업로드를 성공시키고 5장 요청만 503으로 만든다. 함수는 throw하지만 앞 네 객체는 남고, 재시도는 무작위 파일명으로 새 객체 다섯 개를 더 만든다.

MAJOR: [승인 시안 이탈] `dashboard/src/app/studio/page.tsx:1032` — 카드 재합성이 실패해도 `redrawn ?? img`로 옛 그림을 저장하고 발행실로 이동한 뒤 성공 토스트를 낸다 / DESIGN.md의 “자동 저장 실패에서는 `발행실로 이동`을 비활성화한다”, “어떤 변경이 저장되지 않았는지와 다시 시도 행동을 함께 말한다”에 어긋난다 / 편집 내용과 발행 미디어가 불일치하면 이동과 성공 토스트를 막고 재시도 또는 변경 폐기 선택을 명시해야 한다.

- 재현 시나리오: 카드 글자를 수정한 뒤 이미지 업로드를 503으로 만든다. 오류 토스트 뒤에도 1033행이 이전 `img`를 저장하고 1036행이 이동하며 “저장하고 이동했습니다”라고 말한다. 사용자는 새 글자를 봤지만 옛 그림을 발행한다.

MAJOR: [승인 시안 이탈] `dashboard/src/components/studio/PlatformPreview.tsx:16`, `dashboard/src/app/studio/page.tsx:658` — 새 카드 덱은 `img.imageUrls`를 보유하지만 미리보기 매체 계약은 대표 `imgUrl` 하나뿐이다. Instagram 캐러셀은 실제 나머지 이미지 대신 `text.instagram.slides`를 새 텍스트 카드처럼 그린다 / 승인 시안의 “실제 올라갈 모습을 봅니다”, “카드뉴스 다섯 장을 좌우 화살표로 넘겨 봅니다”에 어긋난다 / `PreviewMedia`에 이미지 배열을 추가하고 `planChannelImages`가 실제 발행할 배열을 그대로 미리보기에 넘겨야 한다.

- 재현 시나리오: 서로 다른 실제 이미지 3장을 만든다. 발행 요청은 `publishDeck` 3장을 보내지만 Instagram 미리보기 430행은 첫 실제 이미지 1장과 텍스트 slide를 조합해 공급자에 올라갈 2, 3번째 이미지를 볼 수 없다.

MAJOR: [승인 시안 이탈] `dashboard/src/app/studio/page.tsx:1913` — 발행실 본문에 학습 기준 상세 행을 상주시켰다 / DESIGN.md 159∼160행의 “선택 학습의 상세는 작업 화면과 분리된 별도 창이 소유한다”, “선택 학습의 상세를 본문에 상주시키지 않는다”와 정면으로 어긋난다 / 본문에는 학습 정보 창을 여는 짧은 상태와 단추만 두고 상세 값은 기존 wizard 또는 별도 창이 소유하게 해야 한다.

- 재현 시나리오: 학습 정보가 채워진 작업 공간에서 발행실을 연다. 미리보기보다 앞에 업종, 목적, 고객, 말투 등 상세 chip이 항상 렌더되어 승인된 화면 소유 경계를 바꾼다.

MAJOR: [회귀 위험] `dashboard/src/lib/metrics-collector.ts:97` — 같은 테넌트에서 수집 POST 두 개가 동시에 오면 둘 다 동일한 전체 대상 목록을 읽어 모든 공급자 API를 중복 호출한다. 전역 lease, 최근 수집 시각 필터, tenant별 mutex가 없다 / 돈과 rate limit 누수 공격 요구와 OSMU의 성과 회수 목적에 어긋난다 / tenant별 advisory lock 또는 DB job lease를 잡고, 수집 대상에 `metrics_at` freshness 조건과 cursor를 두며 동일 게시물 동시 수집을 막아야 한다.

- 재현 시나리오: 성과실 두 탭에서 새로고침을 동시에 누르거나 cron과 수동 POST가 겹친다. 두 호출 모두 109행에서 같은 게시물 전부를 읽고 222행에서 병렬 공급자 호출을 시작해 비용과 호출 한도를 두 배 쓴다.

MAJOR: [회귀 위험] `dashboard/src/lib/publish.ts:629`, `dashboard/src/lib/publish.ts:685` — X는 100개, YouTube는 50개 단위로 여러 batch를 읽지만 뒤 batch 하나가 실패하면 앞 batch에서 이미 받은 metrics 전체를 `ok:false`로 버린다 / 부분 실패를 전체 실패나 전체 성공으로 세지 말라는 요구와 성과 계보 보존 목적에 어긋난다 / batch별 성공과 실패를 함께 반환하고 `attemptedIds`, `failedIds`, metrics를 분리해 성공한 행은 저장해야 한다.

- 재현 시나리오: X 101개 또는 YouTube 51개를 수집해 첫 batch는 200, 둘째 batch는 429로 만든다. 앞 100개 또는 50개의 정상 응답이 있었는데 호출자는 모든 대상에 blocked code를 기록한다.

MAJOR: [회귀 위험] `dashboard/src/lib/publish.ts:741`, `dashboard/src/lib/metrics-collector.ts:171` — Meta 게시물별 non-2xx와 예외를 모두 조용히 건너뛴 뒤 전체 호출을 `ok:true`로 반환하고, 호출자는 빠진 게시물을 실제 권한 문제인지와 무관하게 `insights_forbidden`으로 기록한다 / “못 받은 항목은 0이 아니라 미수집”이라는 v63 성과실 계약과 부분 실패 원인 보존에 어긋난다 / 게시물별 status와 오류 종류를 반환해 401/403, 404, 429, 5xx, timeout을 분리하고 재시도 가능한 실패는 권한 부족으로 굳히지 않아야 한다.

- 재현 시나리오: Instagram insights가 429 또는 503을 돌려준다. 749행은 상태를 버리고 764행은 성공을 반환하며 177행은 영구 권한 문제처럼 저장해 사용자를 재연결로 잘못 유도한다.

MAJOR: [회귀 위험] `dashboard/src/app/api/metrics/route.ts:57` — 수집 대상 전부 실패해 `result.ok=false`, `collectionBlocked=true`, `partial=false`여도 HTTP 200을 반환한다 / 부분 실패를 전체 성공으로 세지 말라는 요구와 API 상태 계약에 어긋난다 / `result.ok`가 거짓이면 공급자 장애는 502/503, rate limit은 429, 권한 문제는 424 또는 명시적 4xx로 매핑하고 본문과 상태 코드를 일치시켜야 한다.

- 재현 시나리오: 연결된 모든 공급자 metrics 호출을 503으로 만든다. 250행 결과는 `ok:false`지만 route는 `partial`만 보므로 200을 반환하고 모니터와 호출자는 성공으로 센다.

MAJOR: [회귀 위험] `dashboard/scripts/verify-api-read-sweep.mjs:20`, `dashboard/scripts/verify-four-room-ui-e2e.mjs:15`, `dashboard/scripts/probe-four-room-flow.mjs:6` — 120초 제한을 개별 요청과 이동마다 반복하면서 전체 deadline은 없다. 직렬 API route 수와 폭, 테마, 방 수만큼 최악 시간이 곱해진다 / 공통 규율의 “끝나지 않는 명령 금지”와 완료 증거를 제때 회수해야 하는 QA 계약에 어긋난다 / 전체 wall-clock deadline을 별도로 두고 남은 예산을 각 단계 timeout으로 내려야 한다. route 단위는 제한된 병렬성으로 실행하고 초과 시 남은 대상을 명시적으로 실패 처리해야 한다.

- 재현 시나리오: 각 API가 timeout 직전까지 응답하지 않게 하거나 각 방 이동을 120초씩 지연시킨다. API sweep은 route 수 × 120초, 네 방 검증은 5개 viewport/theme 조합 × 5회 이동 × 120초까지 늘어나 무인 워커가 수시간 멈춘다.

## MINOR

없음. 이번 범위에서 확인한 문제는 모두 격리, 발행 정확성, 데이터 보존, 비용, 승인 시안 계약 또는 필수 QA 종료성에 영향을 줘 머지 전 수정 대상이다.

## 검증 증거

- `npx tsc --noEmit`: 통과, exit 0.
- `npm run test`: 실패, exit 1. 324개 파일 중 323 통과, 1 실패. 2,124개 테스트 중 2,120 통과, 3 건너뜀, 1 실패. 실패 위치는 `dashboard/tests/studio/studio-fe2-rooms.test.tsx:239`이며 기대 접근 이름 `2. 둘째 줄` 대신 현재 `2번째 장면 고르기`가 노출됐다. 이 테스트와 직접 원인 파일은 고정 감사 범위에서 바뀌지 않아 최근 커밋 지적으로 세지는 않았지만 필수 검증 게이트는 닫혀 있다.
- `http://localhost:3456/api/health`: HTTP 200, `db=up` 관찰.
- `STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-basic-flow-e2e.mjs`: 11/11 통과.
- `STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-studio-v1-e2e.mjs`: 14/14 통과.
- 큐 잠금 actual module 재현: 첫 임계 구역이 끝나기 2.648초 전에 두 번째 임계 구역 진입 관찰.
- 추가 줄 토큰 검색: 새 inline style 0, 새 hex 색상 0, 새 arbitrary Tailwind 값 0, 새 시각 px literal 0. 긴 대시는 제품 문구가 아니라 주석에서만 발견했다.
- 삭제 대조: 고정 범위의 삭제 파일 0개. 승인 시안의 일곱 플랫폼, Instagram 캐러셀, 발행 선택지, 원본 내려받기 계약을 역방향으로 대조했고, 사유 없이 제거된 화면 부품은 찾지 못했다.

## 4축 판정

- 승인 시안 이탈: 지적 4건. 예약 캐러셀 단일화, 저장 실패 뒤 옛 그림 이동, 실제 이미지 덱과 다른 미리보기, 학습 상세 본문 상주.
- 회귀 위험: 지적 15건. 경로 탈출, 승인 payload 불일치, 잠금 중첩, 고아 상태, 결과 오분류, 이력 손실, 부분 저장, 중복 외부 호출, 거짓 HTTP 성공, 무제한 전체 실행시간을 포함한다.
- 토큰 위반: 문제없음. 고정 diff의 추가 줄에서 inline style, hex 색상, arbitrary value, 시각 px literal을 찾지 못했다.
- 무기록 삭제: 문제없음. 삭제 파일 0개이며 기존 시안 부품 역대조에서 사유 없는 화면 부품 삭제를 찾지 못했다. 단, cleanup의 데이터 이력 유실은 화면 부품 삭제 축이 아니라 회귀 위험으로 집계했다.

## 셀프심문

“내가 PASS 를 준다면, 회장이 dev 에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?”

카드 글자를 고친 뒤 업로드가 한 번 실패했는데도 발행실로 넘어가 이전 그림이 실리는 문제다. 이 답이 떠올라 `dashboard/src/app/studio/page.tsx:1032`를 다시 확인했고 MAJOR로 포함했다. 다음으로 그럴듯한 문제는 예약한 Instagram 카드뉴스가 한 장만 올라가는 경로이며 `publish-due/route.ts:219`를 MAJOR로 포함했다.

REVIEW_VERDICT: BLOCK(MAJOR 있음)

SKILLS_USED: review. 고정 범위 설정, diff 전체 대조, 별도 검증과 결론 우선 리뷰 형식을 적용했다.

SKILLS_SKIPPED: qa. 이 과제는 수정 금지 코드리뷰라 자동 수정 중심 QA 스킬은 사용하지 않았다.

SOURCES:

- 로컬: `pipeline-state.osmu.md`, `DESIGN.md`, `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`, `wiki/거버넌스/요청.md`, `wiki/거버넌스/결정.md`, `wiki/거버넌스/실수.md`, `docs/구현현황.md`, `docs/qa/qa-tracker.md`, `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`
- BRAIN: `wiki/business/index.md`, `wiki/business/pmf/idea-zero-one-marketing-studio.md`, `wiki/business/pmf/concept-제로원-고객경계-바이브코딩-결과물-보유자.md`
- 외부: https://nodejs.org/api/path.html, https://www.postgresql.org/docs/17/explicit-locking.html, https://www.postgresql.org/docs/15/sql-select.html, https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html, https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html, https://api-security.owasp.org/editions/2023/en/0xa3-broken-object-property-level-authorization/
- 벤치마크 적용: Node 경로 정규화로 파일 탈출을 재현했고, PostgreSQL의 transaction row lock과 `SKIP LOCKED`를 예약 claim 기준으로 삼았다. AWS의 객체 단위 저장과 조건부 쓰기 계약을 카드 덱 부분 저장 공격에 적용했고, OWASP의 객체 속성 권한 경계를 승인 payload와 미디어 입력 검증에 적용했다.

MODEL: gpt-codex/gpt-5

KNOWLEDGE_QUERY: OSMU의 한 원본 다채널 발행 및 성과 회수 목적, 고객 경계, 승인된 v63 발행실 계약, Node 경로 정규화, PostgreSQL claim 및 잠금, 객체 저장 부분 실패와 조건부 쓰기, API 객체 속성 권한 경계를 검색했다.
HITS_USED: BRAIN의 OSMU 정체성 문서는 성과 회수와 고객 소유 결과물 보존을 판정 기준으로 채택했다. DESIGN.md와 v63 프로토타입은 화면 및 실패 상태 계약으로 채택했다. Node, PostgreSQL, AWS, OWASP 공식 문서는 경로 탈출, concurrency, 부분 저장, 승인 payload 경계의 재현 근거로 채택했다.
HITS_REJECTED: 범용 마케팅 사례와 시각적 미감 자료는 코드 diff의 보안, 상태, 저장 계약 판정에 직접 근거가 되지 않아 쓰지 않았다. 검색 결과 중 공식 문서가 아닌 2차 요약은 제외했다.
CONFLICTS: 사용자가 명시한 기준은 v63이지만 `pipeline-state.osmu.md` 최신 승인 핀은 v68이다. 이번 감사는 명시 과제의 v63을 따랐고, 최신 핀 기준의 추가 시각 편차 판정은 하지 않았다.
