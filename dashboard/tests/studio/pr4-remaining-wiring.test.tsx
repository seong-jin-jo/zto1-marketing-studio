// @vitest-environment jsdom
/**
 * PR4 남은 3건(세션맥락 과제 ①②③) 계약.
 *
 * ① 발행실 9장 PNG 업로드 연동: `page.tsx recompositeCards`가 `cardDeck.template
 *    ==="chat_bubble"` 이면 옛 lines 경로 대신 `renderAndUploadCardDeck({template:
 *    "chat_bubble", deck})` 을 부른다. cardDeck 이 없는 기존 글자 카드 3장 경로는 무변경
 *    (회귀 0) — 소스 계약으로 확인한다(다른 카드뉴스 테스트가 이미 기존 경로를 실행 검증).
 * ② 생성실 "방금 만든 것" 9장 실제 썸네일: `CardDeckThumbnailStrip` 이 실제 캔버스로
 *    9장을 그리고, `CreateRoom` 은 `cardDeckByDraftId` 로 찾은 덱이 있을 때만 그것을
 *    붙인다(못 찾으면 기존 텍스트 요약으로 물러선다 — 조용한 실패 아님).
 * ③ 편집실 카드 목록 4역할 배지: `CardDeckPanel` 카드 목록 각 항목에
 *    `data-slide-role-badge` 가 역할값 그대로 붙는다(추정 아니라 계약 필드 그대로).
 */
import "@testing-library/jest-dom/vitest";
import fs from "fs";
import path from "path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardDeckPanel, type BubbleEditorProps } from "@/components/studio/BubbleEditor";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import deckD100 from "./fixtures/deck-d100.v2.json";

const pageSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/studio/page.tsx"), "utf8");
const roomsSrc = fs.readFileSync(path.resolve(__dirname, "../../src/components/studio/StudioRooms.tsx"), "utf8");

function deck(): CardDeck {
  return JSON.parse(JSON.stringify(deckD100)) as CardDeck;
}

afterEach(() => cleanup());

describe("PR4 잔여 배선 ① 발행실 9장 업로드", () => {
  it("recompositeCards가 chat_bubble 덱이면 template/deck 을 그대로 renderAndUploadCardDeck 에 넘긴다", () => {
    expect(pageSrc).toContain('cardDeck && cardDeck.template === "chat_bubble"');
    expect(pageSrc).toContain('template: "chat_bubble", deck: cardDeck');
  });

  it("cardDeck 없는 기존 글자 카드 3장 경로(lines/positions)는 그대로 남아 있다(회귀 0)", () => {
    expect(pageSrc).toContain("positions: cardTextPositions");
  });
});

describe("PR4 잔여 배선 ② 생성실 실제 썸네일", () => {
  it("CreateRoom 이 cardDeckByDraftId 로 찾은 덱을 CardDeckThumbnailStrip 에 붙인다", () => {
    expect(roomsSrc).toContain("cardDeckByDraftId?.(item.draft_id)");
    expect(roomsSrc).toContain("<CardDeckThumbnailStrip deck={deck} />");
  });

  it("못 찾으면(null) 기존 deck_summary 텍스트 요약이 그대로 남는다(조용한 실패 아님)", () => {
    expect(roomsSrc).toContain("카톡 말풍선 카드뉴스 ${item.deck_summary.slides}장을 만들었습니다");
  });
});

describe("PR4 잔여 배선 ③ 편집실 4역할 배지", () => {
  const onDeckChange: BubbleEditorProps["onDeckChange"] = () => {};

  it("카드 목록에 표지·대화·댓글유도·CTA 역할 배지가 계약 role 값 그대로 붙는다", () => {
    render(<CardDeckPanel deck={deck()} onDeckChange={onDeckChange} />);
    const badges = document.querySelectorAll("[data-slide-role-badge]");
    expect(badges).toHaveLength(deck().slides.length);
    const roles = Array.from(badges).map((el) => el.getAttribute("data-slide-role-badge"));
    expect(roles[0]).toBe("cover");
    expect(roles[roles.length - 1]).toBe("cta");
    expect(roles).toContain("comment_prompt");
    expect(screen.getAllByText("표지").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CTA").length).toBeGreaterThan(0);
    expect(screen.getAllByText("댓글유도").length).toBeGreaterThan(0);
  });
});
