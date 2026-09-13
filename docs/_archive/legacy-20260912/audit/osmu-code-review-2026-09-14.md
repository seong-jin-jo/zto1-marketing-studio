# OSMU 최근 24시간 코드 공격 리뷰

STAMP

- 생성 시각: 2026-09-14 08:22 KST
- 모델: gpt-codex/gpt-5
- 에이전트: codex-code-review
- 스킬: review
- 감사 범위: `39d32c58510565df52f330d01c0ac0d96cb0256d..fe24d05180b99b1c39e30e915b8557bd8e03d0fe`
- 범위 규모: 커밋 70개, 파일 189개, 추가 11,113줄, 삭제 2,042줄
- 고민 한 줄: 초록 테스트보다 외부 부작용과 내부 기록 사이, 테넌트 신원과 전역 자원 사이, 임차 만료와 재시도 사이의 틈을 우선 공격했다.

## 한 줄 결론

MAJOR 20건으로 머지를 차단한다. 고객 토큰으로 전역 공급자 계정 정보가 실제 노출됐고, 유료 생성 경로의 테넌트 격리 부재, 중복 발행 경쟁 조건, 공개 파일 호스트 반출, 사용량 초기화, 부분 실패 성공 오인이 남아 있다.

## 검토 기준과 증거

- 최근 24시간 기준 시각은 2026-09-14 08:22 KST다. 최초 커밋 `b8eb120d`의 부모부터 종료 커밋 `fe24d051`까지 고정했다.
- `pipeline-state.osmu.md:235`의 최신 승인 핀은 v68이고, `DESIGN.md:908`은 v64를 현재 승인 전체 제품 정본이라고 적는다. 이번 과제는 사용자가 v63을 명시했으므로 `openclaw-auto-4room-v63.html`을 시안 대조 기준으로 썼다. 이 충돌 때문에 디자인 전체 PASS는 금지했다.
- 사용자 지정 `wiki/product/사업좌표-OSMU와-ZERO-ONE.md`는 현재 경로에 없었다. 이동된 정본 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`를 읽었고, “돈이 걸린 계약은 진짜여야 한다”는 제약을 과금 판정에 썼다.
- localhost 관찰: `/api/health` HTTP 200과 DB up. 임시 고객 토큰으로 `/api/higgsfield/status`를 호출하자 HTTP 200과 `email`, `plan`, `credits`, `raw` 키가 반환됐다. 값은 출력하지 않았고 토큰은 바로 폐기했다.
- 필수 검증: `npm run test` 342파일, 2,217건 통과, 3건 제외. `npx tsc --noEmit` 종료 코드 0. 기본 흐름 E2E 11/11, Studio v1 E2E 14/14 통과.
- 커밋 범위에서 삭제된 파일은 0개이고 `git diff --check`는 통과했다. 실행 검증은 다른 세션의 미커밋 변경이 있는 공유 작업 트리에서 수행했으므로 고정 커밋 범위의 안전 증명으로 확대하지 않는다.

## MAJOR

MAJOR: [회귀 위험] `dashboard/src/proxy.ts:39` — 고객 라우트 목록에 `ai-suggest`, `generate-image`, `midjourney`, `card-news`를 열었지만 각 핸들러는 `effectiveTenantId`도 사용량 차감도 없이 전역 `main` 에이전트를 실행한다. 고객 입력을 에이전트 명령문에 그대로 삽입해 도구 범위도 제한하지 않는다 / 과제의 “돈이 새는가, 격리가 뚫리는가”와 사업 좌표의 “돈이 걸린 계약은 진짜여야 한다”에 어긋난다 / 각 라우트를 테넌트 인증, 작업 공간별 저장소, 영속 사용량 예약, 동시 실행 한도, 허용 도구 하나로 묶기 전에는 운영자 전용으로 되돌려야 한다.

- 재현 시나리오: 유효 고객 토큰으로 `/api/ai-suggest/guide` 또는 `/api/midjourney/generate`를 반복 호출한다. `dashboard/src/app/api/ai-suggest/guide/route.ts:35`와 `dashboard/src/app/api/midjourney/generate/route.ts:12`는 고객이나 작업 공간을 식별하지 않고 전역 Docker 에이전트를 최대 120초와 180초 실행한다.

MAJOR: [회귀 위험] `dashboard/src/app/api/card-news/generate/route.ts:41` — 전역 이미지 폴더에서 수정 시각이 가장 최근인 카드 묶음을 호출자의 결과로 반환한다. `dashboard/src/app/api/generate-image/route.ts:34`도 같은 방식으로 전역 최신 이미지를 돌려준다 / 과제의 “격리가 뚫리는가”와 사업 좌표의 여러 사업체 동시 실행 제약에 어긋난다 / 생성 작업 ID와 테넌트 ID를 에이전트 호출에 함께 넣고, 테넌트 전용 폴더에서 그 작업 ID의 산출물만 반환해야 한다.

- 재현 시나리오: 고객 A와 B가 카드뉴스 또는 이미지를 동시에 만든다. A의 에이전트가 끝난 뒤 B의 파일 mtime이 더 최신이면 A 응답이 B의 파일을 가리킨다. 반대 순서도 동일해 결과가 교차한다.

MAJOR: [회귀 위험] `dashboard/src/app/api/higgsfield/status/route.ts:6` — 전역 Higgsfield 계정의 이메일, 요금제, 크레딧, 원문 응답을 그대로 반환하는 운영 상태 경로를 `dashboard/src/proxy.ts:141`에서 고객에게 열었다 / 과제의 “격리가 뚫리는가”에 어긋나며, 실제 고객 토큰 호출에서도 HTTP 200과 `email`, `plan`, `credits`, `raw`가 관찰됐다 / 이 경로는 운영자 전용으로 닫고, 고객 화면에는 계정 정보 없는 작업 공간별 생성 가능 여부와 자기 사용량만 반환해야 한다.

- 재현 시나리오: 지정 작업 공간의 임시 고객 토큰으로 `GET /api/higgsfield/status`를 호출한다. 2026-09-14 08시대 localhost에서 전역 계정 정보 다섯 키가 HTTP 200으로 반환됐다.

MAJOR: [회귀 위험] `openclaw/extensions/instagram-publish/src/instagram-publish-tool.ts:93` — 캐러셀의 모든 로컬 이미지가 같은 `instagram/{idempotencyKey}.{ext}` 키에 순차 업로드돼 같은 확장자의 앞 장을 다음 장이 덮어쓴다 / 과제의 “부분 실패를 전체 성공으로 세는 곳”과 `image_urls` 2개 이상은 캐러셀이라는 이 파일 119행 계약에 어긋난다 / 안정된 시도 키 뒤에 장 순번 또는 콘텐츠 해시를 붙여 장마다 서로 다른 멱등 키를 써야 한다.

- 재현 시나리오: 로컬 PNG 두 장으로 Instagram 캐러셀을 발행한다. 168행 반복문이 같은 키로 두 번 `PutObject`하고 두 URL도 같아져, 공급자는 마지막 장을 두 번 받는다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:100` — 15분 임차를 공급자 호출 직전에 한 번만 연장한다. 공급자 호출이 15분을 넘기거나 멈추면 첫 워커가 여전히 발행 중인데 둘째 워커가 같은 예약을 회수할 수 있다 / 과제의 “동시성”과 중복 발행 금지에 어긋난다 / 공급자 호출에 임차보다 짧은 제한시간을 걸고 heartbeat로 임차를 연장하며, 공급자별 영속 멱등 키 또는 사전 예약 레코드를 둬야 한다.

