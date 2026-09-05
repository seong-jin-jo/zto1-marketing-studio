"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";
import { useUIStore } from "@/store/ui-store";
import { fmtTime } from "@/lib/format";
import type { Post } from "@/types/queue";

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-warning/15 text-warning",
  approved: "bg-accent-soft text-accent",
  published: "bg-success/15 text-success",
  failed: "bg-danger/15 text-danger",
};

function channelBadge(label: string, ch: { status: string } | undefined) {
  if (!ch) return null;
  const c: Record<string, string> = {
    published: "bg-success/15 text-success",
    failed: "bg-danger/15 text-danger",
    pending: "bg-surface-2 text-subtle",
    skipped: "bg-surface-2 text-subtle",
  };
  return (
    <span className={`text-caption px-stack-tight py-micro rounded-chip ${c[ch.status] || "bg-surface-2 text-muted"}`}>
      {label}: {ch.status}
    </span>
  );
}

interface PostCardProps {
  post: Post;
  channelConfig: Record<string, { connected?: boolean; enabled?: boolean; status?: string }>;
  onRefresh: () => void;
  onPickImage?: (postId: string) => void;
}

export function PostCard({ post, channelConfig, onRefresh, onPickImage }: PostCardProps) {
  const { showToast } = useToast();
  const { editingPost, setEditingPost, selectedIds, toggleSelect } = useUIStore();
  const [editText, setEditText] = useState(post.text);
  const isEditing = editingPost === post.id;
  const isSelected = selectedIds.has(post.id);
  const channels = post.channels || {};

  const handleApprove = async () => {
    try {
      await apiPost(`/api/queue/${post.id}/approve`, { hours: 2 });
      showToast("승인 완료", "success");
      onRefresh();
    } catch (e) { showToast(`승인 실패: ${(e as Error).message}`, "error"); }
  };

  const handleSave = async () => {
    try {
      await apiPost(`/api/queue/${post.id}/update`, { text: editText });
      showToast("수정 완료", "success");
      setEditingPost(null);
      onRefresh();
    } catch (e) { showToast(`수정 실패: ${(e as Error).message}`, "error"); }
  };

  const handleDelete = async () => {
    if (!confirm("정말 삭제?")) return;
    try {
      await apiPost(`/api/queue/${post.id}/delete`);
      showToast("삭제 완료", "success");
      onRefresh();
    } catch (e) { showToast(`삭제 실패: ${(e as Error).message}`, "error"); }
  };

  const handleRemoveImage = async () => {
    try {
      await apiPost(`/api/queue/${post.id}/update`, { imageUrl: null });
      showToast("이미지 제거됨", "success");
      onRefresh();
    } catch (e) { showToast(`실패: ${(e as Error).message}`, "error"); }
  };

  return (
    <div className="card p-pad-inset">
      {/* Header */}
      <div className="flex items-start justify-between mb-stack-tight">
        <div className="flex items-center gap-stack-tight">
          {(post.status === "draft" || post.status === "approved") && (
            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(post.id)} className="rounded-chip border-border" />
          )}
          <span className={`text-caption px-stack-tight py-micro rounded-chip ${STATUS_CLASS[post.status] || "bg-surface-2 text-muted"}`}>
            {post.status}
          </span>
          <span className="text-caption text-subtle">{post.topic || ""}</span>
          {post.model && <span className="text-caption text-subtle">{post.model}</span>}
        </div>
        <div className="flex gap-micro">
          {channelBadge("T", channels.threads)}
        </div>
      </div>

      {/* Image */}
      {post.imageUrl && (
        <div className="mb-stack-tight relative group/img max-w-lg">
          <img src={post.imageUrl} alt="Post image" className="block w-full rounded-control border border-border" />
          {post.status === "draft" && (
            <button
              onClick={handleRemoveImage}
              className="absolute top-2 right-2 p-micro bg-danger rounded-chip text-status-fg hover:opacity-80 opacity-0 group-hover/img:opacity-100 transition-opacity"
              title="이미지 제거"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Text / Edit */}
      {isEditing ? (
        <>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full bg-surface-2 text-muted text-body-sm p-stack-tight rounded-chip border border-border mb-stack-tight"
            rows={4}
          />
          <div className="flex gap-stack-tight">
            <button onClick={handleSave} className="px-stack-tight py-micro text-caption bg-accent text-accent-fg rounded-chip">저장</button>
            <button onClick={() => setEditingPost(null)} className="px-stack-tight py-micro text-caption bg-surface-2 text-muted rounded-chip">취소</button>
            {onPickImage && (
              <button onClick={() => onPickImage(post.id)} className="px-stack-tight py-micro text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover">
                {post.imageUrl ? "Change Image" : "Add Image"}
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-body-sm text-muted mb-stack-tight whitespace-pre-wrap">{post.text}</p>
      )}

      {/* Hashtags */}
      {post.hashtags && post.hashtags.length > 0 && (
        <div className="flex gap-micro mb-stack-tight">
          {post.hashtags.map((h) => (
            <span key={h} className="text-caption text-accent">#{h}</span>
          ))}
        </div>
      )}

      {/* Engagement */}
      {post.engagement?.views != null && (
        <div className="flex gap-pad-inset text-caption text-subtle">
          <span>조회: {post.engagement.views}</span>
          <span>좋아요: {post.engagement.likes || 0}</span>
          <span>답글: {post.engagement.replies || 0}</span>
        </div>
      )}

      {/* Dates */}
      <div className="flex flex-wrap gap-stack text-caption text-subtle mt-micro">
        {post.generatedAt && <span>생성: {fmtTime(post.generatedAt)}</span>}
        {post.approvedAt && <span>승인: {fmtTime(post.approvedAt)}</span>}
        {post.scheduledAt && post.status === "approved" && (
          <span className="text-accent">발행예정: {fmtTime(post.scheduledAt)}</span>
        )}
        {post.publishedAt && (
          <span className="text-success">발행: {fmtTime(post.publishedAt)}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-stack-tight mt-stack-tight">
        {post.status === "draft" && (
          <>
            <button onClick={handleApprove} className="px-stack-tight py-micro text-caption bg-success text-status-fg rounded-chip hover:bg-success">승인</button>
            <button onClick={() => { setEditText(post.text); setEditingPost(post.id); }} className="px-stack-tight py-micro text-caption bg-surface-2 text-muted rounded-chip hover:bg-surface-2">수정</button>
            {onPickImage && (
              <button onClick={() => onPickImage(post.id)} className="px-stack-tight py-micro text-caption bg-accent-soft text-accent rounded-chip hover:bg-accent-hover">이미지</button>
            )}
          </>
        )}
        {post.status !== "published" && (
          <button onClick={handleDelete} className="px-stack-tight py-micro text-caption bg-danger/15 text-danger rounded-chip hover:bg-danger/25">삭제</button>
        )}
      </div>
    </div>
  );
}
