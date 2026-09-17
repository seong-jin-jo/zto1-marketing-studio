# OSMU 코드 리뷰 2026-09-18

<!--
STAMP
created_at: 2026-09-18 00:35 KST
model: gpt-codex/gpt-5.6-sol
agent: code-reviewer
skill: review
scope: d04c60a19e4cdefb64dc10b3ff561428cbbeefc8..08b29f312e967effee10a450b8f5569c0127d1f1
basis: pipeline-state.osmu.md approved_artifacts, v63 required prototype, v68 approved design hub, DESIGN.md v37, chairman request ledger, OSMU business coordinates
deliberation: 최근 변경이 도입한 발행 멱등성, 사용량 outbox, 복구 흐름을 성공 경계와 실패 경계 양쪽에서 역추적했다.
-->

## 한 줄 결론

머지 차단이다. MAJOR 10건이 있으며, 사용량 누락, 잘못된 복구 완료 처리, YouTube 계정 및 파일 혼선, 상태 점검의 거짓 성공이 실제 발행과 과금 장부를 어긋나게 할 수 있다.

## 범위와 기준

- 동결 시각: 2026-09-18 00:35 KST
- 커밋 범위: `d04c60a19e4cdefb64dc10b3ff561428cbbeefc8..08b29f312e967effee10a450b8f5569c0127d1f1`
- 범위 크기: 61개 커밋, 258개 파일, 17,697줄 추가, 198줄 삭제
- 제품 코드 범위: `dashboard/src`, `dashboard/scripts`, `dashboard/db` 아래 12개 파일, 711줄 추가, 105줄 삭제
- 커밋된 삭제 파일: 0개
- 최신 승인 핀: `pipeline-state.osmu.md:277`의 v68 디자인 허브와 `DESIGN.md` v37
- 사용자 지정 필수 대조: `openclaw-auto-4room-v63.html:7481`의 "외부 성공 뒤 기록만 실패했다면 기록만 복구합니다."
- PRD 핀: 최신 `approved_artifacts`에 없음. 이 축의 PRD 대조는 미검증이다.
- 시각 표현 편차: 코드 리뷰 역할 범위 밖이므로 미검토했다. 부품, 기능, 흐름, 상태 존재만 판정했다.

## MAJOR

MAJOR: [승인 시안 이탈] dashboard/src/app/studio/page.tsx:1234 - 복구 단추가 발행 원장을 복구하지 않고 초안 상태만 `published`로 저장한 뒤 모든 복구 대상을 지운다. 사용자 지정 시안 `openclaw-auto-4room-v63.html:7481`의 "외부 성공 뒤 기록만 실패했다면 기록만 복구합니다"와 어긋난다. `persistence.reconciliation`의 플랫폼, 발행 행, 외부 식별자, 링크를 서버 복구 API에 보내고 `published_posts`, 승인 큐, 사용량 outbox 중 실패한 단계만 고친 뒤 성공한 플랫폼만 복구 목록에서 제거해야 한다.

- 재현: 외부 게시 뒤 `PUBLICATION_RECORD_FAILED` 또는 `USAGE_RECORD_PENDING` 응답을 만들고 복구 단추를 누른다. `/api/studio/drafts`만 갱신되고 발행 원장 복구 호출은 없는데 `setPublishReconciliations({})`와 성공 안내가 실행된다.

MAJOR: [승인 시안 이탈] dashboard/scripts/osmu-browsers.sh:22 - 새 상태 출력에 체크표, 곱표, 경고표 그림문자를 넣었다. 확정 요구 `wiki/거버넌스/요청.md:2227`의 "이모지 금지"와 어긋난다. `정상`, `오류`, `기동 실패` 같은 한국어 상태어로 바꿔야 한다.

- 재현: `bash dashboard/scripts/osmu-browsers.sh status`를 실행하면 관리자 정상 앞에 체크표, 회원 응답 없음 앞에 곱표가 출력된다. 기동 실패 분기에도 경고표가 출력된다.

MAJOR: [회귀 위험] dashboard/src/app/api/video/publish/route.ts:246 - YouTube 자격증명은 `getChannelCred`가 실제 기본 계정의 `cred.accountId`를 돌려주는데 멱등 키, 예약 행, 충돌 조회, 토큰 갱신은 요청 본문의 `accountId`를 사용한다. 계정을 생략한 정상 요청은 DB에 `account_id = NULL`로 기록되어 기본 계정을 바꾼 뒤에도 이전 계정의 발행이나 업로드 세션으로 합쳐진다. `cred.accountId`를 한 번 확정해 멱등 키, INSERT, SELECT, refresh 호출 모두에 같은 값으로 써야 한다.

