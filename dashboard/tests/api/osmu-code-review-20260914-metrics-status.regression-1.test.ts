import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectMetrics } from "@/lib/metrics-collector";

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => "tenant-metrics") }));
// 이 파일은 상태 매핑만 본다. 라우트가 함께 쓰는 정제 함수는 실제 동작을 그대로 둔다 —
// 빼먹으면 라우트가 500 으로 죽고, 그 500 을 상태 계약 실패로 잘못 읽게 된다.
vi.mock("@/lib/metrics-collector", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/metrics-collector")>()),
  collectMetrics: vi.fn(),
}));

async function requestMetrics() {
  const { POST } = await import("@/app/api/metrics/route");
  return POST(new Request("http://localhost/api/metrics", {
    method: "POST",
    body: JSON.stringify({ tenant_id: "tenant-metrics" }),
  }));
}

const base = {
  // 이 파일은 HTTP 상태 매핑만 본다. 글 단위 상세는 pending-ingest 회귀가 본다.
  failureDetails: [],
  excluded: [],
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
      failureDetails: [],
      excluded: [],
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
      failureDetails: [],
      excluded: [],
      failures: [],
    });
    expect((await requestMetrics()).status).toBe(200);
  });
});
