# OSMU code review 2026-09-17 handoff

## 2026-09-17 12시 20분 최종 핸드오프

### 무엇을 어디까지 했나

- 사용자 명시 요청을 handoff basis로 삼아 커미터 시각 2026-09-16 12:02:27부터 2026-09-17 12:02:27까지 최근 24시간을 고정했다.
- `e5a4487e84fe297b5738bb56c522f33f3f171cf9..5cd501b36a7c9eacf628538efb4b26a685d1b62a`, 46개 커밋, 203개 파일, 추가 13,095줄, 삭제 236줄을 검토했다.
- MAJOR 6건으로 BLOCK했다. 감사, QA 원장, 공용 인수인계 갱신은 `73504e47`에 커밋했다.
- 제품 코드는 수정하지 않았다. 최신 감사는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-17.md` 최상단이다.

### 남은 이슈·블로커

- `dashboard/src/app/studio/page.tsx:1234`: 복구 단추가 실제 발행 행과 사용량 장부를 고치지 않고 초안만 `published`로 저장한다.
- `dashboard/src/app/api/video/publish/route.ts:354`: 저장된 YouTube 세션의 파일 해시와 크기를 현재 파일과 대조하지 않아 다른 파일 조각을 이어 보낼 수 있다.
- `dashboard/src/app/api/tiktok/publish-status/route.ts:87`: TikTok 완료가 사용량 outbox와 과금 원장을 쓰지 않는다.
- `dashboard/src/app/api/schedule/publish-due/route.ts:409`: 예약 발행 성공이 사용량 outbox와 과금 원장을 쓰지 않는다.
- `dashboard/src/lib/anthropic.ts:201`: macOS launchctl 래퍼가 없는 첫 후보를 종료 코드 2로 바꿔 다음 Claude 후보 폴백을 막는다.
- `dashboard/src/app/api/blog-stats/route.ts:23` 등: 최근 API 오류 정규화가 영문 오류와 원문 예외를 사용자 화면에 노출한다.
- 외부 SNS 실발행, 공급자 성공 직후 DB 실패 주입, 두 작업 공간 자격증명을 이용한 동적 격리 검증은 미검증이다.

### 다음에 칠 명령

다음 소유자는 code-builder다. 여섯 MAJOR의 수정 커밋을 만든 뒤 code-reviewer가 같은 재현 시나리오로 다시 공격한다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
npx vitest run tests/publish/video-publish-youtube.route.test.ts tests/publish/publication-usage-outbox.regression-1.test.ts tests/publish/publication-usage-outbox.db.test.ts
npm run test
npx tsc --noEmit
set -a && source ./.env.local && set +a
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-basic-flow-e2e.mjs
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-studio-v1-e2e.mjs
```

종료 증거는 실제 발행 행과 사용량 장부 수렴, 파일 불일치 세션 전송 0바이트, TikTok과 예약 발행의 사용량 1회 기록, 두 번째 Claude 후보 실행, 사용자 노출 영문 오류 0건, MAJOR 0건, 전체 테스트와 TypeScript 통과, 현재 제품 소스에서 두 E2E 통과다.

### 검증했나

- `npm run test`: 374파일, 2,414건 통과, 3건 제외.
- `npx tsc --noEmit`: 종료 코드 0.
- localhost 기본 흐름 11/11, Studio v1 14/14.
- health HTTP 200, DB up.
- localhost ElevenLabs 미설정 응답: HTTP 503과 영문 `API key not set` 직접 관찰.
- macOS launchctl 없는 실행 파일: `posix_spawn(): 2`와 종료 코드 2 직접 관찰.
- 외부 게시, DB 실패 주입, 두 작업 공간 동적 격리: 미검증.

## 2026-09-17 08시 24분 최종 핸드오프

### 무엇을 어디까지 했나

- 회장이 지정한 최근 24시간 코드 공격 리뷰를 고정 범위 `6a51aaf3..b3086d78`로 완료했다. 시간 창에는 49개 커밋, 순변경에는 155개 파일이 있다.
- MAJOR 3건을 확인했다. Studio 복구 단추의 서버 장부 미복구, YouTube 재개 세션의 파일 정체성 미검증, ElevenLabs 영문 오류 노출이다.
- 제품 코드는 수정하지 않았다. 감사와 QA 원장은 `94ac78b0`으로 커밋했다.
- 최종 감사는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-17.md:120`부터다. 판정은 BLOCK이다.

### 남은 이슈·블로커

- `dashboard/src/app/studio/page.tsx:1234`: 초안만 published로 바꾸고 `published_posts`와 사용량을 복구하지 않은 채 경고를 지운다.
- `dashboard/src/app/api/video/publish/route.ts:354`: 저장한 `fileHash`와 `totalBytes`를 현재 파일과 대조하지 않아 다른 파일 조각을 기존 YouTube 세션에 이어 보낼 수 있다.
- `dashboard/src/app/api/elevenlabs-voices/route.ts:24`: 새 영문 오류가 `ElevenLabsSettings.tsx:54`를 통해 화면에 노출된다.
- 기존 QA 산출물 4건의 verify FAIL은 이번 코드리뷰 산출물과 별도이며 아직 미해소다. 공개 YouTube 실게시, 공급자 성공 직후 DB 장애 주입, 운영 배포도 미검증이다.

### 다음에 칠 명령

다음 소유자는 code-builder다. 위 세 MAJOR를 고친 고정 커밋을 만든 뒤 code-reviewer가 같은 재현 시나리오를 다시 검수한다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio/dashboard
npx vitest run tests/publish/video-publish-youtube.route.test.ts tests/publish/publication-usage-outbox.regression-1.test.ts tests/publish/publish-partial-block.regression-1.test.ts
npm run test
npx tsc --noEmit
set -a && source ./.env.local && set +a
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-basic-flow-e2e.mjs
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-studio-v1-e2e.mjs
```

