import { afterEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { POST as publishPost } from "@/app/api/publish/route";
import { GET as metricsGet } from "@/app/api/metrics/route";
import { upsertChannelAccount } from "@/lib/channel-accounts";
import { getDatabaseUrl } from "../isolation/_env";

type Sql = ReturnType<typeof postgres>;

// 발행 축을 실제 경로로 닫는다.
//
// 지금까지 발행 검증은 화면 단위(가짜 apiPost)와 DB 단위(직접 INSERT)로 나뉘어 있었다.
// 그 사이가 비어 있어서, 발행 요청이 실제로 published_posts 를 남기고 그것이 성과 응답까지
// 이어지는지는 아무도 증명하지 않았다. 회장이 겪은 "발행했는데 성과에 아무것도 없다"가
// 정확히 그 구간이다. 여기서는 실 라우트 두 개와 실 Postgres 를 쓰고, 바깥 플랫폼 호출만
// 흉내 낸다. 바깥으로 실제 글을 올리지 않으면서 우리 쪽 사슬 전체를 확인하는 자리다.
async function tryConnect(): Promise<Sql | null> {
  const url = getDatabaseUrl();
  if (!url || !process.env.DATABASE_URL) return null;
  let sql: Sql | null = null;
  try {
    sql = postgres(url, { max: 3, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
    await sql`select 1`;
    return sql;
  } catch {
    if (sql) await sql.end({ timeout: 5 });
    return null;
  }
}

const previousSecretKey = process.env.OSMU_SECRET_KEY;
afterEach(() => {
  vi.unstubAllGlobals();
  if (previousSecretKey === undefined) delete process.env.OSMU_SECRET_KEY;
  else process.env.OSMU_SECRET_KEY = previousSecretKey;
});

/** Threads 쪽 호출만 흉내 낸다. 우리 코드 경로는 그대로 돈다. */
function stubThreadsProvider(mediaId: string) {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = String(typeof input === "object" && "url" in input ? input.url : input);
    if (url.includes("/me")) return Response.json({ id: "threads-user-1", username: "qa-account" });
    if (url.includes("/threads_publish")) return Response.json({ id: mediaId });
    if (url.includes("/threads")) return Response.json({ id: "container-1" });
    if (url.includes(mediaId)) {
      return Response.json({ id: mediaId, permalink: `https://www.threads.net/@qa-account/post/${mediaId}`, status: "FINISHED" });
    }
    return Response.json({ status: "FINISHED" });
  }));
}

describe("발행에서 성과까지 (실 라우트 + 라이브 Postgres)", () => {
  it("발행-성과-01 정상: 발행 요청이 발행 기록을 남기고 그 글이 성과 응답에 나온다", async (context) => {
    const sql = await tryConnect();
    if (!sql) {
      if (process.env.CI) throw new Error("CI requires a reachable PostgreSQL service for publish QA");
      return context.skip();
    }

    const [tenant] = await sql<{ id: string }[]>`
      select id from tenants where slug = 'seed-a' limit 1`;
    if (!tenant) {
      await sql.end({ timeout: 5 });
      if (process.env.CI) throw new Error("CI requires the seed-a tenant for publish QA");
      return context.skip();
    }

    process.env.OSMU_SECRET_KEY = "qa-publish-to-performance-key";
    const mediaId = `qa-media-${Date.now()}`;
    const externalAccountId = `qa-acct-${Date.now()}`;
    stubThreadsProvider(mediaId);

    try {
      await sql`delete from channel_accounts where tenant_id = ${tenant.id} and provider = 'threads'`;
      await upsertChannelAccount({
        tenantId: tenant.id,
        provider: "threads",
        externalId: externalAccountId,
        accessToken: "qa-threads-token",
        tokenExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
      });

      const body = { tenant_id: tenant.id, platform: "threads", text: "발행에서 성과까지 확인용 글" };
      const response = await publishPost(new Request("https://example.test/api/publish", {
        method: "POST",
        // 초안 번호 없는 발행은 멱등 키를 요구한다. 같은 요청이 두 번 들어와도 두 번
        // 올리지 않기 위한 계약이고, 이 판은 그 계약을 지켜 통과해야 한다.
        headers: { "Content-Type": "application/json", "Idempotency-Key": `qa-${mediaId}` },
        body: JSON.stringify(body),
      }));
      const published = await response.json() as { ok?: boolean; permalink?: string; error?: string };

      expect(published.error ?? null, "발행이 거절됐다").toBeNull();
      expect(published.ok, "발행이 성공으로 닫히지 않았다").toBe(true);

      // 우리 기록에 남았는가. 남지 않으면 성과실은 영원히 빈 화면이다.
      const [row] = await sql<{ status: string; external_id: string }[]>`
        select status, external_id from published_posts
        where tenant_id = ${tenant.id} and external_id = ${mediaId}`;
      expect(row, "발행 기록이 남지 않았다").toBeTruthy();
      expect(row.status).toBe("published");

      // 그 기록이 성과 경로까지 이어지는가.
      const metrics = await metricsGet(new Request(
        `https://example.test/api/metrics?tenant_id=${tenant.id}`,
      ));
      const metricsBody = await metrics.json() as { posts?: Array<Record<string, unknown>> };
      const mine = (metricsBody.posts ?? []).find((post) => post.external_id === mediaId);
      expect(mine, "발행한 글이 성과 응답에 없다").toBeTruthy();
      expect(String(mine?.status)).toBe("published");
    } finally {
      await sql`delete from published_posts where tenant_id = ${tenant.id} and external_id = ${mediaId}`;
      await sql`delete from channel_accounts where tenant_id = ${tenant.id} and external_account_id = ${externalAccountId}`;
      await sql.end({ timeout: 5 });
    }
  });
});
