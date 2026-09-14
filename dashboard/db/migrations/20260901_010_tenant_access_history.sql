-- 고객 신원 확인 시 마지막 접속과 15분 단위 접속 이력을 남긴다.
-- 접속 이력에는 테넌트와 시각만 두며 IP, 위치, 브라우저 정보는 수집하지 않는다.
BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS tenant_access_events (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  accessed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, accessed_at)
);

CREATE INDEX IF NOT EXISTS idx_tenant_access_events_recent
  ON tenant_access_events(tenant_id, accessed_at DESC);

-- 이 표는 인증 경계와 운영자 조회만 사용한다. 고객 요청에서 쓰는 osmu_service에는 열지 않는다.
-- 일반 앱 연결의 table owner 또는 BYPASSRLS 운영 연결은 기록과 운영자 조회를 계속 수행한다.
ALTER TABLE tenant_access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_access_events NO FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_iso ON tenant_access_events;

DO $tenant_access_role$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'osmu_service') THEN
    REVOKE ALL ON tenant_access_events FROM osmu_service;
  END IF;
END
$tenant_access_role$;

COMMIT;
