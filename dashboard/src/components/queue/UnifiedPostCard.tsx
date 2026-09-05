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

const CHANNEL_BADGE_CLASS: Record<string, string> = {
  published: "bg-success/15 text-success",
  failed: "bg-danger/15 text-danger",
  pending: "bg-surface-2 text-subtle",
  skipped: "bg-surface-2 text-subtle",
};

const CHANNEL_BADGE_LABELS: Record<string, string> = {
  threads: "T",
  x: "X",
  instagram: "IG",
  facebook: "FB",
  linkedin: "LI",
  bluesky: "BS",
  pinterest: "PIN",
  tumblr: "TUM",
  tiktok: "TT",
  youtube: "YT",
  naver_blog: "NB",
  medium: "MD",
  substack: "SS",
};

function channelBadge(channelKey: string, ch: { status?: string } | undefined) {
  if (!ch) return null;
  const label = CHANNEL_BADGE_LABELS[channelKey] || channelKey.toUpperCase().slice(0, 3);
  const status = ch.status || "pending";
  return (
    <span className={`text-caption px-stack-tight py-micro rounded-chip ${CHANNEL_BADGE_CLASS[status] || "bg-surface-2 text-muted"}`}>
      {label}: {status}
    </span>
  );
}

export interface UnifiedPostCardProps {
  post: Post;
  channelConfig?: Record<string, Record<string, unknown>>;
  variant?: "text" | "visual" | "blog";
  charLimit?: number;
  showSeo?: boolean;
  onRefresh: () => void;
  onEditInEditor?: (postId: string) => void;
  onPickImage?: (postId: string) => void;
}

