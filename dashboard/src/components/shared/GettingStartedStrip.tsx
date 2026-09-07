"use client";

import { useState } from "react";
import Link from "next/link";
import { useChannelConfig } from "@/hooks/useChannelConfig";
import { useOnboardingStatus } from "@/hooks/useOnboarding";
import { IMPLEMENTED_PLUGINS } from "@/lib/constants";

interface ChecklistData {
  checklist?: { created?: boolean; wiki?: boolean; channel?: boolean; published?: boolean; analytics?: boolean };
  channelConnected?: boolean;
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

  // 2026-09-08: 종전에는 채널 설정을 못 읽으면 이 줄을 통째로 감췄다. 그런데 그 조회
  // (/api/channel-config)는 운영자 전용이라 고객에게는 403 이다. 즉 **고객에게는 시작
  // 안내가 한 번도 뜬 적이 없다.** 처음 온 사람을 첫 발행까지 데려가는 장치가 정작
  // 처음 온 사람에게만 안 보였다. 회장 계정에서 눌러 보고서야 알았다.
  //
  // 이 줄이 실제로 필요한 값은 진행 칸 상태이고 그것은 온보딩 조회가 준다. 채널 설정은
  // 있으면 더 정확히 세는 보조 자료로만 쓴다. 없다고 안내를 없애지 않는다.
  const onboarding = onboardingData as ChecklistData | undefined;
  const channels = IMPLEMENTED_PLUGINS.filter((key) => key !== "midjourney");
  const detectedConnectedCount = channelConfig
    ? channels.filter((key) => {
        const channel = channelConfig[key] as Record<string, unknown> | undefined;
        return channel?.connected === true || channel?.status === "live" || channel?.status === "connected";
      }).length
    : (onboarding?.channelConnected ? 1 : 0);
  const connectedCount = controlledConnectedCount ?? detectedConnectedCount;

  const checklist = onboarding?.checklist;
  const done = STEPS.filter((step) => Boolean(checklist?.[step.key])).length;
  const next = STEPS.find((step) => !checklist?.[step.key]) ?? STEPS[0];

  // 2026-09-08: 종전에는 채널이 하나라도 연결되면 이 줄이 통째로 사라졌다. 그런데 다섯 칸
  // 가운데 채널 연결은 세 번째다. 첫 발행도 성과 확인도 아직인 사람이, 채널 하나 붙였다는
  // 이유로 길잡이를 잃었다. 처음 온 사람이 첫 발행까지 가는 것이 이 제품의 첫 관문인데
  // 그 관문 한복판에서 안내가 없어지는 셈이다.
  // 다섯 칸을 다 채웠을 때만 접는다. 그때는 안내가 할 일을 다 한 것이다.
  if (done >= STEPS.length) return null;

  // 연결된 채널이 하나도 없으면 무엇을 하든 발행에 닿지 못한다. 그때는 남은 칸 순서와
  // 무관하게 채널 연결을 먼저 가리킨다. 하나라도 붙은 뒤에는 남은 칸으로 데려간다.
  const cta = connectedCount === 0
    ? STEPS.find((step) => step.key === "channel") ?? next
    : next;

  return (
    <section className="mb-pad-inset" aria-label="시작 안내" data-start-strip>
      <div className="flex min-h-control-touch items-center gap-stack rounded-surface border border-accent/30 bg-accent-soft px-stack py-stack-tight text-caption text-accent">
        <b className="shrink-0">시작 {done}/{STEPS.length}</b>
        <span className="h-stack-section border-l border-accent/30" aria-hidden />
        <span className="min-w-0 flex-1 truncate">다음 할 일: {next.label} · 채널 연결 {connectedCount}/{channels.length}</span>
        {/* 단추가 늘 "채널 연결하기" 였다. 채널을 이미 붙인 사람에게는 할 일이 아니다.
            지금 남은 칸으로 바로 데려간다. */}
        <Link href={cta.href} data-testid="getting-started-next" className="inline-flex min-h-control-touch shrink-0 items-center rounded-control bg-accent px-stack text-caption font-semibold text-accent-fg">
          {cta.key === "channel" ? "채널 연결하기" : cta.label}
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
