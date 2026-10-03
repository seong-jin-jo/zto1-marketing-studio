// @vitest-environment jsdom
import React from "react";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoEditor } from "@/components/studio/VideoEditor";
import { concatSegments } from "@/lib/intro-outro-render";
import { planPlaybackBurn, playbackFfmpegArgs } from "@/lib/studio/playback-edit-plan";
import { alignVideoEditToRenderSource, resolveVideoPublishFilename, resolveVideoRenderSourceFilename } from "@/lib/studio/video-publish-filename";
import { emptyVideoEdit, type VideoEdit } from "@/lib/studio/video-edit-contract";
import {
  bodyDurationFromPlaybackDuration,
  bodyTimeFromPlaybackTime,
  introDurationSec,
  playbackTimeFromBodyTime,
} from "@/lib/studio/video-edit-time-axis";

// 이 테스트는 ffmpeg 합치기만 쓰며 Remotion 브라우저 번들러는 실행하지 않는다.
// jsdom의 TextEncoder와 네이티브 esbuild 조합이 수집 단계에서 충돌하지 않게 경계를 격리한다.
vi.mock("@remotion/bundler", () => ({ bundle: vi.fn() }));
vi.mock("@remotion/renderer", () => ({ renderMedia: vi.fn(), selectComposition: vi.fn() }));
vi.mock("@remotion/player", () => ({ Player: () => null }));

