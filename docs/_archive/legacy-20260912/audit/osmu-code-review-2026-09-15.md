# OSMU 최근 24시간 코드 공격 리뷰

STAMP

- 생성: 2026-09-15 04:17 KST
- 범위: `acb981ea484a113eaef87ef82f05d4edc43334bf..4692afe3d2030db299a02f18b79e6392e2ad114d`
- 규모: 96 commits, 212 files, +25,381 / -487
- 모델: gpt-codex/gpt-5
- 에이전트: code-reviewer
- 스킬: review
- 판단: 로컬 기본 흐름은 통과했지만 격리, 비용, 발행 멱등성, 복구, 증거 신뢰성 결함이 남아 머지 차단

## MAJOR

MAJOR: [회귀 위험, 돈, 격리] `dashboard/src/proxy.ts:39` - 고객 허용 목록에 AI 안내, 키워드, 이미지, Midjourney, 카드뉴스 경로를 열었지만 각 핸들러는 `effectiveTenantId`, 영속 사용량 예약, 테넌트별 저장소, 호출량 및 동시성 상한 없이 공유 `main` 에이전트를 호출한다 / 과제의 "돈이 새는가, 격리가 뚫리는가" 및 사업 좌표의 고객별 공장 격리 계약과 어긋난다 / 테넌트 신원, 원자적 비용 선예약과 실패 환불, 작업별 저장소, 허용 도구, 테넌트 및 전역 상한을 함께 넣기 전 운영자 전용으로 닫아야 한다.

재현: 유효한 고객 토큰으로 빈 본문을 POST했을 때 `/api/generate-image`와 `/api/card-news/generate`가 각각 HTTP 400을 반환해 프록시를 통과해 핸들러에 도달함을 관찰했다. 유효 본문을 병렬 전송하면 공유 생성기와 유료 도구가 호출자별 예산 없이 실행된다.

MAJOR: [회귀 위험, 격리] `dashboard/src/app/api/generate-image/route.ts:29`, `dashboard/src/app/api/card-news/generate/route.ts:41` - 두 생성 경로가 공용 이미지 폴더를 수정 시각으로 정렬해 호출자의 작업 번호가 아니라 전역 최신 파일 또는 최신 카드 묶음을 돌려준다 / 과제의 "격리가 뚫리는가"와 기반 산출물의 작업 공간별 결과 계약에 어긋난다 / 생성 전에 tenantId와 jobId를 만들고 해당 전용 디렉터리와 manifest만 응답해야 한다.

재현: 테넌트 A와 B의 생성을 겹쳐 실행하면 나중에 폴더를 스캔한 요청이 상대 작업의 최신 파일명과 URL을 받을 수 있다. 응답 선택 코드에는 요청별 식별자 대조가 없다.

MAJOR: [회귀 위험, 격리] `dashboard/src/app/api/higgsfield/status/route.ts:6` - 공유 운영 계정의 이메일, 요금제, 크레딧 잔액, CLI 원문을 고객 응답으로 반환한다 / 과제의 "격리가 뚫리는가"와 고객에게 자기 사용량만 보여 준다는 ADR D-015에 어긋난다 / 이 경로는 운영자 전용으로 닫고 고객에게는 계정 식별 정보가 없는 준비 상태와 자기 사용량만 반환해야 한다.

재현: 지정 작업 공간에 임시 고객 토큰을 발급해 GET한 결과 HTTP 200과 `email`, `plan`, `credits`, `raw` 키가 모두 노출됐다. 임시 토큰 폐기는 HTTP 200으로 확인했다.

MAJOR: [회귀 위험, 격리, 무기록 삭제] `dashboard/src/app/api/video/subtitle/route.ts:118` - 고객 자막 경로가 `resolveGeneratedFile`을 사용하고, 그 함수는 `dashboard/src/lib/storage.ts:91`에서 테넌트 폴더보다 공용 `data/videos`를 먼저 찾는다 / "기존 기능 보존"은 다른 고객이나 공용 자산의 소유권 우회를 허용한다는 뜻이 아니며 작업 공간 격리 계약과 어긋난다 / 고객 경로에서는 소유권이 확인된 테넌트 파일만 허용하고 공용 legacy 파일 이전은 운영자용 마이그레이션으로 분리해야 한다.

재현: 공용 폴더의 파일명을 아는 고객이 자기 토큰으로 자막 POST를 보내면 공용 파일을 읽어 자기 폴더에 파생본을 만들고 서명 URL을 받을 수 있다. 같은 이름이 자기 폴더에도 있어도 공용 파일이 우선된다.

MAJOR: [회귀 위험, 돈, 자원] `dashboard/src/app/api/video/subtitle/route.ts:151` - 고객 요청마다 최대 180초 ffmpeg를 실행하면서 입력 바이트, 실제 영상 길이, 출력 용량, 테넌트 호출량, 전역 및 테넌트 동시 실행 상한이 없다 / 과제의 "돈이 새는가"와 완료 계약의 실제 서비스 보존 조건에 어긋난다 / 영속 큐와 테넌트 1개, 전역 N개 worker 상한, 입력 및 출력 예산, rate limit를 적용해야 한다.

