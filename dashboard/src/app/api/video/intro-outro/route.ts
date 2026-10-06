/**
 * POST /api/video/intro-outro — 편집실 영상에 인트로/아웃트로를 삽입해 최종 발행 파일을 만든다.
 *
 * Remotion 렌더 + ffmpeg 합치기는 수 초~수십 초가 걸릴 수 있고 Cloudflare 터널이 약
 * 72~100s에서 응답을 끊으므로(세션맥락) 동기로 돌리지 않는다. 202 + jobId를 즉시 돌려주고
 * 실제 작업은 setTimeout(0)으로 백그라운드에서 진행한다(higgsfield-finalize.ts와 같은 결 —
 * 별도 워커 프로세스 없이 Node 이벤트 루프에 맡긴다).
 */
import fs from "fs";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { resolveTenantGeneratedFile } from "@/lib/storage";
import { mediaFilename } from "@/lib/higgsfield";
import { isSafePublicImageUrl, isAllowedServerFetchImageHost } from "@/lib/publish";
import { createIntroOutroJob, hasInProgressIntroOutroJob, updateIntroOutroJob } from "@/lib/intro-outro-jobs";
import { composeIntroOutro } from "@/lib/intro-outro-render";
import { INTRO_OUTRO_COMPS, type IntroOutroCompId } from "../../../../../remotion/IntroOutroComps";
import { VIDEO_TRANSITIONS, type VideoTransition } from "@/lib/studio/video-edit-contract";

function isValidCompId(id: unknown): id is IntroOutroCompId {
  return typeof id === "string" && id in INTRO_OUTRO_COMPS;
}

/**
 * 독립 리뷰 M-1(SSRF): logoUrl은 Remotion이 띄우는 헤드리스 Chrome 안에서 그대로
 * fetch된다(remotion/IntroOutroComps.tsx의 <Img src={logoUrl}>). 검증 없이 받으면
 * 서버가 사설망·클라우드 메타데이터 주소(169.254.169.254 등)를 대신 가져와 브라우저
 * 렌더 결과(=영상 프레임)로 유출할 수 있다. Bluesky/X 업로드가 이미 쓰는 두 단계 가드를
 * 그대로 재사용한다: ①isSafePublicImageUrl(사설/루프백/링크로컬/메타데이터 IP 리터럴을
 * lexical 하게 차단) ②isAllowedServerFetchImageHost(운영자가 명시한 exact-host
 * allowlist만 통과 — DNS rebinding 대비). 로고 없이 보내는 건 허용(기본 렌더로 대체).
 */