const execFileP = promisify(execFile);
const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
const ffprobe = process.env.FFPROBE_BIN || "ffprobe";
const fontFile = process.env.FFMPEG_FONT_FILE || "/System/Library/Fonts/AppleSDGothicNeo.ttc";
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
  it("REVIEW2-N1-TIME-01 합성본과 구운 결과의 표시 시각을 본문 원본 시각으로 왕복한다", () => {
    const applied = {
      introCompId: "intro-logo-reveal",
      outroCompId: null,
      sourceFilename: "original.mp4",
      compositeFilename: "composite.mp4",
      resultFilename: "baked.mp4",
      renderedCutRanges: [{ startSec: 2, endSec: 4 }],
      deliverUrl: "/api/media/baked",
    };
    expect(introDurationSec(applied)).toBe(2);
    expect(bodyDurationFromPlaybackDuration(6, applied)).toBe(6);
    expect(bodyTimeFromPlaybackTime(1.5, 6, applied)).toBe(0);
    expect(bodyTimeFromPlaybackTime(4.5, 6, applied)).toBe(4.5);
    expect(playbackTimeFromBodyTime(4.5, 6, applied)).toBe(4.5);
    expect(playbackTimeFromBodyTime(3, 6, applied)).toBe(4);
  });

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

  it("P1-03-ORDER-01 UI가 합성본 재생 중 만든 자막·컷·훅을 본문 시간으로 저장하고 실제 결과에 한 번만 옮긴다", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "editroom-video-order-"));
    try {
      const introPath = path.join(tmpDir, "intro.mp4");
      const mainBluePath = path.join(tmpDir, "main-blue.mp4");
      const mainGreenPath = path.join(tmpDir, "main-green.mp4");
      const mainYellowPath = path.join(tmpDir, "main-yellow.mp4");
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
      await makeSegment(mainBluePath, "blue", 2);
      await makeSegment(mainGreenPath, "green", 2);
      await makeSegment(mainYellowPath, "yellow", 2);
      await concatSegments([mainBluePath, mainGreenPath, mainYellowPath], mainPath);
      await concatSegments([introPath, mainPath], compositePath);

      const original = "video-original.mp4";
      const applied = {
        introCompId: "intro-logo-reveal" as const,
        outroCompId: null,
        sourceFilename: original,
        compositeFilename: "video-intro-outro.mp4",
        introDurationSec: 2,
        resultFilename: "video-intro-outro.mp4",
        renderedCutRanges: [],
        deliverUrl: "/api/media/composite",
      };
      expect(resolveVideoRenderSourceFilename(original, applied)).toBe("video-intro-outro.mp4");

      let uiEdit: VideoEdit = { ...emptyVideoEdit(), introOutro: applied };
      function UiHarness() {
        const [lines, setLines] = React.useState(["첫 자막", "자를 장면", "마지막 장면"]);
        const [edit, setEdit] = React.useState(uiEdit);
        return React.createElement(VideoEditor, {
          videoEdit: edit,
          onVideoEditChange: (next: VideoEdit) => { uiEdit = next; setEdit(next); },
          previewVideoUrl: "/api/media/original",
          sourceFilename: original,
          lines,
          onLinesChange: setLines,
        });
      }
      vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
      render(React.createElement(UiHarness));
      const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
      Object.defineProperty(video, "duration", { configurable: true, value: 8 });
      fireEvent.loadedMetadata(video);
      video.currentTime = 3;
      fireEvent.timeUpdate(video);
      fireEvent.change(screen.getAllByLabelText("자막 문구")[0], { target: { value: "UI에서 고친 자막" } });
      fireEvent.click(document.querySelectorAll("[data-video-subtitle-cut-toggle]")[1]);
      fireEvent.click(screen.getByRole("button", { name: "＋훅" }));

      // 플레이어 3초는 2초 인트로 뒤 본문 1초다. UI가 만든 모든 시각이 본문 원본
      // 시간축이어야 렌더 경계에서 인트로를 딱 한 번만 더할 수 있다.
      expect(uiEdit.subtitles.map(({ startSec, endSec, cut }) => [startSec, endSec, cut])).toEqual([
        [0, 2, false],
        [2, 4, true],
        [4, 6, false],
      ]);
      expect(uiEdit.subtitles[0].text).toBe("UI에서 고친 자막");
      expect(uiEdit.overlays[0]).toMatchObject({ kind: "hook", startSec: 1, endSec: 4 });

      const renderEdit = alignVideoEditToRenderSource(uiEdit, applied, original);
      expect(renderEdit.subtitles.map(({ startSec, endSec }) => [startSec, endSec])).toEqual([[2, 4], [4, 6], [6, 8]]);
      expect(renderEdit.overlays[0]).toMatchObject({ startSec: 3, endSec: 6 });

      const compositeProbe = await probe(compositePath);
      const plan = planPlaybackBurn({
        edit: renderEdit,
        durationSec: compositeProbe.durationSec,
        width: 320,
        height: 180,
        size: "작게",
        fontFile: fs.existsSync(fontFile) ? fontFile : null,
        hasAudio: true,
      });
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.filterComplex).toContain("between(t,2,4)");
      const executablePlan = drawtextAvailable ? plan : planPlaybackBurn({
        edit: {
          ...renderEdit,
          subtitles: renderEdit.subtitles.map((line) => ({ ...line, text: "" })),
          overlays: [],
          comments: [],
        },
        durationSec: compositeProbe.durationSec,
        width: 320,
        height: 180,
        size: "작게",
        fontFile: null,
        hasAudio: true,
      });
      expect(executablePlan.ok).toBe(true);
      await execFileP(ffmpeg, playbackFfmpegArgs(executablePlan, { inputPath: compositePath, outputPath })!);

      const resultProbe = await probe(outputPath);
      expect(compositeProbe.durationSec).toBeCloseTo(8, 1);
      expect(resultProbe.durationSec).toBeCloseTo(6, 1);
      expect(resultProbe.videoStreams).toBe(1);
      expect(resultProbe.audioStreams).toBe(1);

      const introFrame = path.join(tmpDir, "intro-frame.png");
      const resultIntroFrame = path.join(tmpDir, "result-intro-frame.png");
      await frame(introPath, 1, introFrame);
      await frame(outputPath, 1, resultIntroFrame);
      expect(await changedPixelRatio(introFrame, resultIntroFrame, path.join(tmpDir, "intro-diff.png"))).toBeLessThan(0.002);

      // 본문 0초 자막은 합성본/결과의 2초에 시작한다. 경계 ±0.1초 프레임으로
      // 실제 구운 자막 시각이 플레이어에서 본 시각과 0.2초 이내인지 고정한다.
      const subtitleChecks = [
        { outputSecond: 1.9, sourceSecond: 1.9, visible: false },
        { outputSecond: 2.1, sourceSecond: 2.1, visible: true },
        { outputSecond: 3.9, sourceSecond: 3.9, visible: true },
        { outputSecond: 4.1, sourceSecond: 6.1, visible: false },
      ];
      for (const check of subtitleChecks) {
        const baseline = path.join(tmpDir, `subtitle-baseline-${check.outputSecond}.png`);
        const actual = path.join(tmpDir, `subtitle-result-${check.outputSecond}.png`);
        await frame(compositePath, check.sourceSecond, baseline);
        await frame(outputPath, check.outputSecond, actual);
        const ratio = await changedPixelRatio(baseline, actual, path.join(tmpDir, `subtitle-diff-${check.outputSecond}.png`));
        if (check.visible && drawtextAvailable) expect(ratio).toBeGreaterThan(0.002);
        else expect(ratio).toBeLessThan(0.002);
      }

      if (!drawtextAvailable) {
        // Homebrew 기본 빌드는 drawtext가 없다. 이때도 UI에서 계산한 동일 경계(2~4초)를
        // drawbox enable에 넣어 실제 mp4 프레임 앞/뒤를 확인한다. Debian CI에서는 위에서
        // production drawtext 자체를 실행하므로 이 분기는 로컬 가시 타이밍 증거만 보강한다.
        const markedOutputPath = path.join(tmpDir, "edited-with-timing-marker.mp4");
        await execFileP(ffmpeg, [
          "-y", "-i", outputPath,
          "-vf", "drawbox=x=20:y=20:w=100:h=20:color=white:t=fill:enable='between(t,2,4)'",
          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "copy",
          markedOutputPath,
        ]);
        for (const check of subtitleChecks) {
          const baseline = path.join(tmpDir, `marker-baseline-${check.outputSecond}.png`);
          const actual = path.join(tmpDir, `marker-result-${check.outputSecond}.png`);
          await frame(outputPath, check.outputSecond, baseline);
          await frame(markedOutputPath, check.outputSecond, actual);
          const ratio = await changedPixelRatio(baseline, actual, path.join(tmpDir, `marker-diff-${check.outputSecond}.png`));
          if (check.visible) expect(ratio).toBeGreaterThan(0.002);
          else expect(ratio).toBeLessThan(0.002);
        }
      }

      // 초록 본문(2~4초)을 UI에서 컷했다. 결과 4.5초는 원본 본문 4.5초, 즉 합성본
      // 6.5초의 노란 프레임이어야 한다. 이 비교가 실제 컷 위치의 ±0.2초 계약이다.
      const expectedAfterCut = path.join(tmpDir, "expected-after-cut.png");
      const actualAfterCut = path.join(tmpDir, "actual-after-cut.png");
      await frame(compositePath, 6.5, expectedAfterCut);
      await frame(outputPath, 4.5, actualAfterCut);
      expect(await changedPixelRatio(expectedAfterCut, actualAfterCut, path.join(tmpDir, "cut-diff.png"))).toBeLessThan(0.002);

      const finalApplied = {
        ...applied,
        resultFilename: "video-edited-composite.mp4",
        renderedCutRanges: [{ startSec: 2, endSec: 4 }],
        deliverUrl: "/api/media/edited",
      };
      expect(resolveVideoPublishFilename("video-edited-composite.mp4", finalApplied)).toBe("video-edited-composite.mp4");
      expect(resolveVideoRenderSourceFilename("video-edited-composite.mp4", finalApplied)).toBe("video-intro-outro.mp4");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 180000);
});
