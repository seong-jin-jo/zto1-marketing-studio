// @vitest-environment jsdom
/**
 * PR #85 6차 재검증 — 구조 보강(필수).
 *
 * 5·6차 재검증에서 "규칙 하나를 넓히는" 식으로 고친 자리 바로 옆에서 매번 새 회귀가
 * 났다(S1/S3 → T1 → F2 → MAJOR1/MAJOR2). 개별 재현 테스트는 그때 그 버그 하나만
 * 막는다 — 이 파일은 편집기의 핵심 계약 자체를 검사한다:
 *
 *   화면 줄 수 = elementToPlainText 줄 수 = wrapSegments 줄 수(끝 개행 trim 후)
 *
 * Enter·입력·굵게·선택을 섞은 수백 개의 무작위(시드 고정, 재현 가능) 시퀀스를 돌려
 * 매 시퀀스 끝(blur) 시점에 이 계약이 깨지지 않는지 확인한다. 시드를 고정해 실패가
 * 재현 가능하게 한다(우연히만 통과하는 걸 방지).
 *
 * ★ jsdom 한계 인정: jsdom은 `document.execCommand`를 구현하지 않아 Enter는 항상
 * `handleKeyDown`의 폴백 경로(리터럴 "\n" 텍스트 노드 삽입)를 탄다 — 실제 브라우저의
 * `<div>`·`<br>` 구조(MINOR1·F2·MAJOR2가 사는 자리)는 이 파일로 재현되지 않는다. 그
 * 축은 `scripts/verify-bubble-editor-toolbar-e2e.mjs`(Playwright 3엔진)가 전담한다.
 * 이 파일이 실제로 잡는 것은 `retextSegments`(비율 재분배)·`toggleBold`·
 * `trimBubbleTrailingNewline`(반복 트림)이 임의의 순서로 섞일 때 세그먼트 구조가
 * 깨지는지 — 즉 MAJOR1류(세그먼트 경계를 넘는 끝 개행)가 사는 자리다.
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BubbleEditor, elementToPlainText } from "@/components/studio/BubbleEditor";
import { wrapSegments } from "@/lib/studio/card-templates/chat-bubble";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import deckD100 from "../studio/fixtures/deck-d100.v2.json";

afterEach(cleanup);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** 매 트라이얼마다 볼드가 없는 짧은 말풍선 하나짜리 덱을 새로 만든다(장당 볼드 1개 한도와 무관하게). */
function freshDeck(seedText: string): { deck: CardDeck; slideId: string; bubbleId: string } {
  const base = clone(deckD100) as unknown as CardDeck;
  const chatSlide = base.slides.find((s) => s.role === "chat")!;
  const bubble = chatSlide.bubbles![0];
  bubble.segments = [{ text: seedText, bold: false }];
  return { deck: base, slideId: chatSlide.id, bubbleId: bubble.id };
}

/** mulberry32 — 시드 고정 PRNG(실패가 재현 가능해야 한다, 매번 다른 무작위는 디버깅 불가). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

const CHARS = ["가", "나", "다", "a", "b", "1", " "];

let canvasCtx: CanvasRenderingContext2D;
try {
  canvasCtx = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
} catch {
  canvasCtx = null as unknown as CanvasRenderingContext2D;
}

function wrapLineCount(segments: { text: string; bold: boolean }[]): number {
  // maxWidth를 넉넉히 줘 폭에 의한 자동 줄바꿈이 안 끼어들게 한다 — 여기서 보는 건
  // "\n" 강제 줄바꿈 개수지 폭 wrap이 아니다(E2E 스크립트 __wrapSegmentsLineCount와 같은 값).
  return wrapSegments(canvasCtx, segments, 24, 5000).length;
}

/**
 * 이 두 헬퍼는 `el.textContent = 새문자열`(통째 교체) 대신 기존 DOM 구조를 보존하며
 * 딱 한 글자만 넣거나 뺀다. 처음엔 통째 교체로 짰다가 실패 사례를 하나씩 손으로
 * 재현해보니, 굵게를 적용해 `<strong>`이 생긴 뒤 통째 교체를 하면 그 `<strong>`
 * 자체가 통째로 사라지는데 — 그런데 `retextSegments`는 "이전 세그먼트의 굵기 비율"로
 * 새 텍스트를 재분배해 모델에는 굵기가 되살아난다. DOM은 납작해졌는데 모델은 굵기를
 * 기억하는 이 모순이 화면·저장본 불일치의 원인이었다 — **프로덕션 버그가 아니라
 * 하네스가 실제 사용자가 못 하는 조작(굵게 span을 통째로 날려버리는 텍스트 대입)을
 * 흉내 낸 것**이었다. 실제 사용자는 Backspace 한 번에 글자 하나만 지운다 — 이
 * 헬퍼가 그걸 그대로 흉내 낸다(끝에서 한 노드만 건드린다).
 */