- 재현: 기본 YouTube 계정 A로 `account_id` 없이 같은 초안을 발행해 예약을 만든다. 기본 계정을 B로 바꾼 뒤 같은 초안을 다시 요청한다. 요청은 B 자격증명을 읽으면서 A가 만든 `account_id IS NULL` 예약을 조회하거나 재개해 잘못된 계정 결과를 반환하거나 업로드 세션을 불확실 상태로 만든다.

MAJOR: [회귀 위험] dashboard/src/app/api/video/publish/route.ts:354 - 저장한 YouTube 업로드 세션에는 `fileHash`와 `totalBytes`가 있지만 재개 시 URL만 읽고 현재 파일과 동일한지 확인하지 않는다. Google 재개 계약은 저장한 세션 URI로 같은 파일의 다음 바이트를 보내는 방식인데, 현재 코드는 같은 경로의 다른 파일을 기존 세션 뒤에 붙일 수 있다. 재개 상태 조회 전에 저장 해시와 크기를 현재 해시와 크기와 비교하고 불일치면 기존 세션을 재개하지 않아야 한다.

- 재현: 파일 A를 일부 전송해 308과 다음 바이트를 저장한다. 15분 뒤 같은 경로에 길이가 같은 파일 B를 놓고 같은 초안으로 다시 요청한다. 현재 코드는 저장된 `fileHash`를 읽지 않고 B의 남은 바이트를 A 세션에 전송한다.

MAJOR: [회귀 위험] dashboard/src/app/api/tiktok/publish-status/route.ts:87 - 새 사용량 outbox 계약이 YouTube와 Reels 완료 경로에만 연결됐다. TikTok 완료의 두 분기는 `published_posts`를 `published`로 바꾸면서 `publicationUsageOutbox`도 넣지 않고 `recordPublicationEvent`도 호출하지 않는다. 돈이 걸린 발행 사용량이 영구 누락된다. 완료 UPDATE와 같은 트랜잭션에서 pending outbox를 넣고 그 행 식별자로 relay를 호출해야 한다.

- 재현: TikTok 비동기 게시가 `PUBLISH_COMPLETE`가 되도록 상태 API를 호출한 뒤 `/api/usage`를 읽는다. 발행 행은 `published`지만 pending outbox가 없어서 `reconcilePendingPublicationEvents`의 대상이 되지 않고 발행 수가 늘지 않는다.

MAJOR: [회귀 위험] dashboard/src/app/api/schedule/publish-due/route.ts:409 - 예약 발행 성공도 `published_posts`만 추가하고 새 사용량 outbox와 relay를 만들지 않는다. 직접 발행과 예약 발행이 같은 유료 발행인데 예약 경로만 과금 및 한도 장부에서 빠진다. 성공 행 INSERT에 pending outbox를 함께 기록하고 발행 행 식별자로 relay해야 한다.

- 재현: 예약 발행 한 건을 성공시킨 뒤 `/api/usage`를 읽는다. 예약 결과는 `published_posts.status = published`로 남지만 `provider_meta.usageEvent`가 없어 오늘 발행 수가 증가하지 않는다.

MAJOR: [회귀 위험] dashboard/src/app/api/usage/route.ts:73 - outbox relay가 일부 실패해도 라우트는 HTTP 200과 낮은 합계를 반환하며 `publicationRelay.failed`만 덧붙인다. 화면 `dashboard/src/components/home/PerformanceRoom.tsx:561`은 그 실패값을 읽지 않고 숫자를 정상값처럼 표시한다. 부분 실패를 전체 성공으로 보여 과금, 한도, 성과 판단이 틀어진다. relay 실패가 있으면 합계를 확정값으로 표시하지 말고 오류 상태나 명시적 지연 상태를 화면까지 전달해야 한다.

- 재현: pending 발행 행을 둔 상태에서 `usage_events` INSERT만 실패하게 만든다. `/api/usage`는 `publicationRelay.failed > 0`인데도 200을 반환하고 성과실은 낮은 발행 수만 표시한다.

