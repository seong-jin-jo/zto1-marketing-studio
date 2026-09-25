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
    expect(tsxSrc).toMatch(/isPairedWithLiteralNewline/);
    expect(tsxSrc).toMatch(/execCommand\("insertText", false, "\\n"\)/);
  });
});

describe("MINOR(2): 빈 말풍선은 말풍선 전체 기준으로 거부되고, 공백뿐인 하위 세그먼트가 있어도 실제 내용이 있으면 통과한다", () => {
  it("전체가 개행뿐이면(전체 선택 후 Backspace) validateCardDeck이 거부한다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const bubble = chatSlide.bubbles![0];
    bubble.segments = [{ text: "\n", bold: false }];
    expect(() => validateCardDeck(d)).toThrow(/empty or whitespace-only/);
  });

  it("4차 재검증 회귀: 공백뿐인 굵은 세그먼트가 하나 있어도 다른 세그먼트에 실제 내용이 있으면 통과한다", () => {
    const d = deck();
    // 이미 다른 곳에 굵은 구간이 있는 슬라이드를 고르면(픽스처 slide-1) "한 장에 굵은
    // 덩이는 하나" 계약과 우연히 충돌한다 — 이 테스트의 관심사가 아니므로 굵은 구간이
    // 아직 없는 장을 고른다.
    const chatSlide = d.slides.find((s) => s.role === "chat" && !(s.bubbles ?? []).some((b) => b.segments.some((seg) => seg.bold)))!;
    const bubble = chatSlide.bubbles![0];
    // "안녕 " + 굵은 " " + "친구" — 두 번째 세그먼트만 떼어 보면 공백뿐이지만
    // 말풍선 전체 텍스트는 "안녕  친구"로 비어있지 않다. 예전엔 세그먼트별 trim 검사가
    // 이 경우도 전체를 400으로 거부했다.
    bubble.segments = [
      { text: "안녕 ", bold: false },
      { text: " ", bold: true },
      { text: "친구", bold: false },
    ];
    expect(() => validateCardDeck(d)).not.toThrow();
  });

  it("코드 대조: 검사가 말풍선 전체(segmentsText(bubble.segments).trim()) 기준이다", () => {
    expect(contractSrc).toMatch(/segmentsText\(bubble\.segments\)\.trim\(\)\.length === 0/);
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

describe("MAJOR(4차 재검증): 끝 개행은 편집 중엔 남고 blur에서만 잘린다 — 화면·저장본·PNG 줄 수 일치", () => {
  it("M2 재현: 끝에서 Enter만 치고 아무것도 안 친 채 blur하면 저장본에서 끝 개행이 잘린다", () => {
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

    // blur 전(편집 중)엔 끝 개행이 그대로 있어야 한다 — 다음 줄을 계속 칠 수 있어야
    // 하므로 이 시점에 잘리면 안 된다.
    let bubbleNow = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    expect(bubbleNow.segments.map((s) => s.text).join("")).toBe("왜 저만 안 오르죠?\n");

    fireEvent.blur(editable);

    bubbleNow = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const finalText = bubbleNow.segments.map((s) => s.text).join("");
    expect(finalText).toBe("왜 저만 안 오르죠?");
    // 저장본에 끝 개행이 없으면 wrapSegments(발행 PNG)도 빈 줄을 안 만든다 — 편집
    // 화면과 PNG의 줄 수가 같아진다("보이는 대로 발행").
    expect(finalText.split("\n").length).toBe(1);
  });

  it("M2 재현(6차 재검증, 속성 테스트가 잡음): blur 직후 DOM 자체에도 지워진 개행이 <br>로 되살아나 남지 않는다", () => {
    // 저장본(segments)은 위 테스트가 이미 확인했다 — 이건 "화면"(실제 DOM) 쪽 계약을
    // 직접 확인한다. handleBlur가 트림 직후 여전히 트림 전 bubble.segments로 화면을
    // 다시 그리면, 모델엔 없는 개행이 <br>로 화면에만 남는다(6차 재검증 MAJOR 회귀 —
    // 속성 테스트가 잡았다).
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
    fireEvent.blur(editable);

    expect(editable.innerHTML).not.toMatch(/<br>/);
    expect(editable.innerHTML).toBe("왜 저만 안 오르죠?");
  });

  it("M3b 재현: 끝에서 Enter 3번, 글자 입력, Backspace 2번 뒤 blur하면 끝의 개행 두 개가 전부 잘린다", () => {
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
    // 리뷰어 재현 그대로: Enter 세 번(각자 개행), "Z" 입력, Backspace 두 번(마지막
    // "\nZ" 자리에서 Z와 그 앞 개행 하나를 지운다 — 결과는 "...\n\n"이어야 한다).
    editable.textContent = "왜 저만 안 오르죠?\n\n\nZ";
    fireEvent.input(editable);
    editable.textContent = "왜 저만 안 오르죠?\n\n";
    fireEvent.input(editable);
    let bubbleNow = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    expect(bubbleNow.segments.map((s) => s.text).join("")).toBe("왜 저만 안 오르죠?\n\n");

    fireEvent.blur(editable);

    bubbleNow = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const finalText = bubbleNow.segments.map((s) => s.text).join("");
    expect(finalText).toBe("왜 저만 안 오르죠?");
  });

  it("코드 대조: handleBlur가 끝 개행 유무만 검사하고, 실제 트림은 전용 연산(onTrimTrailingNewline)에 맡긴다", () => {
    // 5차 재검증(T1)에서 `onTextChange`(→ retextSegments 비율 재분배) 경로를 버리고
    // 전용 연산으로 옮겼다 — 그 사실 자체를 코드에서 대조한다.
    expect(tsxSrc).toMatch(/const hasTrailingNewline = \/\\n\+\$\/\.test\(liveText\);\s*\n\s*if \(hasTrailingNewline\) \{\s*\n\s*onTrimTrailingNewline\(\);/);
    expect(tsxSrc).not.toMatch(/onTextChange\(trimmedText\)/);
  });

  it("코드 대조(6차 재검증): handleBlur의 즉시 재동기화가 trimSegmentsTrailingNewline(순수 함수)로 '트림 후' 상태를 직접 계산한다 — 다음 렌더를 기다리는 stale bubble.segments를 안 쓴다", () => {
    expect(tsxSrc).toMatch(/const segmentsForHtml = hasTrailingNewline \? trimSegmentsTrailingNewline\(bubble\.segments\) : bubble\.segments;/);
  });
});

describe("MAJOR 회귀(5차 재검증, T1): blur의 끝 개행 트림이 이미 있는 굵은 구간 경계를 옮기지 않는다", () => {
  it("전용 연산 trimBubbleTrailingNewline이 마지막 세그먼트의 끝 개행만 지우고 굵은 경계는 그대로 둔다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat" && !(s.bubbles ?? []).some((b) => b.segments.some((seg) => seg.bold)))!;
    const bubble = chatSlide.bubbles![0];
    let currentDeck = d;
    const onDeckChange = vi.fn((next: CardDeck) => { currentDeck = next; });
    const { rerender } = render(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    let bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubble.id}"]`)!;
    let editable = within(bubbleEl).getByRole("textbox");

    // 먼저 앞 두 글자를 굵게 만든다(경계를 만든다).
    editable.focus();
    fireEvent.focus(editable);
    const range = document.createRange();
    const textNode = editable.firstChild!;
    range.setStart(textNode, 0);
    range.setEnd(textNode, 2);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.click(within(bubbleEl).getByText("굵게"));
    const afterBold = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubble.id)!;
    expect(afterBold.segments[0].bold).toBe(true);
    const boldedFirstSegment = afterBold.segments[0];

    rerender(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubble.id}"]`)!;
    editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    setCaretAtEnd(editable);
    fireEvent.keyDown(editable, { key: "Enter" });
    fireEvent.blur(editable);

    const finalBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubble.id)!;
    // 첫(굵은) 세그먼트는 글자 하나도 안 움직였다 — retextSegments 비율 재분배였다면
    // 개행 한 글자가 빠지는 길이 변화만으로도 이 경계가 흔들릴 수 있었다(T1 재현).
    expect(finalBubble.segments[0]).toEqual(boldedFirstSegment);
    expect(finalBubble.segments.map((s) => s.text).join("")).not.toMatch(/\n$/);
  });

  it("코드 대조: card-deck-ops.trimBubbleTrailingNewline을 쓴다(setBubbleText 재사용 아님)", () => {
    expect(tsxSrc).toMatch(/trimBubbleTrailingNewline/);
  });

  it("6차 재검증 MAJOR 1 재현: 끝 글자를 굵게 만들고 Enter 두 번+blur해도 화면·저장본·PNG 줄 수가 같다(세그먼트 경계를 넘는 트림)", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat" && !(s.bubbles ?? []).some((b) => b.segments.some((seg) => seg.bold)))!;
    const bubble = chatSlide.bubbles![0];
    let currentDeck = d;
    const onDeckChange = vi.fn((next: CardDeck) => { currentDeck = next; });
    const { rerender } = render(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    let bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubble.id}"]`)!;
    let editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);

    // 마지막 글자를 굵게 만든다(재현 그대로: "…요" 대신 이 픽스처의 마지막 글자).
    const fullText = bubble.segments.map((s) => s.text).join("");
    const range = document.createRange();
    const textNode = editable.firstChild!;
    range.setStart(textNode, fullText.length - 1);
    range.setEnd(textNode, fullText.length);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.click(within(bubbleEl).getByText("굵게"));
    const afterBold = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubble.id)!;
    expect(afterBold.segments[afterBold.segments.length - 1].bold).toBe(true);

    rerender(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubble.id}"]`)!;
    editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    setCaretAtEnd(editable);
    fireEvent.keyDown(editable, { key: "Enter" });
    fireEvent.keyDown(editable, { key: "Enter" });
    fireEvent.blur(editable);

    const finalBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubble.id)!;
    const finalText = finalBubble.segments.map((s) => s.text).join("");
    // 화면 = 저장본 = PNG 계약: blur 후엔 끝 개행이 하나도 안 남아야 한다 — 재분배가
    // 끝 개행을 [{"…\n"},{"\n",bold}]처럼 세그먼트 두 개에 걸쳐 나눠놔도(경계를 넘어도)
    // 전부 걷혀야 한다. 마지막 글자에 준 굵게도 사라지면 안 된다.
    expect(finalText).not.toMatch(/\n$/);
    expect(finalText).toBe(fullText);
    expect(finalBubble.segments.some((s) => s.bold)).toBe(true);
  });

  it("코드 대조: trimBubbleTrailingNewline이 while 루프로 세그먼트 경계를 넘어 반복한다(6차 재검증 고정)", () => {
    const opsSrc = readFileSync(resolve(__dirname, "../../src/lib/studio/card-deck-ops.ts"), "utf8");
    expect(opsSrc).toMatch(/while \(result\.length > 0\) \{/);
  });
});

