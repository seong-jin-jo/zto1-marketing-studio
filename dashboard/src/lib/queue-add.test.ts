import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ gateCalls: 0 }));

vi.mock("@/lib/studio/card-deck-v3-publish-gate", () => ({
  assertDraftCanEnterPublishQueue: vi.fn(async () => { H.gateCalls += 1; return null; }),
}));
vi.mock("@/lib/queue-store", () => ({ mirrorQueuePost: vi.fn(async () => true) }));

describe("S2-B 큐 멱등 재시도", () => {
  let dataDir: string;
  const tenantId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    H.gateCalls = 0;
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "queue-add-s2-"));
    process.env.DATA_DIR = dataDir;
  });
  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it("기존 idempotency key 재시도는 렌더나 초안 projection을 다시 실행하지 않는다", async () => {
    const tenantDir = path.join(dataDir, "tenants", tenantId);
    fs.mkdirSync(tenantDir, { recursive: true });
    fs.writeFileSync(path.join(tenantDir, "queue.json"), JSON.stringify({ version: 2, posts: [{
      id: "existing", draftId: "22222222-2222-4222-8222-222222222222", text: "기존", originalText: null,
      topic: "general", hashtags: [], status: "draft", generatedAt: "2026-10-05T00:00:00", approvedAt: null,
      scheduledAt: null, publishedAt: null, threadsMediaId: null, error: null, abVariant: "A", model: "manual",
      imageUrl: null, imageUrls: null, cardBatchId: null, videoFilename: null, videoUrl: null, videoThumbnail: null,
      engagement: null, idempotencyKey: "same-key",
    }] }));
    const { runWithTenant } = await import("@/lib/tenant-context");
    const { addQueuePost } = await import("./queue-add");
    const result = await runWithTenant(tenantId, () => addQueuePost(tenantId, {
      text: "재시도", draftId: "22222222-2222-4222-8222-222222222222", idempotencyKey: "same-key",
    }));
    expect(result).toMatchObject({ reused: true, post: { id: "existing" } });
    expect(H.gateCalls).toBe(0);
  });
});
