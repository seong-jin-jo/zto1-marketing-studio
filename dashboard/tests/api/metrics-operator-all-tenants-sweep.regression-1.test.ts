// 2026-10-02 결함(회장 지적): 성과 수집은 성과실 "성과 다시 수집하기" 버튼(테넌트
// 스코프 1회성 호출)에서만 돌았다. 자동 수집이 없어 2026-09-23 마지막 수집 뒤 올린
// Shorts/Reels가 전부 미수집이었다. publish-due가 이미 쓰는 "운영자 토큰 +
// tenant_id 없음 = 전 테넌트 스윕" 계약을 /api/metrics POST에도 적용한다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  tenantIds: ["tenant-a", "tenant-b"] as string[],
  collectResults: new Map<string, { ok: boolean } | null | "throw">([
    ["tenant-a", { ok: true }],
    ["tenant-b", { ok: false }],
  ]),
  collectCalls: [] as string[],
}));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => null) }));
vi.mock("@/lib/db", () => ({
  db: vi.fn(() => {
    const sql = async () => H.tenantIds.map((tenant_id) => ({ tenant_id }));
    return sql;
  }),
  withTenant: vi.fn(),
}));
vi.mock("@/lib/metrics-collector", () => ({
  collectMetrics: vi.fn(async (tenantId: string) => {
    H.collectCalls.push(tenantId);
    const result = H.collectResults.get(tenantId);
    if (result === "throw") throw new Error("boom");
    return result ?? null;
  }),
  failureDetailsFor: vi.fn((details: unknown) => details),
  reinstateMetricsTarget: vi.fn(),
}));
vi.mock("@/lib/performance-metrics-coverage", () => ({
  buildPerformanceMetricsCoverage: vi.fn(() => ({})),
}));

const OPERATOR_TOKEN = "operator-secret";

describe("POST /api/metrics — 운영자 전체 테넌트 스윕", () => {
  beforeEach(() => {
    process.env.DASHBOARD_AUTH_TOKEN = OPERATOR_TOKEN;
    H.collectCalls = [];
    vi.clearAllMocks();
  });

  it("tenant_id 없이 운영자 토큰으로 호출하면 발행물 있는 전 테넌트를 순회한다", async () => {
    const { POST } = await import("@/app/api/metrics/route");
    const request = new Request("http://localhost/api/metrics", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("all-tenants");
    expect(body.tenantCount).toBe(2);
    expect(H.collectCalls.sort()).toEqual(["tenant-a", "tenant-b"]);
    expect(body.tenants).toEqual([
      { tenantId: "tenant-a", ok: true },
      { tenantId: "tenant-b", ok: false },
    ]);
  });

  it("한 테넌트 수집이 예외를 던져도 나머지 테넌트는 계속 처리한다", async () => {
    H.collectResults.set("tenant-a", "throw" as unknown as { ok: boolean });
    const { POST } = await import("@/app/api/metrics/route");
    const request = new Request("http://localhost/api/metrics", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(H.collectCalls.sort()).toEqual(["tenant-a", "tenant-b"]);
    const tenantA = body.tenants.find((t: { tenantId: string }) => t.tenantId === "tenant-a");
    expect(tenantA.ok).toBe(false);
    expect(tenantA.error).toContain("boom");
    const tenantB = body.tenants.find((t: { tenantId: string }) => t.tenantId === "tenant-b");
    expect(tenantB.ok).toBe(false);
  });

  it("운영자 토큰 없이 tenant_id 없이 호출하면 400을 돌려준다(권한 없는 전체 스윕 금지)", async () => {
    const { POST } = await import("@/app/api/metrics/route");
    const request = new Request("http://localhost/api/metrics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(H.collectCalls).toHaveLength(0);
  });
});
