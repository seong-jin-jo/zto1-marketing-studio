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
export const BODY_RATIO = 0.036; // 본문 글자 폭 3.6%. COVER_HEADLINE_RATIO / BODY_RATIO ≥ 2.0 (F5 ④축)

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
 * 실제로 그리는 곳. 테스트가 픽셀을 직접 샘플링할 수 있게 캔버스 자체를 돌려준다
 * (TC-F2-01·03, 2026-09-21 코드리뷰 MAJOR 9). `renderChatBubbleSlide` 는 이 함수 위에
 * data URL 계약만 얹는다.
 */
/**
 * `slide.cover_image_url`을 브라우저 Image로 불러온다(J1, 2026-09-22 코드리뷰: 표지·CTA
 * 사진 선택이 저장만 되고 렌더러에 안 갔다는 지적). 못 불러오면(네트워크·CORS·8초 타임아웃)
 * null을 돌려주고 호출부는 배경색으로 조용히 물러난다 — 사진 하나 실패로 카드 전체 렌더가
 * 죽으면 안 된다(플랫 배경이 원래 기본값이었다).
 */
function loadCoverImage(url: string): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

/**
 * cover-fit으로 캔버스 전체를 채우고, 그 위에 글자가 읽히도록 하단이 짙어지는 스크림을
 * 얹는다(벤치마크 REF: "풀블리드 실사 + 하단 그라데이션 + 흰 볼드 2줄").
 */
function drawBackgroundPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, width: number, height: number): void {
  const scale = Math.max(width / img.width, height / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  ctx.drawImage(img, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  const gradient = ctx.createLinearGradient(0, height * 0.35, 0, height);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export async function renderChatBubbleSlideToCanvas(input: ChatBubbleRenderInput): Promise<HTMLCanvasElement | null> {
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

  let hasPhoto = false;
  if ((slide.role === "cover" || slide.role === "cta") && slide.cover_image_url) {
    const img = await loadCoverImage(slide.cover_image_url);
    if (img) {
      drawBackgroundPhoto(ctx, img, width, height);
      hasPhoto = true;
    }
  }

  if (slide.role === "cover") {
    drawCover(ctx, deck, slide, width, height, index, total, hasPhoto);
  } else {
    drawChatSlide(ctx, deck, slide, width, height, index, total);
  }

  return canvas;
}

/**
 * 한 장을 그려 PNG data URL 로 돌려준다. 브라우저에서만 부른다(canvas 필요). 서버에서
 * 부르면 null. 말풍선이 세이프존을 넘으면 글자를 줄이지 않고 렌더 실패로 이유를 던진다
 * ("3번 장 말풍선이 카드보다 깁니다. 쪼개세요". DESIGN.md "장이 안 담기면 나눈다").
 */
export async function renderChatBubbleSlide(input: ChatBubbleRenderInput): Promise<string | null> {
  const canvas = await renderChatBubbleSlideToCanvas(input);
  return canvas ? canvas.toDataURL("image/png") : null;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  deck: CardDeck,
  slide: CardSlide,
  width: number,
  height: number,
  index: number,
  total: number,
  hasPhoto = false,
): void {
  const headline = slide.cover?.headline ?? "";
  const sub = slide.cover?.sub ?? "";
  const margin = Math.max(SAFE_ZONE_PX, Math.round(width * 0.1));
  const maxWidth = width - margin * 2;

  // 사진 배경 위에서는 테마 전경색 대신 흰 글자로 고정한다(drawBackgroundPhoto의 하단
  // 그라데이션과 짝 — 벤치마크 REF "흰 볼드 2줄").
  ctx.fillStyle = hasPhoto ? "#FFFFFF" : deck.theme.foreground;
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

  drawBrandFooterLabel(ctx, deck, width, height, margin);
  drawPageNumber(ctx, deck, width, height, margin, index, total);
}

/**
 * 좌하단 브랜드 표시명(FR-08 AC "표지·CTA 에 좌하단 표시명, 우하단 페이지 번호").
 * 표지와 CTA 장이 공유한다(2026-09-21 코드리뷰 MAJOR 8. CTA 장은 이 라벨이 빠져 있었다).
 */
function drawBrandFooterLabel(
  ctx: CanvasRenderingContext2D,
  deck: CardDeck,
  width: number,
  height: number,
  margin: number,
): void {
  ctx.font = `600 ${Math.round(width * COVER_BRAND_RATIO)}px ${FONT_FAMILY}`;
  ctx.fillStyle = deck.theme.accent;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const brandLabel = deck.brand.handle ? `${deck.brand.display_name} ${deck.brand.handle}` : deck.brand.display_name;
  // 세이프존(SAFE_ZONE_PX) 을 밑변에서 실제로 보장한다. 이전에는 margin*0.6 만큼만 띄워
  // margin 이 65px 일 때 바닥에서 39px(<SAFE_ZONE_PX) 로 세이프존을 어겼다(2026-09-21
  // 코드리뷰 MINOR. 상수는 있는데 실배치에 안 걸림).
  ctx.fillText(brandLabel, margin, height - Math.max(SAFE_ZONE_PX, margin * 0.6));
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

  // 채팅 헤더. 설계 §5 F2 표 "높이 폭 8%". 폭(width) 기준이지 세로(height) 기준이 아니다
  // (2026-09-21 코드리뷰 MINOR. height*ratio 로 잘못 계산돼 있었다. 4:5 비율에서는
  // height>width 라 헤더가 설계보다 25% 더 두꺼워졌다).
  const headerHeight = width * CHAT_HEADER_RATIO;
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
    drawBrandFooterLabel(ctx, deck, width, height, margin);
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

  // reaction:"heart". 계약 필드가 어디에도 그려지지 않던 결함(2026-09-21 코드리뷰 MINOR).
  // 말풍선 바깥쪽 아래 모서리에 작게 찍는다(카카오톡 하트 리액션 관습 위치).
  if (bubble.reaction === "heart") {
    const heartSize = Math.round(bodySize * 0.9);
    ctx.font = `${heartSize}px ${FONT_FAMILY}`;
    ctx.textAlign = isReader ? "right" : "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = READER_BUBBLE_BG;
    const heartX = isReader ? x + bubbleWidth : x;
    ctx.fillText("♥", heartX, top + bubbleHeight + 2);
  }

  return bubbleHeight;
}

/** 굵기가 붙은 한 글자. wrapSegments 가 줄바꿈 계산을 이 단위로 직접 한다(위치 재매핑 없음). */
type BoldChar = { ch: string; bold: boolean };

function toBoldChars(segments: Segment[]): BoldChar[] {
  const chars: BoldChar[] = [];
  for (const segment of segments) {
    for (const ch of segment.text) chars.push({ ch, bold: !!segment.bold });
  }
  return chars;
}

/** 연속한 굵기 조각 폭을 합산 측정한다(굵기가 바뀔 때만 font 를 바꿔 잰다). */
function measureBoldChars(ctx: CanvasRenderingContext2D, chars: BoldChar[], size: number): number {
  let total = 0;
  let i = 0;
  while (i < chars.length) {
    const bold = chars[i].bold;
    let text = "";
    while (i < chars.length && chars[i].bold === bold) {
      text += chars[i].ch;
      i += 1;
    }
    ctx.font = `${bold ? 700 : 500} ${size}px ${FONT_FAMILY}`;
    total += ctx.measureText(text).width;
  }
  return total;
}

/** 굵기가 섞인 글자 배열을 세그먼트 배열로 되접는다(연속 동일 굵기를 한 세그먼트로). */
function boldCharsToSegments(chars: BoldChar[]): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  while (i < chars.length) {
    const bold = chars[i].bold;
    let text = "";
    while (i < chars.length && chars[i].bold === bold) {
      text += chars[i].ch;
      i += 1;
    }
    segments.push({ text, bold });
  }
  return segments.length ? segments : [{ text: "", bold: false }];
}

/**
 * 세그먼트 배열을 줄바꿈 단위로 쪼갠다. text-card-image.ts 의 wrapLines 와 같은 낱말 우선·
 * 글자 단위 폴백 알고리즘을 굵기가 붙은 글자 배열 위에서 직접 돌린다. "일반 굵기로 줄을
 * 나눈 뒤 그 경계를 세그먼트에 재매핑"하는 방식은 줄바꿈이 삼키는 공백 한 글자만큼 매 줄
 * 커서가 밀려 다음 줄부터 글자가 잘리거나 중복되는 버그가 있었다(2026-09-21 실측: 굵은
 * 세그먼트가 없는 홑 세그먼트 말풍선에서도 재현. 굵기 문제가 아니라 커서 드리프트였다).
 */
/**
 * 세그먼트 배열을 줄바꿈 단위로 쪼갠다(단락 하나). "\n" 은 별도 처리하지 않는다 .
 * 호출부(wrapSegments)가 "\n" 마다 이 함수를 나눠 부른다.
 */
function wrapParagraph(ctx: CanvasRenderingContext2D, chars: BoldChar[], size: number, maxWidth: number): BoldChar[][] {
  const words: BoldChar[][] = [];
  let word: BoldChar[] = [];
  for (const c of chars) {
    if (c.ch === " ") {
      words.push(word);
      word = [];
    } else {
      word.push(c);
    }
  }
  words.push(word);

  const lines: BoldChar[][] = [];
  let current: BoldChar[] = [];
  for (const w of words) {
    const candidate = current.length ? [...current, { ch: " ", bold: false }, ...w] : w;
    if (measureBoldChars(ctx, candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current.length) {
      lines.push(current);
      current = [];
    }
    let piece: BoldChar[] = [];
    for (const c of w) {
      if (piece.length && measureBoldChars(ctx, [...piece, c], size) > maxWidth) {
        lines.push(piece);
        piece = [];
      }
      piece.push(c);
    }
    current = piece;
  }
  lines.push(current);
  return lines;
}

export function wrapSegments(ctx: CanvasRenderingContext2D, segments: Segment[], size: number, maxWidth: number): Segment[][] {
  const chars = toBoldChars(segments);

  // "\n" 은 강제 줄바꿈이다(mergeBubble 이 합칠 때 넣는 관습, 표지가 이미 headline 에서
  // split("\n") 하는 것과 같은 취급. 2026-09-21 코드리뷰 MAJOR 7. 이전에는 "\n" 을 낱말
  // 경계로 보지 않아 일반 글자처럼 측정·렌더돼 줄바꿈 없이 이어지고 빈 글리프가 생겼다).
  const paragraphs: BoldChar[][] = [];
  let paragraph: BoldChar[] = [];
  for (const c of chars) {
    if (c.ch === "\n") {
      paragraphs.push(paragraph);
      paragraph = [];
    } else {
      paragraph.push(c);
    }
  }
  paragraphs.push(paragraph);

  const lines: BoldChar[][] = paragraphs.flatMap((p) => wrapParagraph(ctx, p, size, maxWidth));

  const result = lines.map(boldCharsToSegments);
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
  // drawBrandFooterLabel 과 같은 세이프존 보정(2026-09-21 코드리뷰 MINOR).
  ctx.fillText(page, width - margin, height - Math.max(SAFE_ZONE_PX, margin * 0.6));
}
