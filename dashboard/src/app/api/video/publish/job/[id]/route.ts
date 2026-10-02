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
//
// MINOR-a(2026-10-02 독립 리뷰): POST는 fallback을 항상 null로 고정해 effectiveTenantId를
// 호출한다(route.ts의 POST — body.tenant_id를 아예 안 읽는다). 이 GET이 쿼리스트링의
// tenant_id를 fallback으로 썼더니, 운영자가 활성 작업공간을 갖고 있으면 POST는 null(공유
// 루트)에 저장하고 GET은 그 작업공간 id로 읽어 "작업을 찾지 못했습니다"(404) 거짓 실패가
// 났다. 고객 토큰(osmu_/Supabase JWT) 경로는 fallback을 완전히 무시하므로 이 줄은 운영자
// 경로에만 영향 있고 고객에게는 영향 없다 — POST와 똑같이 fallback을 null로 고정한다.
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id: jobId } = await context.params;
  if (!jobId) return Response.json({ error: "job id required" }, { status: 400 });
  const tenantId = await effectiveTenantId(request, null);

  const job = await runWithTenant(tenantId, async () => readVideoPublishJob(jobId));
  if (!job) return Response.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });

  if (job.status === "processing") {
    return Response.json({ ok: true, status: "processing", jobId: job.jobId });
  }
  const httpStatus = job.httpStatus ?? (job.status === "completed" ? 200 : 500);
  return Response.json(job.result ?? { ok: job.status === "completed" }, { status: httpStatus });
}
