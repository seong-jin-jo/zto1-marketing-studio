import { describe, expect, it } from "vitest";
import { buildImagePrompt, paletteToColors, IMAGE_STYLES, CUSTOM_STYLE_ID } from "@/components/studio/image-style";

// 회장 2026-09-08: "생성할 때 여러 옵션은 안 받는 거냐. 고객은 이것저것 결을 보고 선택한
// 다음 생성하고 싶어할 듯." 종전에는 결을 고를 자리가 없어 같은 글감이면 늘 같은 결만
// 나왔고, 마음에 안 들면 다시 만드는 수밖에 없었다(그만큼 돈이 나간다).
// 그리고 학습 정보의 브랜드 색은 고객이 골라 뒀는데 그림 생성에 한 번도 쓰이지 않았다.
describe("그림 지시문 조립", () => {
  it("고른 결을 글감 뒤에 붙인다", () => {
    const out = buildImagePrompt("카페 창가", { id: "warm" }, "");
    expect(out.startsWith("카페 창가")).toBe(true);
    expect(out).toContain(IMAGE_STYLES.find((s) => s.id === "warm")!.prompt);
  });

  it("브랜드 색은 한국어 문장이 아니라 색 이름으로 옮겨 싣는다", () => {
    // 2026-09-08 실측: 카드 문장을 그대로 넣었더니 생성기가 그 말을 그림 안에 글자로
    // 그렸다. 결과 이미지 상단에 "Grein · Cram" 같은 뭉개진 글자가 박혀 나왔다.
    const out = buildImagePrompt("카페 창가", { id: "photo" }, "그린·크림. 예: 그린과 크림을 중심으로 편안하게");
    expect(out).toContain("color palette: sage green and cream");
    expect(out).not.toContain("그린과 크림을 중심으로");
  });

  it("그림 안에 글자가 박히지 않도록 지시한다", () => {
    expect(buildImagePrompt("카페 창가", null)).toContain("no text");
  });

  it("모르는 색 표현은 억지로 넣지 않는다", () => {
    expect(paletteToColors("보라·형광")).toBe("");
  });

  it("직접 적기를 고르면 그 문장을 쓴다(준비된 카드 밖으로 나갈 수 있어야 한다)", () => {
    const out = buildImagePrompt("카페 창가", { id: CUSTOM_STYLE_ID, custom: "비 오는 날 필름 사진" }, "");
    expect(out).toContain("비 오는 날 필름 사진");
    for (const style of IMAGE_STYLES) expect(out).not.toContain(style.prompt);
  });

  it("직접 적기를 골랐는데 비어 있으면 결을 덧붙이지 않는다", () => {
    const out = buildImagePrompt("카페 창가", { id: CUSTOM_STYLE_ID, custom: "   " }, "");
    expect(out.startsWith("카페 창가")).toBe(true);
    for (const style of IMAGE_STYLES) expect(out).not.toContain(style.prompt);
  });

  it("결을 안 골랐어도 글감만으로 만든다", () => {
    expect(buildImagePrompt("카페 창가", null).startsWith("카페 창가")).toBe(true);
  });

  it("결 이름은 결과의 언어로 쓴다(모델·기법 이름 금지)", () => {
    for (const style of IMAGE_STYLES) {
      expect(style.title).not.toMatch(/soul|hailuo|v2|model|SDXL/i);
      expect(style.hint.length).toBeGreaterThan(0);
    }
  });
});
