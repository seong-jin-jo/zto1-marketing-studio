import { db, withTenant } from "@/lib/db";
import { collectMetrics, failureDetailsFor, reinstateMetricsTarget } from "@/lib/metrics-collector";
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
               provider_meta -> 'metricsBlocked' AS metrics_blocked,
               -- "그 글 어디 갔냐" 에 답할 수 있는 유일한 자리. 수집에서 내려놓은 글도
               -- 목록에는 그대로 서고, 왜 언제 내려놨는지를 이 줄이 들고 온다(ADR-007).
               provider_meta -> 'metricsRetired' AS metrics_retired
        FROM published_posts WHERE tenant_id = ${tenantId}
        ORDER BY published_at DESC LIMIT 100`;
      const coverageRows = await sql<MetricsCoverageAggregateRow[]>`
        SELECT platform,
               COUNT(*) FILTER (WHERE status = 'published')::int AS published_count,
               -- 내려놓은 글은 collected 에서 뺀다. 한동안 잘 수집되다가 나중에 지워진 글은
               -- metrics_at 도 있고 metricsRetired 도 있다. 두 칸에 겹쳐 세면 "수집 가능한 글"
               -- 수가 부풀고, 그 숫자를 근거로 한 판정이 전부 조금씩 틀어진다.
               COUNT(*) FILTER (WHERE status = 'published' AND metrics_at IS NOT NULL AND provider_meta -> 'metricsRetired' IS NULL)::int AS collected_count,
               -- 수집에서 내려놓은 글. 이걸 안 세면 "발행 8건 중 7건 수집" 이 영원히 뜬다.
               COUNT(*) FILTER (WHERE status = 'published' AND provider_meta -> 'metricsRetired' IS NOT NULL)::int AS retired_count,
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

/**
 * 이 요청이 운영자인가.
 *
 * `/api/me` 와 같은 판정을 쓴다. 운영자 토큰이 설정돼 있고 그 값으로 왔으면 운영자다.
 * 토큰이 아예 설정 안 된 개발 환경에서는 전 API 가 공개라 운영자로 본다 — `/api/me` 가
 * 이미 그렇게 하고 있고, 여기만 다르게 굴면 개발에서 진단이 안 보인다.
 */
function isOperatorRequest(request: Request): boolean {
  const operatorToken = process.env.DASHBOARD_AUTH_TOKEN || "";
  if (!operatorToken) return true;
  const raw = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  return raw === operatorToken;
}

// 발행물이 하나라도 있는, 정지 안 된 테넌트 id 목록. RLS 우회 service-role(db())로 전
// 테넌트 스캔 — 운영자 전체 스윕 전용(테넌트 스코프 쿼리가 아니므로 withTenant 미사용).
// publish-due의 dueTenantIds()와 같은 패턴.
//
// 2026-10-02 독립 리뷰어 MINOR: tenants.status가 'paused'인 테넌트(schema.sql — 계정
// 정지, operator/customers/route.ts가 다루는 그 상태)는 외부 채널 조회를 시도할 이유가
// 없다 — 정지된 계정은 크론 때마다 매번 채널 오류를 겪고 실패 집계만 늘린다.
async function tenantIdsWithPublishedPosts(): Promise<string[]> {
  const sql = db();
  const rows = await sql<{ tenant_id: string }[]>`
    SELECT DISTINCT p.tenant_id
      FROM published_posts p
      JOIN tenants t ON t.id = p.tenant_id
     WHERE p.status = 'published' AND t.status = 'active'`;
  return rows.map((r) => r.tenant_id);
}

