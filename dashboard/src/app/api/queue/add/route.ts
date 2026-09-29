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

function validateCardEditFields(data: Record<string, unknown>) {
  let editLines: string[] | undefined;
  if (Object.prototype.hasOwnProperty.call(data, "editLines") && data.editLines !== null) {
    if (!Array.isArray(data.editLines) || data.editLines.some((line) => typeof line !== "string")) {
      throw new QueueInputError("editLines는 문자열 배열이어야 합니다");
    }
    if (data.editLines.length > PUBLISH_IMAGE_LIMIT) {
      throw new QueueInputError(`editLines는 최대 ${PUBLISH_IMAGE_LIMIT}장까지 저장할 수 있습니다`);
    }
    const longLineIndex = data.editLines.findIndex((line) => line.length > QUEUE_CARD_TEXT_MAX_CHARS);
    if (longLineIndex >= 0) {
      throw new QueueInputError(`editLines ${longLineIndex + 1}번째 문구는 최대 ${QUEUE_CARD_TEXT_MAX_CHARS}자입니다`);
    }
    editLines = data.editLines as string[];
  }

  let cardTextPositions: string[] | undefined;
  if (Object.prototype.hasOwnProperty.call(data, "cardTextPositions") && data.cardTextPositions !== null) {
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
  if (Object.prototype.hasOwnProperty.call(data, "editFormat") && data.editFormat !== null) {
    const validation = validateContentEditFormat(data.editFormat);
    if (!validation.valid) {
      throw new QueueInputError(validation.issues.map((issue) => issue.message).join("; "));
    }
    editFormat = validation.value;
  }
  return { editLines, cardTextPositions, editFormat };
}

export async function POST(request: Request) {
  const data = await request.json().catch(() => ({}));
  const __t = await effectiveTenantId(request, data.tenant_id ?? null);
  return runWithTenant(__t, async () => {
    try {
      const cardEdit = validateCardEditFields(data);
      const result = await addQueuePost(__t, {
        text: typeof data.text === "string" ? data.text : "",
        draftId: typeof data.draftId === "string" ? data.draftId : null,
        topic: data.topic,
        hashtags: data.hashtags,
        imageUrl: data.imageUrl,
        imageUrls: data.imageUrls,
        textEmbedded: data.textEmbedded === true,
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
