BEGIN;

CREATE TABLE IF NOT EXISTS studio_export_jobs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id UUID NOT NULL,
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('card_deck', 'video')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','succeeded','partially_failed','failed','cancelled')),
  source_revision BIGINT NOT NULL CHECK (source_revision >= 0),
  source_hash CHAR(64) NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  request_payload JSONB NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  total_items SMALLINT NOT NULL CHECK (total_items BETWEEN 1 AND 100),
  succeeded_items SMALLINT NOT NULL DEFAULT 0 CHECK (succeeded_items >= 0),
  failed_items SMALLINT NOT NULL DEFAULT 0 CHECK (failed_items >= 0),
  error_code TEXT,
  error_detail TEXT CHECK (error_detail IS NULL OR char_length(error_detail) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, member_id, kind, idempotency_key),
  FOREIGN KEY (tenant_id, draft_id) REFERENCES drafts(tenant_id, id) ON DELETE CASCADE,
  CHECK (succeeded_items + failed_items <= total_items)
);

CREATE TABLE IF NOT EXISTS studio_export_items (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id UUID NOT NULL,
  item_key TEXT NOT NULL CHECK (char_length(item_key) BETWEEN 1 AND 160),
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 0 AND 99),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','succeeded','failed','cancelled')),
  source_hash CHAR(64) NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  attempt_count SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  artifact_key TEXT,
  artifact_sha256 CHAR(64),
  content_type TEXT,
  byte_size BIGINT,
  width INTEGER,
  height INTEGER,
  error_code TEXT,
  error_detail TEXT CHECK (error_detail IS NULL OR char_length(error_detail) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, job_id, item_key),
  UNIQUE (tenant_id, job_id, ordinal),
  FOREIGN KEY (tenant_id, job_id)
    REFERENCES studio_export_jobs(tenant_id, id) ON DELETE CASCADE,
  CHECK (attempt_count BETWEEN 0 AND max_attempts),
  CHECK (
    status <> 'processing'
    OR (lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CHECK (
    status <> 'succeeded'
    OR (artifact_key IS NOT NULL AND artifact_sha256 IS NOT NULL
        AND content_type IS NOT NULL AND byte_size > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_studio_export_items_claim
  ON studio_export_items(tenant_id, available_at, created_at, id) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_studio_export_items_expired_lease
  ON studio_export_items(tenant_id, lease_expires_at, id) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_studio_export_items_job_status
  ON studio_export_items(tenant_id, job_id, status, ordinal);
CREATE INDEX IF NOT EXISTS idx_studio_export_jobs_draft_latest
  ON studio_export_jobs(tenant_id, draft_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_export_jobs_active
  ON studio_export_jobs(tenant_id, status, created_at)
  WHERE status IN ('queued', 'processing');

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['studio_export_jobs','studio_export_items'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO osmu_service', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_iso ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_iso ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t);
  END LOOP;
END $$;

COMMIT;
