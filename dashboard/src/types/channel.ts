export interface ChannelKeys {
  [key: string]: string;
}

export interface ChannelConfigEntry {
  status: "live" | "connected" | "available" | "soon";
  keys: ChannelKeys;
  enabled?: boolean;
  connected?: boolean;
  username?: string;
  userId?: string;
  /** instagram/threads 라이브 OAuth 검증 결과(GET /api/channel-config, 2026-07-16). */
  reconnectRequired?: boolean;
  connectionStatus?: "valid" | "invalid" | "unverified" | "connected" | "disconnected" | "reconnect";
  connectionError?: "oauth_token_invalid" | "provider_unreachable" | "no_token" | "server_key_missing" | "slack_webhook_required" | "discord_webhook_required" | "telegram_chat_required" | null;
  [key: string]: unknown;
}

export type ChannelConfigMap = Record<string, ChannelConfigEntry>;

export interface SetupGuide {
  fields: string[];
  labels: string[];
  quick: string[];
  detail: string;
  // 선택: 단계별 스크린샷/GIF(없으면 텍스트만). 에셋은 public/onboarding/ 에 사용자가 채움.
  images?: { src: string; alt: string }[];
}

export interface ChannelGuideData {
  guide: string;
  common: string;
  channelGuide: boolean;
}

export interface ChannelKeywordsData {
  keywords: string[];
  common: string[];
  channelKeywords: boolean;
}
