import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import postgres from "postgres";
import { getDatabaseUrl } from "../isolation/_env";
import { recordPublicationEvent } from "@/lib/usage-events";

type Sql = ReturnType<typeof postgres>;

async function tryConnect(): Promise<Sql | null> {
  const url = getDatabaseUrl();
  if (!url) return null;
  let sql: Sql | null = null;
  try {
    sql = postgres(url, { max: 2, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
    await sql`select 1`;
    return sql;
  } catch {
    if (sql) await sql.end({ timeout: 5 });
    return null;
  }
}

describe("발행 사용량 outbox 실 Postgres 통합", () => {
  it("CODE-REVIEW-20260917-10 경합: pending 발행을 두 번 relay해도 장부는 한 번만 늘어난다", async (ctx) => {
    const databaseUrl = getDatabaseUrl();
    if (!databaseUrl) return ctx.skip();
    const previousDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl;
    const sql = await tryConnect();
    if (!sql) {
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      return ctx.skip();
    }

    const publicationId = crypto.randomUUID();
    const marker = `usage-outbox-db-${publicationId}`;
    let tenantId = "";
    try {
      const [tenant] = await sql<{ id: string }[]>`select id::text from tenants order by id limit 1`;
      if (!tenant) return ctx.skip();
      tenantId = tenant.id;

      await sql`
        insert into published_posts (
          id, tenant_id, platform, external_id, text, status, provider_meta, published_at
        ) values (
          ${publicationId}::uuid, ${tenantId}::uuid, 'threads', ${marker}, ${marker}, 'published',
          ${sql.json({ usageEvent: { status: "pending", platform: "threads" } })}::jsonb,
          now()
        )`;

      const first = await recordPublicationEvent(tenantId, publicationId, "threads");
      const second = await recordPublicationEvent(tenantId, publicationId, "threads");
      const [usage] = await sql<{ count: number }[]>`
        select count(*)::int as count
          from usage_events
         where tenant_id = ${tenantId}::uuid
           and event_type = 'publication'
           and meta ->> 'publicationId' = ${publicationId}`;
      const [publication] = await sql<{ status: string | null }[]>`
        select provider_meta #>> '{usageEvent,status}' as status
          from published_posts
         where id = ${publicationId}::uuid`;

      expect(first).toEqual({ recorded: true, alreadyRecorded: false });
      expect(second).toEqual({ recorded: false, alreadyRecorded: true });
      expect(usage.count).toBe(1);
      expect(publication.status).toBe("recorded");
    } finally {
      if (tenantId) {
        await sql`delete from usage_events where tenant_id = ${tenantId}::uuid and meta ->> 'publicationId' = ${publicationId}`;
        await sql`delete from published_posts where id = ${publicationId}::uuid`;
      }
      await sql.end({ timeout: 5 });
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });
});
