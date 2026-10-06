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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
  it("PR94-R2-MAJOR-02 정상: 선택 장 위 툴바 없이 카드 아래 세 행동만 있고 표지·CTA는 잠긴다", () => {
    const d = deck();
    render(<CardDeckPanel deck={d} onDeckChange={vi.fn()} />);
    expect(document.querySelectorAll("[data-selected-slide-toolbar]")).toHaveLength(0);
    expect(within(document.querySelector("[data-selected-slide-actions]")!).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "이 장 복제",
      "이 장 삭제",
      "말풍선 추가",
    ]);
    expect(document.querySelectorAll('[data-slide-draggable="false"]')).toHaveLength(2);
  });

  it("장 목록 클릭으로 선택 장이 바뀐다", () => {
    const d = deck();
    render(<CardDeckPanel deck={d} onDeckChange={vi.fn()} />);
    const secondSlide = d.slides[1];
    fireEvent.click(document.querySelector(`[data-slide-id="${secondSlide.id}"]`)!);
    expect(document.querySelector(`[data-slide-id="${secondSlide.id}"]`)).toHaveAttribute("aria-pressed", "true");
  });

  it("PR85-R7-M6 본문 장을 끌어 놓아 순서를 바꾸고 표지·CTA는 draggable이 아니다", () => {
    const d = deck();
    const onDeckChange = vi.fn();
    render(<CardDeckPanel deck={d} onDeckChange={onDeckChange} />);
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-slide-draggable]"));
    expect(items[0]).toHaveAttribute("data-slide-draggable", "false");
    expect(items.at(-1)).toHaveAttribute("data-slide-draggable", "false");
    const transfer = { effectAllowed: "none", setData: vi.fn(), getData: vi.fn(() => "1") };
    fireEvent.dragStart(items[1], { dataTransfer: transfer });
    fireEvent.dragOver(items[2], { dataTransfer: transfer });
    fireEvent.drop(items[2], { dataTransfer: transfer });
    const next = onDeckChange.mock.calls[0][0] as CardDeck;
    expect(next.slides[2].id).toBe(d.slides[1].id);
    expect(next.slides[0].role).toBe("cover");
    expect(next.slides.at(-1)?.role).toBe("cta");
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

  it("S5-AC1 정상: 말풍선 손잡이를 다른 장 썸네일에 놓으면 내용·화자·세그먼트가 보존된다", () => {
    let current = deck();
    const original = structuredClone(current.slides[1].bubbles![0]);
    const onDeckChange = vi.fn((next: CardDeck) => { current = next; });
    const view = render(<CardDeckPanel deck={current} onDeckChange={onDeckChange} />);
    fireEvent.click(document.querySelector(`[data-slide-id="${current.slides[1].id}"]`)!);

    const transfer = { effectAllowed: "none", dropEffect: "none", setData: vi.fn(), getData: vi.fn(() => "") };
    fireEvent.dragStart(screen.getByRole("button", { name: "1번째 말풍선 옮기기" }), { dataTransfer: transfer });
    const target = document.querySelector(`[data-slide-id="${current.slides[2].id}"]`)!.closest("[data-slide-draggable]")!;
    fireEvent.dragOver(target, { dataTransfer: transfer });
    fireEvent.drop(target, { dataTransfer: transfer });

    view.rerender(<CardDeckPanel deck={current} onDeckChange={onDeckChange} />);
    expect(current.slides[2].bubbles?.at(-1)).toEqual({ ...original, order: current.slides[2].bubbles!.length - 1 });
    expect(current.slides[1].bubbles?.some((bubble) => bubble.id === original.id)).toBe(false);
  });

  it("S5-AC1 거절: 취소한 drag는 다음 장 drop에 남아 있지 않는다", () => {
    let current = deck();
    const before = structuredClone(current);
    const onDeckChange = vi.fn((next: CardDeck) => { current = next; });
    render(<CardDeckPanel deck={current} onDeckChange={onDeckChange} />);
    fireEvent.click(document.querySelector(`[data-slide-id="${current.slides[1].id}"]`)!);
    const transfer = { effectAllowed: "none", dropEffect: "none", setData: vi.fn(), getData: vi.fn(() => "") };
    const handle = screen.getByRole("button", { name: "1번째 말풍선 옮기기" });
    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.dragEnd(handle, { dataTransfer: transfer });
    const target = document.querySelector(`[data-slide-id="${current.slides[2].id}"]`)!.closest("[data-slide-draggable]")!;
    fireEvent.drop(target, { dataTransfer: transfer });
    expect(current).toEqual(before);
    expect(onDeckChange).not.toHaveBeenCalled();
  });

  it("S5-AC2 정상: 덱 전체 화자 교환은 한 번에 반영되고 실행 취소 한 번으로 원복된다", () => {
    let current = deck();
    const originalSpeakers = current.slides.map((slide) => slide.bubbles?.map((bubble) => bubble.speaker));
    const onDeckChange = vi.fn((next: CardDeck) => { current = next; });
    const view = render(<CardDeckPanel deck={current} onDeckChange={onDeckChange} />);

    fireEvent.click(screen.getByRole("button", { name: "덱 전체 화자 서로 바꾸기" }));
    view.rerender(<CardDeckPanel deck={current} onDeckChange={onDeckChange} />);
    expect(current.slides.map((slide) => slide.bubbles?.map((bubble) => bubble.speaker))).not.toEqual(originalSpeakers);

    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(current.slides.map((slide) => slide.bubbles?.map((bubble) => bubble.speaker))).toEqual(originalSpeakers);
  });

  it("S5-AC3 정상: 후보 3개를 원문 옆에서 비교하고 고른 후보만 적용하며 사실 경고를 남긴다", async () => {
    let current = deck();
    const original = current.slides[1].bubbles!.map((bubble) => bubble.segments.map((segment) => segment.text).join(""));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      fact_warning: "숫자와 고유명사는 적용 전에 원문과 다시 확인하세요.",
      candidates: [
        { id: "a", label: "후보 1", lines: original.map((line) => `${line} A`), fact_warnings: [] },
        { id: "b", label: "후보 2", lines: original.map((line) => `${line} B`), fact_warnings: ["새 숫자 10시간"] },
        { id: "c", label: "후보 3", lines: original.map((line) => `${line} C`), fact_warnings: [] },
      ],
    }), { status: 200 })));
    const onDeckChange = vi.fn((next: CardDeck) => { current = next; });
    const view = render(<CardDeckPanel deck={current} onDeckChange={onDeckChange} />);
    fireEvent.click(document.querySelector(`[data-slide-id="${current.slides[1].id}"]`)!);
    fireEvent.click(screen.getByRole("button", { name: "후보 3개 비교" }));

    expect(await screen.findByRole("dialog", { name: "말투 다듬기 비교" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "이 후보 적용" })).toHaveLength(3);
    expect(screen.getByText(/숫자와 고유명사는 적용 전에/)).toBeInTheDocument();
    fireEvent.click(within(document.querySelector('[data-tone-candidate="b"]')!).getByRole("button", { name: "이 후보 적용" }));
    view.rerender(<CardDeckPanel deck={current} onDeckChange={onDeckChange} />);

    const changed = current.slides[1].bubbles!.map((bubble) => bubble.segments.map((segment) => segment.text).join(""));
    expect(changed).toEqual(original.map((line) => `${line} B`));
    expect(changed).not.toEqual(original.map((line) => `${line} A`));
    expect(screen.getByText(/원문과 다름/)).toBeInTheDocument();
  });
});
