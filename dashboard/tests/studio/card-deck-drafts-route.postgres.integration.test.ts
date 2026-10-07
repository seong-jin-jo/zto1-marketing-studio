import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { getDatabaseUrl } from "../isolation/_env";
import { createPlainCardDeckV3 } from "@/lib/studio/card-element-commands";
import { applyCardDeckTemplate } from "@/lib/studio/card-templates";

let admin: ReturnType<typeof postgres> | null = null;
let tenantId = "";
const operatorToken = `s7-route-${crypto.randomUUID()}`;

function operatorRequest(url: string, init?: RequestInit): Request {
  return new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${operatorToken}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
}

beforeAll(async () => {
  const url = getDatabaseUrl();
  if (!url) {
    if (process.env.CI) throw new Error("CI requires DATABASE_URL for S7 actual PostgreSQL route integration");
    return;
  }
  process.env.DATABASE_URL = url;
  process.env.DASHBOARD_AUTH_TOKEN = operatorToken;
  admin = postgres(url, { max: 3, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
  tenantId = crypto.randomUUID();
  await admin`
    INSERT INTO tenants (id, slug, name, status)
    VALUES (${tenantId}, ${`s7-route-${tenantId}`}, 'S7 actual route test', 'active')`;
});

afterAll(async () => {
  if (!admin) return;
  await admin`DELETE FROM tenants WHERE id = ${tenantId}`;
  await admin.end({ timeout: 5 });
  delete process.env.DASHBOARD_AUTH_TOKEN;
});

describe("S7 /api/studio/drafts 실제 PostgreSQL 저장·조회", () => {
  it("S7-R2-MAJOR-B 생성 덱과 템플릿 복원 상태가 실제 route와 RLS를 거쳐 같은 JSONB에 저장된다", async (ctx) => {
    if (!admin) {
      ctx.skip();
      return;
    }
    const source = createPlainCardDeckV3(["실DB 첫 장", "실DB 마지막 장"], `deck_${crypto.randomUUID()}`);
    const deck = applyCardDeckTemplate(source, "headline_cover", { kind: "all" });
    const templateState = {
      activeTemplateId: "headline_cover" as const,
      previousTemplate: { id: "text_only" as const, deck: source },
    };
    const { POST, GET } = await import("@/app/api/studio/drafts/route");

    const saved = await POST(operatorRequest("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: tenantId,
        idea: "S7 실제 저장",
        editKind: "card",
        editFormat: { kind: "card", aspectRatio: "4:5", background: "작업실 책상", subtitleSize: "보통" },
        editLines: ["실DB 첫 장", "실DB 마지막 장"],
        cardDeckV3: deck,
        cardDeckV3SourceSnapshot: { editLines: ["실DB 첫 장", "실DB 마지막 장"], cardTextPositions: [] },
        cardTemplateState: templateState,
      }),
    }));
    const savedBody = await saved.clone().json();
    expect(saved.status, JSON.stringify(savedBody)).toBe(200);

    const loaded = await GET(operatorRequest(
      `http://localhost/api/studio/drafts?tenant_id=${tenantId}&id=${savedBody.id}`,
    ));
    const loadedBody = await loaded.clone().json();
    expect(loaded.status, JSON.stringify(loadedBody)).toBe(200);
    expect(loadedBody.draft).toMatchObject({
      id: savedBody.id,
      cardDeckV3: deck,
      cardTemplateState: templateState,
    });

    const [stored] = await admin<{ payload: Record<string, unknown> }[]>`
      SELECT payload FROM drafts WHERE tenant_id = ${tenantId} AND id = ${savedBody.id}`;
    expect(stored.payload).toMatchObject({
      cardDeckV3: deck,
      cardTemplateState: templateState,
    });
  });
});
