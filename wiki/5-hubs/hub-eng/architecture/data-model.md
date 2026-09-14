# Data Model & Persistence

This is the reference for all persistent state. Most data is tenant-scoped for SaaS isolation.

## Core Tables / Files (DB in production path, files for simple runs)

### Tenant & Workspace
- `tenants` — id, slug, name, created.
- `workspaces` — linked to tenant.
- `tenant_tokens` — for API auth from frontends.

### Content & Queue (v2)
- `queue_posts` is the dashboard Home and queue-status database source. `queue.json` remains a legacy
  write mirror until cron and external extensions finish their contract-stage migration.
- `drafts` stores Studio generation/edit history. Status and platform variants remain in `payload`.
- Per-post: idea, payload (JSON with hook/body etc.), images.
- `schedules` — Studio reservation rows. Status lifecycle:
  `scheduled` → `processing` → `published` / `partial` / `failed` (or `canceled`).
  `POST /api/schedule/publish-due` claims due rows per tenant and writes platform results back into `payload.publishResults`.
- `published_posts` — one row per platform publish attempt, including failed attempts for auditability.
  `account_id` records the exact social account used; the nullable FK is cleared if that account is deleted.

#### Studio v1 generation ledger (2026-08-28)

- `studio_generation_jobs` stores the successful job, three candidates, learning-layer revisions,
  platform-spec receipt, member time zone, and the sanitized request. The platform-spec body remains
  stripped exactly as it was in the memory implementation.
- `studio_generation_idempotency` stores the request hash and exact public response. The unique key is
  tenant, member, operation, and idempotency key. `INSERT ... ON CONFLICT` is the concurrency decision
  point, so two application instances return one persisted result.
- `studio_free_regeneration_uses` stores the original and replacement job for one tenant, member, and
  local calendar date. The unique constraint keeps the existing one-free-regeneration-per-member-day
  contract across process restarts and multiple servers.
- All three tables use the existing `withTenant()` transaction and `osmu_service` RLS policy. Job lookup
  and regeneration iterate only the workspaces allowed by the authenticated Studio principal.

#### OSMU v63 backend round 2 additive contracts (2026-08-27)

- First-comment publishing reuses the existing publish attempt row. A successful or failed provider reply is
  stored in `published_posts.provider_meta`; no comment table or column was added. Platforms without an
  implemented comment-create adapter reject the request before the main post is published.
- Review requests stay in the existing queue payload as `reviewRequest`. The legacy queue status remains
  `draft`, so the approval inbox continues to use its existing draft query while the additive metadata records
  the request timestamp, source room, inbox URL, and Studio return context.
- Unified publish status derives seven platform targets from existing `published_posts` rows and preview targets.
  It does not create a publish-job table. Stop remains explicitly unsupported until durable cancellation and
  provider-specific interruption contracts are agreed.
- Suggestion sample assessment is response metadata. The threshold is five performance samples, and records
  below that threshold remain unverified. `publishContext` is also response-only navigation metadata.

#### Performance metrics coverage contract (2026-08-29)

- `GET /api/metrics` keeps the existing `posts` array and adds coverage contract version `v1` for all seven
  preview targets. Each target reports collection support, collector, supported metrics, published and collected
  counts, last collection time, and a machine-readable missing reason.
- The connected collectors are Threads insights, X public metrics, Instagram Media Insights for feed posts and
  Reels, Facebook post insights, and YouTube video statistics for YouTube and Shorts. TikTok remains unsupported
  and reports that its collector is not implemented instead of presenting missing values as measured zeroes.
- Coverage is derived from existing `published_posts.status` and `metrics_at`. It adds no table or migration.
  Time-series snapshots, reproducible 30-day comparisons, and the TikTok provider collector remain separate
  contracts and are not implied by coverage version `v1`.

#### OSMU v63 editor handoff and queue bridge (2026-08-28)

- Editor handoff reuses `drafts.payload.editor_handoff`. Contract version `1.0` stores `kind`, the
  kind-specific payload, Studio generation and candidate IDs, optimistic `revision`, status, and the last
  50 edit operations. No editor table or column was added.
- `reorder_scenes`, `delete_line`, and `restore_line` mutate that JSONB document with an expected revision.
  A stale revision returns 409, so concurrent edits cannot silently overwrite a newer draft.
- A ready handoff enters the existing queue with `sourceContext.type=studio_handoff`. The context preserves
  handoff, draft, kind, revision, generation, and candidate IDs. The idempotency key
  `studio-handoff:<handoff-id>:revision:<revision>` reuses the same queue post on repeated chatbot commands.
