"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher, apiPost } from "@/lib/api";
import { useOverview, useUsage } from "@/hooks/useOverview";
import { useChannelConfig } from "@/hooks/useChannelConfig";
import { useOnboardingStatus } from "@/hooks/useOnboarding";
import { useUIStore } from "@/store/ui-store";
import { OnboardingWizard } from "@/components/shared/OnboardingWizard";
import { GettingStartedStrip } from "@/components/shared/GettingStartedStrip";
import { PerformanceRoom, type PerformancePost } from "@/components/home/PerformanceRoom";
import { RoomHeader } from "@/components/shared/RoomHeader";
import { LearningStatus } from "@/components/studio/LearningStatus";
import { countFilledUserSlots, readLearningInfo, type LearningInfo } from "@/components/studio/learning-info";
import { Button } from "@/components/shared/Button";
import { useToast } from "@/components/layout/Toast";
import Link from "next/link";

export function PerformanceDashboard({ dedicatedRoom = false }: { dedicatedRoom?: boolean }) {
  const { dismissedOnboarding, dismissOnboarding, activeWorkspace } = useUIStore();
  const { showToast } = useToast();
  const { data: overview } = useOverview();
  const { data: usageData } = useUsage(activeWorkspace?.id);
  const { data: channelConfig } = useChannelConfig();
  const [learningInfo, setLearningInfo] = useState<LearningInfo>({});
  const activeWorkspaceId = activeWorkspace?.id;
  useEffect(() => {
    setLearningInfo(activeWorkspaceId ? readLearningInfo(activeWorkspaceId) : {});
  }, [activeWorkspaceId]);
  const { data: metricsData, mutate: mutateMetrics } = useSWR<{ posts?: PerformancePost[] }>(
    activeWorkspace ? `/api/metrics?tenant_id=${activeWorkspace.id}` : null, fetcher);
  const [collecting, setCollecting] = useState(false);
  const { data: onboardingData, mutate: mutateOnboarding } = useOnboardingStatus();
  const onboardingStatus = onboardingData as { completed?: boolean } | undefined;

  const o = overview as Record<string, unknown> | undefined;
  const cfg = (channelConfig || {}) as unknown as Record<string, Record<string, unknown>>;
  const usage = usageData as {
    today?: Record<string, number>;
    thisWeek?: Record<string, number>;
    tier?: string;
    quota?: any;
  } | undefined;

  if (!o) return <div className="px-region py-stack-section"><p className="text-subtle">불러오는 중...</p></div>;

  const sc = (o.statusCounts || {}) as Record<string, number>;
  const connectedCount = Object.values(cfg).filter((c) => c.connected || c.status === "live").length;
  const showOnboarding = onboardingStatus && !onboardingStatus.completed && connectedCount === 0 && !dismissedOnboarding;
  const posts = metricsData?.posts || [];
  const publishedPosts = posts.filter((p) => p.status === "published");
  const homeSummary = (o.summary || {}) as Record<string, number | null>;
  const collectMetrics = async () => {
    if (!activeWorkspace || collecting) return;
    setCollecting(true);
    try {
      const r = await apiPost<{ updated?: number; total?: number; collectionBlocked?: boolean; reason?: string }>(
        "/api/metrics", { tenant_id: activeWorkspace.id },
      );
      await mutateMetrics();
      if (r?.collectionBlocked) showToast(r.reason || "성과를 모으지 못했습니다. 채널 연결을 확인해 주세요.", "error");
      else if (r?.updated) showToast(`성과 ${r.updated}건을 새로 모았습니다.`, "success");
    } catch {
      showToast("성과를 다시 수집하지 못했습니다. 채널 연결 상태를 확인한 뒤 다시 눌러 주세요.", "error");
    } finally {
      setCollecting(false);
    }
  };

  return (
    <div className="px-region py-stack-section">
      <RoomHeader
        workspaceName={activeWorkspace?.name}
        subtitle="콘텐츠 작업실"
        roomLabel="성과실"
        currentRoom={dedicatedRoom ? "performance" : undefined}
        leading={
          <LearningStatus
            filled={countFilledUserSlots(learningInfo)}
            onOpen={() => { window.location.href = "/studio?setup=brand"; }}
          />
        }
        trailing={
          <Link href="/studio" className="inline-flex min-h-control-touch items-center rounded-control border border-border bg-surface-2 px-stack text-body-sm font-semibold text-muted hover:bg-surface">
            작업실로 가기
          </Link>
        }
      />
      <GettingStartedStrip />
      <PerformanceRoom
        dedicated={dedicatedRoom}
        workspaceId={activeWorkspace?.id}
        workspaceName={activeWorkspace?.name}
        metricsLoaded={metricsData !== undefined}
        posts={posts}
        publishedCount={Number(homeSummary.published ?? publishedPosts.length)}
        followers={String(o.followers ?? "")}
        followerDelta={o.weekDelta == null ? undefined : Number(o.weekDelta)}
        engagementRate={homeSummary.engagementRate}
        queuedCount={(sc.draft || 0) + (sc.approved || 0)}
        viralCount={(o.viralPosts as unknown[])?.length || 0}
        usage={usage}
        collecting={collecting}
        onCollectMetrics={collectMetrics}
      />

      {showOnboarding ? (
        <div className="mb-region" data-onboarding-help="first-content">
          <OnboardingWizard
            embedded
            onComplete={() => {
              mutateOnboarding();
              dismissOnboarding();
            }}
            onDismiss={dismissOnboarding}
          />
        </div>
      ) : null}
    </div>
  );
}
