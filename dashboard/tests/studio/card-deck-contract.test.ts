import { describe, expect, it } from "vitest";
import {
  validateCardDeck,
  CardDeckValidationError,
  deckProjection,
  applyProjection,
  ProjectionMismatchError,
  upgradeLegacyDeck,
  type CardDeck,
} from "@/lib/studio/card-deck-contract";
import deckD100 from "./fixtures/deck-d100.v2.json";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** validateCardDeck 이 CardDeckValidationError(rule, message) 로 던지는지 rule 기준으로 확인. */
function expectRule(deck: unknown, rule: string): void {
  try {
    validateCardDeck(deck);
    throw new Error(`expected validateCardDeck to throw rule "${rule}" but it did not throw`);
  } catch (e) {
    expect(e).toBeInstanceOf(CardDeckValidationError);
    expect((e as CardDeckValidationError).rule).toBe(rule);
  }
}

const validDeck = deckD100 as unknown as CardDeck;

describe("card-deck-contract validateCardDeck (TC-F1-01)", () => {
  it("9장 정상 통과", () => {
    expect(() => validateCardDeck(clone(validDeck))).not.toThrow();
  });

  it("6장(7장 미만) → slide_count 거부", () => {
    const deck = clone(validDeck);
    deck.slides = deck.slides.slice(0, 6).map((s: any, i: number) => ({ ...s, order: i }));
    deck.slides[5] = { ...deck.slides[5], role: "cta" };
    expectRule(deck, "slide_count");
  });

  it("12장(11장 초과) → slide_count 거부", () => {
    const deck = clone(validDeck);
    const extras = [1, 2, 3].map((n) => ({ ...clone(deck.slides[1]), id: `extra-${n}` }));
    deck.slides = [...deck.slides.slice(0, 8), ...extras, deck.slides[8]].map((s: any, i: number) => ({ ...s, order: i }));
    expect(deck.slides.length).toBe(12);
    expectRule(deck, "slide_count");
  });

  it("cover 가 1번(0번이 아님) → role_layout 거부", () => {
    const deck = clone(validDeck);
    [deck.slides[0], deck.slides[1]] = [deck.slides[1], deck.slides[0]];
    deck.slides = deck.slides.map((s: any, i: number) => ({ ...s, order: i }));
    expectRule(deck, "role_layout");
  });

  it("마지막 장이 cta 가 아니면 role_layout 거부", () => {
    const deck = clone(validDeck);
    deck.slides[deck.slides.length - 1] = { ...deck.slides[deck.slides.length - 1], role: "chat", bubbles: deck.slides[1].bubbles };
    expectRule(deck, "role_layout");
  });

  it("comment_prompt 2개 → role_layout 거부", () => {
    const deck = clone(validDeck);
    deck.slides[6] = { ...deck.slides[6], role: "comment_prompt" };
    expectRule(deck, "role_layout");
  });

  it("chat 장에 화자가 하나뿐이면 speaker_mix 거부", () => {
    const deck = clone(validDeck);
    deck.slides[1].bubbles![0].speaker = "brand";
    expectRule(deck, "speaker_mix");
  });

  it("볼드 덩이가 2개면 bold_limit 거부", () => {
    const deck = clone(validDeck);
    deck.slides[1].bubbles![0].segments = [{ text: "굵게1", bold: true }];
    deck.slides[2].bubbles![0].segments = [{ text: "굵게2", bold: true }];
    expectRule(deck, "bold_limit");
  });

  it("CTA 장에 댓글 키워드가 없으면 cta_keyword 거부", () => {
    const deck = clone(validDeck);
    deck.slides[8].bubbles![0].segments = [{ text: "감사합니다", bold: false }];
    expectRule(deck, "cta_keyword");
  });

  it("CTA 장에 표면 링크가 있으면 cta_link 거부", () => {
    const deck = clone(validDeck);
    deck.slides[8].bubbles![0].segments = [{ text: "댓글에 '순서' 남기고 프로필 링크 확인하세요", bold: false }];
    expectRule(deck, "cta_link");
  });

  it("표지 헤드라인이 4줄이면 cover_lines 거부", () => {
    const deck = clone(validDeck);
    deck.slides[0].cover!.headline = "한\n두\n세\n네";
    expectRule(deck, "cover_lines");
  });

  it("표지 헤드라인 한 줄이 11자(렌더 폭 초과 경계)면 cover_lines 거부", () => {
    // 2026-09-21 코드리뷰 MAJOR 2: 상한을 18자→10자로 낮췄다(렌더 폭 864px 역산,
    // COVER_HEADLINE_MAX_CHARS_PER_LINE 주석 참조). 경계값 11자로 갱신.
    const deck = clone(validDeck);
    deck.slides[0].cover!.headline = "가".repeat(11);
    expectRule(deck, "cover_lines");
  });

  it("표지 헤드라인 한 줄이 10자(경계값)면 통과한다", () => {
    const deck = clone(validDeck);
    deck.slides[0].cover!.headline = "가".repeat(10);
    expect(() => validateCardDeck(deck)).not.toThrow();
  });

  it("세그먼트에 HTML 이 섞이면 no_html 거부", () => {
    const deck = clone(validDeck);
    deck.slides[1].bubbles![0].segments = [{ text: "<strong>안녕</strong>", bold: false }];
    expectRule(deck, "no_html");
  });

  it("줄표(—)가 있으면 no_dash 거부", () => {
    // 10자 상한(COVER_HEADLINE_MAX_CHARS_PER_LINE) 안에 들어가는 문구로 cover_lines
    // 보다 먼저 no_dash 에 걸리게 한다(2026-09-21 코드리뷰 MAJOR 2 상한 변경 반영).
    const deck = clone(validDeck);
    deck.slides[0].cover!.headline = "실력 — 순서";
    expectRule(deck, "no_dash");
  });
});

