import {
  CARD_LOGICAL_HEIGHT,
  CARD_LOGICAL_WIDTH,
  type CardDeckV3,
  type CardElement,
  type CardElementType,
  type ImageElement,
  type CardSlideV3,
  type TextElement,
} from "./card-element-contract";
import { retextSegments } from "./card-deck-contract";
import type { Bubble, CardDeckBrand, CardSlideCover } from "./card-deck-contract";
import { isChatBaseProjectionElement } from "./card-render-model";

export const CARD_SNAP_DISTANCE = 4;
export const CARD_ROTATION_SNAP = 15;
export const CARD_HISTORY_LIMIT = 50;

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type LayerDirection = "front" | "forward" | "backward" | "back";

export interface SnapGuide {
  axis: "x" | "y";
  value: number;
  source: "stage" | "element";
}

export interface SnappedPosition {
  x: number;
  y: number;
  guides: SnapGuide[];
}

export interface CardCommandHistory {
  past: CardDeckV3[];
  present: CardDeckV3;
  future: CardDeckV3[];
}

type ElementSeed = { id: string; assetId?: string; assetAlt?: string };

export type PlainCardTextPosition =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

const clone = <T,>(value: T): T => structuredClone(value);
const round = (value: number) => Math.round(value * 1_000) / 1_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function clampedPosition(element: Pick<CardElement, "width" | "height">, x: number, y: number, ratio: CardDeckV3["ratio"]) {
  return {
    x: clamp(round(x), 1 - element.width, CARD_LOGICAL_WIDTH - 1),
    y: clamp(round(y), 1 - element.height, CARD_LOGICAL_HEIGHT[ratio] - 1),
  };
}

export function plainCardDeckV3EntryBlockReason(lines: readonly string[]): string | null {
  if (lines.length < 2) return "카드가 2장 이상일 때 자유 배치를 시작할 수 있습니다.";
  if (lines.length > 11) return `자유 배치는 최대 11장까지 지원합니다. 현재 ${lines.length}장을 자르지 않고 그대로 보존했습니다.`;
  const emptyIndex = lines.findIndex((line) => !line.trim());
  if (emptyIndex >= 0) return `${emptyIndex + 1}번 카드가 비어 있습니다. 내용을 채운 뒤 자유 배치를 시작해 주세요.`;
  const longIndex = lines.findIndex((line) => line.length > 2_000);
  if (longIndex >= 0) return `${longIndex + 1}번 카드가 2,000자를 넘습니다. 원문을 줄인 뒤 자유 배치를 시작해 주세요.`;
  return null;
}

function plainTextGeometry(position: PlainCardTextPosition | undefined) {
  const value = position ?? "center";
  const [vertical, horizontal] = value === "center" ? ["center", "center"] : value.split("-");
  return {
    x: horizontal === "left" ? 60 : horizontal === "right" ? 180 : 120,
    y: vertical === "top" ? 50 : vertical === "bottom" ? 800 : 425,
    align: horizontal === "left" ? "left" : horizontal === "right" ? "right" : "center",
    verticalAlign: vertical === "top" ? "top" : vertical === "bottom" ? "bottom" : "middle",
  } as const;
}

