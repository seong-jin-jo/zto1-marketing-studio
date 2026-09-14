# OSMU 최근 24시간 코드 공격 리뷰

STAMP

- 생성 시각: 2026-09-14 16:16 KST
- 모델: gpt-codex/gpt-5
- 에이전트: codex-code-review
- 스킬: review
- 감사 범위: `e65a1d1b1aecbc11ce589ecf9db4183bf4d4296e..22c27bdb303a11cdc8c831160a404ea1ea541bf6`
- 범위 규모: 커밋 70개, 파일 162개, 추가 17,132줄, 삭제 433줄
- 고민 한 줄: 초록 테스트보다 고객 신원과 전역 자원 사이, 외부 부작용과 내부 기록 사이, 임차 만료와 재시도 사이의 틈을 우선 공격했다.

## 한 줄 결론

MAJOR 28건으로 머지를 차단한다. 고객 토큰으로 전역 공급자 계정 정보가 실제 노출됐고, 유료 생성 경로의 테넌트 격리 부재, 중복 발행 경쟁 조건, 공개 파일 호스트 반출, 사용량 초기화, 부분 실패 성공 오인, 유료 이미지 소실이 남아 있다. API 전수 검증기는 인증 리다이렉트도 정상으로 세어 이 결함을 초록으로 숨길 수 있다.

## 검토 기준과 증거

- 2026-09-14 16:02 KST에 최근 24시간 범위를 다시 고정했다. 최초 커밋 `39c01597`의 부모 `e65a1d1b`부터 종료 커밋 `22c27bdb`까지다.
- `pipeline-state.osmu.md:234`의 최신 승인 핀은 v68이고, `DESIGN.md:908`은 v64를 현재 승인 전체 제품 정본이라고 적는다. 이번 과제는 사용자가 v63을 명시했으므로 `openclaw-auto-4room-v63.html`을 시안 대조 기준으로 썼다. 이 충돌 때문에 디자인 전체 PASS는 금지했다.
- 지정된 `wiki/product/사업좌표-OSMU와-ZERO-ONE.md`를 실제로 열었고, 여러 사업체 동시 실행과 돈, 몫, 멱등이 실제여야 한다는 제약을 판정에 썼다.
- localhost 관찰: `/api/health` HTTP 200과 DB up. 같은 날 앞선 고객 토큰 실측에서 `/api/higgsfield/status`가 HTTP 200으로 `email`, `plan`, `credits`, `raw` 키를 반환했고, 이번 재검토 종료 커밋까지 해당 고객 허용 목록과 응답 코드가 바뀌지 않았다. 값은 이 문서에 기록하지 않았다.
- 필수 검증: `npm run test` 348파일, 2,277건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. 기본 흐름 E2E 11/11, Studio v1 E2E 14/14 통과.
- 커밋 범위에서 삭제된 파일은 0개이고 `git diff --check`는 통과했다. 실행 검증은 다른 세션의 미커밋 변경이 있는 공유 작업 트리에서 수행했으므로 고정 커밋 범위의 안전 증명으로 확대하지 않는다.

## MAJOR

MAJOR: [회귀 위험] `dashboard/src/proxy.ts:39` - 고객 허용 목록에 `ai-suggest`, `generate-image`, `midjourney`, `card-news` 여섯 경로를 열었지만 각 핸들러는 `effectiveTenantId`, 사용량 예약, 테넌트 저장소, 호출 빈도와 동시 실행 한도 없이 전역 `main` 에이전트를 실행한다 / 과제의 “돈이 새는가, 격리가 뚫리는가”와 사업 좌표의 “돈이 걸린 계약은 진짜여야 한다”에 어긋난다 / 테넌트 신원, 영속 사용량 예약, 작업별 저장소, 허용 도구, 테넌트와 전역 동시 실행 상한을 묶기 전에는 운영자 전용으로 되돌려야 한다.

- 재현 시나리오: 서로 다른 두 활성 고객이 `/api/ai-suggest/guide`와 `/api/midjourney/generate`를 반복 호출한다. `dashboard/src/app/api/ai-suggest/guide/route.ts:34`와 `dashboard/src/app/api/midjourney/generate/route.ts:8`은 어느 고객 비용인지 기록하지 않고 전역 에이전트를 최대 120초와 180초 실행한다.

