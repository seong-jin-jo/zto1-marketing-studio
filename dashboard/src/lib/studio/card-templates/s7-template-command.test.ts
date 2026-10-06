import { describe, expect, it } from "vitest";
import type { CardDeckV3 } from "@/lib/studio/card-element-contract";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { applyCardDeckTemplate } from "@/lib/studio/card-templates";
import { migrateCardDeckV2ToV3, projectCardDeckV3ToV2 } from "@/lib/studio/card-deck-v2-to-v3";
import chatDeckFixture from "../../../../tests/studio/fixtures/deck-d100.v2.json";

function plainDeck(): CardDeckV3 {
  return {
    contract_version: "3.0", id: "deck_s7", template: "plain", ratio: "4:5", revision: 4,
    theme: { background: "#FFF9F0", foreground: "#111111", accent: "#2563EB" },
    brand: { display_name: "OSMU", handle: null }, hook_type: "pain",
    cta: { keyword: "정리본", comment_example: "정리본을 남겨 주세요", save_reason: "나중에 다시 확인하세요" },
    slides: [
      { id: "slide_cover", order: 0, role: "cover", content_state: "filled", background: { kind: "solid", color: "#FFF9F0" }, base: { kind: "plain", lines: ["첫 장"] }, elements: [{ id: "text_keep", type: "text", name: "제목", x: 100, y: 120, width: 600, height: 180, rotation: 7, z_index: 0, opacity: 1, locked: false, hidden: false, text: "첫 장", style: { font_family: "Pretendard Variable", font_size: 64, font_weight: 700, line_height: 1.2, letter_spacing: 0, color: "#111111", align: "left", vertical_align: "middle" } }] },
      { id: "slide_cta", order: 1, role: "cta", content_state: "filled", background: { kind: "solid", color: "#111111" }, base: { kind: "plain", lines: ["저장"] }, elements: [] },
    ],
  };
}

describe("S7 템플릿 command", () => {
  it("S7-AC3 전체 적용은 내용·장 ID·요소 ID를 보존하고 명령 한 번에 revision 하나만 올린다", () => {
    const before = plainDeck();
    const after = applyCardDeckTemplate(before, "headline_cover", { kind: "all" });
    expect(after.revision).toBe(before.revision + 1);
    expect(after.slides.map((slide) => slide.id)).toEqual(before.slides.map((slide) => slide.id));
    expect(after.slides[0].elements.map((element) => element.id)).toEqual(["text_keep"]);
    expect(after.slides[0].base).toEqual(before.slides[0].base);
    expect(after.slides[0].elements[0]).not.toEqual(before.slides[0].elements[0]);
  });

  it("S7-AC4 이 장만 적용하면 다른 장 JSON은 바뀌지 않는다", () => {
    const before = plainDeck();
    const after = applyCardDeckTemplate(before, "number_list", { kind: "slide", slideId: "slide_cover" });
    expect(after.slides[1]).toEqual(before.slides[1]);
    expect(after.slides[0]).not.toEqual(before.slides[0]);
  });

  it("S5b 회귀: 카톡 전체 적용 뒤 댓글 유도 장 1개와 대화 장 4개 이상을 보존한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const before = migrateCardDeckV2ToV3(source);
    const after = applyCardDeckTemplate(before, "headline_cover", { kind: "all" });
    const projected = projectCardDeckV3ToV2(after, source);
    expect(projected.slides.filter((slide) => slide.role === "comment_prompt")).toHaveLength(1);
    expect(after.slides.filter((slide) => slide.role === "body").length).toBeGreaterThanOrEqual(4);
    expect(after.slides.map((slide) => slide.id)).toEqual(before.slides.map((slide) => slide.id));
  });

  it("거절 조건: 카톡 덱은 이 장만 템플릿 적용을 허용하지 않는다", () => {
    const before = migrateCardDeckV2ToV3(structuredClone(chatDeckFixture) as unknown as CardDeck);
    expect(() => applyCardDeckTemplate(before, "text_only", { kind: "slide", slideId: before.slides[1].id })).toThrow("CARD_CHAT_TEMPLATE_DECK_ONLY");
  });
});
