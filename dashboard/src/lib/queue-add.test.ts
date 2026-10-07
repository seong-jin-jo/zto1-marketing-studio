import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ gateCalls: 0, prepared: null as null | { imageUrl: string; imageUrls: string[]; filenames: string[] } }));

vi.mock("@/lib/studio/card-deck-v3-publish-gate", () => ({
  assertDraftCanEnterPublishQueue: vi.fn(async () => { H.gateCalls += 1; return H.prepared; }),
}));
vi.mock("@/lib/queue-store", () => ({ mirrorQueuePost: vi.fn(async () => true) }));

describe("S2-B 큐 멱등 재시도", () => {
  let dataDir: string;
  const tenantId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.resetModules();
    H.gateCalls = 0;
    H.prepared = null;
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "queue-add-s2-"));
    process.env.DATA_DIR = dataDir;
  });
  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it("S2-R2-m1 기존 idempotency key 재시도도 최신 v3 PNG를 렌더해 기존 큐 항목에 반영한다", async () => {
    H.prepared = { imageUrl: "fresh-1", imageUrls: ["fresh-1", "fresh-2"], filenames: ["one.png", "two.png"] };
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
    expect(result).toMatchObject({ reused: true, post: { id: "existing", imageUrl: "fresh-1", imageUrls: ["fresh-1", "fresh-2"] } });
    expect(H.gateCalls).toBe(1);
    const saved = JSON.parse(fs.readFileSync(path.join(tenantDir, "queue.json"), "utf8")) as { posts: Array<{ imageUrl: string; imageUrls: string[] }> };
    expect(saved.posts[0]).toMatchObject({ imageUrl: "fresh-1", imageUrls: ["fresh-1", "fresh-2"] });
  });

  it("S4-AC5 정상: 검증된 export artifact를 큐 미디어로 고정하고 draft 재렌더를 건너뛴다", async () => {
    const { runWithTenant } = await import("@/lib/tenant-context");
    const { addQueuePost } = await import("./queue-add");
    const result = await runWithTenant(tenantId, () => addQueuePost(tenantId, {
      text: "최신 영상",
      draftId: "22222222-2222-4222-8222-222222222222",
      videoUrl: "/media/source.mp4",
      idempotencyKey: "export-bound",
    }, {
      preparedMedia: {
        imageUrl: null,
        imageUrls: null,
        videoFilename: "export-final.mp4",
        videoUrl: "/api/exports/deliver/signed-export",
      },
    }));

    expect(H.gateCalls).toBe(0);
    expect(result.post).toMatchObject({
      videoFilename: "export-final.mp4",
      videoUrl: "/api/exports/deliver/signed-export",
    });
  });

  it("S4-R2-M4 정상: 같은 export ID의 발행실 고정은 publish_ready 한 건만 유지한다", async () => {
    const tenantDir = path.join(dataDir, "tenants", tenantId);
    fs.mkdirSync(tenantDir, { recursive: true });
    const { runWithTenant } = await import("@/lib/tenant-context");
    const { addQueuePost } = await import("./queue-add");
    const input = {
      text: "발행실 고정 본문",
      draftId: "22222222-2222-4222-8222-222222222222",
      idempotencyKey: "studio-export:33333333-3333-4333-8333-333333333333",
    };
    const options = {
      preparedMedia: { imageUrl: "signed-1", imageUrls: ["signed-1"] },
      initialStatus: "publish_ready" as const,
    };

    const first = await runWithTenant(tenantId, () => addQueuePost(tenantId, input, options));
    const second = await runWithTenant(tenantId, () => addQueuePost(tenantId, input, options));

    expect(first.reused).toBe(false);
    expect(second).toMatchObject({ reused: true, post: { id: first.post.id, status: "publish_ready" } });
    const saved = JSON.parse(fs.readFileSync(path.join(tenantDir, "queue.json"), "utf8")) as { posts: Array<{ status: string }> };
    expect(saved.posts).toHaveLength(1);
    expect(saved.posts[0].status).toBe("publish_ready");
  });
});
