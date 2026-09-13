import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  beginQueuePublishAttempt,
  hashApprovedQueuePayload,
} from "../../../openclaw/extensions/threads-queue/api";
import type { ClaimablePost } from "../../../openclaw/extensions/threads-queue/src/queue-claim";
import { createTempDir, cleanupTestEnv, setupTestEnv } from "../helpers";

// Regression: OSMU-20260914-03. 승인 뒤 호출자가 본문이나 미디어를 바꿔 외부 발행하던 문제
// Found by /qa on 2026-09-14
// Report: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md

describe("OSMU 감사 항목 3 승인 payload 결속", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    setupTestEnv(tempDir);
    queuePath = path.join(tempDir, "queue.json");
  });

  afterEach(() => cleanupTestEnv(tempDir));

  function writeApprovedPost(overrides: Record<string, unknown> = {}) {
    const post: ClaimablePost = {
      id: "approved-1",
      status: "approved",
      text: "승인 본문 A",
      imageUrl: "/images/approved.png",
      imageUrls: ["/images/approved-1.png", "/images/approved-2.png"],
      channels: {
        threads: { status: "pending" },
        x: { status: "pending" },
        instagram: { status: "pending" },
      },
      ...overrides,
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

  it("항목 3 정상 경로: 승인한 Instagram 본문과 이미지 순서만 발행 전이한다", async () => {
    writeApprovedPost();
    await expect(beginQueuePublishAttempt({
      queuePath,
      postId: "approved-1",
      channel: "instagram",
      claimToken: "claim-A",
      payload: {
        text: "승인 본문 A",
        imageUrls: ["/images/approved-1.png", "/images/approved-2.png"],
      },
    })).resolves.toMatchObject({ idempotencyKey: expect.any(String) });
  });

  it("항목 3 거절 경로: 같은 claim으로 승인하지 않은 본문 B를 발행하지 못한다", async () => {
    writeApprovedPost();
    await expect(beginQueuePublishAttempt({
      queuePath,
      postId: "approved-1",
      channel: "threads",
      claimToken: "claim-A",
      payload: { text: "바꿔치기 본문 B", imageUrls: ["/images/approved.png"] },
    })).rejects.toThrow(/approved-payload-mismatch/);
  });

  it("항목 3 거절 경로: claim 뒤 큐 원본이 바뀌면 기존 승인 해시를 재사용하지 못한다", async () => {
    writeApprovedPost({ text: "승인 뒤 변경된 본문" });
    const queue = JSON.parse(fs.readFileSync(queuePath, "utf-8"));
    queue.posts[0].claim.approvedPayloadHash = hashApprovedQueuePayload({
      ...queue.posts[0],
      text: "승인 당시 본문",
    });
    fs.writeFileSync(queuePath, JSON.stringify(queue));

    await expect(beginQueuePublishAttempt({
      queuePath,
      postId: "approved-1",
      channel: "x",
      claimToken: "claim-A",
      payload: { text: "승인 뒤 변경된 본문" },
    })).rejects.toThrow(/approved-payload-changed/);
  });
});
