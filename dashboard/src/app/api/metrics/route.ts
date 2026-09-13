import { withTenant } from "@/lib/db";
import { collectMetrics } from "@/lib/metrics-collector";
import {
  buildPerformanceMetricsCoverage,
  type MetricsCoverageAggregateRow,
} from "@/lib/performance-metrics-coverage";
import { effectiveTenantId } from "@/lib/tenant-auth";

// GET /api/metrics?tenant_id=... - 발행물 + 성과 목록
export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) {
    return Response.json({ posts: [], coverage: buildPerformanceMetricsCoverage([]) });
  }
  try {
    const { posts, coverageRows } = await withTenant(tenantId, async (sql) => {
      const posts = await sql`
        SELECT id, platform, external_id, permalink, text, status, error, published_at,
               views, likes, replies, reposts, metrics_at,
               provider_meta -> 'metricsBlocked' AS metrics_blocked
        FROM published_posts WHERE tenant_id = ${tenantId}
        ORDER BY published_at DESC LIMIT 100`;
      const coverageRows = await sql<MetricsCoverageAggregateRow[]>`
        SELECT platform,
               COUNT(*) FILTER (WHERE status = 'published')::int AS published_count,
               COUNT(*) FILTER (WHERE status = 'published' AND metrics_at IS NOT NULL)::int AS collected_count,
               MAX(metrics_at)::text AS last_collected_at
        FROM published_posts
        WHERE tenant_id = ${tenantId}
        GROUP BY platform`;
      return { posts, coverageRows };
    });
    return Response.json({ posts, coverage: buildPerformanceMetricsCoverage(coverageRows) });
  } catch (error) {
    return Response.json({
      posts: [],
      coverage: buildPerformanceMetricsCoverage([]),
      error: String(error),
    }, { status: 500 });
  }
}

// POST /api/metrics - 외부 호출은 DB transaction 밖에서 수행하고 결과만 짧게 저장한다.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { tenant_id?: string };
  const tenantId = await effectiveTenantId(request, body.tenant_id);
  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 400 });

  try {
    const result = await collectMetrics(tenantId);
    if (!result) {
      return Response.json({
        ok: false,
        error: "성과를 읽어 올 수 있는 채널이 연결돼 있지 않습니다. Threads, X, Instagram, Facebook, YouTube, TikTok 중 하나를 연결해 주세요.",
      }, { status: 400 });
    }
    const failureCodes = result.failures.map((failure) => failure.code);
    const status = result.partial
      ? 207
      : result.ok
        ? 200
        // 남은 것이 집계 대기뿐이면 장애가 아니라 "접수했고 아직 기다리는 중" 이다.
        // 503 으로 말하면 화면이 장애로 읽고 사용자는 멀쩡한 채널을 손보게 된다.
        : failureCodes.length > 0 && failureCodes.every((code) => code === "metrics_pending_ingest")
        ? 202
        : failureCodes.includes("collection_in_progress")
          ? 409
          : failureCodes.some((code) => code.endsWith("_429") || code === "provider_429")
            ? 429
            // 빈 목록에도 every 는 true 다. 실패 코드가 없는데 권한 오류로 말하면 안 된다.
            : failureCodes.length > 0 && failureCodes.every((code) => code === "insights_forbidden")
              ? 424
              // 계정 불일치는 다시 시도한다고 풀리지 않는다. 장애(503)로 말하면 화면이
              // 재시도를 권하고 사용자는 될 일이 없는 일을 반복한다.
              : failureCodes.length > 0 && failureCodes.every((code) => code === "post_not_in_account")
                ? 422
                : 503;
    return Response.json(result, { status });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
