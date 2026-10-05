import { describe, expect, it } from "vitest";
import { cardDeckV3RenderingEnabled } from "./card-deck-v3-render-feature";

describe("S2-B CardDeckV3 공용 렌더 feature flag", () => {
  it("flag off가 기본이며 S1 발행 차단을 유지한다", () => {
    expect(cardDeckV3RenderingEnabled({})).toBe(false);
    expect(cardDeckV3RenderingEnabled({ CARD_DECK_V3_RENDER_ENABLED: "0" })).toBe(false);
  });

  it("서버 또는 공개 flag가 명시적으로 켜진 경우에만 공용 렌더를 연다", () => {
    expect(cardDeckV3RenderingEnabled({ CARD_DECK_V3_RENDER_ENABLED: "1" })).toBe(true);
    expect(cardDeckV3RenderingEnabled({ NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED: "true" })).toBe(true);
  });

  it("서버와 브라우저 flag가 다르면 부분 활성화하지 않는다", () => {
    expect(cardDeckV3RenderingEnabled({ CARD_DECK_V3_RENDER_ENABLED: "1", NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED: "0" })).toBe(false);
    expect(cardDeckV3RenderingEnabled({ CARD_DECK_V3_RENDER_ENABLED: "0", NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED: "1" })).toBe(false);
  });
});
