/**
 * 03c 편집도구(카드컨셉13-채팅말풍선/03c-편집도구-통합.html)의 말풍선·슬라이드 연산을
 * DOM 무관 순수 함수로 옮긴다.
 *
 * 03c 는 `contenteditable`·`document.createRange`·`localStorage` 에 묶여 있어 그대로
 * 못 옮긴다(설계 §5 F1). 아래는 그 파일의 어느 함수를 어디로 옮겼는지 표다(원본 행 번호는
 * 이 파일 작성 시점 03c 스냅샷 기준).
 *
 * | 03c 함수 (행)              | 이식 대상            |
 * |----------------------------|-----------------------|
 * | runBubbleAction('add') 402 | addBubble              |
 * | 'split' 403~408            | splitBubble            |
 * | 'merge' 409~414            | mergeBubble            |
 * | 'delete' 415               | deleteBubble           |
 * | 'toggle' 416                | toggleSpeaker          |
 * | 'up'/'down' 417~418         | moveBubble             |
 * | rich/saveEditor 254~275     | toggleBold + normalizeSegments |
 * | moveSlide 436~454           | moveSlide              |
 * | addSlide 464~476            | addSlide               |
 * | deleteSlide 477~488         | deleteSlide            |
 *
 * 모든 연산은 새 객체를 반환한다(불변. 원본 deck 을 mutate 하지 않는다). revision 은
 * 호출부(EditRoom)가 저장 직전에 +1 하지만, 여기서도 반환값에 revision+1 을 반영해
 * "연산 = 상태 변화" 를 단일하게 유지한다. 실패는 CardDeckOpsError(code, message) 로
 * 이유를 데리고 나온다(실수.md 2026-09-09).
 */
import type { Bubble, CardDeck, CardSlide, Segment, SlideRole } from "./card-deck-contract";
import { newBubbleId, newSlideId, retextSegments } from "./card-deck-contract";

export class CardDeckOpsError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function withRevision(deck: CardDeck, slides: CardSlide[]): CardDeck {
  return { ...deck, slides, revision: deck.revision + 1 };
}

function findSlide(deck: CardDeck, slideId: string): { slide: CardSlide; index: number } {
  const index = deck.slides.findIndex((s) => s.id === slideId);
  if (index < 0) throw new CardDeckOpsError("OPS_SLIDE_NOT_FOUND", `slide ${slideId} not found`);
  return { slide: deck.slides[index], index };
}

function findBubble(slide: CardSlide, bubbleId: string): { bubble: Bubble; index: number } {
  const bubbles = slide.bubbles ?? [];
  const index = bubbles.findIndex((b) => b.id === bubbleId);
  if (index < 0) throw new CardDeckOpsError("OPS_BUBBLE_NOT_FOUND", `bubble ${bubbleId} not found`);
  return { bubble: bubbles[index], index };
}

function reindexBubbles(bubbles: Bubble[]): Bubble[] {
  return bubbles.map((b, order) => ({ ...b, order }));
}

function replaceSlide(deck: CardDeck, slideIndex: number, updated: CardSlide): CardSlide[] {
  return deck.slides.map((s, i) => (i === slideIndex ? updated : s));
}

// ---------------------------------------------------------------------------
// 표지·CTA 슬라이드 연산 (MINOR 2026-09-22 코드리뷰: BubbleEditor.tsx가 순수 함수를 안
// 거치고 인라인 스프레드로 직접 slides 배열을 조작하던 것을 이 파일의 나머지 연산과 같은
// 패턴으로 맞춘다 — 파일 헤더 "모든 연산은 새 객체를 반환한다"를 표지/CTA 편집에도 지킨다.
// ---------------------------------------------------------------------------

/** 표지 장의 headline/sub을 바꾼다. slide.role이 "cover"가 아니면 거부한다. */
export function setSlideCover(deck: CardDeck, slideId: string, cover: NonNullable<CardSlide["cover"]>): CardDeck {
  const { slide, index: slideIndex } = findSlide(deck, slideId);
  if (slide.role !== "cover") {
    throw new CardDeckOpsError("OPS_NOT_COVER_SLIDE", "cover can only be set on the cover slide");
  }
  return withRevision(deck, replaceSlide(deck, slideIndex, { ...slide, cover }));
}

