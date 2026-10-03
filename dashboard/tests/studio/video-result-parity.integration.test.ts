import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { concatSegments } from "@/lib/intro-outro-render";
import { planPlaybackBurn, playbackFfmpegArgs } from "@/lib/studio/playback-edit-plan";
import { alignVideoEditToRenderSource, resolveVideoPublishFilename, resolveVideoRenderSourceFilename } from "@/lib/studio/video-publish-filename";
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

  it("P1-03-ORDER-01 실제 합성본에서 인트로를 보존하고, 원본 기준 컷·자막 시간을 이동해 최종 결과 하나를 만든다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "editroom-video-order-"));
    try {
      const introPath = path.join(tmpDir, "intro.mp4");
      const mainPath = path.join(tmpDir, "main.mp4");
      const compositePath = path.join(tmpDir, "composite.mp4");
      const outputPath = path.join(tmpDir, "edited.mp4");
      const makeSegment = async (output: string, color: string, duration: number) => {
        await execFileP(ffmpeg, [
          "-y",
          "-f", "lavfi", "-i", `color=c=${color}:s=320x180:r=30:d=${duration}`,
          "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100:d=${duration}`,
          "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", output,
        ]);
      };
      await makeSegment(introPath, "red", 2);
      await makeSegment(mainPath, "blue", 6);
      await concatSegments([introPath, mainPath], compositePath);

      const original = "video-original.mp4";
      const applied = {
        introCompId: "intro-logo-reveal" as const,
        outroCompId: null,
        sourceFilename: original,
        compositeFilename: "video-intro-outro.mp4",
        introDurationSec: 2,
        resultFilename: "video-intro-outro.mp4",
        deliverUrl: "/api/media/composite",
      };
      expect(resolveVideoRenderSourceFilename(original, applied)).toBe("video-intro-outro.mp4");

      const sourceEdit: VideoEdit = {
        ...emptyVideoEdit(),
        introOutro: applied,
        subtitles: [
          { id: "subtitle-shift", order: 0, text: "인트로 뒤 자막", startSec: 0.5, endSec: 1.5, cut: false },
          { id: "cut-main", order: 1, text: "", startSec: 2, endSec: 3, cut: true },
        ],
      };
      const renderEdit = alignVideoEditToRenderSource(sourceEdit, applied, original);
      expect(renderEdit.subtitles.map(({ startSec, endSec }) => [startSec, endSec])).toEqual([[2.5, 3.5], [4, 5]]);

      const compositeProbe = await probe(compositePath);
      const executableEdit = drawtextAvailable ? renderEdit : {
        ...renderEdit,
        subtitles: renderEdit.subtitles.map((line) => ({ ...line, text: "" })),
      };
      const plan = planPlaybackBurn({
        edit: executableEdit,
        durationSec: compositeProbe.durationSec,
        width: 320,
        height: 180,
        size: "작게",
        fontFile: drawtextAvailable && fs.existsSync(fontFile) ? fontFile : null,
        hasAudio: true,
      });
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      if (drawtextAvailable) expect(plan.filterComplex).toContain("between(t,2.5,3.5)");
      await execFileP(ffmpeg, playbackFfmpegArgs(plan, { inputPath: compositePath, outputPath })!);

      const resultProbe = await probe(outputPath);
      expect(compositeProbe.durationSec).toBeCloseTo(8, 1);
      expect(resultProbe.durationSec).toBeCloseTo(7, 1);
      expect(resultProbe.videoStreams).toBe(1);
      expect(resultProbe.audioStreams).toBe(1);

      const introFrame = path.join(tmpDir, "intro-frame.png");
      const resultIntroFrame = path.join(tmpDir, "result-intro-frame.png");
      await frame(introPath, 1, introFrame);
      await frame(outputPath, 1, resultIntroFrame);
      expect(await changedPixelRatio(introFrame, resultIntroFrame, path.join(tmpDir, "intro-diff.png"))).toBeLessThan(0.002);

      if (drawtextAvailable) {
        const beforeSubtitle = path.join(tmpDir, "before-subtitle.png");
        const afterSubtitle = path.join(tmpDir, "after-subtitle.png");
        await frame(compositePath, 2.75, beforeSubtitle);
        await frame(outputPath, 2.75, afterSubtitle);
        expect(await changedPixelRatio(beforeSubtitle, afterSubtitle, path.join(tmpDir, "subtitle-diff.png"))).toBeGreaterThan(0.002);
      }

      const finalApplied = { ...applied, resultFilename: "video-edited-composite.mp4", deliverUrl: "/api/media/edited" };
      expect(resolveVideoPublishFilename("video-edited-composite.mp4", finalApplied)).toBe("video-edited-composite.mp4");
      expect(resolveVideoRenderSourceFilename("video-edited-composite.mp4", finalApplied)).toBe("video-intro-outro.mp4");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 180000);
});
