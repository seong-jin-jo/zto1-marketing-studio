import { readJson, writeJson, dataPath } from "@/lib/file-io";
import { getGoogleAccessToken } from "@/lib/gsc-auth";

export async function GET(request: Request) {
  const keyData = readJson<Record<string, string>>(dataPath("gsc-service-account.json"));
  if (!keyData) {
    return Response.json(
      { error: "GSC service account not configured", code: "GSC_NOT_CONFIGURED", rows: [] },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const siteUrl = searchParams.get("site") || "";
  const days = parseInt(searchParams.get("days") || "28", 10);
  const dimension = searchParams.get("dimension") || "query";

  try {
    const accessToken = await getGoogleAccessToken(keyData, "https://www.googleapis.com/auth/webmasters.readonly");

    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

    const apiUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ startDate, endDate, dimensions: [dimension], rowLimit: 50 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`GSC report failed: ${res.status}`);
    const result = await res.json();

    let totalClicks = 0;
    let totalImpressions = 0;
    const rows: Record<string, unknown>[] = [];

    for (const r of result.rows || []) {
      const clicks = r.clicks || 0;
      const impressions = r.impressions || 0;
      totalClicks += clicks;
      totalImpressions += impressions;
      rows.push({
        key: r.keys?.[0] || "",
        clicks,
        impressions,
        ctr: Math.round((r.ctr || 0) * 1000) / 10,
        position: Math.round((r.position || 0) * 10) / 10,
      });
    }

    const avgCtr = totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 1000) / 10 : 0;
    const avgPosition = rows.length ? Math.round(rows.reduce((s, r) => s + (r.position as number), 0) / rows.length * 10) / 10 : 0;

    const cache = {
      fetchedAt: new Date().toISOString(),
      days,
      dimension,
      totalClicks,
      totalImpressions,
      avgCtr,
      avgPosition,
      rows,
    };
    writeJson(dataPath("gsc-analytics.json"), cache);
    return Response.json(cache);
  } catch (e) {
    // Return cached data if available
    const cached = readJson<Record<string, unknown>>(dataPath("gsc-analytics.json"));
    if (cached) {
      cached.cached = true;
      return Response.json(cached);
    }
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg, code: "GSC_UPSTREAM_FAILED", rows: [] }, { status: 502 });
  }
}