MAJOR: [회귀 위험] `dashboard/src/app/api/card-news/generate/route.ts:41` - 전역 이미지 폴더에서 수정 시각이 가장 최근인 카드 묶음을 호출자의 결과로 반환한다. `dashboard/src/app/api/generate-image/route.ts:29`도 같은 방식으로 전역 최신 이미지를 반환한다 / 과제의 “격리가 뚫리는가”와 사업 좌표의 여러 사업체 동시 실행 제약에 어긋난다 / 생성 작업 ID와 테넌트 ID를 에이전트 호출에 함께 넣고 테넌트 전용 폴더에서 해당 작업 ID의 산출물만 반환해야 한다.

- 재현 시나리오: 고객 A와 B가 카드뉴스 또는 이미지를 동시에 만든다. A의 에이전트가 끝난 뒤 B의 파일 수정 시각이 더 최신이면 A 응답이 B의 파일을 가리킨다.

MAJOR: [회귀 위험] `dashboard/src/app/api/higgsfield/status/route.ts:6` - 전역 Higgsfield 계정의 이메일, 요금제, 크레딧, 원문 응답을 그대로 반환하는 운영 상태 경로를 `dashboard/src/proxy.ts:141`에서 고객에게 열었다 / 과제의 “격리가 뚫리는가”에 어긋나며 실제 고객 토큰 호출에서도 HTTP 200과 네 민감 키가 관찰됐다 / 이 경로는 운영자 전용으로 닫고 고객 화면에는 계정 정보 없는 작업 공간별 생성 가능 여부와 자기 사용량만 반환해야 한다.

- 재현 시나리오: 지정 작업 공간에 매핑한 임시 고객 토큰으로 `GET /api/higgsfield/status`를 호출한다. 2026-09-14 12시대 localhost에서 `email`, `plan`, `credits`, `raw`가 반환됐다.

MAJOR: [회귀 위험] `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:93` - 캐러셀의 모든 로컬 이미지가 같은 `instagram/{idempotencyKey}.{ext}` 키에 순차 업로드돼 같은 확장자의 앞 장을 다음 장이 덮어쓴다 / `image_urls` 2개 이상은 캐러셀이라는 이 파일 119행 계약에 어긋난다 / 안정된 시도 키 뒤에 장 순번 또는 콘텐츠 해시를 붙여 장마다 다른 객체 키를 써야 한다.

- 재현 시나리오: 로컬 PNG 두 장으로 Instagram 캐러셀을 발행한다. 168행 반복문이 같은 키로 두 번 업로드하고 두 URL이 같아져 공급자는 마지막 장을 두 번 받는다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:100` - 15분 임차를 공급자 호출 직전에 한 번만 연장하며 호출 중 heartbeat가 없다. `dashboard/src/lib/publish.ts:918`의 X와 985행의 Facebook 발행 요청에는 제한시간도 없다 / 과제의 “동시성”과 중복 발행 금지에 어긋난다 / 모든 공급자 호출 제한시간을 임차보다 짧게 두고 실행 중 heartbeat와 영속 발행 시도 상태를 유지해야 한다.

- 재현 시나리오: 첫 워커의 X 응답을 16분 지연시킨 뒤 같은 예약 처리를 다시 실행한다. 둘째 워커가 만료 임차를 회수해 발행하고, 첫 워커도 늦게 완료해 같은 글이 두 번 올라간다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:149` - claim 쿼리는 만료된 `processing` 예약을 회수하지만 운영자 전체 스윕의 테넌트 목록은 `status='scheduled'`만 찾는다 / 새 복구 기능의 목적과 “기존 동작이 깨질 수 있는 곳” 점검 요구에 어긋난다 / `dueTenantIds`에도 claim과 같은 만료 `processingLease.expiresAt` 조건을 넣어야 한다.

