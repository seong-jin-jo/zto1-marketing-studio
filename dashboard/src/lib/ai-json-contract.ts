type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: JsonRecord, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown, min: number, max: number): value is string[] {
  return Array.isArray(value)
    && value.length >= min
    && value.length <= max
    && value.every(nonEmptyString);
}

/** 외부 모델 응답은 JSON 객체 하나만 허용한다. 설명문과 임의 추가 키는 성공 계약이 아니다. */
export function parseAiJsonObject(raw: string): JsonRecord | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    const parsed: unknown = JSON.parse(candidate);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseGuideOutput(raw: string): { guide: string } | null {
  const value = parseAiJsonObject(raw);
  if (!value || !hasOnlyKeys(value, ["guide"]) || !nonEmptyString(value.guide)) return null;
  return { guide: value.guide };
}

export function parseKeywordsOutput(raw: string): { keywords: string[] } | null {
  const value = parseAiJsonObject(raw);
  if (!value || !hasOnlyKeys(value, ["keywords"]) || !stringArray(value.keywords, 1, 50)) return null;
  return { keywords: value.keywords };
}

export function parseCardOutlineOutput(raw: string): { slides: string[]; caption: string; hashtags: string[] } | null {
  const value = parseAiJsonObject(raw);
  if (!value || !hasOnlyKeys(value, ["slides", "caption", "hashtags"])) return null;
  if (!stringArray(value.slides, 1, 10) || !nonEmptyString(value.caption) || !stringArray(value.hashtags, 0, 30)) return null;
  return { slides: value.slides, caption: value.caption, hashtags: value.hashtags };
}
