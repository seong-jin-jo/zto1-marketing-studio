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

const execFileP = promisify(execFile);

const FFPROBE_BIN = process.env.FFPROBE_BIN || "ffprobe";

/**
 * 영상의 실제 크기와 길이를 읽는다. 못 읽으면 세로 숏폼 기본값으로 간다.
 *
 * 크기를 짐작으로 박으면 안 된다. 실제로 나온 클립은 1080x1920 이 아니라 **768x768** 이었다.
 * 1080 을 가정하고 글자 크기를 정하면 그 클립에서 자막이 화면 밖으로 나간다.
 */
async function probeVideo(filePath: string): Promise<{ width: number; height: number; durationSec: number }> {
  const fallback = { width: 1080, height: 1920, durationSec: 6 };
  try {
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
    return {
      width: Number(stream.width) > 0 ? Number(stream.width) : fallback.width,
      height: Number(stream.height) > 0 ? Number(stream.height) : fallback.height,
      durationSec: Number.isFinite(duration) && duration > 0 ? duration : fallback.durationSec,
    };
  } catch {
    return fallback;
  }
}

function deliverUrl(tenantId: string, filename: string): string {
  const token = signMediaToken(tenantId, filename);
  return token ? `/api/media/${encodeURIComponent(token)}` : assetUrl(tenantId, filename);
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

  const raw = Array.isArray(body.lines)
    ? body.lines.filter((line): line is string => typeof line === "string")
    : [];
  if (!raw.some((line) => line.trim())) {
    return Response.json({ error: "자막으로 넣을 대사가 없습니다." }, { status: 400 });
  }
  // 상한이 없으면 줄 수와 줄 길이가 그대로 필터 크기와 인코딩 시간이 된다. 한 요청으로
  // 서버를 오래 붙잡아 둘 수 있다(교차 리뷰 지적, 2026-09-14). 자르지 않고 거절한다.
  const limited = checkSubtitleLimits(raw);
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

  const { width, height, durationSec } = await probeVideo(inputPath);
  if (durationSec > MAX_VIDEO_DURATION_SECONDS) {
    return Response.json({
      ok: false,
      code: "SUBTITLE_VIDEO_TOO_LONG",
      error: `자막을 넣을 영상은 ${MAX_VIDEO_DURATION_SECONDS}초 이하여야 합니다. 영상을 나눠 다시 시도해 주세요.`,
    }, { status: 422 });
  }
  // 같은 밀리초에 들어온 두 요청이 같은 이름을 쓰면 서로의 결과를 덮어쓴다(교차 리뷰 지적).
  // 파일명 생성은 이미 무작위 UUID 로 하는 자리가 있다. 그것을 쓴다.
  const outName = mediaFilename((path.extname(filename) || ".mp4").slice(1));
  const outPath = path.join(studioDir(tenantId), outName);
  const args = subtitleFfmpegArgs({
    lines, size, width, height, durationSec, fontFile,
    inputPath, outputPath: outPath,
  });
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

  return Response.json({
    ok: true,
    filename: outName,
    file: deliverUrl(tenantId, outName),
    subtitle: { size, lines: lines.filter((line) => line.trim()).length, width, height, durationSec },
  });
}
