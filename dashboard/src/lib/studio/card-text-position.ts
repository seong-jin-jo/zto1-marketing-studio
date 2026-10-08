export const CARD_TEXT_POSITIONS = [
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
] as const;

export type CardTextPosition = typeof CARD_TEXT_POSITIONS[number];

const CARD_TEXT_POSITION_SET = new Set<string>(CARD_TEXT_POSITIONS);

export function isCardTextPosition(value: unknown): value is CardTextPosition {
  return typeof value === "string" && CARD_TEXT_POSITION_SET.has(value);
}

export function validateCardTextPositions(value: unknown): value is CardTextPosition[] {
  return Array.isArray(value) && value.length <= 11 && value.every(isCardTextPosition);
}

export function normalizeCardTextPositions(value: unknown): CardTextPosition[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 11).map((position) => isCardTextPosition(position) ? position : "center");
}
