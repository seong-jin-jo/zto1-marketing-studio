import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { addQueuePost, QueueInputError } from "@/lib/queue-add";
import { EditorContractError, handoffQueueInput } from "@/lib/studio/editor-handoff";
import { editorHandoffFromDraftPayload, loadEditorHandoff } from "@/lib/studio/editor-handoff-store";
import { cardDeckV3PublishErrorResponse } from "@/lib/studio/card-deck-v3-publish-gate";
import { exportRepository } from "@/lib/studio/export-repository";
import { ExportQueueError, type ExportKind } from "@/lib/studio/export-contract";
import { exportKindForDraftState } from "@/lib/studio/export-eligibility";
import { signImageToken } from "@/lib/image-token";

function artifactDeliveryUrl(tenantId: string, kind: ExportKind, artifactKey: string): string {
  const token = signImageToken(tenantId, artifactKey);
  const origin = process.env.OSMU_PUBLIC_URL?.replace(/\/+$/, "") ?? "";
  let parsed: URL;
  try { parsed = new URL(origin); } catch {
    throw new ExportQueueError(503, "EXPORT_DELIVERY_UNAVAILABLE", "내보내기 결과 주소를 만들 수 없습니다");
  }
  const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!token || (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:"))) {
    throw new ExportQueueError(503, "EXPORT_DELIVERY_UNAVAILABLE", "내보내기 결과 주소를 만들 수 없습니다");
  }
  const path = `${kind === "video" ? "/api/exports/deliver/" : "/api/images/deliver/"}${encodeURIComponent(token)}`;
  return `${origin}${path}`;
}

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
    const exportKind = exportKindForDraftState(loaded.handoff.kind, loaded.draft.payload ?? {});
    if (exportKind) {
      return await exportRepository().withLatestForPublish(tenantId, draftId, exportKind, async (receipt, lockedPayload) => {
        const lockedHandoff = editorHandoffFromDraftPayload(lockedPayload);
        const lockedKind = exportKindForDraftState(lockedHandoff?.kind, lockedPayload);
        if (!lockedHandoff || lockedKind !== exportKind) {
          throw new EditorContractError("발행 준비 중 편집본이 바뀌었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.", 409, "EDITOR_HANDOFF_CHANGED");
        }
        const artifactUrls = receipt.artifactKeys.map((key) => artifactDeliveryUrl(tenantId, exportKind, key));
        const input = handoffQueueInput(lockedHandoff, draftId, receipt);
        const preparedMedia = exportKind === "card_deck"
          ? { imageUrl: artifactUrls[0] ?? null, imageUrls: artifactUrls, videoFilename: null, videoUrl: null }
          : { imageUrl: null, imageUrls: null, videoFilename: receipt.artifactKeys[0] ?? null, videoUrl: artifactUrls[0] ?? null };
        const result = await runWithTenant(tenantId, () => addQueuePost(tenantId, input, { preparedMedia }));
        return Response.json({ ok: true, draft_id: draftId, export_id: receipt.exportId, source_hash: receipt.sourceHash, ...result }, { status: result.reused ? 200 : 201 });
      });
    }
    const input = handoffQueueInput(loaded.handoff, draftId);
    const result = await runWithTenant(tenantId, () => addQueuePost(tenantId, input));
    return Response.json({ ok: true, draft_id: draftId, ...result }, { status: result.reused ? 200 : 201 });
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