- 재현 시나리오: 첫 워커의 공급자 응답을 16분 지연시킨 뒤 같은 테넌트 처리기를 다시 부른다. 193행의 만료 조건이 같은 예약을 둘째 워커에 넘기고 두 요청이 공급자에 도달한다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:147` — 새 claim 쿼리는 만료된 `processing` 예약을 회수하지만 운영자 전체 스윕의 테넌트 목록은 여전히 `status='scheduled'`만 찾는다 / 새 복구 기능의 목적과 “기존 동작이 깨질 수 있는 곳” 점검 요구에 어긋난다 / `dueTenantIds`에도 claim과 동일한 만료 `processing` 조건을 넣어 일반 크론이 복구 대상 테넌트를 실제로 호출하게 해야 한다.

- 재현 시나리오: 유일한 예약을 `processing`으로 claim한 뒤 워커를 죽이고 임차를 만료시킨다. 일반 운영자 크론은 해당 테넌트를 목록에 넣지 않아 예약이 영구히 `processing`에 남는다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:136` — 공급자 발행 성공 뒤 `recordPublishedPost`가 실패하면 예외가 상위로 빠지고 예약은 `processing`에 남는다. 임차 회수 뒤 같은 글을 다시 발행한다 / 과제의 “부분 실패를 전체 성공으로 세는 곳”과 외부 성공의 멱등 복구 계약에 어긋난다 / 외부 호출 전에 플랫폼별 영속 예약을 만들고, 기록 실패는 `uncertain`으로 남긴 뒤 공급자 조회로 복구해야 한다.