export function createPlainCardDeckV3(
  lines: string[],
  positionsOrId: readonly PlainCardTextPosition[] | string = [],
  explicitId?: string,
): CardDeckV3 {
  const positions = typeof positionsOrId === "string" ? [] : positionsOrId;
  const id = typeof positionsOrId === "string"
    ? positionsOrId
    : explicitId ?? `deck_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const blockedReason = plainCardDeckV3EntryBlockReason(lines);
  if (blockedReason) throw new RangeError(blockedReason);
  return {
    contract_version: "3.0",
    id,
    template: "plain",
    ratio: "4:5",
    revision: 0,
    theme: { background: "#FFF9F0", foreground: "#111111", accent: "#2563EB" },
    brand: { display_name: "OSMU", handle: null },
    hook_type: "pain",
    cta: { keyword: "정리본", comment_example: "정리본을 남겨 주세요", save_reason: "나중에 다시 확인하세요" },
    slides: lines.map((line, index, all) => {
      const geometry = plainTextGeometry(positions[index]);
      return ({
      id: `slide_${id}_${index}`,
      order: index,
      role: index === 0 ? "cover" : index === all.length - 1 ? "cta" : "body",
      content_state: line.trim() ? "filled" : "empty",
      background: { kind: "solid", color: index === all.length - 1 ? "#111111" : "#FFF9F0" },
      base: { kind: "plain", lines: [line] },
      elements: [{
        ...createDefaultCardElement("text", { id: `el_text_${id}_${index}` }, 0),
        text: line,
        x: geometry.x,
        y: geometry.y,
        width: 840,
        height: 500,
        style: {
          font_family: "Pretendard Variable",
          font_size: index === 0 ? 76 : 60,
          font_weight: 700,
          line_height: 1.2,
          letter_spacing: 0,
          color: index === all.length - 1 ? "#FFFFFF" : "#111111",
          align: geometry.align,
          vertical_align: geometry.verticalAlign,
        },
      }],
    }); }) as CardDeckV3["slides"],
  };
}

export interface RecoverableCardBackground {
  assetId: string;
  alt: string;
}

/** AI 글자 카드의 원문과 글자를 지운 바탕을 독립 요소로 만들어 직접 편집에 넘긴다. */
export function createRecoverableEmbeddedCardDeckV3(
  lines: string[],
  positions: readonly PlainCardTextPosition[],
  backgrounds: readonly RecoverableCardBackground[],
  explicitId?: string,
): CardDeckV3 {
  if (backgrounds.length !== lines.length) throw new RangeError("각 카드에는 글자를 지운 바탕 이미지가 하나씩 필요합니다.");
  const deck = createPlainCardDeckV3(lines, positions, explicitId);
  return {
    ...deck,
    slides: deck.slides.map((slide, index) => ({
      ...slide,
      elements: [
        ({
          id: `el_background_${deck.id}_${index}`,
          type: "image",
          name: "글자를 지운 바탕",
          x: 0,
          y: 0,
          width: CARD_LOGICAL_WIDTH,
          height: CARD_LOGICAL_HEIGHT[deck.ratio],
          locked: true,
          hidden: false,
          rotation: 0,
          z_index: 0,
          opacity: 1,
          asset_id: backgrounds[index].assetId,
          alt: backgrounds[index].alt,
          decorative: false,
          fit: "cover",
          crop: { x: 0, y: 0, width: 1, height: 1 },
          corner_radius: 0,
        } satisfies ImageElement),
        ...slide.elements.map((element) => ({ ...element, z_index: element.z_index + 1 })),
      ],
    })),
  };
}

function normalizeZ(elements: CardElement[]): CardElement[] {
  return elements.map((element, index) => ({ ...element, z_index: index }));
}

function mutateSlide(
  deck: CardDeckV3,
  slideId: string,
  mutate: (slide: CardSlideV3) => CardSlideV3,
): CardDeckV3 {
  let found = false;
  let changed = false;
  const slides = deck.slides.map((slide) => {
    if (slide.id !== slideId) return clone(slide);
    found = true;
    const next = mutate(clone(slide));
    changed = JSON.stringify(next) !== JSON.stringify(slide);
    return next;
  });
  if (!found || !changed) return clone(deck);
  return { ...clone(deck), revision: deck.revision + 1, slides };
}

function mutateElement(
  deck: CardDeckV3,
  slideId: string,
  elementId: string,
  mutate: (element: CardElement) => CardElement,
): CardDeckV3 {
  return mutateSlide(deck, slideId, (slide) => ({
    ...slide,
    elements: slide.elements.map((element) => element.id === elementId ? mutate(element) : element),
  }));
}

export function createDefaultCardElement(type: CardElementType, seed: ElementSeed, zIndex: number): CardElement {
  const base = {
    id: seed.id,
    type,
    name: type === "text" ? "글" : type === "image" ? "사진" : type === "shape" ? "도형" : type === "sticker" ? "스티커" : "로고",
    x: 240,
    y: 360,
    width: type === "logo" ? 300 : 600,
    height: type === "text" ? 180 : type === "shape" ? 320 : 400,
    rotation: 0,
    z_index: zIndex,
    opacity: 1,
    locked: false,
    hidden: false,
  } as const;

  if (type === "text") {
    return {
      ...base,
      type,
      text: "글을 입력하세요",
      style: {
        font_family: "Pretendard Variable",
        font_size: 64,
        font_weight: 700,
        line_height: 1.2,
        letter_spacing: 0,
        color: "#111111",
        align: "left",
        vertical_align: "middle",
      },
    };
  }
  if (type === "image") {
    return {
      ...base,
      type,
      asset_id: seed.assetId ?? "builtin:image-placeholder",
      alt: seed.assetAlt ?? "추가한 사진",
      decorative: false,
      fit: "cover",
      crop: { x: 0, y: 0, width: 1, height: 1 },
      corner_radius: 24,
    };
  }
  if (type === "shape") {
    return { ...base, type, shape: "rectangle", fill: "#FDE68A", stroke: "transparent", stroke_width: 0, corner_radius: 24 };
  }
  if (type === "sticker") {
    return { ...base, type, width: 260, height: 260, asset_id: seed.assetId ?? "builtin:sticker-star", alt: seed.assetAlt ?? "별 스티커", decorative: true, fit: "contain" };
  }
  return { ...base, type, width: 300, height: 120, asset_id: seed.assetId ?? "builtin:logo-osmu", alt: seed.assetAlt ?? "OSMU 로고", fit: "contain" };
}

export function addCardElement(deck: CardDeckV3, slideId: string, type: CardElementType, seed: ElementSeed): CardDeckV3 {
  return mutateSlide(deck, slideId, (slide) => ({
    ...slide,
    elements: [...slide.elements, createDefaultCardElement(type, seed, slide.elements.length)],
  }));
}

/** 카톡 원형은 고정 흐름으로 두고 그 위에만 자유 요소를 추가한다. */
export function addChatOverlayElement(deck: CardDeckV3, slideId: string, type: CardElementType, seed: ElementSeed): CardDeckV3 {
  const slide = deck.slides.find((candidate) => candidate.id === slideId);
  if (!slide || slide.base.kind !== "chat_bubble") return clone(deck);
  return mutateSlide(deck, slideId, (current) => {
    const elements = normalizeZ(current.elements.filter((element) => !isChatBaseProjectionElement(current, element)));
    return { ...current, elements: [...elements, createDefaultCardElement(type, seed, elements.length)] };
  });
}

export function patchCardElement(deck: CardDeckV3, slideId: string, elementId: string, patch: Partial<CardElement>): CardDeckV3 {
  return mutateElement(deck, slideId, elementId, (element) => ({ ...element, ...patch } as CardElement));
}

export function patchTextElement(
  deck: CardDeckV3,
  slideId: string,
  elementId: string,
  patch: Partial<Pick<TextElement, "text">> & { style?: Partial<TextElement["style"]> },
): CardDeckV3 {
  return mutateElement(deck, slideId, elementId, (element) => {
    if (element.type !== "text") return element;
    const style = { ...element.style, ...patch.style };
    if (patch.style?.font_size !== undefined) style.font_size = round(patch.style.font_size);
    return { ...element, ...patch, style };
  });
}

/** 카톡 원형과 legacy projection 글을 한 번에 바꿔 화면·저장본·PNG를 같은 값으로 유지한다. */
export function patchChatBubbleText(deck: CardDeckV3, slideId: string, bubbleId: string, text: string): CardDeckV3 {
  if (!text.trim()) throw new RangeError("CARD_CHAT_BUBBLE_TEXT_REQUIRED");
  if (text.length > 120) throw new RangeError("CARD_CHAT_BUBBLE_TEXT_TOO_LONG");
  return mutateSlide(deck, slideId, (slide) => {
    if (slide.base.kind !== "chat_bubble") return slide;
    const bubble = slide.base.bubbles.find((candidate) => candidate.id === bubbleId);
    if (!bubble) return slide;
    const currentText = bubble.segments.map((segment) => segment.text).join("");
    if (currentText === text) return slide;
    return {
      ...slide,
      base: {
        ...slide.base,
        bubbles: slide.base.bubbles.map((candidate) => candidate.id === bubbleId
          ? { ...candidate, segments: retextSegments(candidate.segments, text) }
          : candidate),
      },
      elements: slide.elements.filter((element) => !isChatBaseProjectionElement(slide, element)),
    };
  });
}

function normalizeBubbles(bubbles: Bubble[]): Bubble[] {
  return bubbles.map((bubble, order) => ({ ...bubble, order }));
}

function nextChatBubbleId(deck: CardDeckV3, explicitId?: string): string {
  if (explicitId) return explicitId;
  const ids = new Set(deck.slides.flatMap((slide) => slide.base.kind === "chat_bubble"
    ? slide.base.bubbles.map((bubble) => bubble.id)
    : []));
  let index = ids.size + 1;
  while (ids.has(`bubble_v3_${index}`)) index += 1;
  return `bubble_v3_${index}`;
}

function mutateChatSlide(
  deck: CardDeckV3,
  slideId: string,
  mutate: (bubbles: Bubble[], cover: CardSlideCover | null) => { bubbles: Bubble[]; cover?: CardSlideCover | null },
): CardDeckV3 {
  return mutateSlide(deck, slideId, (slide) => {
    if (slide.base.kind !== "chat_bubble") return slide;
    const next = mutate(structuredClone(slide.base.bubbles), structuredClone(slide.base.cover));
    return {
      ...slide,
      content_state: next.bubbles.length || next.cover?.headline.trim() ? "filled" : "empty",
      base: { ...slide.base, bubbles: normalizeBubbles(next.bubbles), cover: next.cover === undefined ? slide.base.cover : next.cover },
      elements: normalizeZ(slide.elements.filter((element) => !isChatBaseProjectionElement(slide, element))),
    };
  });
}

export function patchChatDeckBrand(deck: CardDeckV3, patch: Partial<CardDeckBrand>): CardDeckV3 {
  const brand = { ...deck.brand, ...patch };
  if (!brand.display_name.trim()) throw new RangeError("CARD_CHAT_BRAND_NAME_REQUIRED");
  if (JSON.stringify(brand) === JSON.stringify(deck.brand)) return clone(deck);
  return { ...clone(deck), revision: deck.revision + 1, brand };
}

export function patchChatSlideCover(deck: CardDeckV3, slideId: string, cover: CardSlideCover): CardDeckV3 {
  if (!cover.headline.trim()) throw new RangeError("CARD_CHAT_COVER_HEADLINE_REQUIRED");
  return mutateChatSlide(deck, slideId, (bubbles) => ({ bubbles, cover }));
}

export function addChatBubble(deck: CardDeckV3, slideId: string, explicitId?: string): CardDeckV3 {
  const id = nextChatBubbleId(deck, explicitId);
  return mutateChatSlide(deck, slideId, (bubbles) => ({
    bubbles: [...bubbles, {
      id,
      order: bubbles.length,
      speaker: bubbles.at(-1)?.speaker === "brand" ? "reader" : "brand",
      segments: [{ text: "새 말풍선", bold: false }],
      reaction: null,
    }],
  }));
}

export function deleteChatBubble(deck: CardDeckV3, slideId: string, bubbleId: string): CardDeckV3 {
  return mutateChatSlide(deck, slideId, (bubbles) => {
    if (bubbles.length <= 1) throw new RangeError("CARD_CHAT_BUBBLE_MIN_ONE");
    return { bubbles: bubbles.filter((bubble) => bubble.id !== bubbleId) };
  });
}

export function moveChatBubble(deck: CardDeckV3, slideId: string, bubbleId: string, delta: -1 | 1): CardDeckV3 {
  return mutateChatSlide(deck, slideId, (bubbles) => {
    const from = bubbles.findIndex((bubble) => bubble.id === bubbleId);
    const to = clamp(from + delta, 0, bubbles.length - 1);
    if (from < 0 || from === to) return { bubbles };
    const [bubble] = bubbles.splice(from, 1);
    bubbles.splice(to, 0, bubble);
    return { bubbles };
  });
}

export function moveChatBubbleToSlide(deck: CardDeckV3, sourceSlideId: string, bubbleId: string, targetSlideId: string): CardDeckV3 {
  if (sourceSlideId === targetSlideId) return clone(deck);
  const next = clone(deck);
  const source = next.slides.find((slide) => slide.id === sourceSlideId);
  const target = next.slides.find((slide) => slide.id === targetSlideId);
  if (source?.base.kind !== "chat_bubble" || target?.base.kind !== "chat_bubble") return next;
  if (source.base.bubbles.length <= 1) throw new RangeError("CARD_CHAT_BUBBLE_MIN_ONE");
  const index = source.base.bubbles.findIndex((bubble) => bubble.id === bubbleId);
  if (index < 0) return next;
  const [bubble] = source.base.bubbles.splice(index, 1);
  source.base.bubbles = normalizeBubbles(source.base.bubbles);
  target.base.bubbles = normalizeBubbles([...target.base.bubbles, bubble]);
  source.elements = normalizeZ(source.elements.filter((element) => !isChatBaseProjectionElement(source, element)));
  target.elements = normalizeZ(target.elements.filter((element) => !isChatBaseProjectionElement(target, element)));
  next.revision += 1;
  return next;
}

export function toggleChatBubbleSpeaker(deck: CardDeckV3, slideId: string, bubbleId: string): CardDeckV3 {
  return mutateChatSlide(deck, slideId, (bubbles) => ({
    bubbles: bubbles.map((bubble) => bubble.id === bubbleId
      ? { ...bubble, speaker: bubble.speaker === "brand" ? "reader" : "brand" }
      : bubble),
  }));
}

export function swapChatSpeakers(deck: CardDeckV3, slideId: string | null): CardDeckV3 {
  const next = clone(deck);
  let changed = false;
  next.slides = next.slides.map((slide) => {
    if (slide.base.kind !== "chat_bubble" || (slideId && slide.id !== slideId)) return slide;
    changed = changed || slide.base.bubbles.length > 0;
    return {
      ...slide,
      base: {
        ...slide.base,
        bubbles: slide.base.bubbles.map((bubble) => ({ ...bubble, speaker: bubble.speaker === "brand" ? "reader" as const : "brand" as const })),
      },
      elements: normalizeZ(slide.elements.filter((element) => !isChatBaseProjectionElement(slide, element))),
    };
  });
  if (changed) next.revision += 1;
  return next;
}

export function toggleChatBubbleBold(deck: CardDeckV3, slideId: string, bubbleId: string): CardDeckV3 {
  return mutateChatSlide(deck, slideId, (bubbles) => ({
    bubbles: bubbles.map((bubble) => {
      if (bubble.id !== bubbleId) return bubble;
      const bold = !bubble.segments.every((segment) => segment.bold);
      return { ...bubble, segments: bubble.segments.map((segment) => ({ ...segment, bold })) };
    }),
  }));
}

export function toggleChatBubbleReaction(deck: CardDeckV3, slideId: string, bubbleId: string): CardDeckV3 {
  return mutateChatSlide(deck, slideId, (bubbles) => ({
    bubbles: bubbles.map((bubble) => bubble.id === bubbleId
      ? { ...bubble, reaction: bubble.reaction === "heart" ? null : "heart" as const }
      : bubble),
  }));
}

export function splitChatBubble(deck: CardDeckV3, slideId: string, bubbleId: string): CardDeckV3 {
  const id = nextChatBubbleId(deck);
  return mutateChatSlide(deck, slideId, (bubbles) => {
    const index = bubbles.findIndex((bubble) => bubble.id === bubbleId);
    if (index < 0) return { bubbles };
    const source = bubbles[index];
    const text = source.segments.map((segment) => segment.text).join("");
    if (text.length < 2) throw new RangeError("CARD_CHAT_BUBBLE_TOO_SHORT_TO_SPLIT");
    const offset = Math.ceil(text.length / 2);
    const first = { ...source, segments: retextSegments(source.segments, text.slice(0, offset)) };
    const second = { ...source, id, segments: retextSegments(source.segments, text.slice(offset)) };
    return { bubbles: [...bubbles.slice(0, index), first, second, ...bubbles.slice(index + 1)] };
  });
}

export function mergeChatBubbleWithNext(deck: CardDeckV3, slideId: string, bubbleId: string): CardDeckV3 {
  return mutateChatSlide(deck, slideId, (bubbles) => {
    const index = bubbles.findIndex((bubble) => bubble.id === bubbleId);
    if (index < 0 || index >= bubbles.length - 1) throw new RangeError("CARD_CHAT_BUBBLE_NEXT_REQUIRED");
    const source = bubbles[index];
    const next = bubbles[index + 1];
    const text = `${source.segments.map((segment) => segment.text).join("")} ${next.segments.map((segment) => segment.text).join("")}`;
    if (text.length > 120) throw new RangeError("CARD_CHAT_BUBBLE_TEXT_TOO_LONG");
    const merged = { ...source, segments: retextSegments(source.segments, text) };
    return { bubbles: [...bubbles.slice(0, index), merged, ...bubbles.slice(index + 2)] };
  });
}

export function moveCardElement(deck: CardDeckV3, slideId: string, elementId: string, x: number, y: number): CardDeckV3 {
  return mutateElement(deck, slideId, elementId, (element) => ({ ...element, ...clampedPosition(element, x, y, deck.ratio) }));
}

export function nudgeCardElement(deck: CardDeckV3, slideId: string, elementId: string, dx: number, dy: number): CardDeckV3 {
  return mutateElement(deck, slideId, elementId, (element) => ({
    ...element,
    ...clampedPosition(element, element.x + dx, element.y + dy, deck.ratio),
  }));
}

export function setCardElementGeometry(
  deck: CardDeckV3,
  slideId: string,
  elementId: string,
  patch: Partial<Pick<CardElement, "width" | "height" | "rotation">>,
): CardDeckV3 {
  return mutateElement(deck, slideId, elementId, (element) => {
    const width = Number.isFinite(patch.width) ? Math.max(4, patch.width!) : element.width;
    const height = Number.isFinite(patch.height) ? Math.max(4, patch.height!) : element.height;
    const rotation = Number.isFinite(patch.rotation) ? snapRotation(patch.rotation!, true) : element.rotation;
    const resized = { ...element, width: round(width), height: round(height), rotation };
    return { ...resized, ...clampedPosition(resized, resized.x, resized.y, deck.ratio) };
  });
}

export function resizeCardElement(
  deck: CardDeckV3,
  slideId: string,
  elementId: string,
  handle: ResizeHandle,
  dx: number,
  dy: number,
): CardDeckV3 {
  return mutateElement(deck, slideId, elementId, (element) => {
    let { x, y, width, height } = element;
    if (handle.includes("e")) width = Math.max(4, width + dx);
    if (handle.includes("s")) height = Math.max(4, height + dy);
    if (handle.includes("w")) {
      const nextWidth = Math.max(4, width - dx);
      x += width - nextWidth;
      width = nextWidth;
    }
    if (handle.includes("n")) {
      const nextHeight = Math.max(4, height - dy);
      y += height - nextHeight;
      height = nextHeight;
    }
    return { ...element, x: round(x), y: round(y), width: round(width), height: round(height) };
  });
}

export function snapRotation(angle: number, fine: boolean): number {
  const normalized = ((angle + 180) % 360 + 360) % 360 - 180;
  return round(fine ? normalized : Math.round(normalized / CARD_ROTATION_SNAP) * CARD_ROTATION_SNAP);
}

export function rotateCardElement(deck: CardDeckV3, slideId: string, elementId: string, angle: number, fine = false): CardDeckV3 {
  return patchCardElement(deck, slideId, elementId, { rotation: snapRotation(angle, fine) });
}

export function snapCardElementPosition(
  element: CardElement,
  x: number,
  y: number,
  siblings: CardElement[],
  ratio: CardDeckV3["ratio"],
): SnappedPosition {
  const stageHeight = CARD_LOGICAL_HEIGHT[ratio];
  const movingX = [x, x + element.width / 2, x + element.width];
  const movingY = [y, y + element.height / 2, y + element.height];
  const candidatesX: Array<{ value: number; source: "stage" | "element" }> = [{ value: CARD_LOGICAL_WIDTH / 2, source: "stage" }];
  const candidatesY: Array<{ value: number; source: "stage" | "element" }> = [{ value: stageHeight / 2, source: "stage" }];
  siblings.filter((candidate) => candidate.id !== element.id && !candidate.hidden).forEach((candidate) => {
    candidatesX.push(
      { value: candidate.x, source: "element" },
      { value: candidate.x + candidate.width / 2, source: "element" },
      { value: candidate.x + candidate.width, source: "element" },
    );
    candidatesY.push(
      { value: candidate.y, source: "element" },
      { value: candidate.y + candidate.height / 2, source: "element" },
      { value: candidate.y + candidate.height, source: "element" },
    );
  });

  let snappedX = x;
  let snappedY = y;
  const guides: SnapGuide[] = [];
  let bestX = CARD_SNAP_DISTANCE + 1;
  let bestY = CARD_SNAP_DISTANCE + 1;
  candidatesX.forEach((candidate) => movingX.forEach((point) => {
    const distance = Math.abs(candidate.value - point);
    if (distance <= CARD_SNAP_DISTANCE && distance < bestX) {
      bestX = distance;
      snappedX = x + candidate.value - point;
      guides[0] = { axis: "x", value: candidate.value, source: candidate.source };
    }
  }));
  candidatesY.forEach((candidate) => movingY.forEach((point) => {
    const distance = Math.abs(candidate.value - point);
    if (distance <= CARD_SNAP_DISTANCE && distance < bestY) {
      bestY = distance;
      snappedY = y + candidate.value - point;
      const verticalIndex = guides[0]?.axis === "x" ? 1 : 0;
      guides[verticalIndex] = { axis: "y", value: candidate.value, source: candidate.source };
    }
  }));
  return { ...clampedPosition(element, snappedX, snappedY, ratio), guides };
}

export function moveCardElementLayer(deck: CardDeckV3, slideId: string, elementId: string, direction: LayerDirection): CardDeckV3 {
  return mutateSlide(deck, slideId, (slide) => {
    const elements = [...slide.elements].sort((left, right) => left.z_index - right.z_index);
    const from = elements.findIndex((element) => element.id === elementId);
    if (from < 0) return slide;
    const to = direction === "front" ? elements.length - 1
      : direction === "back" ? 0
        : direction === "forward" ? clamp(from + 1, 0, elements.length - 1)
          : clamp(from - 1, 0, elements.length - 1);
    const [element] = elements.splice(from, 1);
    elements.splice(to, 0, element);
    return { ...slide, elements: normalizeZ(elements) };
  });
}

export function toggleCardElementFlag(deck: CardDeckV3, slideId: string, elementId: string, flag: "locked" | "hidden"): CardDeckV3 {
  return mutateElement(deck, slideId, elementId, (element) => ({ ...element, [flag]: !element[flag] }));
}

export function duplicateCardElement(deck: CardDeckV3, slideId: string, elementId: string, duplicateId: string): CardDeckV3 {
  return mutateSlide(deck, slideId, (slide) => {
    const source = slide.elements.find((element) => element.id === elementId);
    if (!source) return slide;
    const duplicate = { ...clone(source), id: duplicateId, name: `${source.name} 복사`, x: source.x + 24, y: source.y + 24, locked: false, z_index: slide.elements.length };
    return { ...slide, elements: [...slide.elements, duplicate] };
  });
}

export function deleteCardElement(deck: CardDeckV3, slideId: string, elementId: string): CardDeckV3 {
  return mutateSlide(deck, slideId, (slide) => ({ ...slide, elements: normalizeZ(slide.elements.filter((element) => element.id !== elementId)) }));
}

export function createCardCommandHistory(deck: CardDeckV3): CardCommandHistory {
  return { past: [], present: clone(deck), future: [] };
}

export function commitCardCommand(history: CardCommandHistory, next: CardDeckV3): CardCommandHistory {
  if (JSON.stringify(history.present) === JSON.stringify(next)) return history;
  return { past: [...history.past, clone(history.present)].slice(-CARD_HISTORY_LIMIT), present: clone(next), future: [] };
}

export function undoCardCommand(history: CardCommandHistory): CardCommandHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return { past: history.past.slice(0, -1), present: clone(previous), future: [clone(history.present), ...history.future].slice(0, CARD_HISTORY_LIMIT) };
}

export function redoCardCommand(history: CardCommandHistory): CardCommandHistory {
  const next = history.future[0];
  if (!next) return history;
  return { past: [...history.past, clone(history.present)].slice(-CARD_HISTORY_LIMIT), present: clone(next), future: history.future.slice(1) };
}
