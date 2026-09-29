import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { addQueuePost, QueueInputError } from "@/lib/queue-add";
import { validateContentEditFormat } from "@/lib/studio/content-edit-format";
import type { ContentEditFormat } from "@/lib/studio/content-edit-format";
import { PUBLISH_IMAGE_LIMIT } from "@/lib/studio/channel-image-capacity";

const QUEUE_CARD_TEXT_MAX_CHARS = 500;
const CARD_TEXT_POSITIONS = new Set([
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
]);

function hasOwn(data: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(data, field);
}

function validateCardEditFields(data: Record<string, unknown>, textEmbedded: boolean) {
  let editLines: string[] | undefined;
  if (hasOwn(data, "editLines") && data.editLines !== null) {
    if (!Array.isArray(data.editLines) || data.editLines.some((line) => typeof line !== "string")) {
      throw new QueueInputError("editLines는 문자열 배열이어야 합니다");
    }
    if (textEmbedded && data.editLines.length > PUBLISH_IMAGE_LIMIT) {
      throw new QueueInputError(`editLines는 최대 ${PUBLISH_IMAGE_LIMIT}장까지 저장할 수 있습니다`);
    }
    const longLineIndex = data.editLines.findIndex((line) => line.length > QUEUE_CARD_TEXT_MAX_CHARS);
    if (longLineIndex >= 0) {
      throw new QueueInputError(`editLines ${longLineIndex + 1}번째 문구는 최대 ${QUEUE_CARD_TEXT_MAX_CHARS}자입니다`);
    }
    editLines = data.editLines as string[];
  }

  const imageUrls = Array.isArray(data.imageUrls) ? data.imageUrls : undefined;
  if (textEmbedded && imageUrls && editLines && imageUrls.length !== editLines.length) {
    throw new QueueInputError("imageUrls와 editLines 장수는 같아야 합니다");
  }

  let cardTextPositions: string[] | undefined;
  if (hasOwn(data, "cardTextPositions") && data.cardTextPositions !== null) {
    if (!Array.isArray(data.cardTextPositions)
      || data.cardTextPositions.some((position) => typeof position !== "string" || !CARD_TEXT_POSITIONS.has(position))) {
      throw new QueueInputError("cardTextPositions에 허용되지 않은 글자 위치가 있습니다");
    }
    const cardCount = editLines?.length ?? (Array.isArray(data.imageUrls) ? data.imageUrls.length : data.imageUrl ? 1 : 0);
    if (data.cardTextPositions.length !== 0 && data.cardTextPositions.length !== cardCount) {
      throw new QueueInputError("cardTextPositions 장수는 카드 장수와 같아야 합니다");
    }
    cardTextPositions = data.cardTextPositions as string[];
  }

  let editFormat: ContentEditFormat | null | undefined = data.editFormat === null ? null : undefined;
  if (hasOwn(data, "editFormat") && data.editFormat !== null) {
    const validation = validateContentEditFormat(data.editFormat);
    if (!validation.valid) {
      throw new QueueInputError(validation.issues.map((issue) => issue.message).join("; "));
    }
    editFormat = validation.value;
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
  return { editLines, cardTextPositions, editFormat };
}

export async function POST(request: Request) {
  const data = await request.json().catch(() => ({}));
  const __t = await effectiveTenantId(request, data.tenant_id ?? null);
  return runWithTenant(__t, async () => {
    try {
      if (hasOwn(data, "textEmbedded") && typeof data.textEmbedded !== "boolean") {
        throw new QueueInputError("textEmbedded는 boolean이어야 합니다");
      }
      const textEmbedded = data.textEmbedded === true;
      const cardEdit = validateCardEditFields(data, textEmbedded);
      const result = await addQueuePost(__t, {
        text: typeof data.text === "string" ? data.text : "",
        draftId: typeof data.draftId === "string" ? data.draftId : null,
        topic: data.topic,
        hashtags: data.hashtags,
        imageUrl: data.imageUrl,
        imageUrls: data.imageUrls,
        textEmbedded,
        editLines: cardEdit.editLines,
        cardTextPositions: cardEdit.cardTextPositions,
        editFormat: cardEdit.editFormat,
        cardBatchId: data.cardBatchId,
        videoFilename: data.videoFilename,
        videoUrl: data.videoUrl,
        videoThumbnail: data.videoThumbnail,
      });
      return Response.json({ success: true, ...result });
    } catch (error) {
      if (error instanceof QueueInputError) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  });
}
