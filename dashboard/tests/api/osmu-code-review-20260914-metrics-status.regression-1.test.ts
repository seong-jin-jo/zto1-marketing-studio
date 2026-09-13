import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectMetrics } from "@/lib/metrics-collector";

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => "tenant-metrics") }));
vi.mock("@/lib/metrics-collector", () => ({ collectMetrics: vi.fn() }));

async function requestMetrics() {
  const { POST } = await import("@/app/api/metrics/route");
  return POST(new Request("http://localhost/api/metrics", {
    method: "POST",
    body: JSON.stringify({ tenant_id: "tenant-metrics" }),
  }));
}

const base = {
  updated: 0,
  total: 2,
  failed: 2,
  partial: false,
  collectionBlocked: true,
};

describe("OSMU-018 성과 API 상태 계약", () => {
  beforeEach(() => vi.clearAllMocks());

  it("OSMU-018 거절 경로: 공급자 전건 503 실패를 HTTP 503으로 반환한다", async () => {
    vi.mocked(collectMetrics).mockResolvedValue({
      ...base,
      ok: false,
      failures: [{ channel: "instagram", code: "provider_503", count: 2 }],
      reason: "채널 서비스 오류",
    });

    const response = await requestMetrics();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, collectionBlocked: true });
  });

  it("OSMU-018 경계값: 전건 rate limit은 HTTP 429, 권한 실패는 HTTP 424로 구분한다", async () => {
    vi.mocked(collectMetrics).mockResolvedValue({
      ...base,
      ok: false,
      failures: [{ channel: "x", code: "x_429", count: 2 }],
    });
    expect((await requestMetrics()).status).toBe(429);

    vi.mocked(collectMetrics).mockResolvedValue({
      ...base,
      ok: false,
      failures: [{ channel: "instagram", code: "insights_forbidden", count: 2 }],
    });
    expect((await requestMetrics()).status).toBe(424);
  });

  it("OSMU-018 정상 경로: 일부 성공만 207, 전건 성공만 200으로 반환한다", async () => {
    vi.mocked(collectMetrics).mockResolvedValue({
      ok: false,
      updated: 1,
      total: 2,
      failed: 1,
      partial: true,
      collectionBlocked: false,
      failures: [{ channel: "x", code: "x_503", count: 1 }],
    });
    expect((await requestMetrics()).status).toBe(207);

    vi.mocked(collectMetrics).mockResolvedValue({
      ok: true,
      updated: 2,
      total: 2,
      failed: 0,
      partial: false,
      collectionBlocked: false,
      failures: [],
    });
    expect((await requestMetrics()).status).toBe(200);
  });
});
