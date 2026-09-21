/**
 * 카드 덱 계약 v2. 말풍선·화자·볼드·훅·CTA 를 담을 자리.
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

/**
 * 표지 헤드라인 줄당 최대 글자 수. 렌더 폭에서 역산한 값이다(2026-09-21 코드리뷰 MAJOR 2 .
 * 이전 값 18자는 렌더러 폭(`chat-bubble.ts` `COVER_HEADLINE_RATIO`=7.5%, 세로 마진 10%)과
 * 맞지 않아 저장은 통과하는데 렌더는 항상 3줄 초과로 throw 했다). 계산: 카드 폭 1080px
 * (4:5·1:1 공통, `CARD_PIXELS`), 좌우 마진 10%×2 = 216px → 표지 최대 폭 864px. 헤드라인
 * 글자 크기 = 1080×0.075 = 81px. 한글 글리프는 폭이 1em 에 가까워(공백 없는 조사 위주
 * 문장) 81px×10자 = 810px < 864px 로 굵기 800 에서도 여유가 남고, 11자부터는 891px 로
 * 넘친다. 그래서 상한을 10자로 잡는다. 이 값이 바뀌면 `chat-bubble.ts` 의 상수도 함께
 * 맞춰야 한다(두 파일이 렌더 폭을 각자 하드코딩하므로 계약이 깨지면 이 주석부터 갱신).
 */
export const COVER_HEADLINE_MAX_CHARS_PER_LINE = 10;

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

const HTML_PATTERN = /<[a-z][\s\S]*>/i;
const UNSAFE_URL_SCHEME = /^\s*(data|javascript|vbscript):/i;
const VALID_ROLES: SlideRole[] = ["cover", "chat", "comment_prompt", "cta"];
const VALID_REACTIONS = ["heart", null];
const VALID_POSITIONS = ["top", "center", "bottom", undefined];

const DECK_ALLOWED_KEYS = new Set([
  "contract_version", "template", "ratio", "theme", "brand", "hook_type", "cta", "slides", "revision",
]);
const SLIDE_ALLOWED_KEYS = new Set(["id", "order", "role", "cover", "bubbles", "image_url", "position"]);
const BUBBLE_ALLOWED_KEYS = new Set(["id", "order", "speaker", "segments", "reaction"]);

function assertNoUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, field: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new CardDeckValidationError("unknown_key", `${field} has an unknown key: ${key}`);
    }
  }
}

function assertNoHtml(text: string, field: string): void {
  if (HTML_PATTERN.test(text)) {
    throw new CardDeckValidationError("no_html", `${field} must not contain HTML`);
  }
}

/**
 * 불변식 1~8을 전부 검사한다. 하나라도 깨지면 즉시 예외를 던진다(어느 규칙인지 담아서 .
 * 실수.md 2026-09-09 "실패는 이유를 데리고 나온다").
 *
 * `template==="plain"` 은 FR-12 구 초안 승격(`upgradeLegacyDeck`) 전용 완화 트랙이다.
 * 9축 채점 대상인 "채팅 말풍선형" 구성 규칙(장 배치·화자 2종·CTA 문구)은 chat_bubble 에만
 * 적용하고, plain 은 구조 무결성(순서·id·HTML·줄표 등)만 검사한다(2026-09-21 코드리뷰
 * MAJOR 5. 승격 결과가 자기 자신의 validator 를 통과 못 하던 결함).
 */