- 재현 시나리오: 유일한 예약을 `processing`으로 claim한 뒤 워커를 죽이고 임차를 만료시킨다. 일반 운영자 크론은 그 테넌트를 목록에 넣지 않아 예약을 영구 방치한다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:136` - 공급자 발행 성공 뒤 `recordPublishedPost`가 실패하면 예외가 상위로 빠지고 예약은 `processing`에 남는다. 임차 회수 뒤 같은 글을 다시 외부 발행한다 / 외부 성공의 멱등 복구 계약에 어긋난다 / 외부 호출 전에 플랫폼별 영속 시도를 예약하고 기록 실패는 `uncertain`으로 닫은 뒤 공급자 조회로 복구해야 한다.

- 재현 시나리오: 공급자가 게시 식별자를 반환한 직후 408행 INSERT의 DB 연결을 끊는다. 내부 기록은 없고 예약만 회수 가능해져 다음 크론이 같은 콘텐츠를 다시 올린다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:316` - 공급자가 게시를 받았지만 응답 전 연결이 끊긴 예외를 일반 `ok:false`로 바꿔 `failureKind='indeterminate'`를 잃는다 / 이 파일 403행의 “게시 성공 뒤 응답만 끊긴 경우는 uncertain” 계약에 어긋난다 / 외부 전송 뒤 발생한 네트워크 오류와 제한시간 초과는 `indeterminate`로 분류하고 공급자 조회나 안정된 멱등 키로 확정 전 재발행을 막아야 한다.

- 재현 시나리오: 공급자가 게시를 저장한 직후 응답 연결만 끊는다. 316행 catch가 확정 실패로 만들고 사용자는 재시도해 중복 게시한다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:66` - 개별 예약이 `partial`, `failed`, `uncertain`이어도 최상위 응답은 항상 `ok:true`이고, 전체 스윕도 82행에서 동일하다 / 과제의 “부분 실패를 전체 성공으로 세는 곳”에 직접 어긋난다 / 예약 상태를 최상위에 집계하고 부분 성공, 전체 실패, 불확정을 서로 다른 비성공 계약으로 반환해야 한다.

- 재현 시나리오: 예약 플랫폼 하나를 미지원 값으로 둔다. 내부 상태는 `failed`지만 HTTP 응답 최상위는 `ok:true`라 크론 감시기가 성공으로 센다.

MAJOR: [회귀 위험] `dashboard/src/app/api/publish/route.ts:734` - 본문 게시 뒤 요청한 첫 댓글이 실패해도 HTTP 200과 최상위 `ok:true`를 유지하고 `partial:true`를 보조 필드에만 둔다 / 과제의 “부분 실패를 전체 성공으로 세는 곳”과 HTTP 2xx 성공 의미에 어긋난다 / 첫 댓글을 별도 작업 상태로 분리하거나 최상위 비성공 상태와 재시도 계약을 반환해야 한다.

- 재현 시나리오: `first_comment`를 넣고 본문 발행만 성공시킨 뒤 댓글 공급자 호출을 실패시킨다. 상태 코드와 `ok`만 보는 호출자와 관제는 전체 발행 성공으로 기록한다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-queue/src/queue-claim.ts:90` - 한 채널이 `publishing`이면 임차가 만료돼도 claim을 영구 거부하며 공급자 조회 복구 경로가 없다 / 주석의 “워커가 죽어도 큐가 멈추지 않게”와 어긋난다 / `publishing`에 별도 임차와 `result_unknown` 복구 상태를 두고 만료 시 공급자 조회 뒤 재시도 또는 수동 회수로 전이해야 한다.

