"use client";

import Link from "next/link";
import useSWR from "swr";
import { LearningDecisionsDialog, type LearnedRuleDecisionView } from "@/components/home/LearningDecisionsDialog";
import { RoomHeader } from "@/components/shared/RoomHeader";
import { fetcher } from "@/lib/api";
import { useUIStore } from "@/store/ui-store";

interface LearnedRulesResponse {
  decisions: LearnedRuleDecisionView[];
}

export default function LearnPage() {
  const { activeWorkspace } = useUIStore();
  const workspaceId = activeWorkspace?.id;
  const { data, mutate, error } = useSWR<LearnedRulesResponse>(
    workspaceId ? `/api/performance/learned-rules?tenant_id=${encodeURIComponent(workspaceId)}` : null,
    fetcher,
  );

  return (
    <main className="px-region py-stack-section">
      <RoomHeader
        workspaceName={activeWorkspace?.name}
        subtitle="콘텐츠 작업실"
        roomLabel="학습 정보"
        trailing={<Link href="/performance" className="inline-flex min-h-control-touch items-center rounded-control border border-border bg-surface-2 px-stack text-body-sm font-semibold text-muted hover:bg-surface">성과실로 돌아가기</Link>}
      />
      {!workspaceId ? <p className="text-body-sm text-subtle">작업 공간을 먼저 골라 주세요.</p> : null}
      {workspaceId && !data && !error ? <p className="text-body-sm text-subtle">학습 정보를 불러오는 중입니다.</p> : null}
      {error ? <p className="text-body-sm text-danger">학습 정보를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</p> : null}
      {workspaceId && data ? (
        <LearningDecisionsDialog
          workspaceId={workspaceId}
          decisions={data.decisions ?? []}
          onUndone={async () => { await mutate(); }}
        />
      ) : null}
    </main>
  );
}
