# System Architecture

**이 문서는 wiki/ 의 공식 아키텍처 레퍼런스입니다.** 
root CLAUDE.md 는 이제 고수준 포인터 역할만 합니다 (상세는 wiki/ 참조).

2026-08-28 코드 스냅샷: Next.js API `route.ts` 178개, 화면 `page.tsx` 25개, 자체 extension 30개다. 그중 발행 extension은 15개다. 수치는 구조 변화 감지용이며 기능 완료나 운영 연결을 뜻하지 않는다.

현재 OSMU 라인의 정식 단계는 QA다. 기본 흐름과 로컬 회귀는 통과했지만 v63 디자인 정합은 NG이고 운영 배포·실채널 발행은 미검증이다. 최신 경계는 [현재 제품·검증 상태](../../../2-product/build/current-state.md)를 따른다.

## High Level

```
Cron Jobs (jobs.json)
    ↓
OpenClaw Gateway + Claude Agent
    ↓ (Tool Registry)
Extensions (publish, generate, insights, video, longform-to-shorts, search...)
    ↓
Dashboard APIs (Next.js) + Data (queue.json, wiki_docs per tenant, etc.)
    ↓
External: Threads/X/IG/YouTube/TikTok APIs + R2 + ElevenLabs + Midjourney
```

## Core Components

**1. Content Generation**
- prompt-guide.txt + channel-specific overrides
- search-keywords
- longform-to-shorts: chunk → claude -p → candidates (hook/body)
- studio/text: idea → multi-platform variants + shorts + image_prompt (wiki context injected)

