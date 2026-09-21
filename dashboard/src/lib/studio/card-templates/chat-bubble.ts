/**
 * "채팅 말풍선형" 캔버스 렌더러. 벤치마크 v1 §2 기준 실물(D-EDU 카드컨셉13)을 03c 이식
 * 위에서 브라우저 캔버스로 그린다(설계 §5 F2).
 *
 * 레이아웃 상수는 1080 기준 % 값이다(4:5·1:1 공통, 세이프존 40px, 폰트 2종 이내, 색 3색
 * 이내 = 벤치마크 REF A-3 수치). 서버 렌더가 아니라 브라우저 canvas 인 이유는
 * text-card-image.ts 머리말이 이미 적은 이유와 같다: 미리보기와 결과가 달라지지 않게.
 */
import { CARD_PIXELS, type CardRatio, wrapLines } from "../text-card-image";
import type { Bubble, CardDeck, CardSlide, Segment } from "../card-deck-contract";
import { groupTurns } from "../card-deck-ops";

/** 세이프존(모든 배치가 이 안에 있어야 한다). */
export const SAFE_ZONE_PX = 40;

export const COVER_HEADLINE_RATIO = 0.075; // 표지 헤드라인 폭 7.5% 굵기 800
export const BODY_RATIO = 0.036; // 본문 글자 폭 3.6% — COVER_HEADLINE_RATIO / BODY_RATIO ≥ 2.0 (F5 ④축)

const CHAT_HEADER_RATIO = 0.08;
const BRAND_LABEL_RATIO = 0.032;
const BUBBLE_RADIUS_RATIO = 0.022;
const BUBBLE_NAME_LABEL_RATIO = 0.024;
const COVER_SUB_RATIO = 0.032;
const COVER_BRAND_RATIO = 0.026;
const PAGE_NUMBER_RATIO = 0.026;
const TIMESTAMP_RATIO = 0.022;
const FONT_FAMILY = '"Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';

const READER_BUBBLE_BG = "#FEE500";
const BRAND_BUBBLE_BG = "#FFFFFF";
const BUBBLE_TEXT = "#12100E";

export class ChatBubbleRenderError extends Error {}

export type ChatBubbleRenderInput = {
  deck: CardDeck;
  slide: CardSlide;
  index: number;
  total: number;
};

/**
 * 한 장을 그려 PNG data URL 로 돌려준다. 브라우저에서만 부른다(canvas 필요). 서버에서
 * 부르면 null. 말풍선이 세이프존을 넘으면 글자를 줄이지 않고 렌더 실패로 이유를 던진다
 * ("3번 장 말풍선이 카드보다 깁니다. 쪼개세요" — DESIGN.md "장이 안 담기면 나눈다").
 */
export function renderChatBubbleSlide(input: ChatBubbleRenderInput): string | null {
  if (typeof document === "undefined") return null;
  const { deck, slide, index, total } = input;
  const { width, height } = CARD_PIXELS[deck.ratio as CardRatio] ?? CARD_PIXELS["4:5"];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = deck.theme.background;
  ctx.fillRect(0, 0, width, height);

  if (slide.role === "cover") {
    drawCover(ctx, deck, slide, width, height, index, total);
  } else {
    drawChatSlide(ctx, deck, slide, width, height, index, total);
  }

  return canvas.toDataURL("image/png");
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  deck: CardDeck,
  slide: CardSlide,
  width: number,
  height: number,
  index: number,
  total: number,
): void {
  const headline = slide.cover?.headline ?? "";
  const sub = slide.cover?.sub ?? "";
  const margin = Math.max(SAFE_ZONE_PX, Math.round(width * 0.1));
  const maxWidth = width - margin * 2;

  ctx.fillStyle = deck.theme.foreground;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const headlineSize = Math.round(width * COVER_HEADLINE_RATIO);
  ctx.font = `800 ${headlineSize}px ${FONT_FAMILY}`;
  const lines = headline.split("\n").flatMap((line) => wrapLines((t) => ctx.measureText(t).width, line, maxWidth));
  if (lines.length > 3) {
    throw new ChatBubbleRenderError(`${index + 1}번 장 표지 문구가 3줄을 넘습니다. 줄여주세요.`);
  }
  const lineHeight = headlineSize * 1.3;
  const blockHeight = lines.length * lineHeight;
  let y = Math.max(margin, height - margin * 3.2 - blockHeight);
  for (const line of lines) {
    ctx.fillText(line, margin, y);
    y += lineHeight;
  }

  if (sub) {
    ctx.font = `600 ${Math.round(width * COVER_SUB_RATIO)}px ${FONT_FAMILY}`;
    ctx.fillStyle = deck.theme.accent;
    ctx.fillText(sub, margin, y + headlineSize * 0.2);
  }

  ctx.font = `600 ${Math.round(width * COVER_BRAND_RATIO)}px ${FONT_FAMILY}`;
  ctx.fillStyle = deck.theme.accent;
  ctx.textBaseline = "alphabetic";
  const brandLabel = deck.brand.handle ? `${deck.brand.display_name} ${deck.brand.handle}` : deck.brand.display_name;
  ctx.fillText(brandLabel, margin, height - margin * 0.6);

  drawPageNumber(ctx, deck, width, height, margin, index, total);
}

