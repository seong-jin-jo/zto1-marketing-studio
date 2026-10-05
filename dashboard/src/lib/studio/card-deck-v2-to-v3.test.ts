import { describe, expect, it } from "vitest";
import type { CardDeck } from "./card-deck-contract";
import { migrateCardDeckV2ToV3, projectCardDeckV3ToV2 } from "./card-deck-v2-to-v3";
import chatDeckFixture from "../../../tests/studio/fixtures/deck-d100.v2.json";

const base = {
  contract_version: "2.0",
  template: "plain",
  ratio: "4:5",
  theme: { background: "#FFF9F0", foreground: "#111111", accent: "#2563EB" },
  brand: { display_name: "OSMU", handle: null },
  hook_type: "pain",
  cta: { keyword: "정리본", comment_example: "정리본을 남겨 주세요", save_reason: "나중에 다시 확인하세요" },
  revision: 3,
} as const;

describe("S2 기존 카드 무손실 이관", () => {
  it("S2-AC1 plain 중간 빈 장도 ID·순서·내용을 제거하지 않고 결정적으로 왕복한다", () => {
    const source = {
      ...base,
      slides: [
        { id: "plain-cover", order: 0, role: "cover", cover: { headline: "첫 장", sub: null }, image_url: null, position: "top" },
        { id: "plain-empty", order: 1, role: "chat", bubbles: [], image_url: null, position: "center" },
        { id: "plain-cta", order: 2, role: "cta", bubbles: [{ id: "plain-cta-bubble", order: 0, speaker: "brand", segments: [{ text: "저장하세요", bold: true }], reaction: null }], image_url: null, position: "bottom" },
      ],
    } as unknown as CardDeck;

    const first = migrateCardDeckV2ToV3(source);
    const second = migrateCardDeckV2ToV3(structuredClone(source));
    expect(first).toEqual(second);
    expect(first.slides.map((slide) => [slide.id, slide.order, slide.content_state])).toEqual([
      ["plain-cover", 0, "filled"],
      ["plain-empty", 1, "empty"],
      ["plain-cta", 2, "filled"],
    ]);
    expect(first.migration).toMatchObject({ source_contract_version: "2.0", converter_version: "card-deck-v2-to-v3@1" });
    expect(first.migration?.source_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(projectCardDeckV3ToV2(first, source)).toEqual(source);
  });

  it("S2-AC2 chat_bubble은 화자·볼드·reaction·CTA를 deep equality로 왕복한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const migrated = migrateCardDeckV2ToV3(source);
    expect(migrated.template).toBe("chat_bubble");
    expect(projectCardDeckV3ToV2(migrated, source)).toEqual(source);
  });

  it("S2-AC1 변경한 v3 글자는 legacy projection에도 반영하고 나머지 v2 필드는 보존한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const migrated = migrateCardDeckV2ToV3(source);
    const cover = migrated.slides[0];
    expect(cover.base.kind).toBe("chat_bubble");
    if (cover.base.kind !== "chat_bubble") throw new Error("fixture");
    const headline = cover.elements.find((element) => element.id === "el_slide-0_cover");
    if (!headline || headline.type !== "text") throw new Error("fixture");
    headline.text = "바뀐 표지";
    const projected = projectCardDeckV3ToV2(migrated, source);
    expect(projected.slides[0].cover?.headline).toBe("바뀐 표지");
    expect(projected.slides.slice(1)).toEqual(source.slides.slice(1));
  });
});
