import {
  CARD_LOGICAL_HEIGHT,
  CARD_LOGICAL_WIDTH,
  type CardDeckV3,
  type CardElement,
  type CardElementType,
  type CardSlideV3,
  type TextElement,
} from "./card-element-contract";

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

const clone = <T,>(value: T): T => structuredClone(value);
const round = (value: number) => Math.round(value * 1_000) / 1_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function clampedPosition(element: Pick<CardElement, "width" | "height">, x: number, y: number, ratio: CardDeckV3["ratio"]) {
  return {
    x: clamp(round(x), 1 - element.width, CARD_LOGICAL_WIDTH - 1),
    y: clamp(round(y), 1 - element.height, CARD_LOGICAL_HEIGHT[ratio] - 1),
  };
}

export function createPlainCardDeckV3(lines: string[], id = `deck_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`): CardDeckV3 {
  const source = lines.length >= 2 ? lines : [lines[0] || "첫 장", "저장하고 다시 확인하세요"];
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
    slides: source.slice(0, 11).map((line, index, all) => ({
      id: `slide_${id}_${index}`,
      order: index,
      role: index === 0 ? "cover" : index === all.length - 1 ? "cta" : "body",
      content_state: line.trim() ? "filled" : "empty",
      background: { kind: "solid", color: index === all.length - 1 ? "#111111" : "#FFF9F0" },
      base: { kind: "plain", lines: [line] },
      elements: [{
        ...createDefaultCardElement("text", { id: `el_text_${id}_${index}` }, 0),
        text: line,
        x: 120,
        y: 300,
        width: 840,
        height: 500,
        style: {
          font_family: "Pretendard Variable",
          font_size: index === 0 ? 76 : 60,
          font_weight: 700,
          line_height: 1.2,
          letter_spacing: 0,
          color: index === all.length - 1 ? "#FFFFFF" : "#111111",
          align: "center",
          vertical_align: "middle",
        },
      }],
    })) as CardDeckV3["slides"],
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
    return { ...element, ...patch, style: { ...element.style, ...patch.style } };
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
