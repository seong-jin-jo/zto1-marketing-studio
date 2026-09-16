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
