import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  tenantId: "tenant-usage" as string | null,
  queries: [] as string[],
  relayFailed: 0,
  relayRemaining: 0,
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

vi.mock("@/lib/tenant-context", () => ({
  runWithTenant: vi.fn(async (_tenantId: string | null, cb: () => unknown) => cb()),
}));
vi.mock("@/lib/usage-events", () => ({
  reconcilePendingPublicationEvents: vi.fn(async () => ({ processed: 0, failed: H.relayFailed, remaining: H.relayRemaining })),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, cb: (sql: unknown) => unknown) => {
    const sql = Object.assign(
      (strings: TemplateStringsArray) => {
        const query = strings.join("?");
        H.queries.push(query);
        if (query.includes("FROM usage_events")) {
          return Promise.resolve([
            { day: "2026-07-30", event_type: "aiGeneration", quantity: 2 },
            { day: "2026-07-30", event_type: "publication", quantity: 3 },
            { day: "2026-07-29", event_type: "cronRun", quantity: 4 },
            { day: "2026-07-01", event_type: "apiCall", quantity: 5 },
          ]);
        }
        if (query.includes("SELECT tier")) return Promise.resolve([{ tier: "pro" }]);
        if (query.includes("FROM usage_quotas")) {
          return Promise.resolve([{ period: "2026-07", generations_used: 7, generations_included: 100 }]);
        }
        return Promise.resolve([]);
      },
      { json: (value: unknown) => value },
    );
    return cb(sql);
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-30T12:00:00.000Z"));
  H.tenantId = "tenant-usage";
  H.queries = [];
  H.relayFailed = 0;
  H.relayRemaining = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/usage — usage_events DB 정본", () => {
  it("파일이 아니라 테넌트 usage_events를 일·주·월 단위로 집계한다", async () => {
    const { GET } = await import("@/app/api/usage/route");
    const response = await GET(new Request("http://localhost/api/usage?tenant_id=tenant-usage"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe("usage_events");
    expect(body.tenantId).toBe("tenant-usage");
    expect(body.today).toEqual({ aiGenerations: 2, publications: 3, cronRuns: 0, apiCalls: 0 });
    expect(body.thisWeek).toEqual({ aiGenerations: 2, publications: 3, cronRuns: 4, apiCalls: 0 });
    expect(body.thisMonth).toEqual({ aiGenerations: 2, publications: 3, cronRuns: 4, apiCalls: 5 });
    expect(body.daily["2026-07-30"]).toEqual({
      aiGenerations: 2,
      publications: 3,
      cronRuns: 0,
      apiCalls: 0,
    });
    expect(body.tier).toBe("pro");
    expect(body.quota.generations_used).toBe(7);
    expect(H.queries.some((query) => query.includes("FROM usage_events"))).toBe(true);
  });

  it("사용량 화면이 활성 워크스페이스 tenant_id를 API에 전달한다", () => {
    const home = fs.readFileSync(path.join(process.cwd(), "src/components/home/PerformanceDashboard.tsx"), "utf8");
    const hook = fs.readFileSync(path.join(process.cwd(), "src/hooks/useOverview.ts"), "utf8");
    expect(home).toContain("useUsage(activeWorkspace?.id)");
    expect(hook).toContain("`/api/usage?tenant_id=${tenantId}`");
  });

  it("GET 원장은 usage.json을 읽지 않으며 POST 기록기는 파일을 legacy mirror로 보존한다", () => {
    const getRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/usage/route.ts"), "utf8");
    const recordRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/usage/record/route.ts"), "utf8");
    expect(getRoute).toContain("FROM usage_events");
    expect(getRoute).not.toContain("usage.json");
    expect(recordRoute).toContain("usage_events");
    expect(recordRoute).toContain("usage.json");
    expect(recordRoute).toContain("legacy mirror");
    const sourcingRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/sourcing/route.ts"), "utf8");
    expect(sourcingRoute).toContain('request.headers.get("authorization")');
  });

  it("REVIEW-24H-20260918-04 거절: 발행 사용량 relay 실패를 낮은 정상 합계로 반환하지 않는다", async () => {
    H.relayFailed = 1;
    const { GET } = await import("@/app/api/usage/route");
    const response = await GET(new Request("http://localhost/api/usage?tenant_id=tenant-usage"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ status: "delayed", publicationRelay: { failed: 1 } });
    expect(body.today).toBeUndefined();
  });

  it("REVIEW-20260918-08 거절: 51건 중 50건만 반영하면 확정 합계를 반환하지 않는다", async () => {
    H.relayRemaining = 1;
    const { GET } = await import("@/app/api/usage/route");
    const response = await GET(new Request("http://localhost/api/usage?tenant_id=tenant-usage"));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({ status: "delayed", publicationRelay: { remaining: 1 } });
    expect(body.today).toBeUndefined();
  });
});
