import { effectiveTenantId } from "@/lib/tenant-auth";
import { ExportQueueError, exportErrorResponse, exportKindSchema, parseDraftId } from "@/lib/studio/export-contract";
import { exportRepository } from "@/lib/studio/export-repository";

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  try {
    const url = new URL(request.url);
    const kind = exportKindSchema.safeParse(url.searchParams.get("kind"));
    if (!kind.success) throw new ExportQueueError(400, "INVALID_EXPORT_REQUEST", "kind가 올바르지 않습니다");
    const tenantId = await effectiveTenantId(request, url.searchParams.get("tenant_id"));
    if (!tenantId) return Response.json({ error: "워크스페이스가 필요합니다", code: "NO_TENANT" }, { status: 401 });
    const draftId = parseDraftId((await params).draftId);
    return Response.json(await exportRepository().latest(tenantId, draftId, kind.data));
  } catch (error) {
    return exportErrorResponse(error);
  }
}