/** 표지·CTA(마지막) 장의 배경 사진(cover_image_url)을 바꾼다. */
export function setSlideCoverImage(deck: CardDeck, slideId: string, coverImageUrl: string | null): CardDeck {
  const { slide, index: slideIndex } = findSlide(deck, slideId);
  if (slide.role !== "cover" && slide.role !== "cta") {
    throw new CardDeckOpsError("OPS_NOT_COVER_OR_CTA_SLIDE", "cover_image_url can only be set on the cover or cta slide");
  }
  return withRevision(deck, replaceSlide(deck, slideIndex, { ...slide, cover_image_url: coverImageUrl }));
}

// ---------------------------------------------------------------------------
// 말풍선 연산 (03c runBubbleAction)
// ---------------------------------------------------------------------------

/** 03c 'add' 402행: 뒤에 같은 화자 빈 말풍선. */
export function addBubble(deck: CardDeck, slideId: string, afterBubbleId: string | null): CardDeck {
  const { slide, index: slideIndex } = findSlide(deck, slideId);
  const bubbles = slide.bubbles ?? [];
  const afterIndex = afterBubbleId ? findBubble(slide, afterBubbleId).index : bubbles.length - 1;
  const speaker = bubbles[afterIndex]?.speaker ?? "brand";
  const next: Bubble = {
    id: newBubbleId(),
    order: 0,
    speaker,
    segments: [{ text: "", bold: false }],
    reaction: null,
  };
  const updatedBubbles = reindexBubbles([
    ...bubbles.slice(0, afterIndex + 1),
    next,
    ...bubbles.slice(afterIndex + 1),
  ]);
  return withRevision(deck, replaceSlide(deck, slideIndex, { ...slide, bubbles: updatedBubbles }));
}

/**
 * 03c 'split' 403~408 + splitRichValue 306~316: 원본은 `<br>` 기준으로만 쪼갠다.
 * 여기서는 캐럿 위치(세그먼트 인덱스 + 오프셋)로 쪼갠다(줄바꿈이 없어도 동작).
 * 세그먼트 경계가 아니면 그 세그먼트를 둘로 나누고 bold 를 양쪽에 복사한다.
 */
export function splitBubble(
  deck: CardDeck,
  slideId: string,
  bubbleId: string,
  at: { segmentIndex: number; offset: number },
): CardDeck {
  const { slide, index: slideIndex } = findSlide(deck, slideId);
  const bubbles = slide.bubbles ?? [];
  const { bubble, index: bubbleIndex } = findBubble(slide, bubbleId);
  const segments = bubble.segments;
  if (at.segmentIndex < 0 || at.segmentIndex >= segments.length) {
    throw new CardDeckOpsError("OPS_SPLIT_OUT_OF_RANGE", "split position segmentIndex out of range");
  }
  const target = segments[at.segmentIndex];
  const offset = Math.max(0, Math.min(at.offset, target.text.length));

  const before: Segment[] = [
    ...segments.slice(0, at.segmentIndex),
    ...(offset > 0 ? [{ text: target.text.slice(0, offset), bold: target.bold }] : []),
  ];
  const after: Segment[] = [
    ...(offset < target.text.length ? [{ text: target.text.slice(offset), bold: target.bold }] : []),
    ...segments.slice(at.segmentIndex + 1),
  ];
  if (!before.length || !after.length) {
    throw new CardDeckOpsError("OPS_SPLIT_EMPTY", "split would produce an empty bubble");
  }

  const first: Bubble = { ...bubble, id: bubble.id, segments: before };
  // reaction 은 원본 말풍선 하나에 달린 것이지 쪼갠 둘 다에 있는 게 아니다(2026-09-21
  // 코드리뷰 MINOR. split 이 reaction 을 두 말풍선에 복제하고 있었다). 첫 조각이 갖고,
  // 새로 생긴 둘째 조각은 null 로 시작한다.
  const second: Bubble = { ...bubble, id: newBubbleId(), segments: after, reaction: null };
  const updatedBubbles = reindexBubbles([
    ...bubbles.slice(0, bubbleIndex),
    first,
    second,
    ...bubbles.slice(bubbleIndex + 1),
  ]);
  return withRevision(deck, replaceSlide(deck, slideIndex, { ...slide, bubbles: updatedBubbles }));
}

