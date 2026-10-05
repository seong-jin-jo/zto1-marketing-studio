"use client";

import { use } from "react";
import { redirect } from "next/navigation";
import { MESSAGING_CHANNELS, DATA_CHANNELS } from "@/lib/constants";
import { resolveChannelPage } from "@/lib/channel-route";
import { ChannelPage } from "@/components/channel/ChannelPage";
import { MessagingPage } from "@/components/channel/MessagingPage";
import { DataChannelPage } from "@/components/channel/DataChannelPage";
import { InstagramPage } from "@/components/channel/InstagramPage";

const BLOG_CHANNELS = ["naver_blog", "medium", "substack"];
const VIDEO_CHANNELS = ["tiktok", "youtube"];

export default function ChannelRoute({ params }: { params: Promise<{ channel: string }> }) {
  const { channel: requestedChannel } = use(params);
  const resolved = resolveChannelPage(requestedChannel);

  // Validate channel exists
  if (!resolved) {
    return (
      <div className="px-region py-stack-section">
        <p className="text-[var(--text-muted)]">알 수 없는 채널: {requestedChannel}</p>
      </div>
    );
  }

  if (resolved.redirectTo) redirect(resolved.redirectTo);

  const { channel } = resolved;

  if (channel === "instagram") {
    return <InstagramPage />;
  }

  if (DATA_CHANNELS.includes(channel)) {
    return <DataChannelPage channel={channel} />;
  }

  if (MESSAGING_CHANNELS.includes(channel)) {
    return <MessagingPage channel={channel} />;
  }

  if (BLOG_CHANNELS.includes(channel)) {
    return <ChannelPage channel={channel} variant="blog" />;
  }

  if (VIDEO_CHANNELS.includes(channel)) {
    return <ChannelPage channel={channel} variant="video" />;
  }

  return <ChannelPage channel={channel} />;
}
