/**
 * 카드 덱 계약 v2 — 말풍선·화자·볼드·훅·CTA 를 담을 자리.
 *
 * 저장 위치는 `drafts.payload.cardDeck` 이다(신규 테이블 없음, DDL 0건 · 결정.md
 * D-2026-09-21-2 OD-A 추천안). 지금 카드뉴스는 `editLines: string[]`(장당 문장 하나)라서
 * 화자도 볼드도 표지·CTA 역할도 실을 자리가 없었다(설계 §0 TL;DR). 이 계약이 그 자리다.
 *
 * 말풍선 본문은 HTML 문자열이 아니라 세그먼트 배열 `{text, bold}` 이다(D-2026-09-21-2
 * OD-C 추천안). 03c 원본은 `<strong>` HTML 을 그대로 저장했지만(697행 `rich()`), 캔버스는
 * HTML 을 못 그리고 `editor-handoff.ts` 의 `assetReference()` 는 이미 문자열을 불신해
 * `javascript:`/`data:` 스킴을 막는 관습이 있다. 구조화된 조각이면 XSS 표면이 0 이고
 * 렌더러가 파싱 없이 바로 그린다.
 *
 * 근거: docs/eng-design/osmu-quality-stage1-v1-claude-opus.md §3.2·§8 OD-A·OD-C.
 * 원본 UI 규약(화자·역할·CTA 문법): d-edu 03c-편집도구-통합.html + 02-컨셉13-카드덱.md.
 */
import crypto from "node:crypto";
import type { CardTheme } from "./text-card-image-theme";

export const CARD_DECK_CONTRACT_VERSION = "2.0" as const;

/** 2단계에 "photo_cover" 를 추가할 자리(설계 §3.2 주석). 지금은 두 종류만 실제로 그린다. */
export type CardTemplate = "plain" | "chat_bubble";

/** 표지는 항상 0번, CTA 는 항상 마지막. comment_prompt 는 정확히 1개. */
export type SlideRole = "cover" | "chat" | "comment_prompt" | "cta";

/** 03c 의 `student|mentor` 를 도메인 중립으로 바꿨다(02-컨셉13 "우=독자, 좌=브랜드"). */
export type Speaker = "reader" | "brand";

/** 표지 헤드라인 공식 3종. 벤치마크 REF A-3. */
export type HookType = "question" | "number" | "pain";

export type Segment = { text: string; bold: boolean };

export type Bubble = {
  id: string;
  order: number;
  speaker: Speaker;
  segments: Segment[];
  reaction: "heart" | null;
};

export type CardSlideCover = { headline: string; sub: string | null };

export type CardSlide = {
  id: string;
  order: number;
  role: SlideRole;
  /** role="cover" 일 때만 채운다. */
  cover?: CardSlideCover;
  /** role∈{chat,comment_prompt,cta} 일 때만 채운다. */
  bubbles?: Bubble[];
  /** 렌더·업로드 뒤 채워진다. 저장 전에는 null. */
  image_url: string | null;
  /** template="plain" 전용(기존 9칸 배치). chat_bubble 에서는 쓰지 않는다. */
  position?: "top" | "center" | "bottom";
};

export type CardDeckCta = { keyword: string; comment_example: string; save_reason: string };
export type CardDeckBrand = { display_name: string; handle: string | null };

export type CardDeck = {
  contract_version: typeof CARD_DECK_CONTRACT_VERSION;
  template: CardTemplate;
  ratio: "4:5" | "1:1";
  theme: CardTheme;
  brand: CardDeckBrand;
  hook_type: HookType;
  cta: CardDeckCta;
  slides: CardSlide[];
  /** 편집 연산마다 +1(editor-handoff 관습). */
  revision: number;
};

export class CardDeckValidationError extends Error {
  constructor(readonly rule: string, message: string) {
    super(message);
  }
}

