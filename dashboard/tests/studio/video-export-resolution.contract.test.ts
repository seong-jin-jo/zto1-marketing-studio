import { describe, expect, it } from "vitest";
import {
  SHORT_FORM_EXPORT_HEIGHT,
  SHORT_FORM_EXPORT_WIDTH,
  shortFormCanvasFfmpegArgs,
} from "@/lib/studio/video-export-renderer";

describe("쇼츠·릴스·TikTok 영상 내보내기 해상도", () => {
  it("VIDEO-CAPCUT-R3-01 540×960 원본은 확대하지 않고 1080×1920 캔버스에 중앙 배치한다", () => {
    const args = shortFormCanvasFfmpegArgs({
      inputPath: "source.mp4",
      outputPath: "canvas.mp4",
      sourceWidth: 540,
      sourceHeight: 960,
    });
    const command = args.join(" ");

    expect(command).toContain("scale=540:960:force_original_aspect_ratio=decrease");
    expect(command).toContain(`pad=${SHORT_FORM_EXPORT_WIDTH}:${SHORT_FORM_EXPORT_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`);
    expect(command).not.toContain("scale=1080:1920");
  });

  it("VIDEO-CAPCUT-R3-02 큰 가로 원본은 비율을 유지해 축소하고 세로 캔버스에 중앙 배치한다", () => {
    const args = shortFormCanvasFfmpegArgs({
      inputPath: "landscape.mp4",
      outputPath: "canvas.mp4",
      sourceWidth: 1920,
      sourceHeight: 1080,
    });
    const command = args.join(" ");

    expect(command).toContain("scale=1080:1080:force_original_aspect_ratio=decrease");
    expect(command).toContain("force_divisible_by=2");
    expect(command).toContain("setsar=1");
  });
});
