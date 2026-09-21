import { describe, expect, it } from "vitest";
import {
  addBubble,
  splitBubble,
  mergeBubble,
  deleteBubble,
  toggleSpeaker,
  moveBubble,
  toggleBold,
  moveSlide,
  addSlide,
  deleteSlide,
  groupTurns,
  pruneEmptyBubbles,
  CardDeckOpsError,
} from "@/lib/studio/card-deck-ops";
import { validateCardDeck, type CardDeck } from "@/lib/studio/card-deck-contract";
import deckD100 from "./fixtures/deck-d100.v2.json";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function deck(): CardDeck {
  return clone(deckD100) as unknown as CardDeck;
}

function expectOpsCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error(`expected to throw CardDeckOpsError code "${code}" but it did not throw`);
  } catch (e) {
    expect(e).toBeInstanceOf(CardDeckOpsError);
    expect((e as CardDeckOpsError).code).toBe(code);
  }
}

describe("card-deck-ops 말풍선 연산 (TC-F1-02~04, 07~09)", () => {
  it("addBubble: 뒤에 같은 화자 빈 말풍선을 추가하고 revision+1", () => {
    const d = deck();
    const slide = d.slides[1];
    const result = addBubble(d, slide.id, slide.bubbles![0].id);
    const bubbles = result.slides[1].bubbles!;
    expect(bubbles).toHaveLength(3);
    expect(bubbles[1].speaker).toBe(slide.bubbles![0].speaker);
    expect(bubbles[1].segments[0].text).toBe("");
    expect(result.revision).toBe(d.revision + 1);
  });

  it("splitBubble: 캐럿 중간에서 둘로 쪼갠다", () => {
    const d = deck();
    const slide = d.slides[1];
    const bubble = slide.bubbles![1]; // "12년간 300명을 상담하면서 " + bold "공통점 하나를 찾았어요"
    const original = bubble.segments[0].text;
    const result = splitBubble(d, slide.id, bubble.id, { segmentIndex: 0, offset: 5 });
    const bubbles = result.slides[1].bubbles!;
    expect(bubbles).toHaveLength(3);
    expect(bubbles[1].segments[0].text).toBe(original.slice(0, 5));
    expect(bubbles[2].segments[0].text).toBe(original.slice(5));
  });

  it("splitBubble: 세그먼트 경계에서 쪼개도 양쪽에 내용이 남는다", () => {
    const d = deck();
    const slide = d.slides[1];
    const bubble = slide.bubbles![1];
    const result = splitBubble(d, slide.id, bubble.id, { segmentIndex: 1, offset: 0 });
    const bubbles = result.slides[1].bubbles!;
    expect(bubbles[1].segments.every((s) => s.text.length > 0)).toBe(true);
    expect(bubbles[2].segments[0].bold).toBe(true);
  });

  it("splitBubble: 빈 쪽이 생기면 OPS_SPLIT_EMPTY", () => {
    const d = deck();
    const slide = d.slides[1];
    const bubble = slide.bubbles![1];
    expect(() => splitBubble(d, slide.id, bubble.id, { segmentIndex: 0, offset: 0 })).toThrowError(CardDeckOpsError);
  });

  it("mergeBubble: 같은 화자를 합친다", () => {
    const d = deck();
    const slide = d.slides[1];
    // 두 bubble 을 같은 화자로 맞춘 뒤 합침
    const toggled = toggleSpeaker(d, slide.id, slide.bubbles![0].id);
    const afterToggle = toggled.slides[1];
    const result = mergeBubble(toggled, afterToggle.id, afterToggle.bubbles![0].id);
    expect(result.slides[1].bubbles).toHaveLength(1);
  });

  it("mergeBubble: 화자가 다르면 OPS_SPEAKER_MISMATCH 로 거부", () => {
    const d = deck();
    const slide = d.slides[1];
    expectOpsCode(() => mergeBubble(d, slide.id, slide.bubbles![0].id), "OPS_SPEAKER_MISMATCH");
  });

  it("deleteBubble: 말풍선이 1개면 거부(장이 비면 안 됨)", () => {
    const d = deck();
    const slide = d.slides[1];
    const afterDelete = deleteBubble(d, slide.id, slide.bubbles![0].id);
    const remaining = afterDelete.slides[1].bubbles![0];
    expectOpsCode(() => deleteBubble(afterDelete, slide.id, remaining.id), "OPS_DELETE_LAST_BUBBLE");
  });

  it("toggleSpeaker: reader ↔ brand 전환", () => {
    const d = deck();
    const slide = d.slides[1];
    const original = slide.bubbles![0].speaker;
    const result = toggleSpeaker(d, slide.id, slide.bubbles![0].id);
    const toggled = result.slides[1].bubbles![0].speaker;
    expect(toggled).not.toBe(original);
    expect(["reader", "brand"]).toContain(toggled);
  });

  it("moveBubble: 맨 위 말풍선을 위로 이동하면 OPS_MOVE_OUT_OF_RANGE", () => {
    const d = deck();
    const slide = d.slides[1];
    expectOpsCode(() => moveBubble(d, slide.id, slide.bubbles![0].id, -1), "OPS_MOVE_OUT_OF_RANGE");
  });

  it("moveBubble: 정상 범위에서는 자리를 맞바꾼다", () => {
    const d = deck();
    const slide = d.slides[1];
    const firstId = slide.bubbles![0].id;
    const result = moveBubble(d, slide.id, firstId, 1);
    expect(result.slides[1].bubbles![1].id).toBe(firstId);
  });
});