describe("MAJOR 회귀(5차 재검증, S1·S3): 선택이 무효화되면 selectionRefs 폴백도 같이 지워진다", () => {
  it("S1: 선택 뒤 캐럿만 다른 자리로 옮기면(입력 전에도) 그 낡은 범위로 굵게가 적용되지 않는다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat" && !(s.bubbles ?? []).some((b) => b.segments.some((seg) => seg.bold)))!;
    const bubble = chatSlide.bubbles![0];
    const onDeckChange = vi.fn();
    render(<BubbleEditor deck={d} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubble.id}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);

    const textNode = editable.firstChild!;
    const sel = window.getSelection()!;
    const selectRange = document.createRange();
    selectRange.setStart(textNode, 0);
    selectRange.setEnd(textNode, 3);
    sel.removeAllRanges();
    sel.addRange(selectRange);
    fireEvent(document, new Event("selectionchange")); // selectionRefs에 {0,3} 저장.

    // 캐럿만 뒤쪽으로 옮긴다(빈 선택) — 타이핑은 아직 없었다.
    const collapsedRange = document.createRange();
    collapsedRange.setStart(textNode, textNode.textContent!.length);
    collapsedRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(collapsedRange);
    fireEvent(document, new Event("selectionchange")); // 이 빈 캐럿이 selectionRefs를 지워야 한다.

    fireEvent.click(within(bubbleEl).getByText("굵게"));

    expect(onDeckChange).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("굵게 만들 글을 먼저 선택해 주세요.");
  });

  it("S3: 선택 범위를 새 텍스트로 통째로 대체해도(입력 발생) 그 낡은 범위로 굵게가 적용되지 않는다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat" && !(s.bubbles ?? []).some((b) => b.segments.some((seg) => seg.bold)))!;
    const bubble = chatSlide.bubbles![0];
    let currentDeck = d;
    const onDeckChange = vi.fn((next: CardDeck) => { currentDeck = next; });
    render(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubble.id}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);

    const textNode = editable.firstChild!;
    const sel = window.getSelection()!;
    const selectRange = document.createRange();
    selectRange.setStart(textNode, 0);
    selectRange.setEnd(textNode, 4);
    sel.removeAllRanges();
    sel.addRange(selectRange);
    fireEvent(document, new Event("selectionchange")); // selectionRefs에 {0,4} 저장.

    // 선택을 새 텍스트로 대체하는 입력을 흉내낸다 — handleInput이 onTextChange를 태운다.
    const original = bubble.segments.map((s) => s.text).join("");
    editable.textContent = `모든등급${original.slice(4)}`;
    fireEvent.input(editable);

    onDeckChange.mockClear(); // 방금 입력의 setBubbleText 호출은 이 테스트가 보는 게 아니다.
    fireEvent.click(within(bubbleEl).getByText("굵게"));

    expect(onDeckChange).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("굵게 만들 글을 먼저 선택해 주세요.");
  });

  it("코드 대조: handleSelectionChange가 빈 캐럿에서 selectionRefs를 지우고, updateBubbleText도 입력에서 지운다", () => {
    expect(tsxSrc).toMatch(/delete selectionRefs\.current\[selectedBubbleId\];/);
    expect(tsxSrc).toMatch(/delete selectionRefs\.current\[bubbleId\];/);
  });
});

