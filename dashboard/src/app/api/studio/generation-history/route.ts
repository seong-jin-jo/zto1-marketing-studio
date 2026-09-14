import { withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";

/**
 * GET /api/studio/generation-history — 이 작업 공간의 최근 생성 이력.
 *
 * 왜 있나. 회장 2026-09-06 확정: "토큰 잔여량이나 생성 이력은 고객도 봐야지 운영자는
 * 따로 종합관리하고." 종전에는 운영자 전용 거래 내역만 있어 고객은 자기가 무엇을 언제
 * 얼마나 만들었는지 볼 방법이 없었다. 사용량 정본(usage_events)을 그대로 읽어
 * 작업 공간 것만 돌려준다. 운영자 종합 화면은 별도로 둔다.
 */
type HistoryRow = {
  created_at: string;
  event_type: string;
  quantity: number;
  meta: Record<string, unknown> | null;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenantId = await effectiveTenantId(request, url.searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ ok: false, items: [] }, { status: 401 });

  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 20));
  try {
    const rows = await withTenant(tenantId, (sql) => sql<HistoryRow[]>`
      SELECT created_at::text AS created_at, event_type, quantity::int AS quantity, meta
      FROM usage_events
      WHERE tenant_id = ${tenantId}
        AND event_type IN ('aiGeneration', 'mediaGeneration', 'shortsGeneration')
      ORDER BY created_at DESC
      LIMIT ${limit}`);

    return Response.json({
      ok: true,
      items: rows.map((row) => ({
        at: row.created_at,
        kind: row.event_type === "mediaGeneration"
          ? String((row.meta as { kind?: string } | null)?.kind ?? "미디어")
          : "글",
        model: String((row.meta as { model?: string } | null)?.model ?? ""),
        label: String((row.meta as { label?: string } | null)?.label ?? ""),
        // 토큰 수치는 글 생성에만 있다. 없으면 숨긴다.
        totalTokens: (row.meta as { total_tokens?: number } | null)?.total_tokens ?? null,
      })),
    });
  } catch {
    // 조용히 빈 목록을 주지 않는다. 못 읽었으면 못 읽었다고 말한다(ADR-007).
    return Response.json({ ok: false, error: "생성 이력을 불러오지 못했습니다." }, { status: 500 });
  }
}
