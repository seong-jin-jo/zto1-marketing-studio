import { describe, expect, it } from "vitest";
import {
  checkCardDeckQuality,
  checkOutputQuality,
  forbiddenWordsFrom,
  summarizeQuality,
} from "@/lib/studio/output-quality";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { cardDeckFixture } from "./generation-fixture";

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

// 설계 §5 F3 output-quality 표(규칙 6개). validateCardDeck() 이 이미 통과시킨 D-100 fixture
// 를 정본으로, 규칙 하나만 깨서 그 규칙만 정확히 걸리는지 잰다.
describe("카드 덱이 계약의 의미까지 지켰는지 잰다", () => {
  it("D-100 fixture 는 그대로 통과한다", () => {
    const report = checkCardDeckQuality(cardDeckFixture());
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("cta_keyword: CTA 장에 댓글 키워드 유도가 없으면 잡는다", () => {
    const deck = cardDeckFixture();
    const cta = deck.slides[deck.slides.length - 1];
    cta.bubbles = [{ id: "b", order: 0, speaker: "brand", segments: [{ text: "다음에 또 봐요", bold: false }], reaction: null }];
    const report = checkCardDeckQuality(deck);
    expect(report.passed).toBe(false);
    expect(report.issues.map((i) => i.rule)).toContain("cta_keyword");
  });

  it("cta_link: CTA·표지에 표면 링크 표현이 있으면 잡는다", () => {
    const deck = cardDeckFixture();
    const cta = deck.slides[deck.slides.length - 1];
    cta.bubbles = [{
      id: "b", order: 0, speaker: "brand",
      segments: [{ text: `댓글에 '${deck.cta.keyword}' 남기고 프로필 링크도 확인하세요`, bold: false }],
      reaction: null,
    }];
    const report = checkCardDeckQuality(deck);
    expect(report.passed).toBe(false);
    expect(report.issues.map((i) => i.rule)).toContain("cta_link");
  });

  it("cta_save_reason: 저장 명분이 6자 미만이면 잡는다", () => {
    const deck: CardDeck = { ...cardDeckFixture(), cta: { ...cardDeckFixture().cta, save_reason: "짧음" } };
    const report = checkCardDeckQuality(deck);
    expect(report.passed).toBe(false);
    expect(report.issues.map((i) => i.rule)).toContain("cta_save_reason");
  });

  it("hook_type: 사용자가 고정한 공식과 다르면 잡는다", () => {
    const deck = cardDeckFixture(); // hook_type: "pain"
    const report = checkCardDeckQuality(deck, { fixedHookType: "question" });
    expect(report.passed).toBe(false);
    const issue = report.issues.find((i) => i.rule === "hook_type");
    expect(issue?.detail).toContain("question");
    expect(issue?.detail).toContain("pain");
  });

  it("hook_type: 선언한 공식의 표식이 표지에 없으면 잡는다", () => {
    const deck = cardDeckFixture();
    deck.slides[0].cover = { headline: "그냥 평범한 문장입니다", sub: null };
    const report = checkCardDeckQuality(deck);
    expect(report.passed).toBe(false);
    expect(report.issues.map((i) => i.rule)).toContain("hook_type");
  });

  it("cover_lines: 표지 줄이 상한을 넘으면 몇 번째 줄인지 말한다", () => {
    const deck = cardDeckFixture();
    deck.slides[0].cover = { headline: "안 되는 게\n아니라\n순서가\n문제입니다", sub: null }; // 4줄
    const report = checkCardDeckQuality(deck);
    expect(report.passed).toBe(false);
    expect(report.issues.map((i) => i.rule)).toContain("cover_lines");
  });

  it("deck_shape: chat 장에 화자가 한 종류만 있으면 어느 장인지 짚는다", () => {
    const deck = cardDeckFixture();
    const chatIndex = deck.slides.findIndex((s) => s.role === "chat");
    deck.slides[chatIndex].bubbles = [
      { id: "b1", order: 0, speaker: "brand", segments: [{ text: "혼자 말합니다", bold: false }], reaction: null },
    ];
    const report = checkCardDeckQuality(deck);
    expect(report.passed).toBe(false);
    const issue = report.issues.find((i) => i.rule === "deck_shape");
    expect(issue?.detail).toContain(`${chatIndex + 1}번 장`);
  });

  it("hook_type=number: 학습 정보의 알려진 숫자를 표지에 쓰면 통과한다", () => {
    const deck = cardDeckFixture();
    deck.hook_type = "number";
    deck.slides[0].cover = { headline: "3배 늘어난 이유", sub: null };
    const report = checkCardDeckQuality(deck, { knownNumbers: ["3배", "3"] });
    expect(report.issues.map((i) => i.rule)).not.toContain("hook_type");
  });

  it("hook_type=number: 학습 정보에 없는 지어낸 숫자를 표지에 쓰면 반려한다", () => {
    const deck = cardDeckFixture();
    deck.hook_type = "number";
    deck.slides[0].cover = { headline: "300% 늘어난 이유", sub: null };
    const report = checkCardDeckQuality(deck, { knownNumbers: ["3", "10"] });
    expect(report.passed).toBe(false);
    const issue = report.issues.find((i) => i.rule === "hook_type");
    expect(issue?.detail).toContain("300");
  });

  it("hook_type=number: knownNumbers 가 빈 배열인데 표지에 숫자가 있으면 반려한다(조용한 스킵 금지, ADR-007)", () => {
    const deck = cardDeckFixture();
    deck.hook_type = "number";
    deck.slides[0].cover = { headline: "12가지 이유", sub: null };
    const report = checkCardDeckQuality(deck, { knownNumbers: [] });
    expect(report.passed).toBe(false);
    const issue = report.issues.find((i) => i.rule === "hook_type");
    expect(issue?.detail).toContain("학습 정보에 숫자가 없는데");
    expect(issue?.detail).toContain("12");
  });

  it("기존 금지어 검사도 말풍선·표지 텍스트에 돈다(런타임 첫 배선)", () => {
    const deck = cardDeckFixture();
    deck.slides[0].cover = { headline: deck.slides[0].cover!.headline + "\n업계 최저가", sub: null };
    const report = checkCardDeckQuality(deck, { forbiddenPhrases: ["최저가"] });
    expect(report.passed).toBe(false);
    expect(report.issues.map((i) => i.rule)).toContain("forbidden_phrase");
  });

  it("한 번에 여러 규칙이 깨지면 전부 보고한다(한 번에 하나씩만 고치게 하지 않는다)", () => {
    const deck = cardDeckFixture();
    deck.cta.save_reason = "짧음";
    const cta = deck.slides[deck.slides.length - 1];
    cta.bubbles = [{ id: "b", order: 0, speaker: "brand", segments: [{ text: "링크 확인하세요", bold: false }], reaction: null }];
    const report = checkCardDeckQuality(deck);
    const rules = new Set(report.issues.map((i) => i.rule));
    expect(rules.has("cta_keyword")).toBe(true);
    expect(rules.has("cta_link")).toBe(true);
    expect(rules.has("cta_save_reason")).toBe(true);
  });
});