/**
 * textarea 직접 입력을 세그먼트 구조에 반영한다(2026-09-22 코드리뷰 MAJOR 5).
 *
 * 이전에는 `BubbleEditor.tsx updateBubbleText` 가 `segments: [{text, bold: 첫조각값}]`
 * 로 전체를 한 덩이로 갈아엎었다 — 부분 볼드가 있는 말풍선(`[일반][굵게][일반]`)에서 글자
 * 하나만 고쳐도 볼드가 통째로 사라지거나 전부 붙었다. 헤더 주석 "모든 상태 변화는
 * card-deck-ops.ts 의 순수 함수만 거친다" 를 텍스트 입력에도 지키게 한다.
 *
 * `applyProjection` 의 `retextSegments` 와 같은 비율 재분배를 재사용한다(같은 문제,
 * 같은 해법 — 한 자리에서만 정한다).
 */
export function setBubbleText(deck: CardDeck, slideId: string, bubbleId: string, text: string): CardDeck {
  const { slide, index: slideIndex } = findSlide(deck, slideId);
  const bubbles = slide.bubbles ?? [];
  const { bubble, index: bubbleIndex } = findBubble(slide, bubbleId);
  const updatedBubble: Bubble = { ...bubble, segments: retextSegments(bubble.segments, text) };
  const updatedBubbles = bubbles.map((b, i) => (i === bubbleIndex ? updatedBubble : b));
  return withRevision(deck, replaceSlide(deck, slideIndex, { ...slide, bubbles: updatedBubbles }));
}

/**
 * MAJOR(5차 재검증, T1): blur 시점 끝 개행 트림을 `setBubbleText`(→`retextSegments` 글자수
 * 비율 재분배) 경로로 태웠더니, 개행 한두 글자가 빠지는 길이 변화만으로도 반올림 경계가
 * 흔들려 굵은 구간 경계가 한 글자 밀렸다(재현 T1: `**새 교재**가…` 가 blur 후
 * `**새 교**재가…`로 바뀜). 세그먼트 구조·굵기 경계는 그대로 두고 **마지막 세그먼트의
 * 끝에 붙은 개행만** 지우는 전용 연산으로 바꾼다 — 다른 세그먼트를 전혀 안 건드리니
 * 경계가 밀릴 여지가 없다.
 *
 * MAJOR(6차 재검증): 마지막 세그먼트 "하나만" 한 번 자르고 끝냈더니, 재분배 결과가
 * `[{"…요\n"}, {"\n", bold:true}]`처럼 **끝 개행이 여러 세그먼트에 걸쳐 나뉜 경우**를
 * 놓쳤다(재현: 마지막 글자를 굵게 만든 뒤 Enter 두 번 + blur — 마지막 세그먼트("\n"
 * 하나)만 비워 통째로 빠지고, 그 앞 세그먼트("…요\n")에 남은 개행은 안 건드려 저장본에
 * "\n"이 그대로 남았다. 화면 1줄인데 PNG는 2줄, 게다가 그 개행을 담았던 볼드 세그먼트가
 * 통째로 사라져 굵게 표시도 없어졌다). 뒤에서부터 반복한다: 마지막 세그먼트의 끝 개행을
 * 지우고, 비면 그 세그먼트를 통째로 빼고, 그 결과 새 마지막 세그먼트가 또 "\n"으로
 * 끝나면 계속 반복한다 — 개행이 세그먼트 경계를 몇 번을 걸쳐 있든 전부 걷힌다.
 */