function appendCharPreservingDom(el: HTMLElement, ch: string): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  range.insertNode(document.createTextNode(ch));
}

function backspaceOnePreservingDom(el: HTMLElement): void {
  let node: Node = el;
  while (node.lastChild) node = node.lastChild;
  if (node === el) return; // 완전히 비어 있다 — 지울 것 없음.
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (text.length > 1) {
      node.textContent = text.slice(0, -1);
    } else {
      node.parentNode?.removeChild(node);
    }
  } else if (node.nodeName === "BR") {
    node.parentNode?.removeChild(node);
  }
}

describe("속성 테스트(6차 재검증 구조 보강): 화면 = 저장본 = PNG(끝 개행 trim 후)", () => {
  const TRIALS = 300;
  const rng = mulberry32(20260926);

  it(`무작위 ${TRIALS}회 시퀀스(Enter·입력·굵게·선택·blur 혼합) 모두 계약을 지킨다`, () => {
    const failures: string[] = [];

    for (let trial = 0; trial < TRIALS; trial += 1) {
      const seedText = pick(rng, ["3, 4등급은요?", "새 교재가 아니라 시험 운영이 먼저예요", "점수가 오히려 내려갑니다", "ab"]);
      const { deck, slideId, bubbleId } = freshDeck(seedText);
      let currentDeck = deck;
      const onDeckChange = (next: CardDeck) => { currentDeck = next; };
      const { unmount, rerender } = render(<BubbleEditor deck={currentDeck} slideId={slideId} onDeckChange={onDeckChange} />);
      const rerenderNow = () => rerender(<BubbleEditor deck={currentDeck} slideId={slideId} onDeckChange={onDeckChange} />);
      const bubbleEl = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"]`)!;
      const editable = within(bubbleEl).getByRole("textbox");
      editable.focus();
      fireEvent.focus(editable);

      const stepCount = 1 + Math.floor(rng() * 6); // 1~6 단계.
      let boldUsed = false;
      try {
        for (let step = 0; step < stepCount; step += 1) {
          const el = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"] [data-bubble-content-editable]`);
          if (!el) break; // 쪼개기 등으로 말풍선이 사라진 경우는 이 트라이얼에서 다루지 않는다.
          const liveText = elementToPlainText(el);
          const actions: Array<() => void> = [
            // 입력: 임의 글자를 끝에 덧붙인다(기존 노드는 안 건드리고 새 텍스트 노드만
            // 추가한다 — 굵게로 생긴 <strong>이 있어도 안 날아간다, 위 헬퍼 주석 참고).
            () => {
              appendCharPreservingDom(el, pick(rng, CHARS));
              fireEvent.input(el);
            },
            // Enter: jsdom은 execCommand가 없어 항상 폴백(리터럴 "\n" 삽입) 경로를 탄다.
            // handleKeyDown은 현재 Selection의 Range를 그대로 쓰는데, 이전 단계에서
            // textContent를 직접 갈아치우면(입력·Backspace 흉내) 그 노드가 이미 DOM에서
            // 사라져 Selection이 끊긴 채로 남는다 — 실제 사용자는 항상 캐럿이 어딘가에
            // 있는 상태에서만 Enter를 치므로, 여기서도 Enter 직전에 끝으로 캐럿을 다시
            // 잡아 진짜 사용 패턴과 같게 만든다(끊긴 Selection은 테스트 하네스의 결함이지
            // 프로덕션 버그가 아니다).
            () => {
              const r = document.createRange();
              if (el.childNodes.length > 0) {
                r.selectNodeContents(el);
                r.collapse(false);
              } else {
                r.setStart(el, 0);
                r.collapse(true);
              }
              const s = window.getSelection()!;
              s.removeAllRanges();
              s.addRange(r);
              fireEvent.keyDown(el, { key: "Enter" });
            },
            // Backspace 흉내: 마지막 글자를 지운다(끝 노드 하나만 건드린다 — 위 헬퍼 주석 참고).
            () => {
              if (liveText.length === 0) return;
              backspaceOnePreservingDom(el);
              fireEvent.input(el);
            },
          ];
          // 굵게는 편집칸이 단일 텍스트 노드일 때만(선택 좌표를 안전하게 잡을 수 있을 때만) 시도한다.
          if (!boldUsed && el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE && liveText.length >= 2) {
            actions.push(() => {
              const len = liveText.length;
              const from = Math.floor(rng() * (len - 1));
              const to = from + 1 + Math.floor(rng() * (len - from));
              const range = document.createRange();
              range.setStart(el.firstChild!, from);
              range.setEnd(el.firstChild!, to);
              const sel = window.getSelection()!;
              sel.removeAllRanges();
              sel.addRange(range);
              const boldBtn = within(bubbleEl).queryByText("굵게");
              if (boldBtn) fireEvent.click(boldBtn);
              boldUsed = true;
            });
          }
          pick(rng, actions)();
          // BubbleEditor는 controlled prop(deck)이다 — onDeckChange가 바꾼 값을 다시
          // prop으로 먹이지 않으면 handleBlur가 여전히 "이전 렌더의 bubble.segments"를
          // 들고 있어, blur 시 그 낡은 값으로 화면을 되돌려 쓴다(화면=저장본 계약을
          // 검사하려는 이 테스트 자체가 그 계약을 깨는 하네스 버그가 된다). 실제
          // BubbleEditor 사용처(CardDeckPanel)는 항상 최신 deck을 controlled prop으로
          // 먹이므로, 이 재렌더가 실제 사용 패턴과 같다.
          rerenderNow();

          // 매 단계 직후(blur 전): 화면(elementToPlainText)과 저장본(segments 결합 텍스트)이
          // 같아야 한다 — handleInput이 매 입력마다 onTextChange로 동기화하는 그 자체의 계약.
          const elAfter = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"] [data-bubble-content-editable]`);
          if (elAfter) {
            const screenText = elementToPlainText(elAfter);
            const bubbleNow = currentDeck.slides.find((s) => s.id === slideId)?.bubbles?.find((b) => b.id === bubbleId);
            if (bubbleNow) {
              const modelText = bubbleNow.segments.map((s) => s.text).join("");
              if (screenText !== modelText) {
                failures.push(`trial=${trial} step=${step}: 화면="${screenText}" != 저장본="${modelText}"`);
              }
            }
          }
        }

        const elFinal = document.querySelector<HTMLElement>(`[data-bubble-id="${bubbleId}"] [data-bubble-content-editable]`);
        if (elFinal) {
          fireEvent.blur(elFinal);
        }

        const bubbleFinal = currentDeck.slides.find((s) => s.id === slideId)?.bubbles?.find((b) => b.id === bubbleId);
        if (bubbleFinal) {
          const finalText = bubbleFinal.segments.map((s) => s.text).join("");
          // 핵심 계약 1: blur 후 저장본에 끝 개행이 하나도 안 남는다(세그먼트 경계를
          // 몇 번 넘든 — MAJOR1이 정확히 이 자리에서 깨졌었다).
          if (/\n$/.test(finalText)) {
            failures.push(`trial=${trial}: blur 후에도 끝 개행이 남음 text="${JSON.stringify(finalText)}"`);
          }
          // 핵심 계약 2: 화면 줄 수 = 저장본 줄 수 = PNG(wrapSegments) 줄 수.
          const screenLines = elFinal ? elementToPlainText(elFinal).split("\n").length : null;
          const modelLines = finalText.split("\n").length;
          const pngLines = wrapLineCount(bubbleFinal.segments);
          if (screenLines !== null && screenLines !== modelLines) {
            failures.push(`trial=${trial}: 화면 줄 수(${screenLines}) != 저장본 줄 수(${modelLines}) text="${JSON.stringify(finalText)}"`);
          }
          if (pngLines !== modelLines) {
            failures.push(`trial=${trial}: PNG 줄 수(${pngLines}) != 저장본 줄 수(${modelLines}) segments=${JSON.stringify(bubbleFinal.segments)}`);
          }
        }
      } finally {
        unmount();
      }
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length}건 실패(총 ${TRIALS}회 중):\n` + failures.slice(0, 20).join("\n"));
    }
  });
});