export function UnifiedPostCard({
  post,
  channelConfig,
  variant = "text",
  charLimit,
  showSeo = false,
  onRefresh,
  onEditInEditor,
  onPickImage,
}: UnifiedPostCardProps) {
  const { showToast } = useToast();
  const { editingPost, setEditingPost, selectedIds, toggleSelect } = useUIStore();
  const [editText, setEditText] = useState(post.text);
  const [makingVariants, setMakingVariants] = useState(false);
  const isEditing = editingPost === post.id;
  const isSelected = selectedIds.has(post.id);
  const channels = post.channels || {};

  const slides = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);
  const isCard = slides.length > 1 || !!post.cardBatchId;

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

  const handleMakeVariants = async () => {
    if (makingVariants) return;
    setMakingVariants(true);
    try {
      const r = await apiPost<{ created: number }>(`/api/queue/${post.id}/variants`, { count: 3 });
      showToast(`텍스트 변형 ${r?.created ?? 0}개 생성됨 (같은 영상)`, "success");
      onRefresh();
    } catch (e) { showToast(`변형 생성 실패: ${(e as Error).message}`, "error"); }
    finally { setMakingVariants(false); }
  };

  const handleRemoveImage = async () => {
    try {
      await apiPost(`/api/queue/${post.id}/update`, { imageUrl: null });
      showToast("이미지 제거됨", "success");
      onRefresh();
    } catch (e) { showToast(`실패: ${(e as Error).message}`, "error"); }
  };

  const charWarning = charLimit && post.text.length > charLimit;

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
          {isCard && variant === "visual" && (
            <span className="text-caption px-stack-tight py-micro rounded-chip bg-accent-soft text-accent">
              Card {slides.length} slides
            </span>
          )}
          <span className="text-caption text-subtle">{post.topic || ""}</span>
          {post.model && <span className="text-caption text-subtle">{post.model}</span>}
        </div>
        <div className="flex gap-micro flex-wrap justify-end">
          {Object.entries(channels).map(([key, ch]) => (
            <span key={key}>{channelBadge(key, ch)}</span>
          ))}
        </div>
      </div>

      {/* Image — variant controls layout */}
      {variant === "visual" ? (
        /* Visual: large carousel slides */
        slides.length > 0 ? (
          <div className="mb-stack">
            <div className="scrollbar-semantic flex gap-stack-tight overflow-x-auto pb-stack-tight">
              {slides.map((s, i) => (
                <div key={i} className="flex-shrink-0 w-36 h-44 rounded-control overflow-hidden border border-border">
                  <img src={s} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-stack w-36 h-44 rounded-control border border-dashed border-border bg-surface/30 flex items-center justify-center">
            <span className="text-subtle text-caption">이미지 없음</span>
          </div>
        )
      ) : variant === "blog" ? (
        /* Blog: small thumbnail */
        post.imageUrl ? (
          <div className="mb-stack-tight float-right ml-stack max-w-30">
            <img src={post.imageUrl} alt="Thumbnail" className="w-full rounded-chip border border-border" />
          </div>
        ) : null
      ) : (
        /* Text: medium image */
        post.imageUrl ? (
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
        ) : null
      )}

      {/* Video for repurposed clips */}
      {(post.videoFilename || post.videoUrl) && (
        <div className="mb-stack-tight">
          <video
            src={post.videoUrl || `/videos/${post.videoFilename}`}
            poster={post.videoThumbnail || undefined}
            controls
            preload="none"
            className="max-h-52 w-full rounded-chip border border-border"
          />
          {post.status === "draft" && (
            <button
              onClick={handleMakeVariants}
              disabled={makingVariants}
              className="mt-stack-tight px-stack-tight py-micro text-caption bg-accent-soft text-accent rounded-chip hover:bg-accent-hover disabled:opacity-50"
              title="이 클립을 그대로 두고 텍스트(캡션)만 다르게 한 변형을 큐에 추가"
            >
              {makingVariants ? "변형 생성 중…" : "이 클립으로 텍스트 변형 3개 생성"}
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
          {charLimit && (
            <p className={`text-caption mb-micro ${editText.length > charLimit ? "text-danger" : "text-subtle"}`}>
              {editText.length}/{charLimit}
            </p>
          )}
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
        <>
          <p className={`text-body-sm text-muted mb-stack-tight whitespace-pre-wrap ${variant === "visual" ? "line-clamp-4" : ""}`}>{post.text}</p>
          {charWarning && (
            <p className="text-caption text-danger mb-micro">{post.text.length}/{charLimit} 글자 초과</p>
          )}
        </>
      )}

      {/* Quality indicators */}
      {post.status === "draft" && (
        <div className="flex gap-micro mb-stack-tight flex-wrap">
          {post.text.length < 30 && <span className="text-caption px-stack-tight py-micro rounded-chip bg-warning/15 text-warning">짧음</span>}
          {(!post.hashtags || post.hashtags.length === 0) && <span className="text-caption px-stack-tight py-micro rounded-chip bg-surface-2 text-subtle">해시태그 없음</span>}
          {variant === "visual" && !post.imageUrl && <span className="text-caption px-stack-tight py-micro rounded-chip bg-danger/15 text-danger">이미지 필요</span>}
        </div>
      )}

      {/* SEO keyword badge (blog only) */}
      {showSeo && post.seoKeyword && (
        <div className="mb-stack-tight">
          <span className="text-caption px-stack-tight py-micro rounded-chip bg-accent/40 text-accent">SEO: {post.seoKeyword}</span>
        </div>
      )}

      {/* Hashtags / Tags */}
      {((post.hashtags && post.hashtags.length > 0) || (post.tags && post.tags.length > 0)) && (
        <div className="flex flex-wrap gap-micro mb-stack-tight">
          {(post.hashtags || []).map((h) => (
            <span key={h} className="text-caption text-accent">#{h}</span>
          ))}
          {(post.tags || []).map((t) => (
            <span key={t} className="text-caption px-stack-tight py-micro rounded-chip bg-surface-2 text-subtle">{t}</span>
          ))}
        </div>
      )}

      {/* Engagement (published only) */}
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
      {!isEditing && (
        <div className="flex gap-stack-tight mt-stack-tight pt-stack-tight border-t border-border/50">
          {post.status === "draft" && (
            <button onClick={handleApprove} className="px-stack-tight py-micro text-caption bg-success text-status-fg rounded-chip hover:bg-success">승인</button>
          )}
          {onEditInEditor ? (
            <button onClick={() => onEditInEditor(post.id)} className="px-stack-tight py-micro text-caption bg-surface-2 text-muted rounded-chip hover:bg-surface-2">수정</button>
          ) : (
            <button onClick={() => { setEditText(post.text); setEditingPost(post.id); }} className="px-stack-tight py-micro text-caption bg-surface-2 text-muted rounded-chip hover:bg-surface-2">수정</button>
          )}
          {onPickImage && post.status === "draft" && !onEditInEditor && (
            <button onClick={() => onPickImage(post.id)} className="px-stack-tight py-micro text-caption bg-accent-soft text-accent rounded-chip hover:bg-accent-hover">이미지</button>
          )}
          {post.status !== "published" && (
            <button onClick={handleDelete} className="px-stack-tight py-micro text-caption bg-danger/15 text-danger rounded-chip hover:bg-danger/25">삭제</button>
          )}
          {post.status === "published" && (
            <a href="/" className="px-stack-tight py-micro text-caption bg-accent-soft text-accent rounded-chip hover:bg-accent-hover">성과 보기 →</a>
          )}
        </div>
      )}
    </div>
  );
}
