import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { FFMPEG_BIN } from "@/lib/higgsfield";
import { resolveGeneratedFile } from "@/lib/storage";
import { runWithTenant } from "@/lib/tenant-context";
import { MAX_VIDEO_BYTES, MAX_VIDEO_DURATION_SECONDS } from "@/lib/video-limits";
import { alignPlaybackScript, planPlaybackBurn, playbackFfmpegArgs } from "./playback-edit-plan";
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-export-assets-"));
    try {
      const musicPath = await resolveRenderMusic(edit, tenantId, tmpDir, plan.outputDurationSec);
      const voicePath = await renderSelectedVoice(edit, edit.subtitles.filter((line) => !line.cut).map((line) => line.text.trim()).filter(Boolean).join(". "), path.join(tmpDir, "voice.mp3"), tenantId);
      const args = playbackFfmpegArgs(plan, { inputPath, outputPath, musicPath, voicePath });
      if (!args) throw new Error("VIDEO_RENDER_ARGS_EMPTY");
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      await execFileP(FFMPEG_BIN, args, { timeout: 180_000 });
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
