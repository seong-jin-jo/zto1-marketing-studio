"use client";

/**
 * 편집실 말풍선 편집 UI (설계 §5 F4, PR4).
 *
 * "직접 편집 기본, AI는 보조"(D-2026-09-09-1) — 이 컴포넌트는 순수 직접 편집 도구다.
 * 모든 상태 변화는 `card-deck-ops.ts` 의 순수 함수만 거친다(직접 상태 조작 금지, 세션맥락).
 * 실패는 `CardDeckOpsError(code, message)` 로 이유를 데리고 나온다(조용한 실패 금지) —
 * 다만 message는 개발자용 영문 원문이라 그대로 찍지 않는다. `cardDeckOpsErrorMessage(code)`
 * 로 옮긴 한국어 고정 문구를 화면에 보여주고, 원문은 console.error로만 보낸다(F4,
 * 2026-09-22 코드리뷰 3차).
 */
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/shared/Button";
import type { Bubble, CardDeck, CardSlide, Segment } from "@/lib/studio/card-deck-contract";
import {
  CardDeckOpsError,
  addBubble,
  addSlide,
  caretToSegment,
  deleteBubble,
  deleteSlide,
  mergeBubble,
  moveSlide,
  setBubbleText,
  setSlideCover,
  setSlideCoverImage,
  splitBubble,
  toggleBold,
  toggleSpeaker,
  trimBubbleTrailingNewline,
} from "@/lib/studio/card-deck-ops";
import { renderChatBubbleSlideToCanvas } from "@/lib/studio/card-templates/chat-bubble";
import { DeliveredMedia } from "./DeliveredMedia";
import { authHeaders } from "@/lib/auth";
import styles from "./BubbleEditor.module.css";

/**
 * 편집 중 레이아웃 검사 디바운스(M6, PR 리뷰). `renderChatBubbleSlideToCanvas` 는 발행과
 * 같은 렌더러라 말풍선이 카드보다 길거나 표지 헤드라인이 3줄을 넘으면 그 자리에서
 * `ChatBubbleRenderError` 를 던진다(chat-bubble.ts). 키 입력마다 캔버스를 다시 그리면
 * 무겁고 미완성 문장에서 계속 경고가 깜빡이므로 400ms 멈춘 뒤에만 검사한다.
 */
const SLIDE_RENDER_CHECK_DEBOUNCE_MS = 400;

const SLIDE_ROLE_LABEL: Record<CardSlide["role"], string> = {
  cover: "표지",
  chat: "대화",
  comment_prompt: "댓글유도",
  cta: "CTA",
};

/**
 * 4역할 배지 색(세션맥락 과제 ③). `card-deck-contract.ts` 의 `SlideRole` 이 이미
 * 표지=0번·CTA=마지막·댓글유도=CTA 바로 앞 한 장이라는 순서 불변식을 `validateCardDeck`
 * 으로 강제하므로, 배지는 그 필드를 그대로 읽을 뿐 인덱스로 역할을 추정하지 않는다.
 */
const SLIDE_ROLE_BADGE_CLASS: Record<CardSlide["role"], string> = {
  cover: "border-accent bg-accent-soft text-accent",
  chat: "border-border bg-surface-2 text-muted",
  // 2026-09-22 코드리뷰 MINOR 3: `bg-warning/10`·`bg-success/10` 은 임의 opacity 변형.
  // `--color-warning-soft`·`--color-success-soft`(globals.css) 가 이미 있다.
  comment_prompt: "border-warning bg-warning-soft text-warning",
  cta: "border-success bg-success-soft text-success",
};

export interface BubbleEditorProps {
  deck: CardDeck;
  slideId: string;
  onDeckChange: (deck: CardDeck) => void;
}

/**
 * F4(2026-09-22 코드리뷰 3차): CardDeckOpsError.message는 개발자용 영문 원문
 * ("cannot merge bubbles with different speakers" 류)이다. 원문은 console.error로만
 * 보내고(run/runSlide) 화면에는 code별 고정 한국어 문구만 보여준다. ops 함수의 message
 * 자체는 바꾸지 않는다 — 기존 테스트가 code만 검사해 그쪽엔 영향 없다.
 */
function cardDeckOpsErrorMessage(code: string): string {
  switch (code) {
    case "OPS_SLIDE_NOT_FOUND": return "이 장을 찾지 못했습니다.";
    case "OPS_BUBBLE_NOT_FOUND": return "이 말풍선을 찾지 못했습니다.";
    case "OPS_NOT_COVER_SLIDE": return "표지 장에서만 바꿀 수 있습니다.";
    case "OPS_NOT_COVER_OR_CTA_SLIDE": return "표지·마지막 장에서만 사진을 바꿀 수 있습니다.";
    case "OPS_SPLIT_OUT_OF_RANGE": return "그 자리에서는 쪼갤 수 없습니다.";
    case "OPS_SPLIT_EMPTY": return "쪼개면 빈 말풍선이 생겨 쪼갤 수 없습니다.";
    case "OPS_MERGE_NO_NEXT": return "합칠 다음 말풍선이 없습니다.";
    case "OPS_SPEAKER_MISMATCH": return "화자가 다른 말풍선은 합칠 수 없습니다.";
    case "OPS_DELETE_LAST_BUBBLE": return "장에 말풍선이 하나뿐이면 지울 수 없습니다.";
    case "OPS_MOVE_OUT_OF_RANGE": return "그 방향으로는 옮길 수 없습니다.";
    case "OPS_BOLD_EMPTY_RANGE": return "굵게 만들 글을 먼저 선택해 주세요.";
    case "OPS_BOLD_LIMIT": return "한 장에 굵은 덩이는 하나입니다.";
    case "OPS_SLIDE_LOCKED": return "표지·CTA 장은 옮기거나 지울 수 없습니다.";
    case "OPS_SLIDE_OUT_OF_RANGE": return "그 자리에는 장을 넣을 수 없습니다.";
    case "OPS_SLIDE_LIMIT": return "카드는 11장을 넘을 수 없습니다.";
    case "OPS_SLIDE_MIN": return "카드는 7장 아래로 줄일 수 없습니다.";
    default: return "카드덱을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

function bubbleText(bubble: Bubble): string {
  return bubble.segments.map((s) => s.text).join("");
}

/**
 * M2(PR 리뷰): 굵게를 눌러도 평문 textarea라 굵기가 안 보이던 문제. segments를 그대로
 * HTML로 옮겨 `contentEditable` 안에서 굵은 구간이 실제로 굵게 보이게 한다. 줄바꿈은
 * `<br>`로만 옮긴다 — 블록 요소(`<div>` 등)를 쓰면 `innerText` 추출 시 개행이 이중으로
 * 붙는다.
 */
function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function segmentsToHtml(segments: Segment[]): string {
  const html = segments
    .map((segment) => {
      const escaped = escapeHtmlText(segment.text).replace(/\n/g, "<br>");
      return segment.bold ? `<strong>${escaped}</strong>` : escaped;
    })
    .join("");
  return html.length ? html : "<br>";
}

/**
 * `contentEditable` 안의 캐럿/선택 영역을 세그먼트 텍스트 이어붙인 기준 문자 오프셋으로
 * 바꾼다(기존 textarea의 `selectionStart`/`selectionEnd`와 같은 역할). `<br>`는
 * TreeWalker가 텍스트 노드가 아니라 건너뛰므로 별도로 개행 1글자를 셈에 더한다.
 */
/** `node`가 시작되는 지점의 문자 오프셋(root 기준). node===root면 0. */
function offsetAtNodeStart(root: HTMLElement, node: Node): number {
  if (node === root) return 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
  let offset = 0;
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current === node) return offset;
    if (current.nodeType === Node.TEXT_NODE) {
      offset += (current.textContent ?? "").length;
    } else if (current.nodeName === "BR") {
      offset += 1;
    }
    current = walker.nextNode();
  }
  return offset;
}

