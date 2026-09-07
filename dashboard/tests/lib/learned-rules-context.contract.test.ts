import { describe, expect, it } from "vitest";
import { formatLearnedRules } from "@/lib/studio/learned-rules-context";

// 2026-09-07 감사 재발 방지.
// 성과실에서 승낙한 규칙이 performance-learned-rules.json 에 저장되기만 하고 어떤 생성
// 경로도 그 파일을 읽지 않았다. 고객이 승낙해도 다음 글이 그대로였다("가짜 학습", risks.md).
// 계약: 활성 규칙이 있으면 생성 프롬프트에 들어갈 문단이 나오고, 브랜드 가이드보다
// 우선한다는 것이 문장으로 박혀 있어야 한다.
describe("formatLearnedRules", () => {
  it("활성 규칙을 프롬프트 문단으로 만든다", () => {
    const out = formatLearnedRules([
      { id: "1", text: "첫 문장에 숫자를 넣으면 반응이 좋다" },
      { id: "2", text: "질문으로 끝내면 댓글이 는다" },
    ]);
    expect(out).toContain("첫 문장에 숫자를 넣으면 반응이 좋다");
    expect(out).toContain("질문으로 끝내면 댓글이 는다");
    expect(out).toContain("브랜드 톤 가이드보다 우선한다");
  });

  it("해제된 규칙은 넣지 않는다", () => {
    const out = formatLearnedRules([
      { id: "1", text: "살아있는 규칙" },
      { id: "2", text: "꺼진 규칙", active: false },
    ]);
    expect(out).toContain("살아있는 규칙");
    expect(out).not.toContain("꺼진 규칙");
  });

  it("규칙이 없으면 빈 문자열이라 프롬프트를 더럽히지 않는다", () => {
    expect(formatLearnedRules([])).toBe("");
    expect(formatLearnedRules([{ id: "1", text: "   " }])).toBe("");
  });

  it("규칙이 많아도 프롬프트를 규칙으로만 채우지 않는다", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i), text: `규칙${i}` }));
    const out = formatLearnedRules(many);
    expect(out.split("\n").filter((line) => line.startsWith("- ")).length).toBeLessThanOrEqual(12);
    // 최근 것이 남는다.
    expect(out).toContain("규칙29");
  });
});
