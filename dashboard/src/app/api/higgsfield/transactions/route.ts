import { hfRun, readGenLog } from "@/lib/higgsfield";
import { parseTransactionPage } from "@/lib/higgsfield-transactions";

// GET /api/higgsfield/transactions?size=20 — Higgsfield 크레딧 사용 이력 + 우리 생성로그 매칭(어느 산출물)
export async function GET(req: Request) {
  const size = new URL(req.url).searchParams.get("size") || "30";
  try {
    const { stdout } = await hfRun(["account", "transactions", "--size", size, "--json"], 20000);
    const parsed = parseTransactionPage(stdout);
    if (!parsed.ok) throw new Error("Higgsfield 거래 응답을 해석할 수 없습니다.");
    const items = parsed.items;
    const log = readGenLog();
    // 각 거래를 생성로그와 시간(±120초)으로 매칭해 산출물 label 부착
    const enriched = items.map((t) => {
      const txMs = t.created_at ? Date.parse(t.created_at) : NaN;
      let best: { label: string; kind: string } | null = null;
      let bestDiff = 120000;
      for (const g of log) {
        const diff = Math.abs(g.ts - txMs);
        if (diff < bestDiff) { bestDiff = diff; best = { label: g.label, kind: g.kind }; }
      }
      return { ...t, output: best?.label || null, outputKind: best?.kind || null };
    });
    return Response.json({ ok: true, items: enriched });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { ok: false, error: msg.slice(0, 300) },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
