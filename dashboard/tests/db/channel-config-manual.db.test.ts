import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import { createTempDir, setupTestEnv, cleanupTestEnv } from "../helpers";
import { getDatabaseUrl } from "../isolation/_env";

const H = vi.hoisted(() => ({ tenantId: "" }));
vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => H.tenantId) }));
// 이 테스트는 인증 테넌트 해석과 공급자 검증을 대체한다.
// 저장·암호화·조회는 실제 로컬 PostgreSQL에서 실행하며 외부 Webhook POST는 보내지 않는다.
vi.mock("@/lib/verify-channel", () => ({
  verifyChannel: vi.fn(async () => ({ verified: true, account: "Fixture Slack" })),
}));

describe("메시징 채널 수동 연결 실제 DB 왕복", () => {
  it("CHANNEL-19 로컬·CI 격리 DB: 저장→기본 계정·미러 암호화→설정 재조회 연결됨, 다른 tenant_id 입력 무시", async (ctx) => {
    const url = getDatabaseUrl();
    const parsed = url ? new URL(url) : null;
    const isLoopback = !!parsed && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    const isCiService = process.env.CI === "true" && parsed?.hostname === "postgres" && parsed.pathname === "/testdb";
    if (!url || (!isLoopback && !isCiService)) {
      if (process.env.CI) throw new Error("CHANNEL-19 requires loopback DB or CI postgres/testdb service");
      ctx.skip();
      return;
    }
    // 독립 fixture 전용 키. .env.local의 개발 키나 운영 키를 읽지 않는다.
    const key = "channel-fixture-only-key-20260918";
    const admin = postgres(url, { max: 2, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
    const previousUrl = process.env.DATABASE_URL;
    const previousKey = process.env.OSMU_SECRET_KEY;
    process.env.DATABASE_URL = url;
    process.env.OSMU_SECRET_KEY = key;
    const tenantId = randomUUID();
    const otherTenantId = randomUUID();
    H.tenantId = tenantId;
    const tmpDir = createTempDir();
    setupTestEnv(tmpDir);
    let appDb: { end: (options: { timeout: number }) => Promise<void> } | null = null;
    try {
      await admin`INSERT INTO tenants (id, slug, name, status, tier)
        VALUES (${tenantId}::uuid, ${`channel-fixture-${tenantId}`}, 'Channel Fixture', 'active', 'team')`;
      vi.resetModules();
      const { POST } = await import("@/app/api/channel-config/[channel]/route");
      const { db } = await import("@/lib/db");
      appDb = db();
      const fakeWebhook = "https://hooks.slack.com/services/FIXTURE/ONLY/NOT_REAL";
      const request = new Request("http://localhost/api/channel-config/slack", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: fakeWebhook, tenant_id: otherTenantId }),
      });
      const saved = await POST(request, { params: Promise.resolve({ channel: "slack" }) });
      expect(saved.status).toBe(200);
      expect((await saved.json()).verified).toBe(true);

      const accounts = await admin<{ id: string; secret_enc: string; is_default: boolean; meta: { api: string } }[]>`
        SELECT id, secret_enc, is_default, meta FROM channel_accounts
        WHERE tenant_id = ${tenantId}::uuid AND provider = 'slack'`;
      expect(accounts).toHaveLength(1);
      expect(accounts[0].is_default).toBe(true);
      expect(accounts[0].meta.api).toBe("slack_webhook");
      expect(accounts[0].secret_enc).not.toContain(fakeWebhook);
      const mirrors = await admin<{ secret_enc: string }[]>`
        SELECT secret_enc FROM integrations WHERE tenant_id = ${tenantId}::uuid AND kind = 'channel' AND label = 'slack'`;
      expect(mirrors).toHaveLength(1);
      expect(mirrors[0].secret_enc).toBe(accounts[0].secret_enc);
      const crossed = await admin<{ count: number }[]>`
        SELECT count(*)::int AS count FROM channel_accounts WHERE tenant_id = ${otherTenantId}::uuid`;
      expect(crossed[0].count).toBe(0);

      const { GET } = await import("@/app/api/channel-config/route");
      const loaded = await GET(new Request("http://localhost/api/channel-config"));
      const body = await loaded.json();
      expect(body.slack.connected).toBe(true);
      expect(body.slack.keys.webhookUrl).toBe("********");
      expect(JSON.stringify(body)).not.toContain(fakeWebhook);

      // 같은 manual externalId 재시도는 새 계정을 늘리지 않고 기존 기본 계정을 갱신한다.
      const retried = await POST(new Request("http://localhost/api/channel-config/slack", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: fakeWebhook }),
      }), { params: Promise.resolve({ channel: "slack" }) });
      expect(retried.status).toBe(200);
      const repeated = await admin<{ id: string }[]>`
        SELECT id FROM channel_accounts WHERE tenant_id = ${tenantId}::uuid AND provider = 'slack'`;
      expect(repeated.map((row) => row.id)).toEqual([accounts[0].id]);
    } finally {
      await admin`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
      if (appDb) await appDb.end({ timeout: 5 });
      await admin.end({ timeout: 5 });
      cleanupTestEnv(tmpDir);
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.OSMU_SECRET_KEY;
      else process.env.OSMU_SECRET_KEY = previousKey;
      vi.resetModules();
    }
  });
});
