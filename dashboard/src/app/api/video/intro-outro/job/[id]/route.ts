import { effectiveTenantId } from "@/lib/tenant-auth";
import { deliverUrl, readIntroOutroJob } from "@/lib/intro-outro-jobs";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/video/intro-outro/job/[id] — 인트로/아웃트로 합성 작업 상태 조회.
// 다른 테넌트의 jobId로는 작업 존재 자체를 알리지 않고 404(higgsfield job route와 동일 계약).
export async function GET(request: Request, context: RouteContext) {
  const { id: jobId } = await context.params;
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ error: "테넌트를 식별할 수 없습니다." }, { status: 401 });
  if (!jobId) return Response.json({ error: "job id required" }, { status: 400 });

  const job = readIntroOutroJob(tenantId, jobId);
  if (!job) return Response.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });

  if (job.status === "completed" && job.resultFilename) {
    return Response.json({
      ok: true,
      status: job.status,
      file: deliverUrl(tenantId, job.resultFilename),
      filename: job.resultFilename,
    });
  }
  if (job.status === "failed") {
    return Response.json({ ok: false, status: job.status, error: job.error || "렌더에 실패했습니다." });
  }
  return Response.json({ ok: true, status: job.status });
}
