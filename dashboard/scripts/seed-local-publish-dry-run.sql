-- 로컬 PUBLISH_DRY_RUN 전용 가짜 연결 계정. 외부 전송은 하지 않으며 실 자격증명을 담지 않는다.
-- local-stack-20261010.sh가 OSMU_SECRET_KEY를 같은 비민감 개발 키로 고정한 뒤에만 사용한다.
WITH providers(provider, meta) AS (
  VALUES
    ('threads',  '{"userId":"dry-run-threads"}'::jsonb),
    ('x',        '{"apiKey":"dry-run","apiSecret":"dry-run","accessToken":"dry-run","accessSecret":"dry-run"}'::jsonb),
    ('instagram','{"userId":"dry-run-instagram"}'::jsonb),
    ('facebook', '{"userId":"dry-run-facebook"}'::jsonb),
    ('linkedin', '{"userId":"urn:li:person:dry-run"}'::jsonb),
    ('bluesky',  '{"identifier":"dry-run.invalid"}'::jsonb),
    ('telegram', '{}'::jsonb),
    ('discord',  '{"api":"discord_webhook"}'::jsonb),
    ('slack',    '{"api":"slack_webhook"}'::jsonb),
    ('kakao',    '{}'::jsonb),
    ('youtube',  '{}'::jsonb),
    ('tiktok',   '{}'::jsonb)
)
INSERT INTO channel_accounts
  (tenant_id, provider, external_account_id, display_name, username, secret_enc, meta, is_default, status, token_expires_at)
SELECT
  'cd1d0a40-540d-4524-9b49-bf2445d82182'::uuid,
  provider,
  'dry-run-' || provider,
  '로컬 드라이런',
  'local-' || provider,
  armor(pgp_sym_encrypt(
    CASE provider
      WHEN 'discord' THEN 'https://discord.com/api/webhooks/dry-run/dry-run'
      WHEN 'slack' THEN 'https://hooks.slack.com/services/dry-run/dry-run/dry-run'
      ELSE 'dry-run-token'
    END,
    'local-publish-dry-run-key'
  )),
  meta,
  true,
  'active',
  '2099-01-01 00:00:00+00'::timestamptz
FROM providers
ON CONFLICT (tenant_id, provider, external_account_id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    username = EXCLUDED.username,
    secret_enc = EXCLUDED.secret_enc,
    meta = EXCLUDED.meta,
    is_default = true,
    status = 'active',
    token_expires_at = EXCLUDED.token_expires_at,
    updated_at = now();