describe("toggleBold (TC-F1-05·06)", () => {
  // slide[2]는 fixture 상 볼드가 없는 장이다(slide[1]은 이미 b-1-1에 볼드 한 덩이가 있어
  // 다른 말풍선을 또 굵게 하면 OPS_BOLD_LIMIT이 정상 발동한다 — 세 번째 테스트가 그것을 쓴다).
  it("선택 범위만 bold:true 세그먼트로 분리한다", () => {
    const d = deck();
    const slide = d.slides[2];
    const bubble = slide.bubbles![0]; // "그게 뭔데요?"
    const result = toggleBold(d, slide.id, bubble.id, { from: 0, to: 2 });
    const segments = result.slides[2].bubbles![0].segments;
    expect(segments[0].bold).toBe(true);
    expect(segments[0].text).toBe("그게");
  });

  it("인접한 같은 bold 세그먼트는 병합된다", () => {
    const d = deck();
    const slide = d.slides[2];
    const bubble = slide.bubbles![0];
    const once = toggleBold(d, slide.id, bubble.id, { from: 0, to: 2 });
    const again = toggleBold(once, slide.id, bubble.id, { from: 2, to: 4 });
    const segments = again.slides[2].bubbles![0].segments;
    // 인접 볼드 두 조각이 하나로 병합됐는지
    expect(segments.filter((s) => s.bold).length).toBe(1);
  });

  it("장에 이미 볼드 덩이가 있는데 다른 말풍선에 두 번째 덩이를 만들면 OPS_BOLD_LIMIT", () => {
    const d = deck();
    const slide = d.slides[1]; // b-1-1에 이미 볼드 한 덩이가 있다
    expectOpsCode(() => toggleBold(d, slide.id, slide.bubbles![0].id, { from: 0, to: 2 }), "OPS_BOLD_LIMIT");
  });
});

describe("슬라이드 연산 moveSlide/addSlide/deleteSlide (TC-F1-10·11)", () => {
  it("표지(0번) 이동은 OPS_SLIDE_LOCKED", () => {
    const d = deck();
    expectOpsCode(() => moveSlide(d, 0, 1), "OPS_SLIDE_LOCKED");
  });

  it("CTA(마지막) 삭제는 OPS_SLIDE_LOCKED", () => {
    const d = deck();
    expectOpsCode(() => deleteSlide(d, d.slides.length - 1), "OPS_SLIDE_LOCKED");
  });

  it("addSlide: 11장 초과면 OPS_SLIDE_LIMIT", () => {
    let d = deck();
    // 9 -> 10 -> 11 은 통과, 12번째에서 거부
    d = addSlide(d, 1);
    d = addSlide(d, 1);
    expect(d.slides).toHaveLength(11);
    expectOpsCode(() => addSlide(d, 1), "OPS_SLIDE_LIMIT");
  });

  it("deleteSlide: 7장 미만이 되면 OPS_SLIDE_MIN", () => {
    let d = deck(); // 9장
    d = deleteSlide(d, 1);
    expect(d.slides).toHaveLength(8);
    d = deleteSlide(d, 1);
    expect(d.slides).toHaveLength(7);
    expectOpsCode(() => deleteSlide(d, 1), "OPS_SLIDE_MIN");
  });

  it("addSlide 로 만든 장은 견본 질문/답변 말풍선을 갖고 저장 검증을 통과한다", () => {
    let d = deck();
    d = addSlide(d, 1);
    expect(() => validateCardDeck(d)).not.toThrow();
  });

  it("moveSlide 로 순서를 바꾸면 order 가 다시 매겨진다", () => {
    const d = deck();
    const result = moveSlide(d, 1, 2);
    expect(result.slides[1].id).toBe(d.slides[2].id);
    expect(result.slides.map((s) => s.order)).toEqual(result.slides.map((_, i) => i));
  });
});

describe("groupTurns / pruneEmptyBubbles", () => {
  it("같은 화자 연속 말풍선을 한 turn 으로 묶는다", () => {
    const d = deck();
    const bubbles = d.slides[1].bubbles!;
    const turns = groupTurns(bubbles);
    expect(turns).toHaveLength(2);
    expect(turns[0].speaker).toBe("reader");
    expect(turns[1].speaker).toBe("brand");
  });

  it("빈 말풍선을 저장 전에 제거한다", () => {
    const d = deck();
    const withEmpty = addBubble(d, d.slides[1].id, d.slides[1].bubbles![0].id);
    const pruned = pruneEmptyBubbles(withEmpty);
    expect(pruned.slides[1].bubbles).toHaveLength(2);
  });
});
