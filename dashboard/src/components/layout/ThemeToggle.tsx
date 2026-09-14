"use client";

import { useEffect, useState } from "react";

// 라이트(기본)/다크 토글. <html data-theme> + localStorage 'theme'. FOUC 방지는 layout의 인라인 스크립트가 담당.
export function ThemeToggle({ compactOnNarrow = false }: { compactOnNarrow?: boolean }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch { /* ignore */ }
    setDark(!dark);
  };
  return (
    <button
      onClick={toggle}
      className="min-h-control-touch w-full flex items-center gap-stack-tight px-micro py-micro text-caption text-subtle hover:text-muted transition-colors"
      title="테마 전환"
    >
      <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        {dark ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0-1.42-1.42M7.06 7.06 5.64 5.64M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.35 15.35A9 9 0 0 1 8.65 3.65a9 9 0 1 0 11.7 11.7Z" />
        )}
      </svg>
      <span className={compactOnNarrow ? "md:sr-only" : ""}>{dark ? "라이트 모드" : "다크 모드"}</span>
    </button>
  );
}
