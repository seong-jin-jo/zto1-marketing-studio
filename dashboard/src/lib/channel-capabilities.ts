export const BASE_CHANNEL_TABS = ["queue", "analytics", "growth", "popular", "settings"] as const;
export const SPECIAL_CHANNEL_TABS = ["editor"] as const;

export type BaseChannelTab = (typeof BASE_CHANNEL_TABS)[number];
export type SpecialChannelTab = (typeof SPECIAL_CHANNEL_TABS)[number];
export type ChannelTab = BaseChannelTab | SpecialChannelTab;

export interface ChannelCapability {
  tabs: readonly BaseChannelTab[];
  specialTabs: readonly SpecialChannelTab[];
  disabledTabs: readonly BaseChannelTab[];
  removedTabs: readonly BaseChannelTab[];
  engagement: EngagementCapability;
}

export type EngagementAction = "read" | "reply" | "like" | "defer" | "editorHandoff";

export interface EngagementActionCapability {
  supported: boolean;
  reason: string | null;
}

export type EngagementCapability = Record<EngagementAction, EngagementActionCapability>;

function engagementCapability(
  supported: readonly EngagementAction[],
  reason: string,
  actionReasons: Partial<Record<EngagementAction, string>> = {},
): EngagementCapability {
  const enabled = new Set(supported);
  return Object.fromEntries(
    (["read", "reply", "like", "defer", "editorHandoff"] as const).map((action) => [
      action,
      { supported: enabled.has(action), reason: enabled.has(action) ? null : actionReasons[action] ?? reason },
    ]),
  ) as EngagementCapability;
}

const NO_COMMENT_ADAPTER = engagementCapability([], "현재 채널 어댑터는 댓글 본문 계약을 제공하지 않습니다.");

const THREADS_ENGAGEMENT = engagementCapability(
  ["read", "reply", "like", "defer", "editorHandoff"],
  "",
);

const INSTAGRAM_ENGAGEMENT = engagementCapability(
  ["read", "reply", "defer", "editorHandoff"],
  "현재 Instagram 댓글 API는 이 앱에 댓글 좋아요 계약을 제공하지 않습니다.",
);

const FACEBOOK_ENGAGEMENT = engagementCapability(
  ["read", "reply", "like", "defer", "editorHandoff"],
  "",
);

const YOUTUBE_ENGAGEMENT = engagementCapability(
  ["read", "reply", "defer", "editorHandoff"],
  "현재 YouTube Data API는 댓글 좋아요 쓰기 계약을 제공하지 않습니다.",
);

const X_ENGAGEMENT = engagementCapability(
  [],
  "현재 X 연결은 발행용 OAuth 1.0a 계약만 사용하므로 댓글 대화 조회를 안전하게 연결하지 않았습니다.",
);

const TIKTOK_ENGAGEMENT = engagementCapability(
  [],
  "TikTok Content Posting API는 크리에이터 댓글 관리 계약을 제공하지 않습니다. Research API 댓글 조회는 운영 계정 관리 용도로 사용할 수 없습니다.",
);

export interface ResolvedChannelTab {
  id: ChannelTab;
  label: string;
  disabled: boolean;
  special: boolean;
}

const STANDARD_TEXT_CAPABILITY: ChannelCapability = {
  tabs: BASE_CHANNEL_TABS,
  specialTabs: [],
  disabledTabs: ["growth", "popular"],
  removedTabs: [],
  engagement: NO_COMMENT_ADAPTER,
};

const THREADS_CAPABILITY: ChannelCapability = {
  tabs: BASE_CHANNEL_TABS,
  specialTabs: [],
  disabledTabs: [],
  removedTabs: [],
  engagement: THREADS_ENGAGEMENT,
};

const INSTAGRAM_CAPABILITY: ChannelCapability = {
  tabs: BASE_CHANNEL_TABS,
  specialTabs: ["editor"],
  disabledTabs: ["growth", "popular"],
  removedTabs: [],
  engagement: INSTAGRAM_ENGAGEMENT,
};

const VIDEO_CAPABILITY: ChannelCapability = {
  tabs: BASE_CHANNEL_TABS,
  specialTabs: [],
  disabledTabs: ["growth", "popular"],
  removedTabs: [],
  engagement: NO_COMMENT_ADAPTER,
};

