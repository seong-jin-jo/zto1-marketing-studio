import { describe, expect, it } from "vitest";
import {
  checkOutputQuality,
  forbiddenWordsFrom,
  summarizeQuality,
} from "@/lib/studio/output-quality";

// 회장이 못 박은 핵심 과제는 "학습정보를 잘 받아서 프롬프팅 없이도 최고의 퀄리티" 다.
// 그런데 우리는 **품질을 한 번도 재지 않았다.** 전달 경로만 고치고 "좋아졌을 것" 이라고
// 말해 왔다. 재지 않으면 좋아졌는지 나빠졌는지 아무도 모르고, 프롬프트를 만질 때마다
// 감으로 판단하게 된다. 그것이 정확히 회장이 없애자고 한 상태다.
describe("만든 글이 학습 정보를 지켰는지 잰다", () => {
  it("지키면 통과다", () => {
    const report = checkOutputQuality("오늘은 이거 하나만 확인해 보세요.", {
      forbiddenPhrases: ["최저가"],
      maxChars: 500,
    });
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.chars).toBeGreaterThan(0);
  });

  it("쓰지 않기로 한 표현이 있으면 잡는다", () => {
    const report = checkOutputQuality("업계 최저가로 모십니다.", { forbiddenPhrases: ["최저가"] });
    expect(report.passed).toBe(false);
    expect(report.issues[0].rule).toBe("forbidden");
    expect(report.issues[0].detail).toContain("최저가");
  });

  it("브랜드 문서에서 새어 나온 표현을 잡는다", () => {
    // 2026-09-09 실사용: 업종이 동네 가게인데 결과가 "회사를 손님으로 모시는 곳" 이라고 썼다.
    // 브랜드 문서 문장이 그대로 새어 나온 것이다.
    const report = checkOutputQuality("저희는 회사를 손님으로 모시는 곳입니다.", {
      leakPhrases: ["회사를 손님으로"],
    });
    expect(report.passed).toBe(false);
    expect(report.issues[0].rule).toBe("leak");
  });

  it("금지한 줄표를 잡는다", () => {
    expect(checkOutputQuality("쉽게 — 그러나 확실하게").issues[0].rule).toBe("dash");
  });

  it("채널 상한을 넘으면 몇 자인지 말한다", () => {
    const report = checkOutputQuality("가".repeat(300), { maxChars: 280 });
    expect(report.issues[0].rule).toBe("length");
    expect(report.issues[0].detail).toContain("300자");
  });

  it("빈 결과를 통과시키지 않는다", () => {
    // 빈 결과를 통과시키면 다른 검사가 전부 통과해 만점이 나온다. 가장 나쁜 거짓 신호다.
    const report = checkOutputQuality("   ", { forbiddenPhrases: ["최저가"] });
    expect(report.passed).toBe(false);
    expect(report.issues[0].rule).toBe("empty");
    expect(report.chars).toBe(0);
  });

  it("'별도 제한 없음' 은 금지어가 아니라 답이다", () => {
    expect(forbiddenWordsFrom("별도 제한 없음. 예: 법과 플랫폼 정책을 지킵니다.")).toEqual([]);
    expect(forbiddenWordsFrom("과장·허세. 예: 최고라는 말은 쓰지 않습니다.")).toEqual(["과장", "허세"]);
    expect(forbiddenWordsFrom(null)).toEqual([]);
  });

  it("여러 편을 한 번에 재 통과율을 낸다", () => {
    // 한 편만 보면 우연히 통과한 것을 실력으로 오해한다.
    const summary = summarizeQuality(["괜찮은 글입니다.", "업계 최저가입니다."], {
      forbiddenPhrases: ["최저가"],
    });
    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.rate).toBe(0.5);
  });
});