종료 증거는 실제 서버 장부 수렴, 바뀐 파일을 기존 세션에 전송한 바이트 0건, 한국어 오류 노출, MAJOR 0건, 전체 테스트와 TypeScript 통과, 현재 제품 소스에서 두 E2E 통과다.

### 검증했나

- `npm run test`: 374파일, 2,414건 통과, 3건 제외.
- `npx tsc --noEmit`: 종료 코드 0.
- localhost 기본 흐름 11/11, Studio v1 14/14.
- health HTTP 200, DB up. 실행 제품 소스 `7f5564ea` 이후 고정 끝까지 제품 소스 변경 0개다.
- `/api/usage`: HTTP 200. pending 대상 없는 정상 조회만 관찰했다.
- 외부 게시와 장애 주입: 미검증.

## 무엇을 어디까지 했나

- 회장 요청 원문을 handoff basis로 사용했다. 원래 최근 24시간 범위는 `7cc7f848e2238c1691fc7467cca4bf2bd89e1b2a..93d1da1a6eed1d82f78c95cd4899074b61b5ee8d`, 43개 커밋과 81개 파일이다.
- 원래 코드 공격 리뷰는 MAJOR 6건으로 BLOCK이었다. 코드빌더가 `1f7fbed4..46e75b2d`에서 수정했다.
- 수정 커밋을 독립 재검수했다. 제외 채널 상태, 긴 대시, fallback 멱등 키, 사용량 outbox 네 건은 닫혔다. YouTube 영속 복구와 세션 재개 두 건은 남았다.
- 최종 문서는 `docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-17.md`다. 최종 판정은 `REVIEW_VERDICT: BLOCK`이다.
- 제품 코드는 수정하지 않았다.

## 남은 이슈·블로커

- `dashboard/src/app/studio/page.tsx:1234`의 복구 단추는 발행 장부를 복구하지 않고 초안만 `published`로 저장한 뒤 재발행 금지 상태를 지운다.
- `dashboard/src/app/api/video/publish/route.ts:354`의 YouTube 세션 재개는 저장한 `fileHash`와 `totalBytes`를 현재 파일과 비교하지 않는다. 같은 초안에서 파일이 교체되면 기존 영상 앞부분과 새 영상 뒷부분을 한 세션으로 합칠 수 있다.
- 현재 health 실행 커밋 `f3c3704a`는 수정 커밋 `46e75b2d`를 포함하지만 현재 브랜치 HEAD `ba7e9f6f`와 다른 계보다. 현재 HEAD 실앱 귀속은 NG다.
- 감사 문서, QA tracker 일부와 이 인수인계 파일은 스테이징했지만 다른 세션의 미추적 증거 파일 20개를 `commit-untracked-guard`가 감지해 커밋을 차단했다. 범위 밖 파일을 포함하거나 훅을 우회하지 않았다.
- 운영 배포와 실제 외부 SNS 발행은 미검증이다.

## 다음에 칠 명령

다음 소유자는 code-builder다. 실제 서버 발행 장부 복구와 재개 파일 동일성 검증을 구현한 고정 커밋을 만든다. 그 뒤 code-reviewer가 같은 공격 시나리오를 다시 검수한다.

```bash
cd /Users/sj/sj_code_master/zto1-marketing-studio
git rev-parse HEAD
curl -fsS http://localhost:3456/api/health
cd dashboard
npx vitest run tests/publish/video-publish-youtube.route.test.ts tests/publish/publication-usage-outbox.regression-1.test.ts tests/publish/publication-usage-outbox.db.test.ts tests/publish/publish-partial-block.regression-1.test.ts
npm run test
npx tsc --noEmit
set -a && source ./.env.local && set +a
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-basic-flow-e2e.mjs
STUDIO_DEV_WORKSPACE_IDS=cd1d0a40-540d-4524-9b49-bf2445d82182 node scripts/verify-studio-v1-e2e.mjs
```

종료 증거는 발행 장부 복구 뒤 `published_posts`와 `usage_events` 수렴, 파일 또는 메타데이터가 달라진 기존 세션에 바이트 0건 전송, MAJOR 0건, 전체 Vitest와 TypeScript 종료 코드 0, 현재 HEAD와 일치하는 localhost에서 두 E2E 통과다.

## 검증했나

- 표적 회귀: 4파일, 28건 통과.
- 전체 회귀: 374파일, 2,414건 통과, 3건 제외.
- `npx tsc --noEmit`: 종료 코드 0.
- production build: 종료 코드 0.
- 수정 커밋을 포함한 localhost 기본 흐름 11/11, Studio v1 14/14.
- 실 Postgres outbox 중복 방지: 통과.
- 파일 교체 뒤 YouTube 세션 재개와 실제 발행 장부 복구: 코드 대조 NG, 실외부 발행 미검증.
- 토큰 위반과 순변경 삭제 파일: 문제없음.
