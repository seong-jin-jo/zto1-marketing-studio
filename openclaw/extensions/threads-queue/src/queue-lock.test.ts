import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { withQueueLock } from "./queue-lock.js";

let root = "";

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true });
  root = "";
});

describe("CODE-REVIEW-20260915-09 공용 큐 잠금 규약", () => {
  it("CODE-REVIEW-20260915-09 정상: 잠금 디렉터리에 독자 파일을 남기지 않는다", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "osmu-queue-lock-"));
    const queuePath = path.join(root, "queue.json");

    const entries = await withQueueLock(queuePath, async () => fs.readdir(`${queuePath}.lock`));

    expect(entries).toEqual([]);
    await expect(fs.stat(`${queuePath}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.readFile(queuePath, "utf8").then(JSON.parse)).resolves.toEqual({ version: 2, posts: [] });
  });

  // Regression: OSMU-CODE-REVIEW-20260916-05. 첫 잠금이 없는 queue.json을 0바이트로
  // 만들고 실제 독자의 JSON.parse를 깨뜨렸다.
  // Found by /qa on 2026-09-16
  // Report: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-16.md
  it("OSMU-CODE-REVIEW-20260916-05 거절: 첫 실행 중 다른 잠금 사용자가 빈 큐를 관찰하지 않는다", async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "osmu-queue-first-run-"));
    const queuePath = path.join(root, "queue.json");

    await Promise.all([
      withQueueLock(queuePath, async () => JSON.parse(await fs.readFile(queuePath, "utf8"))),
      withQueueLock(queuePath, async () => JSON.parse(await fs.readFile(queuePath, "utf8"))),
    ]);

    const queue = JSON.parse(await fs.readFile(queuePath, "utf8"));
    expect(queue).toEqual({ version: 2, posts: [] });
  });
});
