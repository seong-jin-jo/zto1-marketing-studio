import { z } from "zod";
import { CHANNEL_TEXT_LIMITS, countTextCharacters } from "@/lib/channel-text-limits";

export const TEXT_CANDIDATE_ANGLES = ["question", "number", "pain"] as const;
export type TextCandidateAngle = (typeof TEXT_CANDIDATE_ANGLES)[number];

const textVariantsSchema = z.strictObject({
  threads: z.string().min(1),
  facebook: z.string().min(1),
  x: z.string().min(1),
  instagram: z.strictObject({
    caption: z.string().min(1),
    hashtags: z.array(z.string()).default([]),
    slides: z.array(z.string()).default([]),
  }),
  shorts: z.strictObject({
    hook: z.string(),
    body: z.string(),
    cta: z.string(),
  }).optional(),
  image_prompt: z.string().optional(),
});

const generatedCandidateSchema = z.strictObject({
  id: z.enum(TEXT_CANDIDATE_ANGLES),
  label: z.string().min(1).max(30),
  recommended: z.boolean(),
  recommendation_reason: z.string().min(1).max(200),
  content: textVariantsSchema,
});

export const generatedTextCandidateListSchema = z.array(generatedCandidateSchema)
  .length(3)
  .superRefine((candidates, context) => {
    const ids = new Set(candidates.map((candidate) => candidate.id));
    if (ids.size !== TEXT_CANDIDATE_ANGLES.length || TEXT_CANDIDATE_ANGLES.some((id) => !ids.has(id))) {
      context.addIssue({ code: "custom", message: "질문형·숫자형·고통 인식형 후보가 각각 하나씩 필요합니다" });
    }
    if (candidates.filter((candidate) => candidate.recommended).length !== 1) {
      context.addIssue({ code: "custom", message: "추천 후보는 정확히 하나여야 합니다" });
    }
  });

export type TextCandidateContent = z.infer<typeof textVariantsSchema>;
export type GeneratedTextCandidate = z.infer<typeof generatedCandidateSchema>;

export interface TextCandidateWarning {
  code: "fact_mismatch" | "length_overflow";
  channel: "threads" | "facebook" | "x" | "instagram";
  message: string;
  terms?: string[];
  overflow?: number;
}

export interface TextCandidate extends GeneratedTextCandidate {
  warnings: TextCandidateWarning[];
}

const CHANNELS = ["threads", "facebook", "x", "instagram"] as const;

function channelText(candidate: GeneratedTextCandidate, channel: (typeof CHANNELS)[number]): string {
  return channel === "instagram" ? candidate.content.instagram.caption : candidate.content[channel];
}

function sourceFacts(source: string): Set<string> {
  return new Set([
    ...(source.match(/\d+(?:[.,]\d+)*(?:일|명|개|회|년|월|%|원)?/g) ?? []),
    ...(source.match(/[A-Z][A-Za-z0-9._-]{1,}/g) ?? []),
  ]);
}

function candidateFacts(text: string): string[] {
  return [...new Set([
    ...(text.match(/\d+(?:[.,]\d+)*(?:일|명|개|회|년|월|%|원)?/g) ?? []),
    ...(text.match(/[A-Z][A-Za-z0-9._-]{1,}/g) ?? []),
  ])];
}

/**
 * 생성기가 낸 경고를 신뢰하지 않고 서버가 원문과 결과를 다시 비교한다.
 * 한국어 고유명사 자동 판별은 오탐이 커서 숫자와 라틴 고유명사만 차단 가능한 경고로 둔다.
 */
export function evaluateTextCandidates(value: unknown, source: string): TextCandidate[] {
  const candidates = generatedTextCandidateListSchema.parse(value);
  const facts = sourceFacts(source);
  return candidates.map((candidate) => {
    const warnings: TextCandidateWarning[] = [];
    for (const channel of CHANNELS) {
      const text = channelText(candidate, channel);
      const unknownFacts = candidateFacts(text).filter((fact) => !facts.has(fact));
      if (unknownFacts.length) {
        warnings.push({
          code: "fact_mismatch",
          channel,
          terms: unknownFacts,
          message: `원문과 다른 사실: ${unknownFacts.join(", ")}`,
        });
      }
      const limit = channel === "facebook" ? undefined : CHANNEL_TEXT_LIMITS[channel];
      const count = countTextCharacters(text);
      if (limit && count > limit) {
        warnings.push({
          code: "length_overflow",
          channel,
          overflow: count - limit,
          message: `${channel === "instagram" ? "Instagram" : channel === "threads" ? "Threads" : "X"} ${count - limit}자 넘침`,
        });
      }
    }
    return { ...candidate, recommended: candidate.recommended && !warnings.some((warning) => warning.code === "fact_mismatch"), warnings };
  });
}

export function recommendedTextCandidate(candidates: readonly TextCandidate[]): TextCandidate {
  return candidates.find((candidate) => candidate.recommended && !candidate.warnings.some((warning) => warning.code === "fact_mismatch"))
    ?? candidates.find((candidate) => !candidate.warnings.some((warning) => warning.code === "fact_mismatch"))
    ?? candidates[0];
}
