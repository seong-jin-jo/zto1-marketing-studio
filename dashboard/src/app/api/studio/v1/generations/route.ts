import { parseGenerationRequest } from "@/lib/studio/generation/contracts";
import { studioFailure, studioSuccess, readJson } from "@/lib/studio/generation/http";
import { assertWorkspaceAccess, resolveStudioPrincipal } from "@/lib/studio/generation/identity";
import { generationRuntime } from "@/lib/studio/generation/runtime";
import { isStudioApiError } from "@/lib/studio/generation/errors";
import { reportFailure, reportRecovery } from "@/lib/observability";
import { withStoredLearnedRules } from "@/lib/studio/generation/learned-rules-merge";

export async function POST(request: Request) {
  let workspaceId: string | null = null;
  try {
    const principal = await resolveStudioPrincipal(request);
    const input = parseGenerationRequest(await readJson(request));
    workspaceId = input.workspaceId;
    assertWorkspaceAccess(principal, input.workspaceId);
    // 성과실에서 승낙한 규칙은 서버가 채운다. 화면이 들고 다니게 하면 잊는 순간 학습이
    // 조용히 죽고, 조용히 죽는 것은 아무도 모른다(2026-09-10).
    const enriched = await withStoredLearnedRules(input);
    const response = await generationRuntime().create(
      principal.memberId,
      request.headers.get("Idempotency-Key") ?? "",
      enriched,
    );
    void reportRecovery?.({ workspaceId, category: "generation_failed", source: "studio" });
    return studioSuccess(response, 201);
  } catch (error) {
    const status = isStudioApiError(error) ? error.status : 500;
    if (workspaceId && status >= 500) {
      void reportFailure({
        event: "studio_generation_failed",
        severity: "error",
        workspaceId,
        context: { reason: isStudioApiError(error) && error.retryable ? "provider_unavailable" : "unknown" },
      });
    }
    return studioFailure(error);
  }
}
