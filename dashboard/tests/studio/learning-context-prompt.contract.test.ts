import { describe, expect, it } from "vitest";
import { describeLearningContext } from "@/lib/studio/generation/llm";

// 2026-09-09 회장 지시 반영.
// "학습정보를 잘 받아서 프롬프팅이나 하네스엔지니어링 없이도 최고의 퀄리티를 만들어나가는
// 것이 우리의 핵심 과제."
//
// 종전에는 일곱 칸을 통째로 JSON 으로 붙였다. 두 가지가 품질을 깎았다.
// ①빈 값이 그대로 들어간다. `"forbiddenPhrases":[]` 는 모델에게 아무것도 안 알려 주면서
//   자리만 차지한다. 사람은 "금지 표현: (없음)" 줄을 그냥 넘기지만 모델에게는 채워진 줄과
//   똑같은 무게의 입력이다.
// ②일곱 칸이 평평하게 나열된다. 결과를 가르는 것은 회원이 직접 채운 목적·대상·말투·금지
//   표현인데 시간대와 같은 줄에 놓이면 비중이 묻힌다.
//
// 계약: 채워진 값은 하나도 빠지지 않는다. 빈 값은 한 줄도 나오지 않는다. 회원이 채운 것이
// 우리가 정한 규칙보다 앞에 온다.

const full = {
  s0: { safetyRules: ["과장 금지", "허위 효능 금지"] },
  s1: { marketContext: "1인 사업자 대상 마케팅 도구 시장" },
  u2: { locale: "ko-KR", timeZone: "Asia/Seoul", accessibilityRequirements: ["대체 텍스트"] },
  u3: {
    purpose: "신규 고객 모으기",
    audience: "동네 카페를 막 연 사장",
    tone: "담백하게",
    forbiddenPhrases: ["최고", "무조건"],
    workspaceFacts: ["2026년 3월 개업", "원두 직접 로스팅"],
    contentBranch: "text_image",
  },
  x4: { structureRules: ["첫 문장에 결론"] },
  l5: { acceptedRules: ["숫자를 넣으면 반응이 좋다"] },
  r6: { topic: "아침 메뉴 소개" },
} as unknown as Parameters<typeof describeLearningContext>[0];

const sparse = {
  s0: { safetyRules: [] },
  s1: { marketContext: "" },
  u2: { locale: "ko-KR", timeZone: "", accessibilityRequirements: [] },
  u3: {
    purpose: "신규 고객 모으기",
    audience: "동네 카페 사장",
    tone: "",
    forbiddenPhrases: [],
    workspaceFacts: [],
    contentBranch: "text_image",
  },
  x4: { structureRules: [] },
  l5: { acceptedRules: [] },
  r6: {},
} as unknown as Parameters<typeof describeLearningContext>[0];

describe("학습 정보를 모델에게 넘기는 방식", () => {
  it("채워진 값은 하나도 빠지지 않는다", () => {
    const out = describeLearningContext(full);
    for (const needed of [
      "신규 고객 모으기", "동네 카페를 막 연 사장", "담백하게",
      "최고", "무조건", "2026년 3월 개업", "원두 직접 로스팅",
      "과장 금지", "첫 문장에 결론", "숫자를 넣으면 반응이 좋다",
      "1인 사업자 대상 마케팅 도구 시장", "ko-KR", "Asia/Seoul", "대체 텍스트",
      "아침 메뉴 소개",
    ]) {
      expect(out, `"${needed}" 가 프롬프트에서 사라졌다`).toContain(needed);
    }
  });

  it("빈 값은 한 줄도 나오지 않는다", () => {
    const out = describeLearningContext(sparse);
    // 빈 배열·빈 문자열이 통째로 새어 나오면 안 된다.
    expect(out).not.toContain("[]");
    expect(out).not.toContain('""');
    // 이름만 있고 값도 자식 줄도 없는 줄이 있으면 안 된다.
    // (중첩 목록의 머리줄은 바로 아래에 "  - " 자식이 오므로 여기 해당하지 않는다.)
    const lines = out.split("\n");
    const 빈줄 = lines.filter((line, i) =>
      /^[^\s].*:\s*$/.test(line) && !(lines[i + 1] || "").startsWith("  - "));
    expect(빈줄, `값 없는 줄이 남았다: ${빈줄.join(" / ")}`).toEqual([]);
    // 채워진 것은 그대로 있다.
    expect(out).toContain("신규 고객 모으기");
    expect(out).toContain("ko-KR");
    // 비어 있는 항목의 이름조차 나오면 안 된다. 이름만 있고 값이 없으면 노이즈다.
    expect(out).not.toContain("쓰면 안 되는 표현");
    expect(out).not.toContain("시장 맥락");
  });

  it("회원이 채운 것이 우리가 정한 규칙보다 앞에 온다", () => {
    const out = describeLearningContext(full);
    expect(out.indexOf("무엇을 위해 만드는가")).toBeLessThan(out.indexOf("지켜야 할 안전 규칙"));
    expect(out.indexOf("말투")).toBeLessThan(out.indexOf("따라야 할 구조 규칙"));
    // 배경은 맨 뒤다.
    expect(out.indexOf("지켜야 할 안전 규칙")).toBeLessThan(out.indexOf("시장 맥락"));
  });

  it("JSON 덩어리가 아니라 사람이 읽는 줄로 나온다", () => {
    const out = describeLearningContext(full);
    expect(out).not.toContain('{"');
    expect(out).toContain("무엇을 위해 만드는가: 신규 고객 모으기");
  });
});
