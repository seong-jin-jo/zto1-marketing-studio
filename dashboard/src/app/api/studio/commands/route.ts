import { POST as createHandoff } from "@/app/api/studio/handoffs/route";
import { PATCH as editDraft } from "@/app/api/studio/drafts/[draftId]/editor/route";
import { POST as enqueueDraft } from "@/app/api/studio/drafts/[draftId]/enqueue/route";
import { generateText, sharedAiApprovalErrorResponse, sharedGenerationQuotaErrorResponse } from "@/lib/anthropic";
import { upstreamFailure } from "@/lib/api-failure";
import { chatTonePrompt, CHAT_TONE_IDS, parseChatToneSuggestionResponse, type ChatToneId } from "@/lib/studio/chat-tone-suggestions";
import { effectiveTenantId } from "@/lib/tenant-auth";

const EDIT_ACTIONS = new Set(["reorder_scenes", "delete_line", "restore_line", "mark_ready"]);

function forwarded(request: Request, pathname: string, method: string, body: Record<string, unknown>): Request {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  return new Request(new URL(pathname, request.url), {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

async function commandResponse(response: Response, action: string, routedTo: string): Promise<Response> {
  const payload = await response.json().catch(() => ({}));
  return Response.json({
    ...payload,
    command: { action, routed_to: routedTo, executed: response.ok },
  }, {
    status: response.status,
    headers: response.headers.get("X-Contract-Version")
      ? { "X-Contract-Version": response.headers.get("X-Contract-Version")! }
      : undefined,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "JSON object required", code: "INVALID_JSON_BODY" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const action = typeof input.action === "string" ? input.action : "";
  const draftId = typeof input.draft_id === "string" ? input.draft_id.trim() : "";

  if (action === "handoff_to_editor") {
    const target = "/api/studio/handoffs";
    const response = await createHandoff(forwarded(request, target, "POST", input));
    return commandResponse(response, action, target);
  }
  if (action === "suggest_chat_tone") {
    const lines = Array.isArray(input.lines) ? input.lines.map((line) => String(line ?? "")) : null;
    const tone = CHAT_TONE_IDS.includes(input.tone as ChatToneId) ? input.tone as ChatToneId : null;
    if (!lines || lines.length === 0 || lines.length > 50 || lines.some((line) => !line.trim())) {
      return Response.json({ error: "말투를 다듬을 말풍선은 1개에서 50개까지 필요합니다.", code: "CHAT_TONE_LINES_INVALID" }, { status: 400 });
    }
    if (!tone) return Response.json({ error: "지원하지 않는 말투입니다.", code: "CHAT_TONE_INVALID" }, { status: 400 });
    const tenantId = await effectiveTenantId(request, input.tenant_id).catch(() => null);
    if (!tenantId) return Response.json({ error: "작업 공간을 확인할 수 없습니다.", code: "TENANT_REQUIRED" }, { status: 401 });
    try {
      const raw = await generateText(chatTonePrompt(lines, tone), tenantId);
      const candidates = parseChatToneSuggestionResponse(raw, lines);
      return Response.json({ ok: true, candidates, fact_warning: "숫자와 고유명사는 적용 전에 원문과 다시 확인하세요.", command: { action, routed_to: "shared_ai", executed: true } });
    } catch (error) {
      const approval = sharedAiApprovalErrorResponse(error);
      if (approval) return approval;
      const quota = sharedGenerationQuotaErrorResponse(error);
      if (quota) return quota;
      return upstreamFailure("말투 후보 3개를 만들지 못했습니다. 원문은 바뀌지 않았습니다.");
    }
  }
  if (EDIT_ACTIONS.has(action)) {
    if (!draftId) return Response.json({ error: "draft_id required", code: "DRAFT_ID_REQUIRED" }, { status: 400 });
    const target = `/api/studio/drafts/${encodeURIComponent(draftId)}/editor`;
    const response = await editDraft(
      forwarded(request, target, "PATCH", { ...input, operation: action }),
      { params: Promise.resolve({ draftId }) },
    );
    return commandResponse(response, action, target);
  }
  if (action === "enqueue_openclaw") {
    if (!draftId) return Response.json({ error: "draft_id required", code: "DRAFT_ID_REQUIRED" }, { status: 400 });
    const target = `/api/studio/drafts/${encodeURIComponent(draftId)}/enqueue`;
    const response = await enqueueDraft(
      forwarded(request, target, "POST", input),
      { params: Promise.resolve({ draftId }) },
    );
    return commandResponse(response, action, target);
  }
  return Response.json({
    error: "unsupported chat command",
    code: "CHAT_COMMAND_NOT_SUPPORTED",
    supported_actions: [
      "handoff_to_editor",
      "reorder_scenes",
      "delete_line",
      "restore_line",
      "mark_ready",
      "enqueue_openclaw",
      "suggest_chat_tone",
    ],
  }, { status: 422 });
}
