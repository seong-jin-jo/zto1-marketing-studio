import { describe, expect, it, vi } from "vitest";
import { runWithConcurrency } from "@/lib/async-pool";

describe("브라우저 발행 동시 실행 제한", () => {
  it("항목 36 정상 경로: 작업이 많아도 동시에 세 개까지만 실행한다", async () => {
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];

    const running = runWithConcurrency([1, 2, 3, 4, 5, 6], 3, async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
    });

    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases.splice(0, 3).forEach((release) => release());
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases.splice(0, 3).forEach((release) => release());
    await running;

    expect(maximum).toBe(3);
  });

  it("항목 36 거절 경로: 잘못된 동시 실행 수는 작업 시작 전에 거절한다", async () => {
    const worker = vi.fn(async () => {});

    await expect(runWithConcurrency([1], 0, worker)).rejects.toThrow("1 이상의 안전한 정수");
    expect(worker).not.toHaveBeenCalled();
  });
});
