-- L1: Row-Level Security (방어심층, 인증모델 a). 적용: psql -d <db> -f db/rls.sql
-- ⚠️ 적용 전 모든 테넌트-스코프 쿼리가 lib/db.ts withTenant() 경유여야 함(아니면 차단됨).
--    앱은 비-superuser osmu_service role로 접속해야 RLS가 강제됨(superuser는 RLS 우회).
-- 정책: tenant_id = current_setting('app.tenant_id') — withTenant가 트랜잭션마다 SET LOCAL.
-- 19금 격리는 별도(P4 tier: osmu-private 프로젝트). 이건 한 프로젝트 내 테넌트 간 격리.

-- 비-superuser 앱 role (RLS 우회 불가)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'osmu_service') THEN
    CREATE ROLE osmu_service NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO osmu_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO osmu_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO osmu_service;

-- pgcrypto(armor/dearmor/pgp_sym_*)는 Supabase에서 'extensions' 스키마에 산다.
-- osmu_service에 USAGE/EXECUTE 없으면 SET ROLE 후 복호화가 'function does not exist'로 throw.
-- (로컬 brew postgres는 pgcrypto가 public이라 extensions 스키마 없음 → 조건부)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA extensions TO osmu_service';
    EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO osmu_service';
  END IF;
END $$;

-- 앱 접속 role(Supabase=postgres, 로컬=현재 유저)이 SET LOCAL ROLE osmu_service 할 수 있게 멤버십 부여.
-- ⚠️ Supabase postgres는 rolbypassrls=true라 그냥 두면 RLS 우회 → withTenant가 osmu_service로 전환해야 강제됨.
DO $$ BEGIN
  EXECUTE format('GRANT osmu_service TO %I', current_user);
END $$;

-- 데이터 테이블 RLS FORCE + tenant_id 정책 (tenants는 운영자 목록조회라 제외 — P4서 매핑정교화)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brand_guides','integrations','channel_accounts','drafts','studio_generation_jobs','studio_generation_idempotency','studio_free_regeneration_uses','studio_generation_candidate_rejections','shorts_factory_runs','shorts_factory_concept_runs','published_posts','engagement_items','operational_incidents','queue_posts','schedules','growth_metrics','viral_signals','wiki_docs','usage_events','subscriptions','usage_quotas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_iso ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_iso ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t);
  END LOOP;
END $$;

-- 전역 운영자 OAuth credential/audit는 tenant_id가 없고 고객 정책도 없다.
-- ENABLE RLS + policy 0개(default deny)라 osmu_service(withTenant/customer token)는 항상 0행/거부된다.
-- NO FORCE로 bare table owner/BYPASSRLS app connection만 운영자 서버 경로에서 접근한다.
-- additive schema rollback으로 전역 테이블이 없어도 위 tenant policy loop는 먼저 끝나야 하므로
-- 각 ALTER는 tenant loop 뒤의 to_regclass guard 안에서만 실행한다.
DO $$ BEGIN
  IF to_regclass('public.oauth_app_credentials') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE oauth_app_credentials ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE oauth_app_credentials NO FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_iso ON oauth_app_credentials';
  END IF;

  IF to_regclass('public.oauth_credential_audit') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE oauth_credential_audit ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE oauth_credential_audit NO FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_iso ON oauth_credential_audit';
  END IF;
END $$;

-- 접속 이력은 인증 경계와 운영자만 읽고 쓴다. 테넌트별 고객 API에는 공개하지 않는다.
-- table owner/BYPASSRLS 운영 연결은 사용하고, withTenant가 강등되는 osmu_service는 권한을 회수한다.
DO $$ BEGIN
  IF to_regclass('public.tenant_access_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE tenant_access_events ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE tenant_access_events NO FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_iso ON tenant_access_events';
    EXECUTE 'REVOKE ALL ON tenant_access_events FROM osmu_service';
  END IF;
END $$;