MAJOR: [회귀 위험] dashboard/scripts/osmu-browsers.sh:24 - 관리자와 회원 브라우저 중 하나 또는 둘 다 꺼져 있어도 상태 명령이 항상 0으로 끝난다. 상태 확인의 부분 실패를 전체 성공으로 세어 뒤 실행이 준비되지 않은 브라우저를 정상으로 간주한다. 실패 개수를 모아 하나라도 응답이 없으면 비정상 종료 코드로 끝내야 한다.

- 재현: 2026-09-18 실측에서 관리자 9222는 정상, 회원 9223은 응답 없음이었지만 명령 종료 코드는 0이었다.

MAJOR: [회귀 위험] dashboard/src/lib/oauth-errors.ts:74 - 모든 `Error validating verification code`를 심사 전 테스터 누락으로 단정한다. OAuth 승인 코드는 만료, 폐기, 다른 redirect URI 또는 다른 client에 발급된 경우에도 검증 오류가 날 수 있어 고객을 잘못된 조치로 보낸다. 공급자 오류 코드와 확인된 앱 상태가 함께 있을 때만 테스터 제한으로 분류하고, 그 외에는 승인 코드 만료와 redirect URI를 포함한 중립적 재연결 안내를 해야 한다.

- 재현: `oauthErrorMessage("Error validating verification code: authorization code expired", "Instagram")`를 호출하면 만료 안내 대신 "심사 전 테스터 명단에 없어"라는 문구가 반환된다.

MAJOR: [회귀 위험] dashboard/scripts/verify-four-room-ui-e2e.mjs:235 - 검증기가 공유 작업 공간의 설정 파일 전체를 첫 사용자 상태로 덮어쓴 뒤 마지막에 시작 시점 스냅샷 전체를 다시 쓴다. 이번 변경은 총 제한시간을 10분으로 늘려 그 사이 실제 사용자나 다른 검증기가 저장한 설정을 지울 수 있는 경합 창을 두 배로 키웠다. 전용 QA 작업 공간을 쓰거나, 변경 필드와 버전을 비교해 자기 변경만 조건부 복구해야 한다.

- 재현: 검증기가 line 235를 실행한 뒤 같은 작업 공간에서 설정을 저장한다. 검증 종료 시 line 285가 오래된 `originalSettings` 전체를 써서 중간 저장을 사유 없이 삭제한다.

## MINOR

없음. 발견 건은 모두 발행 정확성, 사용량 장부, 계정 선택, 복구 흐름, 검증 신뢰성에 영향을 주므로 머지 전 수정 대상이다.

## 실행 증거

- `npm run test`: 통과. 374개 파일, 2,416건 통과, 3건 건너뜀, 691.84초.
- `npx tsc --noEmit`: 통과, 종료 코드 0.
- `GET http://localhost:3456/api/health`: HTTP 200, DB 정상, 빌드 커밋 `7c9c9050087394d88e3a73e7b000851833a31e44`. 이 빌드와 검토 HEAD 사이 `dashboard/src`와 `dashboard/db` 차이는 0개였다.
- 작업 공간 `cd1d0a40-540d-4524-9b49-bf2445d82182`의 `/api/usage`: HTTP 200, 오늘 AI 생성 87, 발행 0, relay 처리 0, 실패 0. 임시 고객 토큰은 요청 뒤 폐기했다.
- `dashboard/scripts/verify-basic-flow-e2e.mjs`: 실패. 첫 생성 요청에서 후보 0장, `STUDIO_LLM_PROVIDER_UNAVAILABLE`.
- `dashboard/scripts/verify-studio-v1-e2e.mjs`: 실패. 인증 및 입력 거절 3건은 통과했으나 정상 생성은 기대 201, 실제 200과 `STUDIO_LLM_PROVIDER_UNAVAILABLE`.
- `dashboard/scripts/osmu-browsers.sh status`: 관리자 정상, 회원 응답 없음, 종료 코드 0. MAJOR 재현 완료.
- OAuth 오류 분류 직접 호출: 만료된 승인 코드 문구가 테스터 명단 누락으로 변환됨. MAJOR 재현 완료.
- 추가 줄 정적 검사: 제품 UI의 색상 리터럴 0건, 인라인 스타일 0건, 영문 단추 라벨 0건. 긴 대시 4건은 주석에만 있었고 사용자 노출 문구에는 0건이었다.
- `git diff --check`: 통과.

## 셀프심문

질문: 내가 PASS를 준다면 회장이 dev에서 직접 써보고 발견할 가장 그럴듯한 문제는 무엇인가?