- 재현 시나리오: `beginQueuePublishAttempt` 직후 공급자 호출 전에 프로세스를 죽인다. claim이 만료돼도 이후 모든 `claimPost`가 null을 반환해 글이 영구 정지한다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-queue/src/queue-lock.ts:50` - stale 판정의 `stat`과 `rename` 사이에 정상 소유자가 heartbeat를 갱신해도 경쟁자가 예전 판정으로 잠금을 훔친다 / 과제의 “동시성”과 이 파일 64행의 큐 잠금 계약에 어긋난다 / 검증된 잠금 구현을 공유하거나 소유자와 버전을 원자적으로 비교한 뒤에만 stale 회수해야 한다.

- 재현 시나리오: 경쟁자가 오래된 mtime을 읽은 직후 원 소유자가 88행 heartbeat를 쓴다. 경쟁자는 갱신된 잠금도 53행에서 옮겨 두 프로세스가 동시에 `queue.json`을 갱신한다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-queue/src/threads-queue-tool.ts:401` - `get_approved`의 `limit`과 `leaseMs`가 양수인지밖에 검사하지 않아 한 호출이 전체 큐를 가져가거나 사실상 영구 임차할 수 있다 / 작업자 간 공정성과 실패 복구 계약에 어긋난다 / 고정 최대 배치, 최대 임차, 페이지 나눔과 작업자별 claim 상한을 적용해야 한다.

