"use client";

// 선택 학습의 상세를 소유하는 별도 창.
//
// DESIGN.md:159 "선택 학습의 상세는 작업 화면과 분리된 별도 창이 소유한다"
// DESIGN.md:160 "선택 학습의 상세를 본문에 상주시키지 않는다"
// 성과실 패널이 최근 판단 상세 5건을 상주시켜 소유권이 뒤집혔던 것을 여기로 옮겼다
// (2026-09-12 감사 MAJOR). 성과실에는 완료 피드백과 이 창으로 들어오는 진입만 남는다.
//
// 되돌리기도 여기가 소유한다. v63 "정하시면 그 줄만 상태가 바뀌고 되돌리기가 남습니다".

import { useState } from "react";
import { apiDelete } from "@/lib/api";
import { Button } from "@/components/shared/Button";
import { Stack } from "@/components/shared/Stack";

export interface LearnedRuleDecisionView {
  id: string;
  decision: "accepted" | "rejected";
  text: string;
  sourceLabel: string;
  sampleCount: number;
  observedFrom: string | null;
  observedTo: string | null;
  decidedAt: string;
}

export function formatLearningDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

export function formatLearningPeriod(from: string | null, to: string | null): string {
  if (!from || !to) return "기간 미수집";
  return `${formatLearningDate(from)}부터 ${formatLearningDate(to)}까지`;
}

export function LearningDecisionsDialog({
  workspaceId,
  decisions,
  onClose,
  onUndone,
}: {
  workspaceId: string;
  decisions: LearnedRuleDecisionView[];
  onClose: () => void;
  onUndone: () => void | Promise<void>;
}) {
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const undo = async (decisionId: string) => {
    setUndoingId(decisionId);
    setError(null);
    try {
      await apiDelete(
        `/api/performance/learned-rules?tenant_id=${encodeURIComponent(workspaceId)}&decisionId=${encodeURIComponent(decisionId)}`,
      );
    } catch {
      setError("되돌리지 못했습니다. 잠시 뒤 다시 눌러 주세요.");
      setUndoingId(null);
      return;
    }
    try {
      // 되돌리기는 이미 끝났다. 목록 새로고침 실패를 되돌리기 실패로 말하지 않는다.
      await onUndone();
    } catch {
      setError("되돌렸습니다. 목록을 새로 불러오지 못했으니 창을 닫았다 열어 주세요.");
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-player-surface/70 p-pad-inset"
      role="dialog"
      aria-modal="true"
      aria-label="학습 정보 상세"
      data-learning-decisions-dialog
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-surface border border-border bg-surface p-stack-section shadow-floating">
        <Stack gap={16}>
          <div className="flex flex-wrap items-center gap-stack border-b border-border pb-stack">
            <div className="mr-auto min-w-0">
              <b className="block text-lead text-text">학습 정보 · 최근 판단</b>
              <span className="text-caption text-subtle">
                판단마다 표본 수와 관찰 기간과 적용 범위를 함께 남깁니다. 되돌리면 그 줄만 원래대로 돌아갑니다.
              </span>
            </div>
            <Button size="sm" variant="secondary" onClick={onClose}>닫기</Button>
          </div>

          {error && <p className="text-caption text-danger" role="alert">{error}</p>}

          {decisions.length === 0 ? (
            <p className="text-caption text-subtle">아직 판단한 규칙이 없습니다.</p>
          ) : (
            <ul className="space-y-stack-tight">
              {decisions.map((decision) => (
                <li
                  key={decision.id}
                  className="rounded-control border border-border bg-surface-2 p-stack-tight text-caption text-muted break-keep"
                  data-learning-decision={decision.id}
                >
                  <span className="block text-body-sm text-text">
                    {decision.decision === "accepted" ? "반영" : "안 함"}: {decision.text}
                  </span>
                  <span className="text-subtle">
                    표본 {decision.sampleCount}건 · {formatLearningPeriod(decision.observedFrom, decision.observedTo)} · 작업 공간의 다음 생성
                  </span>
                  <div className="mt-stack-tight flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={undoingId === decision.id}
                      onClick={() => void undo(decision.id)}
                    >
                      {undoingId === decision.id ? "되돌리는 중" : "되돌리기"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Stack>
      </div>
    </div>
  );
}