- 재현 시나리오: 공급자에게 게시가 생성된 직후 408행 INSERT의 DB 연결을 끊는다. 내부 기록은 없고 예약만 회수 가능해져 다음 크론이 같은 콘텐츠를 다시 올린다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:316` — 공급자가 게시를 받았지만 응답 전 연결이 끊긴 예외를 일반 `ok:false`로 바꾼다. `failureKind='indeterminate'`가 없어 405행은 이를 `failed`로 기록한다 / 과제의 “부분 실패를 전체 성공으로 세는 곳”과 이 파일 403행의 “게시 성공 뒤 응답만 끊긴 경우는 uncertain” 주석에 어긋난다 / 외부 전송 뒤 발생한 네트워크 예외는 `indeterminate`로 분류하고 공급자 조회나 안정된 멱등 키로 확정 전 재발행을 막아야 한다.

- 재현 시나리오: 공급자가 게시를 저장한 직후 클라이언트 응답 연결만 끊는다. 316행 catch가 일반 실패를 만들고 사용자는 재시도해 중복 게시한다.

MAJOR: [회귀 위험] `dashboard/src/app/api/schedule/publish-due/route.ts:66` — 개별 예약이 `partial`, `failed`, `uncertain`이어도 최상위 응답은 항상 `ok:true`다. 전체 스윕도 82행에서 동일하다 / 과제의 “부분 실패를 전체 성공으로 세는 곳”에 직접 어긋난다 / 최상위 결과를 예약 상태에서 집계하고 부분 성공은 207, 전체 실패는 비성공 상태와 `ok:false`, 불확정은 별도 코드로 반환해야 한다.

- 재현 시나리오: 예약 플랫폼 하나를 미지원 값으로 두고 처리한다. `scheduleStatus`는 `failed`를 만들지만 HTTP 응답 최상위는 `ok:true`라 크론 감시기가 성공으로 집계한다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-queue/src/queue-claim.ts:90` — 한 채널이 `publishing`이면 임차가 만료돼도 claim을 영구 거부한다. 프로세스가 공급자 호출 전에 죽은 경우 이를 풀거나 조회 복구하는 경로가 없다 / 과제의 “동시성”과 주석의 “워커가 죽어도 큐가 멈추지 않게”에 어긋난다 / `publishing`에 별도 임차와 복구 상태를 두고, 만료 시 공급자 조회 뒤 재시도 또는 `uncertain` 수동 회수로 전이해야 한다.