/**
 * `trimBubbleTrailingNewline`의 순수 세그먼트 변환만 떼어낸 것 — deck/slide/bubble
 * 조회 없이 세그먼트 배열만 받아 끝 개행을 반복해서 걷어낸다.
 *
 * MAJOR(6차 재검증, 속성 테스트가 잡음): `BubbleEditor.tsx handleBlur`가 이 로직을
 * "connected 연산(`trimBubbleTrailingNewline` + `run()`)을 호출한 뒤, **같은 함수
 * 안에서** `bubble.segments`(트림 전 값 — `run()`의 상태 갱신은 다음 렌더까지 반영
 * 안 됨)로 화면을 다시 그리는" 순서로 짰다가, 트림한 개행이 그 자리에서 `<br>`로
 * 되살아나 화면에 남았다(모델엔 없는데 화면에만 보이는 개행 — "화면=저장본" 계약
 * 위반). 그 즉시-재동기화가 다음 렌더를 기다리지 않고 "트림 후 상태"를 **그 자리에서
 * 직접 계산**할 수 있도록, deck 배관과 분리한 순수 함수로 뽑아 `handleBlur`와
 * `trimBubbleTrailingNewline` 양쪽이 정확히 같은 로직을 쓰게 한다(로직을 두 곳에
 * 따로 베끼면 또 어긋난다 — 이 PR 전체가 반복해서 겪은 실수다).
 */
export function trimSegmentsTrailingNewline(segments: Segment[]): Segment[] {
  let result = segments;
  let changed = false;
  while (result.length > 0) {
    const lastIndex = result.length - 1;
    const lastText = result[lastIndex].text;
    const trimmedLastText = lastText.replace(/\n+$/, "");
    if (trimmedLastText === lastText) break; // 이 세그먼트엔 지울 끝 개행이 없다 — 반복 종료.
    changed = true;
    result = trimmedLastText.length === 0 && result.length > 1
      ? result.slice(0, lastIndex)
      : result.map((s, i) => (i === lastIndex ? { ...s, text: trimmedLastText } : s));
  }
  return changed ? result : segments; // 무변화면 참조를 그대로 돌려줘 불필요한 갱신을 피한다.
}

export function trimBubbleTrailingNewline(deck: CardDeck, slideId: string, bubbleId: string): CardDeck {
  const { slide, index: slideIndex } = findSlide(deck, slideId);
  const bubbles = slide.bubbles ?? [];
  const { bubble, index: bubbleIndex } = findBubble(slide, bubbleId);
  const segments = trimSegmentsTrailingNewline(bubble.segments);
  if (segments === bubble.segments) return deck; // 지울 끝 개행이 전혀 없으면 무동작(불필요한 revision 증가 방지).
  const updatedBubble: Bubble = { ...bubble, segments };
  const updatedBubbles = bubbles.map((b, i) => (i === bubbleIndex ? updatedBubble : b));
  return withRevision(deck, replaceSlide(deck, slideIndex, { ...slide, bubbles: updatedBubbles }));
}

/**
 * textarea 의 `selectionStart`(말풍선 전체 텍스트 기준 캐럿)를 `splitBubble` 이 받는
 * 세그먼트 좌표 `{segmentIndex, offset}` 로 바꾼다(2026-09-22 코드리뷰 MAJOR 5: 이전에는
 * `{segmentIndex: 0, offset: caret}` 을 그대로 넘겨, 세그먼트가 2개 이상이면 caret 이
 * 0번 세그먼트 길이를 넘어 엉뚱한 자리에서 쪼개지거나 ops 가 거부했다).
 * caret 이 두 세그먼트 경계에 걸치면 앞 세그먼트의 끝으로 본다(빈 뒤 세그먼트 생성 회피).
 */
export function caretToSegment(segments: Segment[], caret: number): { segmentIndex: number; offset: number } {
  const total = segments.reduce((sum, s) => sum + s.text.length, 0);
  const clamped = Math.max(0, Math.min(caret, total));
  let cursor = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const length = segments[i].text.length;
    if (clamped <= cursor + length || i === segments.length - 1) {
      return { segmentIndex: i, offset: clamped - cursor };
    }
    cursor += length;
  }
  return { segmentIndex: 0, offset: 0 };
}

/**
 * 03c 'merge' 409~414: 다음 말풍선과 합친다. 화자가 다르면 거부한다(OPS_SPEAKER_MISMATCH .
 * 원본에는 없던 가드지만, 화자 색이 다른 말풍선을 하나로 합치면 렌더가 어느 색을 써야
 * 할지 알 수 없다).
 */
