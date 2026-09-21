"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/shared/Button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// "홈 화면에 추가" 버튼. beforeinstallprompt 를 못 받는 브라우저(iOS Safari, 이미 설치됨)에서는
// 렌더하지 않는다 — 눌러도 아무 일 없는 죽은 버튼을 두지 않는다.
export function InstallPrompt({ compactOnNarrow = false }: { compactOnNarrow?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia?.("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <Button
      onClick={handleInstall}
      variant="secondary"
      className="min-w-full w-full justify-start gap-stack-tight border-0 bg-transparent px-micro py-micro text-caption text-subtle hover:bg-transparent hover:text-muted"
      title="홈 화면에 추가"
    >
      <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" />
      </svg>
      <span className={compactOnNarrow ? "md:sr-only" : ""}>홈 화면에 추가</span>
    </Button>
  );
}
