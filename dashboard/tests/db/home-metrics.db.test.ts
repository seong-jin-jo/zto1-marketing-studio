import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { getHomeSummary, getWeeklyReport } from "@/lib/home-metrics";
import { getDatabaseUrl } from "../isolation/_env";

type Sql = ReturnType<typeof postgres>;

async function tryConnect(): Promise<Sql | null> {
  const url = getDatabaseUrl();
  if (!url) return null;
  // 검증 대상(src/lib/db.ts)은 process.env.DATABASE_URL 만 읽는다. 그 값이 없으면
  // 테스트만 파일에서 URL 을 찾아 붙고 코드는 "미설정"으로 죽는다. 같은 DB 를 보지
  // 못하는 상태이므로 이 판은 통합 검증이 성립하지 않는다. 조용히 건너뛴다.
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

describe("R-02 홈 지표 live Postgres 통합", () => {
  it("published_posts와 queue_posts 집계를 API 헬퍼가 같은 값으로 반환한다", async (context) => {
    const sql = await tryConnect();
    if (!sql) return context.skip();
    try {
      const [tenant] = await sql<{ id: string }[]>`
        SELECT tenant_id AS id FROM published_posts GROUP BY tenant_id ORDER BY count(*) DESC LIMIT 1`;
      if (!tenant) return context.skip();
      const [expected] = await sql<{ published: number; views: number; likes: number; replies: number }[]>`
        SELECT count(*) FILTER (WHERE status = 'published')::int AS published,
               coalesce(sum(views) FILTER (WHERE status = 'published'), 0)::int AS views,
               coalesce(sum(likes) FILTER (WHERE status = 'published'), 0)::int AS likes,
               coalesce(sum(replies) FILTER (WHERE status = 'published'), 0)::int AS replies
        FROM published_posts WHERE tenant_id = ${tenant.id}`;

      const summary = await getHomeSummary(tenant.id);
      expect(summary).toMatchObject(expected);

      const [expectedDrafts] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM queue_posts
        WHERE tenant_id = ${tenant.id} AND generated_at > now() - interval '7 days'`;
      const weekly = await getWeeklyReport(tenant.id);
      expect(weekly.draftedThisWeek).toBe(expectedDrafts.count);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
