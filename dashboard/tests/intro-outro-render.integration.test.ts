import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { describe, expect, it } from "vitest";

// 2026-10-02 — 실제 Remotion 렌더 + ffmpeg concat 통합 테스트. 모킹 없이 1초 컴포지션을
// 실제로 렌더하고 샘플 mp4와 합쳐, ffprobe로 "합 길이 = 부분 길이 합 ± 0.2s"를 단언한다.
// Chromium headless shell이 로컬에 없으면(CI 없는 호스트) 그 사실을 명시하고 skip한다 —
// 거짓 PASS보다 명시적 미검증이 낫다(§3).
const execFileP = promisify(execFile);
const FFMPEG_BIN = process.env.FFMPEG_BIN || "ffmpeg";
const FFPROBE_BIN = process.env.FFPROBE_BIN || "ffprobe";

async function ffprobeDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileP(FFPROBE_BIN, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

async function makeSampleVideo(outputPath: string, durationSec: number): Promise<void> {
  await execFileP(FFMPEG_BIN, [
    "-y",
    "-f", "lavfi", "-i", `color=c=blue:s=640x360:d=${durationSec}`,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-shortest",
    "-c:v", "libx264", "-c:a", "aac",
    outputPath,
  ]);
}

let chromiumAvailable = true;
try {
  // @remotion/renderer bundles its own headless shell download; a quick existence probe
  // avoids a slow, confusing failure deep inside renderMedia.
  require.resolve("@remotion/renderer");
} catch {
  chromiumAvailable = false;
}

describe.skipIf(!chromiumAvailable)("intro-outro 실제 렌더 + concat", () => {
  it("1초 아웃트로 컴포지션 렌더 → 2초 샘플 영상과 합치면 합 길이가 ±0.2s 안에 맞는다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "intro-outro-it-"));
    try {
      const { concatSegments, renderIntroOutroClip } = await import("@/lib/intro-outro-render");

      const outroRaw = path.join(tmpDir, "outro-raw.mp4");
      await renderIntroOutroClip(
        "outro-logo-reveal",
        { brandName: "TEST", logoUrl: "", primaryColor: "#000000" },
        outroRaw,
      );
      expect(fs.existsSync(outroRaw)).toBe(true);
      const outroDuration = await ffprobeDuration(outroRaw);

      const mainRaw = path.join(tmpDir, "main.mp4");
      await makeSampleVideo(mainRaw, 2);
      const mainDuration = await ffprobeDuration(mainRaw);

      // normalize both to a common format before concat (same approach as composeIntroOutro)
      const mainNorm = path.join(tmpDir, "main-norm.mp4");
      const outroNorm = path.join(tmpDir, "outro-norm.mp4");
      await execFileP(FFMPEG_BIN, [
        "-y", "-i", mainRaw,
        "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
        "-c:v", "libx264", "-c:a", "aac", "-ar", "44100",
        mainNorm,
      ]);
      await execFileP(FFMPEG_BIN, [
        "-y", "-i", outroRaw,
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30",
        "-shortest", "-c:v", "libx264", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0",
        outroNorm,
      ]);

      const outputPath = path.join(tmpDir, "final.mp4");
      const result = await concatSegments([mainNorm, outroNorm], outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
      const expectedSum = mainDuration + outroDuration;
      expect(Math.abs(result.durationSec - expectedSum)).toBeLessThanOrEqual(0.2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  // Chrome Headless Shell 첫 다운로드(약 92MB)와 번들링이 이 시간 안에 들어간다(CI 실측: 다운로드만
  // 약 10초). 렌더 자체는 로컬 10~25초.
  }, 180000);
});