describe("deckProjection / applyProjection (TC-F1-13)", () => {
  it("투영 후 역적용하면 볼드가 보존된다", () => {
    const deck = clone(validDeck);
    deck.slides[1].bubbles![1].segments = [
      { text: "일반 ", bold: false },
      { text: "굵은 부분", bold: true },
    ];
    const projected = deckProjection(deck);
    expect(projected.lines.length).toBe(projected.refs.length);
    // 같은 길이 비율로 텍스트를 바꿔도 볼드 세그먼트 개수가 유지된다.
    const targetLineIndex = projected.refs.findIndex((r) => r.bubbleId === "b-1-1");
    const lines = [...projected.lines];
    lines[targetLineIndex] = "새로운 일반 굵은부분 텍스트";
    const applied = applyProjection(deck, lines, projected.refs);
    const updatedBubble = applied.slides[1].bubbles!.find((b) => b.id === "b-1-1")!;
    expect(updatedBubble.segments.some((s) => s.bold)).toBe(true);
    expect(applied.revision).toBe(deck.revision + 1);
  });

  it("서버 줄 수가 불일치하면 ProjectionMismatchError를 던지고 미적용", () => {
    const deck = clone(validDeck);
    const projected = deckProjection(deck);
    expect(() => applyProjection(deck, projected.lines.slice(0, -1), projected.refs.slice(0, -1))).toThrowError(ProjectionMismatchError);
  });
});

describe("upgradeLegacyDeck (FR-12)", () => {
  it("구 초안(editLines 3, positions)을 plain 덱으로 승격하고 위치를 보존한다", () => {
    const deck = upgradeLegacyDeck(
      ["표지 문구", "본문 문구", "마무리 문구"],
      ["top-center", "center", "bottom-center"],
      "4:5",
      { background: "#000", foreground: "#fff", accent: "#f00" },
    );
    expect(deck.template).toBe("plain");
    expect(deck.slides).toHaveLength(3);
    expect(deck.slides[0].role).toBe("cover");
    expect(deck.slides[2].role).toBe("cta");
    // "top-center" 는 CardSlide["position"] 타입("top"|"center"|"bottom")에 없다.
    // prefix 로 접힌 값이어야 한다(2026-09-21 코드리뷰 MAJOR 5. 타입이 거짓말하던 결함).
    expect(deck.slides[0].position).toBe("top");
    expect(deck.slides[1].position).toBe("center");
    expect(deck.slides[2].position).toBe("bottom");
  });

  it("승격 결과는 그 자체로 validateCardDeck 을 통과한다(2026-09-21 코드리뷰 MAJOR 5 회귀. FR-12 '첫 저장부터 v2')", () => {
    const deck = upgradeLegacyDeck(
      ["표지 문구", "본문 문구", "마무리 문구"],
      undefined,
      "4:5",
      { background: "#000", foreground: "#fff", accent: "#f00" },
    );
    expect(() => validateCardDeck(deck)).not.toThrow();
  });

  it("editLines 가 1줄(빈 라인 제외 후)이어도 cover/cta 최소 2장을 보장하고 통과한다", () => {
    const deck = upgradeLegacyDeck(["표지 문구만"], undefined, "1:1", {
      background: "#000", foreground: "#fff", accent: "#f00",
    });
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0].role).toBe("cover");
    expect(deck.slides[1].role).toBe("cta");
    expect(() => validateCardDeck(deck)).not.toThrow();
  });

  it("editLines 가 전부 빈 줄이어도 승격이 던지지 않고 validateCardDeck 을 통과한다", () => {
    const deck = upgradeLegacyDeck(["", "  ", ""], undefined, "4:5", {
      background: "#000", foreground: "#fff", accent: "#f00",
    });
    expect(() => validateCardDeck(deck)).not.toThrow();
  });
});
