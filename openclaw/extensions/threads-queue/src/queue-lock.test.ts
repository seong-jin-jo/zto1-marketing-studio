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
    await fs.writeFile(queuePath, "{}", "utf8");

    const entries = await withQueueLock(queuePath, async () => fs.readdir(`${queuePath}.lock`));

    expect(entries).toEqual([]);
    await expect(fs.stat(`${queuePath}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
