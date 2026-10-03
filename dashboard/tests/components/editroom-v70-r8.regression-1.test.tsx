// @vitest-environment jsdom
/**
 * PR85 8차 리뷰 회귀.
 *
 * Regression: PR85-R8-MAJOR-01 — 첫 자동 분할 뒤 새로 생긴 장의 넘침 검사가 중단됐다.
 * Regression: PR85-R8-MAJOR-02 — 글 편집기에 리치 HTML을 붙이면 DOM과 저장 세그먼트가 갈렸다.
 * Found by /qa on 2026-09-28.
 * Report: docs/qa/qa-tracker.md
 */
import "@testing-library/jest-dom/vitest";
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardDeckPanel } from "@/components/studio/BubbleEditor";
import { EditRoom } from "@/components/studio/StudioRooms";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import type { ContentEditFormat } from "@/lib/studio/content-edit-format";
import deckFixture from "../studio/fixtures/deck-d100.v2.json";

vi.mock("@/lib/studio/card-templates/chat-bubble", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studio/card-templates/chat-bubble")>(
    "@/lib/studio/card-templates/chat-bubble",
  );
  return {
    ...actual,
    renderChatBubbleSlideToCanvas: vi.fn(async ({ slide }: Parameters<typeof actual.renderChatBubbleSlideToCanvas>[0]) => {
      if (slide.role === "chat" && (slide.bubbles?.length ?? 0) > 1) {
        throw new actual.ChatBubbleRenderError("말풍선이 카드보다 깁니다");
      }
      return document.createElement("canvas");
    }),
  };
});

afterEach(() => cleanup());

function overflowingDeck(): CardDeck {
  const source = JSON.parse(JSON.stringify(deckFixture)) as CardDeck;
  const cover = source.slides.find((slide) => slide.role === "cover")!;
  const chat = source.slides.find((slide) => slide.role === "chat")!;
  const cta = source.slides.find((slide) => slide.role === "cta")!;
  const seed = chat.bubbles![0];
  chat.bubbles = Array.from({ length: 4 }, (_, index) => ({
    ...seed,
    id: `r8-bubble-${index}`,
    order: index,
    segments: [{ text: `말풍선 ${index + 1}`, bold: false }],
  }));
  source.slides = [cover, chat, cta].map((slide, order) => ({ ...slide, order }));
  source.revision += 1;
  return source;
}

describe("PR85 8차 리뷰", () => {
  it("PR85-R8-MAJOR-01 정상: 새로 생긴 장도 다시 검사해 모든 연속 넘침을 자동 분할한다", async () => {
    const initial = overflowingDeck();
    const chatId = initial.slides.find((slide) => slide.role === "chat")!.id;
    let latest = initial;

    function Harness() {
      const [deck, setDeck] = useState(initial);
      latest = deck;
      return <CardDeckPanel deck={deck} onDeckChange={setDeck} />;
    }

    render(<Harness />);
    fireEvent.click(document.querySelector(`[data-slide-id="${chatId}"]`)!);

    await waitFor(() => {
      const chatSlides = latest.slides.filter((slide) => slide.role === "chat");
      expect(chatSlides).toHaveLength(4);
      expect(chatSlides.every((slide) => slide.bubbles?.length === 1)).toBe(true);
      expect(screen.getByRole("status")).toHaveTextContent("이 장은 2장으로 나뉩니다");
    }, { timeout: 5_000 });
  });

  it("PR85-R8-MAJOR-02 거절: 리치 붙여넣기는 평문만 삽입해 DOM과 저장 세그먼트를 일치시킨다", () => {
    const onFormatChange = vi.fn<(format: ContentEditFormat) => void>();
    render(<EditRoom lines={["원문"]} onLinesChange={vi.fn()} kind="text" onFormatChange={onFormatChange} />);
    const editor = screen.getByRole("textbox", { name: "글 전체" });
    const range = document.createRange();
    range.selectNodeContents(editor);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    const plain = "붙여넣은 평문";
    const html = '<b style="font-weight:900">붙여넣은 평문</b><img src="x" onerror="window.__r8=1">';
    const allowedDefault = fireEvent.paste(editor, {
      clipboardData: { getData: (type: string) => (type === "text/plain" ? plain : html) },
    });
    if (allowedDefault) {
      editor.innerHTML = html;
      fireEvent.input(editor);
    }

    expect(allowedDefault).toBe(false);
    expect(editor.querySelector("b, img")).toBeNull();
    expect(editor).toHaveTextContent(plain);
    expect(onFormatChange).toHaveBeenLastCalledWith({
      kind: "text",
      segments: [{ text: plain, bold: false }],
    });
  });
});