function drawChatSlide(
  ctx: CanvasRenderingContext2D,
  deck: CardDeck,
  slide: CardSlide,
  width: number,
  height: number,
  index: number,
  total: number,
): void {
  const margin = Math.max(SAFE_ZONE_PX, Math.round(width * 0.06));
  const maxBubbleWidth = width * 0.66;

  // 채팅 헤더
  const headerHeight = height * CHAT_HEADER_RATIO;
  ctx.font = `700 ${Math.round(width * BRAND_LABEL_RATIO)}px ${FONT_FAMILY}`;
  ctx.fillStyle = deck.theme.foreground;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(deck.brand.display_name, margin, headerHeight / 2);

  const turns = groupTurns(slide.bubbles ?? []);
  let y = headerHeight + margin * 0.5;
  const bottomLimit = height - margin - (slide.role === "cta" ? height * 0.14 : 0);

  for (const turn of turns) {
    const isReader = turn.speaker === "reader";
    if (!isReader) {
      // brand 이름 라벨
      ctx.font = `600 ${Math.round(width * BUBBLE_NAME_LABEL_RATIO)}px ${FONT_FAMILY}`;
      ctx.fillStyle = deck.theme.accent;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(deck.brand.display_name, margin, y);
      y += width * BUBBLE_NAME_LABEL_RATIO * 1.6;
    }
    for (const bubble of turn.bubbles) {
      const bubbleHeight = drawBubble(ctx, deck, bubble, isReader, width, margin, maxBubbleWidth, y);
      y += bubbleHeight + margin * 0.35;
      if (y > bottomLimit) {
        throw new ChatBubbleRenderError(`${index + 1}번 장 말풍선이 카드보다 깁니다. 쪼개세요.`);
      }
    }
    // 마지막 말풍선 옆 타임스탬프(03c 관습, 고정 문자열)
    ctx.font = `500 ${Math.round(width * TIMESTAMP_RATIO)}px ${FONT_FAMILY}`;
    ctx.fillStyle = deck.theme.accent;
    ctx.textAlign = isReader ? "right" : "left";
    ctx.fillText("오후 9:20", isReader ? width - margin : margin, y - margin * 0.2);
  }

  if (slide.role === "cta") {
    drawCtaFooter(ctx, deck, width, height, margin);
  }

  drawPageNumber(ctx, deck, width, height, margin, index, total);
}