재현: 서로 다른 자막을 넣은 큰 영상을 고객 토큰으로 30개 병렬 POST하면 ffmpeg 프로세스가 요청 수만큼 떠 CPU, 메모리, 디스크를 최대 3분씩 점유한다.

MAJOR: [회귀 위험, 부분 실패] `dashboard/src/app/api/video/subtitle/route.ts:76` - `WORK_REFUSED`를 200으로 정해 글꼴 없음과 ffmpeg 실패를 HTTP 성공으로 돌려준다 / 과제의 "부분 실패를 전체 성공으로 세는 곳" 및 ADR-007의 조용한 실패 금지와 어긋난다 / 입력 거절, 서버 준비 실패, 제한시간 초과를 각각 422, 503, 504로 반환해야 한다.

재현: 글꼴이 없는 환경에서 유효 영상 자막 요청을 보내면 본문은 `{ok:false}`인데 `Response.ok`는 true가 된다. HTTP 상태만 보는 감시기와 호출자는 성공으로 기록한다.

MAJOR: [회귀 위험, 개인정보] `openclaw/extensions/threads-publish/src/threads-publish-tool.ts:156` - 로컬 고객 이미지를 별도 동의와 삭제 계약 없이 공개 `tmpfiles.org`에 업로드한다 / 기반 사업 좌표의 고객 자산 격리와 과제의 격리 검토 계약에 어긋난다 / 자사 테넌트 객체 저장소의 짧은 만료 서명 URL만 쓰고 저장소가 없으면 실패로 닫아야 한다.

재현: `/images/` 로컬 이미지를 Threads로 발행하면 공급자 호출 전에 원본이 제3자 공개 호스트에 복제되고, URL 보유자는 테넌트 인증 없이 읽을 수 있다.

MAJOR: [회귀 위험, 돈, 기능 손상] `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:93` - 캐러셀의 모든 로컬 장이 같은 `instagram/${idempotencyKey}${ext}` R2 키를 사용한다 / v63의 카드뉴스 여러 장 보존 계약과 "사유 없는 삭제" 금지에 어긋난다 / 작업 공간, 시도 번호, 장 순번 또는 콘텐츠 해시를 키에 포함하고 manifest를 검증해야 한다.

재현: 같은 확장자의 로컬 이미지 두 장을 발행하면 둘째 업로드가 첫째 객체를 덮어쓰고 두 public URL이 동일해져 마지막 장 복제본으로 게시된다.

MAJOR: [회귀 위험, 동시성] `openclaw/extensions/threads-queue/src/queue-lock.ts:39` - extension은 `${file}.lock` 디렉터리에 `owner` 파일을 쓰지만 dashboard는 같은 경로를 proper-lockfile 규약으로 잠그며 stale 정리 때 빈 디렉터리 `rmdir`을 기대한다 / 과제의 동시성 검토 계약과 공용 큐 상호운용 계약에 어긋난다 / 두 프로세스가 같은 검증된 잠금 구현과 옵션을 공유하고 잠금 디렉터리에 독자 파일을 남기지 않아야 한다.

재현: extension이 lock 획득 후 강제 종료되면 owner 파일이 남는다. dashboard의 stale 정리는 `ENOTEMPTY`로 실패해 큐 변경이 계속 막힌다.

MAJOR: [회귀 위험, 동시성] `openclaw/extensions/threads-queue/src/queue-lock.ts:50` - stale 여부를 `stat`한 뒤 heartbeat로 mtime이 갱신됐는지 재확인하지 않고 lock 디렉터리를 rename한다 / 과제의 동시성 계약에 어긋난다 / 원자적 fencing을 쓰거나 검증된 단일 lock 구현으로 통합해야 한다.

재현: 작업자 B가 오래된 mtime을 읽은 직후 A가 heartbeat를 갱신해도 B는 그대로 rename하고 새 lock을 얻는다. A와 B가 동시에 queue.json을 써 취소 유실과 중복 발행이 가능하다.

MAJOR: [회귀 위험, 부분 실패] `openclaw/extensions/threads-queue/src/queue-claim.ts:92` - 채널에 `publishing` 시도가 하나라도 있으면 lease 만료와 무관하게 모든 재claim을 영구 거절한다 / ADR-007의 실패 사유와 탈출구 제공 계약에 어긋난다 / publishing lease와 `provider_succeeded`, `provider_failed`, `result_unknown`별 자동 복구 상태머신을 둬야 한다.

재현: 공급자 결과를 기록한 직후 `update_channel` 전에 프로세스를 종료하면 이후 `get_approved`가 영원히 null을 반환해 수동 파일 편집 전까지 게시물이 멈춘다.

MAJOR: [회귀 위험, 동시성, 자원] `openclaw/extensions/threads-queue/src/threads-queue-tool.ts:401` - `limit`과 `leaseMs`를 양수인지밖에 검사하지 않아 전체 큐 또는 수년짜리 lease를 한 호출이 선점할 수 있다 / 과제의 동시성 및 돈 누수 검토 계약에 어긋난다 / 안전 정수 검사, 최대 batch, 최소 및 최대 lease, worker별 active claim 상한을 서버에서 강제해야 한다.

재현: `limit=Number.MAX_SAFE_INTEGER`, `leaseMs=1e12`로 호출하면 승인 큐 전체를 한 worker가 장기 claim한다. `Infinity` lease는 날짜 변환 예외도 낸다.