const MESSAGING_CAPABILITY: ChannelCapability = {
  tabs: BASE_CHANNEL_TABS,
  specialTabs: [],
  disabledTabs: [],
  removedTabs: ["queue", "analytics", "growth", "popular"],
  engagement: NO_COMMENT_ADAPTER,
};

export const CHANNEL_CAPABILITIES: Record<string, ChannelCapability> = {
  threads: THREADS_CAPABILITY,
  x: { ...STANDARD_TEXT_CAPABILITY, engagement: X_ENGAGEMENT },
  facebook: { ...STANDARD_TEXT_CAPABILITY, engagement: FACEBOOK_ENGAGEMENT },
  bluesky: STANDARD_TEXT_CAPABILITY,
  linkedin: STANDARD_TEXT_CAPABILITY,
  pinterest: STANDARD_TEXT_CAPABILITY,
  tumblr: STANDARD_TEXT_CAPABILITY,
  naver_blog: STANDARD_TEXT_CAPABILITY,
  medium: STANDARD_TEXT_CAPABILITY,
  substack: STANDARD_TEXT_CAPABILITY,
  instagram: INSTAGRAM_CAPABILITY,
  youtube: { ...VIDEO_CAPABILITY, engagement: YOUTUBE_ENGAGEMENT },
  tiktok: { ...VIDEO_CAPABILITY, engagement: TIKTOK_ENGAGEMENT },
  telegram: MESSAGING_CAPABILITY,
  discord: MESSAGING_CAPABILITY,
  slack: MESSAGING_CAPABILITY,
  line: MESSAGING_CAPABILITY,
  kakao: MESSAGING_CAPABILITY,
  whatsapp: MESSAGING_CAPABILITY,
};

export const CHANNEL_TAB_LABELS: Record<ChannelTab, string> = {
  queue: "대기열",
  analytics: "성과 분석",
  growth: "성장",
  popular: "인기글",
  settings: "설정",
  editor: "편집기",
};

const CHANNEL_GROUP_DEFINITIONS = [
  {
    key: "social",
    title: "소셜",
    channels: ["threads", "x", "instagram", "facebook", "bluesky"],
    studioPublish: true,
  },
  {
    key: "messaging",
    title: "메시지",
    channels: ["telegram", "discord", "slack"],
    studioPublish: true,
  },
  {
    key: "video",
    title: "영상",
    channels: ["youtube", "tiktok"],
    studioPublish: false,
  },
] as const;

export const CHANNEL_GROUPS = CHANNEL_GROUP_DEFINITIONS.map(({ key, title, channels }) => ({
  key,
  title,
  channels,
}));

// Studio의 텍스트 예약/즉시 발행은 기존 8채널만 유지한다. 영상은 /videos가 owner다.
export const PUBLISH_CHANNEL_GROUPS = CHANNEL_GROUP_DEFINITIONS
  .filter((group) => group.studioPublish)
  .map(({ key, title, channels }) => ({ key, title, channels }));

export const VIDEO_PUBLISH_PLATFORMS = ["youtube", "tiktok"] as const;

export function getChannelCapability(channel: string): ChannelCapability {
  return CHANNEL_CAPABILITIES[channel] || STANDARD_TEXT_CAPABILITY;
}

export function getEngagementCapability(channel: string): EngagementCapability {
  return getChannelCapability(channel).engagement;
}

export function getChannelTabs(channel: string): ResolvedChannelTab[] {
  const capability = getChannelCapability(channel);
  const removed = new Set<ChannelTab>(capability.removedTabs);
  const disabled = new Set<ChannelTab>(capability.disabledTabs);
  const special = new Set<ChannelTab>(capability.specialTabs);
  const resolved: ResolvedChannelTab[] = [];

  for (const tab of capability.tabs) {
    if (removed.has(tab)) continue;
    resolved.push({ id: tab, label: CHANNEL_TAB_LABELS[tab], disabled: disabled.has(tab), special: false });
    if (tab === "queue") {
      for (const specialTab of capability.specialTabs) {
        resolved.push({
          id: specialTab,
          label: CHANNEL_TAB_LABELS[specialTab],
          disabled: false,
          special: special.has(specialTab),
        });
      }
    }
  }

  return resolved;
}

export function isChannelTabEnabled(channel: string, tab: string): tab is ChannelTab {
  return getChannelTabs(channel).some((candidate) => candidate.id === tab && !candidate.disabled);
}