- Dashboard tenant selection and Studio development workspace selection remain separate runtime identities.
  The latter is held in `sessionStorage` as `studio_workspace_id`; it does not create persistent schema state.

#### Comment engagement state (2026-08-28)

- Comment authors and bodies are read from each provider when the performance room requests them. They are
  not copied into the local database.
- `engagement_items` stores only durable operator state and delivery history: provider comment ID, reply
  request key and text, external reply ID, reply time, like time, defer time, and editor handoff draft.
- `(tenant_id, platform, provider_comment_id)` is unique. Reply claim uses an atomic conflict update so two
  workers cannot send the same comment reply at the same time.
- The table uses the existing `withTenant()` transaction and `osmu_service` RLS policy. The foreign keys to
  `published_posts` and `drafts` keep engagement state attached to the tenant-owned source content.
- Channel behavior comes from `dashboard/src/lib/channel-capabilities.ts`. Unsupported providers return the
  provider limitation instead of creating local state or pretending that the action succeeded.

#### Home data cutover and rollback (2026-08-13)

- `/api/overview`, `/api/activity`, `/api/weekly-report`, and `/api/weekly-summary` read
  `queue_posts`, `published_posts`, and `growth_metrics` by default. A DB read failure returns
  `503 home_db_unavailable`; it does not silently present legacy file data as a successful response.
- `HOME_DATA_SOURCE=file` is the explicit rollback switch. `SHADOW_HOME_DB=1` serves the file result
  while reading DB in parallel and logging a structured field comparison.
- `POST /api/queue/backfill` inserts one tenant file in a single DB transaction with
  `ON CONFLICT (id) DO NOTHING`. It reports inserted, already-present, and invalid rows separately and
  never overwrites a newer DB row with a stale file snapshot.
- Dashboard queue mutations dual-write to `queue_posts`. The contract stage, including deletion of
  `queue.json`, remains blocked until cron and external extension writers are verified on DB.
- Performance suggestions use the existing queue payload instead of a new table. `sourceContext`
  preserves the suggestion ID, basis, verification label, and allowlisted evidence. The
  `suggestion:<id>` idempotency key prevents duplicate queue rows during concurrent handoff requests.
  `publishContext` is response-only navigation metadata for inbox and calendar, so it does not add a
  persistent column.

### Social Accounts
- `channel_accounts` — provider-specific accounts owned by one tenant. A tenant can retain multiple
  accounts for the same provider; `(tenant_id, provider, external_account_id)` is unique and a partial
  unique index permits one default account per provider.
- Access and refresh tokens are stored only in `secret_enc` and `refresh_enc`. API list responses expose
  display name, handle, status, and default state but never token columns.
- `integrations(kind='channel')` remains as a rollback-compatible mirror of the current default account.
  Changing or deleting the default account updates this mirror in the same transaction.
- `schedules.payload.account_ids` stores the selected account per platform. Schedule creation validates
  tenant and provider ownership before persistence; due publishing never falls back when an explicit
  account has been deleted, revoked, or belongs to another tenant.

### Global OAuth App Credentials
- `oauth_app_credentials` is global operator state, not tenant data. It has one row per provider and
  stores Client ID, Client Secret, and the provider-specific configuration ID (Facebook only) as
  individually armored `pgp_sym_encrypt` values using `OSMU_SECRET_KEY`.
- `oauth_credential_audit` records only provider, `update`/`import`/`reveal`/`delete` action, and timestamp.
  It has no secret, masked value, request body, tenant, or customer-visible policy.
- For a complete legacy env set, the exact operator-authenticated `reveal` action performs the transition
  and reveal in one database transaction: insert the whole provider set with `ON CONFLICT DO NOTHING`,
  write a secret-free `import` audit only when inserted, lock and decrypt the authoritative DB row, then
  write the secret-free `reveal` audit. The Admin UI exposes one `원문 확인` button rather than a separate
  import step, and refreshes metadata to DB-backed/complete immediately after success.
- The transaction never overwrites an existing DB row or combines partial env and DB fields. A concurrent
  conflict re-reads and reveals the locked DB row instead of the env candidate. Missing env fields,
  `DATABASE_URL`, `OSMU_SECRET_KEY`, incomplete DB rows, or DB availability fail closed. The legacy
  explicit `import-env` API remains rollback-compatible but is no longer part of the Admin UI flow.
