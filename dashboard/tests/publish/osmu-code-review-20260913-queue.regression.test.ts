import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginQueuePublishAttempt, hashApprovedQueuePayload } from "../../../openclaw/extensions/threads-queue/api";
import { createTempDir, cleanupTestEnv, setupTestEnv } from "../helpers";

let tempDir: string;

function queuePath(): string {
  return path.join(tempDir, "queue.json");
}

function writeQueue(post: Record<string, unknown>): void {
  fs.writeFileSync(queuePath(), JSON.stringify({ version: 2, posts: [post] }, null, 2));
}

function readPost(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(queuePath(), "utf-8")).posts[0];
}

beforeEach(() => {
  vi.resetModules();
  tempDir = createTempDir();
  setupTestEnv(tempDir);
});

afterEach(() => cleanupTestEnv(tempDir));

describe("OSMU 코드 리뷰 1, 2, 3, 4, 23 발행 격리 계약", () => {
  it("항목 1: Compose가 빌드하는 정본에 claim 동작이 있고 루트는 호환 진입점뿐이다", () => {
    const root = path.resolve(__dirname, "../../../");
    const compose = fs.readFileSync(path.join(root, "docker-compose.postagi-4tenants.yml"), "utf-8");
    const runtimeTool = fs.readFileSync(path.join(root, "openclaw/extensions/threads-queue/src/threads-queue-tool.ts"), "utf-8");
    const compatibility = fs.readFileSync(path.join(root, "extensions/threads-queue/src/threads-queue-tool.ts"), "utf-8");

    expect(compose).toMatch(/context: \.\/openclaw/);
    expect(runtimeTool).toContain('case "get_approved"');
    expect(runtimeTool).toContain('case "verify_claim"');
    expect(runtimeTool).toContain("withQueueLock(queuePath");
    expect(compatibility).toContain("openclaw/extensions/threads-queue");
  });

  it("항목 23: pending을 publishing으로 원자 전이한 뒤 취소는 200이 아니라 409다", async () => {
    writeQueue({
      id: "post-publishing",
      status: "approved",
      text: "승인 본문",
      scheduledAt: new Date(Date.now() - 60_000).toISOString(),
      claim: {
        workerId: "worker-A",
        token: "token-A",
        claimedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        approvedPayloadHash: hashApprovedQueuePayload({ id: "post-publishing", status: "approved", text: "승인 본문", channels: {} }),
      },
      channels: {
        threads: { status: "pending", publishedAt: null, error: null },
        x: { status: "skipped", publishedAt: null, error: null },
        instagram: { status: "skipped", publishedAt: null, error: null },
      },
    });

    const attempt = await beginQueuePublishAttempt({
      queuePath: queuePath(),
      postId: "post-publishing",
      channel: "threads",
      claimToken: "token-A",
      payload: { text: "승인 본문" },
    });
    expect(attempt.idempotencyKey).toBeTruthy();
    expect((readPost().channels as Record<string, { status: string }>).threads.status).toBe("publishing");

    const { POST } = await import("@/app/api/queue/[postId]/cancel/route");
    const response = await POST(
      new Request("http://localhost/api/queue/post-publishing/cancel", { method: "POST" }),
      { params: Promise.resolve({ postId: "post-publishing" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("PUBLISH_IN_PROGRESS");
    expect((readPost().channels as Record<string, { status: string }>).threads.status).toBe("publishing");
    expect((readPost().claim as { token: string }).token).toBe("token-A");
  });

  it("항목 3: 토큰 누락과 불일치가 발행 전이에 앞서 fail-closed 된다", async () => {
    writeQueue({
      id: "post-token",
      status: "approved",
      claim: {
        workerId: "worker-A",
        token: "token-A",
        claimedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        approvedPayloadHash: hashApprovedQueuePayload({ id: "post-token", status: "approved", text: "승인 본문", channels: {} }),
      },
      channels: { threads: { status: "pending", publishedAt: null, error: null } },
      text: "승인 본문",
    });

    await expect(beginQueuePublishAttempt({
      queuePath: queuePath(),
      postId: "post-token",
      channel: "threads",
      claimToken: "",
      payload: { text: "승인 본문" },
    })).rejects.toThrow(/claim-required/);
    await expect(beginQueuePublishAttempt({
      queuePath: queuePath(),
      postId: "post-token",
      channel: "threads",
      claimToken: "token-B",
      payload: { text: "승인 본문" },
    })).rejects.toThrow(/claim-mismatch/);
    expect((readPost().channels as Record<string, { status: string }>).threads.status).toBe("pending");
  });

  it("항목 4: 세 공급자 도구 모두 큐 발행 전이를 fetch보다 먼저 실행한다", () => {
    const root = path.resolve(__dirname, "../../../openclaw/extensions");
    for (const relative of [
      "threads-publish/src/threads-publish-tool.ts",
      "x-publish/src/x-publish-tool.ts",
      "instagram-publish/src/instagram-publish-tool.ts",
    ]) {
      const source = fs.readFileSync(path.join(root, relative), "utf-8");
      const begin = source.indexOf("await beginQueuePublishAttempt");
      const providerFetch = source.indexOf("fetch(", begin);
      expect(begin, relative).toBeGreaterThan(-1);
      expect(providerFetch, relative).toBeGreaterThan(begin);
      expect(source).toContain('claim_token", { required: true }');
      expect(source).toContain('queue_id", { required: true }');
    }
  });
});
