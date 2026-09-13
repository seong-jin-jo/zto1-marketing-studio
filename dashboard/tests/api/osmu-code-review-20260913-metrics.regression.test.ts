import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ transactionActive: false, updates: 0 }));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => "tenant-metrics") }));
vi.mock("@/lib/file-io", () => ({
  readJson: vi.fn(() => ({})),
  writeJson: vi.fn(),
  dataPath: vi.fn((name: string) => name),
}));
vi.mock("@/lib/tenant-context", () => ({ runWithTenant: vi.fn((_id: string, fn: () => unknown) => fn()) }));
vi.mock("@/lib/tiktok", () => ({ fetchTikTokVideoMetrics: vi.fn() }));
vi.mock("@/lib/publish", () => ({
  getChannelCred: vi.fn(async (_tenant: string, channel: string) => channel === "threads" ? { token: "test-token" } : null),
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
        return [
          { id: "row-success", external_id: "threads-success" },
          { id: "row-failure", external_id: "threads-failure" },
        ];
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
});
