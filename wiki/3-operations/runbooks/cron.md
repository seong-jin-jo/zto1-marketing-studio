# Cron Jobs & Automation

## 코드 기준 스냅샷 (2026-08-25)

- 저장소에는 `config/cron/jobs.json.example`만 있으며 실제 `jobs.json`은 운영 설치물이다.
- 예시 job 6개는 `generate-drafts`, `multi-channel-publish`, `collect-insights`, `fetch-trending`, `track-growth`, `osmu-generate-drafts`다.
- 대시보드 예약 발행 범위는 `dashboard/src/lib/constants.ts`의 `SCHEDULABLE_PLATFORMS` 8채널이 SSOT다.

All background work is driven by cron definitions in `config/cron/jobs.json` (or equivalent in OpenClaw gateway).

## Current Jobs (from CLAUDE.md + config)

| Job | Interval | Model | Description |
|-----|----------|-------|-------------|
| threads-generate-drafts | 6h | Sonnet/Opus | prompt-guide + keywords + wiki context → batch drafts |
| multi-channel-publish | 2h | Haiku | approved queue items → publish to all connected channels (per-channel optimization) |
| schedule-publish-due | 5-15m | n/a | dashboard `POST /api/schedule/publish-due` claims tenant due schedules → direct publish + `published_posts` records |
| instagram-generate-drafts | 6h | Sonnet | card news specific generation |
| instagram-auto-publish | 2h | Haiku | image posts for IG |
| threads-collect-insights | 6h | Haiku | views/likes/replies + viral detection + auto like/reply |
| threads-fetch-trending | weekly | Haiku | external popular posts via search (playwright or API) |
| threads-track-growth | daily | Haiku | follower count history |

## How It Works
1. Cron container calls OpenClaw gateway with job payload (including model override), or calls a dashboard cron endpoint directly.
2. Agent uses registered tools (from extensions), while dashboard direct-publish jobs use tenant credentials from DB integrations.
3. Results written to data/ or DB (tenant-scoped).
4. Cleanup of old published/failed items.

## Schedule Publish Due

`POST /api/schedule/publish-due` is the in-repo due scheduler for Studio reservations.

두 가지 호출 방식이 있다:

- **① 테넌트 스코프** — 세션/JWT, `osmu_` 토큰, host, 또는 운영자 fallback `tenant_id`로
  한 테넌트의 due만 처리(고객/포크 프론트가 호출).
- **② 운영자 전체 스윕** — `tenant_id` 없이 운영자 토큰(`Authorization: Bearer $DASHBOARD_AUTH_TOKEN`)으로
  호출하면 due가 있는 **모든 테넌트**를 순회한다. 단일 크론(curl)이 전 테넌트를 발행할 수 있는 진입점.
  RLS 우회 service-role로 `SELECT DISTINCT tenant_id`를 긁은 뒤, 각 테넌트는 `withTenant` 스코프로
  격리 처리(크로스테넌트 누수 없음). 응답에 `mode:"all-tenants"`, `tenantCount`, `processed` 포함.

- Claiming: due `schedules` rows (`status='scheduled'` and `scheduled_at <= now()`) are atomically moved to `processing` with `FOR UPDATE SKIP LOCKED`.
- Publishing: 발행 가능한 플랫폼은 **`constants.SCHEDULABLE_PLATFORMS` SSOT**(threads/x/facebook/instagram).
  SchedulePanel UI 체크박스와 백엔드 `SUPPORTED_PLATFORMS`가 이 단일 소스를 공유 — 영상(shorts/reels/tiktok)은
  텍스트 예약 루프가 못 다루므로 UI에서도 노출하지 않는다("노출=발행가능" 원칙, 정직성).
- Recording: each platform result creates a `published_posts` row with `published` or `failed`.
- Final schedule status: `published`, `partial`, or `failed`. Unsupported/unconnected platforms are recorded as failed instead of pretending to publish.

### 크론 연결 (운영 wiring)

엔드포인트는 만들어졌지만 **이걸 호출하는 주체가 있어야 예약이 실제로 발행된다.** 두 경로 중 하나:

