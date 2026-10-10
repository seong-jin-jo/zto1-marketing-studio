import { effectiveTenantId } from "@/lib/tenant-auth";
import { applyEditorOperation, EditorContractError, parseEditorOperation } from "@/lib/studio/editor-handoff";
import { loadEditorHandoff, updateEditorHandoff } from "@/lib/studio/editor-handoff-store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const body = await request.json().catch(() => null);
  const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const tenantId = await effectiveTenantId(request, typeof input.tenant_id === "string" ? input.tenant_id : null);
  if (!tenantId) return Response.json({ error: "no-tenant" }, { status: 401 });
  const { draftId } = await params;
  try {
    const command = parseEditorOperation(input);
    const loaded = await loadEditorHandoff(tenantId, draftId);
    if (!loaded) return Response.json({ error: "편집 인계 기록을 찾지 못했습니다.", code: "EDITOR_HANDOFF_NOT_FOUND" }, { status: 404 });
    const handoff = applyEditorOperation(loaded.handoff, command.expected_revision, command.change);
    const saved = await updateEditorHandoff(tenantId, draftId, command.expected_revision, handoff);
    if (!saved) {
      return Response.json({ error: "editor revision changed", code: "EDITOR_REVISION_CONFLICT" }, { status: 409 });
    }
    return Response.json({ ok: true, draft_id: draftId, handoff });
  } catch (error) {
    if (error instanceof EditorContractError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return Response.json({ error: "editor command failed" }, { status: 500 });
  }
}
