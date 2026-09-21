import { studioFailure, studioSuccess, readJson } from "@/lib/studio/generation/http";
import { resolveStudioPrincipal } from "@/lib/studio/generation/identity";
import { StudioApiError } from "@/lib/studio/generation/errors";
import { generationRuntime } from "@/lib/studio/generation/runtime";
import type { DerivationOptions } from "@/lib/studio/generation/service";
import type { HookType } from "@/lib/studio/card-deck-contract";
import {
  DERIVATION_KINDS,
  derivationQuote,
  parseDerivationKinds,
  publicBatch,
  publicQuote,
  type DerivationKind,
} from "@/lib/studio/generation/derivation";

const CARD_HOOK_TYPES = ["question", "number", "pain", "auto"] as const;

/** body.options.card.hook_type. 값이 없으면 auto(모델이 고르고 선언). 값이 있는데 허용 밖이면 422. */
function parseDerivationOptions(body: Record<string, unknown> | null): DerivationOptions | undefined {
  const options = body?.options;
  if (!options || typeof options !== "object") return undefined;
  const card = (options as Record<string, unknown>).card;
  if (!card || typeof card !== "object") return undefined;
  const raw = (card as Record<string, unknown>).hook_type;
  if (raw === undefined || raw === null) return { card: { hookType: "auto" } };
  if (typeof raw !== "string" || !(CARD_HOOK_TYPES as readonly string[]).includes(raw)) {
    throw new StudioApiError({
      status: 422,
      code: "DERIVATION_OPTION_INVALID",
      message: "hook_type 값이 허용 범위를 벗어났습니다",
      fieldErrors: [{ field: "options.card.hook_type", reason: `허용값: ${CARD_HOOK_TYPES.join(", ")}` }],
    });
  }
  return { card: { hookType: raw as HookType | "auto" } };
}

type RouteContext = { params: Promise<{ jobId: string }> };

// GET /api/studio/v1/generations/{jobId}/derivations?kinds=card,video
// 확정 전에 값을 보여 주는 자리다. 이 값을 못 본 채로는 확정이 안 되게 POST 가 막는다.
export async function GET(request: Request, context: RouteContext) {
  try {
    await resolveStudioPrincipal(request);
    await context.params;
    const raw = new URL(request.url).searchParams.get("kinds") ?? "";
    const requested = raw.split(",").map((value) => value.trim()).filter(Boolean);
    const kinds = requested.length > 0
      ? parseDerivationKinds(requested)
      : [...DERIVATION_KINDS] as DerivationKind[];
    return studioSuccess({ quote: publicQuote(derivationQuote(kinds)) });
  } catch (error) {
    return studioFailure(error);
  }
}

// POST /api/studio/v1/generations/{jobId}/derivations
// 주 갈래를 확정하면서 같이 고른 갈래로 옮겨 만든다. 무료 재생성 몫은 건드리지 않는다.
export async function POST(request: Request, context: RouteContext) {
  try {
    const principal = await resolveStudioPrincipal(request);
    const { jobId } = await context.params;
    const body = await readJson(request) as Record<string, unknown> | null;
    const candidateId = typeof body?.candidate_id === "string" ? body.candidate_id.trim() : "";
    if (!candidateId) {
      throw new StudioApiError({
        status: 422,
        code: "CANDIDATE_ID_REQUIRED",
        message: "확정한 후보 번호가 필요합니다",
        fieldErrors: [{ field: "candidate_id", reason: "필수 문자열입니다" }],
      });
    }
    const kinds = parseDerivationKinds(body?.kinds);
    const batch = await generationRuntime().derive(
      principal.memberId,
      jobId,
      candidateId,
      kinds,
      body?.acknowledged_cost,
      request.headers.get("Idempotency-Key") ?? "",
      [...principal.allowedWorkspaceIds],
      new Date(),
      parseDerivationOptions(body),
    );
    // 한 갈래라도 실패하면 201 로 성공을 알리지 않는다. 화면이 갈래별 결과를 그대로 보이게 한다.
    return studioSuccess(publicBatch(batch), batch.status === "succeeded" ? 201 : 207);
  } catch (error) {
    return studioFailure(error);
  }
}
