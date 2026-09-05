import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createTempDir, setupTestEnv, cleanupTestEnv, copyFixture, readTempJson } from "../helpers";

// 승인 = queue.json status→approved + scheduledAt 계산(now + hours). 발행 예약의 입력 지점.
// (실제 발행/published 전환은 외부 게이트웨이 — gateway-dependency.contract.test.ts 참조.)

let tmpDir: string;

beforeEach(() => {
  vi.resetModules();
  tmpDir = createTempDir();
  setupTestEnv(tmpDir);
  copyFixture(tmpDir, "queue.json");
});

afterEach(() => {
  cleanupTestEnv(tmpDir);
});

async function approve(postId: string, hours: number) {
  const { POST } = await import("@/app/api/queue/[postId]/approve/route");
  const res = await POST(
    new Request(`http://localhost/api/queue/${postId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours }),
    }),
    { params: Promise.resolve({ postId }) },
  );
  return { status: res.status, body: await res.json() };
}

function updateFixturePost(postId: string, patch: Record<string, unknown>) {
  const queue = readTempJson<{ posts: Array<Record<string, unknown>> }>(tmpDir, "queue.json");
  const post = queue?.posts.find((candidate) => candidate.id === postId);
  if (!queue || !post) throw new Error(`fixture post not found: ${postId}`);
  Object.assign(post, patch);
  fs.writeFileSync(path.join(tmpDir, "queue.json"), JSON.stringify(queue, null, 2));
}

describe("POST /api/queue/[postId]/approve — scheduledAt", () => {
  it("hours=2 → scheduledAt = approvedAt + 2h, 영속", async () => {
    const { status, body } = await approve("post-001", 2);
    expect(status).toBe(200);
    expect(body.post.status).toBe("approved");
    const approvedAt = Date.parse(body.post.approvedAt);
    const scheduledAt = Date.parse(body.post.scheduledAt);
    expect(scheduledAt - approvedAt).toBe(2 * 3600000);

    const queue = readTempJson<{ posts: Array<Record<string, string>> }>(tmpDir, "queue.json");
    const post = queue!.posts.find((p) => p.id === "post-001")!;
    expect(post.status).toBe("approved");
    expect(post.scheduledAt).toBe(body.post.scheduledAt);
  });

  it("hours=0 → 즉시(scheduledAt ≈ approvedAt)", async () => {
    const { body } = await approve("post-001", 0);
    expect(Date.parse(body.post.scheduledAt)).toBe(Date.parse(body.post.approvedAt));
  });

  it("음수 hours → 0으로 클램프(과거 예약 방지)", async () => {
    const { body } = await approve("post-001", -5);
    expect(Date.parse(body.post.scheduledAt)).toBe(Date.parse(body.post.approvedAt));
  });

  it("V70-INBOX-08 거절: 공백과 줄바꿈뿐인 본문은 승인하지 않고 초안 상태를 유지한다", async () => {
    updateFixturePost("post-001", { text: " \n\t " });

    const { status, body } = await approve("post-001", 0);

    expect(status).toBe(422);
    expect(body).toMatchObject({ code: "REVIEW_CONTENT_MISSING", missingFields: ["body"] });
    const queue = readTempJson<{ posts: Array<Record<string, unknown>> }>(tmpDir, "queue.json");
    expect(queue?.posts.find((post) => post.id === "post-001")).toMatchObject({ status: "draft", text: " \n\t " });
  });

  it("V70-INBOX-09 거절: 제목 필드가 있는 항목의 공백 제목은 승인하지 않는다", async () => {
    updateFixturePost("post-001", { title: " \n " });

    const { status, body } = await approve("post-001", 0);

    expect(status).toBe(422);
    expect(body).toMatchObject({ code: "REVIEW_CONTENT_MISSING", missingFields: ["title"] });
    const queue = readTempJson<{ posts: Array<Record<string, unknown>> }>(tmpDir, "queue.json");
    expect(queue?.posts.find((post) => post.id === "post-001")).toMatchObject({ status: "draft", title: " \n " });
  });
});
