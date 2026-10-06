export const CHAT_TONE_IDS = ["learned", "warm", "short", "honorific"] as const;
export type ChatToneId = typeof CHAT_TONE_IDS[number];

export type ChatToneCandidate = {
  id: string;
  label: string;
  lines: string[];
  fact_warnings: string[];
};

const NUMBER_OR_UNIT = /\d+(?:[.,]\d+)*(?:%|개|명|시간|분|초|일|주|개월|년|원|등급|점)?/g;
const LATIN_NAME = /\b[A-Z][A-Za-z0-9_-]{1,}\b/g;
const QUOTED_FACT = /["'“‘]([^"'”’]{2,40})["'”’]/g;

function factTokens(text: string): string[] {
  const quoted = Array.from(text.matchAll(QUOTED_FACT), (match) => match[1]);
  return [...new Set([...(text.match(NUMBER_OR_UNIT) ?? []), ...(text.match(LATIN_NAME) ?? []), ...quoted])];
}

export function changedFactWarnings(originals: string[], candidates: string[]): string[] {
  const before = new Set(originals.flatMap(factTokens));
  const after = new Set(candidates.flatMap(factTokens));
  const removed = [...before].filter((token) => !after.has(token));
  const added = [...after].filter((token) => !before.has(token));
  const warnings: string[] = [];
  if (removed.length) warnings.push(`원문에서 빠진 숫자·고유명사: ${removed.join(", ")}`);
  if (added.length) warnings.push(`후보에 새로 생긴 숫자·고유명사: ${added.join(", ")}`);
  return warnings;
}

export function parseChatToneSuggestionResponse(raw: string, originals: string[]): ChatToneCandidate[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("CHAT_TONE_RESPONSE_INVALID");
  const value = JSON.parse(match[0]) as { candidates?: unknown };
  if (!Array.isArray(value.candidates) || value.candidates.length !== 3) {
    throw new Error("CHAT_TONE_CANDIDATE_COUNT");
  }
  const ids = new Set<string>();
  return value.candidates.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("CHAT_TONE_CANDIDATE_INVALID");
    const candidate = entry as Record<string, unknown>;
    const id = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : `candidate-${index + 1}`;
    const label = typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : `후보 ${index + 1}`;
    const lines = Array.isArray(candidate.lines) ? candidate.lines.map((line) => String(line ?? "")) : null;
    if (!lines || lines.length !== originals.length || lines.some((line) => !line.trim())) {
      throw new Error("CHAT_TONE_LINE_COUNT");
    }
    if (ids.has(id)) throw new Error("CHAT_TONE_DUPLICATE_ID");
    ids.add(id);
    return { id, label, lines, fact_warnings: changedFactWarnings(originals, lines) };
  });
}

export function chatTonePrompt(lines: string[], tone: ChatToneId): string {
  const toneInstruction: Record<ChatToneId, string> = {
    learned: "브랜드가 기존에 학습한 전문가 말투처럼 또렷하게",
    warm: "뜻은 유지하면서 더 친근하고 따뜻하게",
    short: "핵심 사실을 유지하면서 더 짧게",
    honorific: "반말은 존댓말로, 존댓말은 자연스러운 반말로",
  };
  return [
    "카톡 대화 말풍선을 다듬는 후보를 정확히 3개 만드세요.",
    `방향: ${toneInstruction[tone]}`,
    "각 후보는 받은 줄 수와 순서를 그대로 유지하세요.",
    "숫자, 단위, 이름, 고유명사, 인용문과 사실을 바꾸지 마세요.",
    "설명과 코드 펜스 없이 JSON 객체 하나만 반환하세요.",
    '형식: {"candidates":[{"id":"a","label":"후보 1","lines":["..."]},{"id":"b","label":"후보 2","lines":["..."]},{"id":"c","label":"후보 3","lines":["..."]}]}',
    `원문: ${JSON.stringify(lines)}`,
  ].join("\n");
}
