"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/shared/Button";
import type { PreviewPlatform } from "@/components/studio/PlatformPreview";

export type PlatformFocus = "all" | PreviewPlatform;

export const PLATFORM_FOCUS_OPTIONS: ReadonlyArray<{ key: PlatformFocus; label: string }> = [
  { key: "all", label: "전체 7곳" },
  { key: "threads", label: "Threads" },
  { key: "x", label: "X" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "shorts", label: "YouTube Shorts" },
  { key: "reels", label: "Instagram Reels" },
  { key: "tiktok", label: "TikTok" },
];

export function PlatformFocusFilter({
  children,
}: {
  children: (focus: PlatformFocus) => ReactNode;
}) {
  const [focus, setFocus] = useState<PlatformFocus>("all");

  return (
    <>
      <div
        data-platform-filter
        aria-label="플랫폼 집중 필터"
        className="scrollbar-semantic flex flex-nowrap gap-stack-tight overflow-x-auto pb-micro"
      >
        {PLATFORM_FOCUS_OPTIONS.map((option) => {
          const active = focus === option.key;
          return (
            <Button
              key={option.key}
              size="sm"
              variant="secondary"
              aria-pressed={active}
              data-testid={`publish-focus-${option.key}`}
              className={`rounded-pill !bg-surface ${active ? "!border-accent !text-accent" : ""}`}
              onClick={() => setFocus(option.key)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
      {children(focus)}
    </>
  );
}
