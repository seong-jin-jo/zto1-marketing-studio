import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  tenantId: "tenant-reels" as string | null,
  connected: true,
  queries: [] as Array<{ text: string; values: unknown[] }>,
  instagramCredential: { token: "test-token", userId: "ig-user" },
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      H.queries.push({ text, values });
      if (text.includes("platform IN ('instagram_reels', 'reels')")) {
        return Promise.resolve([{ id: "reel-row-1", external_id: "ig-media-1" }]);
      }
      return Promise.resolve([]);
    }) as ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
      json: (value: unknown) => unknown;
    };
    sql.json = (value) => value;
    return callback(sql);
  }),
}));

const publishMocks = vi.hoisted(() => ({
  getChannelCred: vi.fn(async (_tenantId: string, platform: string) => (
    H.connected && platform === "instagram" ? H.instagramCredential : null
  )),
  fetchMetaPostMetrics: vi.fn(async () => ({
    ok: true as const,
    metrics: {
      "ig-media-1": { views: 120, likes: 14, replies: 3 },
    },
  })),
  fetchXPublicMetrics: vi.fn(),
  fetchYouTubeMetrics: vi.fn(),
}));

vi.mock("@/lib/publish", () => publishMocks);
vi.mock("@/lib/file-io", () => ({ readJson: vi.fn(), writeJson: vi.fn(), dataPath: vi.fn() }));
vi.mock("@/lib/tenant-context", () => ({ runWithTenant: vi.fn() }));

beforeEach(() => {
  H.tenantId = "tenant-reels";
  H.connected = true;
  H.queries = [];
  vi.clearAllMocks();
});

describe("POST /api/metrics Instagram Reels 성과 수집 계약", () => {
  it("METRICS-REELS-01 정상: Reels 발행물을 Instagram 자격증명과 Media Insights 수집기로 갱신한다", async () => {
    const { POST } = await import("@/app/api/metrics/route");
    const response = await POST(new Request("http://localhost/api/metrics", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ ok: true, updated: 1, total: 1 }));
    expect(publishMocks.fetchMetaPostMetrics).toHaveBeenCalledWith(
      H.instagramCredential,
      "instagram_reels",
      ["ig-media-1"],
    );
    expect(H.queries.some(({ text }) => text.includes("SET views ="))).toBe(true);
  });

  it("METRICS-REELS-02 거절: 수집 가능한 채널 자격증명이 하나도 없으면 외부 조회와 DB 변경을 막는다", async () => {
    H.connected = false;
    const { POST } = await import("@/app/api/metrics/route");
    const response = await POST(new Request("http://localhost/api/metrics", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId }),
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("연결돼 있지 않습니다");
    expect(publishMocks.fetchMetaPostMetrics).not.toHaveBeenCalled();
    expect(H.queries).toEqual([]);
  });
});
