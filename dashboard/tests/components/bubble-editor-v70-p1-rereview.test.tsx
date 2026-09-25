// @vitest-environment jsdom
/**
 * PR #85 재리뷰(BLOCKER 1·MAJOR 2·MINOR 4, 2026-09-25) 회귀.
 *
 * 리뷰어가 Playwright(Chromium·WebKit·Firefox)로 실측한 탐침
 * (scratchpad/h/probe.mjs, probe2.mjs, paste.mjs, jt/ime-probe.test.tsx)을 이 repo의
 * vitest(jsdom)로 옮긴다. jsdom은 contentEditable의 브라우저 기본 Enter 동작(`<div>` 삽입)
 * 을 흉내 내지 못하므로, BLOCKER 회귀는 두 갈래로 나눈다:
 *   (a) 우리 코드의 onKeyDown이 실제로 Enter를 가로채 `\n`을 직접 넣는지 — 이건 jsdom에서
 *       그대로 실행 가능하다(우리 핸들러가 브라우저 기본 동작에 의존하지 않는다).
 *   (b) 그 가로채기를 우회해 브라우저가 실제로 만든 `<div>` 구조(probe-{engine}.log
 *       실측값을 그대로 고정)가 들어왔을 때도 elementToPlainText가 안전하게 복구하는지 —
 *       innerHTML을 리뷰어의 실측 DOM으로 직접 앉히고 input 이벤트만 쏜다(2차 방어선 테스트).
 * 저장 경로(모델) 단위로 검증하며, 어느 것으로 어떤 항목을 옮겼는지는 각 describe 제목에 적는다.
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

const tsxSrc = readFileSync(resolve(__dirname, "../../src/components/studio/BubbleEditor.tsx"), "utf8");

function setCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel!.removeAllRanges();
  sel!.addRange(range);
}

function setCaretAtStart(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(true);
  const sel = window.getSelection();
  sel!.removeAllRanges();
  sel!.addRange(range);
}

describe("BLOCKER(a): onKeyDown이 Enter/Shift+Enter를 가로채 리터럴 \\n을 직접 넣는다", () => {
  it("Enter: 캐럿 끝에서 누르면 모델 텍스트에 \\n이 그대로 들어간다(줄 안 잘림)", () => {
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
    // 메시지 맨 끝에서 Enter — 가장 흔한 실사용 경로. 예전엔 handleInput의
    // `.replace(/\n$/, "")`가 이 끝 개행을 조용히 삼켰다(자체 실측으로 잡은 회귀).
    fireEvent.keyDown(editable, { key: "Enter" });
    editable.textContent += "abc";
    fireEvent.input(editable);

    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = nextBubble.segments.map((s) => s.text).join("");
    expect(text).toBe("왜 저만 안 오르죠?\nabc");
  });

  it("Shift+Enter: WebKit에서도 사라지지 않아야 한다 — Shift 여부와 무관하게 같은 \\n 삽입", () => {
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
    editable.textContent += "xyz";
    fireEvent.input(editable);

    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = nextBubble.segments.map((s) => s.text).join("");
    expect(text).toBe("왜 저만 안 오르죠?\nxyz");
  });

  it("한글 조합(IME) 중인 Enter(nativeEvent.isComposing)는 가로채지 않는다 — 조합 확정 Enter를 삼키면 안 된다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const bubbleId = chatSlide.bubbles![0].id;
    const onDeckChange = vi.fn();
    render(<BubbleEditor deck={d} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    setCaretAtEnd(editable);
    // isComposing=true인 Enter(조합 중 IME 창에서 확정하는 그 Enter)는 preventDefault하지
    // 않는다 — 우리 handleInput을 직접 부르지 않으므로 onDeckChange가 안 불린다.
    fireEvent.keyDown(editable, { key: "Enter", isComposing: true } as unknown as KeyboardEventInit);
    expect(onDeckChange).not.toHaveBeenCalled();
  });
});

describe("BLOCKER(b): 브라우저가 실제로 만든 <div> 구조(Playwright 실측)도 elementToPlainText가 줄바꿈으로 복구한다", () => {
  it("Chromium 실측 구조: '왜 저만 안 ' + <div>abc오르죠?</div> → 모델은 '왜 저만 안 \\nabc오르죠?'", () => {
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
    // probe-chromium.log A_enter_dom 실측값을 그대로 재현한다.
    editable.innerHTML = "왜 저만 안 <div>abc오르죠?</div>";
    fireEvent.input(editable);
    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = nextBubble.segments.map((s) => s.text).join("");
    expect(text).toBe("왜 저만 안 \nabc오르죠?");
  });

  it("Firefox 실측 구조: <div>줄1</div><div>줄2</div> → 모델은 '줄1\\n줄2'(선행 개행 없음)", () => {
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
    // probe-firefox.log A_enter_dom 실측 구조.
    editable.innerHTML = "<div>왜 저만 안 오</div><div>abc르죠?</div>";
    fireEvent.input(editable);
    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = nextBubble.segments.map((s) => s.text).join("");
    expect(text).toBe("왜 저만 안 오\nabc르죠?");
  });

  it("WebKit 실측 구조: Shift+Enter도 <div>를 만든다 — 그래도 줄바꿈이 산다", () => {
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
    // probe-webkit.log A2_shiftenter_dom 실측 구조.
    editable.innerHTML = "그게 뭔데요<div>xyz?</div>";
    fireEvent.input(editable);
    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = nextBubble.segments.map((s) => s.text).join("");
    expect(text).toBe("그게 뭔데요\nxyz?");
  });
});

describe("M-B: onPaste는 text/plain만 넣는다(서식·이미지·스크립트는 버려진다)", () => {
  it("HTML 클립보드(굵게+문단+onerror 이미지)를 붙여넣어도 평문만 들어간다", () => {
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
    setCaretAtStart(editable);
    // paste.mjs 실측: text/html에 <b style>·<p>·<img onerror>가 섞여 있어도 text/plain만 쓴다.
    fireEvent.paste(editable, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "붙여넣은글 " : '<b style="color:red">붙여넣은글</b><p> </p><img src=x onerror="window.__xss=1">'),
      },
    });
    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubbleId)!;
    const text = nextBubble.segments.map((s) => s.text).join("");
    expect(text.startsWith("붙여넣은글 ")).toBe(true);
    expect(editable.querySelector("img")).toBeNull();
    expect(editable.querySelector("b")).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });
});

describe("M-A: blur 시 화면을 저장본(bubble.segments) 기준으로 다시 그린다", () => {
  it("굵은 구간 앞에 글자를 추가하면 저장본의 bold 위치가 바뀐다 — blur 전엔 화면이 옛 위치를 들고 있다가, blur하면 새 위치로 다시 그려진다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat" && (s.bubbles ?? []).some((b) => b.segments.some((seg) => seg.bold)))!;
    const boldBubble = chatSlide.bubbles!.find((b) => b.segments.some((seg) => seg.bold))!;
    const originalBoldText = boldBubble.segments.find((s) => s.bold)!.text;
    let currentDeck = d;
    const onDeckChange = vi.fn((next: CardDeck) => { currentDeck = next; });
    const { rerender } = render(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${boldBubble.id}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    // Home에서 타이핑(probe.mjs D2 시나리오): 기존 <strong> 노드는 안 건드리고 그 앞에
    // 텍스트 노드만 새로 끼워 넣는다 — 실제 타이핑이 끝 <br>/기존 서식 노드를 통째로
    // 지우지 않고 캐럿 자리에만 글자를 더하는 것과 같다.
    const range = document.createRange();
    range.setStart(editable, 0);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    range.insertNode(document.createTextNode("새로운 머리말 "));
    fireEvent.input(editable);
    // BubbleEditor는 컨트롤드 컴포넌트다 — 부모(이 테스트)가 onDeckChange로 받은 새 deck을
    // 되먹여야 다음 렌더에 새 bubble.segments가 prop으로 들어간다(실제 studio/page.tsx가
    // state로 하는 일을 여기서 흉내 낸다).
    rerender(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);

    // 포커스가 남아있는 동안(blur 전)은 리렌더가 DOM을 건드리지 않아 <strong>이 옛 자리에
    // 그대로 남는다(IME 보호 설계 그대로) — 이 시점 DOM의 strong 텍스트는 아직 원래 값이다.
    expect(editable.querySelector("strong")?.textContent).toBe(originalBoldText);

    fireEvent.blur(editable);

    const nextBubble = currentDeck.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === boldBubble.id)!;
    const expectedBoldText = nextBubble.segments.find((s) => s.bold)!.text;
    // 고치기 전에는 blur 이후에도 DOM이 옛 <strong> 위치를 그대로 들고 있었다(회귀 지점).
    expect(editable.querySelector("strong")?.textContent).toBe(expectedBoldText);
  });
});

describe("MINOR(1): 굵게 적용 뒤 같은 글자 범위가 다시 선택된다", () => {
  it("전체 선택 후 굵게를 누르면(포커스가 버튼으로 넘어가도) 다음 microtask에 편집칸이 다시 포커스·선택된다", async () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat" && !(s.bubbles ?? []).some((b) => b.segments.some((seg) => seg.bold)))!;
    const bubble = chatSlide.bubbles![0];
    const onDeckChange = vi.fn();
    render(<BubbleEditor deck={d} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubble.id}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    const range = document.createRange();
    range.selectNodeContents(editable);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    fireEvent.click(within(bubbleEl).getByText("굵게"));
    expect(onDeckChange).toHaveBeenCalledTimes(1);

    // handleToggleBold는 queueMicrotask로 선택 복원을 예약한다.
    await Promise.resolve();
    await Promise.resolve();

    expect(document.activeElement).toBe(editable);
    const restored = window.getSelection();
    expect(restored?.rangeCount).toBeGreaterThan(0);
    expect(restored?.isCollapsed).toBe(false);
  });
});

describe("MINOR(2): compositionend 없이 blur돼도 그 뒤 입력이 버려지지 않는다", () => {
  it("조합 중 blur → 다시 포커스해 입력하면 onDeckChange가 불린다(조합 플래그가 안 눌어붙는다)", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const bubbleId = chatSlide.bubbles![0].id;
    const onDeckChange = vi.fn();
    render(<BubbleEditor deck={d} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    fireEvent.compositionStart(editable);
    editable.textContent = "ㅎ";
    fireEvent.input(editable);
    expect(onDeckChange).not.toHaveBeenCalled(); // 조합 중엔 저장 안 함(기존 계약)

    // compositionend 없이 blur (창 전환·다른 말풍선 클릭 등 실사용 경로).
    fireEvent.blur(editable);

    editable.focus();
    fireEvent.focus(editable);
    editable.textContent = "확정된 글자";
    fireEvent.input(editable);
    // 고치기 전에는 isComposingRef가 true로 눌어붙어 이 input이 통째로 버려졌다.
    expect(onDeckChange).toHaveBeenCalled();
  });
});

describe("MINOR(4): 빈 말풍선은 화면에 이유를 보여준다", () => {
  it("말풍선을 비우면 저장 거부 이유 힌트가 뜨고, 다시 채우면 사라진다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const bubbleId = chatSlide.bubbles![0].id;
    let currentDeck = d;
    const onDeckChange = vi.fn((next: CardDeck) => { currentDeck = next; });
    const { rerender } = render(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"]`)!;
    expect(bubbleEl.querySelector("[data-bubble-empty-hint]")).toBeNull();

    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    editable.textContent = "";
    fireEvent.input(editable);
    rerender(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    expect(document.querySelector(`[data-bubble-id="${bubbleId}"] [data-bubble-empty-hint]`)).not.toBeNull();

    const editableAgain = within(document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"]`)!).getByRole("textbox");
    editableAgain.textContent = "다시 채움";
    fireEvent.input(editableAgain);
    rerender(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    expect(document.querySelector(`[data-bubble-id="${bubbleId}"] [data-bubble-empty-hint]`)).toBeNull();
  });
});

describe("기존 한글 IME 계약(2026-09-22 코드리뷰)이 이번 변경으로 안 깨졌는지 재확인", () => {
  it("조합 중엔 저장 0회, compositionend에서 최종 확정 1회 이상, DOM은 조합 중 안 바뀐다", () => {
    const d = deck();
    const chatSlide = d.slides.find((s) => s.role === "chat")!;
    const bubble = chatSlide.bubbles![1];
    let currentDeck = d;
    const calls: string[] = [];
    const onDeckChange = vi.fn((next: CardDeck) => {
      currentDeck = next;
      calls.push(next.slides.find((s) => s.id === chatSlide.id)!.bubbles!.find((b) => b.id === bubble.id)!.segments.map((s) => s.text).join(""));
    });
    render(<BubbleEditor deck={currentDeck} slideId={chatSlide.id} onDeckChange={onDeckChange} />);
    const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubble.id}"]`)!;
    const editable = within(bubbleEl).getByRole("textbox");
    editable.focus();
    fireEvent.focus(editable);
    const base = bubble.segments.map((s) => s.text).join("");
    fireEvent.compositionStart(editable);
    for (const s of ["ㅎ", "하", "한"]) { editable.textContent = s + base; fireEvent.input(editable); }
    expect(calls.length).toBe(0);
    const domBefore = editable.innerHTML;
    fireEvent.compositionEnd(editable);
    expect(editable.innerHTML).toBe(domBefore);
    expect(calls.at(-1)).toBe("한" + base);
  });
});

describe("코드 대조: BLOCKER·M-B 수정이 실제로 들어갔다(정적 확인)", () => {
  it("onKeyDown(Enter 가로채기)·onPaste(text/plain만)·onBlur(강제 재동기화)가 소스에 있다", () => {
    expect(tsxSrc).toMatch(/onKeyDown=\{handleKeyDown\}/);
    expect(tsxSrc).toMatch(/onPaste=\{handlePaste\}/);
    expect(tsxSrc).toMatch(/onBlur=\{handleBlur\}/);
    expect(tsxSrc).toMatch(/getData\("text\/plain"\)/);
    expect(tsxSrc).toMatch(/nodeName === "DIV" \|\| node\.nodeName === "P"/);
  });
});
