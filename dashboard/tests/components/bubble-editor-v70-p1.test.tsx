// @vitest-environment jsdom
/**
 * 편집실 v70 1단계 PR 리뷰(BLOCKER 0·MAJOR 6) 회귀. 각 M항목마다 "고치기 전 코드에서
 * 실패하는" 회귀 테스트를 붙인다(ADR-007 "조용한 실패 금지" 결정 ⑤ 관행).
 *
 * M1: 말풍선 textarea가 줄바꿈 개수로만 rows를 잡아 긴 문장이 첫 줄만 보였다.
 * M2: 굵게를 눌러도 평문 textarea라 굵기가 안 보이고, 두 번 누르면 조용히 풀렸다.
 * M3: 말풍선 삭제 뒤 selectedBubbleId가 지운 id를 그대로 들고 있어 추가가
 *     OPS_BUBBLE_NOT_FOUND로 실패했다.
 * M4: 카드 배경은 흰색 고정인데 글자색은 테마 --text를 따라가 다크 테마에서 안 보였다.
 * M5: 캔버스 미리보기를 없애 표지·CTA 발행 모습(사진+그라데이션+헤드라인 줄 수)을
 *     편집실에서 볼 수 없었다.
 * M6: 편집 중 넘침·표지 줄 수 경고(ChatBubbleRenderError)가 발행 직전에야 떴다.
 * MINOR: `var(--muted)`(미정의 토큰), 핸들 없을 때 "브랜드" placeholder.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BubbleEditor, CardDeckPanel } from "@/components/studio/BubbleEditor";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import deckD100 from "../studio/fixtures/deck-d100.v2.json";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function deck(): CardDeck {
  return clone(deckD100) as unknown as CardDeck;
}

afterEach(cleanup);

if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

const cssSrc = readFileSync(resolve(__dirname, "../../src/components/studio/BubbleEditor.module.css"), "utf8");
const tsxSrc = readFileSync(resolve(__dirname, "../../src/components/studio/BubbleEditor.tsx"), "utf8");

describe("M1: 말풍선 내용칸은 rows로 높이를 못박지 않는다", () => {
  it("bubbleTextarea(rows 고정 textarea) 대신 contentEditable 칸을 쓴다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    render(<BubbleEditor deck={d} slideId={chatSlide.id} onDeckChange={vi.fn()} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${chatSlide.bubbles![0].id}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    // 고쳤을 때: contentEditable=true, rows 속성 없음(높이를 줄 수로 못박지 않는다).
    expect(editable).toHaveAttribute("contenteditable", "true");
    expect(editable).not.toHaveAttribute("rows");
  });

  it("CSS: 말풍선 칸이 white-space:pre-wrap으로 자동 줄바꿈되고 고정 rows 클래스가 없다(돌연변이: bubbleContent 규칙을 지우면 실패)", () => {
    expect(cssSrc).toMatch(/\.bubbleContent\s*\{[^}]*white-space:\s*pre-wrap/);
  });
});

describe("M2: 굵게 토글이 편집 화면에 즉시 보인다", () => {
  it("전체 선택 후 굵게를 누르면 세그먼트가 bold:true가 되고, 다시 렌더한 DOM에 <strong>이 보인다", () => {
    const d = deck();
    // 픽스처의 slide-1은 이미 다른 말풍선에 굵은 덩이가 하나 있다(OPS_BOLD_LIMIT: 한
    // 장에 굵은 덩이는 하나). 이 테스트는 "굵게가 눌리면 화면에 보이는가"만 보므로 아직
    // 굵은 구간이 없는 장을 고른다.
    const chatSlide = d.slides.find((s) => s.role === "chat" && !(s.bubbles ?? []).some((b) => b.segments.some((seg) => seg.bold)))!;
    const bubbleId = chatSlide.bubbles![0].id;
    let currentDeck = d;
    const onDeckChange = vi.fn((next: CardDeck) => { currentDeck = next; });
    const { rerender } = render(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);

    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);

    const textNode = editable.firstChild;
    expect(textNode).not.toBeNull();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = window.getSelection();
    expect(selection).not.toBeNull();
    selection!.removeAllRanges();
    selection!.addRange(range);

    fireEvent.click(within(bubbleEl).getByText("굵게"));
    // 실제 브라우저는 툴바 버튼을 누르면 그 버튼이 포커스를 가져가(contentEditable이
    // blur된다) — jsdom의 fireEvent.click은 그 암묵적 포커스 이동을 흉내내지 않으므로
    // 여기서 명시적으로 재현한다(그래야 아래 리렌더에서 효과가 새 HTML로 다시 앉힌다).
    editable.blur();

    expect(onDeckChange).toHaveBeenCalledTimes(1);
    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    expect(nextBubble.segments.some((s) => s.bold)).toBe(true);

    // 고쳤을 때: 다음 렌더에서 편집 칸 자체에 <strong>이 실제로 그려진다(줄글 textarea는
    // 절대 이걸 보여줄 수 없다 — 이게 M2의 핵심).
    rerender(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleElAfter = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"]`)!;
    expect(bubbleElAfter.querySelector("strong")).toBeTruthy();
  });

  it("CSS: contentEditable 칸 안 strong이 실제로 굵게 그려진다(돌연변이: font-weight 규칙 삭제 시 실패)", () => {
    expect(cssSrc).toMatch(/\.bubbleContent\s+strong\s*\{[^}]*font-weight:\s*800/);
  });
});

describe("M3: 말풍선 삭제 뒤 선택이 살아있는 말풍선으로 옮겨진다", () => {
  it("두 번째 말풍선을 골라 삭제하면 선택이 남은 말풍선으로 옮겨지고, 그 뒤 '말풍선 추가'가 OPS_BUBBLE_NOT_FOUND 없이 성공한다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat" && (s.bubbles?.length ?? 0) >= 2)!;
    let currentDeck = d;
    const onDeckChange = vi.fn((next: CardDeck) => { currentDeck = next; });
    const { rerender } = render(<CardDeckPanel deck={currentDeck} onDeckChange={onDeckChange} />);

    fireEvent.click(document.querySelector(`[data-slide-id="${chatSlide.id}"]`)!);
    rerender(<CardDeckPanel deck={currentDeck} onDeckChange={onDeckChange} />);

    const secondBubbleId = chatSlide.bubbles![1].id;
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${secondBubbleId}"]`)!;
    fireEvent.focus(within(bubbleEl).getByRole("textbox"));
    fireEvent.click(within(bubbleEl).getByText("삭제"));

    expect(onDeckChange).toHaveBeenCalledTimes(1);
    rerender(<CardDeckPanel deck={currentDeck} onDeckChange={onDeckChange} />);

    // 고치기 전: selectedBubbleId가 지워진 id를 그대로 들고 있어 addBubble(deck, slideId,
    // 죽은id)가 OPS_BUBBLE_NOT_FOUND로 실패하고 onDeckChange가 다시 호출되지 않는다.
    fireEvent.click(screen.getByRole("button", { name: "말풍선 추가" }));
    expect(onDeckChange).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("M4: 카드 안 글자·폼 색은 테마와 무관하게 고정 잉크색이다", () => {
  it("CSS: .cardStage가 --text/--surface-2/--border를 라이트 값으로 다시 정의한다(돌연변이: 이 재정의 블록 삭제 시 실패)", () => {
    const cardStageBlockMatch = cssSrc.match(/\.cardStage\s*\{([\s\S]*?)\n\}/);
    expect(cardStageBlockMatch).not.toBeNull();
    const block = cardStageBlockMatch![1];
    expect(block).toMatch(/--text:\s*rgb\(24 24 27\)/);
    expect(block).toMatch(/--surface-2:\s*rgb\(244 244 245\)/);
    expect(block).toMatch(/--border:\s*rgb\(228 228 231\)/);
  });

  it("CSS: 정의되지 않은 var(--muted) 토큰을 쓰지 않는다(2026-09-22 코드리뷰 MINOR)", () => {
    expect(cssSrc).not.toMatch(/var\(--muted\)/);
  });
});

describe("M5: 표지·CTA 스테이지에 발행 미리보기 캔버스가 뜬다", () => {
  it("코드: CardDeckPanel이 표지·CTA 장에서 SlideRenderPreview(발행 렌더러 재사용)를 그린다", () => {
    expect(tsxSrc).toMatch(/role === "cover" \|\| activeSlide\.role === "cta"[\s\S]{0,80}<SlideRenderPreview/);
    expect(tsxSrc).toMatch(/renderChatBubbleSlideToCanvas/);
  });
});

describe("M6: 편집 중 레이아웃 경고가 발행 전에도 한 줄로 뜬다", () => {
  it("코드: useSlideRenderCheck이 ChatBubbleRenderError 메시지를 슬라이드 아래 경고로 노출한다", () => {
    expect(tsxSrc).toMatch(/data-slide-layout-warning/);
    expect(tsxSrc).toMatch(/useSlideRenderCheck/);
  });
});

describe("MINOR: 핸들이 없을 때 발행 PNG와 같은 규칙(handle 미표기)을 따른다", () => {
  it("채팅 헤더에 '브랜드' placeholder를 지어내지 않는다", () => {
    const d = deck();
    render(<CardDeckPanel deck={d} onDeckChange={vi.fn()} />);
    expect(screen.queryByText("브랜드")).not.toBeInTheDocument();
  });
});
