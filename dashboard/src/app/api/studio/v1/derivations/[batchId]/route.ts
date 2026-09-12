import { studioFailure, studioSuccess } from "@/lib/studio/generation/http";
import { resolveStudioPrincipal } from "@/lib/studio/generation/identity";
import { generationRuntime } from "@/lib/studio/generation/runtime";
import { publicBatch } from "@/lib/studio/generation/derivation";
import { StudioApiError } from "@/lib/studio/generation/errors";

type RouteContext = { params: Promise<{ batchId: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertBatchId(batchId: string): void {
  if (!UUID_PATTERN.test(batchId)) {
    throw new StudioApiError({
      status: 400,
      code: "INVALID_RESOURCE_ID",
      message: "파생 작업 번호가 올바른 UUID 형식이 아닙니다",
      fieldErrors: [{ field: "batch_id", reason: "UUID 형식이 필요합니다" }],
    });
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const principal = await resolveStudioPrincipal(request);
    const { batchId } = await context.params;
    assertBatchId(batchId);
    const batch = await generationRuntime().getDerivation(
      principal.memberId,
      batchId,
      [...principal.allowedWorkspaceIds],
    );
    return studioSuccess(publicBatch(batch));
  } catch (error) {
    return studioFailure(error);
  }
}

// DELETE /api/studio/v1/derivations/{batchId}
// 파생을 안 쓰기로 하면 버린다. 주 갈래 결과는 다른 표에 있어 함께 사라지지 않는다.
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const principal = await resolveStudioPrincipal(request);
    const { batchId } = await context.params;
    assertBatchId(batchId);
    const batch = await generationRuntime().discardDerivation(
      principal.memberId,
      batchId,
      [...principal.allowedWorkspaceIds],
    );
    return studioSuccess(publicBatch(batch));
  } catch (error) {
    return studioFailure(error);
  }
}