/** `node` 서브트리 전체의 문자 길이. */
function subtreeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").length;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ALL);
  let length = 0;
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) length += (current.textContent ?? "").length;
    else if (current.nodeName === "BR") length += 1;
    current = walker.nextNode();
  }
  return length;
}

/**
 * Range boundary point(container node + child/character offset)를 root 기준 문자
 * 오프셋으로 바꾼다. `Range.selectNodeContents(div)`(전체 선택, Ctrl+A 계열)나 빈 칸의
 * caret은 container가 **요소**(텍스트 노드가 아님)로 온다 — 텍스트 노드만 가정하면
 * "전체 선택 후 굵게"가 항상 빈 선택(0글자)으로 계산돼 조용히 실패한다(2026-09-25 PR
 * 리뷰 대응 중 mutation 테스트로 실측).
 */
function textOffsetWithinElement(root: HTMLElement, node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return offsetAtNodeStart(root, node) + offset;
  }
  const children = node.childNodes;
  if (offset < children.length) {
    return offsetAtNodeStart(root, children[offset]);
  }
  // 마지막 자식 뒤(또는 자식 없음) = 이 노드가 담은 내용의 끝.
  return offsetAtNodeStart(root, node) + subtreeTextLength(node);
}

/**
 * `element.innerText`는 jsdom(vitest 테스트 환경)이 구현하지 않아 `undefined`를 돌려준다
 * (실브라우저에서는 되지만 CI가 죽는다 — 2026-09-25 PR 리뷰 대응 중 실측). `textContent`는
 * `<br>`을 통째로 건너뛰어 줄바꿈을 잃는다. 둘 다 안 쓰고 `textOffsetWithinElement`와 같은
 * TreeWalker 규칙(텍스트 노드 이어붙이기 + `<br>` 1글자)으로 직접 뽑는다.
 */
/**
 * BLOCKER(PR 재리뷰, Playwright 3브라우저 실측): 브라우저 기본 Enter는 `<br>`이 아니라
 * `<div>`(WebKit은 Shift+Enter도 `<div>`)를 만든다. 이 함수가 `<br>`만 줄바꿈으로 세던
 * 시절엔 화면은 두 줄인데 저장본·발행 PNG는 한 줄이 됐다(probe-{chromium,webkit,firefox}.log
 * 실측).
 *
 * BLOCKER 2차 재검증(E2E 스크립트 실측): `handleKeyDown`은 Enter를 가로챈 뒤
 * `document.execCommand('insertText', false, '\n')`로 실제 삽입을 브라우저에 맡긴다(손으로
 * Range를 조작하던 1차 수정은 jsdom에선 통과했지만 실제 Chromium에서 다음 타이핑 때 방금
 * 넣은 내용을 지워버려 폐기했다 — 자세한 경위는 그 함수 주석). 그 결과 Chromium·WebKit은
 * 빈 줄을 `<div><br></div>`로, Firefox는 리터럴 `\n` 텍스트 노드 뒤에 표시용 `<br>`을
 * 짝으로 남긴다.
 *
 * 4차 재검증: "직전 형제가 `\n`으로 끝나는 텍스트 노드인 맨 끝 br만 무시" 규칙은
 * 위치(맨 앞/중간/맨 끝) 기반이라 두 가지를 동시에 틀리게 했다 — (a) 말풍선 맨 앞에서
 * Enter를 치면(`<div><br></div>`가 맨 앞에 옴) 짝짓기 조건이 아직 안 맞아 그 개행이
 * 통째로 사라졌다(MINOR 1, Chromium·WebKit 실측). (b) 반대로 짝짓기 조건이 우연히
 * 맞아떨어지는 중간 상태에서는 실제로 필요한 개행까지 지워 Firefox에서 끝에 개행이
 * 하나 더 남는 등 꼬였다(MAJOR M3b 재현). "이 개행이 이미 다른 자리에서 셌는가"만
 * 보는 구조 규칙으로 다시 세운다 — `sawContent`(지금까지 실제 글자를 봤는가)를 단일
 * 기준으로 두 자리에서 함께 쓴다:
 *
 * - DIV·P 경계는 `sawContent`가 true일 때만 개행 한 글자로 센다(그 앞에 이미 내용이
 *   있어야 "줄이 바뀐다"는 뜻이 성립한다 — 맨 앞 DIV는 그저 브라우저가 첫 줄을 감싼
 *   것일 수도 있다, Firefox의 `<div>줄1</div><div>줄2</div>` 실측이 그 예다).
 * - `<br>`는 그 부모 DIV·P의 유일한 자식이고 **그 DIV에 들어올 때 `sawContent`가 이미
 *   true였을 때만**(=DIV 경계가 실제로 개행을 셌을 때만) 건너뛴다 — 셌으면 중복이고,
 *   아직 안 셌으면(맨 앞 `<div><br></div>`, MINOR 1) 이 br이 그 줄의 유일한 표시이므로
 *   건너뛰지 않고 그대로 센다. 또는 바로 앞 형제가 리터럴 `\n`으로 끝나는 텍스트
 *   노드면 건너뛴다(그 `\n`이 이미 셌다, Firefox의 `text\n` + 표시용 `<br>` 짝).
 *
 * 편집 중에 이렇게 셈한 값에 끝 개행이 남아 있는 건 의도다(다음 줄을 계속 치게) —
 * 커밋 시점(blur)에 `handleBlur`가 그 끝 개행만 잘라낸다.
 */
function elementToPlainText(el: HTMLElement): string {
  const nodes: Node[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ALL);
  let current: Node | null = walker.nextNode();
  while (current) {
    nodes.push(current);
    current = walker.nextNode();
  }
  let text = "";
  let sawContent = false;
  nodes.forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? "";
      text += value;
      if (value.length > 0) sawContent = true;
      return;
    }
    if (node.nodeName === "BR") {
      const parent = node.parentNode;
      const isSoleChildOfBlock = !!parent
        && (parent.nodeName === "DIV" || parent.nodeName === "P")
        && parent.childNodes.length === 1;
      // sawContent가 이 시점에도 여전히 false면, 이 br을 품은 DIV 경계(아래 분기)가
      // 방금 이 시점까지는 한 번도 안 셌다는 뜻이다 — 그러면 이 br을 건너뛰면 그 줄이
      // 통째로 증발한다(MINOR 1). sawContent가 true였다면 DIV 진입이 이미 셌으니
      // 중복이라 건너뛴다.
      if (isSoleChildOfBlock && sawContent) return;
      // MINOR(1, 5차 재검증, F2): 짝 판정을 "직전이 개행으로 끝나는 텍스트 노드"로만
      // 걸었더니, Firefox에서 기존 빈 줄 바로 앞에 Enter를 새로 치면 그 br이 "짝 있는
      // 렌더 보조"로 오판돼 스킵됐다 — 새로 친 줄 하나가 통째로 사라졌다(F2 재현).
      // 진짜 Firefox 짝(리터럴 "\n" 텍스트 노드 + 그 개행을 화면에 실제로 그리기 위한
      // 보조 br)은 그 br이 **부모의 마지막 자식**일 때만 성립한다 — 뒤에 형제가 더
      // 있으면(F2처럼 그 다음에 기존 빈 줄이 이어지면) 보조가 아니라 진짜 줄이다.
      const isBrLastChildOfParent = !!parent && parent.lastChild === node;
      const prev = index > 0 ? nodes[index - 1] : null;
      // F2 실측 추가 확인: Firefox는 문단 끝에 아무 것도 안 친 채 개행을 여러 번 치면(뒤에
      // 이어지는 내용이 없으면) <div> 없이 <br>을 연달아 쌓고, 그 "맨 마지막" br 하나만
      // 커서를 보이게 하는 렌더 보조다(진짜 줄은 br 개수-1개). 직전 노드가 개행으로 끝나는
      // 텍스트일 때만이 아니라 직전이 다른 br일 때도(=연속된 br 묶음의 맨 끝) 같은 보조로
      // 봐야 한다 — 안 그러면 "부모의 마지막 자식"인 그 br이 실제 줄로 잘못 세어져
      // ArrowUp으로 기존 빈 줄 자리에 Enter를 추가로 쳤을 때 줄 수가 하나 더 불어난다.
      const isPairedWithLiteralNewline = isBrLastChildOfParent
        && ((prev?.nodeType === Node.TEXT_NODE && (prev.textContent ?? "").endsWith("\n")) || prev?.nodeName === "BR");
      if (isPairedWithLiteralNewline) return;
      text += "\n";
      return;
    }
    if ((node.nodeName === "DIV" || node.nodeName === "P") && sawContent) {
      text += "\n";
    }
  });
  return text;
}

function getEditableSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const start = textOffsetWithinElement(root, range.startContainer, range.startOffset);
  const end = textOffsetWithinElement(root, range.endContainer, range.endOffset);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

/**
 * `textOffsetWithinElement`의 역함수: root 기준 문자 오프셋을 실제 (텍스트 노드, 그 안의
 * 오프셋)으로 되찾는다. MINOR(1, PR 재리뷰): 굵게를 누르면 포커스가 툴바 버튼으로 넘어가며
 * 선택이 사라진다 — 굵게 적용 후 같은 글자 범위를 이 함수로 다시 찾아 재선택한다.
 */
function pointAtOffset(root: HTMLElement, offset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
  let remaining = offset;
  let current: Node | null = walker.nextNode();
  let last: { node: Node; offset: number } = { node: root, offset: 0 };
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const length = (current.textContent ?? "").length;
      if (remaining <= length) return { node: current, offset: Math.max(0, remaining) };
      remaining -= length;
      last = { node: current, offset: length };
    } else if (current.nodeName === "BR") {
      if (remaining <= 0) {
        const parent = current.parentNode ?? root;
        return { node: parent, offset: Array.prototype.indexOf.call(parent.childNodes, current) };
      }
      remaining -= 1;
    }
    current = walker.nextNode();
  }
  return last;
}

