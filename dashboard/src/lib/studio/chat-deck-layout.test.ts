import { describe, expect, it, vi } from "vitest";
import type { CardDeck } from "./card-deck-contract";
import { assertChatSlidesRenderable, findChatSlideOverflowSplit, type ChatSlideLayoutRenderer } from "./chat-deck-layout";
import chatDeckFixture from "../../../tests/studio/fixtures/deck-d100.v2.json";

describe("S5-R1-M3 일괄 변경 레이아웃 검증", () => {
  it("톤 후보가 바꾸는 모든 장을 발행 렌더러로 검증한다", async () => {
    const deck = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const render = vi.fn<ChatSlideLayoutRenderer>(async () => null);
    await assertChatSlidesRenderable(deck, [deck.slides[1].id, deck.slides[3].id, deck.slides[1].id], render);
    expect(render.mock.calls.map(([input]) => input.slide.id)).toEqual([deck.slides[1].id, deck.slides[3].id]);
  });

  it("한 장이라도 넘치면 일괄 적용을 거절할 수 있게 렌더 예외를 보존한다", async () => {
    const deck = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const render = vi.fn<ChatSlideLayoutRenderer>(async (input) => {
      if (input.slide.id === deck.slides[2].id) throw new Error("3번 장 말풍선이 카드보다 깁니다. 쪼개세요.");
      return null;
    });
    await expect(assertChatSlidesRenderable(deck, [deck.slides[1].id, deck.slides[2].id], render))
      .rejects.toThrow("3번 장 말풍선이 카드보다 깁니다");
  });
});

describe("S5b-R1-M2 v3 자동 분할 경계", () => {
  it("말풍선 묶음이 넘치면 첫 초과 말풍선 앞 경계를 반환한다", async () => {
    const deck = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const slide = deck.slides[1];
    const render = vi.fn<ChatSlideLayoutRenderer>(async ({ slide: candidate }) => {
      if ((candidate.bubbles?.length ?? 0) > 1) throw new Error("말풍선이 카드보다 깁니다");
      return null;
    });
    await expect(findChatSlideOverflowSplit(deck, slide.id, render)).resolves.toEqual({ bubbleIndex: 1 });
  });

  it("첫 말풍선 하나가 넘치면 실제 renderer가 수용하는 최대 글자 offset을 찾는다", async () => {
    const deck = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const slide = deck.slides[1];
    slide.bubbles = [{ ...slide.bubbles![0], segments: [{ text: "1234567890", bold: false }] }];
    const render = vi.fn<ChatSlideLayoutRenderer>(async ({ slide: candidate }) => {
      const length = candidate.bubbles?.[0]?.segments.reduce((sum, segment) => sum + segment.text.length, 0) ?? 0;
      if (length > 6) throw new Error("말풍선이 카드보다 깁니다");
      return null;
    });
    await expect(findChatSlideOverflowSplit(deck, slide.id, render)).resolves.toEqual({ bubbleIndex: 0, offset: 6 });
  });
});