- 재현 시나리오: `limit=Number.MAX_SAFE_INTEGER`, `leaseMs=Number.MAX_SAFE_INTEGER`로 `get_approved`를 호출한다. 승인 큐 전체가 한 워커에 묶이고 메모리와 응답 크기가 커지며 다른 워커는 회수하지 못한다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-publish/src/threads-publish-tool.ts:156` - 고객의 로컬 이미지를 동의나 테넌트 저장소 경계 없이 공개 제3자 파일 호스트 `tmpfiles.org`에 업로드한다 / 과제의 “격리가 뚫리는가”와 고객 자산을 자사 경계 밖에 공개하지 않는 기본 개인정보 계약에 어긋난다 / 테넌트 소유 저장소의 짧은 만료 서명 URL을 쓰고 설정이 없으면 공개 호스트로 우회하지 말고 실패해야 한다.

- 재현 시나리오: 승인 큐의 비공개 `/images/customer-campaign.png`를 Threads에 발행한다. 시스템은 공개 사본을 폐기하거나 접근을 회수할 수 없다.

MAJOR: [회귀 위험] `dashboard/src/app/api/video/subtitle/route.ts:45` - `ffprobe` 실패를 1080x1920, 6초 영상으로 꾸며 계속 처리하고 성공 응답까지 낸다 / 41행의 “크기를 짐작으로 박으면 안 된다”와 부분 실패 비성공 계약에 어긋난다 / 탐침 실패를 명시적 비성공으로 닫고 유효한 폭, 높이, 길이가 확인된 경우에만 인코딩해야 한다.

- 재현 시나리오: 실제 60초 영상에 대해 `FFPROBE_BIN`을 실패시키고 정상 ffmpeg를 둔다. 자막은 6초 기준으로 배치되지만 응답은 `ok:true`다.

MAJOR: [회귀 위험] `dashboard/src/app/api/video/subtitle/route.ts:76` - 글꼴 없음과 인코더 실패를 HTTP 200으로 반환한다. JSON의 `ok:false`를 모르는 프록시와 감시기는 실패를 성공으로 기록한다 / RFC 9110의 2xx 성공 의미에 어긋난다 / 422, 503, 504 등 원인에 맞는 비성공 상태와 오류 본문을 반환해야 한다.

- 재현 시나리오: `SUBTITLE_FONT_FILE`을 없는 파일로 지정한다. 본문에는 `SUBTITLE_FONT_MISSING`이 있지만 HTTP 200이라 일반 HTTP 성공 지표가 작업 완료로 센다.

MAJOR: [회귀 위험] `dashboard/src/app/api/video/subtitle/route.ts:149` - 인증된 고객 요청마다 최대 180초 ffmpeg를 새로 띄우며 테넌트별 또는 전역 동시 실행 한도, 입력 영상 길이와 바이트, 출력 용량 한도가 없다 / 과제의 “돈이 새는가, 동시성”과 OWASP 자원 소비 제한 원칙에 어긋난다 / 영속 작업 큐, 테넌트 1개와 전역 워커 상한, 입력과 출력 예산, 호출 빈도 제한을 적용해야 한다.

- 재현 시나리오: 한 고객이 유효한 영상과 서로 다른 자막으로 수십 요청을 병렬 전송한다. 각 요청이 별도 ffmpeg를 최대 180초 점유해 다른 고객과 서버 전체를 막는다.

MAJOR: [회귀 위험] `dashboard/scripts/seed-test-tenants.sql:20` - `--seed` 재실행이 고정 QA 작업 공간의 월 포함량을 100으로, 사용량을 0으로 덮어쓴다. `dashboard/scripts/apply-schema.sh:12`는 임의 `DATABASE_URL`을 받고 시험 DB 표식을 검사하지 않는다 / 과제의 “돈이 새는가”와 사업 좌표의 실제 몫 계약에 어긋난다 / 시험 전용 데이터베이스 표식을 fail-closed로 검증하고 매 실행 임시 테넌트만 초기화해야 한다.

- 재현 시나리오: 고정 작업 공간의 `generations_used`를 80으로 만든 뒤 같은 DB에 `apply-schema.sh --seed`를 실행한다. 30행이 0으로 되감아 추가 생성 100회를 허용한다.

MAJOR: [회귀 위험] `dashboard/src/lib/queue-mirror-outbox.ts:141` - outbox 전체를 매 스윕에서 직렬 동기화하고 항목마다 `find`와 `includes`를 반복하며 배치 상한과 재시도 대기시간이 없다 / 예약 발행을 지연시키지 않는 운영 계약과 OWASP의 단일 요청 작업량 제한에 어긋난다 / `Map`, `Set`, 커서 기반 제한 배치, `nextAttemptAt` 지수 백오프를 적용해야 한다.

- 재현 시나리오: DB 장애 동안 outbox와 큐에 각각 10만 건을 쌓은 뒤 예약 발행 크론을 호출한다. O(n²) 탐색과 10만 직렬 DB 호출이 새 예약 발행보다 먼저 실행된다.

MAJOR: [회귀 위험] `dashboard/src/lib/metrics-collector.ts:635` - 대상은 `account_id`를 읽지만 플랫폼별 기본 자격증명 하나만 가져와 모든 계정의 게시물을 조회한다 / 다중 계정 계약과 정확한 소유 계정으로 성과를 읽는 요구에 어긋난다 / 대상을 `(platform, account_id)`로 묶고 각 그룹의 정확한 자격증명을 사용해야 한다.

- 재현 시나리오: 계정 B로 올린 글과 기본 계정 A가 함께 있을 때 A 토큰으로 B 글을 조회한다. 700행의 종결 판정이 계정 불일치로 글을 은퇴시켜 이후 수집에서도 제외할 수 있다.

MAJOR: [회귀 위험] `dashboard/src/lib/metrics-collector.ts:890` - 성과 조회 실패는 `metricsBlocked`만 갱신하고 `metrics_at`, `metrics_attempted_at`, `next_attempt_at`을 남기지 않는다 / 과제의 “돈이 새는가”와 공급자 요청 한도 보호에 어긋난다 / 403과 계정 불일치는 긴 대기, 429는 공급자 지시를 반영하는 영속 재시도 시각을 기록해야 한다.

- 재현 시나리오: 수백 게시물의 성과 권한을 취소하고 `/api/metrics`를 연속 호출한다. 모든 행이 258행의 신선도 조건을 계속 통과해 공급자 요청을 매번 반복한다.

MAJOR: [회귀 위험] `dashboard/src/lib/metrics-collector.ts:256` - 신선도 대상 조회에 `LIMIT`과 커서가 없고 Threads는 대상마다 외부 작업을 만들어 880행에서 전부 끝날 때까지 기다린다 / OWASP의 단일 요청 작업량과 페이지 크기 제한 원칙에 어긋난다 / 제한 배치, 커서, 전체 수집 시간 예산과 다음 실행 시각을 둬야 한다.

- 재현 시나리오: 오래된 Threads 게시물 10만 건을 한 테넌트에 둔다. 한 요청이 10만 작업과 외부 호출을 만들고 임차를 계속 잡아 이후 수집을 막는다.

MAJOR: [회귀 위험] `dashboard/src/lib/metrics-collector.ts:735` - Threads 정상 성과 요청의 `fetch`에 `AbortSignal`이나 제한시간이 없다 / 같은 파일의 목록 조회에는 8초 제한을 둔 정책과 어긋나며 한 공급자 지연이 테넌트 임차를 무기한 잡는다 / 모든 공급자 요청에 개별 제한시간과 전체 수집 마감시간을 적용해야 한다.

- 재현 시나리오: Threads insights 세 요청이 응답을 끝내지 않게 한다. 동시 작업 세 개와 테넌트 advisory lock이 끝나지 않아 해당 작업 공간의 성과 수집이 영구 정지한다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:73` - 운영자 전체 스윕은 모든 테넌트를 배열로 만든 뒤 outbox와 예약 발행을 테넌트마다 직렬로 끝낼 때까지 수행하며 배치, 마감시간, 재개 커서가 없다 / 한 테넌트 실패가 다른 테넌트 전체를 막지 않아야 한다는 격리 원칙에 어긋난다 / 테넌트 제한 배치, 시간 예산, 독립 결과와 다음 스윕 커서를 둬야 한다.

