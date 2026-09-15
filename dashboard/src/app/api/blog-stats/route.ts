import { readJson, writeJson, dataPath, configPath } from "@/lib/file-io";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";

interface OpenClawConfig {
  plugins?: {
    entries?: Record<string, { config?: Record<string, string> }>;
  };
}

// 테넌트 컨텍스트로 감싸 파일을 data/tenants/{id}/ 로 격리(운영자=공유 루트).
export async function GET(request: Request) {
  const __t = await effectiveTenantId(request, null);
  return runWithTenant(__t, async () => {
  const config = readJson<OpenClawConfig>(configPath("openclaw.json")) || {};
  const blogCfg = config.plugins?.entries?.["sample-blog"]?.config || {};
  const apiBase = blogCfg.apiBaseUrl || "";
  const email = blogCfg.email || "";
  const password = blogCfg.password || "";

  if (!apiBase || !email) {
    return Response.json(
      { error: "Blog not configured", code: "BLOG_NOT_CONFIGURED", articles: [], totalViews: 0, totalArticles: 0 },
      { status: 503 },
    );
  }

  try {
    // Login
    const loginRes = await fetch(`${apiBase}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10000),
    });
    if (!loginRes.ok) {
      return Response.json(
        { error: "Blog login failed", code: "BLOG_LOGIN_FAILED", articles: [], totalViews: 0, totalArticles: 0 },
        { status: 502 },
      );
    }
    const cookie = loginRes.headers.get("set-cookie") || "";
    const authMatch = cookie.match(/Authorization=([^;]+)/);
    if (!authMatch) {
      return Response.json(
        { error: "Blog login failed", code: "BLOG_LOGIN_FAILED", articles: [], totalViews: 0, totalArticles: 0 },
        { status: 502 },
      );
    }
    const authToken = authMatch[1];

    // Fetch articles
    const listRes = await fetch(`${apiBase}/api/admin/column-articles?status=APPROVED&page=0&size=100`, {
      headers: { Cookie: `Authorization=${authToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!listRes.ok) {
      return Response.json(
        { error: "Blog article request failed", code: "BLOG_UPSTREAM_FAILED", articles: [], totalViews: 0, totalArticles: 0 },
        { status: 502 },
      );
    }
    const listData = await listRes.json();
    const content = listData?.data?.content || [];

    const articles: Record<string, unknown>[] = [];
    let totalViews = 0;
    for (const a of content) {
      const views = a.viewCount || 0;
      totalViews += views;
      articles.push({
        id: a.id,
        title: a.title || "",
        viewCount: views,
        tags: a.tags || [],
        regDate: a.regDate || "",
      });
    }
    articles.sort((a, b) => (b.viewCount as number) - (a.viewCount as number));
    const avgViews = articles.length ? Math.round(totalViews / articles.length) : 0;
    const top = articles[0] || null;

    // Tag aggregation
    const tagStats: Record<string, { count: number; totalViews: number; avgViews?: number }> = {};
    for (const a of articles) {
      for (const tag of (a.tags as string[]) || []) {
        if (!tagStats[tag]) tagStats[tag] = { count: 0, totalViews: 0 };
        tagStats[tag].count++;
        tagStats[tag].totalViews += a.viewCount as number;
      }
    }
    for (const t of Object.values(tagStats)) {
      t.avgViews = t.count ? Math.round(t.totalViews / t.count) : 0;
    }
    const topTags = Object.entries(tagStats)
      .sort(([, a], [, b]) => (b.avgViews || 0) - (a.avgViews || 0))
      .slice(0, 15)
      .map(([tag, v]) => ({ tag, ...v }));

    // Save daily snapshot
    const historyPath = dataPath("blog-analytics-history.json");
    const history = readJson<{ snapshots: Array<Record<string, unknown>> }>(historyPath) || { snapshots: [] };
    const today = new Date().toISOString().split("T")[0];
    const existing = history.snapshots.find((s) => s.date === today);
    const snapshot = {
      date: today,
      totalViews,
      totalArticles: articles.length,
      articles: articles.map((a) => ({ id: a.id, viewCount: a.viewCount })),
    };
    if (existing) Object.assign(existing, snapshot);
    else {
      history.snapshots.push(snapshot);
      history.snapshots = history.snapshots.slice(-90);
    }
    writeJson(historyPath, history);

    // Daily delta
    const yesterday = history.snapshots.filter((s) => (s.date as string) < today);
    const prevViews = yesterday.length ? (yesterday[yesterday.length - 1].totalViews as number) : 0;
    const dailyDelta = totalViews - prevViews;

    return Response.json({
      totalArticles: articles.length,
      totalViews,
      avgViews,
      dailyDelta,
      topArticle: top,
      articles,
      topTags,
      history: history.snapshots.slice(-14).map((s) => ({ date: s.date, totalViews: s.totalViews })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: msg, code: "BLOG_UPSTREAM_FAILED", articles: [], totalViews: 0, totalArticles: 0 },
      { status: 502 },
    );
  }
  });
}
