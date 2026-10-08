export const CARD_TEXT_POSITIONS = [
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
] as const;

export type CardTextPosition = typeof CARD_TEXT_POSITIONS[number];

export interface LegacyCardTextOffset {
  x: number;
  y: number;
}

export type PersistedCardTextPosition = CardTextPosition | LegacyCardTextOffset;

const CARD_TEXT_POSITION_SET = new Set<string>(CARD_TEXT_POSITIONS);

export function isCardTextPosition(value: unknown): value is CardTextPosition {
  return typeof value === "string" && CARD_TEXT_POSITION_SET.has(value);
}

export function isLegacyCardTextOffset(value: unknown): value is LegacyCardTextOffset {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { x?: unknown; y?: unknown };
  return typeof candidate.x === "number"
    && Number.isFinite(candidate.x)
    && typeof candidate.y === "number"
    && Number.isFinite(candidate.y);
}

export function validateCardTextPositions(value: unknown): value is CardTextPosition[] {
  return Array.isArray(value) && value.length <= 11 && value.every(isCardTextPosition);
}

/** API 영속 계약은 직접 편집 문자열과 구버전 {x,y} 좌표를 모두 보존한다. */
export function validatePersistedCardTextPositions(value: unknown): value is PersistedCardTextPosition[] {
  return Array.isArray(value)
    && value.length <= 11
    && value.every((position) => isCardTextPosition(position) || isLegacyCardTextOffset(position));
}

export function sanitizePersistedCardTextPositions(value: unknown): PersistedCardTextPosition[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 11).map((position) => {
    if (isCardTextPosition(position) || isLegacyCardTextOffset(position)) return position;
    return "center";
  });
}

/** 현재 직접 편집 UI는 9칸 문자열 위치만 사용한다. 구버전 좌표는 안전한 중앙으로 승격한다. */
export function normalizeCardTextPositions(value: unknown): CardTextPosition[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 11).map((position) => isCardTextPosition(position) ? position : "center");
}
