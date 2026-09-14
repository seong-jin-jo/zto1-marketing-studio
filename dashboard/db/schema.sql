-- OSMU 멀티테넌트 스키마 (단계0 — 내부 팀용 경량)
-- 제공자(우리) 중앙 호스팅 Postgres. 공유DB + tenant_id. RLS는 SaaS화 시 활성.
-- 적용: psql -d openclaw_osmu -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- 위키 문서 trigram 검색(한글 부분매칭)

-- 테넌트(워크스페이스). 내부 단계는 하드인증 없음 — 등록=워크스페이스 생성.
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,            -- URL/식별용 (예: tenant1)
  name        TEXT NOT NULL,                   -- 표시명 (예: Tenant One)
  status      TEXT NOT NULL DEFAULT 'active',  -- active | paused (+ 레거시 pending, 아래 백필 DO 블록이 active로 전환).
                                                -- OSMU v1.0.0부터 신규 셀프서브 가입은 즉시 'active'로 생성(공개 대시보드) —
                                                -- 계정 게이트는 paused/unavailable(알수없는 값)만. 공유 AI 사용 승인은
                                                -- 별도 컬럼 shared_cli_approved_at(아래)로 분리됐다. CHECK 제약 없음, 코멘트만 갱신.
  tier        TEXT NOT NULL DEFAULT 'starter',    -- starter | pro | team (ADR-003 hybrid pricing)
  domain      TEXT UNIQUE,                     -- 커스텀 도메인(CNAME). Host 헤더 → 이 테넌트로 매핑(호스팅 멀티테넌트)
  owner_auth_id UUID UNIQUE,                    -- Supabase Auth 유저 → 테넌트 매핑(고객 셀프서브 로그인). 첫 로그인 시 자동 생성
  last_accessed_at TIMESTAMPTZ,                 -- 고객 신원 확인 뒤 15분 단위로 갱신하는 마지막 접속 시각
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OSMU v1.0.0 셀프서브 오픈: 공유 claude -p("공유 AI") 사용 승인 시각(nullable, tenants.status와
-- 독립된 별도 entitlement). null = 미승인(BYO Anthropic 키 등록 시에만 생성 가능), 값 있음 = 운영자가
-- 공유 CLI quota 사용을 승인. 계정 자체 접근(active/paused)과 절대 섞지 않는다 — 승인 대기가 대시보드
-- 진입 자체를 막지 않는다(lib/anthropic.ts generateText가 quota reserve 전에 이 컬럼만 gate).
-- 1회성 백필(멱등 — 컬럼이 "이번 실행에서 처음 추가되는" 경우에만 동작. 이미 존재하면 전체 스킵되므로
-- schema.sql 재적용(재배포 등)이 운영자의 이후 승인/회수(shared_cli_approved_at UPDATE)를 되돌리지 않는다):
--   · 기존 active 테넌트 → 즉시 공유 승인(now()) — 라이브 고객 워크플로 무중단.
--   · 기존 pending 테넌트 → status만 active로 전환(계정 게이트는 이제 paused/unavailable만). 공유 AI 승인은
--     별도 entitlement이므로 shared_cli_approved_at은 null로 남겨 운영자가 개별 승인.
--   · paused 테넌트 → status/승인 모두 그대로(변경 없음).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'shared_cli_approved_at'
  ) THEN
    ALTER TABLE tenants ADD COLUMN shared_cli_approved_at TIMESTAMPTZ;
    UPDATE tenants SET shared_cli_approved_at = now() WHERE status = 'active';
    UPDATE tenants SET status = 'active' WHERE status = 'pending';
  END IF;
END $$;

-- 기존 DB에는 additive로 마지막 접속 시각만 더한다. 접속 실패가 인증을 막지 않도록 애플리케이션은
-- 이 컬럼과 아래 이력 표를 한 문장으로 best-effort 갱신한다.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