export function mergeBubble(deck: CardDeck, slideId: string, bubbleId: string): CardDeck {
  const { slide, index: slideIndex } = findSlide(deck, slideId);
  const bubbles = slide.bubbles ?? [];
  const { bubble, index: bubbleIndex } = findBubble(slide, bubbleId);
  const next = bubbles[bubbleIndex + 1];
  if (!next) throw new CardDeckOpsError("OPS_MERGE_NO_NEXT", "there is no next bubble to merge with");
  if (next.speaker !== bubble.speaker) {
    throw new CardDeckOpsError("OPS_SPEAKER_MISMATCH", "cannot merge bubbles with different speakers");
  }
  // 다음 말풍선의 첫 조각 앞에 줄바꿈 텍스트 세그먼트를 넣는다(03c 관습: <br> 삽입).
  const nextSegments = next.segments.map((segment, index) =>
    index === 0 ? { ...segment, text: `\n${segment.text}` } : segment);
  const merged: Bubble = { ...bubble, segments: [...bubble.segments, ...nextSegments] };
  const updatedBubbles = reindexBubbles([
    ...bubbles.slice(0, bubbleIndex),
    merged,
    ...bubbles.slice(bubbleIndex + 2),
  ]);
  return withRevision(deck, replaceSlide(deck, slideIndex, { ...slide, bubbles: updatedBubbles }));
}

/** 03c 'delete' 415행. 장에 말풍선이 1개면 거부한다(장이 비면 validator 위반). */
export function deleteBubble(deck: CardDeck, slideId: string, bubbleId: string): CardDeck {
  const { slide, index: slideIndex } = findSlide(deck, slideId);
  const bubbles = slide.bubbles ?? [];
  if (bubbles.length <= 1) {
    throw new CardDeckOpsError("OPS_DELETE_LAST_BUBBLE", "cannot delete the only bubble in a slide");
  }
  const { index: bubbleIndex } = findBubble(slide, bubbleId);
  const updatedBubbles = reindexBubbles(bubbles.filter((_, i) => i !== bubbleIndex));
  return withRevision(deck, replaceSlide(deck, slideIndex, { ...slide, bubbles: updatedBubbles }));
}

/** 03c 'toggle' 416행: student↔mentor → reader↔brand. */
export function toggleSpeaker(deck: CardDeck, slideId: string, bubbleId: string): CardDeck {
  const { slide, index: slideIndex } = findSlide(deck, slideId);
  const bubbles = slide.bubbles ?? [];
  const { index: bubbleIndex } = findBubble(slide, bubbleId);
  const updatedBubbles = bubbles.map((b, i) =>
    i === bubbleIndex ? { ...b, speaker: b.speaker === "reader" ? "brand" as const : "reader" as const } : b);
  return withRevision(deck, replaceSlide(deck, slideIndex, { ...slide, bubbles: updatedBubbles }));
}

/** 03c 'up'/'down' 417~418행: 자리 맞바꿈. direction 은 -1(위) 또는 +1(아래). */
export function moveBubble(deck: CardDeck, slideId: string, bubbleId: string, direction: -1 | 1): CardDeck {
  const { slide, index: slideIndex } = findSlide(deck, slideId);
  const bubbles = slide.bubbles ?? [];
  const { index: bubbleIndex } = findBubble(slide, bubbleId);
  const target = bubbleIndex + direction;
  if (target < 0 || target >= bubbles.length) {
    throw new CardDeckOpsError("OPS_MOVE_OUT_OF_RANGE", "cannot move bubble beyond slide bounds");
  }
  const swapped = [...bubbles];
  [swapped[bubbleIndex], swapped[target]] = [swapped[target], swapped[bubbleIndex]];
  return withRevision(deck, replaceSlide(deck, slideIndex, { ...slide, bubbles: reindexBubbles(swapped) }));
}

/**
 * 03c rich/cleanRich/saveEditor 254~275행(HTML `<strong>` 왕복)을 세그먼트 조작으로 대체.
 * range 는 말풍선 전체 텍스트 기준 문자 오프셋(from ≤ to)이다. 그 범위만 bold:true 로
 * 분리하고, 인접한 같은 bold 값의 세그먼트는 병합한다(normalizeSegments). 이미 장에
 * 볼드 덩이가 있는데 이 토글로 두 번째 덩이가 생기면 OPS_BOLD_LIMIT.
 */
