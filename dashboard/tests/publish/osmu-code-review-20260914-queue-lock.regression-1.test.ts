import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withQueueLock } from "../../../openclaw/extensions/threads-queue/src/queue-lock";

// Regression: OSMU-20260914-04. 살아 있는 13초 임계 구역의 잠금을 10초 뒤 다른 작업이 빼앗던 문제
// Found by /qa on 2026-09-14
// Report: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-14.md

describe("OSMU 감사 항목 4 큐 잠금 소유권과 heartbeat", () => {
  let tempDir: string;
  let target: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-lock-heartbeat-"));
    target = path.join(tempDir, "queue.json");
    fs.writeFileSync(target, '{"posts":[]}');
  });

  afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  it("항목 4 경합 경로: 13초 작업이 끝나기 전에 두 번째 작업이 진입하지 않는다", async () => {
    const startedAt = Date.now();
    const events: Record<string, number> = {};
    const first = withQueueLock(target, async () => {
      events.firstEnter = Date.now() - startedAt;
      await new Promise((resolve) => setTimeout(resolve, 13_000));
      events.firstExit = Date.now() - startedAt;
    });
    await new Promise((resolve) => setTimeout(resolve, 10_200));
    const second = withQueueLock(target, async () => {
      events.secondEnter = Date.now() - startedAt;
    });

    await Promise.all([first, second]);
    expect(events.secondEnter).toBeGreaterThanOrEqual(events.firstExit);
    expect(fs.existsSync(`${target}.lock`)).toBe(false);
  }, 20_000);

  it("항목 4 정상 경로: 잠금 안에서 작업하고 자기 잠금만 해제한다", async () => {
    await expect(withQueueLock(target, async () => "ok")).resolves.toBe("ok");
    expect(fs.existsSync(`${target}.lock`)).toBe(false);
  });
});