- 재현 시나리오: 첫 테넌트에 대량 outbox나 멈춘 공급자 호출을 둔다. 뒤 테넌트의 정상 예약은 처리 시작조차 못 하고 gateway timeout 뒤 어느 위치부터 재개할지도 없다.

MAJOR: [승인 시안 이탈] `dashboard/src/components/studio/EditOutline.tsx:130` - 편집 목차에 별도 `▲`, `▼` 이동 단추를 다시 넣었고 `dashboard/src/components/studio/StudioRooms.tsx:1488`은 그 사족 문구까지 상시 노출한다 / v63 원문 `openclaw-auto-4room-v63.html:13197`의 “우리도 끌어 옮기게 두고 앞으로 · 뒤로 단추는 걷었다(R190)”와 `DESIGN.md:913`의 “목차 앞으로·뒤로 폐지, 끌어서 옮기기”에 어긋난다 / 방향 단추와 그 안내 문구를 제거하고 승인된 끌어서 순서 변경의 키보드 동등 조작을 제공해야 한다.

- 재현 시나리오: 편집실 목차 항목을 선택한다. 승인안에서 제거된 위와 아래 조작이 각 항목 아래에 나타나고 안내 문단이 같은 이탈을 설명한다.

MAJOR: [승인 시안 이탈] `dashboard/src/components/studio/StudioRooms.tsx:1357` - 카드 순서 이동과 삭제는 줄, 보임 상태, 글자 위치만 바꾸고 `previewImageUrls`는 바꾸지 않는다. `dashboard/src/components/studio/EditPreview.tsx:164`는 여전히 같은 index의 옛 이미지를 고른다 / `DESIGN.md:501`의 카드 캔버스 직접 편집과 보이는 결과를 믿고 고치는 계약에 어긋난다 / 카드 문구, 이미지, 보임 상태, 위치를 한 배열로 모델링해 같은 트랜잭션에서 이동하고 삭제해야 한다.

- 재현 시나리오: 서로 다른 카드 A, B, C에서 B를 첫 장으로 끌거나 A를 삭제한다. 첫 장 문구는 B지만 썸네일과 큰 미리보기 배경은 옛 A라 사용자는 틀린 화면을 보며 편집한다.

MAJOR: [무기록 삭제] `dashboard/src/app/studio/page.tsx:1131` - 카드뉴스 대표 이미지를 비용 승인 뒤 생성해도 편집실에서 발행실로 이동할 때 모든 카드 작업을 `renderAndUploadCardDeck`으로 다시 그려 `img`를 대체한다. `dashboard/src/lib/studio/text-card-image.ts:142`는 원본 이미지를 합성하지 않고 단색 배경으로 덮는다 / `dashboard/src/app/studio/page.tsx:879`의 유료 “카드뉴스 대표 이미지” 기능을 사유 없이 출고물에서 없애며 요청 원장과 커밋 설명에 그 삭제 결정이 없다 / 무료 글자 카드와 유료 대표 이미지 유형을 구분하고 유료 원본 위에 편집 글자를 합성하거나 사용자가 명시적으로 바꿀 때만 교체해야 한다.

