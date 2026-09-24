// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BubbleEditor, CardDeckPanel } from "@/components/studio/BubbleEditor";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import deckD100 from "../studio/fixtures/deck-d100.v2.json";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function deck(): CardDeck {
  return clone(deckD100) as unknown as CardDeck;
}

afterEach(cleanup);

// canvas 미지원 jsdom 환경에서도 CardDeckPanel 이 죽지 않아야 한다(렌더 실패는 화면에
// 문구로만 남는다).
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

describe("BubbleEditor (F4, PR4)", () => {
  it("말풍선 화자 전환은 card-deck-ops.toggleSpeaker 결과를 그대로 반영한다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const onDeckChange = vi.fn();
    render(<BubbleEditor deck={d} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${chatSlide.bubbles![0].id}"]`)!;
    fireEvent.focus(within(bubbleEl).getByRole("textbox"));
    fireEvent.click(within(bubbleEl).getByText("화자 전환"));
    expect(onDeckChange).toHaveBeenCalledTimes(1);
    const next = onDeckChange.mock.calls[0][0] as CardDeck;
    const nextSlide = next.slides.find((s) => s.id === chatSlide.id)!;
    expect(nextSlide.bubbles![0].speaker).not.toBe(chatSlide.bubbles![0].speaker);
    expect(next.revision).toBe(d.revision + 1);
  });

  it("삭제로 마지막 말풍선이 남으면 OPS_DELETE_LAST_BUBBLE 이유를 화면에 보여주고 상태를 바꾸지 않는다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    // 말풍선 하나만 남을 때까지 줄인 픽스처를 만든다.
    const onlyOne: CardDeck = {
      ...d,
      slides: d.slides.map((s) => (s.id === chatSlide.id ? { ...s, bubbles: [s.bubbles![0]] } : s)),
    };
    const onDeckChange = vi.fn();
    render(<BubbleEditor deck={onlyOne} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${chatSlide.bubbles![0].id}"]`)!;
    fireEvent.focus(within(bubbleEl).getByRole("textbox"));
    fireEvent.click(within(bubbleEl).getByText("삭제"));
    expect(onDeckChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/./);
  });

  it("표지 장은 CoverEditor 를 그리고 headline 변경이 onDeckChange 를 부른다", () => {
    const d = deck();
    const cover = d.slides.find((s) => s.role === "cover")!;
    const onDeckChange = vi.fn();
    render(<BubbleEditor deck={d} slideId={cover.id} onDeckChange={onDeckChange} />);
    const textarea = screen.getByLabelText(/표지 헤드라인/);
    fireEvent.change(textarea, { target: { value: "새 헤드라인" } });
    expect(onDeckChange).toHaveBeenCalledTimes(1);
    const next = onDeckChange.mock.calls[0][0] as CardDeck;
    expect(next.slides.find((s) => s.id === cover.id)!.cover!.headline).toBe("새 헤드라인");
  });
});

describe("CardDeckPanel (표지·CTA 고정, 세션맥락: card-deck-ops 순수 함수만 호출)", () => {
  it("표지·CTA 삭제 버튼은 비활성이고 이유 칩이 보인다", () => {
    const d = deck();
    render(<CardDeckPanel deck={d} onDeckChange={vi.fn()} />);
    const lockedChips = document.querySelectorAll("[data-slide-locked]");
    expect(lockedChips.length).toBe(2);
    expect(lockedChips[0]).toHaveTextContent("는 지울 수 없습니다");
  });

  it("장 목록 클릭으로 선택 장이 바뀐다", () => {
    const d = deck();
    render(<CardDeckPanel deck={d} onDeckChange={vi.fn()} />);
    const secondSlide = d.slides[1];
    fireEvent.click(document.querySelector(`[data-slide-id="${secondSlide.id}"]`)!);
    expect(document.querySelector(`[data-slide-id="${secondSlide.id}"]`)).toHaveAttribute("aria-pressed", "true");
  });

  it("장 전환은 이전 말풍선 선택을 비워 새 장 추가가 옛 ID를 참조하지 않는다", () => {
    const d = deck();
    const onDeckChange = vi.fn();
    render(<CardDeckPanel deck={d} onDeckChange={onDeckChange} />);

    fireEvent.click(document.querySelector(`[data-slide-id="${d.slides[1].id}"]`)!);
    fireEvent.click(screen.getByRole("textbox", { name: "말풍선 내용 1" }));
    expect(screen.getByLabelText("선택한 말풍선 도구")).toBeInTheDocument();

    fireEvent.click(document.querySelector(`[data-slide-id="${d.slides[2].id}"]`)!);
    expect(screen.queryByLabelText("선택한 말풍선 도구")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "말풍선 추가" }));

    expect(onDeckChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
