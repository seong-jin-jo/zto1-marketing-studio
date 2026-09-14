"use client";

import useSWR from "swr";
import { useQueue } from "@/hooks/useQueue";
import { useChannelConfig } from "@/hooks/useChannelConfig";
import { useUIStore } from "@/store/ui-store";
import { useToast } from "@/components/layout/Toast";
import { apiPost, fetcher } from "@/lib/api";
import { UnifiedPostCard } from "./UnifiedPostCard";
import type { UnifiedPostCardProps } from "./UnifiedPostCard";
import { confirmAction } from "@/components/shared/ConfirmHost";

const FILTERS = ["all", "draft", "approved", "published", "failed"];
const FILTER_LABELS: Record<string, string> = {
  all: "전체", draft: "초안", approved: "승인됨", published: "발행됨", failed: "실패",
};

interface QueueListProps {
  variant?: UnifiedPostCardProps["variant"];
  charLimit?: number;
  showSeo?: boolean;
  onEditInEditor?: (postId: string) => void;
}

export function QueueList({ variant = "text", charLimit, showSeo, onEditInEditor }: QueueListProps) {
  const { queueFilter, setQueueFilter, selectedIds, selectAll, clearSelection, setImagePickerPostId } = useUIStore();
  const { data, mutate } = useQueue(queueFilter);
  const { data: channelConfig } = useChannelConfig();
  const { showToast } = useToast();
  // 소싱(롱폼→숏폼) DB drafts 중 아직 큐로 안 가져온 개수.
  const { data: srcPending, mutate: mutatePending } = useSWR<{ pending: number }>("/api/sourcing/import-to-queue", fetcher);

  const handleImportFromSourcing = async () => {
    try {
      const r = await apiPost<{ imported: number }>("/api/sourcing/import-to-queue");
      showToast(`소싱 후보 ${r?.imported ?? 0}개를 큐로 가져왔습니다`, "success");
      mutate(); mutatePending();
    } catch (e) { showToast(`가져오기 실패: ${(e as Error).message}`, "error"); }
  };

  const posts = data?.posts || [];

  // Already sorted by generatedAt descending from the API
  const sorted = posts;
  const selectableIds = sorted.filter((p) => p.status === "draft" || p.status === "approved").map((p) => p.id);

  const handleSelectAll = () => {
    if (selectedIds.size > 0) clearSelection();
    else selectAll(selectableIds);
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!(await confirmAction({ title: `선택한 ${ids.length}건을 한 번에 승인할까요?`, description: "승인한 글은 예약 시각이 되면 그대로 발행됩니다. 발행 전이라면 대기열에서 다시 되돌릴 수 있습니다.", confirmLabel: `${ids.length}건 승인` }))) return;
    try {
      const r = await apiPost<{ approved: number }>("/api/queue/bulk-approve", { ids });
      if (r) { showToast(`${r.approved}개 승인`, "success"); clearSelection(); mutate(); }
    } catch (e) { showToast(`실패: ${(e as Error).message}`, "error"); }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!(await confirmAction({ title: `선택한 ${ids.length}건을 삭제할까요?`, description: "삭제한 글은 되돌릴 수 없습니다. 예약된 발행도 함께 취소됩니다.", confirmLabel: `${ids.length}건 삭제`, destructive: true }))) return;
    try {
      const r = await apiPost<{ deleted: number }>("/api/queue/bulk-delete", { ids });
      if (r) { showToast(`${r.deleted}개 삭제`, "success"); clearSelection(); mutate(); }
    } catch (e) { showToast(`실패: ${(e as Error).message}`, "error"); }
  };

  const cfg = (channelConfig || {}) as Record<string, Record<string, unknown>>;

  return (
    <div>
      {/* Filters + Bulk actions — 모바일에서 줄바꿈 */}
      <div className="flex items-center justify-between gap-stack-tight mb-pad-inset flex-wrap">
        <div className="flex gap-micro flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setQueueFilter(f)}
              className={`px-stack py-micro text-caption rounded-chip ${
                queueFilter === f
                  ? "bg-accent/30 text-accent border border-accent/30"
                  : "text-subtle hover:bg-surface-2"
              }`}
            >
              {FILTER_LABELS[f] || f}
            </button>
          ))}
        </div>
        <div className="flex gap-stack-tight items-center flex-wrap">
          {(srcPending?.pending ?? 0) > 0 && (
            <button onClick={handleImportFromSourcing} className="px-stack py-micro text-caption bg-accent/60 text-accent rounded-chip hover:bg-accent">
              소싱에서 가져오기 ({srcPending!.pending})
            </button>
          )}
          {selectableIds.length > 0 && (
            <label className="flex items-center gap-micro text-caption text-subtle cursor-pointer">
              <input type="checkbox" checked={selectedIds.size > 0} onChange={handleSelectAll} className="rounded-chip border-border" />
              전체
            </label>
          )}
          {selectedIds.size > 0 && (
            <>
              <button onClick={handleBulkApprove} className="px-stack py-micro text-caption bg-success text-status-fg rounded-chip hover:bg-success">
                승인 ({selectedIds.size})
              </button>
              <button onClick={handleBulkDelete} className="px-stack py-micro text-caption bg-danger text-status-fg rounded-chip hover:bg-danger">
                삭제 ({selectedIds.size})
              </button>
            </>
          )}
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-stack">
        {sorted.length === 0 ? (
          <p className="text-subtle text-body-sm">글이 없습니다</p>
        ) : (
          sorted.map((p) => (
            <UnifiedPostCard
              key={p.id}
              post={p}
              channelConfig={cfg}
              variant={variant}
              charLimit={charLimit}
              showSeo={showSeo}
              onRefresh={() => mutate()}
              onEditInEditor={onEditInEditor}
              onPickImage={(postId) => setImagePickerPostId(postId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
