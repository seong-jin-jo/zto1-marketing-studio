"use client";

import { useChannelConfig } from "@/hooks/useChannelConfig";
import { CH_LABELS } from "@/lib/constants";
import { CHANNEL_GROUPS } from "@/lib/channel-capabilities";
import { getChannelIcon } from "@/lib/channel-icons";
import Link from "next/link";
import { connectionLabel } from "@/lib/channel-connection-label";

// 발행 채널 그룹은 constants의 PUBLISH_CHANNEL_GROUPS 단일 소스를 사용(사이드바와 동일).
const GROUPS = CHANNEL_GROUPS;

function ChRow({ channelKey, label, sub, connected }: {
  channelKey: string; label: string; sub: string; connected: boolean;
}) {
  return (
    <Link href={`/channels/${channelKey}`} className="flex items-center justify-between p-stack rounded-control bg-surface/50 hover:bg-surface-2/50">
      <div className="flex items-center gap-stack">
        <span className="w-6 h-6 rounded-chip bg-surface-2 flex items-center justify-center text-muted">{getChannelIcon(channelKey)}</span>
        <div>
          <p className="text-caption text-muted">{label}</p>
          <p className="text-caption text-subtle">{sub}</p>
        </div>
      </div>
      <span className={`text-caption ${connected ? "text-success" : "text-accent"}`}>
        {connected ? connectionLabel({ connected: true }) : "연결 →"}
      </span>
    </Link>
  );
}

export function ChannelsSettings() {
  const { data: channelConfig } = useChannelConfig();
  const cfg = (channelConfig || {}) as Record<string, { connected?: boolean; userId?: string }>;

  return (
    <>
      <p className="text-caption text-subtle mb-pad-inset">콘텐츠를 발행할 채널. 클릭하면 해당 채널 연결 화면으로 이동합니다.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-section">
        {GROUPS.map((g) => (
          <div key={g.title} className="card p-stack-section">
            <h3 className="text-body-sm font-medium text-muted mb-stack">{g.title}</h3>
            <div className="space-y-stack-tight">
              {g.channels.map((ch) => (
                <ChRow
                  key={ch}
                  channelKey={ch}
                  label={CH_LABELS[ch] || ch}
                  sub={cfg[ch]?.userId ? "ID: " + cfg[ch]?.userId : ""}
                  connected={!!cfg[ch]?.connected}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
