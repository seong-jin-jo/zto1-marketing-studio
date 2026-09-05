"use client";

import { useState } from "react";
import Link from "next/link";
import { useChannelConfig } from "@/hooks/useChannelConfig";
import { useOnboardingStatus } from "@/hooks/useOnboarding";
import { IMPLEMENTED_PLUGINS } from "@/lib/constants";

interface ChecklistData {
  checklist?: { created?: boolean; wiki?: boolean; channel?: boolean; published?: boolean; analytics?: boolean };
}

const STEPS = [
  { key: "created", label: "첫 콘텐츠 만들기", href: "/studio?room=create" },
  { key: "wiki", label: "브랜드 문서 연결", href: "/studio?setup=brand" },
  { key: "channel", label: "발행할 채널 연결", href: "/settings?tab=channels" },
  { key: "published", label: "첫 콘텐츠 발행", href: "/studio?room=publish" },
  { key: "analytics", label: "성과 확인", href: "/performance" },
] as const;

export function GettingStartedStrip({ connectedCount: controlledConnectedCount }: { connectedCount?: number } = {}) {
  const { data: channelConfig } = useChannelConfig();
  const { data: onboardingData } = useOnboardingStatus();
  const [open, setOpen] = useState(false);

  if (!channelConfig && controlledConnectedCount === undefined) return null;

  const channels = IMPLEMENTED_PLUGINS.filter((key) => key !== "midjourney");
  const detectedConnectedCount = channels.filter((key) => {
    const channel = channelConfig?.[key] as Record<string, unknown> | undefined;
    return channel?.connected === true || channel?.status === "live" || channel?.status === "connected";
  }).length;
  const connectedCount = controlledConnectedCount ?? detectedConnectedCount;
  if (connectedCount > 0) return null;

  const checklist = (onboardingData as ChecklistData | undefined)?.checklist;
  const done = STEPS.filter((step) => Boolean(checklist?.[step.key])).length;
  const next = STEPS.find((step) => !checklist?.[step.key]) ?? STEPS[0];

  return (
    <section className="mb-pad-inset" aria-label="시작 안내" data-start-strip>
      <div className="flex min-h-control-touch items-center gap-stack rounded-surface border border-accent/30 bg-accent-soft px-stack py-stack-tight text-caption text-accent">
        <b className="shrink-0">시작 {done}/{STEPS.length}</b>
        <span className="h-stack-section border-l border-accent/30" aria-hidden />
        <span className="min-w-0 flex-1 truncate">다음 할 일: {next.label} · 채널 연결 {connectedCount}/{channels.length}</span>
        <Link href="/settings?tab=channels" className="inline-flex min-h-control-touch shrink-0 items-center rounded-control bg-accent px-stack text-caption font-semibold text-accent-fg">
          채널 연결하기
        </Link>
        <button
          type="button"
          className="inline-flex min-h-control-touch shrink-0 items-center rounded-control border border-accent/30 px-stack text-caption font-semibold text-accent"
          aria-expanded={open}
          aria-controls="getting-started-detail"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "접기" : "전체 보기"}
        </button>
      </div>
      {open ? (
        <div id="getting-started-detail" className="mt-stack-tight grid gap-stack-tight rounded-surface border border-border bg-surface p-stack text-caption">
          {STEPS.map((step) => {
            const complete = Boolean(checklist?.[step.key]);
            return (
              <Link key={step.key} href={step.href} className={`min-h-control-touch rounded-control px-stack py-stack-tight ${complete ? "text-success" : "text-muted hover:bg-surface-2"}`}>
                {complete ? "완료" : "할 일"} · {step.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
