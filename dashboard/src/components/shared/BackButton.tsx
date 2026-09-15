"use client";

import { useRouter } from "next/navigation";

// 진짜 뒤로가기 — 히스토리가 있으면 router.back(), 없으면(딥링크 직접 진입) fallback으로.
// 기존엔 채널 페이지가 href="/"(=홈="성과")로 하드코딩돼 "뒤로가 아니라 성과로 감" 버그가 있었다.
export function BackButton({ fallback = "/", label = "뒤로" }: { fallback?: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="text-subtle hover:text-text text-body-sm mb-micro inline-flex min-h-control-touch items-center gap-micro transition-colors"
    >
      &larr; {label}
    </button>
  );
}