/** 세그먼트를 조각마다 폰트를 바꿔가며 그린다. 반환값은 실제로 차지한 높이. */
function drawBubble(
  ctx: CanvasRenderingContext2D,
  deck: CardDeck,
  bubble: Bubble,
  isReader: boolean,
  width: number,
  margin: number,
  maxBubbleWidth: number,
  top: number,
): number {
  const bodySize = Math.round(width * BODY_RATIO);
  const padding = Math.round(width * 0.03);
  const lineHeight = bodySize * 1.4;
  const innerMaxWidth = maxBubbleWidth - padding * 2;

  const wrapped = wrapSegments(ctx, bubble.segments, bodySize, innerMaxWidth);
  const blockHeight = wrapped.length * lineHeight;
  const bubbleHeight = blockHeight + padding * 2;
  const bubbleWidth = Math.min(maxBubbleWidth, Math.max(...wrapped.map((line) => measureSegments(ctx, line, bodySize))) + padding * 2);

  const x = isReader ? width - margin - bubbleWidth : margin;
  const radius = width * BUBBLE_RADIUS_RATIO;

  ctx.fillStyle = isReader ? READER_BUBBLE_BG : BRAND_BUBBLE_BG;
  drawRoundedRect(ctx, x, top, bubbleWidth, bubbleHeight, radius);
  ctx.fill();

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  let lineY = top + padding;
  for (const line of wrapped) {
    let lineX = x + padding;
    for (const segment of line) {
      ctx.font = `${segment.bold ? 700 : 500} ${bodySize}px ${FONT_FAMILY}`;
      ctx.fillStyle = BUBBLE_TEXT;
      ctx.fillText(segment.text, lineX, lineY);
      lineX += ctx.measureText(segment.text).width;
    }
    lineY += lineHeight;
  }

  return bubbleHeight;
}

/** 세그먼트 배열을 줄바꿈 단위로 쪼갠다(굵기 차이를 반영한 측정으로 wrapLines 를 재사용). */
function wrapSegments(ctx: CanvasRenderingContext2D, segments: Segment[], size: number, maxWidth: number): Segment[][] {
  // 우선 일반 굵기 기준으로 줄바꿈 위치를 찾고, 그 경계에 맞춰 세그먼트를 재분배한다.
  const fullText = segments.map((s) => s.text).join("");
  ctx.font = `500 ${size}px ${FONT_FAMILY}`;
  const lines = wrapLines((t) => ctx.measureText(t).width, fullText, maxWidth);

  const result: Segment[][] = [];
  let cursor = 0;
  for (const line of lines) {
    const lineSegments: Segment[] = [];
    let remaining = line.length;
    let consumedInLine = 0;
    let segCursor = 0;
    for (const segment of segments) {
      const segStart = segCursor;
      const segEnd = segCursor + segment.text.length;
      segCursor = segEnd;
      const overlapStart = Math.max(segStart, cursor);
      const overlapEnd = Math.min(segEnd, cursor + remaining + consumedInLine);
      if (overlapStart < overlapEnd) {
        const text = segment.text.slice(overlapStart - segStart, overlapEnd - segStart);
        if (text) lineSegments.push({ text, bold: segment.bold });
        consumedInLine += text.length;
      }
    }
    cursor += line.length;
    result.push(lineSegments.length ? lineSegments : [{ text: line, bold: false }]);
  }
  return result.length ? result : [[{ text: "", bold: false }]];
}

function measureSegments(ctx: CanvasRenderingContext2D, segments: Segment[], size: number): number {
  let total = 0;
  for (const segment of segments) {
    ctx.font = `${segment.bold ? 700 : 500} ${size}px ${FONT_FAMILY}`;
    total += ctx.measureText(segment.text).width;
  }
  return total;
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCtaFooter(ctx: CanvasRenderingContext2D, deck: CardDeck, width: number, height: number, margin: number): void {
  const y = height - height * 0.14;
  ctx.font = `700 ${Math.round(width * BODY_RATIO)}px ${FONT_FAMILY}`;
  ctx.fillStyle = deck.theme.accent;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`댓글 예시: ${deck.cta.comment_example}`, margin, y);
  ctx.font = `500 ${Math.round(width * TIMESTAMP_RATIO)}px ${FONT_FAMILY}`;
  ctx.fillStyle = deck.theme.foreground;
  ctx.fillText(deck.cta.save_reason, margin, y + width * BODY_RATIO * 1.5);
}

function drawPageNumber(
  ctx: CanvasRenderingContext2D,
  deck: CardDeck,
  width: number,
  height: number,
  margin: number,
  index: number,
  total: number,
): void {
  ctx.font = `600 ${Math.round(width * PAGE_NUMBER_RATIO)}px ${FONT_FAMILY}`;
  ctx.fillStyle = deck.theme.accent;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  const page = `${String(index + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
  ctx.fillText(page, width - margin, height - margin * 0.6);
}
