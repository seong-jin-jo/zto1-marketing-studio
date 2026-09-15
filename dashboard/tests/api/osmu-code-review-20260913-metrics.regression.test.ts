import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  transactionActive: false,
  updates: 0,
  scenario: "threads" as "threads" | "tiktok",
  fetchTikTok: vi.fn(),
}));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => "tenant-metrics") }));
vi.mock("@/lib/file-io", () => ({
  readJson: vi.fn(() => ({})),
  writeJson: vi.fn(),
  dataPath: vi.fn((name: string) => name),
}));
vi.mock("@/lib/tenant-context", () => ({ runWithTenant: vi.fn((_id: string, fn: () => unknown) => fn()) }));
vi.mock("@/lib/tiktok", () => ({ fetchTikTokVideoMetrics: state.fetchTikTok }));
vi.mock("@/lib/publish", () => ({
  getChannelCred: vi.fn(async (_tenant: string, channel: string) => channel === state.scenario ? { token: "test-token" } : null),
  fetchXPublicMetrics: vi.fn(),
  fetchMetaPostMetrics: vi.fn(),
  fetchYouTubeMetrics: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenant: string, fn: (sql: unknown) => Promise<unknown>) => {
    state.transactionActive = true;
    const sql = async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("UPDATE published_posts")) {
        state.updates += 1;
        return [];
      }
      if (query.includes("platform = 'threads'")) {
        if (state.scenario !== "threads") return [];
        return [
          { id: "row-success", external_id: "threads-success" },
          { id: "row-failure", external_id: "threads-failure" },
        ];
      }
      if (query.includes("platform = 'tiktok'")) {
        if (state.scenario !== "tiktok") return [];
        return ["one", "two", "three"].map((suffix) => ({
          id: `row-${suffix}`,
          external_id: `video-${suffix}`,
          account_id: "account-tiktok",
        }));
      }
      return [];
    };
    Object.assign(sql, { json: (value: unknown) => value });
    try {
      return await fn(sql);
    } finally {
      state.transactionActive = false;
    }
  }),
}));

describe("성과 수집 검수 회귀", () => {
  beforeEach(() => {
    state.transactionActive = false;
    state.updates = 0;
    state.scenario = "threads";
    state.fetchTikTok.mockReset();
    vi.resetModules();
  });

  it("항목 5, 6: 두 건 중 한 건 실패는 207 부분 실패이며 공급자 호출은 transaction 밖이다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      expect(state.transactionActive).toBe(false);
      const url = String(input);
      if (url.includes("threads-success/insights")) {
        return new Response(JSON.stringify({
          data: [
            { name: "views", values: [{ value: 10 }] },
            { name: "likes", values: [{ value: 2 }] },
          ],
        }), { status: 200 });
      }
      if (url.includes("threads-failure/insights")) return new Response("forbidden", { status: 403 });
      if (url.includes("threads-failure?fields=id")) return new Response(JSON.stringify({ id: "threads-failure" }), { status: 200 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }));

    const { POST } = await import("@/app/api/metrics/route");
    const response = await POST(new Request("http://localhost/api/metrics", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-metrics" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(207);
    expect(body).toEqual(expect.objectContaining({
      ok: false,
      partial: true,
      updated: 1,
      failed: 1,
      total: 2,
    }));
    expect(body.failures).toContainEqual({ channel: "threads", code: "insights_forbidden", count: 1 });
    expect(state.updates).toBe(2);
    vi.unstubAllGlobals();
  });

  it("항목 33 거절 경로: TikTok 묶음 실패 세 건은 실패 건수와 상세 건수를 모두 3으로 센다", async () => {
    state.scenario = "tiktok";
    state.fetchTikTok.mockResolvedValue({ ok: false, status: 500, error: "provider failed" });

    const { POST } = await import("@/app/api/metrics/route");
    const response = await POST(new Request("http://localhost/api/metrics", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-metrics" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual(expect.objectContaining({
      ok: false,
      updated: 0,
      failed: 3,
      total: 3,
      failures: [{ channel: "tiktok", code: "tiktok_500", count: 3 }],
    }));
    expect(body.failureDetails).toHaveLength(3);
    expect(state.updates).toBe(3);
  });
});
