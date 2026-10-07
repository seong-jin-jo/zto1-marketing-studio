import type { ExportKind } from "./export-contract";

type EditorKind = "text" | "image" | "video" | "card" | "audio" | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Only drafts that have entered the durable export format use the S4 export
 * queue. Older card, chat-bubble, AI-image, and unedited-video drafts retain
 * the pre-S4 publish-room path.
 */
export function exportKindForDraftState(kind: EditorKind, state: {
  [key: string]: unknown;
}): ExportKind | null {
  if (kind === "card" && isRecord(state.cardDeckV3)) return "card_deck";
  if (kind === "video" && isRecord(state.videoEdit)) return "video";
  return null;
}
