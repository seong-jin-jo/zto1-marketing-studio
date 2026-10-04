// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EditRoom } from "@/components/studio/StudioRooms";
import { createPlainCardDeckV3 } from "@/lib/studio/card-element-commands";
import type { CardDeckV3 } from "@/lib/studio/card-element-contract";

afterEach(() => cleanup());

describe("StudioRooms CardDeckV3 실제 연결", () => {
  it("S1-AC1 정상: 카드 편집실이 자유 배치 편집기를 열고 요소 변경을 상위 저장 경계로 전달한다", () => {
    let deck = createPlainCardDeckV3(["첫 장", "마지막 장"], "deck_rooms_v3");
    const onDeckChange = (next: CardDeckV3) => { deck = next; };
    const view = render(<EditRoom kind="card" lines={["첫 장", "마지막 장"]} onLinesChange={() => {}} cardDeckV3={deck} onCardDeckV3Change={onDeckChange} />);
    expect(screen.getByRole("region", { name: "카드 자유 배치 편집기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "도형 추가" }));
    view.rerender(<EditRoom kind="card" lines={["첫 장", "마지막 장"]} onLinesChange={() => {}} cardDeckV3={deck} onCardDeckV3Change={onDeckChange} />);
    expect(deck.slides[0].elements.some((element) => element.type === "shape")).toBe(true);
    expect(document.querySelector('[data-card-deck-v3-workbench]')).toBeInTheDocument();
  });

  it("S1 회귀 거절: v3 덱이 없으면 기존 plain 카드 편집기를 유지한다", () => {
    render(<EditRoom kind="card" lines={["기존 카드"]} onLinesChange={() => {}} />);
    expect(document.querySelector('[data-card-deck-v3-workbench]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-plain-card-shell]')).toBeInTheDocument();
  });
});