- 재현 시나리오: `beginQueuePublishAttempt`로 `publishing`을 기록한 직후 공급자 호출 전에 프로세스를 죽인다. claim이 만료돼도 이후 모든 `claimPost`가 null을 반환해 글이 영구 정지한다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-queue/src/queue-lock.ts:49` — stale 판정의 `stat`과 `rename` 사이에 정상 소유자가 heartbeat를 갱신해도 경쟁자가 예전 판정으로 잠금을 훔친다 / 과제의 “동시성”과 이 파일 64행의 “queue.json을 잠근 상태에서” 계약에 어긋난다 / 검증된 단일 잠금 구현을 공유하거나, 소유자와 버전을 원자적으로 비교한 뒤에만 stale 회수하고 획득 뒤 소유권을 재검증해야 한다.

- 재현 시나리오: 경쟁자가 10초 넘은 mtime을 읽은 직후 원 소유자가 heartbeat를 쓴다. 경쟁자는 53행에서 갱신된 잠금도 rename하고 새 잠금을 얻어 두 프로세스가 동시에 queue.json을 갱신한다.

MAJOR: [회귀 위험] `openclaw/extensions/threads-publish/src/threads-publish-tool.ts:156` — 고객의 로컬 이미지를 동의나 테넌트 저장소 경계 없이 공개 제3자 파일 호스트 `tmpfiles.org`에 업로드한 뒤 Threads에 전달한다 / 과제의 “격리가 뚫리는가”와 고객 자산을 자사 경계 밖에 공개하지 않는 기본 개인정보 계약에 어긋난다 / 테넌트 소유 저장소의 만료 짧은 서명 URL을 쓰고, 설정이 없으면 공개 호스트로 우회하지 말고 실패해야 한다.

- 재현 시나리오: 승인 큐의 비공개 `/images/customer-campaign.png`를 Threads에 발행한다. 156행이 파일 원문을 제3자 공개 호스트에 올리며 시스템은 그 공개 사본을 폐기하거나 접근 회수할 수 없다.

MAJOR: [회귀 위험] `dashboard/src/app/api/video/subtitle/route.ts:45` — `ffprobe` 실패를 1080x1920, 6초 영상으로 꾸며 계속 처리하고 성공 응답까지 낸다 / 과제의 “부분 실패를 전체 성공으로 세는 곳”과 41행의 “크기를 짐작으로 박으면 안 된다”에 어긋난다 / 탐침 실패를 명시적 비성공 응답으로 닫고 유효한 폭, 높이, 길이가 확인된 경우에만 인코딩해야 한다.

- 재현 시나리오: 실제 60초 영상에 대해 `FFPROBE_BIN`을 실패시키고 정상 ffmpeg를 둔다. 자막 큐는 6초 기준으로만 배치돼 대부분의 영상에 자막이 없지만 응답은 `ok:true`다.

MAJOR: [회귀 위험] `dashboard/src/app/api/video/subtitle/route.ts:151` — 인증된 고객이 요청할 때마다 최대 180초 ffmpeg 프로세스를 새로 띄우며 테넌트별 또는 전역 동시 실행 한도, 영상 길이 한도, 출력 용량 한도가 없다 / 과제의 “돈이 새는가, 동시성”과 OWASP의 자원 소비 제한 원칙에 어긋난다 / 영속 작업 큐, 테넌트별 동시 실행 1개, 전역 워커 상한, 입력 영상 길이와 용량 상한, 출력 예산을 적용해야 한다.

- 재현 시나리오: 한 고객이 유효한 영상과 서로 다른 자막으로 수십 요청을 병렬 전송한다. 각 요청이 별도 ffmpeg를 최대 180초 점유해 다른 고객 요청과 서버 전체를 고갈시킨다.

MAJOR: [회귀 위험] `dashboard/src/app/api/video/subtitle/route.ts:76` — 글꼴 없음과 인코더 실패를 HTTP 200으로 반환한다. JSON의 `ok:false`를 모르는 프록시, 캐시, 감시기는 실패를 성공으로 기록한다 / 과제의 “부분 실패를 전체 성공으로 세는 곳”과 RFC 9110의 2xx 성공 의미에 어긋난다 / 오류 본문을 보존할 수 있는 422, 503, 504 상태를 사용하고 역방향 프록시의 오류 본문 보존 설정을 고쳐야 한다.

- 재현 시나리오: `SUBTITLE_FONT_FILE`을 없는 파일로 지정한다. 라우트는 `SUBTITLE_FONT_MISSING`을 담지만 HTTP 200을 반환해 일반 HTTP 성공 지표가 작업 완료로 센다.

MAJOR: [회귀 위험] `dashboard/scripts/seed-test-tenants.sql:27` — `--seed` 재실행이 고정 QA 작업 공간의 월 포함량을 100으로, 사용량을 0으로 덮어쓴다. 호출 스크립트는 임의 `DATABASE_URL`을 받고 비시험 DB 차단이 없다 / 과제의 “돈이 새는가”와 사업 좌표의 “몫, 멱등이 실제로 지켜져야 한다”에 어긋난다 / 시험 전용 데이터베이스 표식을 강제 검증하고, 실고객과 분리된 매 실행 임시 테넌트만 초기화해야 한다.

- 재현 시나리오: 고정 작업 공간의 `generations_used`를 80으로 만든 뒤 같은 DB에 `apply-schema.sh --seed`를 실행한다. 30행이 0으로 되감아 추가 생성 100회를 무과금으로 허용한다.

MAJOR: [회귀 위험] `dashboard/src/lib/queue-mirror-outbox.ts:145` — outbox 크기 상한 없이 모든 항목을 매 스윕에서 직렬 DB 동기화하고, 각 항목마다 `find`와 이후 `includes`를 반복한다 / 과제의 “돈이 새는가, 동시성”과 예약 발행을 지연시키지 않는 운영 계약에 어긋난다 / 크기 제한 배치, `Map`과 `Set`, 재시도 시각과 지수 백오프, 다음 커서를 두고 스윕의 최대 작업량을 고정해야 한다.

- 재현 시나리오: DB 장애 동안 outbox 10만 건을 쌓은 뒤 예약 발행 크론을 호출한다. 64행이 먼저 drain을 기다리므로 신규 예약은 시작하지 못하고, 다음 스윕도 실패 항목 전체를 다시 순회한다.

MAJOR: [회귀 위험] `dashboard/src/lib/metrics-collector.ts:108` — 수집 대상은 `account_id`를 읽지 않으며 280행은 플랫폼별 기본 자격증명 하나만 가져온다. 선택 계정 B로 발행한 글도 기본 계정 A의 토큰으로 조회한다 / 과제의 “격리가 뚫리는가”와 사업 좌표의 다중 채널, 다중 사업체 동시 사용 제약에 어긋난다 / 대상마다 `account_id`를 읽고 플랫폼과 계정별로 묶어 그 계정의 자격증명을 정확히 사용해야 한다.

- 재현 시나리오: 같은 작업 공간에서 Threads A를 기본 계정으로 두고 B를 선택해 글을 올린다. 성과 수집은 A 토큰으로 B 글을 조회해 계정 불일치 또는 빈 성과로 저장한다.

MAJOR: [회귀 위험] `dashboard/src/lib/metrics-collector.ts:420` — 성과 조회 실패는 `provider_meta.metricsBlocked`만 갱신하고 `metrics_at`이나 다음 재시도 시각을 남기지 않는다. 108행 조건 때문에 영구 권한 거절도 매 호출마다 즉시 재요청된다 / 과제의 “돈이 새는가”와 공급자 요청 한도 보호에 어긋난다 / `metrics_attempted_at`과 `next_attempt_at`을 영속화하고 403, 계정 불일치에는 긴 백오프, 429에는 공급자 지시를 적용하며 재연결이나 성공 때만 초기화해야 한다.

- 재현 시나리오: 수백 게시물의 성과 권한을 취소하고 `/api/metrics`를 연속 호출한다. 모든 행의 `metrics_at`이 비어 있어 매번 공급자 요청이 재발행되고 정상 게시물까지 429에 묶인다.

MAJOR: [승인 시안 이탈] `dashboard/src/components/studio/EditOutline.tsx:130` — 편집 목차에 별도 `▲`, `▼` 이동 단추를 다시 넣었다 / v63 원문 `openclaw-auto-4room-v63.html:13197`의 “우리도 끌어 옮기게 두고 앞으로 · 뒤로 단추는 걷었다(R190)”와 `DESIGN.md:913`의 “목차 앞으로·뒤로 폐지, 끌어서 옮기기”에 어긋난다 / 별도 방향 단추를 제거하고 승인된 끌어서 순서 변경을 구현하되 키보드 접근성은 드래그 재정렬의 키보드 조작으로 제공해야 한다.

- 재현 시나리오: 편집실에서 목차 항목을 선택한다. 승인안에서 제거된 위와 아래 방향 조작이 각 항목 아래에 다시 나타나며, 끌어서 옮기기 계약은 대체되지 않는다.

## MINOR

MINOR: 없음.

## 셀프심문

“내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?” 고객 계정으로 전역 생성 크레딧과 다른 고객의 최신 이미지가 보이거나, 예약 글이 중복 발행되는 문제다. 실제 고객 토큰으로 전역 Higgsfield 계정 정보가 보이는 것까지 확인돼 PASS를 철회할 여지가 없다.

## 4축 판정

- 승인 시안 이탈: 지적 1건.
- 회귀 위험: 지적 19건.
- 토큰 위반: 문제없음. 변경된 제품 UI의 직접 시각값 계약 테스트가 통과했고, 새 목차 CSS의 44px 조작면과 2px 선택선은 DESIGN.md의 기존 부품 규격 안이다.
- 무기록 삭제: 문제없음. 범위 내 삭제 파일 0개이고, 제거된 주요 JSX와 기능 식별자를 요구 대장 및 커밋 설명과 역대조했으나 사유 없는 기능 삭제는 확인되지 않았다.

REVIEW_VERDICT: BLOCK

SKILLS_USED: review
SKILLS_SKIPPED: review 스킬의 자동 수정 단계는 “코드를 수정하지 마라”는 사용자 역할 계약 때문에 실행하지 않았다.

KNOWLEDGE_QUERY: BRAIN `wiki/business/index.md`에서 OSMU, 자동화, 레버리지 후보를 좁혀 `business/마케팅/concept-자동화-서비스-존재감.md`를 조회했다.
HITS_USED: repo 사업 좌표의 다중 사업체, 공장 동시 실행, 돈과 멱등 제약을 격리와 과금 판정에 사용했다. BRAIN 자동화 존재감 문서의 “핵심 서비스 품질과 실패 복구가 먼저”를 실패 성공 오인 판정에 사용했다.
HITS_REJECTED: 일반 마케팅 심리, 콘텐츠 후킹, 교육 상품 자료는 이번 코드의 격리와 동시성 판정에 직접 근거가 되지 않아 제외했다.
CONFLICTS: 사용자 지정 v63, `pipeline-state.osmu.md` 최신 승인 핀 v68, `DESIGN.md`가 적은 현행 전체 정본 v64가 서로 충돌한다. 화면 계약은 사용자 명시 v63으로 판정했고 디자인 전체 PASS는 금지했다.

SOURCES: [OWASP API4:2023 Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)에서 자원별 최대 실행시간, 메모리, 호출 수 제한을 차용했다. [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)에서 2xx 성공 의미를 실패 상태 판정에 적용했다. [Amazon S3 PutObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html)에서 같은 키 쓰기가 객체를 덮어쓴다는 동작을 캐러셀 재현에 적용했다. 로컬 정본은 `pipeline-state.osmu.md`, `DESIGN.md`, v63 프로토타입, 회장 확정 요구 대장, OSMU 사업 좌표, 최근 24시간 Git diff다.
MODEL: gpt-codex/gpt-5
