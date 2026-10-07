import { describe, expect, it } from "vitest";
import { buildGeneratedCardTemplate } from "@/lib/studio/s7-generated-card-template";

describe("S7 생성실 템플릿 덱 준비", () => {
  it("S7-R1-M4 플래그 OFF면 v3 덱을 만들지 않는다", () => {
    expect(buildGeneratedCardTemplate({
      renderEnabled: false,
      templateId: "headline_cover",
      lines: ["첫 장", "둘째 장", "마지막 장"],
    })).toBeNull();
  });

  it("S7-R1-M4 플래그 ON이면 기본 편집 복귀 원본과 템플릿 상태를 함께 만든다", () => {
    const result = buildGeneratedCardTemplate({
      renderEnabled: true,
      templateId: "number_list",
      lines: ["첫 장", "둘째 장", "마지막 장"],
    });

    expect(result).not.toBeNull();
    expect(result?.deck.revision).toBe(1);
    expect(result?.sourceSnapshot).toEqual({
      editLines: ["첫 장", "둘째 장", "마지막 장"],
      cardTextPositions: [],
    });
    expect(result?.templateState).toEqual({ activeTemplateId: "number_list", previousTemplate: null });
  });

  it("S7-R1-M4 카드가 2장 미만이면 템플릿을 조용히 무시하지 않고 거절한다", () => {
    expect(() => buildGeneratedCardTemplate({
      renderEnabled: true,
      templateId: "text_only",
      lines: ["한 장뿐"],
    })).toThrow("카드가 2장 이상");
  });
});
