import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createThreadsPublishTool } from "../../../openclaw/extensions/threads-publish/src/threads-publish-tool";
import { createInstagramPublishTool } from "../../../openclaw/extensions/instagram-publish/src/instagram-publish-tool";
import { hashApprovedQueuePayload } from "../../../openclaw/extensions/threads-queue/api";
import type { ClaimablePost } from "../../../openclaw/extensions/threads-queue/src/queue-claim";
import { createTempDir, cleanupTestEnv, setupTestEnv } from "../helpers";

// Regression: OSMU-20260914-06. 공급자의 명시적 non-2xx를 결과 불명이 아니라 확정 실패로 남긴다
// Found by /qa on 2026-09-14
// Report: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md

describe("OSMU 감사 항목 6 공급자 확정 실패 분류", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    tempDir = createTempDir();
    setupTestEnv(tempDir);
    queuePath = path.join(tempDir, "queue.json");
  });

  afterEach(() => cleanupTestEnv(tempDir));

  function writePost(channel: "threads" | "instagram") {
    const imageUrls = channel === "instagram" ? ["https://cdn.example.com/card.png"] : [];
    const post: ClaimablePost = {
      id: `${channel}-post`,
      status: "approved",
      text: "승인 본문",
      imageUrl: channel === "instagram" ? imageUrls[0] : null,
      imageUrls,
      channels: { [channel]: { status: "pending" } },
    };
    post.claim = {
      workerId: "worker-A",
      token: "claim-A",
      claimedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      approvedPayloadHash: hashApprovedQueuePayload(post),
    };
    fs.writeFileSync(queuePath, JSON.stringify({ version: 2, posts: [post] }, null, 2));
  }

  function attemptState(channel: "threads" | "instagram") {
    const post = JSON.parse(fs.readFileSync(queuePath, "utf-8")).posts[0];
    return post.channels[channel].publishAttempt.state;
  }

  it("항목 6 거절 경로: Threads HTTP 400은 provider_failed로 기록한다", async () => {
    writePost("threads");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })));
    const tool = createThreadsPublishTool({
      pluginConfig: { accessToken: "token", userId: "user", queuePath },
    } as never);

    await expect(tool.execute("call-1", {
      text: "승인 본문",
      queue_id: "threads-post",
      claim_token: "claim-A",
    })).rejects.toThrow(/400/);
    expect(attemptState("threads")).toBe("provider_failed");
  });

  it("항목 6 거절 경로: Instagram HTTP 400은 provider_failed로 기록한다", async () => {
    writePost("instagram");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })));
    const tool = createInstagramPublishTool({
      pluginConfig: { accessToken: "token", userId: "user", queuePath },
    } as never);

    await expect(tool.execute("call-2", {
      caption: "승인 본문",
      image_urls: ["https://cdn.example.com/card.png"],
      queue_id: "instagram-post",
      claim_token: "claim-A",
    })).rejects.toThrow(/400/);
    expect(attemptState("instagram")).toBe("provider_failed");
  });
});
