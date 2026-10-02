/**
 * 인트로/아웃트로 Remotion 렌더 + ffmpeg 합치기.
 *
 * 역할 분담(PRD §8.3): Remotion은 인트로·아웃트로·움직이는 타이틀만 만든다. 자막 굽기·
 * 컷·합치기·오디오 정규화는 전부 ffmpeg(/api/video/subtitle과 같은 결 — ffprobe로 먼저
 * 재보고, 바이트/길이 상한을 걸고, 임시파일을 정리한다).
 *
 * 흐름: ① Remotion 컴포지션을 intro.mp4 / outro.mp4 로 렌더(무음, 이 단계는 오디오 없음)
 *       ② 메인 영상(이미 자막이 구워진 것) 포함 3개를 해상도·fps·오디오 정규화
 *       ③ concat demuxer로 합쳐 최종 mp4 생성.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { studioDir, FFMPEG_BIN } from "@/lib/higgsfield";
import { MAX_VIDEO_DURATION_SECONDS } from "@/lib/video-limits";
import type { IntroOutroCompId, BrandProps } from "../../remotion/IntroOutroComps";

const execFileP = promisify(execFile);
const FFPROBE_BIN = process.env.FFPROBE_BIN || "ffprobe";
const ENTRY = path.join(process.cwd(), "remotion", "entry.ts");

let cachedBundleUrl: string | null = null;

async function getBundleUrl(): Promise<string> {
  if (cachedBundleUrl && fs.existsSync(cachedBundleUrl)) return cachedBundleUrl;
  cachedBundleUrl = await bundle({ entryPoint: ENTRY, onProgress: () => {} });
  return cachedBundleUrl;
}

export async function renderIntroOutroClip(
  compId: IntroOutroCompId,
  props: Partial<BrandProps>,
  outputPath: string,
): Promise<void> {
  const bundleUrl = await getBundleUrl();
  // 운영 컨테이너는 Chrome Headless Shell을 인터넷에서 내려받지 않고 Alpine chromium
  // 패키지를 쓴다(Dockerfile REMOTION_CHROME_PATH). 로컬 개발은 미설정 시 Remotion 기본
  // 다운로드 경로를 그대로 쓴다.
  const browserExecutable = process.env.REMOTION_CHROME_PATH || undefined;
  const composition = await selectComposition({
    serveUrl: bundleUrl,
    id: compId,
    inputProps: props,
    browserExecutable,
  });
  await renderMedia({
    composition,
    serveUrl: bundleUrl,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: props,
    browserExecutable,
    chromiumOptions: { gl: "swangle" },
  });
}

async function probe(filePath: string): Promise<{ width: number; height: number; durationSec: number; hasAudio: boolean }> {
  const { stdout } = await execFileP(FFPROBE_BIN, [
    "-v", "error",
    "-show_entries", "stream=width,height,codec_type:format=duration",
    "-of", "json", filePath,
  ], { timeout: 20000 });
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number; codec_type?: string }>;
    format?: { duration?: string };
  };
  const vstream = (parsed.streams || []).find((s) => s.codec_type === "video") || {};
  const hasAudio = (parsed.streams || []).some((s) => s.codec_type === "audio");
  return {
    width: vstream.width || 1080,
    height: vstream.height || 1920,
    durationSec: parseFloat(parsed.format?.duration || "0") || 0,
    hasAudio,
  };
}

/** 세그먼트를 공통 타겟(1080x1920, 30fps, aac 오디오 — 무음이면 무음 트랙 생성)으로 정규화. */
async function normalizeSegment(input: string, output: string): Promise<void> {
  const info = await probe(input);
  const vf = `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30`;
  const args = ["-y", "-i", input];
  if (!info.hasAudio) {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  }
  args.push("-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20");
  if (!info.hasAudio) {
    args.push("-shortest", "-c:a", "aac", "-map", "0:v:0", "-map", "1:a:0");
  } else {
    args.push("-c:a", "aac", "-ar", "44100");
  }
  args.push(output);
  await execFileP(FFMPEG_BIN, args, { timeout: 60000 });
}

export interface ConcatResult {
  outputPath: string;
  durationSec: number;
}

/**
 * 정규화된 세그먼트들을 concat demuxer로 이어붙인다. 입력 순서 = [intro?, main, outro?].
 * ffprobe로 합 길이를 검증해 호출자가 (sum of parts ± 0.2s)를 단언할 수 있게 한다.
 */
export async function concatSegments(segments: string[], outputPath: string): Promise<ConcatResult> {
  if (segments.length === 0) throw new Error("no segments to concat");
  const listFile = path.join(os.tmpdir(), `concat-${crypto.randomUUID()}.txt`);
  const listContent = segments.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listFile, listContent);
  try {
    await execFileP(
      FFMPEG_BIN,
      ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outputPath],
      { timeout: 120000 },
    );
  } finally {
    fs.rmSync(listFile, { force: true });
  }
  const info = await probe(outputPath);
  if (info.durationSec > MAX_VIDEO_DURATION_SECONDS) {
    fs.rmSync(outputPath, { force: true });
    throw new Error(`합쳐진 영상이 상한(${MAX_VIDEO_DURATION_SECONDS}s)을 넘습니다: ${info.durationSec.toFixed(1)}s`);
  }
  return { outputPath, durationSec: info.durationSec };
}

export interface ComposeInput {
  tenantId: string;
  mainVideoPath: string;
  introCompId: IntroOutroCompId | null;
  outroCompId: IntroOutroCompId | null;
  brand: Partial<BrandProps>;
  outputFilename: string;
}

/** 전체 파이프라인: 필요한 intro/outro만 렌더하고 메인 영상과 합쳐 최종 파일을 만든다. */
export async function composeIntroOutro(input: ComposeInput): Promise<ConcatResult> {
  const dir = studioDir(input.tenantId);
  fs.mkdirSync(dir, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "intro-outro-"));
  const segments: string[] = [];
  try {
    if (input.introCompId) {
      const introRaw = path.join(tmpDir, "intro-raw.mp4");
      const introNorm = path.join(tmpDir, "intro-norm.mp4");
      await renderIntroOutroClip(input.introCompId, input.brand, introRaw);
      await normalizeSegment(introRaw, introNorm);
      segments.push(introNorm);
    }
    const mainNorm = path.join(tmpDir, "main-norm.mp4");
    await normalizeSegment(input.mainVideoPath, mainNorm);
    segments.push(mainNorm);
    if (input.outroCompId) {
      const outroRaw = path.join(tmpDir, "outro-raw.mp4");
      const outroNorm = path.join(tmpDir, "outro-norm.mp4");
      await renderIntroOutroClip(input.outroCompId, input.brand, outroRaw);
      await normalizeSegment(outroRaw, outroNorm);
      segments.push(outroNorm);
    }
    const outputPath = path.join(dir, input.outputFilename);
    return await concatSegments(segments, outputPath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
