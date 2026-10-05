import { CH_LABELS } from "@/lib/constants";

const CHANNEL_PAGE_ALIASES: Readonly<Record<string, string>> = {
  shorts: "youtube",
  reels: "instagram",
};

export interface ResolvedChannelPage {
  channel: string;
  redirectTo: string | null;
}

export function resolveChannelPage(requestedChannel: string): ResolvedChannelPage | null {
  const channel = CHANNEL_PAGE_ALIASES[requestedChannel] ?? requestedChannel;
  if (!CH_LABELS[channel]) return null;

  return {
    channel,
    redirectTo: channel === requestedChannel ? null : `/channels/${channel}`,
  };
}

export function channelPageHref(requestedChannel: string): string | null {
  const resolved = resolveChannelPage(requestedChannel);
  return resolved ? `/channels/${resolved.channel}` : null;
}
