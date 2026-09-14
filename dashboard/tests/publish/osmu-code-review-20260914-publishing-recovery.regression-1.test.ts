import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordQueueProviderResult } from "../../../openclaw/extensions/threads-queue/api";
import {
  claimPost,
  type ClaimablePost,
} from "../../../openclaw/extensions/threads-queue/src/queue-claim";
import { createTempDir, cleanupTestEnv, setupTestEnv } from "../helpers";

// Regression: OSMU-20260914-05. 만료 lease를 교체해 새 워커와 옛 워커가 모두 막히던 문제
// Found by /qa on 2026-09-14
// Report: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md

describe("OSMU 감사 항목 5 발행 중 결과 복구", () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    setupTestEnv(tempDir);
    queuePath = path.join(tempDir, "queue.json");
  });

  afterEach(() => cleanupTestEnv(tempDir));

  function publishingPost(): ClaimablePost {
    return {
      id: "publishing-1",
      status: "approved",
      claim: {
        workerId: "worker-old",
        token: "claim-old",
        claimedAt: "2026-09-14T00:00:00.000Z",
        expiresAt: "2026-09-14T00:01:00.000Z",
      },
      channels: {
        threads: {
          status: "publishing",
          publishAttempt: {
            claimToken: "claim-old",
            idempotencyKey: "attempt-old",
            startedAt: "2026-09-14T00:00:10.000Z",
            state: "publishing",
          },
        },
      },
    };
  }

  it("항목 5 경합 경로: 발행 중인 만료 claim을 새 워커가 덮어쓰지 않는다", () => {
    const post = publishingPost();
    const claimed = claimPost(post, {
      workerId: "worker-new",
      token: "claim-new",
      now: new Date("2026-09-14T00:02:00.000Z"),
    });
    expect(claimed).toBeNull();
    expect(post.claim?.token).toBe("claim-old");
  });

  it("항목 5 복구 경로: 만료 뒤 도착한 옛 워커 결과를 원래 시도에 기록한다", async () => {
    fs.writeFileSync(queuePath, JSON.stringify({ version: 2, posts: [publishingPost()] }, null, 2));
    await expect(recordQueueProviderResult({
      queuePath,
      postId: "publishing-1",
      channel: "threads",
      claimToken: "claim-old",
      idempotencyKey: "attempt-old",
      state: "provider_succeeded",
      providerId: "threads-1",
    })).resolves.toBeUndefined();

    const post = JSON.parse(fs.readFileSync(queuePath, "utf-8")).posts[0];
    expect(post.channels.threads.publishAttempt).toMatchObject({
      state: "provider_succeeded",
      providerId: "threads-1",
    });
  });
});