MAJOR: [회귀 위험, 부분 실패] `openclaw/extensions/threads-publish/src/threads-publish-tool.ts:164` - tmpfiles가 200이지만 URL을 빼먹는 등 공급자 게시 요청 전 실패도 catch에서 `result_unknown`으로 기록한다. Instagram의 업로드 준비 실패도 같은 구조다 / 과제의 부분 실패 분류와 ADR-007의 정확한 실패 이유 계약에 어긋난다 / 공급자 dispatch 전 실패는 definitive failure 또는 pending 복구로, dispatch 뒤 네트워크 불명만 unknown으로 나눠야 한다.

재현: tmpfiles가 URL 없는 JSON을 반환하거나 Instagram R2 자격증명을 비우면 외부 게시를 시도하지 않았는데도 unknown으로 남고, 앞의 publishing 재claim 금지와 결합해 영구 정지한다.

MAJOR: [회귀 위험, 동시성] `openclaw/extensions/threads-publish/src/threads-publish-tool.ts:184` - Threads create와 publish, Instagram create와 publish, X publish 요청에 종료 제한이 없다 / 과제의 동시성과 부분 실패 검토 계약에 어긋난다 / 각 요청에 제한시간과 전체 작업 deadline을 두고 dispatch 전후를 구분해 상태를 기록해야 한다.

재현: 공급자가 연결을 유지한 채 응답을 끝내지 않으면 도구는 publishing 상태와 claim을 무기한 보유하고 자동 복구도 못 한다.

MAJOR: [회귀 위험, 복구 누락] `dashboard/src/app/api/schedule/publish-due/route.ts:149` - 실제 claim은 lease가 만료된 `processing`도 회수하지만 전체 테넌트 탐색은 `scheduled`만 찾는다 / 과제의 회귀 검토와 ADR-007의 탈출구 계약에 어긋난다 / tenant discovery와 claim predicate를 하나의 정본으로 공유해야 한다.

재현: 어떤 테넌트의 유일한 예약을 만료된 processing으로 두고 outbox를 비운 뒤 운영자 sweep을 호출하면 `tenantCount=0`으로 끝나고, tenant_id를 직접 넣을 때만 회수된다.

MAJOR: [회귀 위험, 동시성, 돈] `dashboard/src/app/api/schedule/publish-due/route.ts:100` - 공급자 호출 직전에 lease를 한 번 갱신할 뿐 호출 중 heartbeat와 fence가 없다 / 과제의 동시성과 돈 누수 검토 계약에 어긋난다 / 공급자 제한시간을 lease보다 짧게 두고 heartbeat, 영속 attempt, provider idempotency 또는 readback을 결합해야 한다.

재현: X 또는 Facebook 응답을 15분 넘게 지연한 뒤 둘째 cron을 실행하면 둘째 worker가 만료 예약을 회수해 같은 글을 다시 보내고 첫째도 뒤늦게 성공할 수 있다.

MAJOR: [회귀 위험, 부분 실패, 돈] `dashboard/src/app/api/schedule/publish-due/route.ts:136` - 외부 게시 성공 뒤 `recordPublishedPost`가 실패하면 예외가 전파돼 finish가 실행되지 않고 예약은 processing에 남는다 / 과제의 "부분 실패를 전체 성공으로 세는 곳"과 중복 과금 방지 계약에 어긋난다 / 외부 호출 전 영속 attempt를 만들고 기록 실패는 uncertain으로 fence한 뒤 readback으로만 재시도해야 한다.

재현: 공급자가 200을 반환한 직후 published_posts INSERT를 실패시키면 15분 뒤 새 worker가 같은 예약을 다시 게시한다.

MAJOR: [회귀 위험, 부분 실패] `dashboard/src/app/api/schedule/publish-due/route.ts:140` - `finishSchedule`은 worker token 조건 UPDATE의 영향 행을 확인하지 않는데도 결과를 처리 완료 목록에 넣는다 / 과제의 부분 실패 성공 오인 금지에 어긋난다 / `RETURNING id`가 정확히 1행인지 확인하고 0행이면 ownership_lost로 처리해 processed에서 빼야 한다.

재현: 첫 플랫폼 성공 뒤 worker token을 바꾸면 다음 lease 확인은 실패하고 finish UPDATE는 0행이지만 응답에는 여전히 해당 schedule이 partial 또는 published로 들어간다.

MAJOR: [회귀 위험, 부분 실패] `dashboard/src/app/api/schedule/publish-due/route.ts:66` - tenant와 operator 응답이 모든 schedule의 failed, partial, uncertain 상태와 무관하게 항상 `ok:true`, HTTP 200이다 / 과제의 "부분 실패를 전체 성공으로 세는 곳"과 어긋난다 / failed 및 partial 수치를 집계하고 `ok:false` 또는 HTTP 207 이상의 명시적 계약을 사용해야 한다.

재현: 한 채널을 429 또는 미연결로 실패시키고 다른 채널을 성공시키면 schedule 내부는 partial이어도 cron 최상위는 성공으로 끝난다.

