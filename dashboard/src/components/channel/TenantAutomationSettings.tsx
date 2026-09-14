"use client";

import useSWR from "swr";
import { apiPost, fetcher } from "@/lib/api";
import { AUTOMATION_FEATURES } from "@/lib/constants";
import { useToast } from "@/components/layout/Toast";

const CHANNEL_FEATURES: Record<string, Set<string>> = {
  threads: new Set([
    "content_generation",
    "auto_publish",
    "insights_collection",
    "auto_like_replies",
    "low_engagement_cleanup",
    "trending_collection",
    "follower_tracking",
    "trending_rewrite",
  ]),
  instagram: new Set(["content_generation", "auto_publish"]),
};

const DEFAULT_FEATURES = new Set(["content_generation", "auto_publish"]);

export function TenantAutomationSettings({ channel }: { channel: string }) {
  const { data, mutate } = useSWR<Record<string, boolean>>(
    `/api/channel-settings/${channel}`,
    fetcher,
  );
  const { showToast } = useToast();
  const supported = CHANNEL_FEATURES[channel] || DEFAULT_FEATURES;
  const settings = data || {};

  const handleToggle = async (key: string, checked: boolean) => {
    try {
      await apiPost(`/api/channel-settings/${channel}`, { [key]: checked });
      await mutate();
      const label = AUTOMATION_FEATURES.find((feature) => feature.key === key)?.label || key;
      showToast(`${label} ${checked ? "켬" : "끔"}`, "success");
    } catch (error) {
      showToast(`실패: ${(error as Error).message}`, "error");
    }
  };

  return (
    <div className="card p-stack-section">
      <h3 className="text-body-sm font-medium text-muted mb-micro">자동화</h3>
      <p className="text-caption text-subtle mb-pad-inset">
        이 워크스페이스의 채널 자동화만 설정합니다.
      </p>
      {AUTOMATION_FEATURES.map((feature) => {
        const available = supported.has(feature.key) && feature.implemented !== false;
        return (
          <div
            key={feature.key}
            className="flex items-center gap-stack py-stack border-b border-border/50 last:border-0"
          >
            <label
              className={`relative inline-flex items-center shrink-0 ${
                available ? "cursor-pointer" : "opacity-40 cursor-not-allowed"
              }`}
            >
              <input
                type="checkbox"
                aria-label={feature.label}
                checked={!!settings[feature.key]}
                onChange={(event) => {
                  if (available) void handleToggle(feature.key, event.target.checked);
                }}
                disabled={!available}
                className="sr-only peer"
              />
              <span className="w-9 h-5 bg-surface-2 rounded-pill peer peer-checked:bg-accent after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface after:rounded-pill after:h-4 after:w-4 after:transition-transform peer-checked:after:translate-x-full" />
            </label>
            <div className="min-w-0">
              <div className="flex items-center gap-stack-tight">
                <span className={`text-caption ${available ? "text-muted" : "text-subtle"}`}>
                  {feature.label}
                </span>
                {!available && <span className="text-caption text-subtle">준비 중</span>}
              </div>
              <p className="text-caption text-subtle">{feature.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
