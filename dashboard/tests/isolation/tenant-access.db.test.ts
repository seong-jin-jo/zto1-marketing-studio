import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import { getDatabaseUrl } from "./_env";

type Sql = ReturnType<typeof postgres>;

async function connectRequired(ctx: { skip: () => void }): Promise<Sql | null> {
  const url = getDatabaseUrl();
  if (!url) {
    if (process.env.CI) throw new Error("CI requires DATABASE_URL for tenant access history QA");
    ctx.skip();
    return null;
  }
  const sql = postgres(url, { max: 2, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
  try {
    await sql`select 1`;
    return sql;
  } catch (error) {
    await sql.end({ timeout: 5 });
    if (process.env.CI) throw error;
    ctx.skip();
    return null;
  }
}

describe("테넌트 접속 이력 실제 PostgreSQL 계약", () => {
  it("TENANT-ACCESS-01 정상·경합: 15분 안 재접속은 한 행이고 15분 뒤에는 새 행이다", async (ctx) => {
    const sql = await connectRequired(ctx);
    if (!sql) return;

    const previousDatabaseUrl = process.env.DATABASE_URL;
    const authId = randomUUID();
    const marker = `qa-access-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let tenantId: string | null = null;
    let appDb: { end: (options: { timeout: number }) => Promise<void> } | null = null;

    try {
      process.env.DATABASE_URL = getDatabaseUrl()!;
      vi.resetModules();
      const { ensureTenantForUser } = await import("@/lib/tenant-auth");
      const { db } = await import("@/lib/db");

      const [first, concurrent] = await Promise.all([
        ensureTenantForUser(authId, `${marker}@example.invalid`),
        ensureTenantForUser(authId, `${marker}@example.invalid`),
      ]);
      tenantId = first;
      expect(concurrent).toBe(first);

      const [insideWindow] = await sql<{ event_count: number; last_accessed_at: Date | null }[]>`
        SELECT
          (SELECT count(*)::int FROM tenant_access_events WHERE tenant_id = ${first}::uuid) AS event_count,
          last_accessed_at
        FROM tenants
        WHERE id = ${first}::uuid`;
      expect(insideWindow.event_count).toBe(1);
      expect(insideWindow.last_accessed_at).not.toBeNull();

      await sql`UPDATE tenants SET last_accessed_at = now() - INTERVAL '16 minutes' WHERE id = ${first}::uuid`;
      await ensureTenantForUser(authId, `${marker}@example.invalid`);

      const [afterWindow] = await sql<{ event_count: number }[]>`
        SELECT count(*)::int AS event_count
        FROM tenant_access_events
        WHERE tenant_id = ${first}::uuid`;
      expect(afterWindow.event_count).toBe(2);
      appDb = db();
    } finally {
      if (tenantId) await sql`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
      if (appDb) await appDb.end({ timeout: 5 });
      await sql.end({ timeout: 5 });
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      vi.resetModules();
    }
  });
});
