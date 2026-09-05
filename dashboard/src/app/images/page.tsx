"use client";

import useSWR from "swr";
import { fetcher, apiDelete } from "@/lib/api";
import { useToast } from "@/components/layout/Toast";
import { fmtTime, fmtBytes } from "@/lib/format";

interface ImageItem {
  filename: string;
  url: string;
  size: number;
  createdAt: string;
}

export default function ImagesPage() {
  const { data, mutate } = useSWR<ImageItem[]>("/api/images", fetcher);
  const { showToast } = useToast();
  const images = data || [];

  const handleCopyUrl = (url: string) => {
    const full = /^https?:\/\//i.test(url) ? url : window.location.origin + url;
    navigator.clipboard.writeText(full).then(() => showToast("URL 복사됨", "success"));
  };

  const handleDelete = async (filename: string) => {
    if (!confirm("이미지를 삭제하시겠습니까?")) return;
    try {
      await apiDelete(`/api/images/${encodeURIComponent(filename)}`);
      showToast("삭제됨", "success");
      mutate();
    } catch (e) { showToast(`삭제 실패: ${(e as Error).message}`, "error"); }
  };

  return (
    <div className="p-stack-section max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-stack-section">
        <div>
          <h2 className="text-subheading font-bold text-text">이미지</h2>
          <p className="text-body-sm text-subtle mt-micro">{images.length}개 이미지. AI 생성 이미지 갤러리</p>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="card p-wide text-center">
          <svg className="w-12 h-12 text-subtle mx-auto mb-stack" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-subtle">아직 생성된 이미지가 없습니다</p>
          <p className="text-caption text-subtle mt-micro">이미지 생성 도구로 이미지를 만들면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-pad-inset">
          {images.map((img) => (
            <div key={img.filename} className="card overflow-hidden group relative">
              <div className="aspect-square bg-surface flex items-center justify-center">
                <img src={img.url} alt={img.filename} className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="p-stack">
                <p className="text-caption text-muted truncate" title={img.filename}>{img.filename}</p>
                <div className="flex items-center justify-between mt-micro">
                  <span className="text-caption text-subtle">{fmtBytes(img.size)}</span>
                  <span className="text-caption text-subtle">{fmtTime(img.createdAt)}</span>
                </div>
              </div>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-micro">
                <button
                  onClick={() => handleCopyUrl(img.url)}
                  className="p-stack-tight bg-surface/80 rounded-chip text-muted hover:text-text"
                  title="URL 복사"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(img.filename)}
                  className="p-stack-tight bg-surface/80 rounded-chip text-danger hover:text-danger"
                  title="삭제"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
