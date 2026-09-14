# OSMU 최근 24시간 코드 공격 리뷰

STAMP

- 생성 시각: 2026-09-14 20:44 KST
- 모델: gpt-codex/gpt-5
- 에이전트: codex-code-review
- 스킬: review
- 감사 범위: `82642efea035488eabfdd0f754f64d80f9873d3e..f32ff7127ee1347d1c4b695740bd1aad947bdfdb`
- 범위 규모: 커밋 87개, 파일 213개, 추가 20,193줄, 삭제 500줄
- 고민 한 줄: 초록 테스트보다 고객 신원과 전역 자원 사이, 외부 부작용과 내부 기록 사이, 임차 만료와 재시도 사이의 틈을 우선 공격했다.

## 한 줄 결론

MAJOR 36건으로 머지를 차단한다. 고객 토큰으로 전역 공급자 계정 정보가 실제 노출됐고, 유료 생성 경로의 테넌트 격리 부재, 중복 발행 경쟁 조건, 공개 파일 호스트 반출, 부분 실패 성공 오인, 유료 이미지 소실이 남아 있다. API 전수 검증기는 논리 실패와 구빌드 서버도 정상으로 셀 수 있고, 네 방 E2E는 동시 수정된 작업 공간 설정을 덮어쓸 수 있다. 종료 직전 추가된 OpenClaw 메모리 수정은 자기 단위 테스트 3건을 깨뜨렸다.

## 검토 기준과 증거

