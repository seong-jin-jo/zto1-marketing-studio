// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditRoom, countXWeightedCharacters } from "@/components/studio/StudioRooms";
import { CardDeckPanel } from "@/components/studio/BubbleEditor";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import deckFixture from "./fixtures/deck-d100.v2.json";

const roomCss = readFileSync("src/components/studio/StudioRooms.module.css", "utf8");
const bubbleCss = readFileSync("src/components/studio/BubbleEditor.module.css", "utf8");

function deck(): CardDeck {
  return JSON.parse(JSON.stringify(deckFixture)) as CardDeck;
}

afterEach(cleanup);

describe("EDIT-TEXT v70", () => {
  it("V70-TEXT-01 정상: 680px 정렬선 문서 시트와 세 채널 상한 미터를 그린다", () => {
    render(<EditRoom lines={["가a"]} onLinesChange={vi.fn()} kind="text" />);

    expect(document.querySelector("[data-text-document-sheet]")).toBeInTheDocument();
    expect(document.querySelector("[data-edit-outline]")).not.toBeInTheDocument();
    expect(document.querySelectorAll("[data-channel-limit]")).toHaveLength(3);
    expect(document.querySelector('[data-channel-limit="x"]')).toHaveTextContent("3/280");
    expect(document.querySelector('[data-channel-limit="threads"]')).toHaveTextContent("2/500");
    expect(roomCss).toContain("--editroom-document-width: 42.5rem");
    expect(roomCss).toContain("max-width: var(--editroom-document-width)");
  });

  it("V70-TEXT-02 경계: X는 한글 2, 그 밖의 문자는 1로 센다", () => {
    expect(countXWeightedCharacters("가a")).toBe(3);
    expect(countXWeightedCharacters("한글 AB")).toBe(7);
  });
});

describe("EDIT-CARD v70", () => {
  it("V70-CARD-01 정상: 112px 썸네일 스트립과 520px 4:5 DOM 스테이지만 둔다", () => {
    render(<CardDeckPanel deck={deck()} onDeckChange={vi.fn()} />);

    expect(document.querySelector("[data-card-deck-thumbnail-strip]")).toBeInTheDocument();
    expect(document.querySelector("[data-card-deck-stage]")).toHaveAttribute("data-card-deck-stage-ratio", "4:5");
    expect(document.querySelector("[data-card-deck-editor]")).not.toBeInTheDocument();
    expect(bubbleCss).toContain("--editroom-thumbnail-width: 7rem");
    expect(bubbleCss).toContain("grid-template-columns: var(--editroom-thumbnail-width) minmax(0, 1fr)");
    expect(bubbleCss).toContain("--editroom-stage-width: 32.5rem");
    expect(bubbleCss).toContain("max-width: var(--editroom-stage-width)");
    expect(bubbleCss).toContain("aspect-ratio: 4 / 5");
  });

  it("V70-CARD-02 정상: 말풍선 한 번 클릭으로 그 자리 입력과 5개 도구가 열린다", () => {
    const d = deck();
    const onDeckChange = vi.fn();
    render(<CardDeckPanel deck={d} onDeckChange={onDeckChange} />);
    fireEvent.click(document.querySelector(`[data-slide-id="${d.slides[1].id}"]`)!);

    const bubble = document.querySelector<HTMLElement>(`[data-bubble-id="${d.slides[1].bubbles![0].id}"]`)!;
    const input = within(bubble).getByRole("textbox");
    fireEvent.click(input);

    expect(bubble).toHaveAttribute("data-bubble-editing", "true");
    const toolbar = within(bubble).getByLabelText("선택한 말풍선 도구");
    expect(within(toolbar).getAllByRole("button")).toHaveLength(5);
    expect(within(toolbar).queryByText("▲")).not.toBeInTheDocument();
    expect(within(toolbar).queryByText("▼")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "한 번 클릭해 바로 고침" } });
    expect(onDeckChange).toHaveBeenCalledTimes(1);
  });

  it("V70-CARD-03 거절: 클릭하지 않은 말풍선에는 도구를 상시 노출하지 않는다", () => {
    const d = deck();
    render(<CardDeckPanel deck={d} onDeckChange={vi.fn()} />);
    fireEvent.click(document.querySelector(`[data-slide-id="${d.slides[1].id}"]`)!);

    expect(screen.queryByLabelText("선택한 말풍선 도구")).not.toBeInTheDocument();
  });
});
