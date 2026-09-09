import { describe, expect, it } from "vitest";
import { withoutDashes } from "@/lib/studio/generation/llm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 2026-09-09 실측: 글 생성이 "A 이야기 순서 3번에 금지한 줄표가 있습니다" 로 통째로
// 버려졌다. 줄표는 계약에서 금지인데 **그 규칙을 프롬프트에서 한 번도 말하지 않았다.**
// 게다가 우리가 넣어 준 브랜드 문서에는 줄표가 들어 있었다. 금지한 것을 예시로 보여 주고
// 어긴다고 결과를 버린 셈이고, 그 비용은 사용자가 낸다.
//
// 검사만 있고 지시가 없는 규칙은 규칙이 아니라 함정이다.
const src = readFileSync(resolve(process.cwd(), "src/lib/studio/generation/llm.ts"), "utf8");

describe("줄표 금지는 검사만이 아니라 지시도 한다", () => {
  it("프롬프트가 줄표 금지를 직접 말한다", () => {
    expect(src).toContain("NO_DASH_RULE");
    expect(src).toMatch(/줄표.*절대 쓰지 마세요/);
  });

  it("후보 생성과 파생 생성 두 프롬프트에 모두 들어간다", () => {
    expect((src.match(/^\s*NO_DASH_RULE,$/gm) ?? [])).toHaveLength(2);
  });

  it("넣어 주는 학습 정보에서 줄표를 걷어낸다", () => {
    expect((src.match(/withoutDashes\(describeLearningContext/g) ?? [])).toHaveLength(2);
  });

  it("줄표를 쉼표로 바꾸고 앞뒤 공백을 정리한다", () => {
    expect(withoutDashes("어렵지 않게 — 그러나 확실하게")).toBe("어렵지 않게, 그러나 확실하게");
    expect(withoutDashes("가–나")).toBe("가, 나");
  });

  it("줄표가 없는 글은 건드리지 않는다", () => {
    const plain = "쉽고 직접적입니다. 이거 모르면 손해예요.";
    expect(withoutDashes(plain)).toBe(plain);
  });
});