- 재현 시나리오: 비용 승인을 거쳐 대표 이미지를 만든 뒤 카드뉴스 문구를 편집하고 발행실로 이동한다. 1138행이 유료 이미지 대신 단색 글자 카드 URL을 저장해, 돈을 쓴 결과물이 출고 직전에 사라진다.

MAJOR: [회귀 위험] `dashboard/scripts/verify-api-read-sweep.mjs:108` - `classify`가 200부터 399까지를 모두 `정상`으로 분류해, 인증이 깨진 API가 로그인 화면으로 리다이렉트돼도 전수 검증을 통과시킨다 / 과제의 “부분 실패를 전체 성공으로 세는 곳”과 인증된 API는 계약된 JSON 응답을 내야 한다는 회귀 검증 목적에 어긋난다. 원문은 `if (status >= 200 && status < 400) return "정상";`이다 / 3xx를 별도 실패 분류로 닫고 의도한 리다이렉트가 있는 개별 경로만 목적지와 함께 허용해야 한다.

- 재현 시나리오: 보호 API 하나가 고객 토큰을 무시하고 `302 Location: /login`을 반환하게 한다. 전수 검증기는 HTTP 요청이 API 계약을 잃었는데도 그 항목을 정상으로 기록하고 종료 코드 0을 낸다.

## MINOR

MINOR: [토큰 위반] `dashboard/src/components/studio/EditOutline.module.css:46` - 새 썸네일 폭을 `44px` 리터럴로 박았다 / `DESIGN.md:882`의 “v37 토큰만”, 885행의 신규·수정 영역 크기 토큰 규칙과 어긋난다 / 승인된 의미 토큰을 사용하거나 썸네일 전용 토큰을 DESIGN 정본에 먼저 추가해야 한다.

- 재현 시나리오: 디자인 시스템의 조작면 크기를 토큰에서 변경한다. 목차 썸네일만 44px에 고정돼 같은 크기 체계와 따로 움직인다.

MINOR: [회귀 위험] `dashboard/tests/analytics/osmu-code-review-20260914-metrics-lease.regression-1.test.ts:18` - `db: vi.fn()`으로 운영 advisory lock 갈래를 제거한 뒤 process-local `Set`만 검증한다 / PostgreSQL 세션 잠금으로 여러 프로세스를 막는 실제 계약을 증명하지 못한다 / 시험 DB의 독립 reserved connection 두 개로 같은 key 경합, 예외 뒤 unlock, 다른 테넌트 병렬 허용을 검증해야 한다.

- 재현 시나리오: 서로 다른 Node 프로세스 두 개가 같은 테넌트를 동시에 수집하게 한다. 현재 테스트는 한 프로세스 mock만 써 이 결함이 있어도 초록이다.

MINOR: [회귀 위험] `dashboard/tests/api/publish-channel-image-capacity.test.ts:12` - route 소스 문자열에 오류 코드가 있는지만 검사해 실행 불가능한 분기나 공급자 호출 뒤 검증도 통과시킨다 / 외부 발행 전에 이미지 수를 거절한다는 계약을 증명하지 못한다 / 실제 POST로 Threads 2장, Instagram 10장과 11장 경계를 호출하고 공급자 미호출을 검증해야 한다.

- 재현 시나리오: 이미지 수 검사를 공급자 호출 뒤로 옮기되 같은 오류 문자열을 남긴다. 테스트는 통과하지만 초과 이미지가 이미 공급자에 전송된다.

MINOR: [회귀 위험] `dashboard/tests/api/api-read-sweep-dev-concurrency.regression-1.test.ts:11` - 검증기 소스에 네 문자열이 있는지만 검사해 실제 기본 병렬도와 최대 동시 요청 수를 실행하지 않는다 / “기본값은 콜드 컴파일을 한 번에 하나로 제한”한다는 이 테스트 10행 계약과 어긋난다 / 임시 HTTP 서버에서 기본 환경의 최대 동시 요청이 1인지, 명시 환경값이 2부터 12까지만 허용되는지 실행으로 검증해야 한다.

