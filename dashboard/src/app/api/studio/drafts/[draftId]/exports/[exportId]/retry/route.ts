import { effectiveTenantId } from "@/lib/tenant-auth";
import { exportErrorResponse, parseDraftId, parseExportId, parseRetryExport } from "@/lib/studio/export-contract";
import { exportRepository } from "@/lib/studio/export-repository";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string; exportId: string }> }) {
  try {
    const body = await request.json().catch(() => null);
    const input = parseRetryExport(body);
    const tenantId = await effectiveTenantId(
      request,
      body && typeof body === "object" && typeof body.tenant_id === "string" ? body.tenant_id : null,
    );
    if (!tenantId) return Response.json({ error: "워크스페이스가 필요합니다", code: "NO_TENANT" }, { status: 401 });
    const raw = await params;
    const draftId = parseDraftId(raw.draftId);
    const exportId = parseExportId(raw.exportId);
    const itemKeys = await exportRepository().retry(tenantId, draftId, exportId, input);
    return Response.json({ export_id: exportId, status: "queued", requeued_item_keys: itemKeys }, { status: 202 });
  } catch (error) {
    return exportErrorResponse(error);
  }
}
