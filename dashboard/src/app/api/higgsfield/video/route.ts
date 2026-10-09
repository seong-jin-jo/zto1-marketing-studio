import path from "path";
import fs from "fs";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { hfRun, extractJson, extractJobId, HiggsfieldBusyError, HiggsfieldUnavailableError, HiggsfieldUnauthenticatedError, assertHiggsfieldReady } from "@/lib/higgsfield";
import { resolveGeneratedFile } from "@/lib/storage";
import { isSafeMediaFilename } from "@/lib/media-token";
import { createHiggsfieldJob } from "@/lib/higgsfield-jobs";
import { scheduleHiggsfieldBackgroundPoll } from "@/lib/higgsfield-background-poll";

// 바탕 그림으로 받아들이는 확장자 화이트리스트(기존 규약 유지, MINOR-4 2026-09-25).
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// POST /api/higgsfield/video — image→video 작업 "접수"만 한다(비동기 전환 2026-10-01, 이미지와
// 동일한 이유: 프록시 100초 한도, 생성기 대기열 10분+ 실측). 반환: 202 { ok: true, jobId }.
// 실제 생성·다운로드·내레이션 합성·결과는 GET /api/higgsfield/job/[id] 가 한다.
//
// filename = /api/higgsfield/image 가 반환한 생성실 파일 이름. 서버 절대경로는 이 라우트가
// resolveGeneratedFile로 직접 풀어 작업 기록에 저장한다(클라이언트는 여전히 경로를 모른다,
// MAJOR-0b 2026-09-25 경로 주입 방어 그대로 유지).
const GENERATOR_REFUSED = 200;

export async function POST(request: Request) {
  const body = await request.json();
  const { prompt, model = "minimax_hailuo", narration = "", label = "" } = body;
  const tenantId = await effectiveTenantId(request, body.tenant_id);
  if (!tenantId) return Response.json({ error: "테넌트를 식별할 수 없습니다." }, { status: 401 });

  const filename = typeof body.filename === "string" ? body.filename : "";
  const filenameValid = filename && isSafeMediaFilename(filename) && IMAGE_EXTS.has(path.extname(filename).toLowerCase());
  const localPath = filenameValid ? resolveGeneratedFile(tenantId, filename) : null;
  if (!localPath || !fs.existsSync(localPath)) {
    return Response.json({
      ok: false,
      error: "영상의 바탕이 될 그림을 찾지 못했습니다. 생성실에서 그림을 다시 만들어 주세요.",
    }, { status: 400 });
  }
  const motion = prompt || "subtle idle motion, gentle sway and glow, fixed camera, smooth";
  const extra = model.startsWith("marketing_studio")
    ? ["--mode", "ugc", "--aspect_ratio", "9:16"]
    : [];
  try {
    await assertHiggsfieldReady();
    // --wait/--wait-timeout 를 쓰지 않는다 — 접수만 받고 즉시 돌아온다. 접수 호출 자체의
    // 타임아웃도 짧게 명시한다(이미지와 같은 이유, 2026-10-01 추가 실측 cb35f3fd).
    const { stdout } = await hfRun([
      "generate", "create", model,
      "--image", localPath, "--prompt", motion, ...extra,
      "--json",
    ], 45000);
    const data = extractJson(stdout);
    const providerJobId = extractJobId(data);
    if (!providerJobId) {
      return Response.json({
        ok: false,
        error: "생성기가 작업 번호를 돌려주지 않았습니다. 잠시 후 다시 시도해 주세요.",
        raw: stdout.slice(-400),
      }, { status: GENERATOR_REFUSED });
    }
    const job = createHiggsfieldJob(tenantId, "video", providerJobId, {
      localPath, filename, model, motion, narration: String(narration || ""), label,
    });
    scheduleHiggsfieldBackgroundPoll(tenantId, job.jobId);
    return Response.json({ ok: true, jobId: job.jobId }, { status: 202 });
  } catch (e) {
    if (e instanceof HiggsfieldBusyError) {
      return Response.json({
        error: "영상 생성 서비스가 다른 작업을 처리 중입니다. 계정 로그인 문제는 아니며 잠시 후 다시 요청해 주세요. 글 카드는 지금도 만드실 수 있습니다.",
        code: "GENERATOR_BUSY",
      }, { status: 503 });
    }
    if (e instanceof HiggsfieldUnauthenticatedError) {
      return Response.json({
        error: "영상 생성 서비스 연결이 잠시 끊겼습니다. 계정 로그인 문제는 아니며 운영팀이 복구하고 있습니다. 글 카드는 지금도 만드실 수 있습니다.",
        code: "GENERATOR_UNAUTHENTICATED",
      }, { status: 503 });
    }
    if (e instanceof HiggsfieldUnavailableError) {
      return Response.json({
        error: "영상 생성 서비스가 아직 준비되지 않았습니다. 계정 로그인 문제는 아니며 운영팀이 준비하고 있습니다. 글 카드는 지금도 만드실 수 있습니다.",
        code: "GENERATOR_UNAVAILABLE",
      }, { status: 503 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg.slice(0, 400), nsfw: /nsfw/i.test(msg), credits: /not enough credits/i.test(msg) }, { status: GENERATOR_REFUSED });
  }
}
