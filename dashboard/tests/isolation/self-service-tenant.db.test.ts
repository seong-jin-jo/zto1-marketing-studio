import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { getDatabaseUrl } from "./_env";

type Sql = ReturnType<typeof postgres>;

async function connectRequired(ctx: { skip: () => void }): Promise<Sql | null> {
  const url = getDatabaseUrl();
  if (!url) {
    if (process.env.CI) throw new Error("CI requires DATABASE_URL for self-service tenant isolation QA");
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

// 실제 PostgreSQL(schema.sql + rls.sql 적용)에서 새 Supabase 사용자 A/B의 최초 로그인 경로를
// 재현한다. mock으로 withTenant 결과를 꾸미지 않고, RLS role로 각 테이블을 직접 읽고/쓰므로
// integrations·channel_accounts/default·queue·schedule·published_posts의 교차 tenant 접근을 함께 막는다.
describe("self-service Supabase users A/B — live PostgreSQL tenant boundary", () => {
  it("최초 로그인은 tenant를 멱등 provision하고 A/B OAuth 계정·콘텐츠를 서로 볼 수도 쓸 수도 없다", async (ctx) => {
    const sql = await connectRequired(ctx);
    if (!sql) return;

    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousSecret = process.env.OSMU_SECRET_KEY;
    const dataRoot = mkdtempSync(path.join(tmpdir(), "osmu-self-service-db-"));
    const authA = randomUUID();
    const authB = randomUUID();
    const marker = `qa-self-service-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const createdTenantIds: string[] = [];
    let appDb: { end: (options: { timeout: number }) => Promise<void> } | null = null;

    try {
      // file-io는 import 시 DATA_DIR을 고정하므로 실제 DB 검증과 별개로 이 테스트 전용 파일 루트를
      // 설정한 뒤 모듈 캐시를 리셋한다. 외부/기존 tenant 파일은 절대 건드리지 않는다.
      process.env.DATABASE_URL = getDatabaseUrl()!;
      process.env.OSMU_SECRET_KEY = "self-service-tenant-db-test-key";
      process.env.DATA_DIR = dataRoot;
      vi.resetModules();

      const { ensureTenantForUser } = await import("@/lib/tenant-auth");
      const { withTenant, db } = await import("@/lib/db");
      const { upsertChannelAccount, setDefaultAccount, listChannelAccounts } = await import("@/lib/channel-accounts");
      const { runWithTenant } = await import("@/lib/tenant-context");
      const { dataPath } = await import("@/lib/file-io");

      // 같은 신규 사용자의 병렬 /api/me 요청도 tenant 한 개로 수렴해야 한다.
      const [tenantA, duplicateTenantA, tenantB] = await Promise.all([
        ensureTenantForUser(authA, `${marker}-a@example.invalid`),
        ensureTenantForUser(authA, `${marker}-a@example.invalid`),
        ensureTenantForUser(authB, `${marker}-b@example.invalid`),
      ]);
      createdTenantIds.push(tenantA, tenantB);
      expect(tenantA).toBe(duplicateTenantA);
      expect(tenantA).not.toBe(tenantB);

      const provisioned = await sql<{ id: string; owner_auth_id: string; status: string }[]>`
        select id, owner_auth_id::text, status
        from tenants
        where id in (${tenantA}::uuid, ${tenantB}::uuid)
        order by owner_auth_id`;
      expect(provisioned).toHaveLength(2);
      expect(provisioned.map((row) => row.owner_auth_id).sort()).toEqual([authA, authB].sort());
      expect(provisioned.every((row) => row.status === "active")).toBe(true);

      // OAuth callback 저장과 기본 계정 전환의 실제 DB 경로. 첫 계정만 기본이 되고, 전환은 legacy
      // integrations 미러까지 같은 tenant 안에서 갱신해야 한다.
      const aFirst = await upsertChannelAccount({ tenantId: tenantA, provider: marker, externalId: "account-a-1", accessToken: "a-token-1" });
      const aSecond = await upsertChannelAccount({ tenantId: tenantA, provider: marker, externalId: "account-a-2", accessToken: "a-token-2" });
      const bFirst = await upsertChannelAccount({ tenantId: tenantB, provider: marker, externalId: "account-b-1", accessToken: "b-token-1" });
      expect(aFirst.isDefault).toBe(true);
      expect(aSecond.isDefault).toBe(false);
      expect(bFirst.isDefault).toBe(true);
      expect(await setDefaultAccount(tenantA, marker, aSecond.id)).toEqual({ ok: true });
      expect((await listChannelAccounts(tenantA, marker)).filter((account) => account.is_default).map((account) => account.id)).toEqual([aSecond.id]);

      const queueId = randomUUID();
      await withTenant(tenantA, async (tx) => {
        await tx`
          insert into queue_posts (id, tenant_id, text, status)
          values (${queueId}::uuid, ${tenantA}::uuid, ${"A private queue"}, 'approved')`;
        await tx`
          insert into schedules (tenant_id, platforms, scheduled_at, status, account_id)
          values (${tenantA}::uuid, ARRAY[${marker}], now() + interval '1 hour', 'scheduled', ${aSecond.id}::uuid)`;
        await tx`
          insert into published_posts (tenant_id, platform, text, status, account_id)
          values (${tenantA}::uuid, ${marker}, ${"A private published post"}, 'published', ${aSecond.id}::uuid)`;
      });

      // images는 DB 테이블이 아니라 tenant-context 기반 filesystem이다. 같은 A/B ids로 실제 경로를
      // 만들고 B context가 A 파일명을 해석할 수 없는지 함께 검증한다.
      const aImagePath = runWithTenant(tenantA, () => dataPath("images/a-private.png"));
      const bSameNamePath = runWithTenant(tenantB, () => dataPath("images/a-private.png"));
      mkdirSync(path.dirname(aImagePath), { recursive: true });
      writeFileSync(aImagePath, "a-only", { flag: "w" });
      expect(existsSync(aImagePath)).toBe(true);
      expect(existsSync(bSameNamePath)).toBe(false);

      const aOwned = await withTenant(tenantA, async (tx) => {
        const [integrations] = await tx<{ c: number }[]>`select count(*)::int as c from integrations where kind = 'channel' and label = ${marker}`;
        const [accounts] = await tx<{ c: number; defaults: number }[]>`
          select count(*)::int as c, count(*) filter (where is_default)::int as defaults
          from channel_accounts where provider = ${marker}`;
        const [queue] = await tx<{ c: number }[]>`select count(*)::int as c from queue_posts where id = ${queueId}::uuid`;
        const [schedules] = await tx<{ c: number }[]>`select count(*)::int as c from schedules where account_id = ${aSecond.id}::uuid`;
        const [published] = await tx<{ c: number }[]>`select count(*)::int as c from published_posts where account_id = ${aSecond.id}::uuid`;
        return { integrations: integrations.c, accounts: accounts.c, defaults: accounts.defaults, queue: queue.c, schedules: schedules.c, published: published.c };
      });
      expect(aOwned).toEqual({ integrations: 1, accounts: 2, defaults: 1, queue: 1, schedules: 1, published: 1 });

      const bViewOfA = await withTenant(tenantB, async (tx) => {
        const [integrations] = await tx<{ c: number }[]>`select count(*)::int as c from integrations where kind = 'channel' and label = ${marker}`;
        const [accounts] = await tx<{ c: number }[]>`select count(*)::int as c from channel_accounts where provider = ${marker} and id in (${aFirst.id}::uuid, ${aSecond.id}::uuid)`;
        const [queue] = await tx<{ c: number }[]>`select count(*)::int as c from queue_posts where id = ${queueId}::uuid`;
        const [schedules] = await tx<{ c: number }[]>`select count(*)::int as c from schedules where account_id = ${aSecond.id}::uuid`;
        const [published] = await tx<{ c: number }[]>`select count(*)::int as c from published_posts where account_id = ${aSecond.id}::uuid`;
        return { integrations: integrations.c, accounts: accounts.c, queue: queue.c, schedules: schedules.c, published: published.c };
      });
      expect(bViewOfA).toEqual({ integrations: 0, accounts: 0, queue: 0, schedules: 0, published: 0 });

      // 단순 "0행 조회"뿐 아니라 B의 tenant_id로 쓰는 시도도 WITH CHECK가 실제 PostgreSQL에서 거부한다.
      await expect(withTenant(tenantA, (tx) => tx`
        insert into integrations (tenant_id, kind, label, secret_enc)
        values (${tenantB}::uuid, 'channel', ${`${marker}-cross-write`}, 'must-not-write')
      `)).rejects.toThrow();

      appDb = db();
    } finally {
      // tenants FK cascade로 테스트가 만든 OAuth/queue/schedule/published 행만 회수한다.
      if (createdTenantIds.length) await sql`delete from tenants where id = any(${createdTenantIds}::uuid[])`;
      if (appDb) await appDb.end({ timeout: 5 });
      await sql.end({ timeout: 5 });
      rmSync(dataRoot, { recursive: true, force: true });
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousSecret === undefined) delete process.env.OSMU_SECRET_KEY;
      else process.env.OSMU_SECRET_KEY = previousSecret;
      delete process.env.DATA_DIR;
      vi.resetModules();
    }
  // tenant provision, RLS 읽기/쓰기, 정리까지 실제 PostgreSQL을 왕복한다. 전체 CI 병렬
  // 실행에서 기본 5초를 넘겨도 계약 실패로 오인하지 않도록 명시적 DB 예산을 둔다.
  }, 30_000);
});
