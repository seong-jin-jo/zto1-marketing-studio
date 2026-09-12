-- CI 격리 테스트용 시드. rls.sql 적용 "전"에 실행해야 함(FORCE RLS가 owner insert도 막으므로).
-- 멱등: 재실행해도 중복 안 생김. seed-a는 데이터 보유 테넌트, seed-b는 빈 테넌트(교차조회=0 검증 대상).

INSERT INTO tenants (slug, name) VALUES ('seed-a', 'Seed A'), ('seed-b', 'Seed B')
  ON CONFLICT (slug) DO NOTHING;

-- 로컬 네 방 E2E가 .env.local과 검증 스크립트에서 공유하는 고정 작업 공간.
-- apply-schema.sh --seed 뒤 이 행이 없으면 생성 장부와 임시 고객 토큰이 모두 FK 위반으로
-- 첫 요청에서 끊기므로, 테스트 DB 초기화가 사용자 흐름 fixture까지 복원해야 한다.
INSERT INTO tenants (id, slug, name, status, tier, shared_cli_approved_at)
VALUES ('cd1d0a40-540d-4524-9b49-bf2445d82182', 'qa-four-room', '네 방 검증 작업 공간', 'active', 'team', now())
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      status = EXCLUDED.status,
      tier = EXCLUDED.tier,
      shared_cli_approved_at = COALESCE(tenants.shared_cli_approved_at, EXCLUDED.shared_cli_approved_at);

-- seed-a: short draft 1행(isolation drafts 테스트가 소유 테넌트를 이걸로 탐색)
INSERT INTO drafts (tenant_id, idea, payload, status)
  SELECT id, 'seed idea', '{"kind":"short","hook":"seed"}'::jsonb, 'draft'
  FROM tenants WHERE slug = 'seed-a'
    AND NOT EXISTS (SELECT 1 FROM drafts d WHERE d.tenant_id = tenants.id);

-- seed-a: 빌링 3테이블 각 1행(usage_events/usage_quotas/subscriptions 격리 테스트도 assert)
INSERT INTO usage_events (tenant_id, event_type, quantity)
  SELECT id, 'aiGeneration', 1 FROM tenants WHERE slug = 'seed-a'
    AND NOT EXISTS (SELECT 1 FROM usage_events e WHERE e.tenant_id = tenants.id);

INSERT INTO usage_quotas (tenant_id, period)
  SELECT id, '2026-06' FROM tenants WHERE slug = 'seed-a'
  ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO subscriptions (tenant_id, tier)
  SELECT id, 'team' FROM tenants WHERE slug = 'seed-a'
  ON CONFLICT (tenant_id) DO NOTHING;
