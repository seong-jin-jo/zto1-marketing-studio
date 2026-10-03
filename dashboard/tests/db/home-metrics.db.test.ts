import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { db } from "@/lib/db";
import { getHomeSummary, getWeeklyReport } from "@/lib/home-metrics";
import { getDatabaseUrl } from "../isolation/_env";

type Sql = ReturnType<typeof postgres>;
let cleanupTarget: { url: string; tenantId: string } | null = null;

function testDatabaseUrl(): string {
  const url = getDatabaseUrl();
  if (!url) throw new Error("R-02 DB 통합 검증에는 DATABASE_URL이 필요합니다.");
  const parsed = new URL(url);
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  const ciService = process.env.CI === "true" && parsed.hostname === "postgres";
  if ((!localHost && !ciService) || parsed.pathname !== "/testdb") {
    throw new Error("R-02 DB 통합 검증은 로컬 또는 CI의 testdb에서만 실행합니다.");
  }
  return url;
}

async function deleteAndAssertFixture(sql: Sql, tenantId: string): Promise<void> {
  // FK CASCADE가 이 테스트의 게시물·큐·성장 행까지 함께 회수한다.
  await sql`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
  const [remaining] = await sql<{ count: number }[]>`
    SELECT (SELECT count(*) FROM tenants WHERE id = ${tenantId}::uuid)
         + (SELECT count(*) FROM published_posts WHERE tenant_id = ${tenantId}::uuid)
         + (SELECT count(*) FROM queue_posts WHERE tenant_id = ${tenantId}::uuid)
         + (SELECT count(*) FROM growth_metrics WHERE tenant_id = ${tenantId}::uuid) AS count`;
  expect(Number(remaining.count)).toBe(0);
}

afterEach(async () => {
  const target = cleanupTarget;
  if (!target) return;
  // 테스트 본문이 시간 초과되어 finally 정리가 끝나지 않아도 독립 연결로 다시 지운다.
  const sql = postgres(target.url, { max: 1, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
  try {
    await deleteAndAssertFixture(sql, target.tenantId);
  } finally {
    cleanupTarget = null;
    await sql.end({ timeout: 5 });
  }
}, 20_000);

describe("R-02 홈 지표 live Postgres 통합", () => {
  it("R-02-DB-01 한국어 설명: 자체 테넌트의 상태·성과·주간 수치만 집계하고 테스트 데이터를 회수한다", async () => {
    const url = testDatabaseUrl();
    const sql = postgres(url, { max: 2, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
    const tenantId = randomUUID();
    const ids = Array.from({ length: 8 }, () => randomUUID());
    const previousUrl = process.env.DATABASE_URL;
    let appSql: Sql | null = null;
    cleanupTarget = { url, tenantId };

    try {
      await sql`SELECT 1`;
      await sql`INSERT INTO tenants (id, slug, name, status, tier)
        VALUES (${tenantId}::uuid, ${`qa-home-${tenantId}`}, 'Home metrics QA', 'active', 'team')`;
      await sql`INSERT INTO published_posts
        (id, tenant_id, platform, external_id, text, status, published_at, views, likes, replies)
        VALUES
        (${ids[0]}::uuid, ${tenantId}::uuid, 'threads', ${`qa-${ids[0]}`}, '주간 인기 글', 'published', now() - interval '1 hour', 600, 30, 5),
        (${ids[1]}::uuid, ${tenantId}::uuid, 'x', ${`qa-${ids[1]}`}, '주간 일반 글', 'published', now() - interval '2 hours', 100, 3, 2),
        (${ids[2]}::uuid, ${tenantId}::uuid, 'instagram', ${`qa-${ids[2]}`}, '지난주 글', 'published', now() - interval '10 days', 300, 20, 1),
        (${ids[3]}::uuid, ${tenantId}::uuid, 'threads', ${`qa-${ids[3]}`}, '실패한 글', 'failed', now() - interval '1 hour', 999, 99, 99)`;
      await sql`INSERT INTO queue_posts (id, tenant_id, text, status, generated_at)
        VALUES
        (${ids[4]}::uuid, ${tenantId}::uuid, '새 초안', 'draft', now() - interval '1 hour'),
        (${ids[5]}::uuid, ${tenantId}::uuid, '새 승인 글', 'approved', now() - interval '2 hours'),
        (${ids[6]}::uuid, ${tenantId}::uuid, '지난주 발행 글', 'published', now() - interval '10 days'),
        (${ids[7]}::uuid, ${tenantId}::uuid, '생성 전 실패', 'failed', NULL)`;
      await sql`INSERT INTO growth_metrics (tenant_id, channel, followers, recorded_at)
        VALUES (${tenantId}::uuid, 'threads', 100, now() - interval '8 days'),
               (${tenantId}::uuid, 'threads', 125, now())`;

      // src/lib/db.ts는 환경 변수만 읽는다. 파일에서 찾은 동일 testdb를 앱 풀에도 연결한다.
      process.env.DATABASE_URL = url;
      appSql = db();
      const summary = await getHomeSummary(tenantId);
      expect(summary.statusCounts).toEqual({ draft: 1, approved: 1, published: 1, failed: 1 });
      expect(summary).toMatchObject({
        published: 3, views: 1000, likes: 53, replies: 8, engagementRate: 6.1,
        followers: 125, weekDelta: 25,
        channelCounts: { threads: 1, x: 1, instagram: 1 },
      });
      expect(summary.viralPosts).toEqual([{ id: ids[0], text: '주간 인기 글', views: 600, likes: 30 }]);

      const weekly = await getWeeklyReport(tenantId);
      expect(weekly).toMatchObject({
        publishedThisWeek: 2, draftedThisWeek: 2,
        views: 700, likes: 33, replies: 7,
        byPlatform: { threads: 1, x: 1 }, followers: 125, weekDelta: 25,
      });
      expect(weekly.viralPosts).toEqual([{ text: '주간 인기 글', views: 600, likes: 30 }]);
    } finally {
      try {
        await deleteAndAssertFixture(sql, tenantId);
      } finally {
        try {
          if (appSql) await appSql.end({ timeout: 5 });
        } finally {
          try {
            await sql.end({ timeout: 5 });
          } finally {
            if (previousUrl === undefined) delete process.env.DATABASE_URL;
            else process.env.DATABASE_URL = previousUrl;
          }
        }
      }
    }
  }, 20_000);
});