describe("MINOR(1, 4차 재검증): 말풍선 맨 앞 Enter가 Chromium·WebKit에서 사라지지 않는다", () => {
  it("맨 앞이 <div><br></div>(execCommand가 만드는 실제 구조)면 선행 개행 하나로 읽는다", () => {
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
    // Chromium·WebKit이 맨 앞 Enter에서 실제로 만드는 구조.
    editable.innerHTML = "<div><br></div>왜 저만 안 오르죠?";
    fireEvent.input(editable);
    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = nextBubble.segments.map((s) => s.text).join("");
    expect(text).toBe("\n왜 저만 안 오르죠?");
  });

  it("F2(5차 재검증): 짝 br이 부모의 마지막 자식이 아니면(뒤에 형제가 더 있으면) 짝으로 스킵하지 않고 실제 줄바꿈으로 센다", () => {
    // Firefox에서 "기존 빈 줄 바로 앞"에 새 Enter를 치면, 그 개행을 그리는 <br>이 더는
    // 부모의 마지막 자식이 아니게 된다(뒤에 기존 내용이 이어진다). 짝 판정을 "직전이
    // 개행으로 끝나는 텍스트"만으로 걸면 이 br이 렌더 보조로 오판돼 줄 하나가 통째로
    // 사라진다(옛 코드에서 이 구조를 넣으면 "첫줄\n둘째줄"로 나와 개행 하나를 잃는다).
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
    editable.innerHTML = "";
    editable.appendChild(document.createTextNode("첫줄\n"));
    editable.appendChild(document.createElement("br"));
    editable.appendChild(document.createTextNode("둘째줄"));
    fireEvent.input(editable);
    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = nextBubble.segments.map((s) => s.text).join("");
    expect(text).toBe("첫줄\n\n둘째줄");
  });

  it("코드 대조: 짝 판정이 parent === el(편집칸 루트) && parent.lastChild === node 를 확인한다(6차 재검증 고정)", () => {
    expect(tsxSrc).toMatch(/isBrLastChildOfParent = !!parent && parent === el && parent\.lastChild === node/);
  });

  it("6차 재검증 MAJOR 2 재현: <strong> 안의 br은 편집칸 루트의 마지막 자식이 아니므로 짝으로 스킵되지 않는다(사용자가 친 빈 줄을 먹지 않는다)", () => {
    // 실제 버그 메커니즘의 최소 재현: 편집칸 루트 바로 밑 <br>(root의 마지막 자식이
    // 아님) 다음에 <strong> 안에 br 하나(그 strong 안에서는 마지막 자식)가 온다.
    // "부모의 마지막 자식"만 보던 5차 규칙은 이 <strong> 안 br의 직전 노드가 br이라는
    // 이유로(넓힌 "짝 br" 규칙) 통째로 스킵해 개행 하나를 먹었다 — 굵은 구간에 개행이
    // 걸리면 사용자가 실제로 친 빈 줄이 사라졌다(재현: "…요\n\n"을 굵게 만든 뒤 편집을
    // 이어가면 저장본이 한 줄 짧아졌다).
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
    editable.innerHTML = "";
    editable.appendChild(document.createTextNode("3, 4등급은요?"));
    editable.appendChild(document.createElement("br")); // 편집칸 루트 바로 밑 br(root의 마지막 자식 아님).
    const strong = document.createElement("strong");
    strong.appendChild(document.createElement("br")); // strong 안에서는 마지막 자식(진짜 줄바꿈이어야 함).
    editable.appendChild(strong);
    fireEvent.input(editable);
    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = nextBubble.segments.map((s) => s.text).join("");
    expect(text).toBe("3, 4등급은요?\n\n");
  });

  it("5차 F2는 여전히 기존 텍스트 \"\\n\" 짝 규칙으로 막힌다(루트 제한이 F2를 안 깬다)", () => {
    // MAJOR 2 수정(parent === el 제한)이 5차 F2가 고친 "직전이 개행으로 끝나는 텍스트
    // 노드"+"직전이 다른 br" 짝 규칙 자체를 깨지 않는지 회귀 확인 — 이 케이스는 br이
    // 여전히 편집칸 루트 바로 밑에 있으므로 parent===el 제한을 그대로 통과해야 한다.
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
    editable.innerHTML = "";
    editable.appendChild(document.createTextNode("첫줄\n")); // 리터럴 개행으로 끝나는 텍스트.
    editable.appendChild(document.createElement("br")); // 편집칸 루트의 마지막 자식 — 진짜 짝.
    fireEvent.input(editable);
    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = nextBubble.segments.map((s) => s.text).join("");
    expect(text).toBe("첫줄\n"); // 짝으로 인정돼 br이 개행을 중복으로 안 더한다.
  });

  it("Firefox 실측(중간 분할)은 여전히 선행 개행 없이 정확하다(회귀 방지)", () => {
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
    // r2-probe-firefox.log 실측 구조 그대로(2차 재검증 테스트와 동일 픽스처).
    editable.innerHTML = "<div>왜 저만 안 오</div><div>abc르죠?</div>";
    fireEvent.input(editable);
    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = nextBubble.segments.map((s) => s.text).join("");
    expect(text).toBe("왜 저만 안 오\nabc르죠?");
  });
});

