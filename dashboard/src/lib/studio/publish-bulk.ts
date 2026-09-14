// 발행실 대화창이 "일곱 곳을 한 번에" 대행할 때 쓰는 순수 함수 모음.
//
// 왜 따로 두나. 발행실 대화창의 값어치는 말솜씨가 아니라 "손으로 하면 일곱 번인 일을 한 번에
// 끝내는 것"이다(구조질문 문서 질문3 승인안). 그 한 번이 무엇을 어떻게 바꾸는지는 화면과
// 무관한 규칙이므로 여기 모아 두고 시험으로 고정한다. 화면은 이 결과를 붙이기만 한다.

import { CHANNEL_TEXT_LIMITS, countTextCharacters } from "@/lib/channel-text-limits";

/** 발행실 미리보기가 다루는 일곱 자리. PlatformPreview의 키와 같다. */
export type BulkPlatform = "threads" | "x" | "facebook" | "instagram" | "shorts" | "reels" | "tiktok";

/**
 * 플랫폼마다 해시태그 관습이 다르다. 고객이 이 숫자를 외울 이유가 없으므로 대화창이 대신 맞춘다.
 * 근거는 각 플랫폼 공식 안내와 통용 관습이고, 숫자를 억지로 통일하지 않는다.
 *  - X는 본문 한도가 280자라 태그를 많이 달면 본문이 잘린다.
 *  - Instagram은 최대 30개까지 허용하지만 실제로는 앞 3개가 노출을 좌우한다.
 *  - 세로 영상 세 곳은 설명란이 짧게 접혀 3개가 상한이다.
 */
export const HASHTAG_BUDGET: Record<BulkPlatform, number> = {
  threads: 5,
  x: 2,
  facebook: 3,
  instagram: 3,
  shorts: 3,
  reels: 3,
  tiktok: 3,
};

/** "#OSMU, 콘텐츠 #자동화" 같은 아무 표기나 받아 태그 낱말만 뽑는다. */
export function parseHashtags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const chunk of (raw ?? "").split(/[\s,]+/)) {
    const tag = chunk.replace(/^#+/, "").trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

/** 한 벌의 태그를 그 플랫폼 관습에 맞게 잘라 표시 문자열로 만든다. */
export function hashtagsForPlatform(tags: string[], platform: BulkPlatform): string {
  return tags.slice(0, HASHTAG_BUDGET[platform]).map((tag) => `#${tag}`).join(" ");
}

/** 태그 한 벌을 일곱 자리 전부에 규격대로 나눠 붙인다. */
export function spreadHashtags(raw: string, platforms: readonly BulkPlatform[]): Record<string, string> {
  const tags = parseHashtags(raw);
  return Object.fromEntries(platforms.map((platform) => [platform, hashtagsForPlatform(tags, platform)]));
}

/**
 * 한도를 넘긴 곳만 줄인다. 넘지 않은 곳은 손대지 않는다.
 * 잘렸다는 사실이 화면에서 보이도록 줄임표를 남긴다.
 */
export function trimOverLimit(body: string, platform: BulkPlatform): string | null {
  const limit = CHANNEL_TEXT_LIMITS[platform as keyof typeof CHANNEL_TEXT_LIMITS];
  if (typeof limit !== "number") return null;
  if (countTextCharacters(body) <= limit) return null;
  return `${[...body].slice(0, Math.max(0, limit - 1)).join("")}…`;
}

/** 한도를 넘긴 자리와 줄인 결과만 모아 돌려준다. 바뀌는 곳이 없으면 빈 객체다. */
export function trimAllOverLimit(
  bodyOf: (platform: BulkPlatform) => string,
  platforms: readonly BulkPlatform[],
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const platform of platforms) {
    const trimmed = trimOverLimit(bodyOf(platform), platform);
    if (trimmed !== null) next[platform] = trimmed;
  }
  return next;
}

export type PublishCommand =
  | { kind: "selectAll" }
  | { kind: "clearAll" }
  | { kind: "exclude"; platform: BulkPlatform }
  | { kind: "onlyOne"; platform: BulkPlatform }
  | { kind: "unifyHashtags" }
  | { kind: "trimOverLimit" }
  | { kind: "schedule" }
  | { kind: "requestReview" }
  | { kind: "saveDraft" }
  | { kind: "publishNow" }
  | { kind: "unknown" };

const PLATFORM_WORDS: { platform: BulkPlatform; words: string[] }[] = [
  { platform: "threads", words: ["스레드", "threads"] },
  { platform: "x", words: ["엑스", "트위터", "twitter"] },
  { platform: "facebook", words: ["페이스북", "페북", "facebook"] },
  { platform: "instagram", words: ["인스타그램", "인스타", "instagram"] },
  { platform: "shorts", words: ["쇼츠", "shorts", "유튜브"] },
  { platform: "reels", words: ["릴스", "reels"] },
  { platform: "tiktok", words: ["틱톡", "tiktok"] },
];

function findPlatform(text: string): BulkPlatform | null {
  const lower = text.toLowerCase();
  // "x"는 한 글자라 아무 문장에나 걸린다. 낱말 경계로만 인정한다.
  for (const entry of PLATFORM_WORDS) {
    if (entry.words.some((word) => lower.includes(word))) return entry.platform;
  }
  if (/(^|[\s"'([{])x([\s"')\]}]|$|만|는|를|은|이|도)/.test(lower)) return "x";
  return null;
}

/**
 * 발행실 대화창의 자유 입력을 한 가지 실행으로 옮긴다.
 * 말만 하고 화면이 안 바뀌면 그 자리에서 들통나므로, 알아듣지 못한 말은 unknown으로 정직하게 돌려준다.
 */
export function parsePublishCommand(raw: string): PublishCommand {
  const text = (raw ?? "").trim();
  if (!text) return { kind: "unknown" };
  const platform = findPlatform(text);

  if (/(빼|제외|말고|except)/.test(text) && platform) return { kind: "exclude", platform };
  if (/(만)\s*(올|발행|게시)/.test(text) && platform) return { kind: "onlyOne", platform };
  if (/(전부|전체|모두|다)\s*(해제|끄|빼)/.test(text)) return { kind: "clearAll" };
  if (/(전부|전체|모두|일곱|7곳|다)/.test(text) && /(선택|올|발행|켜|고르)/.test(text)) return { kind: "selectAll" };
  if (/해시태그|태그/.test(text)) return { kind: "unifyHashtags" };
  if (/(길이|한도|글자|넘)/.test(text) && /(줄|맞|자르)/.test(text)) return { kind: "trimOverLimit" };
  if (/예약|시간|일정|내일|시로/.test(text)) return { kind: "schedule" };
  if (/검토|승인\s*인박스/.test(text)) return { kind: "requestReview" };
  if (/임시\s*저장|초안/.test(text)) return { kind: "saveDraft" };
  if (/발행|게시|올려|올리/.test(text)) return { kind: "publishNow" };
  return { kind: "unknown" };
}