- 재현 시나리오: 네 문자열은 그대로 두고 워커 생성부가 상수 4를 쓰게 바꾼다. 테스트는 통과하지만 개발 서버는 다시 네 경로를 동시에 콜드 컴파일해 멈출 수 있다.

MINOR: [회귀 위험] `dashboard/tests/integrity/dev-server-bundler.contract.test.ts:16` - 감독 스크립트에 허용 명령 문자열이 있고 금지 문자열 하나가 없는지만 확인해 실제 `ensure_app` 실행 인자를 증명하지 않는다 / “감독 복구 경로도 검증된 개발 명령을 사용”한다는 이 테스트 12행 계약과 어긋난다 / `npm`을 기록용 대역으로 둔 종료형 통합 테스트에서 `ensure_app`이 정확히 `npm run dev -- -p 3456`을 실행하고 다른 Next 직접 실행을 하지 않는지 확인해야 한다.

- 재현 시나리오: 허용 문자열을 주석이나 죽은 분기에 남기고 `npm exec next dev -p 3456`을 실제 분기에 추가한다. 현재 테스트는 계속 통과하지만 감독은 검증되지 않은 번들러 경로를 다시 실행한다.

## 셀프심문

“내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?” 유료 대표 이미지를 만든 뒤 편집실을 거치면 무료 단색 카드로 바뀌거나, 예약 글이 외부에는 성공했지만 내부 기록 실패 뒤 다시 올라가는 문제다. 인증이 깨진 API가 로그인 화면을 돌려줘도 전수 검증기가 정상이라고 보고할 수도 있다. 고객 토큰으로 전역 공급자 계정 정보가 보이는 것까지 같은 날 직접 관찰했으므로 PASS를 줄 수 없다.

## 4축 판정

- 승인 시안 이탈: 지적 2건.
- 회귀 위험: 지적 29건. MAJOR 25건, MINOR 4건.
- 토큰 위반: 지적 1건.
- 무기록 삭제: 지적 1건.

REVIEW_VERDICT: BLOCK

SKILLS_USED: review
SKILLS_SKIPPED: review 스킬의 자동 수정 단계는 “코드를 수정하지 마라”는 사용자 역할 계약 때문에 실행하지 않았다.

KNOWLEDGE_QUERY: BRAIN `wiki/business/index.md`에서 OSMU, 격리, 동시성, 부분 실패, 발행, 성과를 검색해 수익형 OSMU 묶음의 실제 원가 자료까지 좁혔다. 외부에서는 OWASP 보안 코드 리뷰와 비즈니스 로직 보안, CWE-362 경쟁 조건, RFC 9110 HTTP 상태, Amazon S3 PutObject 덮어쓰기, PostgreSQL advisory lock을 조회했다.
HITS_USED: 사업 좌표의 다중 사업체, 돈, 몫, 멱등 제약과 BRAIN의 묶음당 30달러부터 44달러 원가를 격리와 과금 판정에 사용했다. OWASP의 권한 경계와 부분 실패, CWE-362의 공유 자원 동시 접근 정의를 경쟁 조건 판정에 사용했다.
HITS_REJECTED: 일반 마케팅 심리, 콘텐츠 후킹, 교육 상품 자료는 이번 코드의 격리와 동시성 판정에 직접 근거가 되지 않아 제외했다.
CONFLICTS: 사용자 지정 v63, `pipeline-state.osmu.md` 최신 승인 핀 v68, `DESIGN.md`가 적은 현행 전체 정본 v64가 서로 다르다. 이번 리뷰는 사용자의 명시 지시인 v63을 우선했고 디자인 전체 정합은 미검증으로 남겼다.

SOURCES

- `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`
- `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`
- `wiki/거버넌스/요청.md`
- `DESIGN.md`
- `wiki/product/사업좌표-OSMU와-ZERO-ONE.md`
- `pipeline-state.osmu.md`
- `/Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/index.md`
- `/Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/pmf/idea-수익형-블로그-유료글-플랫폼.md`
- https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html
- https://cwe.mitre.org/data/definitions/362.html
- https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/
- https://www.rfc-editor.org/rfc/rfc9110.html#name-successful-2xx
- https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html
- https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS

MODEL: gpt-codex/gpt-5
