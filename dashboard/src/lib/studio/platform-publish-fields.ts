import twitterText from "twitter-text";

export type PublishPlatform = "threads" | "x" | "facebook" | "instagram" | "shorts" | "reels" | "tiktok";

export type PlatformPublishInput = {
  title?: string;
  body?: string;
  hashtags?: string;
  topicTag?: string;
};

export type PublishFieldKey = "title" | "body" | "hashtags" | "topicTag";

export type PublishValidationIssue = {
  field: PublishFieldKey;
  message: string;
};

export type PlatformPublishValidation = {
  blocking: PublishValidationIssue[];
  warnings: PublishValidationIssue[];
  counters: Partial<Record<PublishFieldKey, { current: number; limit: number; unit: string }>>;
};

export type PlatformFieldContract = {
  bodyLabel: string;
  title: boolean;
  hashtags: boolean;
  topicTag: boolean;
  firstComment: boolean;
  unknownLimitLabel?: string;
};

export const PLATFORM_FIELD_CONTRACT: Record<PublishPlatform, PlatformFieldContract> = {
  threads: { bodyLabel: "본문", title: false, hashtags: false, topicTag: true, firstComment: true },
  x: { bodyLabel: "본문", title: false, hashtags: true, topicTag: false, firstComment: false },
  facebook: {
    bodyLabel: "게시물 본문",
    title: false,
    hashtags: true,
    topicTag: false,
    firstComment: true,
    unknownLimitLabel: "본문 상한은 규격 확인 필요",
  },
  instagram: { bodyLabel: "캡션", title: false, hashtags: true, topicTag: false, firstComment: true },
  shorts: { bodyLabel: "설명", title: true, hashtags: true, topicTag: false, firstComment: false },
  reels: { bodyLabel: "캡션", title: false, hashtags: true, topicTag: false, firstComment: true },
  tiktok: { bodyLabel: "캡션", title: false, hashtags: true, topicTag: false, firstComment: false },
};

export function parseHashtagTokens(raw: string): string[] {
  return (raw ?? "")
    .split(/[\s,]+/)
    .map((value) => value.replace(/^#+/, "").trim())
    .filter(Boolean);
}

function textAndHashtags(input: PlatformPublishInput): string {
  return [input.body?.trim(), input.hashtags?.trim()].filter(Boolean).join("\n\n");
}

function codePointLength(value: string): number {
  return [...(value ?? "")].length;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value ?? "").length;
}

function utf16UnitLength(value: string): number {
  return (value ?? "").length;
}

function pushHardLimit(
  target: PlatformPublishValidation,
  field: PublishFieldKey,
  current: number,
  limit: number,
  unit: string,
  label: string,
) {
  target.counters[field] = { current, limit, unit };
  if (current > limit) {
    target.blocking.push({ field, message: `${label}이 ${limit}${unit}를 초과했습니다. 현재 ${current}${unit}입니다.` });
  }
}

export function validatePlatformPublish(
  platform: PublishPlatform,
  input: PlatformPublishInput,
): PlatformPublishValidation {
  const result: PlatformPublishValidation = { blocking: [], warnings: [], counters: {} };
  const combined = textAndHashtags(input);
  const hashtagCount = parseHashtagTokens(input.hashtags ?? "").length;

  if (platform === "threads") {
    pushHardLimit(result, "body", codePointLength(input.body ?? ""), 500, "자", "본문");
    const topicTag = (input.topicTag ?? "").trim().replace(/^#/, "");
    if (topicTag) {
      pushHardLimit(result, "topicTag", codePointLength(topicTag), 50, "자", "주제 태그");
      if (/[.&]/.test(topicTag)) {
        result.blocking.push({ field: "topicTag", message: "주제 태그에는 마침표와 앰퍼샌드를 사용할 수 없습니다." });
      }
    }
  } else if (platform === "x") {
    const parsed = twitterText.parseTweet(combined);
    result.counters.body = { current: parsed.weightedLength, limit: 280, unit: "가중 문자" };
    if (!parsed.valid || parsed.weightedLength > 280) {
      result.blocking.push({ field: "body", message: `본문과 해시태그가 280가중 문자를 초과했습니다. 현재 ${parsed.weightedLength}가중 문자입니다.` });
    }
    if (hashtagCount > 2) {
      result.warnings.push({ field: "hashtags", message: "해시태그는 2개 이하 사용을 권장합니다." });
    }
  } else if (platform === "instagram" || platform === "reels") {
    pushHardLimit(result, "body", codePointLength(combined), 2_200, "자", "캡션과 해시태그");
    if (hashtagCount > 30) {
      result.blocking.push({ field: "hashtags", message: `해시태그는 30개까지 입력할 수 있습니다. 현재 ${hashtagCount}개입니다.` });
    }
  } else if (platform === "shorts") {
    pushHardLimit(result, "title", codePointLength(input.title ?? ""), 100, "자", "제목");
    pushHardLimit(result, "body", utf8ByteLength(combined), 5_000, "바이트", "설명과 해시태그");
    if (hashtagCount > 60) {
      result.warnings.push({ field: "hashtags", message: "해시태그가 60개를 넘으면 모든 해시태그가 무시될 수 있습니다." });
    }
  } else if (platform === "tiktok") {
    pushHardLimit(result, "body", utf16UnitLength(combined), 2_200, "UTF-16 단위", "캡션과 해시태그");
  }

  return result;
}

export function buildPlatformPublishText(platform: PublishPlatform, input: PlatformPublishInput): string {
  if (platform === "shorts") {
    return [input.title?.trim(), textAndHashtags(input)].filter(Boolean).join("\n\n");
  }
  return textAndHashtags(input);
}
