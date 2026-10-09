import { describe, expect, it } from "vitest";
import { createPlainCardDeckV3 } from "./card-element-commands";
import { validateCardDeck } from "./card-deck-contract";
import { projectCardDeckV3ToV2 } from "./card-deck-v2-to-v3";
import { convertPlainCardDeckV3ToChat } from "./plain-to-chat-template";

describe("편집실 카톡 대화 템플릿 전환", () => {
  it("R7-CHAT-01 정상: plain 원문을 7장 카톡 v2·v3 동기화 덱으로 전환한다", () => {
    const plain = createPlainCardDeckV3(["첫 표지", "운영 이미지가 보여야 합니다", "글자를 직접 고칩니다"], []);
    const converted = convertPlainCardDeckV3ToChat(plain);
    expect(converted.source.template).toBe("chat_bubble");
    expect(converted.deck.template).toBe("chat_bubble");
    expect(converted.source.slides).toHaveLength(7);
    expect(() => validateCardDeck(converted.source)).not.toThrow();
    expect(projectCardDeckV3ToV2(converted.deck, converted.source)).toEqual(converted.source);
    expect(converted.source.slides.flatMap((slide) => slide.bubbles ?? [])
      .map((bubble) => bubble.segments.map((segment) => segment.text).join(""))
      .join(""))
      .toContain("운영 이미지가 보여야 합니다");
  });

  it("R7-CHAT-02 거절: 이미 카톡인 덱을 다시 전환하지 않는다", () => {
    const plain = createPlainCardDeckV3(["첫 장", "둘째 장"], []);
    plain.template = "chat_bubble";
    expect(() => convertPlainCardDeckV3ToChat(plain)).toThrow("CARD_CHAT_TEMPLATE_PLAIN_REQUIRED");
  });
});