- 2026-09-14 20:44 KST에 최근 24시간 범위를 다시 고정했다. 최초 커밋 `6aac3c17`의 부모 `82642efe`부터 리뷰 도중 공유 브랜치에 추가된 종료 커밋 `f32ff712`까지다.
- `pipeline-state.osmu.md:234`의 최신 승인 핀은 v68이고 `DESIGN.md`는 v64와 v68 후보 문구가 함께 남아 있다. 사용자가 v63을 명시했으므로 v63을 기본 대조 기준으로 썼고, 더 최신인 `wiki/거버넌스/요청.md`와 충돌하는 항목은 요구 원장을 우선했다. 그래서 기존 감사의 위아래 이동 단추 자체 지적은 철회했다.
- 지정된 `wiki/product/사업좌표-OSMU와-ZERO-ONE.md`는 현재 경로에서 삭제돼 있었다. git 이력으로 이동을 확인한 뒤 현행 정본 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`를 읽고 여러 사업체 동시 실행과 돈, 몫, 멱등 제약을 판정에 썼다.
- localhost 관찰: `/api/health` HTTP 200과 DB up. 새 임시 고객 토큰으로 `/api/higgsfield/status`를 호출해 HTTP 200과 `email`, `plan`, `credits`, `raw` 키 반환을 다시 관찰했다. 값은 기록하지 않았고 토큰은 HTTP 200으로 폐기했다.
- 필수 검증: dashboard `npm run test` 351파일, 2,291건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. 기본 흐름 E2E 11/11, Studio v1 E2E 14/14 통과. 이후 추가된 `f32ff712`의 OpenClaw 대상 테스트는 26건 중 3건 실패했다.
- 커밋 범위에서 삭제된 파일은 0개이고 `git diff --check`는 통과했다. 다만 3456 listener PID 33531은 16:14 시작됐고 검증 로그가 적은 `54a7e8cf`는 17:00 커밋이다. 실행 서버와 현재 HEAD 동일성은 증명되지 않았으므로 이 실행 결과를 고정 커밋의 안전 증명으로 확대하지 않는다.

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

MAJOR: [회귀 위험] `dashboard/src/app/api/video/subtitle/route.ts:47` - dashboard가 `ffprobe`와 `ffmpeg`를 직접 실행해 미디어를 읽고 재인코딩한다 / PRD 249행의 “openclaw-service는 미디어 바이트를 다루지 않는다”와 262행의 “openclaw application code는 미디어를 buffer, blob, canvas, FFmpeg로 열지 않는다”에 어긋난다 / 미디어 변형은 headless studio-service 작업으로 옮기고 dashboard는 불변 입력 참조와 파생 결과 참조만 주고받아야 한다.

- 재현 시나리오: 편집실 영상에 자막을 넣고 발행실로 이동한다. dashboard 프로세스가 직접 영상 메타데이터를 읽고 새 MP4를 만든다.

MAJOR: [회귀 위험] `dashboard/src/app/api/video/subtitle/route.ts:45` - `ffprobe` 실패를 1080x1920, 6초 영상으로 꾸며 계속 처리하고 성공 응답까지 낸다 / 41행의 “크기를 짐작으로 박으면 안 된다”와 부분 실패 비성공 계약에 어긋난다 / 탐침 실패를 명시적 비성공으로 닫고 유효한 폭, 높이, 길이가 확인된 경우에만 인코딩해야 한다.

- 재현 시나리오: 실제 60초 영상에 대해 `FFPROBE_BIN`을 실패시키고 정상 ffmpeg를 둔다. 자막은 6초 기준으로 배치되지만 응답은 `ok:true`다.

MAJOR: [회귀 위험] `dashboard/src/app/api/video/subtitle/route.ts:76` - 글꼴 없음과 인코더 실패를 HTTP 200으로 반환한다. JSON의 `ok:false`를 모르는 프록시와 감시기는 실패를 성공으로 기록한다 / RFC 9110의 2xx 성공 의미에 어긋난다 / 422, 503, 504 등 원인에 맞는 비성공 상태와 오류 본문을 반환해야 한다.

- 재현 시나리오: `SUBTITLE_FONT_FILE`을 없는 파일로 지정한다. 본문에는 `SUBTITLE_FONT_MISSING`이 있지만 HTTP 200이라 일반 HTTP 성공 지표가 작업 완료로 센다.

MAJOR: [회귀 위험] `dashboard/src/app/api/video/subtitle/route.ts:149` - 인증된 고객 요청마다 최대 180초 ffmpeg를 새로 띄우며 테넌트별 또는 전역 동시 실행 한도, 입력 영상 길이와 바이트, 출력 용량 한도가 없다 / 과제의 “돈이 새는가, 동시성”과 OWASP 자원 소비 제한 원칙에 어긋난다 / 영속 작업 큐, 테넌트 1개와 전역 워커 상한, 입력과 출력 예산, 호출 빈도 제한을 적용해야 한다.

- 재현 시나리오: 한 고객이 유효한 영상과 서로 다른 자막으로 수십 요청을 병렬 전송한다. 각 요청이 별도 ffmpeg를 최대 180초 점유해 다른 고객과 서버 전체를 막는다.

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

MAJOR: [승인 시안 이탈] `dashboard/src/components/shared/GettingStartedStrip.tsx:57` - 학습 정보가 덜 찼으면 실제 온보딩의 다음 단계와 무관하게 81행과 85행에서 `학습 정보 채우기`를 주 행동으로 강제하고 다섯 단계를 끝내도 안내를 닫지 않는다 / 사업 좌표 55행의 “첫 콘텐츠 전에는 업종과 글, 카드뉴스 또는 영상 갈래만”, 57행의 “브랜드 안내가 비어 있어도 첫 후보 생성을 막지 않는다”에 어긋난다 / 첫 후보 전 주 행동은 생성 흐름을 유지하고 선택 학습은 별도 창의 보조 행동으로만 둬야 한다.

- 재현 시나리오: 학습 일곱 칸 중 하나를 비운 신규 작업 공간으로 생성실에 들어간다. 다음 할 일과 채운 주 단추가 첫 콘텐츠 만들기가 아니라 학습 정보 채우기를 가리킨다.

MAJOR: [승인 시안 이탈] `dashboard/src/components/studio/StudioRooms.tsx:1357` - 카드 순서 이동과 삭제는 줄, 보임 상태, 글자 위치만 바꾸고 `previewImageUrls`는 바꾸지 않는다. `dashboard/src/components/studio/EditPreview.tsx:164`는 여전히 같은 index의 옛 이미지를 고른다 / `DESIGN.md:501`의 카드 캔버스 직접 편집과 보이는 결과를 믿고 고치는 계약에 어긋난다 / 카드 문구, 이미지, 보임 상태, 위치를 한 배열로 모델링해 같은 트랜잭션에서 이동하고 삭제해야 한다.

- 재현 시나리오: 서로 다른 카드 A, B, C에서 B를 첫 장으로 끌거나 A를 삭제한다. 첫 장 문구는 B지만 썸네일과 큰 미리보기 배경은 옛 A라 사용자는 틀린 화면을 보며 편집한다.

MAJOR: [승인 시안 이탈] `dashboard/src/components/studio/StudioRooms.tsx:1488` - 카드 편집실에 “순서는 끌어서 놓거나 ▲▼로 바꿉니다. 자유 배치는 아직 제공하지 않습니다. 글자는 상단·중앙·하단 중에서 고릅니다.”라는 세 문장 설명을 상시 노출한다 / v63 4561행의 “화면 구조와 이름으로 알 수 있는 것을 문장으로 또 말하면 사족”과 요구 원장 2120행의 “사족 문구 금지”에 어긋난다 / 설명 문단을 제거하고 조작의 보이는 라벨과 상태만 남겨야 한다.

- 재현 시나리오: 카드 편집실에 들어간다. 목차 아래에서 조작 자체가 이미 보여 주는 내용을 반복하는 안내 문단이 항상 보인다.

MAJOR: [무기록 삭제] `dashboard/src/app/studio/page.tsx:1131` - 카드뉴스 대표 이미지를 비용 승인 뒤 생성해도 편집실에서 발행실로 이동할 때 모든 카드 작업을 `renderAndUploadCardDeck`으로 다시 그려 `img`를 대체한다. `dashboard/src/lib/studio/text-card-image.ts:142`는 원본 이미지를 합성하지 않고 단색 배경으로 덮는다 / `dashboard/src/app/studio/page.tsx:879`의 유료 “카드뉴스 대표 이미지” 기능을 사유 없이 출고물에서 없애며 요청 원장과 커밋 설명에 그 삭제 결정이 없다 / 무료 글자 카드와 유료 대표 이미지 유형을 구분하고 유료 원본 위에 편집 글자를 합성하거나 사용자가 명시적으로 바꿀 때만 교체해야 한다.

- 재현 시나리오: 비용 승인을 거쳐 대표 이미지를 만든 뒤 카드뉴스 문구를 편집하고 발행실로 이동한다. 1138행이 유료 이미지 대신 단색 글자 카드 URL을 저장해, 돈을 쓴 결과물이 출고 직전에 사라진다.

MAJOR: [회귀 위험] `dashboard/scripts/verify-api-read-sweep.mjs:130` - 상태 코드만 보고 모든 2xx를 정상으로 세고 225행에서 성공 본문을 판정 증거에서도 비운다 / `dashboard/src/app/api/higgsfield/status/route.ts:17`처럼 HTTP 200 `{ok:false}`인 논리 실패를 전체 성공으로 세지 말라는 과제와 어긋난다 / 경로별 성공 스키마와 content-type을 확인하고 `ok:false`와 error payload를 실패로 분류해야 한다.

- 재현 시나리오: Higgsfield CLI를 미로그인 또는 실패 상태로 두고 전수 검증기를 실행한다. status 라우트는 HTTP 200과 `ok:false`를 내지만 검증기는 정상으로 집계해 종료 코드 0을 낼 수 있다.

MAJOR: [회귀 위험] `dashboard/scripts/verify-api-read-sweep.mjs:252` - 실행 전후 소스 해시와 listener PID가 같다는 것만 확인하고 listener가 그 소스로 빌드됐는지는 확인하지 않는다 / 완료는 회장이 여는 그 경로의 최신 빌드에서 증명해야 한다는 완료 계약과 어긋난다 / 격리 checkout에서 build와 start를 묶거나 health가 build commit 또는 source digest를 반환하게 해 runner HEAD와 일치시켜야 한다.

- 재현 시나리오: 구버전 서버를 켜 둔 채 소스를 새 커밋으로 바꾸고 sweep을 실행한다. 실제 v10 로그는 PID 33531이 16:14에 시작됐는데 로그의 커밋 `54a7e8cf`는 17:00 커밋이고도 `evidence_stable:true`를 기록했다.

MAJOR: [회귀 위험] `dashboard/scripts/verify-api-read-sweep.mjs:156` - `evidenceFiles`를 시작할 때 한 번만 열거하고 161행의 전후 해시가 같은 목록만 다시 읽는다 / 전체 `src`, `scripts`가 실행 중 고정돼야 한다는 이 검증기의 증거 계약과 어긋난다 / 종료 시 파일 목록을 다시 열거해 경로 집합과 해시를 함께 비교하고 route manifest도 다시 생성해 비교해야 한다.

- 재현 시나리오: sweep 시작 뒤 `src/app/api/new/route.ts`를 추가한다. 새 파일은 시작 시 요청 목록과 고정된 `evidenceFiles`의 after hash에서 모두 빠져 `evidence_stable:true`가 될 수 있다.

MAJOR: [회귀 위험] `dashboard/scripts/verify-four-room-ui-e2e.mjs:67` - 실제 고정 작업 공간 설정 전체를 snapshot하고 182행에서 덮은 뒤 228행에서 원문 전체를 무조건 복원한다 / 지정 작업 공간의 기존 값과 동시 변경을 보존해야 한다는 회귀 금지 계약에 어긋난다 / 별도 임시 QA 작업 공간을 쓰거나 자신이 바꾼 필드만 version CAS 뒤 복원해야 한다.

- 재현 시나리오: E2E가 실행되는 동안 다른 세션이 같은 작업 공간 settings를 수정한다. finally가 시작 전 문자열 전체를 써 그 변경을 소리 없이 삭제한다.

MAJOR: [회귀 위험] `dashboard/scripts/verify-four-room-ui-e2e.mjs:228` - settings 복원 첫 줄이 throw하면 뒤의 임시 고객 토큰 폐기와 브라우저 종료가 모두 건너뛰어진다 / 정리 단계 실패를 독립적으로 모아 비성공으로 끝내야 한다는 QA 완료 계약과 어긋난다 / 복원, 토큰 폐기, 브라우저 종료를 각각 독립 try/finally로 실행하고 실패를 누적해 exit 1로 닫아야 한다.

- 재현 시나리오: 실행 중 settings 파일 권한이나 경로를 바꿔 `writeFileSync`를 실패시킨다. 229행 토큰 폐기와 241행 브라우저 종료가 실행되지 않는다.

MAJOR: [회귀 위험] `.github/workflows/ci.yml:56` - 요구된 전체 `npx tsc --noEmit` 대신 좁힌 설정을 쓰고 `dashboard/tsconfig.ci.json:23`에서 발행 큐, 복구, 승인 payload, 삭제 동의 관련 테스트 아홉 개를 타입 검사에서 제외한다. `dashboard/next.config.ts:25`도 build 타입 오류를 무시한다 / 과제의 필수 전체 타입 검사와 고위험 발행 계약에 어긋난다 / openclaw 의존성을 설치한 별도 typecheck job이나 project reference로 정확한 전체 타입 검사를 실행하고 exclude를 없애야 한다.

- 재현 시나리오: 제외된 발행 테스트나 벤더 경계에 런타임에서 제거되는 타입 불일치를 넣는다. Vitest는 transpile하고 build는 타입 오류를 무시해 CI가 초록이 될 수 있다.

MAJOR: [회귀 위험] `.github/workflows/ci.yml:8` - workflow 경로가 `dashboard/**`와 workflow 파일만 포함해 이번 범위의 `openclaw/Dockerfile`과 extension 변경만 있는 PR에서는 CI 자체가 실행되지 않는다 / 변경한 배포물과 발행 확장을 머지 전에 실제 빌드하고 회귀 검증해야 한다는 완료 계약에 어긋난다 / `openclaw/**`를 trigger에 넣고 Docker build와 해당 workspace test, typecheck를 별도 job으로 실행해야 한다.

- 재현 시나리오: `openclaw/Dockerfile`의 build 명령이나 extension import를 깨뜨린 PR을 만든다. 이 workflow는 paths 불일치로 시작되지 않는다.

MAJOR: [회귀 위험] `openclaw/scripts/tsdown-build.mjs:45` - 공유 상수를 768MB에서 3,584MB로 바꾸면서 같은 계산을 고정한 단위 테스트 세 곳을 갱신하지 않아 현재 OpenClaw 테스트가 실패한다 / 머지 전 테스트가 통과해야 한다는 과제의 완료 계약과 `openclaw/test/scripts/tsdown-build.test.ts:179`, 190행, 214행의 7GB 환경 기대값 6,400MB에 어긋난다 / 배포 머신 전용 정책을 전역 상수에 박을지 환경별 입력으로 둘지 먼저 결정하고, 저메모리 경계와 배포 머신 실측을 포함한 기대값을 함께 승인한 뒤 테스트를 통과시켜야 한다.

- 재현 시나리오: `pnpm exec vitest run test/scripts/tsdown-build.test.ts --config test/vitest/vitest.tooling.config.ts --maxWorkers=1`을 실행한다. 26건 중 세 건이 예상 6,400MB와 실제 3,584MB 불일치로 실패한다.

MAJOR: [회귀 위험] `dashboard/scripts/capture-studio-fe3-playwright.mjs:15` - 핵심 생성 흐름을 `FE3_RUN_GENERATION=1`일 때만 실행하도록 바꿨지만 `scripts/build-morning-report.sh:26`은 그 값을 주지 않고 전체 실패도 `|| true`로 삼킨다 / 생성, 후보 세 장, 편집 인계의 실관찰을 남긴다는 캡처 계약과 거짓 완료 금지에 어긋난다 / 생성 실행 여부를 호출자가 명시하고 skip이면 보고 실패 또는 명시적 미검증으로 닫으며 캡처 실패를 삼키지 않아야 한다.

- 재현 시나리오: 아침 보고 스크립트를 기본 환경으로 실행한다. 372행 결과는 `generationFlow: skipped-production-identity-contract`, 후보 0장인데 보고 생성은 계속된다.

## MINOR

MINOR: [토큰 위반] `dashboard/src/components/studio/EditOutline.module.css:46` - 새 썸네일 폭을 `44px` 리터럴로 박았다 / `DESIGN.md:882`의 “v37 토큰만”, 885행의 신규·수정 영역 크기 토큰 규칙과 어긋난다 / 승인된 의미 토큰을 사용하거나 썸네일 전용 토큰을 DESIGN 정본에 먼저 추가해야 한다.

- 재현 시나리오: 디자인 시스템의 조작면 크기를 토큰에서 변경한다. 목차 썸네일만 44px에 고정돼 같은 크기 체계와 따로 움직인다.

MINOR: [토큰 위반] `dashboard/src/components/layout/Sidebar.tsx:408` - 데스크톱에서 요소를 치우기 위해 `md:left-[-9999px]` 임의 위치 리터럴을 새로 박았다 / `DESIGN.md:156`의 “임의 px 금지”와 882행의 “v37 토큰만”에 어긋난다 / 의도에 맞는 표준 숨김 또는 접근성 유틸리티를 쓰거나 필요한 의미 토큰을 먼저 정본화해야 한다.

- 재현 시나리오: 데스크톱에서 DOM을 검사한다. RoomFlowNav가 표준 visibility 상태가 아니라 문서 밖 -9999px에 남는다.

MINOR: [회귀 위험] `dashboard/tests/analytics/osmu-code-review-20260914-metrics-lease.regression-1.test.ts:18` - `db: vi.fn()`으로 운영 advisory lock 갈래를 제거한 뒤 process-local `Set`만 검증한다 / PostgreSQL 세션 잠금으로 여러 프로세스를 막는 실제 계약을 증명하지 못한다 / 시험 DB의 독립 reserved connection 두 개로 같은 key 경합, 예외 뒤 unlock, 다른 테넌트 병렬 허용을 검증해야 한다.

- 재현 시나리오: 서로 다른 Node 프로세스 두 개가 같은 테넌트를 동시에 수집하게 한다. 현재 테스트는 한 프로세스 mock만 써 이 결함이 있어도 초록이다.

MINOR: [회귀 위험] `dashboard/tests/api/publish-channel-image-capacity.test.ts:12` - route 소스 문자열에 오류 코드가 있는지만 검사해 실행 불가능한 분기나 공급자 호출 뒤 검증도 통과시킨다 / 외부 발행 전에 이미지 수를 거절한다는 계약을 증명하지 못한다 / 실제 POST로 Threads 2장, Instagram 10장과 11장 경계를 호출하고 공급자 미호출을 검증해야 한다.

- 재현 시나리오: 이미지 수 검사를 공급자 호출 뒤로 옮기되 같은 오류 문자열을 남긴다. 테스트는 통과하지만 초과 이미지가 이미 공급자에 전송된다.

MINOR: [회귀 위험] `dashboard/tests/api/api-read-sweep-dev-concurrency.regression-1.test.ts:11` - 검증기 소스에 네 문자열이 있는지만 검사해 실제 기본 병렬도와 최대 동시 요청 수를 실행하지 않는다 / “기본값은 콜드 컴파일을 한 번에 하나로 제한”한다는 이 테스트 10행 계약과 어긋난다 / 임시 HTTP 서버에서 기본 환경의 최대 동시 요청이 1인지, 명시 환경값이 2부터 12까지만 허용되는지 실행으로 검증해야 한다.

- 재현 시나리오: 네 문자열은 그대로 두고 워커 생성부가 상수 4를 쓰게 바꾼다. 테스트는 통과하지만 개발 서버는 다시 네 경로를 동시에 콜드 컴파일해 멈출 수 있다.

MINOR: [회귀 위험] `dashboard/tests/integrity/dev-server-bundler.contract.test.ts:16` - 감독 스크립트에 허용 명령 문자열이 있고 금지 문자열 하나가 없는지만 확인해 실제 `ensure_app` 실행 인자를 증명하지 않는다 / “감독 복구 경로도 검증된 개발 명령을 사용”한다는 이 테스트 12행 계약과 어긋난다 / `npm`을 기록용 대역으로 둔 종료형 통합 테스트에서 `ensure_app`이 정확히 `npm run dev -- -p 3456`을 실행하고 다른 Next 직접 실행을 하지 않는지 확인해야 한다.

- 재현 시나리오: 허용 문자열을 주석이나 죽은 분기에 남기고 `npm exec next dev -p 3456`을 실제 분기에 추가한다. 현재 테스트는 계속 통과하지만 감독은 검증되지 않은 번들러 경로를 다시 실행한다.

MINOR: [회귀 위험] `dashboard/tests/api/api-read-sweep-method-coverage.regression-1.test.ts:11` - 전수 검증기를 실행하지 않고 GET, HEAD, 리다이렉트, hash 관련 소스 문자열이 존재하는지만 검사한다 / 실제 3xx 실패 종료와 서버, 소스 결합을 검증한다는 테스트 이름에 어긋난다 / 임시 HTTP 서버와 임시 route 트리로 3xx, 새 파일 추가, stale build identity를 실제 실행해 종료 코드를 확인해야 한다.

- 재현 시나리오: 검사 문자열을 주석이나 죽은 코드에 남기고 실행부를 2xx 전용 또는 해시 미검증으로 바꾼다. 테스트는 계속 통과한다.

MINOR: [회귀 위험] `dashboard/tests/integrity/four-room-token-cleanup.regression-1.test.ts:16` - cleanup 함수, 60초, `process.exitCode` 문자열만 검사해 폐기 함수 미호출과 settings 복원 throw 뒤 cleanup skip을 증명하지 못한다 / 임시 자격증명을 항상 폐기한다는 테스트 8행 계약과 어긋난다 / fetch, fs, browser를 주입해 본문 마감, revoke 500, timeout, settings 복원 실패를 실행하고 폐기 시도와 nonzero exit를 검증해야 한다.

- 재현 시나리오: cleanup 함수를 죽은 코드로 옮기거나 settings 복원에서 먼저 throw시킨다. 문자열은 남아 현재 테스트가 통과한다.

MINOR: [회귀 위험] `.github/workflows/deploy-marketing.yml:546` - 공유 배포 머신의 현재 Docker builder 전체를 대상으로 캐시 총량을 8GB로 줄이며 OSMU 프로젝트나 라벨로 범위를 제한하지 않는다 / 여러 서비스를 함께 돌리는 머신에서 한 서비스 배포가 다른 서비스의 빌드 자원과 비용을 침범하지 않아야 한다는 격리 원칙에 어긋난다 / OSMU 전용 builder를 쓰거나 프로젝트 라벨 필터와 최소 보존량을 적용해 정리 범위를 분리해야 한다.

- 재현 시나리오: 같은 builder에 다른 서비스의 재사용 캐시를 8GB 넘게 채운 뒤 OSMU 배포 정리를 실행한다. 다음 다른 서비스 빌드는 캐시가 사라져 콜드 빌드 시간과 네트워크 및 CPU 비용을 다시 지불한다.

## 셀프심문

“내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?” 유료 대표 이미지를 만든 뒤 편집실을 거치면 무료 단색 카드로 바뀌거나, 예약 글이 외부에는 성공했지만 내부 기록 실패 뒤 다시 올라가는 문제다. 검증기가 구빌드 서버와 HTTP 200 논리 실패까지 정상으로 셀 수 있고 고객 토큰으로 전역 공급자 계정 정보가 보이는 것도 직접 관찰했으므로 PASS를 줄 수 없다.

## 4축 판정

- 승인 시안 이탈: 지적 3건.
- 회귀 위험: 지적 39건. MAJOR 32건, MINOR 7건.
- 토큰 위반: 지적 2건.
- 무기록 삭제: 지적 1건.

REVIEW_VERDICT: BLOCK

SKILLS_USED: review
SKILLS_SKIPPED: review 스킬의 자동 수정 단계는 “코드를 수정하지 마라”는 사용자 역할 계약 때문에 실행하지 않았다.

KNOWLEDGE_QUERY: BRAIN `wiki/business/index.md`에서 OSMU, 격리, 동시성, 비용, 발행을 검색해 `idea-zero-one-marketing-studio.md`로 좁혔다. 외부에서는 OWASP API 자원 소비, PostgreSQL advisory lock, Next.js standalone 추적을 조회했다.
HITS_USED: 사업 좌표의 다중 사업체, 돈, 몫, 멱등 제약과 BRAIN의 원본 수집, 채널별 재구성, 예약 발행, 성과 회수 제품 정의를 격리와 과금 판정에 사용했다. OWASP의 실행시간, 프로세스, 요청당 작업량, 제3자 지출 상한과 PostgreSQL의 session lock 의미를 동시성 판정에 사용했다.
HITS_REJECTED: 일반 마케팅 심리, 콘텐츠 후킹, 교육 상품 자료는 이번 코드의 격리와 동시성 판정에 직접 근거가 되지 않아 제외했다.
CONFLICTS: 사용자 지정 v63, `pipeline-state.osmu.md` 최신 승인 핀 v68, `DESIGN.md`의 v64 및 v68 후보 표기가 서로 다르다. 이번 리뷰는 사용자의 명시 지시인 v63을 기본으로 하되 더 최신 확정 요구 원장을 우선했고 디자인 전체 정합은 미검증으로 남겼다.

SOURCES

- `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`
- `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`
- `wiki/거버넌스/요청.md`
- `DESIGN.md`
- `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`
- `pipeline-state.osmu.md`
- `docs/_archive/legacy-20260912/root-docs/prd-openclaw-service-v8.2.1-gpt-codex.md`
- `/Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/index.md`
- `/Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/pmf/idea-zero-one-marketing-studio.md`
- https://cheatsheetseries.owasp.org/cheatsheets/Secure_Code_Review_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html
- https://cwe.mitre.org/data/definitions/362.html
- https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/
- https://www.rfc-editor.org/rfc/rfc9110.html#name-successful-2xx
- https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html
- https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
- https://nextjs.org/docs/app/api-reference/config/next-config-js/output

MODEL: gpt-codex/gpt-5