답: TikTok 또는 예약 발행이 성공했는데 오늘 발행 수가 계속 0으로 남거나, 복구 단추가 성공 안내를 낸 뒤에도 실제 발행 원장이 고쳐지지 않는 문제다. 둘 다 위 MAJOR에 포함했으므로 PASS를 주지 않는다.

## 4축 판정

- 승인 시안 이탈: 지적 2건. 기록만 복구해야 하는 흐름이 초안 상태 변경으로 대체됐고, 확정 문구 규칙의 그림문자 금지를 어겼다.
- 회귀 위험: 지적 8건. YouTube 계정 및 파일 혼선 2건, 사용량 누락 및 거짓 성공 3건, 브라우저 상태 거짓 성공 1건, OAuth 오분류 1건, QA 설정 경합 1건.
- 토큰 위반: 문제없음. 변경된 제품 UI 코드에서 새 색상 리터럴과 인라인 스타일을 찾지 못했다.
- 무기록 삭제: 문제없음. 검토 커밋 범위의 삭제 파일은 0개였고, 사라진 화면 부품이나 기능을 diff에서 찾지 못했다.

REVIEW_VERDICT: BLOCK

## 벤치마크 적용

- Google YouTube 재개 업로드 문서: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol?authuser=14
  - 차용: 세션 URI를 저장하고 서버가 돌려준 다음 바이트부터 같은 파일을 이어 보내는 계약.
  - 변경: 저장된 파일 해시와 크기를 현재 파일과 대조하는 애플리케이션 방어를 추가 요구했다.
- PostgreSQL 행 잠금 문서: https://www.postgresql.org/docs/17/explicit-locking.html
  - 차용: outbox relay의 `FOR UPDATE`가 같은 발행 행의 중복 집계를 직렬화하는지 판정했다.
  - 변경: 잠금 자체는 문제없음으로 두고, outbox를 만들지 않는 경로와 실패를 숨기는 API 경계를 지적했다.
- OAuth 2.0 RFC 6749: https://www.rfc-editor.org/info/rfc6749/
  - 차용: `invalid_grant` 계열이 만료, 폐기, redirect URI 불일치, 다른 client 발급 등 여러 원인을 포함한다는 분류 기준.
  - 변경: Meta 심사 전 테스터 상태가 별도 증거로 확인된 경우에만 좁게 안내하도록 요구했다.

SKILLS_USED: review
SKILLS_SKIPPED: 없음

KNOWLEDGE_QUERY: OSMU 사업 좌표, 회장 확정 요구, 외부 성공 뒤 기록 복구, 유료 사용량 원장, YouTube 재개 업로드, PostgreSQL 행 잠금, OAuth 승인 코드 오류를 검색했다.
HITS_USED: `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`는 과금과 멱등이 실제로 지켜져야 한다는 사업 제약 때문에 사용했다. `wiki/거버넌스/요청.md`는 문구와 동시성 요구 때문에 사용했다. v63과 v68 프로토타입, `DESIGN.md` v37은 승인 계약 대조에 사용했다. Google, PostgreSQL, RFC 원문은 재개, 잠금, OAuth 오류 판정에 사용했다.
HITS_REJECTED: BRAIN의 범용 레버리지 자료는 이번 diff의 파일별 결함을 더 정확히 판정하지 못해 채택하지 않았다. v68의 생성실 및 성과실 후보 시각 표현은 이번 복구 흐름의 직접 계약이 아니어서 시각 판정 근거로 쓰지 않았다.
CONFLICTS: `pipeline-state.osmu.md` 최신 승인 디자인 허브는 v68이지만 과제는 v63을 필수 대조로 지정했다. v68은 생성실 및 성과실 후보이고 복구 문구는 v63에 있으므로 복구 흐름은 v63 계약을 적용했다. 최신 승인 핀에 PRD가 없어 PRD 대조는 미검증으로 남겼다.

SOURCES: `pipeline-state.osmu.md`, `DESIGN.md`, `docs/design/prototypes/legacy-prototype-20260912/prototype/openclaw-auto-4room-v63.html`, `docs/design/prototypes/legacy-prototype-20260912/prototype/osmu-v68-create-performance-hub-gpt-codex-20260903-0022.html`, `wiki/거버넌스/요청.md`, `wiki/거버넌스/결정.md`, `wiki/거버넌스/실수.md`, `wiki/2-product/build/사업좌표-OSMU와-ZERO-ONE.md`, `docs/구현현황.md`, Google YouTube 문서, PostgreSQL 17 문서, RFC 6749
MODEL: gpt-codex/gpt-5.6-sol