export function toggleBold(
  deck: CardDeck,
  slideId: string,
  bubbleId: string,
  range: { from: number; to: number },
): CardDeck {
  const { slide, index: slideIndex } = findSlide(deck, slideId);
  const bubbles = slide.bubbles ?? [];
  const { bubble, index: bubbleIndex } = findBubble(slide, bubbleId);
  const fullText = bubble.segments.map((s) => s.text).join("");
  const from = Math.max(0, Math.min(range.from, fullText.length));
  const to = Math.max(from, Math.min(range.to, fullText.length));
  if (from === to) throw new CardDeckOpsError("OPS_BOLD_EMPTY_RANGE", "bold range must be non-empty");

  const willBold = !isFullyBold(bubble.segments, from, to);
  const rebuilt = normalizeSegments(applyBoldRange(bubble.segments, from, to, willBold));
  const updatedBubble: Bubble = { ...bubble, segments: rebuilt };
  const updatedBubbles = bubbles.map((b, i) => (i === bubbleIndex ? updatedBubble : b));
  const updatedSlide: CardSlide = { ...slide, bubbles: updatedBubbles };

  if (willBold) {
    const chunks = countBoldChunksInBubbles(updatedBubbles);
    if (chunks > 1) throw new CardDeckOpsError("OPS_BOLD_LIMIT", "한 장에 굵은 덩이는 하나입니다");
  }
  return withRevision(deck, replaceSlide(deck, slideIndex, updatedSlide));
}

function isFullyBold(segments: Segment[], from: number, to: number): boolean {
  let cursor = 0;
  for (const segment of segments) {
    const start = cursor;
    const end = cursor + segment.text.length;
    cursor = end;
    const overlapStart = Math.max(start, from);
    const overlapEnd = Math.min(end, to);
    if (overlapStart < overlapEnd && !segment.bold) return false;
  }
  return true;
}

function applyBoldRange(segments: Segment[], from: number, to: number, bold: boolean): Segment[] {
  const result: Segment[] = [];
  let cursor = 0;
  for (const segment of segments) {
    const start = cursor;
    const end = cursor + segment.text.length;
    cursor = end;
    const overlapStart = Math.max(start, from);
    const overlapEnd = Math.min(end, to);
    if (overlapStart >= overlapEnd) {
      result.push(segment);
      continue;
    }
    if (overlapStart > start) result.push({ text: segment.text.slice(0, overlapStart - start), bold: segment.bold });
    result.push({ text: segment.text.slice(overlapStart - start, overlapEnd - start), bold });
    if (overlapEnd < end) result.push({ text: segment.text.slice(overlapEnd - start), bold: segment.bold });
  }
  return result;
}

