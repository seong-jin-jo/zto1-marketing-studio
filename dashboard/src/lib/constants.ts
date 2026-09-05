/** Channel display names */
export const CH_LABELS: Record<string, string> = {
  threads: "Threads",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  bluesky: "Bluesky",
  pinterest: "Pinterest",
  tumblr: "Tumblr",
  tiktok: "TikTok",
  youtube: "YouTube",
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
  line: "LINE",
  kakao: "Kakao",
  whatsapp: "WhatsApp",
  naver_blog: "Naver Blog",
  midjourney: "Midjourney",
  medium: "Medium",
  substack: "Substack",
  google_analytics: "Google Analytics",
  search_console: "Search Console",
  google_business: "Google Business",
  seo_keywords: "SEO Keywords",
  custom_api: "Custom API",
  rss: "RSS Feed",
};

/**
 * 예약 발행이 실제로 지원하는 플랫폼 SSOT.
 * SchedulePanel(UI 체크박스)과 publish-due 백엔드(SUPPORTED_PLATFORMS)가 같은 목록을 공유한다.
 * "노출=발행가능" 원칙 — 여기 없는 플랫폼은 예약 UI에 노출하지 않는다.
 * 영상(shorts/reels/tiktok)은 텍스트 예약 루프가 아직 못 다루므로 제외(드리프트 방지).
 * bluesky/telegram/discord/slack(2026-07, credential·webhook 방식) 추가 — OAuth 앱 등록형 4채널(threads/x/facebook/instagram)과
 * 달리 자격증명 직접 입력(app password/bot token/webhook URL)만으로 발행 가능.
 *
 * /api/publish가 실제로 분기 처리하는 플랫폼과 정확히 1:1 — 이 목록에 없는 채널은
 * POST /api/publish에서 `{platform} 미지원`으로 거부된다(src/app/api/publish/route.ts).
 */
export const SCHEDULABLE_PLATFORMS = [
  "threads", "x", "facebook", "instagram",
  "bluesky", "telegram", "discord", "slack",
] as const;
export type SchedulablePlatform = (typeof SCHEDULABLE_PLATFORMS)[number];

// 텍스트 예약 루프와 별도인 /api/video/publish 직접 발행 provider.
// SocialConnectButton의 "직접 발행 미지원" 표기가 실제 영상 API와 드리프트하지 않게 공유한다.
export { PUBLISH_CHANNEL_GROUPS, VIDEO_PUBLISH_PLATFORMS } from "@/lib/channel-capabilities";

/** 발행 채널 그룹 — 사이드바와 Settings>Channels와 ChannelConnect 모달의 단일 소스(SSOT).
 * "사이드바=연결가능=실제 발행가능" 원칙: 여기 있는 채널만 노출한다.
 * SCHEDULABLE_PLATFORMS(=/api/publish가 실제 지원하는 8채널)를 그대로 그룹화한 것 —
 * OAuth 앱 등록만 돼 있고 실제 POST /api/publish 분기가 없는 나머지 7채널
 * (linkedin/pinterest/tumblr/tiktok/youtube/naver_blog/line)은 "발행가능"으로 오인되지 않도록
 * 여기서 제외한다(2026-07-16 P0 QA 정정 — 라벨/extension 설정은 constants 하단에 보존, 노출만 제거).
 * video/blog 그룹은 실제 항목이 없어 삭제. */
export const SCHEDULABLE_PLATFORM_LABELS: Record<SchedulablePlatform, string> = {
  threads: "Threads",
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
  bluesky: "Bluesky",
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
};

/** Messaging channels — no Content Guide/Keywords */
export const MESSAGING_CHANNELS = ["telegram", "discord", "slack", "line", "kakao", "whatsapp"];

/** Data channels */
export const DATA_CHANNELS = ["google_analytics", "search_console", "google_business"];

/** Status badge styles */
export const CH_STATUS_BADGE: Record<string, string> = {
  live: "bg-success/15 text-success",
  connected: "bg-accent-soft text-accent",
  available: "",
  soon: "",
};

export const CH_STATUS_LABEL: Record<string, string> = {
  live: "Live",
  connected: "연결됨",
  available: "",
  soon: "준비 중",
};

// OSMU 1차 정식 제공 채널 (실배포 OPENCLAW_EXTENSIONS = threads/x/instagram publish).
// UI(사이드바·연결배너·그리드)는 이 집합만 노출. 나머지는 추후/포크.
export const OSMU_CHANNELS: string[] = ["threads", "x", "instagram"];

