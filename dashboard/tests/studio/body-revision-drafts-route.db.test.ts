import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { getDatabaseUrl } from "../isolation/_env";

let tenantId = "";
let admin: ReturnType<typeof postgres> | null = null;

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => tenantId),
}));

beforeAll(async () => {
  const url = getDatabaseUrl();
  if (!url) {
    if (process.env.CI) throw new Error("CI requires DATABASE_URL for body revision DB integration");
    return;
  }
  process.env.DATABASE_URL = url;
  admin = postgres(url, { max: 4, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
  tenantId = crypto.randomUUID();
  await admin`
    INSERT INTO tenants (id, slug, name, status)
    VALUES (${tenantId}, ${`body-revision-${tenantId}`}, 'Body revision DB test', 'active')`;
});

afterAll(async () => {
  if (!admin) return;
  await admin`DELETE FROM drafts WHERE tenant_id = ${tenantId}`;
  await admin`DELETE FROM tenants WHERE id = ${tenantId}`;
  await admin.end({ timeout: 5 });
});

describe("POST /api/studio/drafts 실제 PostgreSQL 본문 revision 경합", () => {
  it("PR87-R4-DB-01 두 탭: 오래된 탭의 큰 로컬 횟수는 서버 기준판 CAS를 우회하지 못한다", async (ctx) => {
    if (!admin) {
      ctx.skip();
      return;
    }
    const { POST } = await import("@/app/api/studio/drafts/route");
    const create = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: tenantId,
        idea: "경합 본문",
        text: { threads: "기준 본문" },
        editLines: ["기준 본문"],
        bodyRevision: 100,
      }),
    }));
    expect(create.status).toBe(200);
    const draftId = (await create.json()).id as string;

    const update = (label: string, bodyBaseRevision: number, bodyRevision: number) => POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: tenantId,
        id: draftId,
        idea: `경합 ${label}`,
        text: { threads: `${label} 본문` },
        editLines: [`${label} 본문`],
        bodyBaseRevision,
        bodyRevision,
      }),
    }));

    // 실제 브라우저 두 탭의 자동저장 도착 순서를 fake timer로 고정한다. 최신 탭이 100ms에
    // 서버 기준판 0을 저장하고, 오래된 탭은 로컬 편집 횟수 100을 들고 800ms 뒤 도착한다.
    vi.useFakeTimers();
    let latestRequest: Promise<Response> | undefined;
    setTimeout(() => { latestRequest = update("latest-tab", 0, 1); }, 100);
    vi.advanceTimersByTime(100);
    vi.useRealTimers();
    const latest = await latestRequest!;
    expect(latest.status).toBe(200);
    expect(await latest.clone().json()).toEqual(expect.objectContaining({ bodyRevision: 1 }));

    vi.useFakeTimers();
    let staleRequest: Promise<Response> | undefined;
    setTimeout(() => { staleRequest = update("stale-offline-high-counter", 0, 100); }, 800);
    vi.advanceTimersByTime(800);
    vi.useRealTimers();
    const stale = await staleRequest!;
    const staleBody = await stale.clone().json();
    expect(stale.status, JSON.stringify(staleBody)).toBe(409);
    expect(staleBody).toEqual(expect.objectContaining({
      code: "BODY_STALE_REVISION",
      serverRevision: 1,
      clientBaseRevision: 0,
      latestBody: expect.objectContaining({
        text: { threads: "latest-tab 본문" },
        editLines: ["latest-tab 본문"],
        bodyRevision: 1,
      }),
    }));

    const [stored] = await admin<{ payload: { text: { threads: string }; editLines: string[]; bodyRevision: number } }[]>`
      SELECT payload FROM drafts WHERE id = ${draftId} AND tenant_id = ${tenantId}`;
    expect(stored.payload).toEqual(expect.objectContaining({
      text: { threads: "latest-tab 본문" },
      editLines: ["latest-tab 본문"],
      bodyRevision: 1,
    }));
  });

  it("PR87-R4-DB-02 거절: 저장된 서버 판보다 오래된 요청은 실제 DB 본문을 바꾸지 않는다", async (ctx) => {
    if (!admin) {
      ctx.skip();
      return;
    }
    const [stored] = await admin<{ id: string; payload: { text: { threads: string }; bodyRevision: number } }[]>`
      SELECT id, payload FROM drafts WHERE tenant_id = ${tenantId} ORDER BY created_at DESC LIMIT 1`;
    const winner = stored.payload.text.threads;
    const { POST } = await import("@/app/api/studio/drafts/route");
    const stale = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: tenantId,
        id: stored.id,
        idea: "오래된 요청",
        text: { threads: "오래된 본문" },
        editLines: ["오래된 본문"],
        bodyBaseRevision: 0,
      }),
    }));
    const staleBody = await stale.json();
    expect(stale.status, JSON.stringify(staleBody)).toBe(409);
    expect(staleBody).toEqual(expect.objectContaining({
      code: "BODY_STALE_REVISION",
      latestBody: expect.objectContaining({ bodyRevision: 1 }),
    }));

    const [after] = await admin<{ payload: { text: { threads: string }; bodyRevision: number } }[]>`
      SELECT payload FROM drafts WHERE id = ${stored.id} AND tenant_id = ${tenantId}`;
    expect(after.payload.text.threads).toBe(winner);
    expect(after.payload.bodyRevision).toBe(1);
  });
});
