import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  tenantId: "tenant-tiktok" as string | null,
  connected: true,
  queries: [] as Array<{ text: string; values: unknown[] }>,
  credential: { token: "test-token", userId: "tiktok-user" },
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      H.queries.push({ text, values });
      if (text.includes("platform = 'tiktok'")) {
        return Promise.resolve([{ id: "tiktok-row-1", external_id: "video-1" }]);
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
    H.connected && platform === "tiktok" ? H.credential : null
  )),
  fetchMetaPostMetrics: vi.fn(),
  fetchXPublicMetrics: vi.fn(),
  fetchYouTubeMetrics: vi.fn(),
}));

const tiktokMocks = vi.hoisted(() => ({
  fetchTikTokVideoMetrics: vi.fn(async () => ({
    ok: true as const,
    metrics: {
      "video-1": { views: 420, likes: 31, replies: 7, reposts: 4 },
    },
  })),
}));

vi.mock("@/lib/publish", () => publishMocks);
vi.mock("@/lib/tiktok", () => tiktokMocks);
vi.mock("@/lib/file-io", () => ({ readJson: vi.fn(), writeJson: vi.fn(), dataPath: vi.fn() }));
vi.mock("@/lib/tenant-context", () => ({ runWithTenant: vi.fn() }));

beforeEach(() => {
  H.tenantId = "tenant-tiktok";
  H.connected = true;
  H.queries = [];
  vi.clearAllMocks();
});

describe("POST /api/metrics TikTok 성과 수집 계약", () => {
  it("METRICS-TIKTOK-01 정상: TikTok 영상 ID를 조회하고 네 성과 수치를 기존 발행물에 갱신한다", async () => {
    const { POST } = await import("@/app/api/metrics/route");
    const response = await POST(new Request("http://localhost/api/metrics", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ ok: true, updated: 1, total: 1 }));
    expect(tiktokMocks.fetchTikTokVideoMetrics).toHaveBeenCalledWith("test-token", ["video-1"]);
    const update = H.queries.find(({ text }) => text.includes("SET views ="));
    expect(update?.values).toEqual(expect.arrayContaining([420, 31, 7, 4, "tiktok-row-1"]));
  });

  it("METRICS-TIKTOK-02 거절: 수집 가능한 자격증명이 없으면 TikTok 조회와 DB 변경을 시작하지 않는다", async () => {
    H.connected = false;
    const { POST } = await import("@/app/api/metrics/route");
    const response = await POST(new Request("http://localhost/api/metrics", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId }),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("연결돼 있지 않습니다");
    expect(tiktokMocks.fetchTikTokVideoMetrics).not.toHaveBeenCalled();
    expect(H.queries).toEqual([]);
  });
});
