import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { GET as metricsGet } from "@/app/api/metrics/route";
import { getDatabaseUrl } from "../isolation/_env";

type Sql = ReturnType<typeof postgres>;

// 성과실이 "실제 프로덕션 수준"이라는 말이 서려면, 발행된 글이 데이터베이스에 있을 때
// 성과 경로가 그 글을 실제 수치로 돌려줘야 한다. 화면 단위 테스트는 가짜 배열을 넣어
// 그리기만 확인하므로, 발행 기록과 성과 응답이 같은 것을 가리키는지는 증명하지 못한다.
// 이 판은 CI 와 같은 postgres 에 발행 기록을 직접 넣고 성과 경로를 그대로 호출한다.
async function tryConnect(): Promise<Sql | null> {
  const url = getDatabaseUrl();
  if (!url) return null;
  if (!process.env.DATABASE_URL) return null;
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

describe("성과 실데이터 통합 (live Postgres)", () => {
  it("성과-실데이터-01 정상: 발행된 글이 있으면 성과 경로가 그 글을 실제 수치로 돌려준다", async (context) => {
    const sql = await tryConnect();
    if (!sql) {
      if (process.env.CI) throw new Error("CI requires a reachable PostgreSQL service for performance QA");
      return context.skip();
    }

    const [tenant] = await sql<{ id: string }[]>`
      select id from tenants where slug = 'seed-a' limit 1`;
    if (!tenant) {
      await sql.end({ timeout: 5 });
      if (process.env.CI) throw new Error("CI requires the seed-a tenant for performance QA");
      return context.skip();
    }

    const externalId = `perf-qa-${Date.now()}`;
    try {
      await sql`
        insert into published_posts
          (tenant_id, platform, external_id, permalink, text, status, published_at,
           views, likes, replies, reposts, metrics_at)
        values (${tenant.id}, 'threads', ${externalId}, 'https://example.test/p/1',
                '성과 통합 확인용 글', 'published', now(), 1234, 56, 7, 8, now())`;

      const response = await metricsGet(new Request(
        `https://example.test/api/metrics?tenant_id=${tenant.id}`,
      ));
      const body = await response.json() as {
        posts?: Array<Record<string, unknown>>;
        coverage?: { platforms?: Array<Record<string, unknown>> };
      };

      const mine = (body.posts ?? []).find((post) => post.external_id === externalId);
      expect(mine, "발행 기록이 성과 응답에 없다").toBeTruthy();
      // 빈 화면이 아니라 실제 수치여야 한다. 성과실의 조회·좋아요·답글이 여기서 온다.
      expect(Number(mine?.views)).toBe(1234);
      expect(Number(mine?.likes)).toBe(56);
      expect(Number(mine?.replies)).toBe(7);
      expect(String(mine?.status)).toBe("published");
      expect(mine?.metrics_at, "수집 시각이 없으면 성과실은 미수집으로 표시한다").toBeTruthy();

      // 수집 범위 요약도 이 글을 센다. 성과실 상단의 표본 수가 여기서 나온다.
      const threads = (body.coverage?.platforms ?? []).find((row) => row.platform === "threads");
      expect(threads, "수집 범위 요약에 threads 가 없다").toBeTruthy();
      expect(Number(threads?.publishedCount)).toBeGreaterThan(0);
      expect(Number(threads?.collectedCount)).toBeGreaterThan(0);
      // 수집까지 끝난 글이므로 미수집 사유가 남아 있으면 안 된다. 남으면 성과실이
      // 수치를 보여 주면서 동시에 "아직 수집 안 함"이라고 말하는 모순이 된다.
      expect(threads?.missingReason ?? null).toBeNull();
    } finally {
      await sql`delete from published_posts where tenant_id = ${tenant.id} and external_id = ${externalId}`;
      await sql.end({ timeout: 5 });
    }
  });
});