1. **배포 호스트 crontab / 게이트웨이 스케줄러** — `dashboard/scripts/publish-due-cron.sh`를 주기 호출.
   ```cron
   */10 * * * * DASHBOARD_AUTH_TOKEN=… BASE_URL=http://localhost:3456 \
     /app/dashboard/scripts/publish-due-cron.sh >> /var/log/publish-due.log 2>&1
   ```
   스크립트는 운영자 토큰으로 `POST /api/schedule/publish-due`(전체 스윕)를 친다.
2. **OpenClaw 게이트웨이 agentTurn cron** — 게이트웨이가 도래 예약을 직접 발행하는 경우(외부 레포).

> ⚠️ crontab 등록 자체는 배포 호스트/운영자 액션이다(Supabase 콘솔 설정처럼 레포 밖). 등록 전에는
> 예약이 `scheduled`로 대기만 한다 — SchedulePanel이 이를 정직하게 표시한다.

## Metrics Collection (성과 자동 수집)

`POST /api/metrics`(action 없이, 본문 비움)는 성과 수집의 운영자 전체 스윕 엔트리포인트다.
2026-10-02까지는 성과실 "성과 다시 수집하기" 버튼(테넌트 스코프 1회성 호출)에서만 수집이
돌았다 — 자동 주기 호출이 없어 마지막 수집(2026-09-23) 뒤 올린 Shorts/Reels가 전부
미수집이었다(회장 2026-10-02 지적: "성과실에 영상 성과가 안 보인다").

`/api/schedule/publish-due`와 **같은 계약**을 그대로 따른다:

- **① 테넌트 스코프** — 세션/토큰/`tenant_id`로 한 테넌트만 수집(성과실 버튼이 호출).
- **② 운영자 전체 스윕** — `tenant_id` 없이 운영자 토큰(`Authorization: Bearer $DASHBOARD_AUTH_TOKEN`)
  으로 호출하면 발행물이 있는 **모든 테넌트**(`SELECT DISTINCT tenant_id FROM published_posts
  WHERE status='published'`, service-role)를 순회해 `collectMetrics(tenantId)`를 각각 돈다.
  한 테넌트가 던진 예외는 그 테넌트만 `ok:false`로 기록하고 나머지 테넌트 수집은 계속된다.
  응답에 `mode:"all-tenants"`, `tenantCount`, `collected`, `tenants[]` 포함.

### 크론 연결 (운영 wiring)

`dashboard/scripts/metrics-collect-cron.sh`(publish-due-cron.sh와 동일 패턴)를 배포 호스트
crontab 또는 게이트웨이 스케줄러가 주기 호출해야 실제로 자동 수집된다.

```cron
0 */6 * * * DASHBOARD_AUTH_TOKEN=… BASE_URL=http://localhost:3456 \
  /app/dashboard/scripts/metrics-collect-cron.sh >> /var/log/metrics-collect.log 2>&1
```

제안 주기는 6시간(`threads-collect-insights` 크론 주기와 동일 — Threads 집계 반영 지연
유예(`METRICS_INGEST_GRACE_MINUTES=60`)보다 충분히 길다). crontab 등록 자체는 배포
호스트/운영자 액션이다 — 등록 전에는 자동 수집이 돌지 않고 수동 버튼에만 의존한다.

## Configuration
- Per-tenant automation toggles in dashboard Settings.
- Global defaults in openclaw.json.
- Model selection: quality (generation) vs cost (publish/insights).

## 개발 절차 메모
- All cron improvements must be documented in wiki/3-operations/runbooks/cron.md.
- 새 자동화는 Stage Controller의 현재 단계와 승인을 확인하고, 승인된 단계 안에서 구현·검증한다.
- Shorts factory cron (future): "generate-shorts-from-new-wiki-or-blog" + "publish-shorts".

## Monitoring
- Dashboard shows cron status, last run, errors.
- `/api/cron-status`, `/api/cron-runs`, alerts.

## For 1000+ Tenants
- Horizontal scaling of cron workers.
- Per-tenant job staggering to avoid rate limits.
- Usage-based throttling.

See architecture/ for data flow and guides/gstack-procedures.md for how we develop changes to this system.
