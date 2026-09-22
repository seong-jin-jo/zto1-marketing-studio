// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardDeckPanel } from "@/components/studio/BubbleEditor";
import { validateCardDeck, type CardDeck } from "@/lib/studio/card-deck-contract";
import deckD100 from "./fixtures/deck-d100.v2.json";

afterEach(() => cleanup());

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * 세션맥락 과업 A-4·A-3 계약: 후킹 칩을 고르면 표지 헤드라인이 그 문구로 바뀌고, CTA 칩을
 * 고르면 댓글 키워드가 그 값으로 바뀐다. 둘 다 `validateCardDeck` 을 계속 통과해야 한다
 * (조용한 실패 금지 — 저장 불가능한 상태를 만들면 안 된다).
 */
describe("BubbleEditor 후킹·CTA 칩", () => {
  it("표지 장에서 후킹 칩을 고르면 headline이 바뀌고 덱이 여전히 유효하다", () => {
    let deck = clone(deckD100) as unknown as CardDeck;
    const handleChange = (next: CardDeck) => { deck = next; };
    const { rerender } = render(<CardDeckPanel deck={deck} onDeckChange={handleChange} />);

    const chip = screen.getByText("이거 순서가 틀렸다면?");
    fireEvent.click(chip);

    expect(deck.slides[0].cover?.headline).toBe("이거 순서가\n틀렸다면?");
    expect(() => validateCardDeck(deck)).not.toThrow();

    // 컨트롤드 컴포넌트라 부모가 다음 렌더에 새 deck을 되먹여야 실제 화면에도 반영된다.
    // rerender 뒤 textarea 값이 바뀐 headline을 실제로 보여주는지까지 확인한다.
    rerender(<CardDeckPanel deck={deck} onDeckChange={handleChange} />);
    const headlineTextarea = screen.getByLabelText(/표지 헤드라인/) as HTMLTextAreaElement;
    expect(headlineTextarea.value).toBe("이거 순서가\n틀렸다면?");
  });

  it("CTA 장에서 댓글 키워드 칩을 고르면 cta.keyword가 바뀐다", () => {
    let deck = clone(deckD100) as unknown as CardDeck;
    const handleChange = (next: CardDeck) => { deck = next; };
    render(<CardDeckPanel deck={deck} onDeckChange={handleChange} />);

    const ctaSlide = deck.slides[deck.slides.length - 1];
    // 슬라이드 목록에서 CTA 장 버튼을 눌러 활성화
    const slideButton = document.querySelector(`[data-slide-id="${ctaSlide.id}"]`) as HTMLElement;
    fireEvent.click(slideButton);

    const keywordChip = screen.getByText("순서");
    fireEvent.click(keywordChip);
    expect(deck.cta.keyword).toBe("순서");
    expect(() => validateCardDeck(deck)).not.toThrow();
  });
});
