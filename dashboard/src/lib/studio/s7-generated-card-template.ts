import type { CardTextPosition } from "@/components/studio/EditPreview";
import { createPlainCardDeckV3 } from "@/lib/studio/card-element-commands";
import {
  applyCardDeckTemplate,
  type CardDeckTemplateId,
  type CardTemplateState,
} from "@/lib/studio/card-templates";

export interface GeneratedCardTemplateSourceSnapshot {
  editLines: string[];
  cardTextPositions: CardTextPosition[];
}

export function buildGeneratedCardTemplate(input: {
  renderEnabled: boolean;
  templateId: Exclude<CardDeckTemplateId, "chat_bubble">;
  lines: string[];
}): {
  deck: ReturnType<typeof createPlainCardDeckV3>;
  sourceSnapshot: GeneratedCardTemplateSourceSnapshot;
  templateState: CardTemplateState;
} | null {
  if (!input.renderEnabled) return null;

  const sourceSnapshot = {
    editLines: [...input.lines],
    cardTextPositions: [],
  } satisfies GeneratedCardTemplateSourceSnapshot;
  const baseDeck = createPlainCardDeckV3(sourceSnapshot.editLines, sourceSnapshot.cardTextPositions);

  return {
    deck: applyCardDeckTemplate(baseDeck, input.templateId, { kind: "all" }),
    sourceSnapshot,
    templateState: { activeTemplateId: input.templateId, previousTemplate: null },
  };
}