MAJOR: [회귀 위험, 부분 실패, 돈] `dashboard/src/app/api/schedule/publish-due/route.ts:316` - 공급자 예외 catch가 `failureKind`를 버려 응답 단절 뒤 실제 게시된 결과를 definitive failure처럼 기록한다 / 과제의 부분 실패 분류 및 중복 과금 방지 계약에 어긋난다 / POST dispatch 뒤 네트워크 예외는 indeterminate로 저장하고 provider readback 없이는 재발행하지 않아야 한다.

재현: 공급자가 게시를 수락한 직후 연결을 끊으면 fetch가 throw하고 schedule은 failed로 닫힌다. 사용자가 재시도하면 같은 글이 중복 게시된다.

MAJOR: [회귀 위험, 무기록 삭제] `dashboard/src/app/api/publish/route.ts:672` - Instagram 진행 중 저장한 `provider_meta.instagramAttempt`를 종료 UPDATE가 첫 댓글 객체 또는 빈 객체로 통째로 덮어쓴다 / 과제의 사유 없는 삭제 금지와 결과 불명 복구 계약에 어긋난다 / JSONB 병합으로 진행 식별자를 보존하고 확정적으로 조정 완료한 경우에만 지워야 한다.

재현: 캐러셀 첫 자식 컨테이너 생성 후 둘째 요청을 끊으면 진행 콜백이 저장한 childIds가 최종 UPDATE에서 사라져 공급자 대조가 불가능해진다.

MAJOR: [회귀 위험, 동시성, 돈] `dashboard/src/app/api/publish/route.ts:422` - 만료 in_progress 회수는 old reserved_at만 CAS하고 기존 owner의 heartbeat나 fencing token이 없다. 기존 owner의 완료 UPDATE도 tenant와 id만 본다 / 과제의 동시성 및 돈 누수 계약에 어긋난다 / owner token과 generation을 저장하고 완료 UPDATE까지 동일 token으로 fence해야 한다.

재현: 첫 publish가 lease를 넘긴 동안 둘째 요청이 공급자에서 아직 글을 못 찾아 예약을 회수하면 두 요청이 모두 게시할 수 있고 DB에는 마지막 writer만 남는다.

MAJOR: [회귀 위험, 동시성, 돈] `dashboard/src/app/api/publish/route.ts:473` - 이미 게시된 본문의 첫 댓글 복구가 별도 원자 예약 없이 바로 공급자 호출로 간다 / 과제의 동시성과 돈 누수 검토 계약에 어긋난다 / first_comment 전용 in_progress, owner token, idempotency unique claim을 두고 완료를 fence해야 한다.

재현: failed 상태의 같은 댓글을 두 요청이 동시에 복구하면 둘 다 같은 상태를 읽고 댓글을 두 번 게시한다.

MAJOR: [회귀 위험, 부분 실패] `dashboard/src/app/api/publish/route.ts:494` - 첫 댓글 복구가 실패해도 본문 기준 `ok:true`, HTTP 200을 유지하며 최초 발행도 같은 방식으로 partial을 성공 응답에 싣는다 / 과제의 "부분 실패를 전체 성공으로 세는 곳"과 어긋난다 / 본문 성공과 댓글 실패를 최상위 실패 또는 HTTP 207 계약으로 강제하고 모든 호출자가 이를 처리해야 한다.

재현: 본문은 성공하고 첫 댓글은 429가 되게 하면 응답은 `ok:true, partial:true`여서 status만 보는 호출자는 전체 발행을 완료로 기록한다.

MAJOR: [회귀 위험, 격리] `dashboard/src/lib/metrics-collector.ts:635` - 플랫폼 기본 계정 자격증명 하나로 account_id가 다른 모든 게시물의 성과를 조회한다 / 과제의 격리 검토와 ADR D-015의 자기 사용 이력 계약에 어긋난다 / 대상을 platform과 account_id로 묶어 정확한 계정 자격증명을 조회하고 계정 불일치 때 retire하지 않아야 한다.

재현: 같은 테넌트에 Threads A와 B를 연결하고 B 게시물 성과를 수집하면 A 토큰으로 B 게시물을 조회해 실패하고 B 게시물을 `post_not_in_account`로 잘못 retire할 수 있다.

MAJOR: [회귀 위험, 돈, 자원] `dashboard/src/lib/metrics-collector.ts:258` - 7개 플랫폼 대상 쿼리에 LIMIT와 cursor가 없고 실패 시 `next_attempt_at` 또는 backoff를 저장하지 않는다 / 과제의 돈 누수와 부분 실패 검토 계약에 어긋난다 / bounded batch, continuation cursor, attempted_at, Retry-After 및 지수 backoff, 전체 deadline을 넣어야 한다.

재현: stale 게시물 10,000건과 provider 429를 만든 뒤 성과 요청을 반복하면 매번 전체 대상이 다시 공급자 호출에 들어가 quota와 응답 시간을 소진한다.

MAJOR: [회귀 위험, 동시성, 자원] `dashboard/src/lib/metrics-collector.ts:735` - Threads 성과 fetch에 timeout이 없고 collect가 끝날 때까지 전용 PostgreSQL advisory lock 연결을 보유한다 / 과제의 동시성 및 부분 실패 검토 계약에 어긋난다 / provider별 AbortSignal, 전체 collection deadline, timeout 후 backoff를 적용해야 한다.

