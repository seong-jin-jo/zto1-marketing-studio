import { withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { getChannelCred } from "@/lib/publish";
import { readJson, writeJson, dataPath } from "@/lib/file-io";
import { runWithTenant } from "@/lib/tenant-context";
import {
  buildPerformanceMetricsCoverage,
  type MetricsCoverageAggregateRow,
} from "@/lib/performance-metrics-coverage";

const THREADS_API = "https://graph.threads.net/v1.0";

// 온보딩 체크리스트용: 성과 수집을 한 번이라도 돌리면 "analytics 확인" 단계 완료로 표시.
function markAnalyticsViewed(tenantId: string) {
  try {
    runWithTenant(tenantId, () => {
      const s = readJson<Record<string, unknown>>(dataPath("settings.json")) || {};
      if (s.analyticsViewed !== true) { s.analyticsViewed = true; writeJson(dataPath("settings.json"), s); }
    });
  } catch { /* 비차단 */ }
}

// GET /api/metrics?tenant_id=... — 발행물 + 성과 목록(성과 대시보드)
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
  } catch (e) {
    return Response.json({
      posts: [],
      coverage: buildPerformanceMetricsCoverage([]),
      error: String(e),
    }, { status: 500 });
  }
}

// POST /api/metrics — 성과 수집 { tenant_id } (Threads insights). 토큰 필요.
export async function POST(request: Request) {
  const __b = await request.json();
  const tenant_id = await effectiveTenantId(request, __b.tenant_id);
  if (!tenant_id) return Response.json({ error: "tenant_id required" }, { status: 400 });
  const cred = await getChannelCred(tenant_id, "threads");
  if (!cred) return Response.json({ ok: false, error: "threads 채널 미연결" }, { status: 400 });
  try {
    const { updated, total, skipped } = await withTenant(tenant_id, async (sql) => {
      const rows = await sql<{ id: string; external_id: string }[]>`
        SELECT id, external_id FROM published_posts
        WHERE tenant_id = ${tenant_id} AND platform = 'threads' AND external_id IS NOT NULL`;
      let n = 0;
      // 2026-09-05 회장 계정 실측: 수집 대상 1건인데 갱신 0건으로 끝나고 화면에는 아무
      // 말이 없었다. 제공자 응답이 실패하면 여기서 조용히 건너뛰었기 때문이다. 사유를
      // 모으면 화면이 "왜 안 모였는지"를 말할 수 있다. 토큰은 절대 남기지 않는다.
      const skipped: string[] = [];
      for (const r of rows) {
        try {
          const resp = await fetch(`${THREADS_API}/${r.external_id}/insights?metric=views,likes,replies,reposts&access_token=${cred.token}`);
          if (!resp.ok) {
            const detail = (await resp.text().catch(() => "")).slice(0, 200);
            // 성과 조회가 막혔을 때 원인이 둘로 갈린다. 게시물을 못 찾는 것과 권한이 없는
            // 것이다. 제공자 문구만으로는 구분되지 않아("does not exist, cannot be loaded
            // due to missing permissions, or does not support this operation") 기본 조회를
            // 한 번 더 해 본다. 기본 조회가 되면 게시물은 있고 성과 권한만 없는 것이다.
            const basic = await fetch(`${THREADS_API}/${r.external_id}?fields=id&access_token=${cred.token}`)
              .then((res) => res.status).catch(() => 0);
            // 저장한 식별자가 이 계정의 게시물 목록에 있는지 본다. 없으면 우리가 잘못된
            // 식별자를 저장한 것이고, 있으면 조회 권한 문제다. 이 구분이 있어야 다음
            // 조치가 갈린다(우리 데이터 교정 대 채널 재연결).
            const own = await fetch(`${THREADS_API}/me/threads?fields=id&limit=25&access_token=${cred.token}`)
              .then(async (res) => res.ok
                ? { status: res.status, ids: ((await res.json()) as { data?: { id: string }[] }).data?.map((x) => x.id) ?? [] }
                : { status: res.status, ids: [] as string[] })
              .catch(() => ({ status: 0, ids: [] as string[] }));
            console.error("[metrics][collect-skip] threads insights", resp.status, "basic", basic,
              "ownList", own.status, "ownCount", own.ids.length,
              "idInOwnList", own.ids.includes(r.external_id), detail);
            // 2026-09-05 실측: 토큰은 정상(목록 조회 200)인데 그 계정의 게시물 목록이
            // 0건이고 우리가 저장한 식별자도 목록에 없었다. 발행에 쓴 계정과 지금 연결된
            // 계정이 다를 때 이 모양이 된다. 사용자에게는 재연결 대상이 계정이라는 것을
            // 알려야 다음 행동이 정해진다.
            const skipCode = basic === 200 ? "insights_forbidden"
              : own.status === 200 && !own.ids.includes(r.external_id) ? "post_not_in_account"
                : `provider_${resp.status}`;
            skipped.push(skipCode);
            // 글 단위로 "왜 이 글은 못 재는지"를 남긴다. 남기지 않으면 성과실이 전부를
            // "아직 수집 안 함"으로 뭉뚱그려, 기다리면 채워질 것처럼 보인다. 실제로는
            // 계정이 바뀌기 전까지 영원히 안 채워지는 글이다(2026-09-05 실측).
            await sql`
              UPDATE published_posts
              SET provider_meta = COALESCE(provider_meta, '{}'::jsonb) || ${sql.json({
                metricsBlocked: { code: skipCode, at: new Date().toISOString() },
              } as never)}
              WHERE id = ${r.id}`;
            continue;
          }
          const data = (await resp.json()) as { data?: { name: string; values: { value: number }[] }[] };
          const m: Record<string, number> = {};
          for (const d of data.data ?? []) m[d.name] = d.values?.[0]?.value ?? 0;
          await sql`
            UPDATE published_posts
            SET views = ${m.views ?? 0}, likes = ${m.likes ?? 0}, replies = ${m.replies ?? 0},
                reposts = ${m.reposts ?? 0}, metrics_at = now(),
                -- 다시 재지게 되면 막힘 표식을 지운다. 남겨 두면 고쳐진 뒤에도 경고가 남는다.
                provider_meta = COALESCE(provider_meta, '{}'::jsonb) - 'metricsBlocked'
            WHERE id = ${r.id}`;
          n++;
        } catch (error) {
          console.error("[metrics][collect-skip] threads exception",
            error instanceof Error ? error.message : String(error));
          skipped.push("exception");
        }
      }
      return { updated: n, total: rows.length, skipped };
    });
    markAnalyticsViewed(tenant_id);
    // 수집 대상이 있는데 하나도 못 모았으면 그것을 성공으로 말하지 않는다.
    const collectionBlocked = total > 0 && updated === 0;
    return Response.json({
      ok: true,
      updated,
      total,
      ...(collectionBlocked ? {
        collectionBlocked: true,
        reason: skipped.includes("exception")
          ? "성과 조회 중 오류가 났습니다. 잠시 후 다시 시도해 주세요."
          : skipped.includes("post_not_in_account")
            ? "연결된 채널 계정에서 이 게시물을 찾을 수 없습니다. 글을 올린 계정과 지금 연결된 계정이 다를 수 있습니다. 채널을 다시 연결하면서 글을 올린 계정을 선택해 주세요."
          : skipped.includes("insights_forbidden")
            ? "게시물은 확인되는데 성과 조회 권한이 없습니다. 채널을 다시 연결해 성과 조회 권한을 허용해 주세요."
            : `채널이 성과 조회를 거절했습니다(응답 ${skipped[0] ?? "알 수 없음"}). 채널을 다시 연결한 뒤 시도해 주세요.`,
      } : {}),
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
