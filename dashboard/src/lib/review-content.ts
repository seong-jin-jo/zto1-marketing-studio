export type MissingReviewField = "body" | "title";

const INVISIBLE_FORMAT_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/g;

export function normalizeReviewText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(INVISIBLE_FORMAT_CHARACTERS, "").trim();
}

export function missingReviewFields(
  content: { text?: unknown; title?: unknown } | null | undefined,
): MissingReviewField[] {
  if (!content) return ["body"];

  const missing: MissingReviewField[] = [];
  if (!normalizeReviewText(content.text)) missing.push("body");

  const hasTitleField = Object.prototype.hasOwnProperty.call(content, "title");
  if (hasTitleField && !normalizeReviewText(content.title)) missing.push("title");

  return missing;
}
