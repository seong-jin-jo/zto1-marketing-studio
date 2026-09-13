import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createThreadsQueueTool } from "../../../openclaw/extensions/threads-queue/src/threads-queue-tool";
import { createTempDir, cleanupTestEnv, setupTestEnv } from "../helpers";

// Regression: OSMU-20260914-07. analytics-history 읽기 실패를 빈 이력으로 바꿔쓰던 문제
// Found by /qa on 2026-09-14
// Report: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md

describe("OSMU 감사 항목 7 성과 이력 보존", () => {
  let tempDir: string;
  let queuePath: string;
  let historyPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    setupTestEnv(tempDir);
    queuePath = path.join(tempDir, "queue.json");
    historyPath = path.join(tempDir, "analytics-history.json");
    fs.writeFileSync(queuePath, JSON.stringify({
      version: 2,
      posts: [{
        id: "published-old",
        text: "보존할 글",
        topic: "general",
        hashtags: [],
        status: "published",
        generatedAt: "2026-08-01T00:00:00.000Z",
        publishedAt: "2026-08-01T00:00:00.000Z",
        engagement: null,
      }],
    }, null, 2));
  });

  afterEach(() => cleanupTestEnv(tempDir));

  function tool() {
    return createThreadsQueueTool({ pluginConfig: { queuePath } } as never);
  }

  it("항목 7 정상 경로: 이력 파일이 없을 때만 새 이력을 만든다", async () => {
    await expect(tool().execute("cleanup-1", { action: "cleanup" })).resolves.toBeTruthy();
    const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
    expect(history.posts).toHaveLength(1);
    expect(history.posts[0].id).toBe("published-old");
  });

  it("항목 7 거절 경로: 손상된 이력을 빈 배열로 덮어쓰지 않고 cleanup 전체를 실패시킨다", async () => {
    fs.writeFileSync(historyPath, '{"posts":[');
    const queueBefore = fs.readFileSync(queuePath, "utf-8");
    await expect(tool().execute("cleanup-2", { action: "cleanup" })).rejects.toThrow();
    expect(fs.readFileSync(historyPath, "utf-8")).toBe('{"posts":[');
    expect(fs.readFileSync(queuePath, "utf-8")).toBe(queueBefore);
  });
});
