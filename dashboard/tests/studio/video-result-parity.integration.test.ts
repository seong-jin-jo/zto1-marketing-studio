import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { planPlaybackBurn, playbackFfmpegArgs } from "@/lib/studio/playback-edit-plan";
import { resolveVideoPublishFilename, resolveVideoRenderSourceFilename } from "@/lib/studio/video-publish-filename";
import { emptyVideoEdit, type VideoEdit } from "@/lib/studio/video-edit-contract";

const execFileP = promisify(execFile);
const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
const ffprobe = process.env.FFPROBE_BIN || "ffprobe";
const fontFile = "/System/Library/Fonts/AppleSDGothicNeo.ttc";
const drawtextAvailable = (() => {
  try {
    return execFileSync(ffmpeg, ["-hide_banner", "-filters"], { encoding: "utf8" }).includes(" drawtext ");
  } catch {
    return false;
  }
})();

async function probe(filePath: string) {
  const { stdout } = await execFileP(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type",
    "-of", "json",
    filePath,
  ]);
  const parsed = JSON.parse(stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
  return {
    durationSec: Number.parseFloat(parsed.format?.duration || "0"),
    videoStreams: parsed.streams?.filter((stream) => stream.codec_type === "video").length ?? 0,
    audioStreams: parsed.streams?.filter((stream) => stream.codec_type === "audio").length ?? 0,
  };
}

async function frame(filePath: string, second: number, outputPath: string) {
  await execFileP(ffmpeg, ["-y", "-ss", String(second), "-i", filePath, "-frames:v", "1", outputPath]);
}

