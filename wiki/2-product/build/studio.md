# Studio: Assisted Content Creation

Studio is the "power user" surface for one-off or assisted generation, complementing the fully automated cron/queue flow. It is the primary place where operators interact with the AI engine + wiki grounding + multi-platform output + video rendering.

## Draft save failure feedback, 2026-09-03

- 발행 전 초안 ID 확보는 외부 발행의 필수 조건이다. 저장 API가 빈 결과를 반환하거나 예외를
  올리면 동일하게 오류 알림을 표시하고 외부 발행 요청을 시작하지 않는다.
- 수동 임시 저장은 초안 ID를 받은 뒤에만 성공으로 알린다. 실패를 인증 헬퍼에서 삼키지 않고
  Studio의 사용자 행동 경계에서 한국어 오류로 번역한다.
- 외부 발행 뒤 초안 상태 저장이 실패하면 발행 결과 자체는 화면에 보존하고 저장 실패를 결과 오류로
  함께 표시한다. 사용자가 실패를 성공으로 오인하거나 무응답으로 남지 않게 한다.

## Generation API v1, 2026-08-27

- `POST /api/studio/v1/generations`: 학습 정보 7층과 요청 시점 platform spec을 검사하고 A/B/C 후보 3장을 만든다.
- `GET /api/studio/v1/generations/[jobId]`: 본인이 속한 workspace의 생성 결과만 조회한다.
- `POST /api/studio/v1/regenerations/[jobId]`: 회원 전체 기준 하루 1회 무료 재생성을 소비하고, 추가 요청은 과금 승인 계약으로 거절한다.
- 반환되는 후보는 구조화된 스토리보드이다. 실제 이미지·영상 provider 생성 결과가 아니다.
- 생성 작업, 멱등 응답, 무료 재생성 사용량은 2026-08-28부터 PostgreSQL에 영속화된다. 같은 요청의 동시 실행은 DB unique key에서 한 결과로 수렴하고, 재시작 뒤에도 후보 3장과 작업을 다시 조회할 수 있다.
- 개발용 identity는 production에서 설정과 무관하게 차단된다. 단독 상품에서 이를 대체할 운영 회원 인증 어댑터와 실제 미디어 provider 생성, 만료 다운로드 경로는 아직 없다.

## 교차검수 안전 계약, 2026-08-28

- 일반 생성과 무료 재생성은 같은 멱등 키 문자열을 받아도 서로 다른 작업 이름 공간을 쓴다.
  사용자가 내부 키 모양을 먼저 사용해도 무료 재생성은 원인 불명 오류를 내지 않는다.
- 답글 공급자 응답을 확인하지 못하면 청구를 `status-unknown`으로 보존한다. 자동 lease 회수로
  같은 공개 답글을 다시 보내지 않고 운영 확인 대상으로 남긴다.
- 같은 작업 공간과 댓글에 들어온 좋아요 요청은 PostgreSQL transaction 자문 잠금으로 직렬화한다.
  먼저 성공한 요청만 공급자를 호출하고 뒤 요청은 저장된 좋아요 상태를 재생한다.
- 발행 장애와 복구는 계정 단위 지문으로 맞춘다. 한 계정의 성공이 다른 계정의 열린 장애를 닫지 않는다.
- 본문 발행 뒤 첫 댓글이 실패하면 전체 성공이나 정상 복구로 세지 않는다. 저장된 멱등 응답의
  단순 재생도 새 복구 사건으로 세지 않는다.
- 온보딩은 첫 콘텐츠 생성을 먼저 허용하면서 그 다음 행동으로 브랜드 문서 연결을 계속 보여 준다.
  업종과 콘텐츠 갈래 선택은 새로고침 뒤 복원하며 손상된 자동저장 값은 선택으로 사용하지 않는다.

## Purpose in the SaaS
- Quick idea → publishable assets (text variants + visuals + shorts video).
- Experiment with tones, wiki facts, or new hooks.
- Onboarding hook: first value in < 2 minutes.
- For 1000+ subscriber startups: power users (founders, marketers) use Studio for high-leverage posts while cron handles volume.

## Core Flow
1. Enter idea or load from blog/wiki. **또는 기존 Long Video (로컬 파일 / YouTube URL) 입력 (0차 Video Repurposing)**.
2. Select brand guide (or let wiki provide facts).
3. Generate:
   - Independent text variants for Threads / Facebook / X / IG / Shorts hook-body-cta.
   - Image prompt.
   - (Optional) Video via Higgsfield/Midjourney or ffmpeg path **또는 외부 클리핑 API로 기존 영상에서 후보 Shorts 추출 후 OSMU refinement**.