-- 고객 접속 이력. 개인정보 최소화를 위해 테넌트와 시각만 저장한다.
-- 15분 안 재접속 합치기는 tenants.last_accessed_at 조건부 UPDATE가 직렬화하고, 그 UPDATE가
-- 성공한 경우에만 같은 SQL 문장에서 이 표에 한 행을 넣는다.
CREATE TABLE IF NOT EXISTS tenant_access_events (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  accessed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, accessed_at)
);
CREATE INDEX IF NOT EXISTS idx_tenant_access_events_recent
  ON tenant_access_events(tenant_id, accessed_at DESC);

-- 브랜드 컨텍스트(위저드/레포연동 산출, 표준 스키마). 생성이 이걸 읽어 톤 주입.
CREATE TABLE IF NOT EXISTS brand_guides (
  tenant_id     UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  prompt_guide  TEXT,                          -- 톤·금지어·hook·페르소나 (claude -p 증류 산출)
  visual_rules  JSONB,                         -- { colors[], typography, forbidden[] }
  source        TEXT,                          -- wizard | repo | paste
  source_repo   TEXT,                          -- repo 인입 시 'owner/name'
  source_path   TEXT,                          -- repo 인입 시 파일 경로 (예: wiki/brand/마케팅.md)
  source_ref    TEXT,                          -- repo 브랜치/태그 (기본 main)
  source_hash   TEXT,                          -- 원문 해시 — 동일하면 재증류 skip
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 통합(고객 BYO 키): Anthropic/Higgsfield/MCP/채널. 단계0=공유키라 선택. 값은 암호화 저장(SaaS화 시).
CREATE TABLE IF NOT EXISTS integrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,                 -- anthropic | higgsfield | mcp | channel
  label         TEXT,
  secret_enc    TEXT,                          -- 단계0 평문 가능, SaaS화 시 암호화 필수
  meta          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, label)
);

