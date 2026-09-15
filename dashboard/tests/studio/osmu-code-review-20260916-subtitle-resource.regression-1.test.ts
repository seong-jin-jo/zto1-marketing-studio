import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireSubtitleSlot, subtitleWorkLimitTesting } from "@/lib/studio/subtitle-work-limit";

afterEach(() => subtitleWorkLimitTesting.reset());

describe("OSMU-CODE-REVIEW-20260916-16 자막 자원 계약", () => {
  it("정상: 서로 다른 두 작업 공간은 전역 상한 안에서 함께 실행한다", async () => {
    const releaseA = await acquireSubtitleSlot("tenant-a");
    const releaseB = await acquireSubtitleSlot("tenant-b");
    expect(releaseA).toBeTypeOf("function");
    expect(releaseB).toBeTypeOf("function");
    releaseA?.();
    releaseB?.();
  });

  it("경합: 같은 작업 공간의 두 번째 작업은 첫 작업이 끝난 뒤 시작한다", async () => {
    const releaseFirst = await acquireSubtitleSlot("tenant-a");
    let secondStarted = false;
    const second = acquireSubtitleSlot("tenant-a").then((release) => {
      secondStarted = true;
      return release;
    });
    await Promise.resolve();
    expect(secondStarted).toBe(false);
    releaseFirst?.();
    const releaseSecond = await second;
    expect(secondStarted).toBe(true);
    releaseSecond?.();
  });

  it("거절: 영상 길이 측정 실패를 6초로 바꾸지 않고 작업 전 거절한다", () => {
    const route = fs.readFileSync(path.resolve(process.cwd(), "src/app/api/video/subtitle/route.ts"), "utf8");
    expect(route).toContain('code: "SUBTITLE_VIDEO_PROBE_FAILED"');
    expect(route).not.toContain("durationSec: Number.isFinite(duration) && duration > 0 ? duration : fallback.durationSec");
  });
});