/** Implemented plugins — channels with extensions */
export const IMPLEMENTED_PLUGINS: string[] = [
  "threads",
  "x",
  "instagram",
  "facebook",
  "bluesky",
  "telegram",
  "discord",
  "slack",
  "line",
  "tumblr",
  "pinterest",
  "linkedin",
  "tiktok",
  "youtube",
  "naver_blog",
  "midjourney",
];

/** 자동화 기능 정의. implemented는 현재 사용할 수 있는 기능을 뜻한다. */
export const AUTOMATION_FEATURES = [
  { key: "content_generation", label: "콘텐츠 생성", description: "학습 정보를 반영해 콘텐츠 초안을 만들고 저장합니다.", default: true, implemented: true },
  { key: "auto_publish", label: "자동 발행", description: "승인된 글을 한 편씩 자동 발행합니다.", default: true, implemented: true },
  { key: "insights_collection", label: "성과 수집", description: "발행한 글의 조회, 좋아요, 답글 수를 수집합니다.", default: true, implemented: true },
  { key: "auto_like_replies", label: "댓글 자동 좋아요", description: "내 글에 달린 댓글에 좋아요를 표시합니다.", default: true, implemented: true },
  { key: "auto_reply", label: "자동 답글", description: "답하지 않은 댓글에 브랜드 말투로 답글을 작성합니다.", default: false, implemented: false },
  { key: "low_engagement_cleanup", label: "반응 저조 글 정리", description: "24시간 뒤 반응이 낮은 글을 자동으로 삭제합니다.", default: false, implemented: false },
  { key: "trending_collection", label: "인기글 수집", description: "등록한 키워드를 기준으로 외부 인기글을 수집합니다.", default: true, implemented: true },
  { key: "trending_rewrite", label: "인기글 재구성", description: "수집한 인기글을 브랜드 말투로 다시 구성합니다.", default: false, implemented: false },
  { key: "quote_trending", label: "인기글 인용", description: "외부 인기글에 우리 관점을 더해 게시합니다.", default: false, implemented: false },
  { key: "series_followup", label: "시리즈 후속 글", description: "반응이 좋은 주제로 후속 글을 만듭니다.", default: false, implemented: false },
  { key: "casual_posts", label: "일상 글", description: "일상과 감성을 담은 글을 만듭니다.", default: false, implemented: false },
  { key: "follower_tracking", label: "팔로워 추적", description: "팔로워 수 변화를 매일 기록합니다.", default: true, implemented: true },
  { key: "image_generation", label: "이미지 생성", description: "일부 콘텐츠에 쓸 이미지를 자동으로 만듭니다.", default: false, implemented: false },
  { key: "instagram_carousel", label: "Instagram 캐러셀", description: "카드뉴스를 만들고 Instagram 캐러셀로 발행합니다.", default: false, implemented: true },
  { key: "youtube_shorts", label: "YouTube Shorts", description: "카드뉴스를 짧은 영상으로 만들어 발행합니다.", default: false, implemented: false },
];

/**
 * 안 터진 글 판정 기준 (VIRAL_THRESHOLD의 반대 짝).
 * 발행 후 이 나이(ms)가 지나고, views/likes가 이 기준 미만이면 "안 터진 글" 후보다.
 * 채널/워크스페이스별 override는 channel-settings.json의 low_engagement_min_views/
 * low_engagement_min_likes에 저장(없으면 이 기본값 사용) — /api/channel-settings/[channel] 참고.
 */
export const LOW_ENGAGEMENT_MIN_AGE_MS = 24 * 60 * 60 * 1000;
export const LOW_ENGAGEMENT_MIN_VIEWS_DEFAULT = Number(process.env.LOW_ENGAGEMENT_MIN_VIEWS) || 100;
export const LOW_ENGAGEMENT_MIN_LIKES_DEFAULT = Number(process.env.LOW_ENGAGEMENT_MIN_LIKES) || 3;

/**
 * 실제로 게시물 삭제 API가 존재하는 채널 SSOT. 다른 채널(x/instagram 등)은 publish
 * extension에 delete가 없어 이 목록에 없으면 "채널 미지원"으로 거부한다.
 * UI(AutomationRulesPanel)와 API(/api/threads/low-engagement-cleanup)가 이 배열을 공유한다.
 */
export const DELETE_SUPPORTED_CHANNELS: string[] = ["threads"];

/** Default notification settings */
export const DEFAULT_NOTIFICATION_SETTINGS = {
  onPublish: { enabled: false, channels: [] as string[] },
  onViral: { enabled: false, channels: [] as string[] },
  onError: { enabled: true, channels: [] as string[] },
  weeklyReport: { enabled: false, channels: [] as string[] },
};