-- 초안(생성물). 현 data/studio/drafts.json → 이주. tenant_id 처음부터.
CREATE TABLE IF NOT EXISTS drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  idea        TEXT,
  payload     JSONB,                           -- 플랫폼별 텍스트/이미지/영상 산출
  status      TEXT NOT NULL DEFAULT 'draft',   -- draft | published
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drafts_tenant ON drafts(tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_drafts_tenant_id ON drafts(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);

-- Studio v1 생성 장부. 프로세스 메모리 대신 작업, 멱등 응답, 회원별 현지 날짜 무료 재생성을
-- 같은 Postgres에 보존한다. 모든 행은 tenant_id를 가져 rls.sql의 withTenant 정책을 따른다.
CREATE TABLE IF NOT EXISTS studio_generation_jobs (
  id                    UUID PRIMARY KEY,
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  member_id             TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('succeeded')),
  candidates            JSONB NOT NULL,
  layer_revisions       JSONB NOT NULL,
  platform_spec_receipt JSONB,
  time_zone             TEXT NOT NULL,
  request_payload       JSONB NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_studio_generation_jobs_member_time
  ON studio_generation_jobs(tenant_id, member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS studio_generation_idempotency (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  member_id         TEXT NOT NULL,
  operation         TEXT NOT NULL,
  idempotency_key   TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  request_hash      CHAR(64) NOT NULL,
  job_id            UUID NOT NULL,
  response_payload  JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_studio_generation_idempotency_member_operation_key
    UNIQUE (member_id, operation, idempotency_key),
  FOREIGN KEY (tenant_id, job_id)
    REFERENCES studio_generation_jobs(tenant_id, id)
    ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'studio_generation_idempotency'::regclass
      AND conname = 'uq_studio_generation_idempotency_member_operation_key'
  ) THEN
    ALTER TABLE studio_generation_idempotency
      ADD CONSTRAINT uq_studio_generation_idempotency_member_operation_key
      UNIQUE (member_id, operation, idempotency_key);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_studio_generation_idempotency_job
  ON studio_generation_idempotency(tenant_id, job_id);

CREATE TABLE IF NOT EXISTS studio_free_regeneration_uses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID REFERENCES tenants(id) ON DELETE SET NULL,
  member_id           TEXT NOT NULL,
  local_date          DATE NOT NULL,
  original_job_id     UUID,
  replacement_job_id  UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_studio_free_regeneration_member_date
    UNIQUE (member_id, local_date),
  FOREIGN KEY (tenant_id, original_job_id)
    REFERENCES studio_generation_jobs(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, replacement_job_id)
    REFERENCES studio_generation_jobs(tenant_id, id)
    ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'studio_free_regeneration_uses'::regclass
      AND conname = 'uq_studio_free_regeneration_member_date'
  ) THEN
    ALTER TABLE studio_free_regeneration_uses
      ADD CONSTRAINT uq_studio_free_regeneration_member_date
      UNIQUE (member_id, local_date);
  END IF;
END $$;
DO $$
BEGIN
  ALTER TABLE studio_free_regeneration_uses
    ALTER COLUMN tenant_id DROP NOT NULL,
    ALTER COLUMN original_job_id DROP NOT NULL,
    ALTER COLUMN replacement_job_id DROP NOT NULL;
  ALTER TABLE studio_free_regeneration_uses
    DROP CONSTRAINT IF EXISTS studio_free_regeneration_uses_tenant_id_fkey,
    DROP CONSTRAINT IF EXISTS studio_free_regeneration_uses_tenant_id_original_job_id_fkey,
    DROP CONSTRAINT IF EXISTS studio_free_regeneration_uses_tenant_id_replacement_job_id_fkey;
  ALTER TABLE studio_free_regeneration_uses
    ADD CONSTRAINT studio_free_regeneration_uses_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL NOT VALID,
    ADD CONSTRAINT studio_free_regeneration_uses_tenant_id_original_job_id_fkey
      FOREIGN KEY (tenant_id, original_job_id)
      REFERENCES studio_generation_jobs(tenant_id, id) ON DELETE SET NULL NOT VALID,
    ADD CONSTRAINT studio_free_regeneration_uses_tenant_id_replacement_job_id_fkey
      FOREIGN KEY (tenant_id, replacement_job_id)
      REFERENCES studio_generation_jobs(tenant_id, id)
      ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED NOT VALID;
  ALTER TABLE studio_free_regeneration_uses
    VALIDATE CONSTRAINT studio_free_regeneration_uses_tenant_id_fkey;
  ALTER TABLE studio_free_regeneration_uses
    VALIDATE CONSTRAINT studio_free_regeneration_uses_tenant_id_original_job_id_fkey;
  ALTER TABLE studio_free_regeneration_uses
    VALIDATE CONSTRAINT studio_free_regeneration_uses_tenant_id_replacement_job_id_fkey;
END $$;
CREATE INDEX IF NOT EXISTS idx_studio_free_regeneration_jobs
  ON studio_free_regeneration_uses(tenant_id, original_job_id, replacement_job_id);

-- 후보 거절 장부. 무료 재생성은 후보 셋을 모두 거절한 뒤에만 나간다(요구 대장 R27).
-- 거절 여부를 클라이언트 상태로 판단하면 생성 직후 재생성을 불러 몫을 공짜로 태울 수 있다.
CREATE TABLE IF NOT EXISTS studio_generation_candidate_rejections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  member_id     TEXT NOT NULL,
  job_id        UUID NOT NULL,
  candidate_id  UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_studio_generation_candidate_rejection
    UNIQUE (tenant_id, job_id, candidate_id),
  FOREIGN KEY (tenant_id, job_id)
    REFERENCES studio_generation_jobs(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_studio_generation_candidate_rejections_job
  ON studio_generation_candidate_rejections(tenant_id, job_id);

-- 여덟 컨셉 숏폼 공장 실행 장부. 작업 공간마다 실행 중인 공장은 하나로 제한하고,
-- 각 컨셉은 독립 상태와 Studio 생성 작업을 가져 한 건 실패가 나머지를 막지 않게 한다.
CREATE TABLE IF NOT EXISTS shorts_factory_runs (
  id                  UUID PRIMARY KEY,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  member_id           TEXT NOT NULL,
  -- 울타리 표. 이 실행을 소유한 worker 만 진행 신호와 마감을 쓸 수 있다.
  -- 강제 종료와 회수는 표를 지워 옛 worker 를 즉시 무효로 만든다.
  lease_token         UUID,
  status              TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed')),
  concurrency_limit   SMALLINT NOT NULL CHECK (concurrency_limit BETWEEN 1 AND 8),
  total_concepts      SMALLINT NOT NULL CHECK (total_concepts BETWEEN 1 AND 8),
  succeeded_concepts  SMALLINT NOT NULL DEFAULT 0,
  failed_concepts     SMALLINT NOT NULL DEFAULT 0,
  idempotency_key     TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  request_hash        CHAR(64) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  UNIQUE (tenant_id, member_id, idempotency_key),
  UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shorts_factory_active_workspace
  ON shorts_factory_runs(tenant_id)
  WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_shorts_factory_runs_member_time
  ON shorts_factory_runs(tenant_id, member_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shorts_factory_concept_runs (
  id                  UUID PRIMARY KEY,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_run_id      UUID NOT NULL,
  concept_id          TEXT NOT NULL,
  name                TEXT NOT NULL,
  position            SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 8),
  status              TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  stage               TEXT NOT NULL DEFAULT 'waiting'
                      CHECK (stage IN ('waiting', 'generating_candidates', 'completed', 'failed')),
  config_payload      JSONB NOT NULL,
  studio_job_id       UUID,
  error_code          TEXT,
  error_message       TEXT,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, factory_run_id, concept_id),
  UNIQUE (tenant_id, factory_run_id, position),
  FOREIGN KEY (tenant_id, factory_run_id)
    REFERENCES shorts_factory_runs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, studio_job_id)
    REFERENCES studio_generation_jobs(tenant_id, id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_shorts_factory_concepts_status
  ON shorts_factory_concept_runs(tenant_id, factory_run_id, status, position);

-- 발행된 게시물 + 성과(insights). 실발행 시 1행, collect로 metrics 갱신.
CREATE TABLE IF NOT EXISTS published_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id      UUID,                          -- 원 초안(선택)
  platform      TEXT NOT NULL,                 -- threads | x | instagram | ...
  external_id   TEXT,                          -- threadsMediaId / tweetId / mediaId
  provider_post_id TEXT,                       -- async provider publish_id와 분리된 최종 게시물 ID
  provider_meta JSONB NOT NULL DEFAULT '{}'::jsonb, -- 비동기 provider 상태 판정에 필요한 비민감 옵션
  permalink     TEXT,
  text          TEXT,
  status        TEXT NOT NULL DEFAULT 'published', -- published | in_progress | uncertain | failed
  error         TEXT,
  idempotency_key TEXT,                          -- draft_id 없는 실발행의 중복 방지 키
  reserved_at   TIMESTAMPTZ,                     -- in_progress 예약의 임차 시작 시각
  first_comment_status TEXT,                     -- not_requested | published | failed | uncertain
  first_comment_error  TEXT,
  first_comment_external_id TEXT,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 성과(insights) — collect가 갱신
  views         INTEGER,
  likes         INTEGER,
  replies       INTEGER,
  reposts       INTEGER,
  metrics_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_published_posts_tenant_id
  ON published_posts(tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_pubposts_tenant ON published_posts(tenant_id, published_at DESC);

-- 댓글 본문은 provider에서 읽고, 사람이 정한 상태와 외부 답글 결과만 보관한다.
CREATE TABLE IF NOT EXISTS engagement_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  published_post_id     UUID NOT NULL REFERENCES published_posts(id) ON DELETE CASCADE,
  platform              TEXT NOT NULL,
  provider_comment_id   TEXT NOT NULL,
  state                 TEXT NOT NULL DEFAULT 'unread'
                        CHECK (state IN ('unread', 'deferred', 'replying', 'replied', 'editor_handoff')),
  reply_request_key     TEXT,
  reply_text            TEXT,
  reply_external_id     TEXT,
  replied_at            TIMESTAMPTZ,
  liked_at              TIMESTAMPTZ,
  deferred_at           TIMESTAMPTZ,
  editor_handoff_at     TIMESTAMPTZ,
  editor_draft_id       UUID REFERENCES drafts(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, platform, provider_comment_id)
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'engagement_items'::regclass
      AND conname = 'fk_engagement_items_tenant_published_post'
  ) THEN
    ALTER TABLE engagement_items
      ADD CONSTRAINT fk_engagement_items_tenant_published_post
      FOREIGN KEY (tenant_id, published_post_id)
      REFERENCES published_posts(tenant_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'engagement_items'::regclass
      AND conname = 'fk_engagement_items_tenant_editor_draft'
  ) THEN
    ALTER TABLE engagement_items
      ADD CONSTRAINT fk_engagement_items_tenant_editor_draft
      FOREIGN KEY (tenant_id, editor_draft_id)
      REFERENCES drafts(tenant_id, id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_engagement_items_tenant_state
  ON engagement_items(tenant_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_items_post
  ON engagement_items(tenant_id, published_post_id, updated_at DESC);

-- P4: 발행 큐(현 data/queue.json v2 → 이주). expand/contract 1단계 = dual-write(읽기/cron은 json 유지, 무중단).
-- id는 queue.json 항목 id(UUID)와 1:1. payload에 원 항목 무손실 스냅샷.
CREATE TABLE IF NOT EXISTS queue_posts (
  id            UUID PRIMARY KEY,                  -- queue.json post.id와 동일(default 없음)
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  text          TEXT,
  topic         TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',     -- draft | approved | published | failed
  hashtags      TEXT[],
  channels      JSONB,                             -- v2 멀티채널 발행 상태
  payload       JSONB,                             -- 원 queue.json 항목 스냅샷(무손실)
  generated_at  TIMESTAMPTZ,
  approved_at   TIMESTAMPTZ,
  scheduled_at  TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_queue_posts_tenant ON queue_posts(tenant_id, status, generated_at DESC);

-- P6 예약: 초안을 미래 시각에 멀티채널 발행 예약. 스케줄러가 scheduled_at 도래 시 발행.
CREATE TABLE IF NOT EXISTS schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id      UUID,                          -- 원 초안(선택)
  platforms     TEXT[],                        -- 발행 대상 채널 목록
  scheduled_at  TIMESTAMPTZ NOT NULL,          -- 예약 발행 시각
  status        TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | processing | published | partial | uncertain | failed | canceled
  payload       JSONB,                         -- 발행 페이로드 스냅샷
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_schedules_tenant ON schedules(tenant_id, scheduled_at);

-- P7 팔로워추적: 채널별 팔로워/팔로잉 시계열 롤업. growth 추세 시각화.
CREATE TABLE IF NOT EXISTS growth_metrics (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL,                 -- threads | x | instagram | ...
  followers     INTEGER,
  following     INTEGER,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_growth_metrics_tenant ON growth_metrics(tenant_id, recorded_at DESC);

-- P9 트렌드/터진글: 외부 인기글·트렌드 시그널 수집. score로 랭킹, content 생성 소스로 활용.
CREATE TABLE IF NOT EXISTS viral_signals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source        TEXT,                          -- 수집 출처 (search | trending | ...)
  external_ref  TEXT,                          -- 외부 글 식별자/URL
  content       TEXT,                          -- 본문/요약
  score         NUMERIC,                       -- 화제성 점수
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_viral_signals_tenant ON viral_signals(tenant_id, captured_at DESC);


-- 테넌트 API 토큰(인증모델 b). 포크 프론트가 이 토큰으로 중앙 API 호출 → 서버가 tenant 못박음.
-- 원문은 발급 시 1회만 노출, 저장은 sha256 해시. RLS 제외(토큰→tenant 해석은 tenant 컨텍스트 진입 전이라).
CREATE TABLE IF NOT EXISTS tenant_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,           -- sha256(raw)
  label         TEXT,                            -- 용도 메모 (예: 'tenant-frontend')
  last_used_at  TIMESTAMPTZ,
  revoked       BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_tokens_hash ON tenant_tokens(token_hash);

-- 위키 문서 전체 인입(폴더 통째). 생성 시 pg_trgm으로 관련 문서 검색→프롬프트 주입(사실 기반).
-- 문서별 1행, hash로 증분 동기화. 테넌트별 RLS.
CREATE TABLE IF NOT EXISTS wiki_docs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,                    -- 'wiki/제품/기능.md'
  title       TEXT,                             -- 첫 H1 또는 파일명
  content     TEXT,                             -- 원문(.md 전체)
  hash        TEXT,                             -- sha256(content) — 증분 동기화
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, path)
);
CREATE INDEX IF NOT EXISTS idx_wiki_docs_trgm ON wiki_docs USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_wiki_docs_tenant ON wiki_docs(tenant_id);

-- Usage & Billing for Hybrid SaaS Pricing (ADR-003)
-- Track events for base + usage billing. Aggregate for quotas and overage.
CREATE TABLE IF NOT EXISTS usage_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL,                   -- aiGeneration, shortsVideoMinute, publication, priorityModel, apiCall, etc.
  quantity      NUMERIC NOT NULL DEFAULT 1,      -- count or minutes
  meta          JSONB,                           -- e.g. { model, source: 'shorts', wiki_path }
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_events_tenant ON usage_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_type ON usage_events(tenant_id, event_type, created_at);

-- Current subscription state per tenant (for base pricing + tier)
CREATE TABLE IF NOT EXISTS subscriptions (
  tenant_id         UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  tier              TEXT NOT NULL DEFAULT 'starter',  -- starter | pro | team
  base_price        NUMERIC,                          -- monthly base in cents or won units
  status            TEXT NOT NULL DEFAULT 'active',   -- active | past_due | canceled
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Monthly quotas & usage summary (for enforcement and dashboard)
CREATE TABLE IF NOT EXISTS usage_quotas (
  tenant_id         UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  period            TEXT NOT NULL,                   -- YYYY-MM
  shorts_included   INTEGER DEFAULT 50,
  shorts_used       INTEGER DEFAULT 0,
  generations_included INTEGER DEFAULT 1000,
  generations_used  INTEGER DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period)
);
CREATE INDEX IF NOT EXISTS idx_usage_quotas_tenant_period ON usage_quotas(tenant_id, period);

-- 운영자 전용 중앙 OAuth 개발자 앱 credential. tenant 소유 데이터가 아닌 전역 1행/provider.
-- 각 required field는 OSMU_SECRET_KEY로 개별 pgcrypto 암호화한 armored text만 저장한다.
-- 고객 토큰/withTenant 경로에는 정책을 만들지 않으며 db/rls.sql에서 ENABLE RLS + no policy로 닫는다.
-- bare table owner/BYPASSRLS 운영자 연결은 NO FORCE 기본 동작으로 접근한다.
CREATE TABLE IF NOT EXISTS oauth_app_credentials (
  provider          TEXT PRIMARY KEY,
  client_id_enc     TEXT NOT NULL,
  client_secret_enc TEXT NOT NULL,
  config_id_enc     TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 중앙 credential 변경·원문 확인 감사. secret 값/마스킹 값/요청 본문은 절대 기록하지 않는다.
CREATE TABLE IF NOT EXISTS oauth_credential_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('update', 'import', 'reveal', 'delete')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 기존 배포의 CHECK에도 env→암호화 DB 가져오기 감사를 additive하게 허용한다.
ALTER TABLE oauth_credential_audit
  DROP CONSTRAINT IF EXISTS oauth_credential_audit_action_check;
ALTER TABLE oauth_credential_audit
  ADD CONSTRAINT oauth_credential_audit_action_check
  CHECK (action IN ('update', 'import', 'reveal', 'delete'));
CREATE INDEX IF NOT EXISTS idx_oauth_credential_audit_provider_time
  ON oauth_credential_audit(provider, occurred_at DESC);

-- SNS-007: 사이트 내 provider별 다중 계정. `integrations(kind='channel')`는 provider당 1행이라
-- "Threads 개인+브랜드 2개 동시 연결" 같은 요구를 표현 못 한다(2026-07-17 사용자 실기기 QA).
-- ADD-ONLY: integrations UNIQUE(tenant_id,kind,label)는 건드리지 않는다 — 기존 단일계정 rollback 경로 보존.
-- integrations는 "그 provider의 현재 기본 계정"을 계속 미러링(dual-write)해 레거시 소비자
-- (getChannelCred 폴백, publish-due 등 미마이그레이트 경로)가 무중단으로 동작한다.
-- (아키텍처는 main 세션이 회장과 합의해 code-builder에 지정 — 2026-07-17, ADD table / integrations 불변.)
CREATE TABLE IF NOT EXISTS channel_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,               -- threads | instagram | x | facebook | bluesky | youtube | ...
  external_account_id TEXT NOT NULL,                -- provider가 발급한 authoritative user/channel/page id
  display_name        TEXT,                         -- 사람이 읽는 이름(YouTube 채널명 등)
  username            TEXT,                          -- @handle
  secret_enc          TEXT NOT NULL,                 -- pgp_sym_encrypt(access_token) — 평문 절대 금지
  refresh_enc         TEXT,                          -- pgp_sym_encrypt(refresh_token), nullable
  meta                JSONB,                         -- provider별 부가 필드(X 4키, api flag 등)
  is_default          BOOLEAN NOT NULL DEFAULT false,
  status              TEXT NOT NULL DEFAULT 'active', -- active | expired | revoked
  token_expires_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_account_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_accounts_tenant ON channel_accounts(tenant_id, provider);
-- provider당 tenant 1개만 기본계정 — is_default=true 행에만 걸리는 partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_accounts_one_default
  ON channel_accounts(tenant_id, provider) WHERE is_default;

-- 발행/스케줄이 "이 특정 계정으로" 발행했는지 감사·선택발행 대상 — additive, nullable, SET NULL
-- (계정 삭제돼도 과거 발행 기록 자체는 보존, 참조만 끊음).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='published_posts' AND column_name='account_id'
  ) THEN
    ALTER TABLE published_posts ADD COLUMN account_id UUID REFERENCES channel_accounts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='published_posts' AND column_name='provider_post_id'
  ) THEN
    ALTER TABLE published_posts ADD COLUMN provider_post_id TEXT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='published_posts' AND column_name='provider_meta'
  ) THEN
    ALTER TABLE published_posts ADD COLUMN provider_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='schedules' AND column_name='account_id'
  ) THEN
    ALTER TABLE schedules ADD COLUMN account_id UUID REFERENCES channel_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- SNS-015 동시성 멱등: (테넌트, 초안/멱등키, 플랫폼, 계정) 조합당 "진행중 또는 성공한" 발행은
-- 최대 1건. 실패(status='failed') 행은 재시도를 막으면 안 되므로 인덱스 대상에서 제외한다.
-- account_id는 nullable이라 COALESCE로 sentinel을 씌운다(NULL끼리는 서로 같지 않아 unique가 안 걸림).
-- 이 인덱스가 있어야 SELECT-then-INSERT 레이스(동시 2요청이 둘 다 "없음"을 보고 둘 다 외부 발행)를
-- INSERT ... ON CONFLICT DO NOTHING 한 방으로 닫을 수 있다 — 5분짜리 컨테이너 폴링 구간 내내
-- 트랜잭션을 붙들지 않고도(=커넥션 점유/락 홀드 없이) 중복 외부 발행을 막는 것이 목적.
-- uncertain(게시 성공 뒤 응답만 끊긴 상태)도 재발행 금지 대상이라 인덱스에 포함한다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_published_posts_idem
  ON published_posts (tenant_id, draft_id, platform, COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE draft_id IS NOT NULL AND status IN ('published', 'in_progress', 'uncertain');

-- draft_id 없는 실발행은 클라이언트 멱등 키로 같은 보호를 받는다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_published_posts_idem_key
  ON published_posts (tenant_id, platform, COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid), idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status IN ('published', 'in_progress', 'uncertain');

CREATE INDEX IF NOT EXISTS idx_published_posts_in_progress_lease
  ON published_posts (tenant_id, reserved_at)
  WHERE status = 'in_progress';

-- 작업 공간별 운영 장애 원장. 원문 오류나 자격증명은 저장하지 않고 고정 코드만 남긴다.
-- status='open'인 동일 fingerprint는 한 행으로 합쳐 알림 폭주를 막는다.
CREATE TABLE IF NOT EXISTS operational_incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fingerprint     TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN (
                    'publish_failed',
                    'token_expired',
                    'generation_failed',
                    'external_service_error'
                  )),
  source          TEXT NOT NULL,
  reason_code     TEXT NOT NULL,
  severity        TEXT NOT NULL CHECK (severity IN ('critical', 'error', 'warning')),
  intervention    TEXT NOT NULL CHECK (intervention IN ('human', 'automatic')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'recovered')),
  occurrences     INTEGER NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  recovered_at    TIMESTAMPTZ,
  notified_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_incidents_open_fingerprint
  ON operational_incidents(tenant_id, fingerprint)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_operational_incidents_tenant_status
  ON operational_incidents(tenant_id, status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_incidents_human_notification
  ON operational_incidents(intervention, notified_at, last_seen_at DESC)
  WHERE status = 'open' AND intervention = 'human';

-- 멱등 백필: 기존 integrations(kind='channel') 1행 → provider당 channel_accounts 1행(기본계정)으로 승격.
-- 매 배포마다 실행 — 개별 tenant/provider 단위 idempotency는 ON CONFLICT DO NOTHING이 보장한다(이미
-- 존재하는 행은 override하지 않음). 이러면 나중에 integrations에 새 tenant/provider가 추가돼도(레거시
-- 코드 경로가 살아있는 한) 다음 배포에서 자동 백필된다 — global existence-guard(구버전, 테이블이 통째로
-- 비었을 때만 동작)는 제거했다: 그 가드는 한 번이라도 다른 provider로 계정을 추가한 뒤 재배포하면 나머지
-- legacy integrations가 영원히 백필 안 되는 결함이 있었다(2026-07-17 리뷰).
-- 보안: 마이그레이션 SQL엔 OSMU_SECRET_KEY가 없어 여기서 pgp_sym_encrypt 불가 — refresh_enc는 반드시
-- NULL로 남기고(평문 복사 금지), meta에서도 refreshToken 키를 제거해 plaintext가 어디에도 안 남게 한다.
-- refresh_enc가 NULL인 legacy 계정은 코드 레벨에서 자동 refresh 금지 — 재연결(OAuth) 유도 대상.
DO $$
DECLARE
  r RECORD;
  legacy_id TEXT;
BEGIN
  FOR r IN
    SELECT tenant_id, label AS provider, secret_enc, meta
    FROM integrations
    WHERE kind = 'channel' AND secret_enc IS NOT NULL AND secret_enc <> ''
  LOOP
    legacy_id := COALESCE(r.meta->>'userId', 'legacy-' || r.provider || '-' || r.tenant_id::text);
    -- 방어: 이 tenant/provider에 channel_accounts 행이 이미 하나라도 있으면(OAuth 재연결이
    -- 이 migration보다 먼저 계정을 만들었거나, 재배포로 다른 external_id가 이미 기본계정인 경우)
    -- is_default=true 백필을 건너뛴다 — 안 그러면 uq_channel_accounts_one_default(partial unique)와
    -- 충돌해 이 DO 블록 전체가 롤백된다(한 tenant 사고가 전체 배포를 막는 것 방지, 2026-07-17 발견).
    IF NOT EXISTS (
      SELECT 1 FROM channel_accounts WHERE tenant_id = r.tenant_id AND provider = r.provider
    ) THEN
      INSERT INTO channel_accounts (tenant_id, provider, external_account_id, display_name, username, secret_enc, refresh_enc, meta, is_default, status)
      VALUES (
        r.tenant_id, r.provider, legacy_id,
        NULL, NULL,
        r.secret_enc,
        NULL, -- 평문 refresh 절대 복사 금지 — 재연결 시 upsertChannelAccount가 암호화 저장
        (r.meta - 'refreshToken'), true, 'active'
      )
      ON CONFLICT (tenant_id, provider, external_account_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;
