<!--
STAMP
line: osmu
created_at: 2026-09-17 04:18 KST
model: gpt-codex/gpt-5
agent: code-reviewer
skills: review
scope: 2026-09-16 04:04 KST부터 2026-09-17 04:04 KST까지 착륙한 커밋과 7cc7f848..93d1da1 순변경
basis: pipeline-state.osmu.md approved_artifacts, DESIGN.md v37, 지정 v63 프로토타입, v68 승인 핀, 회장 요구 대장, 사업 좌표
benchmarks: Google YouTube resumable upload, Microsoft transactional outbox
deliberation: 외부 공급자 성공과 내부 확정, 제외된 채널과 완료 상태, 멱등 키와 실제 페이로드를 따로 공격했다.
-->

# OSMU 최근 24시간 코드 공격 리뷰

한 줄 결론: MAJOR 6건이다. 채널 제외와 내부 기록 실패를 전체 성공으로 닫고, YouTube 재개 정보와 멱등 키가 실제 발행 의도를 보존하지 못하므로 머지를 막아야 한다.

## 범위와 계약

- 검토 창: 2026-09-16 04:04 KST부터 2026-09-17 04:04 KST까지다.
- 커밋과 순변경: 시간 창에 착륙한 43개 커밋, `7cc7f848e2238c1691fc7467cca4bf2bd89e1b2a..93d1da1a6eed1d82f78c95cd4899074b61b5ee8d`, 81개 파일, 추가 5,596줄, 삭제 230줄이다. 삭제 파일은 0개다.
- 승인 핀: `pipeline-state.osmu.md:263-267`의 v68 디자인 허브와 `DESIGN.md` v37이다. 이 승인 블록에는 PRD 핀이 없다.
- 지정 시안: `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`을 실제로 열었다. 최신 승인 v68도 실제로 열었다. 두 시안의 순수 시각 차이는 코드 계약 지적으로 쓰지 않았다.
- 요청과 사업 좌표: 지정 요구 대장은 이동 안내이므로 정본 `wiki/거버넌스/요청.md`를 함께 읽었다. 지정된 사업 좌표 경로는 이동됐고 실제 파일 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`를 읽었다.
- 구현 현황: `docs/구현현황.md`에서 기존 네 방, 발행, 계정 격리와 현재 QA 상태를 확인했다.
- 공유 작업 트리의 미커밋 변경은 검토 범위에 넣거나 되돌리지 않았다.

## 2026-09-17 수정 결과

위험도를 돈과 장부 유실, 중복 외부 발행, 발행 의도 유실, 기본 흐름 오판, 문구 계약 순으로 다시
정렬했다. 원래 리뷰의 BLOCK 판정은 당시 기록으로 보존한다. 아래 여섯 건의 코드 수정은
`1f7fbed4`, `46e75b2d`, `dc5165cf`, `72044c45`에 들어갔다.

| 우선순위 | 원래 지적 | 수정 | 회귀 방지 증거 | 상태 |
|---|---|---|---|---|
| P0 | `usage_events` 실패 은폐로 과금과 쿼터 장부 유실 | 발행 확정과 같은 행의 `provider_meta.usageEvent`에 pending outbox를 원자 기록하고, 행 잠금 안에서 장부 기록과 recorded 전환을 함께 처리한다. 장부 실패는 성공으로 숨기지 않고 재발행 금지 복구 응답을 돌려준다. 사용량 조회가 남은 pending을 재처리한다. | outbox 회귀 4건, 장부 실패 거절 1건, 실 Postgres 중복 방지 통합 1건 | 수정됨 |
| P0 | YouTube 외부 성공 뒤 내부 확정 실패를 전체 성공으로 응답 | 외부 영상 번호와 주소를 보존한 `partial`, `retryPublish:false`, `repair_persistence_only` 응답으로 닫는다. 발행 행 확정과 사용량 relay가 각각 실패하는 경우를 분리했다. | `video-publish-youtube.route.test.ts`의 확정 실패와 장부 실패 거절 2건 | 수정됨 |
| P0 | YouTube resumable 세션 유실과 무조건 stale 재업로드 | 세션 주소, 전체 바이트, 다음 바이트, 파일 해시를 예약 행에 먼저 저장한다. 만료 예약은 공급자 상태를 조회해 완료를 회수하거나 308 범위 다음부터 잇는다. 재개권은 `reserved_at` 비교 갱신으로 한 요청만 가져간다. | 같은 테스트의 세션 재개 1건과 재개 경합 1건 | 수정됨 |
| P1 | YouTube 자동 멱등 키가 태그와 파일 내용을 누락 | 실제 파일 SHA-256, 태그 배열, 제목, 설명, 계정과 작업 공간을 v2 키에 포함했다. | 같은 테스트의 태그 변경과 동일 파일명 내용 변경 2건 | 수정됨 |
| P1 | 한도 초과 채널을 빼고 전체 성공으로 저장 | 차단 채널을 실패 결과에 합쳐 초안과 화면을 `partial`로 저장하고, 성공 채널과 제외 채널을 함께 알린다. | `publish-partial-block.regression-1.test.ts` 6건 | 수정됨 |
| P2 | 부분 발행 안내에 금지된 긴 대시 노출 | 안내를 마침표 두 문장으로 바꾸고 해당 템플릿 문자열 계약을 고정했다. | 같은 테스트의 문구 계약 1건, 전체 UI 긴 대시 계약 | 수정됨 |

지적이 틀렸다고 판단해 제외한 항목은 없다. DB schema, API 계약, 계정 격리 경계는 새로 바꾸지
않고 기존 `published_posts.provider_meta`에 outbox와 업로드 세션을 넣었다.

수정 후 `npm run test`는 374파일과 2,414건 통과, 3건 제외다. `npx tsc --noEmit`, production
build, design lint도 통과했다. 실 Postgres에서 pending relay 두 번이 장부 한 행으로 수렴함을 관찰했다.
localhost 제품 기본 흐름 11/11과 Studio v1 14/14도 실제 요청으로 통과했다. 공개 SNS 실발행과 운영
배포는 실행하지 않았으므로 미검증이다.

## MAJOR

MAJOR: [회귀 위험] dashboard/src/app/studio/page.tsx:1265 — 한도 초과 채널을 `blockedPlatforms`로 실행 대상에서 빼지만 차단 결과를 `status`, `errors`, `errs`에 넣지 않아, 남은 채널만 성공하면 1411행에서 초안을 `published`로 저장하고 1423행에서 `발행 완료`를 보여 준다 / 확정 공격 항목은 "부분 실패를 전체 성공으로 세는 곳"이고 같은 함수는 실제 API 일부 실패를 `partial`로 저장한다 / 차단 채널을 `skipped_by_validation` 또는 실패 결과에 포함하고 초안 상태를 `partial`로 저장하며 완료 알림에 성공과 제외 채널을 함께 표시해야 한다.

재현: Threads와 X를 함께 선택하고 X 본문만 280 가중 문자를 넘긴다. Threads가 성공하면 X는 호출되지 않았는데 초안과 최종 알림은 전체 성공이 된다.

MAJOR: [승인 시안 이탈] dashboard/src/app/studio/page.tsx:1276 — 사용자 토스트에 긴 대시 `—`를 추가했다 / 지정 v63 프로토타입 `openclaw-auto-4room-v63.html:4590`은 "엠대시 0"을 합격 근거로 적고, `DESIGN.md:860`과 확정 요구 `wiki/거버넌스/요청.md:3721`도 긴 대시를 금지한다 / 마침표로 두 문장으로 나누거나 쉼표로 바꾸고 템플릿 문자열도 검사하는 문구 계약을 추가해야 한다.

재현: 두 채널 중 하나만 글자 한도를 넘긴 뒤 발행하면 `한도를 넘은 곳은 빼고 발행합니다 — ...`가 화면에 노출된다. 전체 문구 테스트는 이 문자열을 잡지 못하고 통과한다.

MAJOR: [회귀 위험] dashboard/src/app/api/video/publish/route.ts:332 — YouTube가 돌려준 resumable upload `Location`을 지역 변수에만 두고 예약 행에 저장하지 않으며, 203행은 15분 지난 `in_progress`를 공급자 상태 확인 없이 실패로 바꾼다 / Google 공식 계약은 세션 주소를 저장하고 중단 뒤 상태를 조회해 같은 업로드를 이어가게 한다 / 세션 주소, 바이트 진행 상태, 공급자 식별자를 예약 행이나 영속 outbox에 먼저 저장하고 stale 회수 전에 같은 세션을 조회하고 재개해야 한다.

재현: 업로드 초기화가 세션 주소를 반환한 뒤 프로세스를 종료하거나, PUT이 공급자에서 끝난 직후 응답 수신 전에 연결을 끊는다. 15분 뒤 같은 요청은 기존 세션을 확인할 정보가 없어 새 세션과 새 업로드를 시작할 수 있다.

MAJOR: [회귀 위험] dashboard/src/app/api/video/publish/route.ts:371 — YouTube 외부 업로드 성공 뒤 `published_posts` 확정 UPDATE가 실패해도 377행 catch가 로그만 남기고 382행에서 `ok:true`를 반환한다 / 확정 공격 항목은 "부분 실패를 전체 성공으로 세는 곳"이고 텍스트 발행 경로는 같은 상황을 재발행 금지 복구 상태로 반환한다 / 외부 성공과 내부 확정 실패를 `partial`, `retryPublish:false`, 외부 영상 ID와 함께 반환하고 영속 reconciliation 작업으로 예약 행을 수렴시켜야 한다.

재현: YouTube가 `videoId`를 반환한 직후 DB UPDATE만 실패시킨다. 응답은 성공이지만 예약은 `in_progress`로 남고, 15분 뒤 stale 회수와 재시도가 같은 영상을 다시 올릴 수 있다.

MAJOR: [회귀 위험] dashboard/src/app/api/video/publish/route.ts:181 — 자동 멱등 키가 파일명, 제목, 설명만 해시하고 실제 발행 페이로드의 `tags`와 파일 내용을 제외한다 / 같은 파일의 제목이나 설명 변경만 새 발행으로 인정한다는 172-181행 설명과 74행의 "옵션 중 하나라도 달라지면 새 발행" 계약에 어긋난다 / 정규화한 모든 공급자 메타데이터와 파일 내용 해시를 키에 넣거나, 클라이언트가 발행 시도마다 명시적 멱등 키를 보내게 해야 한다.

재현: `draft_id`와 `idempotency_key` 없이 같은 파일명, 제목, 설명으로 태그만 `one`에서 `two`로 바꿔 두 번 요청한다. 현재 키 계산은 두 요청 모두 `629ee506-39d8-0812-7b27-3bcdfe1321ae`가 되어 두 번째 요청을 기존 발행으로 돌려주고 새 태그를 잃는다.

MAJOR: [회귀 위험] dashboard/src/lib/usage-events.ts:20 — `usage_events` INSERT 실패를 디버그 환경에서만 기록하고 호출자에게 성공으로 돌린다 / `/api/usage`는 `dashboard/src/app/api/usage/route.ts:76-86`에서 이 표만 집계하므로 공급자와 `published_posts`가 성공해도 발행 수와 향후 쿼터 및 과금 장부가 영구히 0으로 남을 수 있다 / 발행 확정과 같은 트랜잭션에 멱등 outbox를 기록하고 relay가 `usage_events`를 확정할 때까지 재시도해야 한다.

재현: 외부 Threads 발행과 `published_posts` 확정은 성공시키고 `usage_events` INSERT만 실패시킨다. API는 성공을 반환하지만 `/api/usage`의 오늘 발행 수는 늘지 않고 재처리할 영속 단서도 없다.

## MINOR

MINOR: 없음.

## 검증 증거

| 검증 | 결과 | 증거 등급 |
|---|---|---|
| localhost health | HTTP 200, DB up, `build_commit=5bdc1f85`. 검토 끝 `93d1da1`과 불일치 | 관찰됨, 최신 커밋 귀속 NG |
| `verify-basic-flow-e2e.mjs` | 실제 localhost 요청 11단계 중 11단계 통과 | 관찰됨, PASS |
| `verify-studio-v1-e2e.mjs` | 실제 localhost 요청 14건 중 14건 통과 | 관찰됨, PASS |
| 지정 작업 공간 `/api/usage` | HTTP 200, source `usage_events`, 오늘과 이번 주 및 이번 달 발행 0, 일별 행 0 | 관찰됨 |
| `npx tsc --noEmit` | 종료 코드 0 | 테스트됨, PASS |
| `npm run test` | 372개 파일, 2,399건 통과, 3건 제외 | 테스트됨, PASS |
| 토큰 계약 | 전체 회귀의 `UI-TOKEN-02`가 직접 시각값 0건으로 통과. 순변경의 조작 높이는 `min-h-control-touch`를 사용 | 테스트됨, 문제없음 |
| 삭제 파일과 기능 제거 | 순변경 삭제 파일 0개. 최근 JSX 삭제는 기존 값을 빼지 않고 잘못 전달하던 override를 제거한 기록이 있다 | 근거 확인, 문제없음 |
| 승인 시안 시각 표현 | 코드와 구조 계약만 검토했다. 렌더 이미지의 미관과 픽셀 편차는 미검토 | 역할 범위상 미검토 |
| 운영 배포와 외부 SNS 실발행 | 실행하지 않음 | 미검증 |

## 셀프심문

질문: 내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?

답: X만 한도를 넘겨 제외됐는데 Threads가 성공한 뒤 전체가 `발행 완료`로 저장되는 문제다. 그 다음은 YouTube 업로드가 끝난 뒤 DB 확정만 실패했는데 성공 응답을 받고, 나중 재시도에서 영상을 한 번 더 올리는 문제다. 둘 다 MAJOR로 확인했으므로 PASS를 줄 수 없다.

SKILLS_USED: review. 승인 계약, 최근 커밋 범위, 실앱 증거와 정적 상태 전이를 분리해 공격 검토하는 데 사용했다.
SKILLS_SKIPPED: 자동 수정은 사용자 금지로 실행하지 않았다. 서브에이전트는 단일 공격 리뷰와 정확한 줄 귀속을 위해 사용하지 않았다.
SOURCES: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol , https://learn.microsoft.com/en-us/samples/azure-samples/cosmos-db-design-patterns/transactional-outbox/ , `pipeline-state.osmu.md`, `DESIGN.md`, v63 지정 프로토타입, v68 승인 프로토타입, `docs/_archive/legacy-20260912/requests/회장-확정-요구사항-대장.md`, `wiki/거버넌스/요청.md`, `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`, `docs/구현현황.md`
MODEL: gpt-codex/gpt-5
KNOWLEDGE_QUERY: BRAIN business index에서 OSMU, 자동화, 돈, 멱등과 1인 운영을 조회하고 레포의 승인 핀, 확정 요구, 사업 좌표와 구현 현황으로 좁혔다. 웹에서는 YouTube resumable upload와 transactional outbox의 공식 자료를 조회했다.
HITS_USED: 사업 좌표의 영속 쿼터와 멱등 계약은 발행 및 과금 상태 전이에 직접 적용했다. Google 공식 문서는 업로드 세션 저장, 상태 조회와 재개 근거로 사용했다. Microsoft 공식 outbox 예시는 발행 성공과 사용량 이벤트의 원자 기록 및 후속 relay 근거로 사용했다.
HITS_REJECTED: BRAIN의 일반 사업 포트폴리오와 교육 문서는 이번 코드 상태 전이에 직접 적용할 계약이 없어 채택하지 않았다. v63과 v68의 순수 시각 차이는 코드 계약 리뷰 범위 밖이라 지적으로 쓰지 않았다.
CONFLICTS: 과제는 v63을 확정 프로토타입으로 명시하지만 `pipeline-state.osmu.md:263-267`의 최신 승인 핀은 v68이다. 두 파일과 DESIGN이 함께 확정한 네 방 및 문구 계약만 적용하고 서로 다른 순수 시각 표현은 판정하지 않았다.

## 4축 판정

- 승인 시안 이탈: 지적 1건
- 회귀 위험: 지적 5건
- 토큰 위반: 문제없음
- 무기록 삭제: 문제없음

REVIEW_VERDICT: BLOCK

## 최근 24시간 고정 범위 최종 재검수 2026-09-17 08시 17분 KST

한 줄 결론: MAJOR 3건이다. 외부 게시 뒤 내부 장부 복구가 화면에서 거짓 완료되고, YouTube 재개 세션은 바뀐 파일을 이어 붙일 수 있으며, 새 ElevenLabs 오류가 한국어 UI 계약을 깨므로 머지를 막아야 한다.

### 범위와 근거

- 고정 검토 창: 2026-09-16 08시 15분부터 2026-09-17 08시 15분 KST까지다.
- 고정 끝 커밋: `b3086d78c9d71ffa73ab129a03f144a3379ce48c`이다. 49개 커밋을 검토했고, 창 직전 기준점 `6a51aaf3`부터의 순변경은 155개 파일, 추가 9,280줄, 삭제 286줄이다. 삭제 파일은 0개다.
- 승인 핀: `pipeline-state.osmu.md:263-267`의 v68 디자인 허브와 `DESIGN.md` v37이다. 이 승인 블록에는 PRD 핀이 없다.
- 지정 입력: v63 프로토타입, 회장 확정 요구 대장, 이동된 실제 사업 좌표 `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`, `docs/구현현황.md`, 결정과 실수 원장을 읽었다. 지정 사업 좌표 원래 경로는 존재하지 않아 이동된 실제 파일로 검증했다.
- 참조 입력: BRAIN business index에서 OSMU, 자동화, 멱등, 돈 장부를 좁혀 읽었다. Google resumable upload, Microsoft transactional outbox, OWASP 멀티테넌트 자료를 공식 출처로 대조했다.
- 실제 앱: localhost:3456의 실행 소스 `7f5564ea` 이후 `b3086d78`까지 제품 소스 변경은 0개다. 따라서 실제 요청 결과는 이번 고정 끝 커밋의 제품 소스에 귀속된다.

### MAJOR

MAJOR: [회귀 위험] dashboard/src/app/studio/page.tsx:1234 — `resolvePublishReconciliation`이 초안에 `save("published")`만 호출한 뒤 1236행에서 복구 대상을 지운다 / v63 프로토타입 `openclaw-auto-4room-v63.html:7481`은 "외부 성공 뒤 기록만 실패했다면 기록만 복구합니다"라고 확정했고, 화면 자체도 `dashboard/src/app/studio/page.tsx:2390`에서 내부 기록 누락을 알리지만 서버의 `published_posts`와 pending 사용량은 전혀 복구하지 않는다 / 테넌트, 발행 행, 외부 식별자를 결속한 서버 복구 동작이 발행 행 확정과 사용량 relay를 끝낸 성공 응답 뒤에만 초안 상태와 경고를 지우게 해야 한다.

재현: YouTube가 영상 번호를 반환한 직후 `dashboard/src/app/api/video/publish/route.ts:647`의 `publication_record` 실패를 만든다. 화면에서 `이미 올라간 것으로 기록하기`를 누르면 초안만 `published`가 되고, 서버 예약 행은 `in_progress`, 외부 영상 번호와 사용량은 미확정인 채 경고가 사라진다.

MAJOR: [회귀 위험] dashboard/src/app/api/video/publish/route.ts:354 — 저장된 YouTube 재개 세션에서 `youtubeUpload.url`만 읽고 552행에 저장한 `fileHash`와 `totalBytes`를 현재 235-236행의 `videoHash`, `videoSize`와 비교하지 않는다 / Google 공식 재개 계약은 한 바이너리의 연속 구간을 같은 세션에 보내는 것인데, 현재 420-435행은 기존 수신 위치만 가져오고 563-575행은 현재 파일의 나머지 바이트를 그대로 보낸다 / 재개 전에 저장된 파일 해시와 크기, 세션 초기화 때의 메타데이터가 현재 요청과 일치하는지 확인하고, 다르면 기존 세션에 바이트를 보내지 않은 채 불확실 상태로 닫아야 한다.

재현: 2,048바이트 영상 A의 앞 1,024바이트가 전송된 뒤 프로세스를 끊는다. 같은 경로를 같은 크기의 영상 B로 바꾸고 예약 기한 뒤 같은 초안을 다시 발행한다. 상태 조회가 `Range: bytes=0-1023`을 주면 영상 B의 1,024-2,047바이트가 영상 A 세션으로 들어가 혼합 파일이 된다.

MAJOR: [승인 시안 이탈] dashboard/src/app/api/elevenlabs-voices/route.ts:24 — 최근 변경이 새 오류 문구 `ElevenLabs voice request failed`를 추가했고 `dashboard/src/components/settings/ElevenLabsSettings.tsx:54`가 이를 그대로 토스트에 노출한다 / `dashboard/CLAUDE.md:15`의 "한국어 UI 텍스트" 계약과 한국어로 확정된 제품 문구 체계에 어긋난다 / API는 안정된 오류 코드만 내리고, 화면은 그 코드를 승인된 한국어 행동 안내로 매핑해야 한다.

재현: 잘못됐거나 만료된 ElevenLabs 자격증명을 넣고 음성 목록을 불러온다. 공급자가 비정상 응답을 주면 화면 토스트에 영문 오류 문구가 그대로 나타난다.

### MINOR

MINOR: 없음.

### 검증 증거

- `npm run test`: 374개 파일, 2,414건 통과, 3건 제외, 종료 코드 0.
- `npx tsc --noEmit`: 종료 코드 0.
- `dashboard/scripts/verify-basic-flow-e2e.mjs`: localhost 실제 요청 11/11 통과.
- `dashboard/scripts/verify-studio-v1-e2e.mjs`: localhost 실제 요청 14/14 통과.
- `/api/health`: HTTP 200, DB up, 실행 제품 소스 `7f5564ea`.
- 지정 작업 공간 `/api/usage`: HTTP 200, source `usage_events`, 모든 기간 발행 0, 일별 행 0. pending 복구 대상이 없는 정상 조회만 관찰했다.
- 테넌트 격리: 최근 변경의 DB 읽기와 쓰기에서 `tenantId` 또는 `effectiveTenantId` 범위를 확인했고 새 우회 경로는 찾지 못했다. 실제 기본 흐름도 지정 작업 공간에서만 통과했다.
- 외부 YouTube 실게시, 공급자 성공 직후 DB 장애 주입, 운영 배포는 실행하지 않아 미검증이다.

### 셀프심문

질문: 내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?

답: YouTube는 이미 올라갔는데 내부 확정이 실패한 뒤 복구 단추를 누르면 장부는 비어 있고 경고만 사라지는 문제다. 실제 서버 복구 없이 성공 토스트를 내므로 이미 MAJOR로 잡았고 PASS를 줄 수 없다.

SKILLS_USED: review. 승인 계약, 고정 시간 창, 정적 상태 전이와 실제 앱 증거를 분리해 공격 검토했다.
SKILLS_SKIPPED: 자동 수정은 사용자 금지로 실행하지 않았다. 서브에이전트는 사용하지 않았다.
SOURCES: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol?authuser=14 , https://learn.microsoft.com/en-us/samples/azure-samples/cosmos-db-design-patterns/transactional-outbox/ , https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html , `pipeline-state.osmu.md`, `DESIGN.md`, 지정 v63 프로토타입, v68 승인 프로토타입, 회장 확정 요구 대장, 이동된 사업 좌표, `docs/구현현황.md`
MODEL: gpt-codex/gpt-5
KNOWLEDGE_QUERY: BRAIN business index에서 OSMU, 마케팅 자동화, 멱등, 돈과 영속 장부를 검색했다. 웹에서는 YouTube 재개 업로드, transactional outbox, 멀티테넌트 격리를 공식 자료로 조회했다.
HITS_USED: 사업 좌표의 영속 쿼터와 멱등 계약을 발행 상태 전이에 적용했다. Google 자료는 같은 바이너리의 연속 업로드 계약에, Microsoft 자료는 외부 성공과 내부 장부 수렴에, OWASP 자료는 모든 데이터 접근의 테넌트 범위 대조에 사용했다.
HITS_REJECTED: BRAIN의 교육과 일반 포트폴리오 문서는 이번 코드 상태 전이에 직접 적용할 계약이 없어 쓰지 않았다. v63과 v68의 순수 시각 차이는 코드 리뷰 범위 밖이라 지적으로 쓰지 않았다.
CONFLICTS: 과제는 v63을 확정 프로토타입으로 지정하지만 `pipeline-state.osmu.md:263-267`은 v68을 최신 승인 핀으로 둔다. 두 산출물과 DESIGN이 함께 확정한 복구 상태와 한국어 문구만 적용했고 서로 다른 시각 표현은 판정하지 않았다.

### 4축 판정

- 승인 시안 이탈: 지적 1건
- 회귀 위험: 지적 2건
- 토큰 위반: 문제없음
- 무기록 삭제: 문제없음

REVIEW_VERDICT: BLOCK

## 수정 커밋 독립 재검수 2026-09-17 05시 20분 KST

수정 범위는 `c0661fb2..46e75b2d`다. 원래 여섯 지적 가운데 제외 채널 상태, 긴 대시,
fallback 멱등 키, 사용량 outbox 네 건은 닫혔다. YouTube 영속 복구와 세션 재개 두 건은
아래 경로가 남아 최종 판정을 바꾸지 않는다.

MAJOR: [회귀 위험] dashboard/src/app/studio/page.tsx:1234 — 외부 게시 뒤 `publication_record` 확정 실패로 받은 `repair_persistence_only`를 화면이 실제 발행 장부 복구 없이 초안 `save("published")`만 호출해 닫고 1236행에서 재발행 금지 상태까지 지운다 / API가 `dashboard/src/app/api/video/publish/route.ts:647`에서 반환한 계약은 내부 `published_posts`와 사용량 장부를 수렴시키라는 것이고, 화면 문구도 `dashboard/src/app/studio/page.tsx:2390`에서 "내부 기록이 남지 않았습니다"라고 명시한다 / 테넌트, 발행 행, 외부 영상 번호를 결속한 서버 복구 동작이 `published_posts`를 `published`로 확정하고 pending 사용량을 relay한 성공 응답을 받은 뒤에만 초안 상태와 재발행 금지 상태를 지워야 한다.

재현: YouTube가 영상 번호를 반환한 직후 `published_posts` UPDATE만 실패시킨다. 화면에서 "이미 올라간 것으로 기록하기"를 누르면 초안만 `published`가 되고, 서버 예약 행은 `in_progress`, 외부 영상 번호와 사용량은 미확정인 채 경고가 사라진다.

MAJOR: [회귀 위험] dashboard/src/app/api/video/publish/route.ts:354 — 저장한 resumable 세션을 재개할 때 `youtubeUpload.url`만 읽고 552행에 저장한 `fileHash`와 `totalBytes`를 현재 235-236행의 `videoSize`, `videoHash`와 비교하지 않는다 / Google resumable 세션은 초기화한 한 영상의 이어 올리기 계약인데, 현재 코드는 같은 `draft_id` 아래 파일이 바뀌어도 기존 세션의 수신 범위 다음에 새 파일 조각을 보낸다 / 재개 전에 저장한 파일 해시와 크기가 현재 파일과 정확히 같아야 한다. 다르면 기존 세션에 바이트를 보내지 말고 상태를 불확실로 닫아 사람이 기존 외부 결과를 확인하게 해야 한다. 제목, 설명과 태그처럼 세션 초기화 때 고정된 메타데이터도 같은 의도인지 검증해야 한다.

재현: 같은 초안으로 2,048바이트 영상 A의 앞 1,024바이트가 전송된 뒤 프로세스를 끊는다. 파일을 같은 크기의 영상 B로 교체하고 15분 뒤 다시 발행한다. 상태 조회가 `Range: bytes=0-1023`을 주면 566-575행이 영상 B의 1,024-2,047바이트를 기존 세션으로 보내 영상 A 앞부분과 영상 B 뒷부분을 결합한다.

## 수정 후 검증 증거

- 표적 회귀: 4파일, 28건 통과. YouTube 기존 재개 테스트는 파일 불변 경로만 검사해 두 번째 MAJOR를 검출하지 못한다.
- 전체 회귀: 374파일, 2,414건 통과, 3건 제외. TypeScript 종료 코드 0. production build 종료 코드 0.
- 실앱: 수정 커밋 `46e75b2d`를 포함한 localhost 실행본에서 기본 흐름 11/11과 Studio v1 14/14 통과. 현재 health 실행 커밋 `f3c3704a`는 현재 브랜치 HEAD `ba7e9f6f`와 다른 계보라 현재 HEAD 귀속은 NG다.
- 외부 SNS 실제 게시와 운영 배포는 미검증이다.

## 수정 후 셀프심문

질문: 내가 PASS를 준다면, 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?

답: YouTube는 실제로 올라갔는데 DB 확정이 실패한 뒤 복구 단추를 누르면 경고만 사라지고 발행 장부는 계속 비어 있는 문제다. 이 문제와 파일 교체 뒤 세션 혼합 업로드가 남아 있으므로 PASS를 줄 수 없다.

## 수정 후 4축 판정

- 승인 시안 이탈: 문제없음
- 회귀 위험: 지적 2건
- 토큰 위반: 문제없음
- 무기록 삭제: 문제없음

SKILLS_USED: review. 수정 주장과 실제 상태 전이, 세션 영속 값의 소비 여부를 대조했다.
SKILLS_SKIPPED: 자동 수정은 사용자 금지로 실행하지 않았다.

REVIEW_VERDICT: BLOCK

## 최종 4축 판정

- 승인 시안 이탈: 지적 1건
- 회귀 위험: 지적 2건
- 토큰 위반: 문제없음
- 무기록 삭제: 문제없음

REVIEW_VERDICT: BLOCK
