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
  it("PR87-R3-DB-01 정상·경합: 같은 기준판의 두 본문은 하나만 저장되고 패자는 409이며 승자 본문은 유지된다", async (ctx) => {
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
        bodyRevision: 0,
      }),
    }));
    expect(create.status).toBe(200);
    const draftId = (await create.json()).id as string;

    const update = (label: string) => POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: tenantId,
        id: draftId,
        idea: `경합 ${label}`,
        text: { threads: `${label} 본문` },
        editLines: [`${label} 본문`],
        bodyRevision: 1,
      }),
    }));
    const responses = await Promise.all([update("A"), update("B")]);
    const responseBodies = await Promise.all(responses.map((response) => response.clone().json()));
    expect(responses.map((response) => response.status).sort(), JSON.stringify(responseBodies)).toEqual([200, 409]);

    const [stored] = await admin<{ payload: { text: { threads: string }; editLines: string[]; bodyRevision: number } }[]>`
      SELECT payload FROM drafts WHERE id = ${draftId} AND tenant_id = ${tenantId}`;
    const winner = responses[0].status === 200 ? "A 본문" : "B 본문";
    expect(stored.payload).toEqual(expect.objectContaining({
      text: { threads: winner },
      editLines: [winner],
      bodyRevision: 1,
    }));
  });

  it("PR87-R3-DB-02 거절: 저장된 판보다 오래된 요청은 실제 DB 본문을 바꾸지 않는다", async (ctx) => {
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
        bodyRevision: 0,
      }),
    }));
    const staleBody = await stale.json();
    expect(stale.status, JSON.stringify(staleBody)).toBe(409);
    expect(staleBody).toEqual(expect.objectContaining({ code: "BODY_STALE_REVISION" }));

    const [after] = await admin<{ payload: { text: { threads: string }; bodyRevision: number } }[]>`
      SELECT payload FROM drafts WHERE id = ${stored.id} AND tenant_id = ${tenantId}`;
    expect(after.payload.text.threads).toBe(winner);
    expect(after.payload.bodyRevision).toBe(1);
  });
});
