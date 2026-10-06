import { describe, expect, it, vi } from "vitest";
import type { CardDeck } from "./card-deck-contract";
import { assertChatSlidesRenderable } from "./chat-deck-layout";
import chatDeckFixture from "../../../tests/studio/fixtures/deck-d100.v2.json";

describe("S5-R1-M3 일괄 변경 레이아웃 검증", () => {
  it("톤 후보가 바꾸는 모든 장을 발행 렌더러로 검증한다", async () => {
    const deck = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const render = vi.fn(async () => null);
    await assertChatSlidesRenderable(deck, [deck.slides[1].id, deck.slides[3].id, deck.slides[1].id], render);
    expect(render.mock.calls.map(([input]) => input.slide.id)).toEqual([deck.slides[1].id, deck.slides[3].id]);
  });

  it("한 장이라도 넘치면 일괄 적용을 거절할 수 있게 렌더 예외를 보존한다", async () => {
    const deck = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const render = vi.fn(async (input) => {
      if (input.slide.id === deck.slides[2].id) throw new Error("3번 장 말풍선이 카드보다 깁니다. 쪼개세요.");
      return null;
    });
    await expect(assertChatSlidesRenderable(deck, [deck.slides[1].id, deck.slides[2].id], render))
      .rejects.toThrow("3번 장 말풍선이 카드보다 깁니다");
  });
});
