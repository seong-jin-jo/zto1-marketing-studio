/** 서버와 클라이언트가 공유하는 학습 정보 정제 계약. */
const ALLOWED_KEYS = new Set([
  "industry", "business", "audience", "voice", "purpose", "forbidden", "palette", "rights", "learnedRules",
]);
const MAX_VALUE_LENGTH = 2_000;

export function sanitizeLearningInfo(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key) || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const normalizedKey = key === "business" ? "industry" : key;
    if (key === "business" && out.industry) continue;
    out[normalizedKey] = trimmed.slice(0, MAX_VALUE_LENGTH);
  }
  return out;
}
