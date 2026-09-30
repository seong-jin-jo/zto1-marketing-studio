import { QueueInputError } from "@/lib/queue-add";
import {
  CARD_DECK_MAX_PROJECTED_LINES,
} from "@/lib/studio/card-deck-contract";
import { PUBLISH_IMAGE_LIMIT } from "@/lib/studio/channel-image-capacity";
import {
  validateContentEditFormat,
  type ContentEditFormat,
} from "@/lib/studio/content-edit-format";

const QUEUE_EDIT_LINE_MAX_CHARS = 500;
const CARD_TEXT_POSITIONS = new Set([
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
]);

export type ValidatedQueueEditFields = {
  textEmbedded: boolean;
  editLines: string[] | undefined;
  cardTextPositions: string[] | undefined;
  editFormat: ContentEditFormat | null | undefined;
};

function hasOwn(data: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(data, field);
}

/**
 * 대기열 추가와 기존 대기열 교체가 공유하는 형식별 입력 계약이다.
 *
 * 글과 영상은 v70 §3.5·§4.4대로 문단·자막 목록을 계속 스크롤하므로 항목 수 상한을
 * 새로 만들지 않는다. 카드만 렌더 계약이 가진 장수·장당 말풍선 상한에서 투영 줄 수를
 * 파생하며, 글자 내장 카드는 발행 이미지 상한과 이미지·문구 장수 일치를 적용한다.
 */
export function validateQueueEditFields(data: Record<string, unknown>): ValidatedQueueEditFields {
  if (hasOwn(data, "textEmbedded") && typeof data.textEmbedded !== "boolean") {
    throw new QueueInputError("textEmbedded는 boolean이어야 합니다");
  }
  const textEmbedded = data.textEmbedded === true;

  let editFormat: ContentEditFormat | null | undefined = data.editFormat === null ? null : undefined;
  if (hasOwn(data, "editFormat") && data.editFormat !== null) {
    const validation = validateContentEditFormat(data.editFormat);
    if (!validation.valid) {
      throw new QueueInputError(validation.issues.map((issue) => issue.message).join("; "));
    }
    editFormat = validation.value;
  }

  let editLines: string[] | undefined;
  if (hasOwn(data, "editLines") && data.editLines !== null) {
    if (!Array.isArray(data.editLines) || data.editLines.some((line) => typeof line !== "string")) {
      throw new QueueInputError("editLines는 문자열 배열이어야 합니다");
    }
    if (textEmbedded && data.editLines.length > PUBLISH_IMAGE_LIMIT) {
      throw new QueueInputError(`editLines는 최대 ${PUBLISH_IMAGE_LIMIT}장까지 저장할 수 있습니다`);
    }
    if (!textEmbedded
      && editFormat?.kind === "card"
      && data.editLines.length > CARD_DECK_MAX_PROJECTED_LINES) {
      throw new QueueInputError(`말풍선 카드 editLines는 최대 ${CARD_DECK_MAX_PROJECTED_LINES}개까지 저장할 수 있습니다`);
    }
    const longLineIndex = data.editLines.findIndex((line) => line.length > QUEUE_EDIT_LINE_MAX_CHARS);
    if (longLineIndex >= 0) {
      throw new QueueInputError(`editLines ${longLineIndex + 1}번째 문구는 최대 ${QUEUE_EDIT_LINE_MAX_CHARS}자입니다`);
    }
    editLines = data.editLines as string[];
  }

  const imageUrls = Array.isArray(data.imageUrls) ? data.imageUrls : undefined;
  if (textEmbedded && imageUrls && editLines && imageUrls.length !== editLines.length) {
    throw new QueueInputError("imageUrls와 editLines 장수는 같아야 합니다");
  }

  let cardTextPositions: string[] | undefined;
  if (textEmbedded && hasOwn(data, "cardTextPositions") && data.cardTextPositions !== null) {
    if (!Array.isArray(data.cardTextPositions)
      || data.cardTextPositions.some((position) => typeof position !== "string" || !CARD_TEXT_POSITIONS.has(position))) {
      throw new QueueInputError("cardTextPositions에 허용되지 않은 글자 위치가 있습니다");
    }
    const cardCount = editLines?.length ?? (imageUrls?.length ?? (data.imageUrl ? 1 : 0));
    if (data.cardTextPositions.length !== 0 && data.cardTextPositions.length !== cardCount) {
      throw new QueueInputError("cardTextPositions 장수는 카드 장수와 같아야 합니다");
    }
    cardTextPositions = data.cardTextPositions as string[];
  }

  if (textEmbedded) {
    if (!imageUrls?.length || imageUrls.some((url) => typeof url !== "string" || !url.trim())) {
      throw new QueueInputError("textEmbedded 카드에는 비어 있지 않은 imageUrls가 필요합니다");
    }
    if (!editLines?.length || editLines.length !== imageUrls.length || editLines.some((line) => !line.trim())) {
      throw new QueueInputError("textEmbedded 카드에는 이미지와 같은 장수의 editLines가 필요합니다");
    }
    if (!Array.isArray(cardTextPositions)) {
      throw new QueueInputError("textEmbedded 카드에는 cardTextPositions 배열이 필요합니다");
    }
    if (editFormat?.kind !== "card") {
      throw new QueueInputError("textEmbedded 카드에는 카드 editFormat이 필요합니다");
    }
  }

  return { textEmbedded, editLines, cardTextPositions, editFormat };
}
