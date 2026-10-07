import crypto from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { applyEditorOperation, createEditorHandoff, type EditorHandoff } from "@/lib/studio/editor-handoff";

const databaseUrl = process.env.S3_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const tenantId = crypto.randomUUID();
const admin = databaseUrl ? postgres(databaseUrl, { max: 2 }) : null;
const queueCalls: Array<Record<string, unknown>> = [];

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async (_request: Request, fallback: string | null) => fallback),
}));

vi.mock("@/lib/queue-add", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/queue-add")>();
  return {
    ...original,
    addQueuePost: vi.fn(async (_tenantId: string, input: Record<string, unknown>) => {
      queueCalls.push(input);
      return { post: { id: crypto.randomUUID(), ...input }, reused: false };
    }),
  };
});

function readyHandoff(kind: "card" | "video"): EditorHandoff {
  const raw = kind === "card"
    ? {
        kind,
        summary: "기존 카드 발행 본문",
        source: { generation_id: "generation-v2", candidate_id: "candidate-v2" },
        payload: { slides: [{ id: "slide-v2", order: 0, text: "기존 카드", image_url: null }] },
      }
    : {
        kind,
        summary: "편집 없는 기존 영상 발행 본문",
        source: { generation_id: "generation-video", candidate_id: "candidate-video" },
        payload: {
          asset_url: "/media/source.mp4",
          scenes: [{ id: "scene-1", order: 0, title: "장면", lines: [{ id: "line-1", order: 0, text: "대본" }] }],
        },
      };
  return applyEditorOperation(createEditorHandoff(raw), 0, { operation: "mark_ready" });
}

integration.sequential("S4 B1 기존 발행실 경로 실제 PostgreSQL 회귀", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl!;
    await admin!`
      INSERT INTO tenants(id,slug,name,status)
      VALUES (${tenantId},${`s4-b1-${tenantId.slice(0, 8)}`},'S4 B1','active')`;
  });

  afterEach(async () => {
    queueCalls.length = 0;
    await admin!`DELETE FROM drafts WHERE tenant_id=${tenantId}`;
  });

  afterAll(async () => {
    if (admin) {
      await admin`DELETE FROM tenants WHERE id=${tenantId}`;
      await admin.end();
    }
  });

  it.each([
    ["v2 일반·카톡·AI 카드", "card"],
    ["videoEdit 없는 영상", "video"],
  ] as const)("S4-B1 정상: %s은 최신 export 없이 기존 enqueue 동작을 유지한다", async (_label, kind) => {
    const draftId = crypto.randomUUID();
    const handoff = readyHandoff(kind);
    const legacyPayload = kind === "card"
      ? { editor_handoff: handoff, cardDeck: { template: "chat_bubble", slides: [] }, img: { textEmbedded: false } }
      : { editor_handoff: handoff, vid: { filename: "source.mp4" } };
    await admin!`
      INSERT INTO drafts(id,tenant_id,idea,payload,status)
      VALUES (${draftId},${tenantId},'legacy',${admin!.json(legacyPayload as never)},'draft')`;

    const { POST } = await import("@/app/api/studio/drafts/[draftId]/enqueue/route");
    const response = await POST(new Request(`http://localhost/api/studio/drafts/${draftId}/enqueue`, {
      method: "POST",
      body: JSON.stringify({ tenant_id: tenantId }),
    }), { params: Promise.resolve({ draftId }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).not.toHaveProperty("export_id");
    expect(queueCalls).toHaveLength(1);
    expect(queueCalls[0].sourceContext).toEqual(expect.objectContaining({ draftId, kind }));
    expect(queueCalls[0].sourceContext).not.toEqual(expect.objectContaining({ exportId: expect.anything() }));
  });
});
