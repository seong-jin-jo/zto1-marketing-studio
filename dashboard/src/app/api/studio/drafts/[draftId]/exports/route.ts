import { effectiveTenantId } from "@/lib/tenant-auth";
import {
  exportErrorResponse,
  exportMemberId,
  exportRequestHash,
  parseCreateExport,
  parseIdempotencyKey,
} from "@/lib/studio/export-contract";
import { exportRepository } from "@/lib/studio/export-repository";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  try {
    const body = await request.json().catch(() => null);
    const input = parseCreateExport(body);
    const tenantId = await effectiveTenantId(
      request,
      body && typeof body === "object" && typeof body.tenant_id === "string" ? body.tenant_id : null,
    );
    if (!tenantId) return Response.json({ error: "워크스페이스가 필요합니다", code: "NO_TENANT" }, { status: 401 });
    const { draftId } = await params;
    const result = await exportRepository().create(
      tenantId,
      draftId,
      exportMemberId(request),
      parseIdempotencyKey(request),
      exportRequestHash(input),
      input,
    );
    const job = result.job;
    return Response.json({
      export_id: job.id,
      draft_id: job.draft_id,
      kind: job.kind,
      status: job.status,
      source_revision: job.source_revision,
      source_hash: job.source_hash,
      total_items: job.total_items,
      status_url: `/api/studio/drafts/${job.draft_id}/exports/${job.id}`,
    }, { status: result.reused ? 200 : 202 });
  } catch (error) {
    return exportErrorResponse(error);
  }
}
