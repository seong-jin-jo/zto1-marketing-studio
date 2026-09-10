import { describe, expect, it } from "vitest";
import { mergeLearningInfo, type LearningInfo } from "@/components/studio/learning-info";

// 2026-09-07 감사 재발 방지.
// 학습 정보 일곱 칸이 브라우저 localStorage 에만 있어 기기를 바꾸면 0 칸이 됐다.
// 쌓을수록 좋아진다고 파는 제품에서 쌓인 것이 한 브라우저에 묶여 있으면 쌓이는 것이 아니다.
// 계약: 서버를 정본으로 삼되 서버에 없는 칸은 기존 브라우저 값을 살려 이관한다.
describe("mergeLearningInfo", () => {
  it("서버 값이 브라우저 값을 이긴다", () => {
    const merged = mergeLearningInfo({ audience: "서버 고객" }, { audience: "옛 고객" } as LearningInfo);
    expect(merged.audience).toBe("서버 고객");
  });

  it("서버에 없는 칸은 브라우저 값을 살린다(종전 사용자 이관)", () => {
    const merged = mergeLearningInfo({ audience: "서버 고객" }, { audience: "옛 고객", voice: "다정하게" } as LearningInfo);
    expect(merged.voice).toBe("다정하게");
  });

  it("서버를 아직 못 읽었으면 브라우저 값을 그대로 쓴다", () => {
    const local = { audience: "옛 고객", voice: "다정하게" } as LearningInfo;
    expect(mergeLearningInfo(null, local)).toEqual(local);
  });

  it("서버의 빈 칸이 채워진 칸을 지우지 않는다", () => {
    const merged = mergeLearningInfo({ audience: "  " } as LearningInfo, { audience: "옛 고객" } as LearningInfo);
    expect(merged.audience).toBe("옛 고객");
  });
});
