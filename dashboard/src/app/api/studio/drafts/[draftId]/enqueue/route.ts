import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { addQueuePost, QueueInputError } from "@/lib/queue-add";
import { EditorContractError, handoffQueueInput } from "@/lib/studio/editor-handoff";
import { loadEditorHandoff } from "@/lib/studio/editor-handoff-store";
import { cardDeckV3PublishErrorResponse } from "@/lib/studio/card-deck-v3-publish-gate";

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
    return Response.json({ error: "openclaw enqueue failed" }, { status: 500 });
  }
}