재현: Threads endpoint가 응답을 끝내지 않으면 수집 promise와 예약 DB 연결이 계속 살아 있고 같은 테넌트의 이후 수집은 계속 `collection_in_progress`가 된다.

MAJOR: [승인 시안 이탈, 회귀 위험] `dashboard/src/components/home/PerformanceDashboard.tsx:58` - 서버가 새로 반환하는 글별 `failureDetails`, `excluded`, GET `coverage`, `metrics_retired`를 화면 타입과 상태가 소비하지 않는다 / 요청 대장의 "어느 글이 왜 실패했는지 말한다"와 ADR-007의 사유 및 탈출구 계약에 어긋난다 / 글 행에 실패 상세, 제외 및 retired 이유를 표시하고 운영자에게만 reinstate 동작을 연결해야 한다.

재현: 서로 다른 원인으로 두 글의 성과 수집을 실패시키면 네트워크 응답에는 글 번호별 상세가 있지만 화면에는 실패 총수와 합성 이유만 보여 어느 글을 복구할지 알 수 없다.

MAJOR: [승인 시안 이탈, 무기록 삭제] `dashboard/src/components/layout/Sidebar.tsx:388` - 데스크톱 사이드바를 56px로 고정하고 `RoomFlowNav`를 화면 밖으로 보내 네 방 흐름 조작을 제거했다 / R176의 "왼쪽 사이드바는 기록(log)이 아니라 유저 흐름을 둔다"와 v63의 "순번, 지난 자리, 지금 자리, 다음 자리" 계약에 어긋난다 / 네 방 흐름을 첫 묶음으로 복원하고 224px와 56px 전환 및 저장 상태를 되살려야 한다.

재현: 1440px에서 `/studio?room=edit`를 열면 생성실, 편집실, 발행실, 성과실 흐름이 보이지 않고 확장 수단도 없다. 터치 영역과 서체를 고친다는 커밋 설명에는 이 삭제가 기록되지 않았다.

MAJOR: [승인 시안 이탈] `dashboard/src/components/studio/EditOutline.tsx:130` - 활성 카드나 장면에 보이는 위아래 순서 이동 단추를 다시 넣었다 / R190의 "영상 목차의 '앞으로 / 뒤로' 단추를 뺀다"와 v63의 드래그 및 키보드 이동 계약에 어긋난다 / 보이는 방향 단추를 제거하고 드래그와 `Alt+ArrowUp/Down`만 유지해야 한다.

재현: 편집실에서 카드뉴스나 영상을 열고 둘째 목차 항목을 누르면 `▲`, `▼` 단추가 나타난다.

MAJOR: [승인 시안 이탈] `dashboard/src/components/studio/StudioRooms.module.css:21` - 편집실 좁은 목차 상태를 컨테이너가 아니라 브라우저 `@media` 폭으로 판단한다 / DESIGN.md의 "이 부품들의 반응형은 @media가 아니라 @container frame으로 쓴다" 계약에 어긋난다 / 프레임 또는 편집 작업대의 named container를 기준으로 144px 규칙을 적용해야 한다.

재현: 브라우저는 1024px 이상으로 두고 편집실 컨테이너만 390px로 제한하면 좁은 상태가 발동하지 않아 320px 높이가 남는다.

MAJOR: [승인 시안 이탈, 사족 문구] `dashboard/src/components/home/PerformanceRoom.tsx:720` - "반응이 비어 있으면 연결된 채널에서 최신 성과를 다시 확인하세요."를 정상 상태에도 조건 없이 상시 노출한다 / v63의 "화면 구조와 이름으로 알 수 있는 것을 문장으로 또 말하면 사족"과 DESIGN.md의 판단 값 또는 누를 이름만 남긴다는 계약에 어긋난다 / 비어 있거나 수집이 실패한 기존 상태 메시지에서만 원인과 행동을 보여야 한다.

재현: 반응과 성과가 이미 채워진 정상 상태에서도 안내 문장이 계속 보인다.

MAJOR: [회귀 위험, 배포] `dashboard/next.config.ts:25` - Next build가 TypeScript 오류를 무시하고 deploy workflow는 별도 CI 성공에 의존하지 않은 채 Dockerfile의 `npm run build`만 실행한다 / 과제의 필수 `npx tsc --noEmit` 및 거짓 완료 금지와 어긋난다 / Docker build 또는 deploy 직전에 같은 SHA의 타입 검사를 필수화하고 CI 성공에 배포를 묶어야 한다.

재현: 타입 오류가 있는 ref에서 deploy workflow를 수동 실행하면 Next build가 오류를 무시하고 이미지 생성과 compose 단계로 진행할 수 있다.

MAJOR: [회귀 위험, 증거] `dashboard/scripts/verify-api-read-sweep.mjs:130` - 2xx 상태만으로 정상 판정해 `{ok:false}` 실패 본문도 성공으로 센다 / 과제의 "부분 실패를 전체 성공으로 세는 곳"과 "거짓 완료 금지"에 어긋난다 / 경로별 성공 스키마와 content-type을 검사하고 최소한 2xx의 `ok:false`와 오류 코드를 실패로 분류해야 한다.

