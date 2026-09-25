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

  it("코드 대조: handleBlur가 elementToPlainText로 라이브 텍스트를 읽어 끝 개행만 replace로 잘라낸다", () => {
    expect(tsxSrc).toMatch(/trimmedText = liveText\.replace\(\/\\n\+\$\/, ""\)/);
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
