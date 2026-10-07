import { describe, expect, it } from "vitest";
import type { TextCandidate } from "@/lib/studio/text-candidate-contract";
import { textCandidateSelectionWouldDiscardEdits } from "@/lib/studio/text-candidate-selection";

function candidate(id: "question" | "number"): TextCandidate {
  return {
    id,
    label: id,
    recommended: id === "question",
    recommendation_reason: "이유",
    content: {
      threads: `${id} 첫 문단\n\n${id} 둘째 문단`,
      facebook: `${id} Facebook`,
      x: `${id} X`,
      instagram: { caption: `${id} Instagram`, hashtags: [], slides: [] },
      shorts: { hook: "훅", body: "본문", cta: "행동" },
      image_prompt: "Editorial photo",
    },
    warnings: [],
  };
}

describe("글 후보 전환 편집 보호", () => {
  const candidates = [candidate("question"), candidate("number")];

  it("S7-R1-MINOR-3 적용 직후 원문이면 다른 후보로 바로 바꿀 수 있다", () => {
    expect(textCandidateSelectionWouldDiscardEdits({
      currentSelectedId: "question",
      currentLines: ["question 첫 문단", "question 둘째 문단"],
      nextCandidateId: "number",
      candidates,
    })).toBe(false);
  });

  it("S7-R1-MINOR-3 적용 뒤 고친 본문이면 후보 전환 전 확인이 필요하다", () => {
    expect(textCandidateSelectionWouldDiscardEdits({
      currentSelectedId: "question",
      currentLines: ["직접 고친 첫 문단", "question 둘째 문단"],
      nextCandidateId: "number",
      candidates,
    })).toBe(true);
  });
});