재현: 자막 경로처럼 HTTP 200 `{ok:false, code:"SUBTITLE_FONT_MISSING"}` 응답을 읽기 대상에 두면 sweep은 정상으로 표시하고 exit 0이 된다.

MAJOR: [회귀 위험, 증거] `dashboard/scripts/verify-api-read-sweep.mjs:156` - 시작 때 한 번 만든 파일 목록의 전후 해시와 listener PID만으로 현재 커밋을 검증했다고 판정한다 / 과제의 "완료 = 증거" 및 거짓 완료 금지에 어긋난다 / 고정 커밋의 격리 checkout에서 서버를 직접 띄우고 build commit과 digest를 health에서 대조하며 종료 때 목록도 다시 열거해야 한다.

재현: dirty tree에서 실행하거나 이전 커밋 서버를 둔 채 HEAD만 이동해도 PID와 전후 해시는 같아 새 HEAD 증거로 기록된다. 실행 중 새 route 파일을 추가해도 최초 목록 밖이라 누락된다.

MAJOR: [회귀 위험, 증거] `dashboard/scripts/capture-studio-fe3-playwright.mjs:15` - 핵심 생성 요청은 `FE3_RUN_GENERATION=1`일 때만 실행되고 기본 실행은 후보 0개와 skipped 표식을 남긴 채 성공한다 / 과제의 localhost 실제 요청 의무와 "mock 통과는 증거가 아니다"에 어긋난다 / 생성 흐름을 E2E 필수로 만들거나 캡처 전용 모드를 별도 스크립트와 산출물로 분리해야 한다.

재현: 필수 토큰만 넣어 기본 실행하면 생성 API가 500이어도 요청 자체가 발생하지 않고 프로세스가 성공 종료한다.

MAJOR: [회귀 위험, 증거, 정리 실패] `dashboard/scripts/verify-four-room-ui-e2e.mjs:228` - finally의 첫 설정 복구가 throw하면 뒤의 임시 고객 토큰 폐기와 브라우저 종료가 실행되지 않는다 / 과제의 실제 증거 및 자격증명 정리 계약에 어긋난다 / 각 cleanup을 독립 try/finally 또는 allSettled로 실행하고 모든 실패를 모아 비정상 종료해야 한다.

재현: 검증 중 settings 파일을 읽기 전용으로 바꾸면 복구 쓰기에서 빠져 임시 토큰과 Chromium이 남는다.

MAJOR: [회귀 위험, 빌드] `openclaw/scripts/tsdown-build.mjs:493` - 새 `RAYON_NUM_THREADS` 주입과 heap 정책을 기존 테스트 계약과 함께 갱신하지 않았다 / 과제의 필수 테스트 통과와 거짓 완료 금지에 어긋난다 / 정책을 승인한 뒤 예상값과 1, 4, 7, 8GiB 경계 및 명시 환경 변수 보존 테스트를 동기화해야 한다.

재현: `pnpm exec vitest run test/scripts/tsdown-build.test.ts --config test/vitest/vitest.tooling.config.ts --maxWorkers=1`을 실행해 26건 중 5건 실패를 직접 관찰했다. 세 건은 6400 기대 대비 3584, 두 건은 새 `RAYON_NUM_THREADS` 때문에 실패했다.

MAJOR: [회귀 위험, 자원] `openclaw/scripts/tsdown-build.mjs:431` - cgroup 메모리가 작아도 최소 V8 heap을 2048MB로 강제해 1GiB 제한보다 큰 heap을 설정한다 / 과제의 돈과 자원 누수 검토 계약에 어긋난다 / heap 상한이 실제 cgroup 예산을 넘지 않게 하고 안전 최소보다 작으면 명시적으로 preflight 실패해야 한다.

재현: 1GiB와 4GiB cgroup 입력 모두 `--max-old-space-size=2048`이 되어 1GiB 환경에서는 시작부터 제한보다 큰 heap을 예약한다.

MAJOR: [회귀 위험, 자원] `openclaw/scripts/tsdown-build.mjs:639` - `OPENCLAW_TSDOWN_TIMEOUT_MS`가 없으면 제한시간이 null이고 child 종료 timer를 만들지 않는다. deploy와 Dockerfile에도 기본값이 없다 / 무인 worker의 끝나지 않는 명령 금지와 어긋난다 / 유한 기본 deadline, process group SIGTERM 및 SIGKILL, timeout 행동 테스트를 넣어야 한다.

재현: tsdown 또는 rolldown child가 deadlock하면 heartbeat는 로그만 쓰고 self-hosted runner를 무기한 점유한다.

MAJOR: [회귀 위험, 자원] `openclaw/Dockerfile:129` - 최종 이미지에서 쓰지 않는 자체 extension 70개를 full build한 뒤 prune한다 / 과제의 돈 누수 검토 계약과 build가 실행 경로를 직접 검증해야 한다는 완료 조건에 어긋난다 / 실제 runtime dependency를 검증한 source build allowlist로 필요한 core와 plugin만 빌드해야 한다.

재현: clean gateway image build의 peak RSS를 보면 최종적으로 버릴 extension의 컴파일 비용을 먼저 지불해 이미 관찰된 VM exit 137 위험을 되풀이한다.