/** `pointAtOffset`으로 root 안의 [start,end) 문자 범위를 실제로 다시 선택하고 포커스한다. */
function restoreSelectionRange(root: HTMLElement, start: number, end: number): void {
  const selection = typeof window !== "undefined" ? window.getSelection() : null;
  if (!selection) return;
  const startPoint = pointAtOffset(root, start);
  const endPoint = pointAtOffset(root, end);
  const range = document.createRange();
  try {
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
  } catch {
    return;
  }
  root.focus();
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * M1+M2(PR 리뷰): 말풍선 한 칸을 `contentEditable`로 그린다.
 *
 * - M1(넘침): `<div>`는 textarea와 달리 `rows`로 높이를 못박지 않고 내용만큼 자란다.
 *   `.bubble{width:fit-content;max-width:76%}`가 그대로 폭 상한이라 자연히 줄바꿈된다.
 * - M2(굵게 표시): segments를 `segmentsToHtml`로 그려 굵은 구간이 그 자리에서 굵게 보인다.
 * - 한글 입력기(IME) 조합이 끊기지 않게, **포커스 중에는 React가 이 DOM을 다시 쓰지
 *   않는다.** `bubble.segments`가 바뀌어도 `document.activeElement`가 이 div가 아닐 때만
 *   `innerHTML`을 새로 앉힌다. 조합 중(`compositionstart`~`compositionend`)에는 상위로
 *   텍스트 변경을 아예 올리지 않아 리렌더 자체가 없다.
 */
function BubbleContentEditable({
  bubble,
  editableRef,
  onTextChange,
  onTrimTrailingNewline,
  onFocus,
  onCaretChange,
}: {
  bubble: Bubble;
  editableRef: (el: HTMLDivElement | null) => void;
  onTextChange: (text: string) => void;
  onTrimTrailingNewline: () => void;
  onFocus: () => void;
  onCaretChange: (caret: number) => void;
}) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);
  const lastSyncedHtmlRef = useRef<string>("");

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    // 이 말풍선이 지금 포커스돼 있으면(사용자가 타이핑/조합 중) DOM을 건드리지 않는다 —
    // 건드리면 캐럿이 튀거나 조합 중인 글자가 끊긴다.
    if (document.activeElement === el) return;
    const html = segmentsToHtml(bubble.segments);
    if (html !== lastSyncedHtmlRef.current) {
      el.innerHTML = html;
      lastSyncedHtmlRef.current = html;
    }
  }, [bubble]);

  function reportCaret() {
    const el = localRef.current;
    if (!el) return;
    const offsets = getEditableSelectionOffsets(el);
    if (offsets) onCaretChange(offsets.end);
  }

  function handleInput() {
    const el = localRef.current;
    if (!el || isComposingRef.current) return;
    const text = elementToPlainText(el);
    lastSyncedHtmlRef.current = el.innerHTML;
    onTextChange(text);
    reportCaret();
  }

  /**
   * BLOCKER(PR 재리뷰) + BLOCKER 잔여(2차 재검증, E2E 스크립트 실측): 브라우저 기본
   * Enter/Shift+Enter가 `<div>`를 만들어 저장본이 한 줄로 뭉개지는 문제를 근본에서 막는다.
   * `contentEditable="plaintext-only"`는 리뷰어가 1순위로 권한 방법이지만 Playwright
   * 3브라우저 실측 시점 기준 WebKit·Firefox 지원이 엇갈려(probe-*.log) 쓰지 않았다.
   *
   * 1차 수정은 `event.preventDefault()` 뒤 `Range.insertNode`로 리터럴 `\n` 텍스트
   * 노드를 손으로 넣었다 — jsdom에서는 통과했지만, 이 스크립트(scripts/
   * verify-bubble-editor-toolbar-e2e.mjs)로 실제 Chromium에 돌려 보니 그 자리에서 바로
   * 다음 글자를 치면 Chromium이 방금 넣은 `\n`과 렌더 보조 `<br>`을 통째로 지워버렸다
   * (부모 요소·자식 인덱스 기준으로 잡은 caret을 Chromium의 타이핑 커맨드가 못 미더워하는
   * 것으로 보인다 — jsdom은 이 정리 동작 자체가 없어 못 잡았다). 손으로 caret과 DOM
   * 구조를 둘 다 관리하는 대신, `document.execCommand('insertText', false, '\n')`으로
   * 브라우저 자신의 캐럿·줄바꿈 처리에 맡긴다 — 부작용으로 Chromium·WebKit은 다시
   * `<div>`(빈 줄이면 `<div><br></div>`)를 쓰지만(엔진 고유 표현일 뿐 나쁜 것이 아니다),
   * `elementToPlainText`가 DIV 경계를 이미 개행으로 세므로 결과는 항상 올바르다 — "무엇을
   * 쓰든 elementToPlainText가 맞게 읽는다"가 유일하게 3엔진 모두에서 검증된 설계다.
   * MINOR(4)도 이걸로 같이 닫힌다: `execCommand`는 실행취소 기록에 남는다.
   * execCommand를 지원하지 않는 환경(예: 미래의 비표준 임베더)에서만 손으로 순수 `\n`
   * 텍스트 노드를 넣는 최소 대체로 물러난다(그 갈래엔 렌더 보조 `<br>`을 더는 안 붙인다 —
   * 그 트릭 자체가 이번 회귀의 원인이었다).
   */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const el = localRef.current;
    const selection = typeof window !== "undefined" ? window.getSelection() : null;
    if (!el || !selection || selection.rangeCount === 0) return;
    let inserted = false;
    if (typeof document.execCommand === "function") {
      try {
        inserted = document.execCommand("insertText", false, "\n");
      } catch {
        inserted = false;
      }
    }
    if (!inserted) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const newline = document.createTextNode("\n");
      range.insertNode(newline);
      range.setStart(newline, newline.textContent.length);
      range.setEnd(newline, newline.textContent.length);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    handleInput();
  }

  /**
   * M-B(PR 재리뷰): onPaste가 없어 리치 클립보드의 굵게 태그·문단 태그·`onerror` 달린
   * 이미지 태그가 그대로 편집칸에 꽂혔다(paste.mjs 실측 — 이미지가 실제로 로드를 시도했다,
   * XSS 표면). 항상 `text/plain`만 꺼내 캐럿 자리에 텍스트로 넣는다(서식·이미지·스크립트
   * 전부 버려진다). MINOR(3): Windows 클립보드의 `\r\n`을 `\n`으로 정규화한다(정규화 없이
   * 그대로 들어가면 `elementToPlainText`·`retextSegments` 기준 문자 수가 실제 줄 수와
   * 어긋난다, r2-paste.log 실측: `"한줄\r\n두줄\nQ..."`). MINOR(4): `execCommand`로 실행취소
   * 기록에 남긴다 — 붙여넣기는 (Enter와 달리) 브라우저가 알아서 줄바꿈 자체를 만들
   * 일이 없으므로(우리가 만든 텍스트를 그대로 꽂을 뿐) `<div>` 부작용 걱정이 없다.
   */
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain").replace(/\r\n/g, "\n");
    const el = localRef.current;
    const selection = typeof window !== "undefined" ? window.getSelection() : null;
    if (!el || !selection || selection.rangeCount === 0) return;
    let inserted = false;
    if (typeof document.execCommand === "function") {
      try {
        inserted = document.execCommand("insertText", false, text);
      } catch {
        inserted = false;
      }
    }
    if (!inserted) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStart(node, node.textContent!.length);
      range.setEnd(node, node.textContent!.length);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    handleInput();
  }

  /**
   * M-A(PR 재리뷰) + MINOR(2): 저장본은 `retextSegments`(card-deck-contract.ts)가 글자
   * 수 "비율"로 굵은 구간을 다시 나눈다 — 사용자가 입력한 실제 자리와 다를 수 있다(설계상
   * 알려진 한계, "근본 해결"은 DOM의 `<strong>` 경계를 그대로 세그먼트로 읽는 것이라 이번
   * 범위 밖). 화면은 편집 중 리렌더를 막아두느라(IME 보호) 그 어긋남을 그대로 들고 있다가
   * blur 뒤에도 안 고쳐졌다 — blur 시점엔 이 말풍선이 더는 활성 요소가 아니므로, 최신
   * `bubble.segments`(서버로 나갈 그 값)로 다시 그려 화면·저장본을 맞춘다. 같은 자리에서
   * MINOR(2)도 닫는다: `compositionend` 없이 blur되면(창 전환·다른 말풍선 클릭 등)
   * `isComposingRef`가 true로 남아 그 뒤 입력이 전부 버려진다 — blur마다 리셋한다.
   *
   * BLOCKER(PR 재검증, probe3.mjs BOLD_click_model): 이 함수가 조건 없이 매번
   * `innerHTML`을 다시 썼던 것이, 툴바 버튼을 실제 마우스로 누를 때(mousedown이 먼저
   * blur를 일으킴) 방금 만든 선택을 (root,0)으로 무너뜨려 굵게·쪼개기가 항상 실패하게
   * 만든 진짜 원인이었다(주 수정은 툴바 버튼 `onMouseDown` preventDefault로 blur 자체를
   * 막는 것 — 이 함수는 리뷰어 지시대로 "DOM이 이미 모델과 같으면 안 그린다"로 좁혀
   * Tab 이동처럼 다른 경로로 blur가 나도 불필요하게 선택을 건드리지 않는 2차 방어선이다).
   */
  function handleBlur() {
    isComposingRef.current = false;
    const el = localRef.current;
    if (!el) return;
    // MAJOR(4차 재검증, 회장 기준 "보이는 대로 발행"): 편집 중엔 끝 개행을 그대로
    // 두지만(다음 줄을 계속 치게), blur — 더는 편집하지 않는 시점 — 엔 잘라낸다. 안
    // 그러면 저장본엔 트레일링 "\n"이 남는데, 발행 PNG(chat-bubble.ts wrapSegments)는
    // 모든 "\n"을 강제 줄바꿈으로 취급해 그 자리에 빈 줄을 하나 더 그린다 — 편집
    // 화면과 PNG가 달라지고, 대화 장엔 캔버스 미리보기가 없어 발행 전엔 아무도 그
    // 차이를 못 본다(M2·M3b·Firefox 재현 전부 이 경로).
    //
    // MAJOR(5차 재검증, T1): 이 트림을 `onTextChange`(→ `setBubbleText` →
    // `retextSegments` 글자수 비율 재분배) 경로로 태웠더니, 개행 한두 글자가 빠지는
    // 길이 변화만으로도 반올림 경계가 흔들려 굵은 구간 경계가 한 글자 밀렸다(재현 T1).
    // 세그먼트 구조(굵기 경계)를 아예 재계산하지 않는 전용 연산
    // `trimBubbleTrailingNewline`(card-deck-ops.ts, 마지막 세그먼트의 끝 개행만 지움)으로
    // 바꿔 경계가 밀릴 여지를 없앴다.
    const liveText = elementToPlainText(el);
    if (/\n+$/.test(liveText)) {
      onTrimTrailingNewline();
    }
    const html = segmentsToHtml(bubble.segments);
    if (html === el.innerHTML) return;
    el.innerHTML = html;
    lastSyncedHtmlRef.current = html;
  }

  return (
    <div
      ref={(el) => { localRef.current = el; editableRef(el); }}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={`말풍선 내용 ${bubble.order + 1}`}
      data-bubble-content-editable
      className={styles.bubbleContent}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onFocus={onFocus}
      onBlur={handleBlur}
      onClick={() => { onFocus(); reportCaret(); }}
      onKeyUp={reportCaret}
      onCompositionStart={() => { isComposingRef.current = true; }}
      onCompositionEnd={() => {
        isComposingRef.current = false;
        handleInput();
      }}
    />
  );
}

