/**
 * POST /api/video/subtitle — 편집실의 장면 대사와 자막 크기를 **나가는 영상 파일에 굽는다**.
 *
 * 왜 재생기 오버레이가 아니라 여기인가. 재생기에 얹으면 우리 화면에서만 보이고 유튜브·
 * 릴스·틱톡으로 올라가는 mp4 에는 없다. 2026-09-14 실측에서 발행 대기 중이던 파일을
 * 내려받아 프레임을 떠 보니 글자가 한 자도 없었다. **나가는 파일에 없으면 고친 것이 아니다.**
 *
 * 왜 생성 직후가 아니라 편집실을 떠날 때인가. 대사와 자막 크기는 편집실에서 바뀐다.
 * 생성 직후에 구우면 편집실에서 고친 글자가 반영되려면 영상을 다시 만들어야 하고, 영상
 * 생성은 호출마다 돈이 나간다. 굽기는 공짜고 생성은 유료다. 카드뉴스가 `recompositeCards`
 * 로 같은 자리에서 다시 그리는 것과 짝을 맞춘다(card-deck.ts).
 *
 * 요청: { filename, lines[], subtitleSize?, tenant_id? }
 * 응답: { ok, file(배달 주소), filename } 또는 ok:false + 사람 말로 된 이유.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { signMediaToken } from "@/lib/media-token";
import { resolveTenantGeneratedFile } from "@/lib/storage";
import { studioDir, assetUrl, mediaFilename, FFMPEG_BIN } from "@/lib/higgsfield";
import { MAX_VIDEO_BYTES, MAX_VIDEO_DURATION_SECONDS, MAX_VIDEO_MIB } from "@/lib/video-limits";
import {
  checkSubtitleLimits,
  isSubtitleSize,
  pickSubtitleFont,
  subtitleFailureStatus,
  subtitleFfmpegArgs,
  SUBTITLE_MAX_CHARS_PER_LINE,
  SUBTITLE_MAX_LINES,
  type SubtitleSize,
} from "@/lib/studio/video-subtitle";
import {
  alignPlaybackScript,
  planPlaybackBurn,
  playbackFfmpegArgs,
  playbackHasWork,
  readPlaybackEdit,
} from "@/lib/studio/playback-edit-plan";
import { acquireSubtitleSlot } from "@/lib/studio/subtitle-work-limit";
import {
  readSubtitleBakeLineage,
  recordSubtitleBake,
  subtitleBakeOutputFilename,
} from "@/lib/studio/video-bake-lineage";

const execFileP = promisify(execFile);

const FFPROBE_BIN = process.env.FFPROBE_BIN || "ffprobe";

/**
 * 영상의 실제 크기와 길이를 읽는다. 크기는 렌더 안전 기본값을 쓸 수 있지만 길이는
 * 자원 상한이므로 측정 실패를 짧은 영상으로 간주하지 않는다.
 *
 * 크기를 짐작으로 박으면 안 된다. 실제로 나온 클립은 1080x1920 이 아니라 **768x768** 이었다.
 * 1080 을 가정하고 글자 크기를 정하면 그 클립에서 자막이 화면 밖으로 나간다.
 */
async function probeVideo(filePath: string): Promise<{ width: number; height: number; durationSec: number }> {
  const fallback = { width: 1080, height: 1920, durationSec: 6 };
  const { stdout } = await execFileP(FFPROBE_BIN, [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration",
      "-of", "json", filePath,
    ], { timeout: 20000 });
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0] ?? {};
  const duration = Number(parsed.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("video duration unavailable");
  }
  return {
    width: Number(stream.width) > 0 ? Number(stream.width) : fallback.width,
    height: Number(stream.height) > 0 ? Number(stream.height) : fallback.height,
    durationSec: duration,
  };
}

/**
 * 컷이 있으면 소리도 같은 구간만 남겨야 한다. 소리 유무를 모르면 원본 소리를
 * 잘린 영상에 그대로 붙이지 않는다. 그때는 소리 없는 영상을 만든다.
 */