MAJOR: [회귀 위험, 부분 실패] `dashboard/src/app/studio/page.tsx:543` - 발행실의 provider 계정 조회를 timeout 없는 `Promise.all`로 묶어 한 채널 무응답이 다른 모든 정상 채널을 잠근다 / v63의 플랫폼별 독립 상태와 과제의 부분 실패 격리 계약에 어긋난다 / provider별 timeout과 allSettled식 독립 반영, 점진적 렌더링을 사용해야 한다.

재현: `/api/channels/x/accounts`만 응답을 보류하고 발행실에 들어가면 나머지 계정 응답이 끝나도 `accountsLoaded`가 false로 남아 전체 발행 선택이 잠긴다.

MAJOR: [회귀 위험, 런타임] `dashboard/src/lib/anthropic.ts:34` - Claude CLI 후보를 `existsSync`만으로 골라 디렉터리 또는 실행 권한 없는 파일도 확정하고 모듈 로드 때 한 번 고정한다 / 지난 24시간 수정 목적 "감독 실행환경 CLI 경로 복구"와 실제 실행 검증 계약에 어긋난다 / `stat().isFile()`과 실행 권한을 검사하고 ENOENT 및 EACCES에서 다음 후보와 PATH를 순차 시도해야 한다.

재현: 첫 후보 위치에 비실행 파일을 두고 PATH 뒤에 정상 CLI를 둔 채 서버를 시작하면 첫 후보가 선택돼 spawn이 EACCES로 실패하고 정상 후보로 넘어가지 않는다.

## MINOR

MINOR: [토큰 위반] `dashboard/src/components/studio/EditOutline.module.css:46` - 공용 `--control-touch`가 있는데도 `width: 44px`를 직접 박았다 / DESIGN.md의 시각값 리터럴 금지와 조작 영역 토큰 계약에 어긋난다 / `width: var(--control-touch)`를 사용해야 한다.

재현: `--control-touch` 값을 바꿔도 목차 썸네일 폭만 44px로 남아 공용 토큰 변경을 따르지 않는다.

MINOR: [회귀 위험, 부분 실패] `dashboard/src/lib/metrics-collector.ts:846` - TikTok batch 실패는 글마다 failure detail을 쌓지만 failure code count는 batch당 한 번만 올린다 / 같은 응답의 `failed`, `failureDetails`, `failures[].count`가 한 기준이어야 한다는 API 계약과 어긋난다 / 글별로 집계하거나 details에서 count를 파생해야 한다.

재현: TikTok 대상 3개에서 batch API 500이면 `failed=3`, detail 3개인데 failures count는 1이다.

MINOR: [회귀 위험, 테스트 실효성] `dashboard/src/lib/anthropic-runtime.regression-1.test.ts:13` - resolver와 spawn을 실행하지 않고 관련 문자열 존재만 확인한다 / 과제의 mock 통과는 증거가 아니라는 규율과 어긋난다 / 제한된 HOME 및 PATH와 임시 실행 파일로 실제 선택과 spawn fallback을 관찰해야 한다.

재현: spawn을 다시 `spawn("claude")`로 바꾸고 resolver 선언을 죽은 코드로 남겨도 테스트가 통과한다.

MINOR: [회귀 위험, 테스트 실효성] `dashboard/tests/contracts/osmu-code-review-20260914-qa-deadline.regression-1.test.ts:8` - 전체 제한시간과 정리 코드를 실행하지 않고 상수 및 함수 이름 문자열만 찾는다 / 과제의 끝나지 않는 명령 금지와 완료 증거 계약에 어긋난다 / 일부러 멈추는 로컬 서버와 작은 timeout으로 subprocess의 wall-clock 상한과 정리를 관찰해야 한다.

재현: timeout 전달을 끊고 문자열을 주석이나 dead helper에 남겨도 테스트는 통과하지만 실제 스크립트는 멈춘 서버에서 예산을 넘긴다.

MINOR: [회귀 위험, 테스트 실효성] `dashboard/tests/analytics/osmu-code-review-20260914-metrics-lease.regression-1.test.ts:18` - DB를 mock해 test 전용 process-local Set만 검사하고 실제 advisory lock은 소스 문자열로 확인한다 / 과제의 실제 동시성 증거 계약에 어긋난다 / 실제 PostgreSQL의 서로 다른 connection 또는 process로 동일 tenant 경합, 다른 tenant 병렬, 예외 뒤 unlock을 검증해야 한다.

재현: production advisory lock 키 또는 reserved connection 보유를 깨뜨려도 process-local Set 테스트는 녹색이다.

MINOR: [회귀 위험, 자원] `.github/workflows/deploy-marketing.yml:545` - 공유 builder 전체에 `docker builder prune -af --keep-storage=8GB`를 실행해 다른 서비스 cache까지 제거할 수 있다 / 범위를 넘지 말라는 작업 계약과 공유 runner 격리 원칙에 어긋난다 / OSMU 전용 builder 또는 정확한 cache scope와 보존 정책을 사용해야 한다.

재현: 같은 builder에 다른 서비스 cache를 8GB 이상 둔 뒤 OSMU deploy를 실행하면 다음 타 서비스 build가 cold build가 된다.

