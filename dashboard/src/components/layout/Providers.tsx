"use client";

import { useEffect } from "react";
import { SWRConfig, useSWRConfig } from "swr";
import { AUTH_CACHE_INVALIDATION_EVENT } from "@/lib/api";
import { ToastProvider } from "./Toast";

function AuthCacheInvalidator() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const clearProtectedData = () => {
      void mutate(() => true, undefined, { revalidate: false });
    };
    window.addEventListener(AUTH_CACHE_INVALIDATION_EVENT, clearProtectedData);
    return () => window.removeEventListener(AUTH_CACHE_INVALIDATION_EVENT, clearProtectedData);
  }, [mutate]);

  return null;
}

// 테마는 data-theme(layout FOUC 스크립트 + ThemeToggle + globals.css)로 직접 관리한다.
// next-themes ThemeProvider는 class 기반 + defaultTheme="dark"라 data-theme 시스템과 충돌해
// 제거. (라이트 기본을 dark로 덮어쓰던 잔재 — 사용처 0, dark: 변형 0 확인.)
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, errorRetryCount: 2 }}>
      <AuthCacheInvalidator />
      <ToastProvider>{children}</ToastProvider>
    </SWRConfig>
  );
}