// POST /api/metrics - 외부 호출은 DB transaction 밖에서 수행하고 결과만 짧게 저장한다.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { tenant_id?: string; action?: string; post_id?: string };
  const tenantId = await effectiveTenantId(request, body.tenant_id);

  // 테넌트 미해석 — 운영자 토큰이면 전체 테넌트 스윕(단일 크론 진입점), 아니면 400.
  //
  // 2026-10-02 결함: 성과 수집은 지금까지 "성과 다시 수집하기" 버튼(테넌트 스코프
  // 1회성 호출)에서만 돌았다. 버튼을 안 누르면 영원히 안 수집되고, 실제로 2026-09-23
  // 마지막 수집 뒤 올린 글이 전부 미수집이었다(회장 2026-10-02 지적). publish-due가
  // 이미 쓰는 "운영자 토큰 + tenant_id 없음 = 전 테넌트 스윕" 계약을 그대로 따른다
  // (같은 자물쇠, 같은 호출 모양 — VM 크론이 /api/schedule/publish-due와 동일하게
  // 호출할 수 있다). 한 테넌트의 수집 실패가 다른 테넌트를 막지 않는다.
  if (!tenantId) {
    const raw = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
    const operatorToken = process.env.DASHBOARD_AUTH_TOKEN || "";
    if (!operatorToken || raw !== operatorToken) {
      return Response.json({ error: "tenant_id required" }, { status: 400 });
    }
    const tenantIds = await tenantIdsWithPublishedPosts();
    const tenants: Array<{ tenantId: string; ok: boolean; error?: string }> = [];
    let collected = 0;
    for (const tid of tenantIds) {
      try {
        const result = await collectMetrics(tid);
        if (result) {
          collected += 1;
          tenants.push({ tenantId: tid, ok: result.ok });
        } else {
          tenants.push({ tenantId: tid, ok: false, error: "연결된 채널 없음" });
        }
      } catch (error) {
        // 한 테넌트의 실패가 스윕 전체를 끊지 않는다 — 나머지 테넌트는 계속 돈다.
        //
        // 2026-10-02 Codex 교차검수(PR #104) MAJOR: 임의 예외의 .message를 응답에 그대로
        // 담으면 DB 연결 문자열·내부 URL·토큰이 포함된 예외가 그대로 나갈 수 있다(이
        // 라우트는 운영자 토큰으로만 닿지만, 이 파일의 다른 실패 경로들은 전부 원문을
        // 로그로만 보내고 응답은 고정 문구로 가린다 — 같은 경계를 지킨다).
        console.error("성과 수집 전체 스윕 실패", { tenantId: tid, error });
        tenants.push({ tenantId: tid, ok: false, error: "성과 수집에 실패했습니다. 서버 로그를 확인해 주세요." });
      }
    }
    return Response.json({ ok: true, mode: "all-tenants", tenantCount: tenantIds.length, collected, tenants });
  }

  /**
   * 내려놓은 글을 손으로 되돌린다.
   *
   * 새 라우트를 파지 않고 기존 라우트의 갈래로 둔다. 이 동작의 대상·권한·테넌트 판정이
   * 수집과 완전히 같고, 라우트를 늘리면 프록시 허용 목록에 한 줄을 더 태워야 한다(오늘 그
   * 누락으로 열 번 사고가 났다). 같은 자물쇠를 쓰는 문은 하나로 둔다.
   *
   * 운영자만 누를 수 있다. 되돌림은 "우리 판정이 틀렸다" 는 선언이고, 그 판단에는 고객이 못
   * 보는 진단(계정 대조·조회 쪽수)이 필요하다.
   */
  if (body.action === "reinstate") {
    /**
     * 여기만 fail-closed 다. `isOperatorRequest` 는 운영자 토큰이 아예 설정 안 된 환경을
     * "전부 운영자" 로 읽는데, 그건 **읽기**(진단 노출)에나 맞는 규칙이다. 되돌리기는 남의
     * 데이터를 바꾸는 쓰기다. 토큰이 안 걸린 배포가 한 번 나면 그 순간 고객 누구나 남의
     * 작업 공간 판정을 뒤집을 수 있게 된다. 설정을 잊은 것이 권한이 되어서는 안 된다.
     */
    if (!process.env.DASHBOARD_AUTH_TOKEN) {
      return Response.json({
        ok: false,
        error: "운영자 인증이 설정돼 있지 않아 되돌리기를 열 수 없습니다.",
      }, { status: 403 });
    }
    if (!isOperatorRequest(request)) {
      return Response.json({ ok: false, error: "성과 수집 되돌리기는 운영자만 할 수 있습니다." }, { status: 403 });
    }
    if (!body.post_id) return Response.json({ ok: false, error: "post_id required" }, { status: 400 });
    try {
      const result = await reinstateMetricsTarget(tenantId, body.post_id);
      if (!result.reinstated) {
        // 아무 일도 안 일어났으면 그렇다고 말한다. 조용한 성공은 조용한 실패와 같다.
        return Response.json({
          ok: false,
          reinstated: false,
          error: "그 글은 성과 수집에서 내려놓은 상태가 아닙니다. 되돌릴 것이 없습니다.",
        }, { status: 404 });
      }
      return Response.json({ ok: true, reinstated: true, wasRetired: result.wasRetired });
    } catch (error) {
      return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  }

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
              // 계정 불일치와 지워진 글은 둘 다 "다시 시도해도 같다" 이다. 장애(503)로 말하면
              // 화면이 재시도를 권하고 사용자는 될 일이 없는 일을 반복한다.
              : failureCodes.length > 0 && failureCodes.every((code) => code === "post_not_in_account" || code === "post_deleted")
                ? 422
                : 503;
    // 운영자에게는 진단을 다 주고 고객에게는 자기 글을 찾을 만큼만 준다(근거는
    // metrics-collector.redactFailureDetail 주석).
    const audience = isOperatorRequest(request) ? "operator" : "customer";
    return Response.json({
      ...result,
      failureDetails: failureDetailsFor(result.failureDetails, audience),
    }, { status });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
