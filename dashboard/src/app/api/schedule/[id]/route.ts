import { withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";

// P6 예약 발행 중지 — DELETE /api/schedule/{id}?tenant_id=...
// status='scheduled'(아직 크론이 claim하지 않은 행)만 canceled로 전환한다.
// publish-due가 FOR UPDATE SKIP LOCKED로 claim하면 status가 'processing'으로 바뀌므로,
// 이 경로는 그 경합을 건 UPDATE ... WHERE status='scheduled' 한 문장으로 이긴다(레이스 안전).
// 이미 processing/published/failed/partial/uncertain/canceled인 행은 409로 거절 — 발행이
// 시작된 뒤 provider 쪽 진짜 취소는 이 계약의 범위 밖(원 감사 갭에도 "부분 구현"으로 남긴다).

type RouteContext = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 400 });
  if (!id) return Response.json({ error: "id required" }, { status: 400 });
  if (!UUID_RE.test(id)) return Response.json({ error: "id 형식 오류" }, { status: 400 });

  try {
    const result = await withTenant(tenantId, async (sql) => {
      const [existing] = await sql<{ id: string; status: string }[]>`
        SELECT id, status FROM schedules WHERE tenant_id = ${tenantId} AND id = ${id}`;
      if (!existing) return { kind: "not_found" as const };
      if (existing.status !== "scheduled") return { kind: "conflict" as const, status: existing.status };

      const [updated] = await sql<{ id: string; status: string }[]>`
        UPDATE schedules SET status = 'canceled'
        WHERE tenant_id = ${tenantId} AND id = ${id} AND status = 'scheduled'
        RETURNING id, status`;
      if (!updated) {
        // claim(publish-due)과 경합해 그 사이 status가 바뀐 경우 — 다시 조회해 정확한 사유를 준다.
        const [after] = await sql<{ status: string }[]>`
          SELECT status FROM schedules WHERE tenant_id = ${tenantId} AND id = ${id}`;
        return { kind: "conflict" as const, status: after?.status ?? "unknown" };
      }
      return { kind: "ok" as const, status: updated.status };
    });

    if (result.kind === "not_found") {
      return Response.json({ error: "예약을 찾을 수 없습니다" }, { status: 404 });
    }
    if (result.kind === "conflict") {
      return Response.json(
        { error: `이미 처리가 시작되어 중지할 수 없습니다 (status: ${result.status})`, status: result.status },
        { status: 409 },
      );
    }
    return Response.json({ ok: true, id, status: result.status });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
