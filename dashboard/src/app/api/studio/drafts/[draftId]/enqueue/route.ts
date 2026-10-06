import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { addQueuePost, QueueInputError } from "@/lib/queue-add";
import { EditorContractError, handoffQueueInput } from "@/lib/studio/editor-handoff";
import { loadEditorHandoff } from "@/lib/studio/editor-handoff-store";
import { cardDeckV3PublishErrorResponse } from "@/lib/studio/card-deck-v3-publish-gate";
import { exportRepository } from "@/lib/studio/export-repository";
import { ExportQueueError, type ExportKind } from "@/lib/studio/export-contract";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const body = await request.json().catch(() => ({}));
  const tenantId = await effectiveTenantId(request, typeof body.tenant_id === "string" ? body.tenant_id : null);
  if (!tenantId) return Response.json({ error: "no-tenant" }, { status: 401 });
  const { draftId } = await params;
  try {
    const loaded = await loadEditorHandoff(tenantId, draftId);
    if (!loaded) return Response.json({ error: "editor handoff not found", code: "EDITOR_HANDOFF_NOT_FOUND" }, { status: 404 });
    const exportKind: ExportKind | null = loaded.handoff.kind === "card" ? "card_deck" : loaded.handoff.kind === "video" ? "video" : null;
    let exportReceipt: { exportId: string; sourceHash: string } | undefined;
    if (exportKind) {
      const latest = await exportRepository().latest(tenantId, draftId, exportKind);
      const latestExport = latest.latest_export && typeof latest.latest_export === "object"
        ? latest.latest_export as Record<string, unknown>
        : null;
      if (latest.blocker || latest.is_latest !== true || !latestExport || latestExport.status !== "succeeded") {
        const code = typeof latest.blocker === "string" ? latest.blocker : "NO_SUCCESSFUL_EXPORT";
        const message = code === "EMPTY_SLIDE"
          ? "빈 장은 발행실로 보낼 수 없습니다"
          : code === "EXPORT_SOURCE_STALE"
            ? "편집 뒤 최신 내용으로 다시 내보내야 합니다"
            : code === "EXPORT_IN_PROGRESS"
              ? "최신 내보내기가 아직 진행 중입니다"
              : code === "EXPORT_FAILED"
                ? "실패한 항목을 다시 내보낸 뒤 발행할 수 있습니다"
                : "최신 내보내기 결과가 있어야 발행할 수 있습니다";
        throw new ExportQueueError(409, code, message, {
          ...(latest.first_empty_slide ? { first_empty_slide: latest.first_empty_slide } : {}),
        });
      }
      exportReceipt = {
        exportId: String(latestExport.export_id),
        sourceHash: String(latest.current_source_hash),
      };
    }
    const input = handoffQueueInput(loaded.handoff, draftId, exportReceipt);
    const result = await runWithTenant(tenantId, () => addQueuePost(tenantId, input));
    return Response.json({ ok: true, draft_id: draftId, ...(exportReceipt ? { export_id: exportReceipt.exportId, source_hash: exportReceipt.sourceHash } : {}), ...result }, { status: result.reused ? 200 : 201 });
  } catch (error) {
    const response = cardDeckV3PublishErrorResponse(error);
    if (response) return response;
    if (error instanceof EditorContractError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof QueueInputError) {
      return Response.json({ error: error.message, code: "QUEUE_INPUT_INVALID" }, { status: 400 });
    }
    if (error instanceof ExportQueueError) {
      return Response.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
    }
    return Response.json({ error: "openclaw enqueue failed" }, { status: 500 });
  }
}
