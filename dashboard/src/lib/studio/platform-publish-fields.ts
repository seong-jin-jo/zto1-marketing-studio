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

/**
 * 본문을 그 채널의 한도 안으로 줄인다. 무엇으로 재는지는 채널마다 다르다.
 * X 는 본문과 해시태그를 합쳐 가중 문자로 재고, 인스타그램은 글자수, 쇼츠는 바이트다.
 *
 * 2026-09-07 회장 계정 실측: 발행실의 "한도 넘는 곳만 줄이기" 가 X 를 전혀 못 줄였다.
 * 줄이는 쪽은 본문만 코드포인트로 세어 279자로 잘랐는데, 막는 쪽은 본문에 해시태그를
 * 더해 가중 문자로 쟀다. 한글은 가중치가 2라서 279자는 언제나 558가중 문자다.
 * 즉 이 단추를 몇 번을 눌러도 발행은 계속 막혔다. 화면이 약속한 일을 못 하는 것이
 * 조용한 실패보다 나쁘다(ADR-007). 그래서 자르는 잣대를 막는 잣대와 같게 만든다.
 *
 * 해시태그만으로 이미 한도를 넘으면 본문을 다 지워도 통과하지 못한다. 그때는 빈 본문을
 * 돌려주고 판정은 검증기에 맡긴다. 여기서 해시태그까지 손대면 사용자가 고른 것을
 * 말없이 바꾸는 셈이라 그건 사용자 몫으로 남긴다.
 */
export function trimBodyToFit(
  platform: PublishPlatform,
  input: PlatformPublishInput,
): string | null {
  const body = input.body ?? "";
  const fits = (candidate: string): boolean =>
    !validatePlatformPublish(platform, { ...input, body: candidate })
      .blocking.some((issue) => issue.field === "body");
  if (fits(body)) return null;
  const chars = [...body];
  // 말줄임표 한 글자를 붙인 상태로 재야 실제 발행되는 문자열과 같은 길이가 된다.
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(`${chars.slice(0, mid).join("")}…`)) low = mid;
    else high = mid - 1;
  }
  return low > 0 ? `${chars.slice(0, low).join("")}…` : "";
}