export function validateCardDeck(deck: unknown): asserts deck is CardDeck {
  const d = record(deck, "cardDeck");
  assertNoUnknownKeys(d, DECK_ALLOWED_KEYS, "cardDeck");

  if (d.contract_version !== CARD_DECK_CONTRACT_VERSION) {
    throw new CardDeckValidationError("contract_version", `cardDeck.contract_version must be "${CARD_DECK_CONTRACT_VERSION}"`);
  }
  if (d.template !== "plain" && d.template !== "chat_bubble") {
    throw new CardDeckValidationError("template", "cardDeck.template must be plain or chat_bubble");
  }
  const isPlain = d.template === "plain";
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
  assertNoHtml(brand.display_name as string, "cardDeck.brand.display_name");
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
  assertNoHtml(cta.keyword as string, "cardDeck.cta.keyword");
  if (typeof cta.comment_example !== "string" || !cta.comment_example.trim()) {
    throw new CardDeckValidationError("cta", "cardDeck.cta.comment_example must be a non-empty string");
  }
  assertNoHtml(cta.comment_example as string, "cardDeck.cta.comment_example");
  if (typeof cta.save_reason !== "string" || cta.save_reason.trim().length < 6) {
    throw new CardDeckValidationError("cta", "cardDeck.cta.save_reason must be at least 6 characters");
  }
  assertNoHtml(cta.save_reason as string, "cardDeck.cta.save_reason");
  if (typeof d.revision !== "number" || !Number.isSafeInteger(d.revision) || d.revision < 0) {
    throw new CardDeckValidationError("revision", "cardDeck.revision must be a non-negative integer");
  }
  if (!Array.isArray(d.slides)) {
    throw new CardDeckValidationError("slides", "cardDeck.slides must be an array");
  }
  const slides = d.slides as CardSlide[];

  // 규칙 3: 장수 7~11 (chat_bubble 전용, plain 은 승격 원본 길이를 그대로 받는다).
  if (!isPlain && (slides.length < 7 || slides.length > 11)) {
    throw new CardDeckValidationError("slide_count", `cardDeck.slides must contain 7 to 11 slides (got ${slides.length})`);
  }
  if (slides.length < 2) {
    throw new CardDeckValidationError("slide_count", `cardDeck.slides must contain at least 2 slides (got ${slides.length})`);
  }
  // 규칙 1: order 0부터 연속.
  // order 누락을 index 로 조용히 보정하지 않는다(2026-09-21 코드리뷰 MINOR). undefined 는
  // 어떤 index 와도 같지 않으므로 아래 비교에서 그대로 slide_order 로 거부된다.
  const orders = slides.map((s) => (s as { order?: unknown }).order);
  orders.forEach((order, index) => {
    if (order !== index) {
      throw new CardDeckValidationError("slide_order", `cardDeck.slides[${index}].order must be ${index} (got ${order})`);
    }
  });
  // (a) slide.id: 문자열·유일.
  const slideIds = new Set<string>();
  slides.forEach((slide, index) => {
    const id = (slide as { id?: unknown }).id;
    if (typeof id !== "string" || !id) {
      throw new CardDeckValidationError("slide_id", `cardDeck.slides[${index}].id must be a non-empty string`);
    }
    if (slideIds.has(id)) {
      throw new CardDeckValidationError("slide_id", `cardDeck.slides[${index}].id is duplicated: ${id}`);
    }
    slideIds.add(id);
  });
  // 규칙 2: 역할 배치.
  const roles = slides.map((s) => s.role);
  roles.forEach((role, index) => {
    if (!VALID_ROLES.includes(role)) {
      throw new CardDeckValidationError("role", `cardDeck.slides[${index}].role must be one of ${VALID_ROLES.join("|")}`);
    }
  });
  if (roles[0] !== "cover") {
    throw new CardDeckValidationError("role_layout", "cardDeck.slides[0].role must be cover");
  }
  if (roles[roles.length - 1] !== "cta") {
    throw new CardDeckValidationError("role_layout", "cardDeck.slides[last].role must be cta");
  }
  if (!isPlain) {
    const commentPromptCount = roles.filter((r) => r === "comment_prompt").length;
    if (commentPromptCount !== 1) {
      throw new CardDeckValidationError("role_layout", `cardDeck.slides must contain exactly 1 comment_prompt slide (got ${commentPromptCount})`);
    }
    const chatCount = roles.filter((r) => r === "chat").length;
    if (chatCount < 4) {
      throw new CardDeckValidationError("role_layout", `cardDeck.slides must contain at least 4 chat slides (got ${chatCount})`);
    }
  }

  const bubbleIds = new Set<string>();
  slides.forEach((slide, index) => {
    assertNoUnknownKeys(slide as unknown as Record<string, unknown>, SLIDE_ALLOWED_KEYS, `cardDeck.slides[${index}]`);
    if (slide.position !== undefined && !VALID_POSITIONS.includes(slide.position)) {
      throw new CardDeckValidationError("position", `cardDeck.slides[${index}].position must be top, center, bottom, or omitted`);
    }
    if (slide.image_url !== null && slide.image_url !== undefined) {
      if (typeof slide.image_url !== "string" || UNSAFE_URL_SCHEME.test(slide.image_url)) {
        throw new CardDeckValidationError("image_url", `cardDeck.slides[${index}].image_url must be null or a safe URL`);
      }
    }

    if (slide.role === "cover") {
      const cover = record(slide.cover, `cardDeck.slides[${index}].cover`);
      const headline = String(cover.headline ?? "");
      if (!headline.trim()) {
        throw new CardDeckValidationError("cover_headline", `cardDeck.slides[${index}].cover.headline must be non-empty`);
      }
      assertNoHtml(headline, `cardDeck.slides[${index}].cover.headline`);
      if (cover.sub !== null && cover.sub !== undefined) {
        if (typeof cover.sub !== "string") {
          throw new CardDeckValidationError("cover_sub", `cardDeck.slides[${index}].cover.sub must be a string or null`);
        }
        assertNoHtml(cover.sub, `cardDeck.slides[${index}].cover.sub`);
      }
      if (!isPlain) {
        const lines = headline.split("\n");
        if (lines.length > 3) {
          throw new CardDeckValidationError("cover_lines", `cardDeck.slides[${index}].cover.headline must have at most 3 lines (got ${lines.length})`);
        }
        lines.forEach((line, lineIndex) => {
          if (line.length > COVER_HEADLINE_MAX_CHARS_PER_LINE) {
            throw new CardDeckValidationError("cover_lines", `cardDeck.slides[${index}].cover.headline line ${lineIndex + 1} has ${line.length} chars (max ${COVER_HEADLINE_MAX_CHARS_PER_LINE})`);
          }
        });
      }
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
      assertNoUnknownKeys(bubble as unknown as Record<string, unknown>, BUBBLE_ALLOWED_KEYS, `cardDeck.slides[${index}].bubbles[${bubbleIndex}]`);
      const id = (bubble as { id?: unknown }).id;
      if (typeof id !== "string" || !id) {
        throw new CardDeckValidationError("bubble_id", `cardDeck.slides[${index}].bubbles[${bubbleIndex}].id must be a non-empty string`);
      }
      if (bubbleIds.has(id)) {
        throw new CardDeckValidationError("bubble_id", `cardDeck.slides[${index}].bubbles[${bubbleIndex}].id is duplicated: ${id}`);
      }
      bubbleIds.add(id);
      if (bubble.order !== bubbleIndex) {
        throw new CardDeckValidationError("bubble_order", `cardDeck.slides[${index}].bubbles[${bubbleIndex}].order must be ${bubbleIndex}`);
      }
      if (bubble.speaker !== "reader" && bubble.speaker !== "brand") {
        throw new CardDeckValidationError("speaker", `cardDeck.slides[${index}].bubbles[${bubbleIndex}].speaker must be reader or brand`);
      }
      if (!VALID_REACTIONS.includes(bubble.reaction ?? null)) {
        throw new CardDeckValidationError("reaction", `cardDeck.slides[${index}].bubbles[${bubbleIndex}].reaction must be heart or null`);
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
        assertNoHtml(segment.text, `cardDeck.slides[${index}].bubbles[${bubbleIndex}].segments[${segmentIndex}].text`);
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

    if (!isPlain && slide.role === "chat") {
      // 규칙 4: 화자 두 종류 모두 등장.
      const speakers = new Set(bubbles.map((b) => b.speaker));
      if (speakers.size < 2) {
        throw new CardDeckValidationError("speaker_mix", `cardDeck.slides[${index}] must include both reader and brand bubbles`);
      }
    }

    if (!isPlain && slide.role === "cta") {
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

/**
 * `node:crypto` 를 값으로 import 하면 이 파일을 참조하는 클라이언트 체인(`card-deck.ts` →
 * `app/studio/page.tsx`)이 Turbopack 클라이언트 번들에서 깨진다(vercel/next.js#64464,
 * 2026-09-21 코드리뷰 MAJOR 3). `globalThis.crypto` 는 Node 19+·모든 브라우저에 있다.
 */
function randomId(): string {
  return globalThis.crypto.randomUUID();
}

export function newBubbleId(): string {
  return randomId();
}

export function newSlideId(): string {
  return randomId();
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
 * 투영을 역적용한다. 길이가 안 맞으면 throw(edit-bulk 계약과 동일. 덮어쓰지 않는다).
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

/**
 * 03c/구 초안의 9칸 배치 값("top-center" 등)을 계약의 3분류로 접는다. `CardSlide["position"]`
 * 타입은 `"top"|"center"|"bottom"` 뿐인데 옛 값을 그대로 캐스팅해 저장하면 타입이 거짓말을
 * 한다(2026-09-21 코드리뷰 MAJOR 5). prefix 로 접는다: "top-*" → "top", "bottom-*" → "bottom",
 * 그 외("center-*", "middle-*", 인식 불가)는 "center".
 */
function mapLegacyPosition(raw: string | undefined): CardSlide["position"] {
  if (!raw) return "center";
  if (raw.startsWith("top")) return "top";
  if (raw.startsWith("bottom")) return "bottom";
  return "center";
}

export function upgradeLegacyDeck(
  editLines: string[],
  cardTextPositions: (string | undefined)[] | undefined,
  ratio: "4:5" | "1:1",
  theme: CardTheme,
): CardDeck {
  const kept = editLines.filter((line) => typeof line === "string" && line.trim().length > 0);
  const source = kept.length ? kept : ["빈 카드"];
  // validateCardDeck 은 slides[0]=cover, slides[last]=cta 를 요구한다(장 1개짜리 초안이면
  // 같은 인덱스가 둘 다일 수 없으므로 최소 2장을 보장한다. 2026-09-21 코드리뷰 MAJOR 5).
  const lines = source.length >= 2 ? source : [...source, "댓글로 소감을 남겨주세요"];
  const slides: CardSlide[] = lines.map((text, index) => ({
    id: newSlideId(),
    order: index,
    role: index === 0 ? "cover" : index === lines.length - 1 ? "cta" : "chat",
    cover: index === 0 ? { headline: text, sub: null } : undefined,
    bubbles: index === 0 ? undefined : [{
      id: newBubbleId(),
      order: 0,
      speaker: "brand",
      segments: [{ text, bold: false }],
      reaction: null,
    }],
    image_url: null,
    position: mapLegacyPosition(cardTextPositions?.[index]),
  }));
  return {
    contract_version: CARD_DECK_CONTRACT_VERSION,
    template: "plain",
    // 워크스페이스 이름은 저장 시점에 서버가 채운다(설계 §5 F3 "brand 는 서버가 워크스페이스
    // 에서 채움"과 같은 관습). validateCardDeck 이 display_name 비어있음을 거부하므로(§3.2
    // 규칙) 승격 시점에는 자리표시 값을 채워 둔다. 2026-09-21 코드리뷰 MAJOR 5.
    brand: { display_name: "브랜드", handle: null },
    ratio,
    theme,
    hook_type: "pain",
    cta: { keyword: "궁금해요", comment_example: "궁금해요", save_reason: "다음에 다시 보려고 저장해요" },
    slides,
    revision: 0,
  };
}
