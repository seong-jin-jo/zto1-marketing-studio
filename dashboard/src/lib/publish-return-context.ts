import {
  validateContentEditFormat,
  type ContentEditFormat,
} from "@/lib/studio/content-edit-format";

export type PublishReturnSource = "inbox" | "calendar";

export interface PublishReturnContext {
  sourceRoute: PublishReturnSource;
  queuePostId: string;
  draftId: string | null;
  textEmbedded: boolean;
  returnUrl: string;
}

export interface PublishReturnRequest {
  sourceRoute: PublishReturnSource;
  queuePostId: string;
  draftId: string | null;
  textEmbedded?: boolean;
}

export interface PublishReturnWork {
  queuePostId: string;
  draftId: string | null;
  idea: string;
  body: string;
  hashtags: string[];
  imageUrl: string | null;
  imageUrls: string[];
  textEmbedded: boolean;
  editLines: string[];
  cardTextPositions: string[];
  editFormat: ContentEditFormat | null;
  cardSourceRestorable: boolean;
  videoUrl: string | null;
  includedPlatforms: string[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function linkedDraftId(post: Record<string, unknown>): string | null {
  const direct = nonEmptyText(post.draftId) ?? nonEmptyText(post.draft_id);
  if (direct) return direct;
  return nonEmptyText(record(post.sourceContext)?.draftId)
    ?? nonEmptyText(record(post.publishContext)?.draftId);
}

export type PublishReturnDraftResolution =
  | { ok: true; draftId: string | null }
  | { ok: false; code: "PUBLISH_RETURN_DRAFT_MISMATCH" };

export function resolvePublishReturnDraftId(
  request: PublishReturnRequest,
  post: Record<string, unknown>,
): PublishReturnDraftResolution {
  const queueDraftId = linkedDraftId(post);
  if (request.draftId && request.draftId !== queueDraftId) {
    return { ok: false, code: "PUBLISH_RETURN_DRAFT_MISMATCH" };
  }
  return { ok: true, draftId: queueDraftId };
}

export function isPublishReturnSource(value: string | null): value is PublishReturnSource {
  return value === "inbox" || value === "calendar";
}

export function buildPublishReturnContext(
  post: Record<string, unknown>,
  sourceRoute: PublishReturnSource,
): PublishReturnContext | null {
  if (typeof post.id !== "string" || !post.id) return null;
  const draftId = linkedDraftId(post);
  const params = new URLSearchParams({ room: "publish", queue_id: post.id, from: sourceRoute });
  if (draftId) params.set("draft_id", draftId);
  const textEmbedded = post.textEmbedded === true;
  if (textEmbedded) params.set("text_embedded", "1");
  return {
    sourceRoute,
    queuePostId: post.id,
    draftId,
    textEmbedded,
    returnUrl: `/studio?${params.toString()}`,
  };
}

export function readPublishReturnRequest(search: string): PublishReturnRequest | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const source = params.get("from");
  const queuePostId = nonEmptyText(params.get("queue_id"));
  if (!isPublishReturnSource(source) || !queuePostId) return null;
  return {
    sourceRoute: source,
    queuePostId,
    draftId: nonEmptyText(params.get("draft_id")),
    textEmbedded: params.get("text_embedded") === "1",
  };
}

export function buildPublishReturnWork(post: Record<string, unknown>): PublishReturnWork | null {
  const queuePostId = nonEmptyText(post.id);
  const body = nonEmptyText(post.text);
  if (!queuePostId || !body) return null;
  const channels = record(post.channels);
  const includedPlatforms = channels
    ? Object.entries(channels).filter(([, value]) => {
      if (value === false) return false;
      const state = record(value)?.status;
      return state !== "skipped";
    }).map(([platform]) => platform)
    : [];
  const imageUrls = Array.isArray(post.imageUrls)
    ? post.imageUrls.map(nonEmptyText).filter((value): value is string => Boolean(value))
    : [];
  const editLines = Array.isArray(post.editLines)
    ? post.editLines.filter((value): value is string => typeof value === "string")
    : [];
  const cardTextPositions = Array.isArray(post.cardTextPositions)
    ? post.cardTextPositions.filter((value): value is string => typeof value === "string")
    : [];
  const formatValidation = validateContentEditFormat(post.editFormat);
  const editFormat = formatValidation.valid ? formatValidation.value : null;
  const textEmbedded = post.textEmbedded === true;
  const cardSourceRestorable = textEmbedded
    && imageUrls.length > 0
    && editLines.length === imageUrls.length
    && editLines.every((line) => line.trim().length > 0)
    && Array.isArray(post.cardTextPositions)
    && (cardTextPositions.length === 0 || cardTextPositions.length === imageUrls.length)
    && editFormat?.kind === "card";
  return {
    queuePostId,
    draftId: linkedDraftId(post),
    idea: nonEmptyText(post.topic) ?? "불러온 작업물",
    body,
    hashtags: Array.isArray(post.hashtags)
      ? post.hashtags.map(nonEmptyText).filter((value): value is string => Boolean(value))
      : [],
    imageUrl: nonEmptyText(post.imageUrl),
    imageUrls,
    // 구형 큐는 일반 배경 이미지와 글자 내장 이미지를 구분할 출처가 없다. URL 수만으로
    // 추측하면 일반 카드의 편집 기능을 없애므로, 명시 표식이 있는 신규 큐만 true다.
    textEmbedded,
    editLines,
    cardTextPositions,
    editFormat,
    cardSourceRestorable,
    videoUrl: nonEmptyText(post.videoUrl) ?? nonEmptyText(post.videoFilename),
    includedPlatforms,
  };
}
