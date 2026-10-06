import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  retry: vi.fn(),
  latest: vi.fn(),
}));

const DRAFT_ID = "11111111-1111-4111-8111-111111111111";
const EXPORT_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "tenant-route"),
  AuthError: class AuthError extends Error {
    status = 401;
    code = "invalid_token";
  },
}));

vi.mock("@/lib/studio/export-repository", () => ({
  exportRepository: () => H,
}));

vi.mock("@/lib/studio/generation/identity", () => ({
  resolveStudioPrincipal: vi.fn(async () => ({ memberId: "member-stable", allowedWorkspaceIds: new Set(["tenant-route"]) })),
}));

function job() {
  return {
    id: EXPORT_ID, draft_id: DRAFT_ID, kind: "card_deck", status: "queued",
    source_revision: 13, source_hash: "a".repeat(64), total_items: 2, succeeded_items: 0, failed_items: 0,
    created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-04T00:00:01Z", finished_at: null,
    items: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MEDIA_SIGNING_SECRET = "route-test-signing-secret-at-least-16";
});

describe("S3 export route 통합 계약", () => {
  it("S3-AC4 경계: 토큰이 갱신돼도 인증 회원 ID로 같은 key를 재사용한다", async () => {
    const { POST } = await import("@/app/api/studio/drafts/[draftId]/exports/route");
    H.create.mockResolvedValueOnce({ job: job(), reused: false }).mockResolvedValueOnce({ job: job(), reused: true });
    const request = (token: string) => new Request(`http://localhost/api/studio/drafts/${DRAFT_ID}/exports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "route-key", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind: "card_deck", expected_source_revision: 13, expected_source_hash: "a".repeat(64), item_keys: null }),
    });
    const created = await POST(request("token-before-refresh"), { params: Promise.resolve({ draftId: DRAFT_ID }) });
    expect(created.status).toBe(202);
    expect(await created.json()).toMatchObject({ export_id: EXPORT_ID, status_url: `/api/studio/drafts/${DRAFT_ID}/exports/${EXPORT_ID}` });
    const reused = await POST(request("token-after-refresh"), { params: Promise.resolve({ draftId: DRAFT_ID }) });
    expect(reused.status).toBe(200);
    expect(H.create).toHaveBeenNthCalledWith(1, "tenant-route", DRAFT_ID, "member-stable", "route-key", expect.any(String), expect.any(Object));
    expect(H.create).toHaveBeenNthCalledWith(2, "tenant-route", DRAFT_ID, "member-stable", "route-key", expect.any(String), expect.any(Object));
  });

  it("S3-ROUTE-02 정상: 상태 응답은 내부 object key 없이 성공 장에만 단수명 URL을 준다", async () => {
    const { GET } = await import("@/app/api/studio/drafts/[draftId]/exports/[exportId]/route");
    H.get.mockResolvedValue({
      ...job(), status: "processing", succeeded_items: 1,
      items: [
        { item_key: "slide-1", ordinal: 0, status: "succeeded", attempt_count: 1, artifact_key: "private-artifact.png", error_code: null },
        { item_key: "slide-2", ordinal: 1, status: "processing", attempt_count: 1, artifact_key: null, error_code: null },
      ],
    });
    const response = await GET(new Request("http://localhost/api/status"), {
      params: Promise.resolve({ draftId: DRAFT_ID, exportId: EXPORT_ID }),
    });
    const body = await response.json();
    expect(body.progress).toEqual({ completed: 1, total: 2 });
    expect(body.items[0].artifact_url).toMatch(/^\/api\/images\/deliver\//);
    expect(body.items[0]).not.toHaveProperty("artifact_key");
    expect(body.items[1]).not.toHaveProperty("artifact_url");
  });

  it("S3-ROUTE-03 정상: 실패 장 재시도는 202와 선택한 item key만 반환한다", async () => {
    const { POST } = await import("@/app/api/studio/drafts/[draftId]/exports/[exportId]/retry/route");
    H.retry.mockResolvedValue(["slide-failed"]);
    const response = await POST(new Request("http://localhost/api/retry", {
      method: "POST", body: JSON.stringify({ item_keys: ["slide-failed"] }),
    }), { params: Promise.resolve({ draftId: DRAFT_ID, exportId: EXPORT_ID }) });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ export_id: EXPORT_ID, status: "queued", requeued_item_keys: ["slide-failed"] });
  });

  it("S3-ROUTE-04 거절: latest는 card_deck 이외 kind를 DB 접근 전 400으로 막는다", async () => {
    const { GET } = await import("@/app/api/studio/drafts/[draftId]/exports/latest/route");
    const response = await GET(new Request("http://localhost/api/latest?kind=video"), {
      params: Promise.resolve({ draftId: DRAFT_ID }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_EXPORT_REQUEST" });
    expect(H.latest).not.toHaveBeenCalled();
  });
});
