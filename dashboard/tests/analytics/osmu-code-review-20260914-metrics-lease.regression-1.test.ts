import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ providerCalls: 0 }));

vi.mock("@/lib/file-io", () => ({
  readJson: vi.fn(() => ({})),
  writeJson: vi.fn(),
  dataPath: vi.fn((name: string) => name),
}));
vi.mock("@/lib/tenant-context", () => ({ runWithTenant: vi.fn((_id: string, fn: () => unknown) => fn()) }));
vi.mock("@/lib/tiktok", () => ({ fetchTikTokVideoMetrics: vi.fn() }));
vi.mock("@/lib/publish", () => ({
  getChannelCred: vi.fn(async (_tenant: string, channel: string) => channel === "threads" ? { token: "threads-token" } : null),
  fetchXPublicMetrics: vi.fn(),
  fetchMetaPostMetrics: vi.fn(),
  fetchYouTubeMetrics: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: vi.fn(),
  withTenant: vi.fn(async (_tenant: string, fn: (sql: unknown) => Promise<unknown>) => {
    const sql = Object.assign(
      async (strings: TemplateStringsArray) => {
        const query = strings.join("?");
        if (query.includes("platform = 'threads'")) return [{ id: "row-1", external_id: "post-1" }];
        return [];
      },
      { json: (value: unknown) => value },
    );
    return fn(sql);
  }),
}));

describe("OSMU-015 테넌트별 성과 수집 lease", () => {
  beforeEach(() => {
    state.providerCalls = 0;
    vi.resetModules();
  });

  it("OSMU-015 거절 경로: 같은 테넌트의 동시 두 번째 수집은 공급자를 다시 호출하지 않는다", async () => {
    let releaseProvider!: () => void;
    let providerStarted!: () => void;
    const started = new Promise<void>((resolve) => { providerStarted = resolve; });
    const held = new Promise<void>((resolve) => { releaseProvider = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => {
      state.providerCalls += 1;
      providerStarted();
      await held;
      return new Response(JSON.stringify({ data: [{ name: "views", values: [{ value: 1 }] }] }), { status: 200 });
    }));
    const { collectMetrics } = await import("@/lib/metrics-collector");

    const first = collectMetrics("tenant-same");
    await started;
    const second = await collectMetrics("tenant-same");
    releaseProvider();
    const firstResult = await first;

    expect(firstResult?.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, collectionBlocked: true });
    expect(second?.failures).toContainEqual({ channel: "system", code: "collection_in_progress", count: 1 });
    expect(state.providerCalls).toBe(1);
    vi.unstubAllGlobals();
  });

  it("OSMU-015 정상 경로: 최근 5분 내 수집한 게시물을 대상에서 제외하는 조건을 유지한다", async () => {
    const source = await import("node:fs").then((fs) => fs.readFileSync(new URL("../../src/lib/metrics-collector.ts", import.meta.url), "utf8"));
    expect(source.match(/metrics_at < now\(\) -/g)).toHaveLength(7);
    expect(source).toContain("pg_try_advisory_lock");
  });
});
