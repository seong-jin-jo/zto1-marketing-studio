import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  queue: [] as Array<Array<Record<string, unknown>>>,
  jsonValues: [] as unknown[],
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = Object.assign(() => Promise.resolve(H.queue.shift() ?? []), {
      json: (value: unknown) => { H.jsonValues.push(value); return value; },
    });
    return callback(sql);
  }),
}));

beforeEach(() => {
  vi.resetModules();
  H.queue = [];
  H.jsonValues = [];
});

describe("POST /api/studio/drafts 본문 revision 단일 계약", () => {
  it("PR87-R3-REV-03 정상: 더 최신 본문 revision은 저장되고 응답·조회에 같은 값을 돌려준다", async () => {
    H.queue = [[{ id: "d1", body_revision: 8 }]];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: "tenant-1", id: "d1", idea: "최신 본문",
        text: { threads: "최신 본문" }, editLines: ["최신 본문"], bodyRevision: 8,
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ id: "d1", bodyRevision: 8 }));
  });

  it("PR87-R3-REV-04 거절: 서버보다 오래된 본문 revision은 영상·자동저장·검토 경로를 가리지 않고 409로 막는다", async () => {
    H.queue = [[], [{ id: "d1", body_revision: 9 }]];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: "tenant-1", id: "d1", idea: "오래된 본문",
        text: { threads: "오래된 본문" }, editLines: ["오래된 본문"], bodyRevision: 7,
      }),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(expect.objectContaining({
      code: "BODY_STALE_REVISION", serverRevision: 9, clientRevision: 7,
    }));
  });

  it("PR87-R3-REV-05 거절: 같은 revision인데 본문 값이 다르면 다른 탭의 최신 본문을 덮지 않는다", async () => {
    H.queue = [[], [{ id: "d1", body_revision: 8 }]];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: "tenant-1", id: "d1", idea: "충돌 본문",
        text: { threads: "탭 A의 값" }, editLines: ["탭 A의 값"], bodyRevision: 8,
      }),
    }));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("BODY_STALE_REVISION");
  });

  it("PR87-R3-REV-06 조회: 저장된 본문 revision을 클라이언트 재개 기준으로 노출한다", async () => {
    H.queue = [[{
      id: "d1", tenant_id: "tenant-1", idea: "본문", status: "draft",
      payload: { text: { threads: "본문" }, editLines: ["본문"], bodyRevision: 11 },
      created_at: "2026-09-28T00:00:00Z", updated_at: "2026-09-28T00:00:00Z",
    }]];
    const { GET } = await import("@/app/api/studio/drafts/route");
    const response = await GET(new Request("http://localhost/api/studio/drafts?tenant_id=tenant-1"));
    const body = await response.json();

    expect(body.drafts[0].bodyRevision).toBe(11);
  });
});
