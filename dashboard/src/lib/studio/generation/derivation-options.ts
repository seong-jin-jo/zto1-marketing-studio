import type { HookType } from "@/lib/studio/card-deck-contract";
import { StudioApiError } from "@/lib/studio/generation/errors";
import type { DerivationOptions } from "@/lib/studio/generation/service";

const CARD_HOOK_TYPES = ["question", "number", "pain", "auto"] as const;

/** body.options.card.hook_type. 값이 없으면 auto(모델이 고르고 선언). 값이 있는데 허용 밖이면 422. */
export function parseDerivationOptions(body: Record<string, unknown> | null): DerivationOptions | undefined {
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