- Both tables use `ENABLE/FORCE ROW LEVEL SECURITY` with no customer policy. They are deliberately
  excluded from the tenant policy loop, so `withTenant()`/`osmu_service` cannot read or mutate them.
- `resolveOAuthCredentialSet()` is the only runtime lookup path. A complete DB set wins. With no DB row,
  a complete legacy environment-variable set remains available. A partial DB row fails closed and is
  never completed field-by-field from env. A missing additive table (`42P01`) is the deployment/rollback
  compatibility exception and falls back to env; DB/auth/decryption failures remain fail-closed.
- Authorize URL creation, Facebook configuration ID, callback token exchange, customer readiness, and
  Admin readiness all consume the same resolved set.

### Brand Knowledge (Wiki)
- **Tenant Brand Wiki** (for AI content):
  - `wiki_docs` (DB): tenant_id, path, title, content, hash, updated_at.
  - Indexed with gin_trgm for similarity search.
  - Sync via GitHub (`/api/brand/sync-wiki`): incremental by hash.
  - Retrieval: full if small, else top-K word_similarity → prompt injection ("사실에 근거, 지어내지 마").
- **Project Wiki** (this `wiki/` folder): repo-based Markdown. For internal dev knowledge. Loaded directly via fs in sourcing for shorts (see product/shorts-factory.md).

### Insights & Signals
- `viral_signals`: tenant, source, content, score (trends, longform, reactions).
- `growth_metrics`: daily follower counts per channel.
- `drafts`: candidate shorts/posts saved for review.

### Usage & Billing (v4 SaaS - new for hybrid pricing)
- `usage_events`: tenant_id, event_type (generation, short_video_min, priority_model, etc.),
  quantity, JSONB meta, created_at. This table is the dashboard's canonical usage ledger.
  BYO Anthropic HTTP generations store `input_tokens`, `output_tokens`, and `total_tokens` in
  `meta` with `source=byo-anthropic-api`; shared CLI generations retain their existing
  quota reserve/release flow and `source=shared-claude-cli`.
- `subscriptions`: tenant_id, tier (starter/pro/team), base_price, current_period_start/end, status.
- `usage_quotas`: per tenant/month limits (shorts_included, generations, etc.) + overage tracking.
- `data/usage.json` remains a best-effort legacy mirror for old cron/local consumers. `/api/usage`
  no longer reads it; tenant daily/weekly/monthly totals come from RLS-scoped `usage_events`.
- Aggregates: monthly usage summary for invoicing/expansion signals.
- Goal: Support base subscription predictability + usage add-ons for >110% NRR expansion. Tenant-isolated (RLS). Cron will aggregate for billing reports.

### Automation State
- `cron-runs`, `cron-status`.
- `schedules` is the durable reservation queue for Studio; cron/gateway should call
  `POST /api/schedule/publish-due` per tenant to process due reservations.
- Settings per tenant/channel (credentials, guide, keywords, toggles).
- `prompt-guide.txt` + `.channel.txt` overrides (in data/ or DB).

### Media & Assets
- R2 bucket for images/videos.
- `images/` API + local cache in data/.
- videos/ for rendered shorts.

## Key Files in Repo (git-tracked examples)
- `config/openclaw.json.example`
- `data/prompt-guide.txt.example`, `search-keywords.txt.example`
- `data/tenants.json.example`
- `dashboard/db/schema.sql` + `rls.sql` (RLS for tenant isolation)

## Relationships & Flows
- Tenant → many wiki_docs, drafts, signals.
- Tenant → many channel_accounts; schedules and published_posts may reference the selected account.
- Draft → may reference signal_id.
- Wiki sync updates wiki_docs → used in text generation.
- Project wiki/ (fs) → used when wiki_path provided to sourcing (bypasses tenant for dev/internal use).

## Multi-Tenancy Guarantees
- All queries go through `withTenant()` + RLS policies.
- No cross-tenant leakage.
- Credentials and guides isolated.
- Exception by design: central OAuth developer-app credentials are global operator infrastructure.
  They never use a tenant policy and are reachable only from exact operator Bearer routes.

## Evolution Notes (gstack context)
- Moved from pure file-based (queue.json) to hybrid DB for SaaS.
- Wiki_docs added specifically for factual grounding at scale.
- Project wiki/ added 2026-06 to solve internal knowledge fragmentation as we target 1000+ subscribers.

See architecture/system-architecture.md for runtime flow. See decisions/ for why certain persistence choices were made.

**gstack instruction**: When working on data changes, read this + decisions/ first.
