import { deckProjection, type CardDeck } from "@/lib/studio/card-deck-contract";
import type { ContentEditFormat } from "@/lib/studio/content-edit-format";

type ReviewQueuePayloadInput = {
  tenantId: string;
  draftId: string;
  text: string;
  topic: string;
  hashtags: string[];
  editFormat: ContentEditFormat;
  editLines: string[];
  cardTextPositions: string[];
  cardDeck: CardDeck | null;
  image: {
    url?: string | null;
    imageUrls?: string[] | null;
    textEmbedded?: boolean;
  } | null;
  video: { url?: string | null } | null;
};

export type ReviewQueuePayload = Record<string, unknown> & {
  tenant_id: string;
  draftId: string;
  text: string;
  topic: string;
  hashtags: string[];
  editFormat: ContentEditFormat;
  editLines: string[];
};

/**
 * 검토 대기열에 저장할 현재 편집 형식의 완전한 스냅샷을 만든다.
 *
 * 화면에는 형식을 오갈 수 있도록 다른 형식의 상태도 남아 있지만, 대기열에는 현재 형식이
 * 소유한 필드만 보낸다. 말풍선 카드는 cardDeck이 편집 원본이므로 별도 editLines 상태를
 * 신뢰하지 않고 매번 덱에서 투영한다.
 */
export function buildReviewQueuePayload(input: ReviewQueuePayloadInput): ReviewQueuePayload {
  const common = {
    tenant_id: input.tenantId,
    draftId: input.draftId,
    text: input.text,
    topic: input.topic,
    hashtags: input.hashtags,
    editFormat: input.editFormat,
  };

  if (input.editFormat.kind === "card") {
    const textEmbedded = input.image?.textEmbedded === true;
    const editLines = input.cardDeck?.template === "chat_bubble"
      ? deckProjection(input.cardDeck).lines
      : input.editLines;
    return {
      ...common,
      imageUrl: input.image?.url || null,
      imageUrls: input.image?.imageUrls || null,
      textEmbedded,
      editLines,
      ...(textEmbedded ? { cardTextPositions: input.cardTextPositions } : {}),
    };
  }

  if (input.editFormat.kind === "video") {
    return {
      ...common,
      editLines: input.editLines,
      videoUrl: input.video?.url || null,
    };
  }

  return { ...common, editLines: input.editLines };
}
