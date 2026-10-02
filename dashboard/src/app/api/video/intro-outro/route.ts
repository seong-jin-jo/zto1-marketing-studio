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
import { assetUrl, mediaFilename } from "@/lib/higgsfield";
import { signMediaToken } from "@/lib/media-token";
import { createIntroOutroJob, updateIntroOutroJob } from "@/lib/intro-outro-jobs";
import { composeIntroOutro } from "@/lib/intro-outro-render";
import { INTRO_OUTRO_COMPS, type IntroOutroCompId } from "../../../../../remotion/IntroOutroComps";

function isValidCompId(id: unknown): id is IntroOutroCompId {
  return typeof id === "string" && id in INTRO_OUTRO_COMPS;
}

function deliverUrl(tenantId: string, filename: string): string {
  const token = signMediaToken(tenantId, filename);
  return token ? `/api/media/${encodeURIComponent(token)}` : assetUrl(tenantId, filename);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const tenantId = await effectiveTenantId(request, body?.tenant_id ?? null);
  if (!tenantId) return Response.json({ error: "테넌트를 식별할 수 없습니다." }, { status: 401 });
  if (!body?.sourceFilename || typeof body.sourceFilename !== "string") {
    return Response.json({ error: "sourceFilename이 필요합니다." }, { status: 400 });
  }
  const introCompId = body.introCompId ?? null;
  const outroCompId = body.outroCompId ?? null;
  if (introCompId !== null && !isValidCompId(introCompId)) {
    return Response.json({ error: "유효하지 않은 인트로 템플릿입니다." }, { status: 400 });
  }
  if (outroCompId !== null && !isValidCompId(outroCompId)) {
    return Response.json({ error: "유효하지 않은 아웃트로 템플릿입니다." }, { status: 400 });
  }
  if (!introCompId && !outroCompId) {
    return Response.json({ error: "인트로 또는 아웃트로 중 하나는 선택해야 합니다." }, { status: 400 });
  }
  const sourcePath = resolveTenantGeneratedFile(tenantId, body.sourceFilename);
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return Response.json({ error: "원본 영상을 찾을 수 없습니다." }, { status: 404 });
  }

  const job = createIntroOutroJob(tenantId, {
    sourceFilename: body.sourceFilename,
    introCompId,
    outroCompId,
    brandName: body.brandName || "OSMU",
    logoUrl: body.logoUrl,
    primaryColor: body.primaryColor,
    secondaryColor: body.secondaryColor,
    fontFamily: body.fontFamily,
    introTitleText: body.introTitleText,
    outroTitleText: body.outroTitleText,
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
    });
    updateIntroOutroJob(tenantId, jobId, { status: "completed", resultFilename: outputFilename });
  } catch (err) {
    updateIntroOutroJob(tenantId, jobId, {
      status: "failed",
      error: err instanceof Error ? err.message : "렌더에 실패했습니다.",
    });
  }
}

export { deliverUrl };
