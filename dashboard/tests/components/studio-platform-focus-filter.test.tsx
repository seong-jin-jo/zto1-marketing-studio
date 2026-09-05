// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PLATFORM_FOCUS_OPTIONS,
  PlatformFocusFilter,
  type PlatformFocus,
} from "@/components/studio/PlatformFocusFilter";
import type { PreviewPlatform } from "@/components/studio/PlatformPreview";

const PLATFORMS = PLATFORM_FOCUS_OPTIONS.filter(
  (option): option is { key: PreviewPlatform; label: string } => option.key !== "all",
);

function PublishPreviewHarness() {
  const [captions, setCaptions] = useState<Record<string, string>>({ threads: "기존 본문" });
  const [selected, setSelected] = useState<Record<string, boolean>>({ threads: true });

  return (
    <PlatformFocusFilter>
      {(focus: PlatformFocus) => {
        const visible = focus === "all"
          ? PLATFORMS
          : PLATFORMS.filter((platform) => platform.key === focus);
        return (
          <div>
            {visible.map((platform) => (
              <section key={platform.key} data-focus-card={platform.key}>
                <h2>{platform.label}</h2>
                <label>
                  발행 대상
                  <input
                    type="checkbox"
                    aria-label={`${platform.label} 발행 대상`}
                    checked={Boolean(selected[platform.key])}
                    onChange={(event) => setSelected((current) => ({
                      ...current,
                      [platform.key]: event.target.checked,
                    }))}
                  />
                </label>
                <label>
                  본문
                  <textarea
                    aria-label={`${platform.label} 본문`}
                    value={captions[platform.key] || ""}
                    onChange={(event) => setCaptions((current) => ({
                      ...current,
                      [platform.key]: event.target.value,
                    }))}
                  />
                </label>
              </section>
            ))}
          </div>
        );
      }}
    </PlatformFocusFilter>
  );
}

afterEach(cleanup);

describe("발행실 플랫폼 집중 필터 계약", () => {
  it("PUB-FOCUS-01 정상: 전체 7곳이 기본값이며 플랫폼 카드 일곱 장을 보여 준다", () => {
    render(<PublishPreviewHarness />);

    expect(screen.getByRole("button", { name: "전체 7곳" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelectorAll("[data-focus-card]")).toHaveLength(7);
  });

  it("PUB-FOCUS-02 정상: 플랫폼 하나를 고르면 그 플랫폼 카드 한 장만 보여 준다", () => {
    render(<PublishPreviewHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Instagram Reels" }));

    expect(screen.getByRole("button", { name: "Instagram Reels" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelectorAll("[data-focus-card]")).toHaveLength(1);
    expect(document.querySelector('[data-focus-card="reels"]')).toBeInTheDocument();
  });

  it("PUB-FOCUS-03 거절: 필터를 바꿔도 입력값과 발행 대상 선택을 지우지 않는다", () => {
    render(<PublishPreviewHarness />);

    const threadsBody = screen.getByRole("textbox", { name: "Threads 본문" });
    fireEvent.change(threadsBody, { target: { value: "필터 뒤에도 남을 본문" } });
    expect(screen.getByRole("checkbox", { name: "Threads 발행 대상" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "X" }));
    expect(screen.queryByRole("textbox", { name: "Threads 본문" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Threads" }));

    expect(screen.getByRole("textbox", { name: "Threads 본문" })).toHaveValue("필터 뒤에도 남을 본문");
    expect(screen.getByRole("checkbox", { name: "Threads 발행 대상" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "전체 7곳" }));
    expect(document.querySelectorAll("[data-focus-card]")).toHaveLength(7);
    expect(screen.getByRole("textbox", { name: "Threads 본문" })).toHaveValue("필터 뒤에도 남을 본문");
  });

  it("V70-FILTER-01 정상: 플랫폼 필터는 한 줄 가로 스크롤이며 줄바꿈하지 않는다", () => {
    render(<PublishPreviewHarness />);

    const filter = document.querySelector("[data-platform-filter]");
    expect(filter).toHaveClass("flex-nowrap", "overflow-x-auto");
    expect(filter).not.toHaveClass("flex-wrap");
    for (const button of screen.getAllByRole("button").slice(0, PLATFORM_FOCUS_OPTIONS.length)) {
      expect(button).toHaveClass("min-h-control-touch");
    }
  });
});