/** 편집실 카드 탭: 선택된 장(chat/comment_prompt/cta)의 말풍선을 직접 편집한다. */
export function BubbleEditor({ deck, slideId, onDeckChange }: BubbleEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [selectedBubbleId, setSelectedBubbleId] = useState<string | null>(null);
  const editableRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const caretRefs = useRef<Record<string, number>>({});
  // MINOR(2, 4차 재검증): WebKit에서 키보드만으로(마우스 클릭 없이 Shift+화살표로 범위를
  // 고르고 Tab으로 굵게 버튼에 포커스를 옮겨 Enter/Space로 누르면) 그 Tab 이동 자체가
  // 편집칸을 blur시키는데, WebKit은 그 blur에서 Selection 객체를 (마우스 클릭 때와
  // 달리) 비워버린다 — 버튼 click 시점에 `getEditableSelectionOffsets`로 읽으면 이미
  // 빈 선택이라 "먼저 선택해 주세요"로 실패한다. 쪼개기가 이미 쓰던 것과 같은 패턴으로,
  // `selectionchange`가 날 때마다 범위를 ref에 저장해뒀다가 굵게에서 그 값을 대신 쓴다.
  const selectionRefs = useRef<Record<string, { start: number; end: number }>>({});

  const slide = deck.slides.find((s) => s.id === slideId) ?? null;
  const bubbles = slide?.bubbles ?? [];

  useEffect(() => {
    setSelectedBubbleId(null);
  }, [slideId]);

  useEffect(() => {
    function handleSelectionChange() {
      if (!selectedBubbleId) return;
      const el = editableRefs.current[selectedBubbleId];
      if (!el) return;
      const offsets = getEditableSelectionOffsets(el);
      if (!offsets) return; // 선택이 편집칸 밖(예: WebKit이 포커스를 Tab으로 빼며 Selection 자체를 무효화)이면 폴백을 건드리지 않는다 — MINOR(2)가 기대는 바로 이 경로다.
      if (offsets.start === offsets.end) {
        // MAJOR(5차 재검증, S1): 선택이 빈 캐럿으로 줄었다는 건 사용자가 다른 곳을 골랐거나
        // 그냥 캐럿을 옮겼다는 뜻이다 — 여기서 지우지 않으면 낡은 범위가 폴백에 남아, 전혀
        // 다른 자리에 조용히 굵게가 적용된다(재현 S1).
        delete selectionRefs.current[selectedBubbleId];
        return;
      }
      selectionRefs.current[selectedBubbleId] = offsets;
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [selectedBubbleId]);

  // M3(PR 리뷰): 삭제뿐 아니라 합치기 등 어떤 연산이든 선택했던 말풍선이 사라지면
  // selectedBubbleId 가 죽은 id 를 들고 있어 "말풍선 추가"가 OPS_BUBBLE_NOT_FOUND 로
  // 실패했다. 매 렌더마다 현재 목록에 없는 선택을 비운다(삭제 버튼은 아래에서 인접
  // 말풍선으로 더 친절하게 옮겨준다 — 이 효과는 그 외 경로의 안전망).
  useEffect(() => {
    if (selectedBubbleId && !bubbles.some((b) => b.id === selectedBubbleId)) {
      setSelectedBubbleId(null);
    }
  }, [bubbles, selectedBubbleId]);

  function run(op: (deck: CardDeck) => CardDeck): CardDeck | null {
    try {
      setError(null);
      const next = op(deck);
      onDeckChange(next);
      return next;
    } catch (cause) {
      if (cause instanceof CardDeckOpsError) {
        console.error("카드덱 연산 실패", cause.code, cause.message);
        setError(cardDeckOpsErrorMessage(cause.code));
      } else {
        setError("말풍선을 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      return null;
    }
  }

  if (!slide) {
    return <p className="text-caption text-danger" data-bubble-editor-missing-slide>이 장을 찾지 못했습니다.</p>;
  }
  if (slide.role === "cover") {
    return (
      <CoverEditor
        slide={slide}
        onChange={(cover) => run((d) => setSlideCover(d, slide.id, cover))}
        onImageChange={(cover_image_url) => run((d) => setSlideCoverImage(d, slide.id, cover_image_url))}
      />
    );
  }

  const currentSlideId = slide.id;

  // 2026-09-22 코드리뷰 MAJOR 5: 세그먼트를 첫 조각 값으로 갈아엎지 않고
  // `card-deck-ops.setBubbleText`(비율 재분배로 기존 볼드 조각 보존)만 거친다. 헤더 주석
  // "모든 상태 변화는 card-deck-ops.ts 의 순수 함수만 거친다" 를 텍스트 입력에도 지킨다.
  function updateBubbleText(bubbleId: string, text: string) {
    // MAJOR(5차 재검증, S1·S3): 타이핑이 났다는 건 이 말풍선의 선택 상태가 바뀌었다는
    // 뜻이다 — selectionRefs에 남아 있던 이전 범위를 지우지 않으면, 그 낡은 범위가
    // 굵게 폴백으로 계속 쓰여 방금 타이핑한 자리와 무관한 곳에 조용히 굵게가 적용된다.
    delete selectionRefs.current[bubbleId];
    run((d) => setBubbleText(d, currentSlideId, bubbleId, text));
  }

  // MINOR(1, PR 재리뷰): 굵게 버튼을 누르면 포커스가 버튼으로 넘어가며(probe2.mjs
  // sel_after_bold: collapsed) 선택이 사라졌다. 적용한 그 글자 범위를 저장해뒀다가,
  // 상태가 갱신된 뒤(다음 페인트 전 microtask) 같은 범위를 다시 선택하고 편집칸에
  // 포커스를 되돌린다.
  function handleToggleBold(bubble: Bubble) {
    const el = editableRefs.current[bubble.id];
    const liveOffsets = el ? getEditableSelectionOffsets(el) : null;
    // 실제 선택이 살아있으면(mousedown preventDefault가 지켜낸 정상 경로) 그것을 쓰고,
    // 아니면 selectionchange가 저장해둔 마지막 범위로 대신한다. MAJOR(5차 재검증)로
    // selectionRefs는 이제 "선택이 빈 캐럿으로 줄거나(공백 클릭·화살표) 타이핑이 났으면"
    // 즉시 비워지므로, 여기 남아 있는 값은 "편집칸이 포커스를 잃은 직후, 그 사이 입력도
    // 캐럿 이동도 없었을 때"(WebKit이 Tab으로 포커스를 뺏으며 Selection 자체를 무효화하는
    // 경로, MINOR 2)만 해당한다 — 낡은 범위가 아니다.
    const offsets = (liveOffsets && liveOffsets.start !== liveOffsets.end) ? liveOffsets : selectionRefs.current[bubble.id];
    const from = offsets?.start ?? 0;
    const to = offsets?.end ?? 0;
    if (from === to) {
      setError("굵게 만들 글을 먼저 선택해 주세요.");
      return;
    }
    const next = run((d) => toggleBold(d, currentSlideId, bubble.id, { from, to }));
    if (!next) return;
    delete selectionRefs.current[bubble.id]; // 방금 쓴 범위는 굵기가 바뀌어 더는 유효하지 않다.
    queueMicrotask(() => {
      const target = editableRefs.current[bubble.id];
      if (target) restoreSelectionRange(target, from, to);
    });
  }

  // M3: 삭제 성공 시 선택을 지운 자리의 이전 말풍선(없으면 다음, 그것도 없으면 null)으로
  // 옮긴다. 실패(장에 말풍선이 하나뿐)하면 선택을 건드리지 않는다.
  function handleDeleteBubble(bubble: Bubble) {
    const bubbleIndex = bubbles.findIndex((b) => b.id === bubble.id);
    const next = run((d) => deleteBubble(d, currentSlideId, bubble.id));
    if (!next) return;
    const remaining = next.slides.find((s) => s.id === currentSlideId)?.bubbles ?? [];
    const fallback = remaining[Math.max(0, bubbleIndex - 1)]?.id ?? remaining[0]?.id ?? null;
    setSelectedBubbleId(fallback);
  }

  return (
    <div className="space-y-stack" data-bubble-editor data-bubble-editor-slide-role={slide.role}>
      <div className="flex items-center justify-between">
        <b className="text-caption font-semibold text-text">{SLIDE_ROLE_LABEL[slide.role]} 장 · 말풍선 {bubbles.length}개</b>
        <Button size="sm" onClick={() => run((d) => addBubble(d, slide.id, selectedBubbleId))}>말풍선 추가</Button>
      </div>
      {error ? <p role="alert" className="rounded-control border border-danger bg-danger-soft p-stack text-caption text-danger" data-bubble-editor-error>{error}</p> : null}
      <ul className={styles.bubbleTurns} data-bubble-editor-turns>
        {bubbles.map((bubble) => {
          const selected = selectedBubbleId === bubble.id;
          // MINOR(4, PR 재리뷰): 빈 말풍선을 그대로 저장하면 서버 계약
          // (card-deck-contract.ts validateCardDeck: "segments[].text must be
          // non-empty")에 걸려 저장 요청 전체가 400으로 거부된다 — 그런데 화면에는
          // 이유가 안 보였다. 저장을 막지는 않되(타이핑 중일 수 있다), 비어 있는 동안은
          // 그 자리에서 이유와 다음 행동(삭제)을 말해준다(ADR-007 조용한 실패 금지).
          const isEmpty = bubbleText(bubble).trim().length === 0;
          return (
            <li
              key={bubble.id}
              data-bubble-id={bubble.id}
              data-bubble-speaker={bubble.speaker}
              data-bubble-editing={selected ? "true" : undefined}
              className={`${styles.bubbleRow} ${bubble.speaker === "reader" ? styles.bubbleRowReader : ""}`}
            >
              <div className={`${styles.bubble} ${bubble.speaker === "reader" ? styles.bubbleReader : styles.bubbleBrand}`}>
                <BubbleContentEditable
                  bubble={bubble}
                  editableRef={(el) => { editableRefs.current[bubble.id] = el; }}
                  onTextChange={(text) => updateBubbleText(bubble.id, text)}
                  onTrimTrailingNewline={() => run((d) => trimBubbleTrailingNewline(d, currentSlideId, bubble.id))}
                  onFocus={() => setSelectedBubbleId(bubble.id)}
                  onCaretChange={(caret) => { caretRefs.current[bubble.id] = caret; }}
                />
                {isEmpty ? (
                  <p className="mt-stack-tight text-caption text-danger" data-bubble-empty-hint>
                    빈 말풍선은 저장되지 않습니다. 내용을 입력하거나 삭제하세요.
                  </p>
                ) : null}
                {selected ? (
                  // BLOCKER(PR 재검증, Playwright 3엔진 실측 probe3.mjs BOLD_click_model·
                  // SPLIT_alerts): 버튼을 실제 마우스로 누르면 mousedown이 먼저 편집칸을
                  // blur시키고, 그 blur가 handleBlur의 innerHTML 재작성을 불러 선택이
                  // (root,0)으로 무너졌다 — 그 뒤 click에서 읽는 선택은 이미 빈 채라 "굵게
                  // 만들 글을 먼저 선택해 주세요"·"쪼개면 빈 말풍선이 생겨 쪼갤 수 없습니다"로
                  // 항상 실패했다. jsdom은 클릭에서 blur를 안 일으켜 기존 테스트가 못 잡았다.
                  // 표준 관행대로 각 버튼 mousedown의 기본 동작(포커스 이동)을 막아
                  // 편집칸이 blur되는 것 자체를 없앤다 — 그러면 click이 실행될 때도 선택이
                  // 그대로 살아 있다.
                  <div className={styles.bubbleToolbar} data-bubble-controls aria-label="선택한 말풍선 도구">
                    <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => handleToggleBold(bubble)}>굵게</Button>
                    <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => run((d) => toggleSpeaker(d, slide.id, bubble.id))}>화자 전환</Button>
                    <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                      // 2026-09-22 코드리뷰 MAJOR 5: caret 은 말풍선 전체 텍스트 기준인데
                      // splitBubble 은 세그먼트 좌표를 받는다. caretToSegment 로 바꾼다
                      // (세그먼트가 2개 이상이면 예전 코드는 잘못된 자리에서 쪼갰다).
                      const el = editableRefs.current[bubble.id];
                      const offsets = el ? getEditableSelectionOffsets(el) : null;
                      const caret = offsets?.start ?? caretRefs.current[bubble.id] ?? bubbleText(bubble).length;
                      run((d) => splitBubble(d, slide.id, bubble.id, caretToSegment(bubble.segments, caret)));
                    }}>쪼개기</Button>
                    <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => run((d) => mergeBubble(d, slide.id, bubble.id))}>합치기</Button>
                    <Button size="sm" variant="secondary" onMouseDown={(e) => e.preventDefault()} onClick={() => handleDeleteBubble(bubble)}>삭제</Button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {slide.role === "cta" ? (
        <>
          <CtaEditor deck={deck} onChange={(cta) => run((d) => ({ ...d, cta, revision: d.revision + 1 }))} />
          <div>
            <span className="block text-caption text-muted">마지막 장 사진</span>
            <div className="mt-stack-tight">
              <CoverImagePicker
                imageUrl={slide.cover_image_url ?? null}
                onChange={(cover_image_url) => run((d) => setSlideCoverImage(d, slide.id, cover_image_url))}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * 후킹 헤드라인 프리셋(세션맥락 과제 A-4). 표지 훅 3공식(질문형·숫자형·고통인식형) — 근거는
 * docs/design/osmu-content-quality-benchmark-v1-claude-opus.html REF A-3(표지 훅 3공식,
 * 첫 장 3줄 이내)과 §⑦CTA(댓글 키워드 유도·댓글 예시 칩·저장 명분, 표면 링크 금지).
 * `COVER_HEADLINE_MAX_CHARS_PER_LINE`(10자) 안에 들어가는 짧은 문장만 담았다.
 */
const HOOK_PRESETS: Record<"question" | "number" | "pain", string[]> = {
  question: ["이거 순서가\n틀렸다면?", "왜 나만\n안 될까"],
  number: ["3초 만에\n원인 하나", "10년차가 짚은\n딱 한 가지"],
  pain: ["안 되는 건\n재능이 아니다", "머리가 아니라\n순서였다"],
};
const CTA_KEYWORD_PRESETS = ["순서", "방법", "정리본"];
const CTA_COMMENT_EXAMPLE_PRESETS = ["댓글에 '순서' 남기면 보내줄게", "댓글 남기면 DM으로 보내줄게"];
const CTA_SAVE_REASON_PRESETS = ["저장해두고 나중에 다시 펴봐", "저장해두고 D-90에 다시 봐"];

function HookChips({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="space-y-stack-tight" data-hook-chip-bank>
      {(Object.keys(HOOK_PRESETS) as Array<keyof typeof HOOK_PRESETS>).map((hookType) => (
        <div key={hookType} className="flex flex-wrap items-center gap-stack-tight">
          <span className="text-caption text-subtle">{hookType === "question" ? "질문형" : hookType === "number" ? "숫자형" : "고통인식형"}</span>
          {HOOK_PRESETS[hookType].map((preset) => (
            <Button key={preset} size="sm" variant="secondary" onClick={() => onPick(preset)} data-hook-chip={preset}>
              {preset.replace("\n", " ")}
            </Button>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * 대문·마지막 장 사진 선택(세션맥락 과제 A-3). 업로드는 기존 `/api/images/upload`
 * (SNS-016, 테넌트 격리·서명 URL)를 그대로 쓴다 — 새 업로드 API를 만들지 않는다.
 *
 * `cover_image_url`(렌더 산출 슬롯 `image_url`과 별개 필드, C2)은 `card-templates/
 * chat-bubble.ts`의 `loadCoverImage`/`drawBackgroundPhoto`가 실제로 불러와 캔버스에
 * 그린다(J1, 2026-09-22 코드리뷰 2차). 편집실 미리보기(`CardDeckPanel`)와 발행 경로
 * (`studio/page.tsx` recompositeCards → renderAndUploadCardDeck)가 같은 렌더러를 쓰므로
 * 여기서 고른 사진은 저장 즉시 미리보기에 반영되고, 발행 시 나가는 PNG에도 그대로
 * 들어간다. 사진을 못 불러오면(만료된 서명 URL·타임아웃 등, F3, 2026-09-22 코드리뷰
 * 3차) 조용히 배경색으로 물러나지 않고 렌더 자체를 실패시킨다 — 미리보기·생성실
 * 썸네일·발행 경로 모두 그 이유를 화면에 보여주고 발행을 막는다(ADR-007). 사진이 오래
 * 최대 8초씩, 9장이면 최악 72초까지 걸릴 수 있다(H, 4차: 진행 표시는 아직 없다).
 */
function CoverImagePicker({ imageUrl, onChange }: { imageUrl: string | null; onChange: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      // M3: authHeaders()는 FormData 요청에도 Content-Type을 안 얹는다(card-deck.ts
      // browserCardUploader와 동일 패턴) — multipart boundary는 브라우저가 직접 채운다.
      const res = await fetch("/api/images/upload", { method: "POST", headers: authHeaders(), body: form });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setUploadError(data.error || "사진을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      onChange(data.url);
    } catch {
      setUploadError("연결이 끊겨 사진을 올리지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-stack-tight" data-cover-image-picker>
      {imageUrl ? (
        <DeliveredMedia
          src={imageUrl}
          type="image"
          alt="선택된 표지 사진"
          className="h-24 w-24 rounded-control border border-border object-cover"
          testId="cover-image-picker-preview"
        />
      ) : (
        <p className="text-caption text-muted" data-cover-image-empty>아직 사진을 고르지 않았습니다.</p>
      )}
      <p className="text-caption text-subtle" data-cover-image-render-status>미리보기와 발행 결과물에 그대로 반영됩니다. 사진을 불러오는 데 장당 최대 8초 걸릴 수 있습니다.</p>
      <div className="flex flex-wrap gap-stack-tight">
        <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "올리는 중…" : "사진 올리기"}</Button>
        {imageUrl ? <Button size="sm" variant="secondary" onClick={() => onChange(null)}>사진 빼기</Button> : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />
      {uploadError ? <p role="alert" className="text-caption text-danger" data-cover-image-error>{uploadError}</p> : null}
    </div>
  );
}

function CoverEditor({ slide, onChange, onImageChange }: {
  slide: CardSlide;
  onChange: (cover: NonNullable<CardSlide["cover"]>) => void;
  onImageChange: (url: string | null) => void;
}) {
  const cover = slide.cover ?? { headline: "", sub: null };
  return (
    <div className="space-y-stack" data-bubble-editor-cover>
      <label className="block text-caption text-muted">표지 헤드라인 (3줄 이내, 줄당 10자)
        <textarea
          value={cover.headline}
          onChange={(event) => onChange({ ...cover, headline: event.target.value })}
          className="mt-stack-tight w-full rounded-control border border-border bg-surface-2 p-stack text-body text-text"
          rows={3}
        />
      </label>
      <div>
        <span className="block text-caption text-muted">후킹 문구 바로 넣기</span>
        <div className="mt-stack-tight"><HookChips onPick={(text) => onChange({ ...cover, headline: text })} /></div>
      </div>
      <label className="block text-caption text-muted">보조 문구
        <input
          value={cover.sub ?? ""}
          onChange={(event) => onChange({ ...cover, sub: event.target.value || null })}
          className="mt-stack-tight w-full rounded-control border border-border bg-surface-2 p-stack text-body text-text"
        />
      </label>
      <div>
        <span className="block text-caption text-muted">표지 사진</span>
        <div className="mt-stack-tight"><CoverImagePicker imageUrl={slide.cover_image_url ?? null} onChange={onImageChange} /></div>
      </div>
    </div>
  );
}

/**
 * 편집실 카드 탭 전체 패널. 좌측 112px 썸네일과 520px 4:5 DOM 스테이지를 쓴다.
 * 캔버스 미리보기와 우측 textarea를 분리하던 구조를 없애서 말풍선 한 번 클릭이 곧
 * 그 자리 편집이 되게 한다(EDIT-CARD v70 §3).
 */
/**
 * M5+M6(PR 리뷰): 편집 중인 장을 발행 렌더러(`renderChatBubbleSlideToCanvas`, 발행
 * 경로와 100% 같은 코드)로 400ms 디바운스해 다시 그려본다. 표지·CTA는 그 결과 캔버스를
 * 그대로 보여줘 사진·그라데이션·헤드라인 줄 수가 실제 발행 모습과 같은지 편집 중에 볼 수
 * 있게 하고(M5), 모든 장은 던져진 `ChatBubbleRenderError` 메시지를 스테이지 아래 한 줄
 * 경고로 보여줘 말풍선 넘침·헤드라인 3줄 초과를 발행 직전이 아니라 편집 중에 알린다(M6).
 * 그리는 것 자체가 목적이 아니라 검사가 목적이므로, chat/comment_prompt 장은 캔버스를
 * 버리고 에러 메시지만 남긴다(스테이지는 이미 DOM 직접 편집이 실물이다).
 */
function useSlideRenderCheck(deck: CardDeck, slide: CardSlide | undefined, index: number, total: number) {
  const [state, setState] = useState<{ canvas: HTMLCanvasElement | null; warning: string | null }>({ canvas: null, warning: null });
  useEffect(() => {
    if (!slide) {
      setState({ canvas: null, warning: null });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const canvas = await renderChatBubbleSlideToCanvas({ deck, slide, index, total });
          if (cancelled) return;
          setState({ canvas: slide.role === "cover" || slide.role === "cta" ? canvas : null, warning: null });
        } catch (cause) {
          if (cancelled) return;
          const message = cause instanceof Error ? cause.message : "이 장의 레이아웃을 확인하지 못했습니다.";
          setState({ canvas: null, warning: message });
        }
      })();
    }, SLIDE_RENDER_CHECK_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [deck, slide, index, total]);
  return state;
}

/** 캔버스를 컨테이너에 그대로 붙인다(`CardDeckThumbnailStrip`과 같은 패턴). */
function SlideRenderPreview({ canvas }: { canvas: HTMLCanvasElement | null }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";
    if (canvas) {
      canvas.className = styles.slideRenderCanvas;
      host.appendChild(canvas);
    }
  }, [canvas]);
  return canvas ? <div ref={hostRef} data-slide-render-preview aria-label="발행 미리보기" /> : null;
}

export function CardDeckPanel({ deck, onDeckChange }: { deck: CardDeck; onDeckChange: (deck: CardDeck) => void }) {
  const [activeSlideId, setActiveSlideId] = useState(deck.slides[0]?.id ?? "");
  const [slideError, setSlideError] = useState<string | null>(null);
  const activeIndex = deck.slides.findIndex((s) => s.id === activeSlideId);
  const activeSlide = activeIndex >= 0 ? deck.slides[activeIndex] : deck.slides[0];
  const { canvas: renderPreview, warning: renderWarning } = useSlideRenderCheck(deck, activeSlide, Math.max(0, activeIndex), deck.slides.length);

  useEffect(() => {
    if (!deck.slides.find((s) => s.id === activeSlideId)) {
      setActiveSlideId(deck.slides[0]?.id ?? "");
    }
  }, [deck.slides, activeSlideId]);

  function runSlide(op: (deck: CardDeck) => CardDeck) {
    try {
      setSlideError(null);
      onDeckChange(op(deck));
    } catch (cause) {
      if (cause instanceof CardDeckOpsError) {
        console.error("카드덱 연산 실패", cause.code, cause.message);
        setSlideError(cardDeckOpsErrorMessage(cause.code));
      } else {
        setSlideError("장을 바꾸지 못했습니다.");
      }
    }
  }

  return (
    <div className={styles.cardDeckPanel} data-card-deck-panel>
      <nav aria-label="카드 목록" className={styles.thumbnailStrip} data-card-deck-slide-list data-card-deck-thumbnail-strip>
        {deck.slides.map((slide, index) => {
          const locked = slide.role === "cover" || slide.role === "cta";
          return (
            <div key={slide.id} className={styles.thumbnailItem}>
              <Button
                variant="secondary"
                onClick={() => setActiveSlideId(slide.id)}
                aria-pressed={slide.id === activeSlideId}
                data-slide-id={slide.id}
                data-slide-role={slide.role}
                // 2026-09-22 코드리뷰 CI 재검토: 맨 button 태그 대신 공용 Button 을 쓴다
                // (QA-APP-TOUCH-08 기준선 239→238). Button 기본값(inline-flex·
                // justify-center·px 만 있는 size 패딩)과 이 목록 행의 레이아웃(꽉 찬
                // 너비·양끝 정렬·상하좌우 패딩·왼쪽 정렬)이 충돌하는 자리만 `!` 로 이긴다.
                className={`${styles.thumbnailButton} ${slide.id === activeSlideId ? styles.thumbnailButtonActive : ""}`}
              >
                <span className={styles.thumbnailMeta}>
                  <span>{index + 1}</span>
                  <span data-slide-role-badge={slide.role} className={`rounded-chip border px-micro text-caption font-semibold ${SLIDE_ROLE_BADGE_CLASS[slide.role]}`}>{SLIDE_ROLE_LABEL[slide.role]}</span>
                </span>
                <span className={styles.thumbnailBars} aria-hidden="true"><i /><i /><i /></span>
              </Button>
              <div className={styles.thumbnailActions}>
                <Button size="sm" onClick={() => runSlide((d) => moveSlide(d, index, index - 1))} disabled={locked || index === 0}>▲</Button>
                <Button size="sm" onClick={() => runSlide((d) => moveSlide(d, index, index + 1))} disabled={locked || index === deck.slides.length - 1}>▼</Button>
                <Button size="sm" onClick={() => runSlide((d) => addSlide(d, index))} disabled={index === deck.slides.length - 1}>+장</Button>
                {locked ? (
                  <span className="rounded-chip border border-dashed border-border px-micro text-caption text-subtle" data-slide-locked>{SLIDE_ROLE_LABEL[slide.role]}는 지울 수 없습니다</span>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => runSlide((d) => deleteSlide(d, index))}>삭제</Button>
                )}
              </div>
            </div>
          );
        })}
      </nav>
      <section aria-label="카드 편집 스테이지" className={styles.stageColumn} data-card-deck-preview>
        {activeSlide && (activeSlide.role === "cover" || activeSlide.role === "cta") ? (
          <SlideRenderPreview canvas={renderPreview} />
        ) : null}
        <div className={styles.cardStage} data-card-deck-stage data-card-deck-stage-ratio="4:5">
          {activeSlide && activeSlide.role !== "cover" ? (
            // M(MINOR, PR 리뷰): 채팅 헤더는 발행 PNG(`chat-bubble.ts drawChatSlide`)와
            // 같은 규칙을 따른다 — 그 렌더러는 헤더에 handle을 그리지 않고
            // `deck.brand.display_name`만 그린다. "브랜드" placeholder를 지어내지 않고
            // PNG와 똑같이 handle 칸 자체를 비운다.
            <header className={styles.cardBrandBar}>
              <b>{deck.brand.display_name}</b>
            </header>
          ) : null}
          {activeSlide ? <BubbleEditor deck={deck} slideId={activeSlide.id} onDeckChange={onDeckChange} /> : null}
        </div>
        {renderWarning ? <p role="alert" className={styles.slideLayoutWarning} data-slide-layout-warning>{renderWarning}</p> : null}
        {slideError ? <p role="alert" className="mt-stack-tight text-caption text-danger">{slideError}</p> : null}
      </section>
    </div>
  );
}

function CtaEditor({ deck, onChange }: { deck: CardDeck; onChange: (cta: CardDeck["cta"]) => void }) {
  const { cta } = deck;
  return (
    <div className="space-y-stack-tight rounded-surface border border-border bg-surface-2 p-stack" data-bubble-editor-cta>
      <b className="block text-caption font-semibold text-text">CTA 정보</b>
      <label className="block text-caption text-muted">댓글 키워드
        <input value={cta.keyword} onChange={(event) => onChange({ ...cta, keyword: event.target.value })} className="mt-stack-tight w-full rounded-control border border-border bg-surface p-stack text-body text-text" />
      </label>
      <div className="flex flex-wrap gap-stack-tight" data-cta-keyword-chips>
        {CTA_KEYWORD_PRESETS.map((preset) => (
          <Button key={preset} size="sm" variant="secondary" onClick={() => onChange({ ...cta, keyword: preset })}>{preset}</Button>
        ))}
      </div>
      <label className="block text-caption text-muted">댓글 예시
        <input value={cta.comment_example} onChange={(event) => onChange({ ...cta, comment_example: event.target.value })} className="mt-stack-tight w-full rounded-control border border-border bg-surface p-stack text-body text-text" />
      </label>
      <div className="flex flex-wrap gap-stack-tight" data-cta-comment-chips>
        {CTA_COMMENT_EXAMPLE_PRESETS.map((preset) => (
          <Button key={preset} size="sm" variant="secondary" onClick={() => onChange({ ...cta, comment_example: preset })}>{preset}</Button>
        ))}
      </div>
      <label className="block text-caption text-muted">저장 명분
        <input value={cta.save_reason} onChange={(event) => onChange({ ...cta, save_reason: event.target.value })} className="mt-stack-tight w-full rounded-control border border-border bg-surface p-stack text-body text-text" />
      </label>
      <div className="flex flex-wrap gap-stack-tight" data-cta-save-chips>
        {CTA_SAVE_REASON_PRESETS.map((preset) => (
          <Button key={preset} size="sm" variant="secondary" onClick={() => onChange({ ...cta, save_reason: preset })}>{preset}</Button>
        ))}
      </div>
    </div>
  );
}
