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
  it("PR87-R4-REV-00 거절: 기존 초안은 마지막 서버 기준판 없이는 저장하지 않는다", async () => {
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: "tenant-1", id: "d1", idea: "기준판 없는 본문",
        text: { threads: "본문" }, editLines: ["본문"], bodyRevision: 100,
      }),
    }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual(expect.objectContaining({ code: "BODY_BASE_REVISION_REQUIRED" }));
  });

  it("PR87-R4-REV-01 정상: 서버 기준판이 일치하면 서버가 revision을 +1해 반환한다", async () => {
    H.queue = [[{ id: "d1", body_revision: 9 }]];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: "tenant-1", id: "d1", idea: "최신 본문",
        text: { threads: "최신 본문" }, editLines: ["최신 본문"], bodyBaseRevision: 8,
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ id: "d1", bodyRevision: 9 }));
  });

  it("PR87-R4-REV-02 거절: 서버 기준판과 다른 요청은 로컬 편집 횟수가 커도 409와 최신 본문을 반환한다", async () => {
    H.queue = [[], [{
      id: "d1", body_revision: 9,
      text: { threads: "서버 최신 본문" }, edit_lines: ["서버 최신 본문"], revision: null,
    }]];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: "tenant-1", id: "d1", idea: "오래된 본문",
        text: { threads: "오래된 본문" }, editLines: ["오래된 본문"],
        bodyBaseRevision: 7, bodyRevision: 100,
      }),
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(expect.objectContaining({
      code: "BODY_STALE_REVISION", serverRevision: 9, clientBaseRevision: 7,
      latestBody: {
        text: { threads: "서버 최신 본문" }, editLines: ["서버 최신 본문"], bodyRevision: 9,
      },
    }));
  });

  it("PR87-R4-REV-03 거절: 같은 서버 기준판으로 두 번째 저장한 탭은 최신 본문을 덮지 않는다", async () => {
    H.queue = [[], [{
      id: "d1", body_revision: 9,
      text: { threads: "먼저 저장한 탭" }, edit_lines: ["먼저 저장한 탭"], revision: null,
    }]];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: "tenant-1", id: "d1", idea: "충돌 본문",
        text: { threads: "뒤늦은 탭" }, editLines: ["뒤늦은 탭"], bodyBaseRevision: 8,
      }),
    }));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("BODY_STALE_REVISION");
  });

  it("PR87-R4-REV-04 조회: 저장된 서버 revision을 클라이언트 재개 기준으로 노출한다", async () => {
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
