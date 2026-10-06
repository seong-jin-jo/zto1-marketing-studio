import { signImageToken } from "@/lib/image-token";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { exportErrorResponse } from "@/lib/studio/export-contract";
import { exportRepository } from "@/lib/studio/export-repository";

function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ draftId: string; exportId: string }> }) {
  try {
    const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
    if (!tenantId) return Response.json({ error: "워크스페이스가 필요합니다", code: "NO_TENANT" }, { status: 401 });
    const { draftId, exportId } = await params;
    const job = await exportRepository().get(tenantId, draftId, exportId);
    return Response.json({
      export_id: job.id,
      status: job.status,
      source_revision: job.source_revision,
      source_hash: job.source_hash,
      progress: { completed: job.succeeded_items + job.failed_items, total: job.total_items },
      items: job.items.map((item) => {
        const token = item.status === "succeeded" && item.artifact_key
          ? signImageToken(tenantId, item.artifact_key, 15 * 60 * 1000)
          : null;
        return {
          item_key: item.item_key,
          ordinal: item.ordinal,
          status: item.status,
          attempt_count: item.attempt_count,
          ...(token ? { artifact_url: `/api/images/deliver/${encodeURIComponent(token)}` } : {}),
          ...(item.error_code ? { error_code: item.error_code } : {}),
        };
      }),
      created_at: iso(job.created_at),
      updated_at: iso(job.updated_at),
      finished_at: iso(job.finished_at),
    });
  } catch (error) {
    return exportErrorResponse(error);
  }
}