describe("MINOR(2, 4차 재검증): WebKit 키보드 전용 굵게가 selectionchange로 저장된 범위를 대신 쓴다", () => {
  it("실시간 선택이 비어 있어도(WebKit blur가 지운 상태를 흉내냄) selectionchange가 저장해둔 범위로 굵게가 적용된다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat" && !(s.bubbles ?? []).some((b) => b.segments.some((seg) => seg.bold)))!;
    const bubble = chatSlide.bubbles![0];
    const onDeckChange = vi.fn();
    render(<BubbleEditor deck={d} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubble.id}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);

    // 실제 텍스트 일부를 선택하고 selectionchange를 발생시킨다 — BubbleEditor의
    // document 리스너가 이 범위를 selectionRefs에 저장한다.
    const range = document.createRange();
    const textNode = editable.firstChild!;
    range.setStart(textNode, 0);
    range.setEnd(textNode, 2);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent(document, new Event("selectionchange"));

    // WebKit 키보드 경로 흉내: 선택을 비우고(마치 Tab으로 포커스가 넘어가 지워진 것처럼)
    // 곧장 굵게를 누른다.
    sel.removeAllRanges();
    fireEvent.click(within(bubbleEl).getByText("굵게"));

    expect(onDeckChange).toHaveBeenCalledTimes(1);
    const next = onDeckChange.mock.calls[0][0] as CardDeck;
    const nextBubble = next.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubble.id)!;
    expect(nextBubble.segments.some((s) => s.bold)).toBe(true);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
});