async function changedPixelRatio(baselinePath: string, actualPath: string, diffPath: string) {
  const baseline = await sharp(baselinePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const actual = await sharp(actualPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(actual.info).toEqual(baseline.info);
  const diff = Buffer.alloc(baseline.data.length);
  let changed = 0;
  for (let offset = 0; offset < baseline.data.length; offset += baseline.info.channels) {
    let pixelChanged = false;
    for (let channel = 0; channel < baseline.info.channels; channel += 1) {
      const delta = Math.abs(baseline.data[offset + channel] - actual.data[offset + channel]);
      diff[offset + channel] = channel === 3 ? 255 : delta;
      if (delta > 12) pixelChanged = true;
    }
    if (pixelChanged) changed += 1;
  }
  await sharp(diff, { raw: baseline.info }).png().toFile(diffPath);
  return changed / (baseline.info.width * baseline.info.height);
}

function editFixture(): VideoEdit {
  return {
    ...emptyVideoEdit(),
    subtitles: [
      { id: "subtitle-visible", order: 0, text: "자막 확인", startSec: 0, endSec: 4, cut: false },
      { id: "subtitle-cut", order: 1, text: "삭제 구간", startSec: 5, endSec: 8, cut: true },
    ],
    overlays: [
      { id: "hook", order: 0, kind: "hook", text: "후킹 확인", startSec: 9, endSec: 12 },
      { id: "cta", order: 1, kind: "cta", text: "CTA 확인", startSec: 20, endSec: 23 },
    ],
    comments: [
      { id: "comment", order: 0, author: "실제 사용자", text: "댓글 확인", source: "collected", startSec: 14, endSec: 17 },
    ],
  };
}

describe("편집실 영상 플레이어와 결과 파일 정합", () => {
  it("P1-03-VIDEO-01~04 30초 오디오 영상에서 컷·오디오를 실제 결과로 검증하고 글자 구간 계약을 고정한다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "editroom-video-parity-"));
    const evidenceDir = process.env.EDITROOM_VIDEO_EVIDENCE_DIR || tmpDir;
    fs.mkdirSync(evidenceDir, { recursive: true });
    try {
      const inputPath = path.join(tmpDir, "input.mp4");
      const outputPath = path.join(tmpDir, "output.mp4");
      await execFileP(ffmpeg, [
        "-y",
        "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=30",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=30",
        "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
        inputPath,
      ]);

      const edit = editFixture();
      const plan = planPlaybackBurn({
        edit,
        durationSec: 30,
        width: 320,
        height: 180,
        size: "작게",
        fontFile: fs.existsSync(fontFile) ? fontFile : null,
        hasAudio: true,
      });
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.outputDurationSec).toBe(27);
      expect(plan.keptTexts).toEqual(expect.arrayContaining(["자막 확인", "후킹 확인", "CTA 확인", "실제 사용자 댓글 확인"]));
      expect(plan.droppedTexts).toContain("삭제 구간");
      for (const expectedText of ["자막 확인", "후킹 확인", "CTA 확인", "실제 사용자 댓글 확인"]) {
        expect(plan.filterComplex).toContain(expectedText);
      }

      // macOS Homebrew 기본 ffmpeg는 drawtext 없이 배포될 수 있다. 그 환경에서도 production
      // 컷·오디오 그래프는 실제로 실행한다. 글자 프레임은 drawtext가 있는 Debian CI에서
      // 같은 시험이 그대로 실행되고, 로컬에서는 필터 문자열·시간 계약만 검증한다.
      const executablePlan = drawtextAvailable ? plan : planPlaybackBurn({
        edit: {
          ...emptyVideoEdit(),
          subtitles: [{ id: "cut-only", order: 0, text: "", startSec: 5, endSec: 8, cut: true }],
        },
        durationSec: 30,
        width: 320,
        height: 180,
        size: "작게",
        fontFile: null,
        hasAudio: true,
      });
      expect(executablePlan.ok).toBe(true);
      const args = playbackFfmpegArgs(executablePlan, { inputPath, outputPath });
      expect(args).not.toBeNull();
      await execFileP(ffmpeg, args!);

      const sourceProbe = await probe(inputPath);
      const resultProbe = await probe(outputPath);
      expect(sourceProbe.durationSec).toBeCloseTo(30, 1);
      expect(resultProbe.durationSec).toBeCloseTo(27, 1);
      expect(resultProbe.audioStreams).toBe(1);
      expect(resultProbe.videoStreams).toBe(1);

      const cutFrames = [
        { name: "before-cut", sourceSecond: 4.5, outputSecond: 4.5 },
        { name: "after-cut", sourceSecond: 8.5, outputSecond: 5.5 },
      ];
      for (const check of cutFrames) {
        await frame(inputPath, check.sourceSecond, path.join(evidenceDir, `${check.name}-player-frame.png`));
        await frame(outputPath, check.outputSecond, path.join(evidenceDir, `${check.name}-result-frame.png`));
      }

      const checks = [
        { name: "subtitle", sourceSecond: 2, outputSecond: 2, expectedText: "자막 확인" },
        { name: "hook", sourceSecond: 10, outputSecond: 7, expectedText: "후킹 확인" },
        { name: "comment", sourceSecond: 15, outputSecond: 12, expectedText: "실제 사용자 댓글 확인" },
        { name: "cta", sourceSecond: 21, outputSecond: 18, expectedText: "CTA 확인" },
      ];
      const frameObservations = [];
      if (drawtextAvailable) {
        for (const check of checks) {
          const baselinePath = path.join(evidenceDir, `${check.name}-player-frame.png`);
          const actualPath = path.join(evidenceDir, `${check.name}-result-frame.png`);
          const diffPath = path.join(evidenceDir, `${check.name}-diff.png`);
          await frame(inputPath, check.sourceSecond, baselinePath);
          await frame(outputPath, check.outputSecond, actualPath);
          const ratio = await changedPixelRatio(baselinePath, actualPath, diffPath);
          expect(ratio).toBeGreaterThan(0.002);
          frameObservations.push({ ...check, changedPixelRatio: ratio, baselinePath, actualPath, diffPath });
        }
      }

      fs.writeFileSync(path.join(evidenceDir, "video-result-observations.json"), `${JSON.stringify({
        drawtextAvailable,
        glyphFramesVerified: drawtextAvailable,
        sourceProbe,
        resultProbe,
        outputDurationSec: plan.outputDurationSec,
        keptTexts: plan.keptTexts,
        droppedTexts: plan.droppedTexts,
        cutFrames,
        frameObservations,
      }, null, 2)}\n`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 180000);

  it("P1-03-ORDER-01 합성본을 본문 편집 입력으로 쓰고, 본문 편집 결과 하나를 최종 발행 후보로 쓴다", () => {
    const original = "video-original.mp4";
    const composite = {
      introCompId: "intro-logo-reveal" as const,
      outroCompId: "outro-logo-reveal" as const,
      sourceFilename: original,
      resultFilename: "video-intro-outro.mp4",
      deliverUrl: "/api/media/composite",
    };
    const burnInput = resolveVideoRenderSourceFilename(original, composite);
    expect(burnInput).toBe("video-intro-outro.mp4");

    const editedComposite = "video-edited-composite.mp4";
    expect(resolveVideoPublishFilename(editedComposite, composite)).toBe(editedComposite);
  });
});
