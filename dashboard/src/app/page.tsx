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
import { countFilledLearningSlots, readLearningInfo, type LearningInfo } from "@/components/studio/learning-info";
import { Button } from "@/components/shared/Button";
import { useToast } from "@/components/layout/Toast";
import Link from "next/link";

export function PerformanceDashboard({ dedicatedRoom = false }: { dedicatedRoom?: boolean }) {
  const { dismissedOnboarding, dismissOnboarding, activeWorkspace } = useUIStore();
  const { showToast } = useToast();
  const { data: overview } = useOverview();
  const { data: usageData } = useUsage(activeWorkspace?.id);
  const { data: channelConfig } = useChannelConfig();
  // 성과실도 다른 세 방(생성실·편집실·발행실)과 같은 헤더 학습 정보 배지를 보여준다(회장 지적: 성과실만 빠짐).
  // 저장은 studio 쪽과 같은 작업 공간별 localStorage — 여기서는 읽기만 하고, 채우기는 /studio에서 한다.
  const [learningInfo, setLearningInfo] = useState<LearningInfo>({});
  // 의존성은 작업 공간 객체가 아니라 그 id(원시값)다. 객체를 걸면 부모가 매 렌더 새 객체를
  // 넘길 때 이 효과가 다시 돌고, 그 안의 setState 가 또 렌더를 부르는 무한 갱신이 된다.
  const activeWorkspaceId = activeWorkspace?.id;
  useEffect(() => {
    setLearningInfo(activeWorkspaceId ? readLearningInfo(activeWorkspaceId) : {});
  }, [activeWorkspaceId]);
  // 발행물 성과(성과 페이지 통합). 활성 워크스페이스의 published_posts
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
    quota?: any 
  } | undefined;

  if (!o) return <div className="px-region py-stack-section"><p className="text-subtle">불러오는 중...</p></div>;

  const sc = (o.statusCounts || {}) as Record<string, number>;

  // Onboarding check
  const connectedCount = Object.values(cfg).filter((c) => c.connected || c.status === "live").length;
  const showOnboarding = onboardingStatus && !onboardingStatus.completed && connectedCount === 0 && !dismissedOnboarding;

  const posts = metricsData?.posts || [];
  const publishedPosts = posts.filter((p) => p.status === "published");
  const homeSummary = (o.summary || {}) as Record<string, number | null>;
  // 2026-09-05: 실패해도 아무 말이 없었다. catch 가 없어 예외가 그대로 새고 화면은
  // "성과 수집 중"에서 원래대로 돌아갈 뿐이라, 눌러도 아무 일이 없는 것으로 읽힌다.
  // 생성실·발행실에서 고친 것과 같은 결함이다. 결과를 성공이든 실패든 말한다.
  const collectMetrics = async () => {
    if (!activeWorkspace || collecting) return;
    setCollecting(true);
    try {
      const r = await apiPost<{ updated?: number; total?: number; collectionBlocked?: boolean; reason?: string }>(
        "/api/metrics", { tenant_id: activeWorkspace.id },
      );
      await mutateMetrics();
      // 대상이 있는데 하나도 못 모았으면 조용히 끝내지 않는다. 사용자는 눌렀는데 숫자가
      // 그대로인 이유를 알 수 없었다(2026-09-05 회장 계정 실측: 대상 1건·갱신 0건·무반응).
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
      {/* 네 방이 같은 머리줄을 쓴다. 성과실에서만 사라지면 길잡이가 끊긴다. */}
      <RoomHeader
        workspaceName={activeWorkspace?.name}
        subtitle="콘텐츠 작업실"
        roomLabel="성과실"
        currentRoom={dedicatedRoom ? "performance" : undefined}
        leading={
          <LearningStatus
            filled={countFilledLearningSlots(learningInfo)}
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

export default function HomePage() {
  return <PerformanceDashboard />;
}
