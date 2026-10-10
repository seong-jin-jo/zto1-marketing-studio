import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { FFMPEG_BIN } from "@/lib/higgsfield";
import { resolveGeneratedFile } from "@/lib/storage";
import { runWithTenant } from "@/lib/tenant-context";
import { MAX_VIDEO_BYTES, MAX_VIDEO_DURATION_SECONDS } from "@/lib/video-limits";
import { alignPlaybackScript, planPlaybackBurn, playbackFfmpegArgs, type PlaybackBurnPlan } from "./playback-edit-plan";
import { pickSubtitleFont, type SubtitleSize } from "./video-subtitle";
import { renderSelectedVoice, resolveRenderMusic, VideoRenderAssetError } from "./video-render-assets";
import type { VideoEdit } from "./video-edit-contract";

const execFileP = promisify(execFile);
const FFPROBE_BIN = process.env.FFPROBE_BIN || "ffprobe";

export interface VideoRenderRequest {
  sourceFilename: string;
  edit: VideoEdit;
  lines: string[];
  subtitleSize: SubtitleSize;
}

export interface VideoRenderResult { width: number; height: number; durationSec: number; hasAudio: boolean }

let drawtextSupport: Promise<boolean> | null = null;

function ffmpegHasDrawtext(): Promise<boolean> {
  drawtextSupport ??= execFileP(FFMPEG_BIN, ["-hide_banner", "-filters"])
    .then(({ stdout, stderr }) => /(^|\n)\s*\S+\s+drawtext\s/m.test(`${stdout}\n${stderr}`))
    .catch(() => false);
  return drawtextSupport;
}

function canvasColor(value: string): string {
  if (value.startsWith("0x")) return `#${value.slice(2).split("@")[0]}`;
  return value.split("@")[0];
}

function canvasBoxColor(value: string): string {
  const [base, alphaText] = value.split("@");
  const alpha = alphaText ? Math.max(0, Math.min(1, Number(alphaText))) : 1;
  const normalized = canvasColor(base);
  if (normalized === "black") return `rgba(0,0,0,${alpha})`;
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    const hex = normalized.slice(1);
    return `rgba(${Number.parseInt(hex.slice(0, 2), 16)},${Number.parseInt(hex.slice(2, 4), 16)},${Number.parseInt(hex.slice(4, 6), 16)},${alpha})`;
  }
  return normalized;
}

async function renderCanvasOverlayFallback(input: {
  plan: Extract<PlaybackBurnPlan, { ok: true }>;
  edit: VideoEdit;
  durationSec: number;
  width: number;
  height: number;
  size: SubtitleSize;
  fontFile: string;
  hasAudio: boolean;
  inputPath: string;
  outputPath: string;
  tmpDir: string;
  musicPath: string | null;
  voicePath: string | null;
}): Promise<void> {
  const canvas = await import("canvas");
  const registeredFamily = `OSMUExport${crypto.randomUUID().replaceAll("-", "")}`;
  let fontFamily = input.fontFile.toLowerCase().includes("myungjo") ? "serif" : "sans-serif";
  try {
    canvas.registerFont(input.fontFile, { family: registeredFamily });
    fontFamily = registeredFamily;
  } catch {
    // node-canvas/Pango가 일부 macOS TTC/TTF 컨테이너를 파싱하지 못할 때도
    // 운영체제의 동일 계열 기본 글꼴을 쓰면 자막 렌더 전체가 실패하지 않는다.
  }
  const overlayPaths: string[] = [];
  for (const [index, layer] of input.plan.drawLayers.entries()) {
    const surface = canvas.createCanvas(input.width, input.height);
    const context = surface.getContext("2d");
    context.font = `${layer.fontSize}px "${fontFamily}"`;
    context.textAlign = "center";
    context.textBaseline = "top";
    const metrics = context.measureText(layer.text);
    const padding = Math.round(layer.fontSize * 0.3);
    if (layer.box) {
      context.fillStyle = canvasBoxColor(layer.boxColor);
      context.fillRect(
        layer.x - metrics.width / 2 - padding,
        layer.y - padding,
        metrics.width + padding * 2,
        layer.fontSize * 1.32 + padding * 2,
      );
    }
    if (layer.outline) {
      context.strokeStyle = "rgba(0,0,0,0.9)";
      context.lineJoin = "round";
      context.lineWidth = Math.max(2, Math.round(layer.fontSize * 0.09)) * 2;
      context.strokeText(layer.text, layer.x, layer.y);
    }
    context.fillStyle = canvasColor(layer.color);
    context.fillText(layer.text, layer.x, layer.y);
    const overlayPath = path.join(input.tmpDir, `subtitle-overlay-${index}.png`);
    fs.writeFileSync(overlayPath, surface.toBuffer("image/png"));
    overlayPaths.push(overlayPath);
  }

  const baseEdit: VideoEdit = {
    ...input.edit,
    subtitles: input.edit.subtitles.map((line) => ({ ...line, text: "" })),
    overlays: [],
    comments: [],
    textStickers: [],
  };
  const basePlan = planPlaybackBurn({
    edit: baseEdit,
    durationSec: input.durationSec,
    width: input.width,
    height: input.height,
    size: input.size,
    fontFile: input.fontFile,
    hasAudio: input.hasAudio,
  });
  if (!basePlan.ok) throw new Error(basePlan.reason === "nothing_left" ? "PLAYBACK_EMPTY" : "PLAYBACK_TOO_MANY_LAYERS");
  const basePath = path.join(input.tmpDir, "video-without-text.mp4");
  const baseArgs = playbackFfmpegArgs(basePlan, {
    inputPath: input.inputPath,
    outputPath: basePath,
    musicPath: input.musicPath,
    voicePath: input.voicePath,
  }) ?? [
    "-y", "-i", input.inputPath,
    "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-preset", "veryfast", "-crf", "20", "-c:a", "copy", "-t", String(input.plan.outputDurationSec), basePath,
  ];
  await execFileP(FFMPEG_BIN, baseArgs, { timeout: 180_000 });

  const args = ["-y", "-i", basePath];
  for (const overlayPath of overlayPaths) args.push("-loop", "1", "-i", overlayPath);
  const filters: string[] = [];
  let previous = "0:v";
  input.plan.drawLayers.forEach((layer, index) => {
    const output = index === input.plan.drawLayers.length - 1 ? "vout" : `overlay${index}`;
    filters.push(`[${previous}][${index + 1}:v]overlay=0:0:enable='between(t,${layer.startSec},${layer.endSec})'[${output}]`);
    previous = output;
  });
  args.push("-filter_complex", filters.join(";"), "-map", "[vout]", "-map", "0:a?", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "20", "-c:a", "copy", "-t", String(input.plan.outputDurationSec), input.outputPath);
  await execFileP(FFMPEG_BIN, args, { timeout: 180_000 });
}

