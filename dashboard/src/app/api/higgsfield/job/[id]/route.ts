import { effectiveTenantId } from "@/lib/tenant-auth";
import { finalizeHiggsfieldJob } from "@/lib/higgsfield-finalize";

// GET /api/higgsfield/job/[id] — 비동기 생성 작업 상태 조회(비동기 전환 2026-10-01).
//
// 실제 완료 처리 로직(락·CLI 조회·결과 해석·멱등 반환)은 higgsfield-finalize.ts 로 옮겼다
// (2026-10-02, 서버측 백그라운드 루프와 공유하기 위함 — 세션맥락: 탭이 백그라운드에 오래
// 있어 화면 GET이 22분 뒤에야 나간 사고 재발방지). 이 라우트는 테넌트 식별·404 번역만 한다.
//
// - 타 테넌트의 jobId로 조회하면 작업 존재 자체를 알리지 않고 404.
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id: jobId } = await context.params;
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ error: "테넌트를 식별할 수 없습니다." }, { status: 401 });
  if (!jobId) return Response.json({ error: "job id required" }, { status: 400 });

  const outcome = await finalizeHiggsfieldJob(tenantId, jobId);
  if (!outcome) return Response.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
  return Response.json(outcome.body, { status: outcome.httpStatus });
}