const DASH_CHARS = ["—", "–"]; // —, –
const LINK_PATTERNS = [/https?:\/\//i, /www\./i, /\.com\b/i, /링크/, /프로필/];

function hasForbiddenDash(text: string): boolean {
  return DASH_CHARS.some((dash) => text.includes(dash));
}

function segmentsText(segments: Segment[]): string {
  return segments.map((segment) => segment.text).join("");
}

function bubbleText(bubble: Bubble): string {
  return segmentsText(bubble.segments);
}

function slideText(slide: CardSlide): string {
  if (slide.role === "cover") {
    return [slide.cover?.headline ?? "", slide.cover?.sub ?? ""].join("\n");
  }
  return (slide.bubbles ?? []).map(bubbleText).join("\n");
}

/**
 * 불변식 1~8을 전부 검사한다. 하나라도 깨지면 즉시 예외를 던진다(어느 규칙인지 담아서 —
 * 실수.md 2026-09-09 "실패는 이유를 데리고 나온다").
 */
export function validateCardDeck(deck: unknown): asserts deck is CardDeck {
  const d = record(deck, "cardDeck");

  if (d.contract_version !== CARD_DECK_CONTRACT_VERSION) {
    throw new CardDeckValidationError("contract_version", `cardDeck.contract_version must be "${CARD_DECK_CONTRACT_VERSION}"`);
  }
  if (d.template !== "plain" && d.template !== "chat_bubble") {
    throw new CardDeckValidationError("template", "cardDeck.template must be plain or chat_bubble");
  }
  if (d.ratio !== "4:5" && d.ratio !== "1:1") {
    throw new CardDeckValidationError("ratio", "cardDeck.ratio must be 4:5 or 1:1");
  }
  const theme = record(d.theme, "cardDeck.theme");
  for (const key of ["background", "foreground", "accent"] as const) {
    if (typeof theme[key] !== "string" || !theme[key]) {
      throw new CardDeckValidationError("theme", `cardDeck.theme.${key} must be a non-empty string`);
    }
  }
  const brand = record(d.brand, "cardDeck.brand");
  if (typeof brand.display_name !== "string" || !brand.display_name.trim()) {
    throw new CardDeckValidationError("brand", "cardDeck.brand.display_name must be a non-empty string");
  }
  if (brand.handle !== null && typeof brand.handle !== "string") {
    throw new CardDeckValidationError("brand", "cardDeck.brand.handle must be a string or null");
  }
  if (!["question", "number", "pain"].includes(d.hook_type as string)) {
    throw new CardDeckValidationError("hook_type", "cardDeck.hook_type must be question, number, or pain");
  }
  const cta = record(d.cta, "cardDeck.cta");
  if (typeof cta.keyword !== "string" || cta.keyword.length < 2 || cta.keyword.length > 8) {
    throw new CardDeckValidationError("cta", "cardDeck.cta.keyword must be 2-8 characters");
  }
  if (typeof cta.comment_example !== "string" || !cta.comment_example.trim()) {
    throw new CardDeckValidationError("cta", "cardDeck.cta.comment_example must be a non-empty string");
  }
  if (typeof cta.save_reason !== "string" || cta.save_reason.trim().length < 6) {
    throw new CardDeckValidationError("cta", "cardDeck.cta.save_reason must be at least 6 characters");
  }
  if (typeof d.revision !== "number" || !Number.isSafeInteger(d.revision) || d.revision < 0) {
    throw new CardDeckValidationError("revision", "cardDeck.revision must be a non-negative integer");
  }
  if (!Array.isArray(d.slides)) {
    throw new CardDeckValidationError("slides", "cardDeck.slides must be an array");
  }
  const slides = d.slides as CardSlide[];

  // 규칙 3: 장수 7~11.
  if (slides.length < 7 || slides.length > 11) {
    throw new CardDeckValidationError("slide_count", `cardDeck.slides must contain 7 to 11 slides (got ${slides.length})`);
  }
  // 규칙 1: order 0부터 연속.
  const orders = slides.map((s, i) => (s as { order?: unknown }).order ?? i);
  orders.forEach((order, index) => {
    if (order !== index) {
      throw new CardDeckValidationError("slide_order", `cardDeck.slides[${index}].order must be ${index} (got ${order})`);
    }
  });
  // 규칙 2: 역할 배치.
  const roles = slides.map((s) => s.role);
  if (roles[0] !== "cover") {
    throw new CardDeckValidationError("role_layout", "cardDeck.slides[0].role must be cover");
  }
  if (roles[roles.length - 1] !== "cta") {
    throw new CardDeckValidationError("role_layout", "cardDeck.slides[last].role must be cta");
  }
  const commentPromptCount = roles.filter((r) => r === "comment_prompt").length;
  if (commentPromptCount !== 1) {
    throw new CardDeckValidationError("role_layout", `cardDeck.slides must contain exactly 1 comment_prompt slide (got ${commentPromptCount})`);
  }
  const chatCount = roles.filter((r) => r === "chat").length;
  if (chatCount < 4) {
    throw new CardDeckValidationError("role_layout", `cardDeck.slides must contain at least 4 chat slides (got ${chatCount})`);
  }

  slides.forEach((slide, index) => {
    if (slide.role === "cover") {
      const cover = record(slide.cover, `cardDeck.slides[${index}].cover`);
      const headline = String(cover.headline ?? "");
      if (!headline.trim()) {
        throw new CardDeckValidationError("cover_headline", `cardDeck.slides[${index}].cover.headline must be non-empty`);
      }
      const lines = headline.split("\n");
      if (lines.length > 3) {
        throw new CardDeckValidationError("cover_lines", `cardDeck.slides[${index}].cover.headline must have at most 3 lines (got ${lines.length})`);
      }
      lines.forEach((line, lineIndex) => {
        if (line.length > 18) {
          throw new CardDeckValidationError("cover_lines", `cardDeck.slides[${index}].cover.headline line ${lineIndex + 1} has ${line.length} chars (max 18)`);
        }
      });
      if (LINK_PATTERNS.some((pattern) => pattern.test(headline))) {
        throw new CardDeckValidationError("cover_link", `cardDeck.slides[${index}].cover.headline contains a surface link`);
      }
      if (hasForbiddenDash(headline)) {
        throw new CardDeckValidationError("no_dash", `cardDeck.slides[${index}].cover.headline contains a forbidden dash`);
      }
      return;
    }

    // chat | comment_prompt | cta
    if (!Array.isArray(slide.bubbles) || slide.bubbles.length === 0) {
      throw new CardDeckValidationError("bubbles", `cardDeck.slides[${index}].bubbles must be a non-empty array`);
    }
    const bubbles = slide.bubbles;
    if (bubbles.length > 8) {
      throw new CardDeckValidationError("bubbles", `cardDeck.slides[${index}].bubbles must have at most 8 bubbles (got ${bubbles.length})`);
    }
    bubbles.forEach((bubble, bubbleIndex) => {
      if (bubble.order !== bubbleIndex) {
        throw new CardDeckValidationError("bubble_order", `cardDeck.slides[${index}].bubbles[${bubbleIndex}].order must be ${bubbleIndex}`);
      }
      if (bubble.speaker !== "reader" && bubble.speaker !== "brand") {
        throw new CardDeckValidationError("speaker", `cardDeck.slides[${index}].bubbles[${bubbleIndex}].speaker must be reader or brand`);
      }
      if (!Array.isArray(bubble.segments) || bubble.segments.length === 0) {
        throw new CardDeckValidationError("segments", `cardDeck.slides[${index}].bubbles[${bubbleIndex}].segments must be non-empty`);
      }
      const totalLength = segmentsText(bubble.segments).length;
      if (totalLength > 120) {
        throw new CardDeckValidationError("segments", `cardDeck.slides[${index}].bubbles[${bubbleIndex}] segments exceed 120 chars (got ${totalLength})`);
      }
      bubble.segments.forEach((segment, segmentIndex) => {
        if (typeof segment.text !== "string" || !segment.text) {
          throw new CardDeckValidationError("segments", `cardDeck.slides[${index}].bubbles[${bubbleIndex}].segments[${segmentIndex}].text must be non-empty`);
        }
        if (typeof segment.bold !== "boolean") {
          throw new CardDeckValidationError("segments", `cardDeck.slides[${index}].bubbles[${bubbleIndex}].segments[${segmentIndex}].bold must be boolean`);
        }
        if (/<[a-z][\s\S]*>/i.test(segment.text)) {
          throw new CardDeckValidationError("no_html", `cardDeck.slides[${index}].bubbles[${bubbleIndex}].segments[${segmentIndex}].text must not contain HTML`);
        }
      });
      if (hasForbiddenDash(bubbleText(bubble))) {
        throw new CardDeckValidationError("no_dash", `cardDeck.slides[${index}].bubbles[${bubbleIndex}] contains a forbidden dash`);
      }
    });

    // 규칙 5: 볼드 덩이 ≤1 (연속 묶음 기준).
    const boldChunks = countBoldChunks(bubbles);
    if (boldChunks > 1) {
      throw new CardDeckValidationError("bold_limit", `cardDeck.slides[${index}] has ${boldChunks} bold chunks (max 1)`);
    }

    if (slide.role === "chat") {
      // 규칙 4: 화자 두 종류 모두 등장.
      const speakers = new Set(bubbles.map((b) => b.speaker));
      if (speakers.size < 2) {
        throw new CardDeckValidationError("speaker_mix", `cardDeck.slides[${index}] must include both reader and brand bubbles`);
      }
    }

    if (slide.role === "cta") {
      const text = slideText(slide);
      if (!text.includes("댓글") || !text.includes(`'${cta.keyword}'`)) {
        throw new CardDeckValidationError("cta_keyword", `cardDeck cta slide must mention 댓글 and '${cta.keyword}'`);
      }
      if (LINK_PATTERNS.some((pattern) => pattern.test(text))) {
        throw new CardDeckValidationError("cta_link", "cardDeck cta slide contains a surface link");
      }
    }
  });
}

function countBoldChunks(bubbles: Bubble[]): number {
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

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new CardDeckValidationError(field, `${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function newBubbleId(): string {
  return crypto.randomUUID();
}

export function newSlideId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// 하위호환 투영: 덱 ↔ 기존 소비자용 납작한 줄 목록(§3.3).
// ---------------------------------------------------------------------------

export type ProjectionRef = { slideId: string; bubbleId: string | null };

export function deckProjection(deck: CardDeck): { lines: string[]; refs: ProjectionRef[] } {
  const lines: string[] = [];
  const refs: ProjectionRef[] = [];
  for (const slide of deck.slides) {
    if (slide.role === "cover") {
      lines.push(slide.cover?.headline ?? "");
      refs.push({ slideId: slide.id, bubbleId: null });
      continue;
    }
    for (const bubble of slide.bubbles ?? []) {
      lines.push(bubbleText(bubble));
      refs.push({ slideId: slide.id, bubbleId: bubble.id });
    }
  }
  return { lines, refs };
}

export class ProjectionMismatchError extends Error {}

/**
 * 투영을 역적용한다. 길이가 안 맞으면 throw(edit-bulk 계약과 동일 — 덮어쓰지 않는다).
 * 각 줄은 기존 볼드 마크를 보존한 채(같은 비율로 재분배) 텍스트만 바꾼다.
 */
export function applyProjection(deck: CardDeck, lines: string[], refs: ProjectionRef[]): CardDeck {
  const expected = deckProjection(deck);
  if (lines.length !== expected.lines.length || refs.length !== expected.refs.length) {
    throw new ProjectionMismatchError(`projection length mismatch: expected ${expected.lines.length}, got ${lines.length}`);
  }
  let cursor = 0;
  const slides = deck.slides.map((slide) => {
    if (slide.role === "cover") {
      const headline = lines[cursor];
      cursor += 1;
      return { ...slide, cover: { headline, sub: slide.cover?.sub ?? null } };
    }
    const bubbles = (slide.bubbles ?? []).map((bubble) => {
      const text = lines[cursor];
      cursor += 1;
      return { ...bubble, segments: retextSegments(bubble.segments, text) };
    });
    return { ...slide, bubbles };
  });
  return { ...deck, slides, revision: deck.revision + 1 };
}

/** 세그먼트의 원래 bold 비율을 유지하면서 새 텍스트로 재조립한다. */
function retextSegments(segments: Segment[], newText: string): Segment[] {
  const originalLength = segmentsText(segments).length;
  if (originalLength === 0 || segments.length === 1) {
    return [{ text: newText, bold: segments[0]?.bold ?? false }];
  }
  const ratio = newText.length / originalLength;
  const result: Segment[] = [];
  let consumed = 0;
  let cursor = 0;
  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;
    const rawLength = isLast ? newText.length - cursor : Math.round(segment.text.length * ratio);
    const length = Math.max(0, Math.min(rawLength, newText.length - cursor));
    const text = newText.slice(cursor, cursor + length);
    cursor += length;
    consumed += length;
    if (text) result.push({ text, bold: segment.bold });
  });
  if (!result.length) return [{ text: newText, bold: false }];
  return result;
}

// ---------------------------------------------------------------------------
// 구 초안 승격(FR-12): editLines/cardTextPositions → template:"plain" 덱.
// ---------------------------------------------------------------------------

export function upgradeLegacyDeck(
  editLines: string[],
  cardTextPositions: (string | undefined)[] | undefined,
  ratio: "4:5" | "1:1",
  theme: CardTheme,
): CardDeck {
  const kept = editLines.filter((line) => typeof line === "string" && line.trim().length > 0);
  const now = kept.length ? kept : [""];
  const slides: CardSlide[] = now.map((text, index) => ({
    id: newSlideId(),
    order: index,
    role: index === 0 ? "cover" : index === now.length - 1 ? "cta" : "chat",
    cover: index === 0 ? { headline: text, sub: null } : undefined,
    bubbles: index === 0 ? undefined : [{
      id: newBubbleId(),
      order: 0,
      speaker: "brand",
      segments: [{ text, bold: false }],
      reaction: null,
    }],
    image_url: null,
    position: (cardTextPositions?.[index] as CardSlide["position"]) ?? "center",
  }));
  return {
    contract_version: CARD_DECK_CONTRACT_VERSION,
    template: "plain",
    ratio,
    theme,
    brand: { display_name: "", handle: null },
    hook_type: "pain",
    cta: { keyword: "궁금해요", comment_example: "궁금해요", save_reason: "다음에 다시 보려고 저장해요" },
    slides,
    revision: 0,
  };
}
