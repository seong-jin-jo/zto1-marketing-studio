// 게시 본문 길이의 단일 진실원(SSOT).
// 플랫폼마다 공식 한도가 다르므로 숫자를 억지로 통일하지 않는다. 생성 프롬프트·검증·UI·
// 외부 발행 경계가 모두 이 모듈을 참조해 같은 제한과 근거를 보여준다.
export const CHANNEL_TEXT_LIMITS = {
  x: 280,
  threads: 500,
  instagram: 2_200,
  linkedin: 3_000,
  bluesky: 300,
  pinterest: 500,
  tumblr: 4_096,
  telegram: 4_096,
  telegramCaption: 1_024,
  discord: 2_000,
  slack: 3_000,
} as const;

// 각 숫자의 공식 문서. Meta 문서는 비로그인 환경에서 본문 열람이 제한될 수 있지만 URL 자체는
// 공식 API reference다. X는 단순 UTF-16 length가 아닌 weighted count라는 점도 해당 문서에 명시된다.
export const CHANNEL_TEXT_LIMIT_SOURCES = {
  x: "https://docs.x.com/fundamentals/counting-characters",
  threads: "https://developers.facebook.com/docs/threads/posts/",
  instagram: "https://developers.facebook.com/docs/instagram-platform/content-publishing/",
  linkedin: "https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api",
  bluesky: "https://docs.bsky.app/docs/advanced-guides/intent-links",
  pinterest: "https://developers.pinterest.com/docs/api/v5/pins-create/",
  tumblr: "https://www.tumblr.com/docs/en/api/v2",
  telegram: "https://core.telegram.org/bots/api#sendmessage",
  telegramCaption: "https://core.telegram.org/bots/api#sendphoto",
  discord: "https://docs.discord.com/developers/resources/webhook#execute-webhook",
  slack: "https://docs.slack.dev/reference/block-kit/blocks/section-block",
} as const satisfies Record<keyof typeof CHANNEL_TEXT_LIMITS, string>;

export type ChannelTextLimitKey = keyof typeof CHANNEL_TEXT_LIMITS;

export function channelTextLimit(channel: string): number | undefined {
  return CHANNEL_TEXT_LIMITS[channel as ChannelTextLimitKey];
}

export function countTextCharacters(text: string): number {
  return [...(text ?? "")].length;
}
