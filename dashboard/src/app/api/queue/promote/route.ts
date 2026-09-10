// POST /api/queue/promote — A+ promote 브릿지.
// 대시보드 draft를 게이트웨이 발행 큐(threads-queue add)로 승격. 멀티채널 + 선택 예약.
// 본문: { tenant_id, draft_id, platforms[], scheduled_at? }
// 게이트웨이(OpenClaw extensions) HTTP로 큐 추가를 위임 — 실 발행은 게이트웨이 크론이 수행.
// OPENCLAW_GATEWAY_URL 미설정 시 503(게이트웨이 미연결). 하드코딩 금지(CLAUDE.md 서비스 중립).

interface PromoteBody {
  tenant_id?: string;
  draft_id?: string;
  platforms?: string[];
  scheduled_at?: string;
}

export async function POST(request: Request) {
  const { tenant_id, draft_id, platforms, scheduled_at } = (await request.json()) as PromoteBody;

  if (!tenant_id || !draft_id) {
    return Response.json({ error: "tenant_id, draft_id required" }, { status: 400 });
  }
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return Response.json({ error: "platforms[] required (1개 이상)" }, { status: 400 });
  }
  // 예약 시각은 미래여야 함(과거 거부 — P6 예약 정합).
  if (scheduled_at) {
    const t = Date.parse(scheduled_at);
    if (Number.isNaN(t)) return Response.json({ error: "scheduled_at 형식 오류(ISO-8601)" }, { status: 400 });
    if (t <= Date.now()) return Response.json({ error: "scheduled_at은 미래 시각이어야 함" }, { status: 400 });
  }

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  if (!gatewayUrl) {
    // 게이트웨이 docker 미기동 — 직접발행(/api/publish)로 폴백 안내.
    return Response.json(
      { ok: false, error: "게이트웨이 미연결 — OPENCLAW_GATEWAY_URL 미설정 (직접발행은 /api/publish)" },
      { status: 503 },
    );
  }

  // 게이트웨이 threads-queue add 브릿지 위임. 채널 맵 v2 스키마로 큐 항목 구성.
  const channels: Record<string, { status: string }> = {};
  for (const p of platforms) channels[p] = { status: "pending" };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const resp = await fetch(`${gatewayUrl.replace(/\/$/, "")}/queue/add`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tenant_id,
        draft_id,
        platforms,
        channels,
        status: scheduled_at ? "scheduled" : "approved",
        scheduled_at: scheduled_at ?? null,
      }),
    });
    if (!resp.ok) {
      return Response.json(
        { ok: false, error: `게이트웨이 큐 추가 실패(${resp.status}): ${(await resp.text()).slice(0, 200)}` },
        { status: 502 },
      );
    }
    const data = await resp.json().catch(() => ({}));
    return Response.json({ ok: true, promoted: { draft_id, platforms, scheduled_at: scheduled_at ?? null }, gateway: data });
  } catch (e) {
    return Response.json({ error: `게이트웨이 연결 실패: ${String(e)}` }, { status: 502 });
  }
}