/** 인접 동일 bold 세그먼트 병합, 빈 세그먼트 제거. */
export function normalizeSegments(segments: Segment[]): Segment[] {
  const nonEmpty = segments.filter((s) => s.text.length > 0);
  const merged: Segment[] = [];
  for (const segment of nonEmpty) {
    const last = merged[merged.length - 1];
    if (last && last.bold === segment.bold) {
      last.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged.length ? merged : [{ text: "", bold: false }];
}

function countBoldChunksInBubbles(bubbles: Bubble[]): number {
  let chunks = 0;
  let inChunk = false;
  for (const bubble of bubbles) {
    for (const segment of bubble.segments) {
      if (segment.bold && segment.text) {
        if (!inChunk) { chunks += 1; inChunk = true; }
      } else {
        inChunk = false;
      }
    }
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// 슬라이드 연산 (03c moveSlide/addSlide/deleteSlide 436~488행)
// ---------------------------------------------------------------------------

function assertNotEdgeLocked(deck: CardDeck, index: number, action: string): void {
  const isFirst = index === 0;
  const isLast = index === deck.slides.length - 1;
  if (isFirst || isLast) {
    throw new CardDeckOpsError("OPS_SLIDE_LOCKED", `cannot ${action} the cover or cta slide`);
  }
}

/** 03c moveSlide 436~454행: 표지·마지막(CTA) 고정 채 교환. */
export function moveSlide(deck: CardDeck, from: number, to: number): CardDeck {
  if (from < 0 || from >= deck.slides.length || to < 0 || to >= deck.slides.length) {
    throw new CardDeckOpsError("OPS_SLIDE_OUT_OF_RANGE", "slide index out of range");
  }
  assertNotEdgeLocked(deck, from, "move");
  assertNotEdgeLocked(deck, to, "move");
  const swapped = [...deck.slides];
  [swapped[from], swapped[to]] = [swapped[to], swapped[from]];
  return withRevision(deck, swapped.map((s, order) => ({ ...s, order })));
}

/** 03c addSlide 464~476행: 새 chat 장 삽입(질문·답 견본). 11장 초과면 거부. */
export function addSlide(deck: CardDeck, afterIndex: number): CardDeck {
  if (deck.slides.length >= 11) {
    throw new CardDeckOpsError("OPS_SLIDE_LIMIT", "cardDeck cannot exceed 11 slides");
  }
  if (afterIndex < 0 || afterIndex >= deck.slides.length - 1) {
    throw new CardDeckOpsError("OPS_SLIDE_OUT_OF_RANGE", "cannot add a slide after the cta slide");
  }
  const newSlide: CardSlide = {
    id: newSlideId(),
    order: 0,
    role: "chat" as SlideRole,
    bubbles: [
      { id: newBubbleId(), order: 0, speaker: "reader", segments: [{ text: "질문을 입력하세요", bold: false }], reaction: null },
      { id: newBubbleId(), order: 1, speaker: "brand", segments: [{ text: "답변을 입력하세요", bold: false }], reaction: null },
    ],
    image_url: null,
  };
  const inserted = [
    ...deck.slides.slice(0, afterIndex + 1),
    newSlide,
    ...deck.slides.slice(afterIndex + 1),
  ];
  return withRevision(deck, inserted.map((s, order) => ({ ...s, order })));
}

/** 03c deleteSlide 477~488행: 표지·마지막 제외 삭제. 7장 미만이 되면 거부. */
export function deleteSlide(deck: CardDeck, index: number): CardDeck {
  assertNotEdgeLocked(deck, index, "delete");
  if (deck.slides.length <= 7) {
    throw new CardDeckOpsError("OPS_SLIDE_MIN", "cardDeck cannot go below 7 slides");
  }
  const remaining = deck.slides.filter((_, i) => i !== index);
  return withRevision(deck, remaining.map((s, order) => ({ ...s, order })));
}

// ---------------------------------------------------------------------------
// 렌더러 전용: 저장 구조가 아니라 그리기 직전에만 같은 화자 연속을 turn 으로 묶는다.
// 03c rowsFromItems 286~293행.
// ---------------------------------------------------------------------------

export type Turn = { speaker: Bubble["speaker"]; bubbles: Bubble[] };

export function groupTurns(bubbles: Bubble[]): Turn[] {
  const turns: Turn[] = [];
  for (const bubble of bubbles) {
    const last = turns[turns.length - 1];
    if (last && last.speaker === bubble.speaker) {
      last.bubbles.push(bubble);
    } else {
      turns.push({ speaker: bubble.speaker, bubbles: [bubble] });
    }
  }
  return turns;
}

// ---------------------------------------------------------------------------
// 저장 전 정리: placeholder 빈 말풍선(UI 가 add 직후 넣는 안내문 자리)을 제거.
// ---------------------------------------------------------------------------

export function pruneEmptyBubbles(deck: CardDeck): CardDeck {
  const slides = deck.slides.map((slide) => {
    if (!slide.bubbles) return slide;
    const bubbles = reindexBubbles(slide.bubbles.filter((b) => b.segments.some((s) => s.text.trim().length > 0)));
    return { ...slide, bubbles };
  });
  return { ...deck, slides };
}

/**
 * `pruneEmptyBubbles` 뒤 말풍선이 하나도 안 남은 장(있으면 안 됨. `validateCardDeck` 이
 * "bubbles must be a non-empty array" 로 거부한다)의 1-based 장 번호를 돌려준다. 없으면
 * `null`. 자동저장을 조용히 400 으로 죽이는 대신, 저장 전에 이 자리를 찾아 저장을 보류하고
 * 이유를 보여주는 데 쓴다(2026-09-22 코드리뷰 MAJOR 2).
 */
export function emptyBubbleSlideNumber(deck: CardDeck): number | null {
  const index = deck.slides.findIndex((slide) => slide.bubbles && slide.bubbles.length === 0);
  return index === -1 ? null : index + 1;
}
