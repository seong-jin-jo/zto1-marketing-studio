import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import { getDatabaseUrl } from "../isolation/_env";

// Regression: OSMU-BLOCK-F2. 같은 플랫폼의 계정 B 성공이 계정 A의 열린 장애까지 닫던 결함.
// Found by 교차 모델 검수 on 2026-08-28.
// Report: docs/_archive/legacy-20260912/audit/osmu-cross-review-2026-08-28-opus.md

describe("운영 장애 계정 단위 복구 회귀", () => {
  it("OSMU-BLOCK-F2 정상: 계정 B 복구는 계정 A의 열린 발행 장애를 닫지 않는다", async (ctx) => {
    const url = getDatabaseUrl();
    if (!url) {
      if (process.env.CI) throw new Error("CI requires DATABASE_URL for F2 regression");
      ctx.skip();
      return;
    }
    const admin = postgres(url, { max: 3, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
    const tenantId = randomUUID();
    const accountA = randomUUID();
    const accountB = randomUUID();
    const previousUrl = process.env.DATABASE_URL;
    let appDb: { end: (options: { timeout: number }) => Promise<void> } | null = null;
    try {
      await admin`INSERT INTO tenants (id, slug, name, status, tier)
        VALUES (${tenantId}::uuid, ${`incident-f2-${tenantId}`}, 'Incident F2', 'active', 'team')`;
      process.env.DATABASE_URL = url;
      vi.resetModules();
      const { recordOperationalIncident, recoverOperationalIncidents } = await import("@/lib/observability/incidents");
      for (const accountId of [accountA, accountB]) {
        await recordOperationalIncident({
          workspaceId: tenantId,
          category: "publish_failed",
          source: "threads",
          reasonCode: "http_4xx",
          severity: "warning",
          intervention: "human",
          resourceKey: `account:${accountId}`,
        });
      }

      await recoverOperationalIncidents(tenantId, {
        category: "publish_failed",
        source: "threads",
        resourceKey: `account:${accountB}`,
      });

      const rows = await admin<{ fingerprint: string; status: string }[]>`
        SELECT fingerprint, status FROM operational_incidents
        WHERE tenant_id = ${tenantId} ORDER BY fingerprint`;
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.fingerprint.includes(accountA))?.status).toBe("open");
      expect(rows.find((row) => row.fingerprint.includes(accountB))?.status).toBe("recovered");
      const { db } = await import("@/lib/db");
      appDb = db();
    } finally {
      await admin`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
      if (appDb) await appDb.end({ timeout: 5 });
      await admin.end({ timeout: 5 });
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      vi.resetModules();
    }
  });
});
