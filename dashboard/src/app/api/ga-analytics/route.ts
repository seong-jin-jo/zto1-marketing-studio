import { readJson, dataPath } from "@/lib/file-io";
import { getGoogleAccessToken } from "@/lib/gsc-auth";

export async function GET(request: Request) {
  const keyData = readJson<Record<string, string>>(dataPath("gsc-service-account.json"));
  const gaCfg = readJson<Record<string, string>>(dataPath("ga-config.json"));
  if (!keyData) {
    return Response.json(
      { error: "Service account not configured", code: "GA_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  if (!gaCfg?.propertyId) {
    return Response.json(
      { error: "GA4 Property ID not configured", code: "GA_PROPERTY_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const propertyId = gaCfg.propertyId;
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "28", 10);

  try {
    const accessToken = await getGoogleAccessToken(keyData, "https://www.googleapis.com/auth/analytics.readonly");

    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];

    const apiUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    // Channel report
    const res = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        limit: 20,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`GA channel report failed: ${res.status}`);
    const result = await res.json();

    let totalSessions = 0;
    let totalPageviews = 0;
    const sources: Record<string, unknown>[] = [];
    for (const row of result.rows || []) {
      const source = row.dimensionValues[0].value;
      const sessions = parseInt(row.metricValues[0].value, 10);
      const pageviews = parseInt(row.metricValues[1].value, 10);
      totalSessions += sessions;
      totalPageviews += pageviews;
      sources.push({ source, sessions, pageviews });
    }
    sources.sort((a, b) => (b.sessions as number) - (a.sessions as number));

    const totals = result.totals || [{}];
    let avgDuration = "0";
    let bounceRate = "0";
    if (totals[0]?.metricValues) {
      avgDuration = String(Math.round(parseFloat(totals[0].metricValues[2].value) * 10) / 10);
      bounceRate = String(Math.round(parseFloat(totals[0].metricValues[3].value) * 1000) / 10);
    }

    // Page-level report
    const pageRes = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: "screenPageViews" }, { name: "averageSessionDuration" }],
        dimensions: [{ name: "pagePath" }],
        dimensionFilter: {
          filter: {
            fieldName: "pagePath",
            stringFilter: { matchType: "CONTAINS", value: "/community/column" },
          },
        },
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 20,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!pageRes.ok) throw new Error(`GA page report failed: ${pageRes.status}`);
    const pageResult = await pageRes.json();

    const pages: Record<string, unknown>[] = [];
    for (const row of pageResult.rows || []) {
      pages.push({
        path: row.dimensionValues[0].value,
        views: parseInt(row.metricValues[0].value, 10),
        avgDuration: Math.round(parseFloat(row.metricValues[1].value) * 10) / 10,
      });
    }

    return Response.json({
      totalSessions,
      totalPageviews,
      avgDuration,
      bounceRate,
      sources,
      pages,
      days,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg, code: "GA_UPSTREAM_FAILED" }, { status: 502 });
  }
}