4. Edit, preview per platform (wiki/brand tone 반영).
5. Save as draft or directly select/publish to the four current Studio targets (Threads / X / Facebook / Instagram).
6. (New) wiki_path support via sourcing for pulling project knowledge directly.
7. (0차 추가) Long video repurpose: 클립 후보 수신 → 위키 컨텍스트로 다듬기 → queue로.

## Generation and publish boundaries

- Higgsfield image/video generation, credit balance, and transaction history are operator-only.
  Studio first confirms `/api/me`; customer sessions receive no `/api/higgsfield/*` SWR key or
  generation request and see a Korean operator-only notice. The proxy allowlist remains closed
  because the credit pool and generation log are not tenant-isolated.
- Studio has **seven visual previews** (Threads, X, Facebook, Instagram, Shorts, Reels, TikTok), but direct
  select/publish supports **four** targets only: Threads, X, Facebook, Instagram. Shorts, Reels, and TikTok
  remain generation/preview outputs, default OFF, and show
  `발행 미지원(생성 전용)` instead of a publish selector.
- Publish progress counts only confirmed `ok:true` results. A failed target carries a danger-token
  badge and its server reason. Mixed or all-failed runs persist as `partial`, never `published`;
  only an all-success run displays `발행 완료` and stores `published`.
- The existing external-publish/internal-record failure path remains a reconciliation state:
  it stores `partial`, preserves the permalink/recovery metadata, and blocks automatic republish.
- Channel body limits are defined only in `dashboard/src/lib/channel-text-limits.ts`, with an
  official reference URL beside every value. Preview cards show the current count against each
  platform's own limit; limits intentionally differ by provider.
- Threads and Facebook reject over-limit content before any provider API call. They do not silently
  truncate user-edited copy, because losing the ending/CTA without consent is more damaging than an
  actionable preflight error. X and existing credential channels retain their documented truncation
  behavior.
- Higgsfield video responses expose whether requested narration was included. A silent result shows
  a warning in Studio with the machine reason translated for the user (for example, server TTS
  runner unavailable) instead of appearing to be a fully narrated success.

**Wiki Integration** (recent):
- Tenant Brand Wiki injected for "facts only, no invention".
- Project wiki (this one) now loadable via `wiki_path` in sourcing API for internal/project-related content.
- "Common from copy" + per-channel overrides.

## UI Components
- Idea input + guide selector.
- Platform preview cards (grouped: Text, Video 9:16, Card News).
- Generation buttons (text / image / video).
- Draft history (per workspace).
- Brand setup wizard (guide + repo/wiki sync).
- Schedule panel 구현됨: `dashboard/src/components/studio/SchedulePanel.tsx`, `dashboard/src/app/api/schedule/`.

See studio-mock*.html in public/ for visual references.

## Technical Implementation
- Frontend: `dashboard/src/app/studio/page.tsx` + components (PlatformPreview, RepoConnect, BrandSetupWizard).
- Backend:
  - `POST /api/studio/text` — idea + guide + tenant wiki context → multi-variant JSON.
  - `POST /api/studio/drafts` — save/restore work.
  - `POST /api/sourcing` — longform → shorts candidates (now accepts `wiki_path`).
  - Video: `/api/video/generate`, `/api/video/publish`.
- Studio 변경은 Stage Controller 현재 단계와 승인 산출물을 먼저 확인한다.

## Initial render and accessibility, 2026-08-28

- `room` 쿼리는 첫 렌더와 같은 `/studio` 안 이동의 진실원이다. 저장된 이전 방을 먼저 그렸다가
  바꾸지 않는다.
- 플랫폼 계정과 첫 댓글 기능은 발행실 전용이다. 생성실·편집실에서는 관련 요청을 시작하지 않는다.
- 라이트·다크 텍스트 토큰은 WCAG AA를 만족하고, 모든 링크·단추·입력에는 공통 `focus-visible`
  링이 나타나야 한다.
- 성능 회귀는 `dashboard/scripts/measure-room-experience.mjs`, 키보드·대비 회귀는
  `dashboard/scripts/verify-room-accessibility.mjs`로 실제 앱에서 확인한다.

## For Scaling to 1000+ Users
- Workspace isolation.
- Usage metering on generations/publishes.
- Template library from successful wiki + guide combos.
- Export to queue for cron handoff.

현재 로컬 구현은 아이디어를 후보와 플랫폼별 미리보기로 만들고 텍스트 네 채널을 직접 선택·발행할 수 있다.
예약 발행 API 자체의 지원 목록은 8개이고 영상 발행은 별도 경로이므로 이 숫자들을 합쳐 하나의 “지원 채널 수”로 말하지 않는다. 자세한 검증 경계는 [Marketing Hub 화면 지도](./marketing-hub-surface-map.md)와 [현재 제품·검증 상태](./current-state.md)를 따른다.
