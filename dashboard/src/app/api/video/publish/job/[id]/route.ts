import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { readVideoPublishJob } from "@/lib/video-publish-jobs";

// GET /api/video/publish/job/[id] — 영상 발행 비동기 작업 상태 조회(2026-10-02 추가).
//
// 세션맥락: Threads + Instagram Reels 동시 발행에서 POST가 125초 걸려 Cloudflare 터널
// 한도(100초)로 524를 받았다. 화면은 "실패"로 표시했지만 서버는 끝까지 진행해 실제로
// 게시됐다. POST가 예산(8초) 안에 못 끝내면 202 + jobId로 접수만 알리고 같은 실행을
// 백그라운드로 잇는데, 이 라우트가 그 결과(게시됨+링크 / 실패 사유)를 다시 받아오는 창구다.
//
// - 운영자(tenantId null)도 발행할 수 있으므로(기존 /api/video/publish 동작 그대로)
//   tenantId가 null이어도 거부하지 않는다 — dataPath()가 null을 공유 루트로 다룬다.
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id: jobId } = await context.params;
  if (!jobId) return Response.json({ error: "job id required" }, { status: 400 });
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));

  const job = await runWithTenant(tenantId, async () => readVideoPublishJob(jobId));
  if (!job) return Response.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });

  if (job.status === "processing") {
    return Response.json({ ok: true, status: "processing", jobId: job.jobId });
  }
  const httpStatus = job.httpStatus ?? (job.status === "completed" ? 200 : 500);
  return Response.json(job.result ?? { ok: job.status === "completed" }, { status: httpStatus });
}