function isValidLogoUrl(raw: unknown): raw is string {
  return typeof raw === "string" && raw.trim().length > 0
    && isSafePublicImageUrl(raw) && isAllowedServerFetchImageHost(raw);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const tenantId = await effectiveTenantId(request, body?.tenant_id ?? null);
  if (!tenantId) return Response.json({ error: "테넌트를 식별할 수 없습니다." }, { status: 401 });
  if (!body?.sourceFilename || typeof body.sourceFilename !== "string") {
    return Response.json({ error: "sourceFilename이 필요합니다." }, { status: 400 });
  }
  const introCompIdValue: unknown = body.introCompId ?? null;
  const outroCompIdValue: unknown = body.outroCompId ?? null;
  if (introCompIdValue !== null && !isValidCompId(introCompIdValue)) {
    return Response.json({ error: "유효하지 않은 인트로 템플릿입니다." }, { status: 400 });
  }
  if (outroCompIdValue !== null && !isValidCompId(outroCompIdValue)) {
    return Response.json({ error: "유효하지 않은 아웃트로 템플릿입니다." }, { status: 400 });
  }
  const introCompId: IntroOutroCompId | null = introCompIdValue;
  const outroCompId: IntroOutroCompId | null = outroCompIdValue;
  if (!introCompId && !outroCompId) {
    return Response.json({ error: "인트로 또는 아웃트로 중 하나는 선택해야 합니다." }, { status: 400 });
  }
  const introDurationSec = Number(body.introDurationSec ?? (introCompId ? INTRO_OUTRO_COMPS[introCompId].durationInFrames / 30 : 0));
  const outroDurationSec = Number(body.outroDurationSec ?? (outroCompId ? INTRO_OUTRO_COMPS[outroCompId].durationInFrames / 30 : 0));
  if ((introCompId && (!Number.isFinite(introDurationSec) || introDurationSec < 0.5 || introDurationSec > 5))
    || (outroCompId && (!Number.isFinite(outroDurationSec) || outroDurationSec < 0.5 || outroDurationSec > 5))) {
    return Response.json({ error: "인트로·아웃트로 길이는 0.5초부터 5초까지입니다." }, { status: 422 });
  }
  const transitions = body.transitions && typeof body.transitions === "object" ? body.transitions : {};
  const introToMain = VIDEO_TRANSITIONS.includes(transitions.introToMain as VideoTransition) ? transitions.introToMain as VideoTransition : "cut";
  const mainToOutro = VIDEO_TRANSITIONS.includes(transitions.mainToOutro as VideoTransition) ? transitions.mainToOutro as VideoTransition : "cut";
  const logoUrlRaw = typeof body.logoUrl === "string" ? body.logoUrl.trim() : "";
  if (logoUrlRaw && !isValidLogoUrl(logoUrlRaw)) {
    return Response.json({ error: "로고 URL이 유효한 공개 HTTPS 주소가 아닙니다." }, { status: 400 });
  }
  const logoUrl = logoUrlRaw || undefined;
  const sourcePath = resolveTenantGeneratedFile(tenantId, body.sourceFilename);
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return Response.json({ error: "원본 영상을 찾을 수 없습니다." }, { status: 404 });
  }
  // 독립 리뷰 M-2(자원): 테넌트당 진행 중 작업 1개 — 여러 개를 연달아 접수하면 전역
  // 렌더 슬롯(프로세스당 1개)을 한 테넌트가 독점해 다른 테넌트가 무기한 대기한다.
  if (hasInProgressIntroOutroJob(tenantId)) {
    return Response.json(
      { error: "이미 진행 중인 인트로/아웃트로 작업이 있습니다. 완료 후 다시 시도해 주세요." },
      { status: 409 },
    );
  }

  const job = createIntroOutroJob(tenantId, {
    sourceFilename: body.sourceFilename,
    introCompId,
    outroCompId,
    brandName: body.brandName || "OSMU",
    logoUrl,
    primaryColor: body.primaryColor,
    secondaryColor: body.secondaryColor,
    fontFamily: body.fontFamily,
    introTitleText: body.introTitleText,
    outroTitleText: body.outroTitleText,
    introDurationSec,
    outroDurationSec,
    transitions: { introToMain, mainToOutro },
  });

  setTimeout(() => {
    void runIntroOutroJob(tenantId, job.jobId, sourcePath, {
      introCompId,
      outroCompId,
      brandName: job.input.brandName,
      logoUrl: job.input.logoUrl,
      primaryColor: job.input.primaryColor,
      secondaryColor: job.input.secondaryColor,
      fontFamily: job.input.fontFamily,
      introTitleText: job.input.introTitleText,
      outroTitleText: job.input.outroTitleText,
      introDurationSec: job.input.introDurationSec,
      outroDurationSec: job.input.outroDurationSec,
      transitions: job.input.transitions,
    });
  }, 0);

  return Response.json({ ok: true, jobId: job.jobId, status: job.status }, { status: 202 });
}

async function runIntroOutroJob(
  tenantId: string,
  jobId: string,
  sourcePath: string,
  input: {
    introCompId: IntroOutroCompId | null;
    outroCompId: IntroOutroCompId | null;
    brandName: string;
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    fontFamily?: string;
    introTitleText?: string;
    outroTitleText?: string;
    introDurationSec?: number;
    outroDurationSec?: number;
    transitions?: { introToMain: VideoTransition; mainToOutro: VideoTransition };
  },
) {
  updateIntroOutroJob(tenantId, jobId, { status: "processing" });
  try {
    const outputFilename = mediaFilename("mp4");
    await composeIntroOutro({
      tenantId,
      mainVideoPath: sourcePath,
      introCompId: input.introCompId,
      outroCompId: input.outroCompId,
      brand: {
        brandName: input.brandName,
        logoUrl: input.logoUrl,
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
        fontFamily: input.fontFamily,
        titleText: input.introTitleText || input.outroTitleText,
      },
      outputFilename,
      introDurationSec: input.introDurationSec,
      outroDurationSec: input.outroDurationSec,
      transitions: input.transitions,
    });
    updateIntroOutroJob(tenantId, jobId, { status: "completed", resultFilename: outputFilename });
  } catch (err) {
    // 독립 리뷰(minor): err.message를 그대로 고객에게 돌려주지 않는다 — 파일 경로·
    // ffmpeg 인자·내부 스택 단서가 섞여 나갈 수 있다(에러 메시지 기반 정보 유출).
    // 실제 원인은 서버 로그로만 보내고, 고객에게는 고정 문구만 준다.
    console.error(`[intro-outro] job ${jobId} (tenant ${tenantId}) 실패:`, err);
    updateIntroOutroJob(tenantId, jobId, {
      status: "failed",
      error: "렌더에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }
}