MINOR: [회귀 위험, 동시성] `dashboard/src/app/studio/page.tsx:1251` - 최대 12개 채널 발행을 브라우저에서 한 번에 `Promise.all`로 시작한다 / 플랫폼별 독립 결과 계약은 유지되지만 서버 및 공급자 동시성 예산이 없다 / 2개에서 3개 수준의 bounded pool, 요청별 deadline, settled 결과 즉시 반영을 적용하는 편이 안전하다.

재현: 모든 채널을 선택하면 텍스트 9개와 영상 3개 요청이 동시에 시작되고 하나가 무응답이면 전체 완료 상태가 닫히지 않는다.

## 직접 실행 및 관찰 증거

- `GET http://localhost:3456/api/health`: HTTP 200, `ok=true`, `db=up`.
- 무인증 `POST /api/generate-image {}`: HTTP 401.
- 임시 고객 토큰 `POST /api/generate-image {}`: HTTP 400. 고객 허용 목록 통과와 핸들러 도달 확인.
- 임시 고객 토큰 `POST /api/card-news/generate {}`: HTTP 400. 고객 허용 목록 통과와 핸들러 도달 확인.
- 임시 고객 토큰 `GET /api/higgsfield/status`: HTTP 200, `email`, `plan`, `credits`, `raw` 키 노출 확인. 값은 기록하지 않음.
- 임시 고객 토큰 폐기: HTTP 200.
- `cd dashboard && npm run test`: 353 files passed, 2,293 tests passed, 3 skipped, exit 0.
- `cd dashboard && npx tsc --noEmit`: exit 0.
- `dashboard/scripts/verify-basic-flow-e2e.mjs`: 11/11 passed, exit 0.
- `dashboard/scripts/verify-studio-v1-e2e.mjs`: 14/14 passed, exit 0.
- OpenClaw tsdown 표적 테스트: 26건 중 21 통과, 5 실패, exit 1.

## 셀프심문

"내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?"

고객 계정으로 생성기를 눌렀을 때 공유 비용과 결과가 작업 공간별로 분리되지 않는 문제, 캐러셀 여러 장이 마지막 장으로 덮이는 문제, 외부 게시 성공 뒤 기록 실패가 재발행되는 문제가 가장 먼저 드러날 가능성이 높다. 모두 MAJOR로 확인했으므로 PASS를 줄 수 없다.

## 4축 판정

- 승인 시안 이탈: 지적 5건. 네 방 사이드바 흐름 제거, 편집 목차 방향 단추 재등장, 컨테이너 반응형 위반, 성과실 사족 문구, 성과 실패 상세 consumer 누락.
- 회귀 위험: 지적 42건. 격리, 비용, 동시성, 부분 실패, 배포 및 증거 공백을 포함하며 일부 항목은 다른 축과 중복 집계했다.
- 토큰 위반: 지적 1건. `--control-touch` 대신 44px 리터럴 사용.
- 무기록 삭제: 지적 3건. 사이드바 네 방 흐름 제거, Instagram 진행 식별자 덮어쓰기, 캐러셀 앞 장 객체 덮어쓰기. whole-file 삭제와 기록 없는 다른 UI 삭제는 발견하지 못했다.

REVIEW_VERDICT: BLOCK

SKILLS_USED: review
SKILLS_SKIPPED: 자동 수정 단계는 사용하지 않음. 코드 수정 금지 역할 계약이 우선함.

KNOWLEDGE_QUERY: OSMU 사업 좌표, v63 승인 프로토타입, 확정 요구 대장, tenant isolation, resource limits, advisory lock, HTTP 2xx 실패 판정, 빌드 timeout
HITS_USED: BRAIN ZERO-ONE Marketing Studio 정의는 작업 공간별 콘텐츠 공장과 OSMU 루프의 판단 기준으로 사용. repo 사업 좌표와 요청 대장은 고객별 격리, 첫 콘텐츠, 네 방 흐름, 사족 금지의 직접 계약이라 사용. OWASP API4, PostgreSQL advisory lock, Node AbortSignal, proper-lockfile, Docker builder 문서는 자원 상한과 lock 및 cleanup 판정에 사용.
HITS_REJECTED: 다른 벤처의 마케팅 심리 문서는 이 코드의 격리와 동시성 판정에 직접 필요하지 않아 제외. pipeline의 최신 v68 핀은 사용자가 이번 리뷰 기준을 v63으로 명시해 시안 계약 기준으로 채택하지 않음.
CONFLICTS: `pipeline-state.osmu.md`와 `DESIGN.md`의 최신 승인 핀은 v64 또는 v68을 가리키지만 과제는 v63을 명시한다. 이번 리뷰는 사용자 지정 v63을 디자인 계약으로 우선했고, 핀 충돌 자체 때문에 디자인 PASS를 선언하지 않았다.

SOURCES:

- `pipeline-state.osmu.md`
- `DESIGN.md`
- `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`
- `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`
- `wiki/거버넌스/요청.md`
- `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`
- `/Users/sj/Documents/SJ_BRAIN_wiki/wiki/business/pmf/idea-zero-one-marketing-studio.md`
- https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/
- https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
- https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay
- https://github.com/moxystudio/node-proper-lockfile
- https://docs.docker.com/reference/cli/docker/builder/prune/

MODEL: gpt-codex/gpt-5
