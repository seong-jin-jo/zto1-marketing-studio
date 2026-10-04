import { describe, expect, it } from "vitest";
import type { CardDeckV3 } from "./card-element-contract";
import { cardElementStyle, cardSlideRenderModel, visibleCardElements } from "./card-render-model";

const deck: CardDeckV3 = {
  contract_version: "3.0", id: "deck_render", template: "plain", ratio: "4:5", revision: 1,
  theme: { background: "#FFFFFF", foreground: "#111111", accent: "#2563EB" },
  brand: { display_name: "OSMU", handle: null }, hook_type: "pain",
  cta: { keyword: "정리본", comment_example: "정리본을 남겨 주세요", save_reason: "나중에 다시 확인하세요" },
  slides: [
    {
      id: "slide_cover", order: 0, role: "cover", content_state: "filled", background: { kind: "solid", color: "#FFFFFF" }, base: { kind: "plain", lines: ["첫 장"] },
      elements: [
        { id: "hidden_text", type: "text", name: "숨김", x: 0, y: 0, width: 100, height: 100, rotation: 0, z_index: 1, opacity: 1, locked: false, hidden: true, text: "숨김", style: { font_family: "Pretendard Variable", font_size: 32, font_weight: 400, line_height: 1.2, letter_spacing: 0, color: "#111111", align: "left", vertical_align: "top" } },
        { id: "shape", type: "shape", name: "도형", x: 108, y: 135, width: 540, height: 675, rotation: 15, z_index: 0, opacity: 0.5, locked: false, hidden: false, shape: "rectangle", fill: "#2563EB", stroke: "transparent", stroke_width: 0, corner_radius: 12 },
      ],
    },
    { id: "slide_cta", order: 1, role: "cta", content_state: "filled", background: { kind: "solid", color: "#111111" }, base: { kind: "plain", lines: ["저장"] }, elements: [] },
  ],
};

describe("T-PARITY CardSlideRenderModel", () => {
  it("S1-AC1 정상 경로: 논리 좌표를 비율값으로 투영하고 숨김 요소를 제외한다", () => {
    const model = cardSlideRenderModel(deck, "slide_cover");
    const [element] = visibleCardElements(model);
    expect(element.id).toBe("shape");
    expect(cardElementStyle(element, model)).toMatchObject({
      "--card-element-left": "10%", "--card-element-top": "10%", "--card-element-width": "50%", "--card-element-height": "50%", "--card-element-rotation": "15deg",
    });
  });

  it("거절 경로: 존재하지 않는 장은 첫 장으로 안전하게 복귀한다", () => {
    expect(cardSlideRenderModel(deck, "missing").slide.id).toBe("slide_cover");
  });
});