**2. Publishing**
- multi-channel-publish cron
- schedule-publish-due dashboard cron endpoint for Studio reservations
- Per-channel extensions (threads-publish, x-publish, instagram-publish, tiktok-publish, youtube-publish...)
- Queue schema v2 with per-channel status
- 대시보드 `POST /api/publish`는 외부 provider 게시와 내부 `published_posts` + queue 반영이 모두
  확인되어야만 `200 {ok:true}`다. 외부 게시는 성공했지만 어느 영속화 단계가 실패하면
  [RFC 9110 §15.6.1](https://www.rfc-editor.org/rfc/rfc9110.html#name-500-internal-server-error)
  `500`을 반환한다(`502`가 아닌 이유: provider 응답은 유효한 성공이고 실패 주체가 우리 서버이기
  때문). 본문은 `ok:false`, `externalPublished:true`, 외부 ID/permalink, 실패 단계와 안정된 오류
  코드, `repair_persistence_only`/`retryPublish:false` reconciliation 식별자를 보존한다. raw DB/파일
  오류는 노출하지 않는다.
- Studio는 위 partial response를 일반 실패로 버리지 않는다. 외부 URL과 reconciliation을 draft
  payload/local state에 보존하고 상태를 `partial`로 표시하며, 내부 기록을 복구하기 전 같은 draft를
  다시 provider에 보내지 않는다. 이미 `published_posts` 성공 행이 있는 재요청은 외부 발행 없이
  queue만 멱등 복구한다. `publish_success` 분석 이벤트는 외부+내부 성공이 모두 확인된 경우에만
  발생한다. 재시도 안전성은 같은 키의 재요청이 side effect를 중복 생성하지 않아야 한다는
  [Stripe idempotent request 원칙](https://docs.stripe.com/api/idempotent_requests)을 따른다.

**3. Insights & Learning**
- threads-insights, sync-insights
- threads-search (playwright scrape for external trends)
- growth tracking
- viral_signals table

**4. Video / Shorts Factory**
- slides model: text + duration + imageUrl
- Higgsfield path for advanced video
- Instagram Reels publish path (SNS-015, **operating observed 2026-07-21** — commit `1a6e7e5a` 운영 배포 후
  실제 Reel permalink `https://www.instagram.com/reel/DbBPRa7iFff/` 회수, 동일 요청 재시도
  `alreadyPublished:true` 동일 permalink, DB rows 1/published 1/distinct external 1/permalink 1/failed 0):
  `POST /api/video/upload` → tenant-scoped `data/videos` → 15분 만료 HMAC 서명 URL
  `GET|HEAD /api/media/<token>`(Range 지원, 프록시 인증 우회 후 핸들러 자체 서명 검증) →
  Meta `media_type=REELS` 컨테이너 생성(`video_url`은 `OSMU_PUBLIC_URL` 정본 origin만 사용) →
  `status_code` 폴링 최대 5분(1분 간격, `ERROR`/`EXPIRED`/timeout fail-closed) →
  `media_publish` → permalink 재조회 후 DB/queue 기록.
- 토큰은 **암호화가 아니라 서명**이다. payload는 base64url 평문 JSON(tenantId·파일명·만료)이라
  토큰 보유자는 내용을 읽을 수 있다. 보장은 변조 불가 + 만료 두 가지뿐이다.
- 테넌트(고객 OAuth/JWT)에게 열린 영상 라우트는 list / upload / delete / publish 4개다.
- `/api/video/generate`는 **운영자 전용**이다. 요청 본문의 `imageUrl`/`bgmUrl`을 서버가 그대로
  fetch(SSRF)하고 슬라이드 수만큼 동기 ffmpeg를 돌려(자원 고갈) tenant-aware allowlist에서 의도적으로 제외했다.
- 업로드/발행 공통 애플리케이션 상한은 100 MiB(`lib/video-limits.ts`). 프록시/플랫폼 본문 상한 뒤의 2차 방어선이다.
- 중복 발행은 DB에서 막는다. `published_posts`에 `status='in_progress'` 예약 INSERT를 하고
  `draft_id` 기준 partial unique index가 `published`/`in_progress`를 유일하게 강제한다.
  경쟁에서 진 요청은 성공을 흉내내지 않고 409 `publish_in_progress`로 fail-closed 응답한다.

**5. Wiki (two kinds)**
- Product: tenant wiki_docs (GitHub sync, trgm search, prompt injection for facts)
- This Project Wiki: `wiki/` (internal dev knowledge, decisions, procedures)

**6. Dashboard (Next.js)**
- Studio (assisted gen + video)
- Channel pages (Queue/Analytics etc.)
- Brand setup (guide + wiki/repo sync)
- Tenants/workspaces

**0차 아키텍처 포커스 (2026-06-19)**
- 단일 앱 + 테넌트 완전 격리 (UI + DB, RLS + withTenant).
- Cloudflare Custom Hostnames 지원 (고객 도메인 직접 사용).
- Multi-repo wiki context pulling (다른 레포 위키를 product context로).
- Reliability: 에러를 사용자가 설명/재현 가능하게.
- Shorts Factory + automation loop을 operator(0차)의 다중 서비스에서 안정 동작.

## 테넌트 접속 기록

고객 Supabase JWT를 검증해 테넌트를 확정하는 `ensureTenantForUser` 경계에서 접속을 기록한다.
`tenants.last_accessed_at`이 없거나 15분보다 오래된 경우에만 한 SQL 문장의 조건부 `UPDATE`와
`tenant_access_events` `INSERT`를 실행한다. PostgreSQL Read Committed 격리에서 경합한 `UPDATE`는
선행 트랜잭션이 끝난 뒤 조건을 현재 행에 다시 적용하므로 같은 테넌트의 동시 요청도 한 창에 한
건만 기록한다. 이 판단은 [PostgreSQL Transaction Isolation 공식 문서](https://www.postgresql.org/docs/current/transaction-iso.html)를
근거로 한다.

접속 이력의 열은 `tenant_id`, `accessed_at`뿐이다. IP 주소, 위치, 브라우저, 사용자 에이전트,
지문은 수집하지 않는다. AI 호출량과 비용 장부인 `usage_events`와도 합치지 않는다. 기록 쓰기가
실패하면 고정된 관측 이벤트만 남기고 인증 성공을 되돌리지 않는다. 운영자 계정 조치는 실제 고객
접속이 아니므로 기록을 명시적으로 끈다.

`GET /api/operator/customers`는 마지막 접속 시각과 현재 시각 기준 최근 30일의 UTC 고유 접속 일수를
반환한다. 이력이 없으면 둘 다 `null`이며 운영자 화면은 `접속 기록 없음`으로 표시한다. 0은 실제
0일과 미수집을 구분할 수 없으므로 결측 표시에 사용하지 않는다. 이력 표는 인증 경계와 운영자
연결만 사용한다. RLS는 켜되 고객 역할 `osmu_service`에는 정책과 권한을 주지 않는다.

## 플랫폼 권한 등록과 사용 구조 (OAuth)

고객은 소셜 로그인만 하고 API 키를 직접 발급하지 않는다. 각 플랫폼에 **우리 OAuth 앱 하나**를
등록해 두고, 고객 계정은 그 앱에 권한을 위임한다(ADR-004).

### 1. 앱 자격증명

provider 별 앱 식별자와 시크릿은 코드에 넣지 않고 환경변수 이름으로만 참조한다
(`dashboard/src/lib/social-connect.ts` 의 `appIdEnv`/`appSecretEnv`).

| provider | 앱 식별자 env | 비고 |
|---|---|---|
| threads | `THREADS_APP_ID` | Facebook 앱 ID가 아니라 **Threads 앱 ID**다. 이용 사례 `Threads API 액세스` → `설정` 에서 발급되는 별도 번호다. 두 값을 혼동하면 authorize 단계에서 권한 오류로 보인다. |
| instagram | `IG_APP_ID` | Instagram 비즈니스 이용 사례 |
| facebook | `FB_APP_ID` | 페이지 관리 이용 사례 |
| x / linkedin / youtube / naver / pinterest / slack / line | `*_CLIENT_ID` | provider 표준 명칭 |

시크릿 원문은 저장소·문서·로그에 쓰지 않는다. 서버 env 와 DB 자격증명 저장소
(`resolveOAuthCredentialSets`)에서만 읽는다.

### 2. 요청 scope

`PROVIDERS` 정의가 정본이다. Threads 는 `threads_basic`, `threads_content_publish`,
`threads_manage_insights`, `threads_read_replies`, `threads_manage_replies` 를 요청한다.
Instagram 은 `instagram_business_basic`, `instagram_business_content_publish`,
`instagram_business_manage_comments`, `instagram_business_manage_insights` 를 요청한다.
**쓰는 화면이 없는 scope 는 심사에서 반려되므로 요청 목록에 두지 않는다.**

### 3. redirect URI 등록

authorize 요청의 `redirect_uri` 는 플랫폼 콘솔에 사전 등록된 값과 문자열이 완전히 같아야 한다.
우리 값은 `${OSMU_PUBLIC_URL}/api/connect/<provider>/callback` 이고, 프록시 뒤 내부 주소가
섞이지 않도록 `OSMU_PUBLIC_URL` 로 고정한다. Threads 는 콜백 외에
`.../deauthorize`, `.../delete` 도 함께 등록한다.

### 4. 심사 전 단계와 테스터

앱 심사(App Review) 승인 전에는 **앱에 역할이 등록된 계정만** 연결된다.
Threads 는 일반 `테스터` 가 아니라 `Threads 테스터` 역할이어야 한다. 등록만으로는 부족하고,
해당 계정이 Threads 설정의 웹사이트 권한에서 초대를 **수락**해야 상태가 `대기 중` 에서 벗어난다.
심사 승인 후에는 이 절차 없이 일반 고객이 OAuth 만으로 연결된다.

이 제약은 `/api/connect/readiness` 가 provider 별 한국어 사유로 화면에 내려준다.
연결 버튼을 먼저 그리고 실패를 뒤늦게 보여주지 않는다.

심사 전 안내 계약은 `ConnectReadinessEntry.guidance` 선택 필드다. 제목, 순서가 있는 단계 목록,
라벨과 URL을 가진 바깥 링크를 담으며 Threads와 Instagram의 서로 다른 초대 수락 화면은
`dashboard/src/lib/connect-readiness.ts` 한 곳에서 관리한다. 운영자가 심사 승인된 provider를 비밀값이
아닌 `OAUTH_APP_REVIEW_APPROVED_PROVIDERS` 환경변수에 등록하면 서버는 해당 provider의 심사 대기
사유와 안내 필드를 내려주지 않고 화면도 함께 사라진다. 안내가 있어도 OAuth 연결 단추는 활성 상태를
유지한다. 초대 미수락처럼 판별 가능한 실패는 사람 말로 바꾸고 같은 링크를 다시 제공하며, 판별할 수
없는 실패는 자격증명과 토큰 모양을 가린 원문을 함께 남긴다.

### 5. 토큰 수명

Threads·Instagram 은 단기 토큰을 장기 토큰으로 교환해 만료 시각과 함께 저장한다.
교환이 실패하면 provider 응답 코드와 본문을 로그에 남기고 연결을 실패 처리한다.
만료된 토큰을 유효한 것으로 취급하지 않는다.

## 미디어 에셋 보관과 배달

**지금 어디에 저장되는가.** 저장 진입점은 `dashboard/src/lib/media-store.ts` 하나다.
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` 네 환경변수가 모두 있으면
비공개 Cloudflare R2에 `tenants/<tenant_id>/images/<파일명>` 객체 키로 저장한다. 네 값이 전혀
없으면 기존 영속 볼륨 `osmu-data:/app/data/tenants/<tenant_id>/images`를 그대로 쓴다. 일부만
설정됐거나 R2 연결이 실패하면 로컬 저장 성공으로 바꾸지 않고 업로드를 한국어 오류로 실패시킨다.

**외부 플랫폼은 어떻게 가져가는가.** Meta 와 Threads 서버는 우리가 준 이미지 URL 을 직접
가져간다. 이때 Authorization 헤더를 붙일 수 없으므로 인증 대신 HMAC 서명 토큰이 자격증명
역할을 한다. 경로는 `/api/images/deliver/<signed-token>` 이고 영상은 별도 서명 키를 쓰는
`/api/media/<token>` 이다. 두 토큰은 서로 재생되지 않는다.

큐에 예약된 이미지는 업로드 시점에 절대 HTTPS 서명 URL을 발급받아 저장한다. 며칠 뒤 예약
발행이 실행될 때 그 URL 을 그대로 쓰기 때문에, 짧은 만료 토큰을 영속 저장하면 발행 시점에
이미 죽어 있다.

**R2 버킷은 비공개다.** 공개 개발 URL, 사용자 도메인, presigned URL을 외부 플랫폼에 주지 않는다.
presigned URL은 최대 수명이 예약 발행 시점보다 짧을 수 있고, 버킷 공개는 서명 없이 고객 이미지를
읽게 만든다. 저장 위치만 R2로 바뀌며 외부 URL과 HMAC 토큰 발급 및 검증 방식은 바뀌지 않는다.
배달 라우트가 R2 객체를 스트리밍하고, R2에 객체가 없다는 응답일 때만 기존 로컬 파일을 찾아
과거 예약 URL을 살린다. R2 연결 오류를 객체 없음으로 간주해 조용히 로컬로 우회하지 않는다.

**기존 파일 이전.** `dashboard/scripts/migrate-local-images-to-r2.mjs`가 테넌트별 로컬 이미지를
같은 객체 키로 복사한다. 이미 R2에 있는 객체는 건너뛰고 로컬 원본은 삭제하지 않는다. 운영 실행은
별도 운영 절차이며 이 build에서는 실행하지 않는다. 이전 중에도 배달의 R2 없음 후 로컬 조회가
과거 URL을 보존한다.

**따라서 R2는 발행의 전제 조건이 아니다.** 네 환경변수가 없으면 기존 로컬 저장과 서명 배달이
계속 동작한다. R2는 내구성과 규모를 위한 저장 계층이며 외부 배달 인증을 대체하지 않는다.
2026-08-31 에 "R2 미설정이라 아무것도 생성되지 않는다"고 서술한 보고가 있었으나 사실이 아니다.
그때의 실제 원인은 생성 경로에 LLM 이 붙어 있지 않았던 것과 학습 정보 모달이 화면을 덮은 것이다.

**R2 현황.** 2026-09-01에 Cloudflare 계정에 비공개 `osmu-media` 버킷을 만들었다. 제품은 네 R2
환경변수가 주입된 런타임에서 이 버킷을 사용한다. 공개 URL은 필요하지도 사용하지도 않는다.

## Data Flow for Shorts Factory (target)

Longform (wiki page / blog) → longform_to_shorts → candidates
→ Studio review + visuals
→ video_generate (ffmpeg base)
→ Drafts → Approve → Publish (YouTube/TikTok + cross post)
→ Performance (gstack browse or API) → learnings → next prompt

YouTube resumable upload의 최종 PUT은 HTTP 성공 응답이고, 응답 JSON이 파싱되며, 공백이 아닌
video `id`가 있을 때만 발행 성공으로 기록한다. non-2xx, invalid JSON, empty ID는 모두 `502` 발행
실패로 반환해 queue 상태가 성공으로 오염되지 않게 한다.

## 개발 파이프라인

- 현재 기본 절차는 Stage Controller의 기획 → 디자인 → 기술설계 → 개발 → QA → 배포 단계 게이트다.
- 단계 진입은 `/pipeline`, 승인은 `/approve` 증거 검증으로만 처리한다.
- gstack 도구는 단계 안의 보조 실행 수단이며 단계 게이트를 대체하지 않는다.

See root CLAUDE.md for environment and cron details.

This architecture is service-neutral — custom per fork in data/ and config/.