export async function probeRenderedVideo(filePath: string): Promise<VideoRenderResult> {
  const { stdout } = await execFileP(FFPROBE_BIN, ["-v", "error", "-show_entries", "stream=width,height,codec_type:format=duration", "-of", "json", filePath], { timeout: 20_000 });
  const parsed = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number; codec_type?: string }>; format?: { duration?: string } };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const durationSec = Number(parsed.format?.duration);
  if (!video?.width || !video.height || !Number.isFinite(durationSec) || durationSec <= 0) throw new Error("VIDEO_PROBE_FAILED");
  return { width: video.width, height: video.height, durationSec, hasAudio: Boolean(parsed.streams?.some((stream) => stream.codec_type === "audio")) };
}

/** S6 queue worker adapter가 호출하는 실제 MP4 렌더. 원본을 바꾸지 않고 outputPath 하나만 만든다. */
export async function renderVideoExport(tenantId: string, request: VideoRenderRequest, outputPath: string): Promise<VideoRenderResult> {
  return runWithTenant(tenantId, async () => {
    const inputPath = resolveGeneratedFile(tenantId, request.sourceFilename);
    if (!inputPath) throw new Error("VIDEO_SOURCE_MISSING");
    const inputBytes = fs.statSync(inputPath).size;
    if (inputBytes <= 0 || inputBytes > MAX_VIDEO_BYTES) throw new Error("VIDEO_SOURCE_SIZE_INVALID");
    const source = await probeRenderedVideo(inputPath);
    if (source.durationSec > MAX_VIDEO_DURATION_SECONDS) throw new Error("VIDEO_TOO_LONG");
    const fontFile = pickSubtitleFont(
      (candidate) => fs.existsSync(candidate),
      process.env.SUBTITLE_FONT_FILE,
      request.edit.subtitleStyle?.fontFamily ?? "sans",
    );
    if (!fontFile) throw new Error("SUBTITLE_FONT_MISSING");
    const edit = alignPlaybackScript(request.edit, request.lines);
    const plan = planPlaybackBurn({ edit, durationSec: source.durationSec, width: source.width, height: source.height, size: request.subtitleSize, fontFile, hasAudio: source.hasAudio });
    if (!plan.ok) throw new Error(plan.reason === "nothing_left" ? "PLAYBACK_EMPTY" : "PLAYBACK_TOO_MANY_LAYERS");
    // 클라이언트가 같은 원본 구간을 여러 id로 반복해 보내도 렌더 상한을 늘릴 수 없다.
    // 원본 길이 검사만으로는 concat 출력 길이가 원본보다 길어지는 편집을 막지 못한다.
    if (plan.outputDurationSec > MAX_VIDEO_DURATION_SECONDS) throw new Error("VIDEO_TOO_LONG");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-export-assets-"));
    try {
      const musicPath = await resolveRenderMusic(edit, tenantId, tmpDir, plan.outputDurationSec);
      const voicePath = await renderSelectedVoice(edit, edit.subtitles.filter((line) => !line.cut).map((line) => line.text.trim()).filter(Boolean).join(". "), path.join(tmpDir, "voice.mp3"), tenantId);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      if (plan.drawLayers.length && !(await ffmpegHasDrawtext())) {
        await renderCanvasOverlayFallback({
          plan, edit, durationSec: source.durationSec, width: source.width, height: source.height,
          size: request.subtitleSize, fontFile, hasAudio: source.hasAudio, inputPath, outputPath, tmpDir,
          musicPath, voicePath,
        });
      } else {
        const args = playbackFfmpegArgs(plan, { inputPath, outputPath, musicPath, voicePath });
        if (!args) throw new Error("VIDEO_RENDER_ARGS_EMPTY");
        await execFileP(FFMPEG_BIN, args, { timeout: 180_000 });
      }
      const outputBytes = fs.statSync(outputPath).size;
      if (outputBytes <= 0 || outputBytes > MAX_VIDEO_BYTES) throw new Error("VIDEO_OUTPUT_SIZE_INVALID");
      return await probeRenderedVideo(outputPath);
    } catch (error) {
      fs.rmSync(outputPath, { force: true });
      if (error instanceof VideoRenderAssetError) throw error;
      throw error;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
}
