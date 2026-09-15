import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTestPluginApi } from "openclaw/plugin-sdk/plugin-test-api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withQueueLock } from "../../threads-queue/src/queue-lock.js";
import { createThreadsInsightsTool } from "./threads-insights-tool.js";

let root = "";

afterEach(async () => {
  vi.unstubAllGlobals();
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = "";
});

// Regression: OSMU-CODE-REVIEW-20260916-06. 성과 수집기가 잠금 밖의 오래된 큐 전체를
// 되써 고객 취소와 다른 발행 결과를 되돌릴 수 있었다.
// Found by /qa on 2026-09-16
// Report: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-16.md
describe("OSMU-CODE-REVIEW-20260916-06 성과 수집 큐 병합", () => {
  it("정상: 수집 중 바뀌지 않은 발행 글에는 새 성과를 합친다", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "threads-insights-merge-"));
    const queuePath = path.join(root, "queue.json");
    await fs.writeFile(queuePath, JSON.stringify({ version: 2, posts: [{
      id: "post-1", text: "글", originalText: null, topic: "주제", hashtags: [],
      status: "published", generatedAt: "2026-09-16T00:00:00.000Z", approvedAt: null,
      scheduledAt: null, publishedAt: "2026-09-16T00:00:00.000Z", threadsMediaId: "media-1",
      error: null, abVariant: "A", model: null, engagement: null,
    }] }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [
      { name: "views", values: [{ value: 42 }] },
    ] }), { status: 200 })));
    const api = createTestPluginApi({ id: "threads-insights", name: "threads-insights", pluginConfig: {
      accessToken: "token", userId: "user", queuePath, stylePath: path.join(root, "style.json"),
      popularPostsPath: path.join(root, "popular.txt"), viralThreshold: 100,
    } });

    await createThreadsInsightsTool(api).execute("call-1", { action: "collect" });

    const queue = JSON.parse(await fs.readFile(queuePath, "utf8"));
    expect(queue.posts[0].engagement).toMatchObject({ views: 42, collectCount: 1 });
  });

  it("거절: 수집 응답 전 취소된 글을 오래된 published 상태로 되돌리지 않는다", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "threads-insights-cancel-"));
    const queuePath = path.join(root, "queue.json");
    const initial = { version: 2, posts: [{
      id: "post-1", text: "글", originalText: null, topic: "주제", hashtags: [],
      status: "published", generatedAt: "2026-09-16T00:00:00.000Z", approvedAt: null,
      scheduledAt: null, publishedAt: "2026-09-16T00:00:00.000Z", threadsMediaId: "media-1",
      error: null, abVariant: "A", model: null, engagement: null,
    }] };
    await fs.writeFile(queuePath, JSON.stringify(initial));
    let finishFetch!: () => void;
    const waiting = new Promise<void>((resolve) => { finishFetch = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => {
      await waiting;
      return new Response(JSON.stringify({ data: [{ name: "views", values: [{ value: 42 }] }] }), { status: 200 });
    }));
    const api = createTestPluginApi({ id: "threads-insights", name: "threads-insights", pluginConfig: {
      accessToken: "token", userId: "user", queuePath, stylePath: path.join(root, "style.json"),
      popularPostsPath: path.join(root, "popular.txt"), viralThreshold: 100,
    } });
    const collecting = createThreadsInsightsTool(api).execute("call-2", { action: "collect" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await withQueueLock(queuePath, async () => {
      const queue = JSON.parse(await fs.readFile(queuePath, "utf8"));
      queue.posts[0].status = "canceled";
      queue.posts[0].canceledAt = "2026-09-16T00:01:00.000Z";
      await fs.writeFile(queuePath, JSON.stringify(queue));
    });
    finishFetch();
    await collecting;

    const queue = JSON.parse(await fs.readFile(queuePath, "utf8"));
    expect(queue.posts[0]).toMatchObject({ status: "canceled", canceledAt: "2026-09-16T00:01:00.000Z", engagement: null });
  });
});
