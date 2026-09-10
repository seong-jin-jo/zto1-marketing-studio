"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher, apiPost } from "@/lib/api";
import { useUIStore } from "@/store/ui-store";
import { useToast } from "@/components/layout/Toast";
import { esc } from "@/lib/format";

interface ImageItem {
  url: string;
  filename: string;
}

export function ImagePickerModal() {
  const { imagePickerPostId, setImagePickerPostId } = useUIStore();
  const { showToast } = useToast();
  const isOpen = imagePickerPostId !== null;
  const { data: images, mutate: mutateImages } = useSWR<ImageItem[]>(
    isOpen ? "/api/images" : null,
    fetcher,
  );
  const { data: queueData } = useSWR<{ posts: Array<Record<string, unknown>> }>(
    isOpen ? "/api/queue" : null,
    fetcher,
  );
  const [genPrompt, setGenPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");

  if (!imagePickerPostId) return null;

  const post = (queueData?.posts || []).find((p) => p.id === imagePickerPostId);
  const currentImage = post?.imageUrl as string | undefined;
  const imgList = images || [];

  const handleSelect = async (url: string | null) => {
    await apiPost(`/api/queue/${imagePickerPostId}/update`, { imageUrl: url });
    setImagePickerPostId(null);
    showToast(url ? "이미지 첨부됨" : "이미지 제거됨", "success");
  };

  const handleGenerate = async () => {
    const prompt = genPrompt.trim();
    if (!prompt) return;
    setGenerating(true);
    setGenStatus("AI 이미지 생성 중... (최대 2분 소요)");
    try {
      const res = await apiPost<{ success?: boolean; image?: { url: string }; error?: string }>("/api/generate-image", { prompt });
      if (res?.success && res.image) {
        showToast("이미지 생성 완료", "success");
        mutateImages();
        handleSelect(res.image.url);
      } else {
        showToast(res?.error || "이미지 생성 실패", "error");
        setGenStatus(res?.error || "실패");
        setGenerating(false);
      }
    } catch (e) {
      showToast("이미지 생성 실패: " + (e instanceof Error ? e.message : ""), "error");
      setGenStatus(e instanceof Error ? e.message : "실패");
      setGenerating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-player-surface/70 backdrop-blur-sm flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) setImagePickerPostId(null); }}
    >
      <div className="card p-stack-section w-full max-w-3xl max-h-[80vh] overflow-y-auto mx-pad-inset">
        <div className="flex items-center justify-between mb-pad-inset">
          <h3 className="text-lead font-semibold text-text">이미지 선택</h3>
          <button onClick={() => setImagePickerPostId(null)} className="text-subtle hover:text-text text-subheading">&times;</button>
        </div>

        {/* Generate New */}
        <div className="mb-pad-inset p-stack rounded-control border border-border bg-surface/50">
          <div className="flex items-center gap-stack-tight mb-stack-tight">
            <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-caption text-muted">새 이미지 만들기</span>
          </div>
          <div className="flex gap-stack-tight">
            <input
              type="text"
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              placeholder="이미지 설명 (예: AI와 협업하는 개발자 일러스트)"
              className="flex-1 bg-surface-2 text-muted text-caption p-stack-tight rounded-chip border border-border"
            />
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-stack py-stack-tight text-caption bg-accent text-accent-fg rounded-chip hover:bg-accent-hover shrink-0 disabled:opacity-50"
            >
              {generating ? "Generating..." : "Generate"}
            </button>
          </div>
          {genStatus && <div className="mt-stack-tight text-caption text-subtle">{genStatus}</div>}
        </div>

        {/* Remove current */}
        {currentImage && (
          <button
            onClick={() => handleSelect(null)}
            className="w-full mb-pad-inset p-stack rounded-control border border-danger/40 bg-danger/10 text-danger text-body-sm hover:bg-danger/20"
          >
            현재 이미지 제거
          </button>
        )}

        {/* Image grid */}
        {imgList.length === 0 ? (
          <p className="text-subtle text-body-sm text-center py-region">
            No images available. Generate one above or upload images to data/images/
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-stack">
            {imgList.map((img) => (
              <div
                key={img.filename}
                onClick={(e) => { e.stopPropagation(); handleSelect(img.url); }}
                className={`cursor-pointer rounded-control border overflow-hidden transition-colors ${
                  currentImage === img.url
                    ? "border-accent ring-2 ring-accent/30"
                    : "border-border hover:border-accent"
                }`}
              >
                <div className="aspect-square bg-surface">
                  <img src={img.url} className="w-full h-full object-cover" loading="lazy" alt={img.filename} />
                </div>
                <div className="p-stack-tight">
                  <p className="text-caption text-subtle truncate" title={img.filename}>{img.filename}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
