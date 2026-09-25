// @vitest-environment jsdom
/**
 * PR #85 재검증 2차(BLOCKER 1·MAJOR 1·MINOR 4, 2026-09-25) 회귀.
 *
 * 리뷰어가 Playwright 3엔진(Chromium·WebKit·Firefox)으로 실측한 탐침
 * (scratchpad/h/probe3.mjs, ime2.mjs, r2-*.log)을 근거로 한다.
 *
 * ★ jsdom 한계 인정: "툴바 버튼을 실제 마우스로 누르면 mousedown이 먼저 편집칸을
 * blur시킨다"는 이 BLOCKER의 핵심 메커니즘은 jsdom이 클릭 때 자동으로 blur를 일으키지
 * 않아 재현할 수 없다(리뷰어 지적 그대로). 이 파일의 BLOCKER 테스트는 "mousedown이 실제로
 * preventDefault되는가"(수정 자체가 존재하는가)만 검증하고, "그 결과 실제 브라우저에서
 * 굵게·쪼개기가 동작하는가"는 `dashboard/scripts/verify-bubble-editor-toolbar-e2e.mjs`
 * (Playwright, 3엔진)가 담당한다 — 이 스크립트 실행 로그를 최종 보고에 첨부한다.
 * MAJOR(문장 끝 Enter 두 줄 생성)와 MINOR들은 jsdom으로 완전히 검증 가능하다.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BubbleEditor } from "@/components/studio/BubbleEditor";
import { validateCardDeck } from "@/lib/studio/card-deck-contract";
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

const tsxSrc = readFileSync(resolve(__dirname, "../../src/components/studio/BubbleEditor.tsx"), "utf8");
const contractSrc = readFileSync(resolve(__dirname, "../../src/lib/studio/card-deck-contract.ts"), "utf8");

function setCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel!.removeAllRanges();
  sel!.addRange(range);
}

describe("BLOCKER 잔여(a): 툴바 버튼은 mousedown 기본 동작을 막아 blur를 일으키지 않는다", () => {
  it("굵게 버튼을 mousedown해도 편집칸이 blur되지 않는다(preventDefault 확인)", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const bubble = chatSlide.bubbles![0];
    const onDeckChange = vi.fn();
    render(<BubbleEditor deck={d} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubble.id}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    const boldButton = within(bubbleEl).getByText("굵게");
    const mouseDownEvent = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    const dispatchResult = boldButton.dispatchEvent(mouseDownEvent);
    // preventDefault가 실제로 불렸으면 dispatchEvent는 false를 돌려준다.
    expect(dispatchResult).toBe(false);
    expect(mouseDownEvent.defaultPrevented).toBe(true);
  });

  it("코드 대조: 5개 툴바 버튼(굵게·화자 전환·쪼개기·합치기·삭제) 전부 onMouseDown preventDefault를 건다", () => {
    const mouseDownCount = (tsxSrc.match(/onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/g) ?? []).length;
    expect(mouseDownCount).toBe(5);
  });
});

describe("BLOCKER 잔여(b): handleBlur는 DOM이 모델과 다를 때만 다시 그린다(2차 방어)", () => {
  it("DOM이 이미 모델과 같으면 blur해도 innerHTML을 새로 안 쓴다(선택을 불필요하게 안 건드린다)", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const bubble = chatSlide.bubbles![0];
    const onDeckChange = vi.fn();
    render(<BubbleEditor deck={d} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubble.id}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    // 아무 것도 안 바꾸고 바로 blur — DOM과 모델이 이미 같다.
    const before = editable.innerHTML;
    // innerHTML setter 호출 여부를 감시한다.
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML")!;
    const setSpy = vi.fn();
    Object.defineProperty(editable, "innerHTML", {
      configurable: true,
      get() { return descriptor.get!.call(editable); },
      set(value: string) { setSpy(value); descriptor.set!.call(editable, value); },
    });
    fireEvent.blur(editable);
    expect(setSpy).not.toHaveBeenCalled();
    expect(editable.innerHTML).toBe(before);
  });
});

describe("MAJOR: 말풍선 끝에서 Enter(Shift+Enter 포함)를 두 번 눌러도 편집 화면·저장본의 줄 수가 같다", () => {
  // jsdom은 document.execCommand("insertText", ...)를 실행하지 않는다(스펙 미구현, 항상
  // false) — handleKeyDown은 그러면 순수 수동 \n 삽입으로 물러난다. 실제 브라우저(Chromium·
  // WebKit이 execCommand로 만드는 `<div><br></div>`, Firefox의 `\n<br>` 짝)에서
  // elementToPlainText가 정확히 읽는지는 jsdom이 재현 못 하므로
  // scripts/verify-bubble-editor-toolbar-e2e.mjs(Playwright 3엔진)가 담당한다.
  it("끝에서 Enter 한 번 + 타이핑 — 저장본이 정확히 두 줄이다(jsdom 수동 삽입 경로)", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const bubbleId = chatSlide.bubbles![0].id; // "왜 저만 안 오르죠?"
    let currentDeck = d;
    const onDeckChange = vi.fn((next: CardDeck) => { currentDeck = next; });
    render(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    setCaretAtEnd(editable);
    fireEvent.keyDown(editable, { key: "Enter" });

    let bubbleNow = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    expect(bubbleNow.segments.map((s) => s.text).join("")).toBe("왜 저만 안 오르죠?\n");

    // 이어서 타이핑(실제 문자 입력은 브라우저가 처리하므로 결과 텍스트만 흉내낸다).
    editable.textContent = "왜 저만 안 오르죠?\n끝줄";
    fireEvent.input(editable);

    bubbleNow = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const finalText = bubbleNow.segments.map((s) => s.text).join("");
    expect(finalText).toBe("왜 저만 안 오르죠?\n끝줄");
    // 정확히 두 줄이어야 한다(발행 PNG의 줄 수와 일치 — 세 줄이 되면 빈 줄이 하나 낀 것).
    expect(finalText.split("\n").length).toBe(2);
  });

  it("Shift+Enter도 정확히 두 줄이 된다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const bubbleId = chatSlide.bubbles![0].id;
    let currentDeck = d;
    const onDeckChange = vi.fn((next: CardDeck) => { currentDeck = next; });
    render(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    setCaretAtEnd(editable);
    fireEvent.keyDown(editable, { key: "Enter", shiftKey: true });
    const bubbleNow = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = bubbleNow.segments.map((s) => s.text).join("");
    expect(text).toBe("왜 저만 안 오르죠?\n");
    expect(text.split("\n").length).toBe(2);
  });

  it("코드 대조: elementToPlainText가 Chromium/WebKit의 <div><br></div>(빈 줄)와 Firefox의 \\n+<br> 짝을 이중 카운트하지 않는다", () => {
    expect(tsxSrc).toMatch(/isSoleChildOfBlock/);
    expect(tsxSrc).toMatch(/isHelperPair/);
    expect(tsxSrc).toMatch(/execCommand\("insertText", false, "\\n"\)/);
  });
});

describe("MINOR(2): 전체 선택 후 지운 말풍선(\\n만 남음)은 계약 검사에서 거부된다", () => {
  it("segments[].text가 개행뿐이면 validateCardDeck이 trim 기준으로 거부한다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const bubble = chatSlide.bubbles![0];
    bubble.segments = [{ text: "\n", bold: false }];
    expect(() => validateCardDeck(d)).toThrow(/empty or whitespace-only/);
  });

  it("코드 대조: 검사가 trim 기준이다(리터럴 !segment.text 아님)", () => {
    expect(contractSrc).toMatch(/segment\.text\.trim\(\)\.length === 0/);
  });
});

describe("MINOR(3): 붙여넣기의 \\r\\n을 \\n으로 정규화한다", () => {
  it("Windows 줄바꿈(\\r\\n)이 섞인 클립보드도 \\n만 남는다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const bubbleId = chatSlide.bubbles![0].id;
    let currentDeck = d;
    const onDeckChange = vi.fn((next: CardDeck) => { currentDeck = next; });
    render(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.paste(editable, {
      clipboardData: { getData: (type: string) => (type === "text/plain" ? "한줄\r\n두줄\n" : "") },
    });
    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = nextBubble.segments.map((s) => s.text).join("");
    expect(text).not.toContain("\r");
    expect(text.startsWith("한줄\n두줄\n")).toBe(true);
  });
});

describe("MINOR(4): 가능하면 execCommand('insertText')로 붙여넣기를 실행취소 기록에 남긴다", () => {
  it("코드 대조: handlePaste가 execCommand를 먼저 시도하고 실패하면 수동 삽입으로 물러난다", () => {
    expect(tsxSrc).toMatch(/execCommand\("insertText", false, text\)/);
  });

  it("execCommand가 지원되면(true 반환) 그 경로로 처리되고 텍스트가 반영된다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const bubbleId = chatSlide.bubbles![0].id;
    let currentDeck = d;
    const onDeckChange = vi.fn((next: CardDeck) => { currentDeck = next; });
    render(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    const original = document.execCommand;
    document.execCommand = vi.fn((command: string, _ui?: boolean, value?: string) => {
      if (command === "insertText" && value) {
        const r = window.getSelection()!.getRangeAt(0);
        r.insertNode(document.createTextNode(value));
      }
      return true;
    }) as typeof document.execCommand;
    try {
      fireEvent.paste(editable, { clipboardData: { getData: (type: string) => (type === "text/plain" ? "실행취소용" : "") } });
    } finally {
      document.execCommand = original;
    }
    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    expect(nextBubble.segments.map((s) => s.text).join("")).toContain("실행취소용");
  });
});