async function probeHasAudio(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileP(FFPROBE_BIN, [
      "-v", "error",
      "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      filePath,
    ], { timeout: 20000 });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function deliverUrl(tenantId: string, filename: string): string {
  const token = signMediaToken(tenantId, filename);
  return token ? `/api/media/${encodeURIComponent(token)}` : assetUrl(tenantId, filename);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filename = url.searchParams.get("filename") || "";
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return Response.json({ ok: false, error: "영상 파일 이름이 올바르지 않습니다." }, { status: 400 });
  }
  const tenantId = await effectiveTenantId(request, url.searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ ok: false, error: "작업 공간을 식별할 수 없습니다." }, { status: 401 });

  const lineage = readSubtitleBakeLineage(tenantId, filename);
  const sourceFilename = lineage.state === "baked" ? lineage.sourceFilename : undefined;
  const sourceExists = sourceFilename ? resolveTenantGeneratedFile(tenantId, sourceFilename) : null;
  return Response.json({
    ok: true,
    state: lineage.state,
    ...(sourceFilename ? { sourceFilename } : {}),
    ...(sourceFilename && sourceExists ? { sourceFile: deliverUrl(tenantId, sourceFilename) } : {}),
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "요청 본문은 JSON 객체여야 합니다." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "요청 본문을 JSON으로 읽을 수 없습니다." }, { status: 400 });
  }

  const filename = typeof body.filename === "string" ? body.filename : "";
  if (!filename) return Response.json({ error: "자막을 넣을 영상 파일을 찾지 못했습니다." }, { status: 400 });
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return Response.json({ error: "영상 파일 이름이 올바르지 않습니다." }, { status: 400 });
  }

  const playback = readPlaybackEdit(body.videoEdit);
  if (!playback.ok) {
    return Response.json({
      ok: false,
      code: "VIDEO_EDIT_INVALID",
      error: "편집 내용을 영상 파일에 적용할 수 없습니다. 구간과 문구를 다시 확인해 주세요.",
      rule: playback.rule,
    }, { status: 422 });
  }
  const usePlayback = playback.edit !== null && playbackHasWork(playback.edit);

  const raw = Array.isArray(body.lines)
    ? body.lines.filter((line): line is string => typeof line === "string")
    : [];
  if (!usePlayback && !raw.some((line) => line.trim())) {
    return Response.json({ error: "자막으로 넣을 대사가 없습니다." }, { status: 400 });
  }
  // 상한이 없으면 줄 수와 줄 길이가 그대로 필터 크기와 인코딩 시간이 된다. 한 요청으로
  // 서버를 오래 붙잡아 둘 수 있다(교차 리뷰 지적, 2026-09-14). 자르지 않고 거절한다.
  const limited = usePlayback ? { ok: true as const, lines: [] as string[] } : checkSubtitleLimits(raw);
  if (!limited.ok) {
    return Response.json({
      error: limited.reason === "too_many_lines"
        ? `자막은 한 번에 ${SUBTITLE_MAX_LINES}줄까지 넣을 수 있습니다. 장면을 나눠 주세요.`
        : `자막 한 줄은 ${SUBTITLE_MAX_CHARS_PER_LINE}자까지입니다. 문장을 짧게 끊어 주세요.`,
    }, { status: 422 });
  }
  const lines = limited.lines;
  const size: SubtitleSize = isSubtitleSize(body.subtitleSize) ? body.subtitleSize : "보통";

  const tenantId = await effectiveTenantId(request, typeof body.tenant_id === "string" ? body.tenant_id : null);
  if (!tenantId) return Response.json({ error: "작업 공간을 식별할 수 없습니다." }, { status: 401 });

  if (readSubtitleBakeLineage(tenantId, filename).state === "baked") {
    return Response.json({
      ok: false,
      code: "SUBTITLE_INPUT_ALREADY_BAKED",
      error: "자막이 이미 들어간 영상은 다시 굽지 않았습니다. 자막 없는 원본을 복원해 주세요.",
    }, { status: 409 });
  }

  const inputPath = resolveTenantGeneratedFile(tenantId, filename);
  if (!inputPath) {
    return Response.json({ ok: false, error: "자막을 넣을 영상을 이 작업 공간에서 찾지 못했습니다. 생성실에서 영상을 다시 만들어 주세요." }, { status: 422 });
  }
  const inputBytes = fs.statSync(inputPath).size;
  if (inputBytes <= 0 || inputBytes > MAX_VIDEO_BYTES) {
    return Response.json({
      ok: false,
      code: "SUBTITLE_INPUT_SIZE_INVALID",
      error: `자막을 넣을 영상은 0바이트보다 크고 ${MAX_VIDEO_MIB}MiB 이하여야 합니다.`,
    }, { status: 422 });
  }

  // 한글 폰트가 없으면 ffmpeg 은 자막을 네모로 그린다. 네모는 자막이 없는 것보다 나쁘다.
  // 조용히 네모를 내보내지 않고 사실을 말한다.
  const fontFile = pickSubtitleFont((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  }, process.env.SUBTITLE_FONT_FILE);
  if (!fontFile) {
    return Response.json({
      ok: false,
      code: "SUBTITLE_FONT_MISSING",
      error: "이 서버에 한글 자막을 그릴 글꼴이 없어 자막을 넣지 못했습니다. 서버에 한글 글꼴을 설치하면 바로 들어갑니다.",
    }, { status: 503 });
  }

  const releaseSlot = await acquireSubtitleSlot(tenantId);
  if (!releaseSlot) {
    return Response.json({
      ok: false,
      code: "SUBTITLE_QUEUE_FULL",
      error: "자막 작업이 몰려 지금은 더 받을 수 없습니다. 잠시 뒤 다시 시도해 주세요.",
    }, { status: 429 });
  }

  try {
  let width: number;
  let height: number;
  let durationSec: number;
  try {
    ({ width, height, durationSec } = await probeVideo(inputPath));
  } catch {
    return Response.json({
      ok: false,
      code: "SUBTITLE_VIDEO_PROBE_FAILED",
      error: "영상 길이를 확인하지 못해 자막 작업을 시작하지 않았습니다. 다른 영상으로 다시 시도해 주세요.",
    }, { status: 422 });
  }
  if (durationSec > MAX_VIDEO_DURATION_SECONDS) {
    return Response.json({
      ok: false,
      code: "SUBTITLE_VIDEO_TOO_LONG",
      error: `자막을 넣을 영상은 ${MAX_VIDEO_DURATION_SECONDS}초 이하여야 합니다. 영상을 나눠 다시 시도해 주세요.`,
    }, { status: 422 });
  }
  // 같은 밀리초에 들어온 두 요청이 같은 이름을 쓰면 서로의 결과를 덮어쓴다(교차 리뷰 지적).
  // 파일명 생성은 이미 무작위 UUID 로 하는 자리가 있다. 그것을 쓴다.
  const outName = subtitleBakeOutputFilename(mediaFilename((path.extname(filename) || ".mp4").slice(1)));
  const outPath = path.join(studioDir(tenantId), outName);
  let playbackSummary: {
    outputDurationSec: number;
    keptTexts: string[];
    droppedTexts: string[];
    voiceApplied: false;
  } | null = null;
  let args: string[] | null;
  if (usePlayback && playback.edit) {
    const plan = planPlaybackBurn({
      edit: alignPlaybackScript(playback.edit, raw),
      durationSec,
      width,
      height,
      size,
      fontFile,
      hasAudio: await probeHasAudio(inputPath),
    });
    if (!plan.ok) {
      const empty = plan.reason === "nothing_left";
      return Response.json({
        ok: false,
        code: empty ? "PLAYBACK_EMPTY" : "PLAYBACK_TOO_MANY_LAYERS",
        error: empty
          ? "컷으로 뺀 뒤에 남는 영상이 없습니다. 컷을 줄여 주세요."
          : "한 영상에 올릴 글자 층이 너무 많습니다. 자막과 오버레이를 줄여 주세요.",
      }, { status: 422 });
    }
    playbackSummary = {
      outputDurationSec: plan.outputDurationSec,
      keptTexts: plan.keptTexts,
      droppedTexts: plan.droppedTexts,
      voiceApplied: false,
    };
    for (const warning of plan.warnings) {
      console.warn(JSON.stringify({ kind: "video_subtitle_normalization", warning, filename }));
    }
    args = playbackFfmpegArgs(plan, { inputPath, outputPath: outPath });
  } else {
    args = subtitleFfmpegArgs({
      lines, size, width, height, durationSec, fontFile,
      inputPath, outputPath: outPath,
    });
  }
  if (!args) {
    return Response.json({ ok: false, error: "자막으로 넣을 대사가 없습니다." }, { status: 400 });
  }

  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await execFileP(FFMPEG_BIN, args, { timeout: 180000 });
    const outputBytes = fs.statSync(outPath).size;
    if (outputBytes <= 0 || outputBytes > MAX_VIDEO_BYTES) {
      try { fs.unlinkSync(outPath); } catch { /* 없으면 그만 */ }
      return Response.json({
        ok: false,
        code: "SUBTITLE_OUTPUT_SIZE_INVALID",
        error: `자막 결과가 허용 용량 ${MAX_VIDEO_MIB}MiB를 벗어나 저장하지 않았습니다. 영상을 압축해 다시 시도해 주세요.`,
      }, { status: 422 });
    }
  } catch (e) {
    // 실패하면 반쪽 파일이 남는다. 남겨 두면 다음에 그것이 발행된다.
    try { fs.unlinkSync(outPath); } catch { /* 없으면 그만 */ }
    const failure = subtitleFailureStatus(e);
    return Response.json({
      ok: false,
      code: failure.code,
      error: failure.code === "ENCODER_MISSING"
        ? "이 서버에 영상 편집기가 설치되어 있지 않아 자막을 넣지 못했습니다."
        : failure.code === "SUBTITLE_TIMEOUT"
          ? "자막을 넣는 시간이 제한을 넘어 중단했습니다. 영상을 줄이거나 압축해 다시 시도해 주세요."
          : "영상 형식을 처리하지 못해 자막을 넣지 않았습니다. 다른 영상으로 다시 시도해 주세요.",
    }, { status: failure.status });
  }

  try {
    await recordSubtitleBake({ tenantId, outputFilename: outName, sourceFilename: filename });
  } catch {
    try { fs.unlinkSync(outPath); } catch { /* 없으면 그만 */ }
    return Response.json({
      ok: false,
      code: "SUBTITLE_LINEAGE_WRITE_FAILED",
      error: "자막 결과의 원본 연결 정보를 저장하지 못해 결과 파일을 폐기했습니다. 다시 시도해 주세요.",
    }, { status: 500 });
  }

  return Response.json({
    ok: true,
    filename: outName,
    file: deliverUrl(tenantId, outName),
    subtitle: { size, lines: lines.filter((line) => line.trim()).length, width, height, durationSec },
    ...(playbackSummary ? { playback: playbackSummary } : {}),
  });
  } finally {
    releaseSlot();
  }
}
