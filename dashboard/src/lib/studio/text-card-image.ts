/**
 * 글자만으로 카드뉴스 그림을 만든다. 바깥 생성기가 없어도 된다.
 *
 * 2026-09-10 회장 지적: "왜 영상 이미지 등은 하나도 없냐."
 * 실측해 보니 카드뉴스 대표 이미지도 숏폼 영상도 전부 바깥 그림 생성기 하나를 거치는데,
 * 그 생성기가 서버에서 로그아웃 상태였다(`GENERATOR_UNAUTHENTICATED`). 그래서 **화면에
 * 그림이 한 장도 없다.**
 *
 * 진짜 문제는 로그아웃이 아니라 구조다. **볼 수 있는 결과물 전체가 바깥 기계 하나에 매달려
 * 있었다.** 그것이 자면 이 제품은 글자만 남는다. 카드뉴스를 파는 제품에서 그림 0장은 제품이
 * 아니다.
 *
 * 그런데 한국에서 도는 카드뉴스 상당수는 사진이 아니라 **색 배경에 글자**다. 그 형태는
 * 바깥 기계가 필요 없다. 브라우저가 직접 그리면 된다. 그래서 이것을 폴백이 아니라 **제
 * 몫을 하는 한 가지 형식**으로 만든다. 생성기가 살아 있어도 이쪽이 더 나은 경우가 많다.
 * 글자가 또렷하고, 브랜드 색이 정확하고, 즉시 나오고, 돈이 안 든다.
 *
 * 서버가 아니라 브라우저에서 그린다. 서버에 그림 라이브러리를 얹으면 배포가 무거워지고,
 * 정작 사용자는 미리보기와 결과가 다를까 봐 불안해한다. 화면에 보이는 그대로 내보낸다.
 */
import {
  COLOR_WORDS,
  DEFAULT_CARD_THEME,
  readableOn,
  type CardTheme,
} from "./text-card-image-theme";

export { DEFAULT_CARD_THEME } from "./text-card-image-theme";
export type { CardTheme } from "./text-card-image-theme";

export type CardRatio = "1:1" | "4:5" | "9:16" | "1.91:1" | "16:9";

/** 올릴 곳이 요구하는 실제 픽셀. 화면 크기가 아니라 이 값으로 그려야 흐리지 않다. */
export const CARD_PIXELS: Record<CardRatio, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "1.91:1": { width: 1200, height: 628 },
  "16:9": { width: 1920, height: 1080 },
};

/**
 * 학습 정보의 "브랜드 색" 칸에서 색을 읽는다.
 *
 * 그 칸은 "오렌지·베이지. 예: 오렌지와 베이지를 중심으로…" 처럼 사람 말로 저장된다.
 * 색 코드가 아니라 색 이름이다. 그래서 이름을 코드로 옮긴다. 못 알아본 이름은 버리고
 * 기본값을 쓴다. **모르는 색을 억지로 찍으면 브랜드가 아닌 색이 나간다.**
 */
export function themeFromPalette(palette: string | null | undefined): CardTheme {
  const source = String(palette ?? "").split("예:")[0];
  const found: string[] = [];
  for (const [word, code] of Object.entries(COLOR_WORDS)) {
    if (source.includes(word) && !found.includes(code)) found.push(code);
  }
  if (!found.length) return DEFAULT_CARD_THEME;
  const background = found[0];
  return {
    background,
    foreground: readableOn(background),
    // 두 번째 색이 있으면 그것을 강조로 쓴다. 없으면 글자색을 흐려 쓴다.
    accent: found[1] ?? readableOn(background),
  };
}

/**
 * 2026-10-03 독립 리뷰 MAJOR-8: 최소 글자 크기에서도 줄 수가 칸 높이를 넘으면 종전에는
 * 그대로 흘려보내 아래쪽 줄이 캔버스 밖으로 잘려 나갔다(실측: 캡션급 긴 문장). 캔버스
 * 없이도(측정 함수만 주고) 단위 테스트할 수 있게 떼어 뒀다. 들어갈 줄 수만큼만 보여주고
 * 마지막 줄에 "…"로 더 있음을 알린다 — 그 "…"를 붙여도 폭을 넘지 않게 글자 단위로 줄인다.
 */
export function capLinesToFit(
  lines: readonly string[],
  measure: (text: string) => number,
  maxWidth: number,
  maxLines: number,
): string[] {
  if (lines.length <= maxLines) return [...lines];
  const visible = lines.slice(0, Math.max(1, maxLines));
  let last = visible[visible.length - 1];
  while (last.length > 0 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
  visible[visible.length - 1] = `${last}…`;
  return visible;
}

/**
 * 렌더 레벨 마지막 방어선. 위 줄바꿈·자르기가 올바르게 동작했다면 어떤 줄도 최소 글자
 * 크기에서 칸 너비를 넘을 수 없다. 그래도 넘는 줄이 있으면(측정 불일치·회귀) 조용히
 * 내보내지 않고 바로 알린다 — "글자가 카드 밖으로 잘려 나간다"는 사고를 다시 반복하지
 * 않기 위함이다.
 */
export function assertLinesFitWidth(lines: readonly string[], measure: (text: string) => number, maxWidth: number): void {
  for (const line of lines) {
    if (measure(line) > maxWidth) {
      throw new Error(`글자 카드 렌더 결함: 줄 "${line.slice(0, 20)}…"이 최소 글자 크기에서도 카드 너비(${maxWidth}px)를 넘습니다.`);
    }
  }
}

/** 글자를 칸 너비에 맞춰 줄로 나눈다. 넘치면 잘리는 게 아니라 다음 줄로 간다. */
export function wrapLines(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const paragraph of String(text).split("\n")) {
    let current = "";
    // 한국어는 띄어쓰기가 드물어 낱말 단위로만 나누면 한 줄이 통째로 넘친다.
    // 낱말로 먼저 나누고, 그래도 넘치면 글자 단위로 자른다.
    for (const word of paragraph.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= maxWidth) { current = candidate; continue; }
      if (current) { out.push(current); current = ""; }
      let piece = "";
      for (const char of word) {
        if (measure(piece + char) > maxWidth && piece) { out.push(piece); piece = ""; }
        piece += char;
      }
      current = piece;
    }
    out.push(current);
  }
  return out;
}

/** 글자를 카드 어디에 앉힐지. 편집실의 상단·중앙·하단과 같은 값이다. */
export type CardTextVerticalPosition = "top" | "center" | "bottom";

/** 편집실 미리보기의 아홉 칸. 화면에서 고른 칸이 내보내는 그림의 칸과 같아야 한다. */
export type CardGridPosition =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export type CardTextPlacement = CardTextVerticalPosition | CardGridPosition;

const PLACEMENT_AXES: Record<CardTextPlacement, { row: CardTextVerticalPosition; col: "left" | "center" | "right" }> = {
  top: { row: "top", col: "center" },
  center: { row: "center", col: "center" },
  bottom: { row: "bottom", col: "center" },
  "top-left": { row: "top", col: "left" },
  "top-center": { row: "top", col: "center" },
  "top-right": { row: "top", col: "right" },
  "center-left": { row: "center", col: "left" },
  "center-right": { row: "center", col: "right" },
  "bottom-left": { row: "bottom", col: "left" },
  "bottom-center": { row: "bottom", col: "center" },
  "bottom-right": { row: "bottom", col: "right" },
};

export type TextCardInput = {
  text: string;
  ratio: CardRatio;
  theme?: CardTheme;
  /**
   * 편집실에서 사용자가 옮긴 글자 자리.
   *
   * 2026-09-14 실측: 편집실에서 글자를 위로 올려도 내보내는 그림은 늘 한가운데였다.
   * 화면에서 옮긴 것이 결과에 없으면 옮기는 기능은 없는 것과 같다.
   * 아홉 칸(왼쪽, 가운데, 오른쪽)도 같은 규칙이다. 미리보기만 옮기고 그림은
   * 가로를 무시하면, 옮긴 기능은 없는 것과 같다.
   */
  position?: CardTextPlacement;
  /** 몇 번째 장인지. 여러 장이면 사람은 순서를 먼저 찾는다. */
  index?: number;
  total?: number;
};

/**
 * 글자 덩어리를 카드 세로 어디에 놓을지 계산한다. 캔버스가 없어도 시험할 수 있게 떼어 뒀다.
 * 위·아래는 가장자리 여백 안쪽까지만 간다. 여백 밖으로 나가면 올릴 때 잘린다.
 */
export function cardTextTop(
  position: CardTextVerticalPosition,
  height: number,
  blockHeight: number,
  margin: number,
): number {
  if (position === "top") return Math.round(margin);
  if (position === "bottom") return Math.round(Math.max(margin, height - margin - blockHeight));
  // 글이 아주 길면 덩어리가 카드보다 커진다. 그때 가운데 값은 음수가 되어 첫 줄이 화면 위로
  // 잘려 나간다. 잘릴 바에는 위에서부터 보이는 편이 낫다.
  return Math.max(0, Math.round((height - blockHeight) / 2));
}

/** 편집실이 저장한 자리 문자열을 그리기 자리로 옮긴다. 모르는 값은 가운데다. */
export function placementFrom(position: string | undefined): CardTextPlacement {
  if (position && Object.prototype.hasOwnProperty.call(PLACEMENT_AXES, position)) {
    return position as CardTextPlacement;
  }
  return "center";
}

/**
 * 포인터가 카드의 어느 칸에 있는지. 세로는 물론 가로 세 칸도 구분한다.
 * relX, relY 는 카드 안에서 0 이상 1 이하다.
 */
export function cardPositionFromPoint(relX: number, relY: number): CardGridPosition {
  const x = Number.isFinite(relX) ? Math.min(1, Math.max(0, relX)) : 0.5;
  const y = Number.isFinite(relY) ? Math.min(1, Math.max(0, relY)) : 0.5;
  const col = x < 1 / 3 ? "left" : x > 2 / 3 ? "right" : "center";
  const row = y < 1 / 3 ? "top" : y > 2 / 3 ? "bottom" : "center";
  if (row === "center" && col === "center") return "center";
  return `${row}-${col}` as CardGridPosition;
}

/**
 * 글자 덩어리의 왼쪽 위. 세로만 바꾸면 왼쪽과 오른쪽을 고른 그림이 같다.
 * 블록 너비는 가장 긴 줄이다. 짧은 줄은 그 블록 안에서 왼쪽부터 그린다.
 */
export function cardTextOrigin(
  position: CardTextPlacement,
  width: number,
  height: number,
  blockWidth: number,
  blockHeight: number,
  margin: number,
): { x: number; y: number } {
  const axes = PLACEMENT_AXES[position] ?? PLACEMENT_AXES.center;
  const y = cardTextTop(axes.row, height, blockHeight, margin);
  const maxX = Math.max(margin, width - margin - blockWidth);
  const x = axes.col === "left"
    ? margin
    : axes.col === "right"
      ? maxX
      : Math.max(0, Math.round((width - blockWidth) / 2));
  return { x: Math.round(x), y };
}

/**
 * 카드 한 장을 그려 PNG data URL 로 돌려준다.
 * 브라우저에서만 부른다(canvas 필요). 서버에서 부르면 null 이다.
 */
export function renderTextCard(input: TextCardInput): string | null {
  if (typeof document === "undefined") return null;
  const { width, height } = CARD_PIXELS[input.ratio] ?? CARD_PIXELS["4:5"];
  const theme = input.theme ?? DEFAULT_CARD_THEME;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  // 가장자리 여백. 올릴 곳이 모서리를 덮는 일이 있어 글자를 끝까지 붙이지 않는다.
  const margin = Math.round(width * 0.1);
  const maxWidth = width - margin * 2;

  let fontSize = Math.round(width * 0.075);
  const minFontSize = Math.round(width * 0.032);
  const family = '"Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
  const measure = (text: string) => ctx.measureText(text).width;
  let lines: string[] = [];
  // 글이 길면 글자를 줄여 한 장에 담는다. 줄여도 안 담기면 그때 잘린다.
  for (;;) {
    ctx.font = `700 ${fontSize}px ${family}`;
    lines = wrapLines(measure, input.text.trim(), maxWidth);
    const blockHeight = lines.length * fontSize * 1.45;
    if (blockHeight <= height - margin * 2.4 || fontSize <= minFontSize) break;
    fontSize -= 4;
  }

  // 최소 글자 크기에서도 줄 수가 칸 높이를 넘으면 들어갈 만큼만 보여준다(위 capLinesToFit).
  ctx.font = `700 ${fontSize}px ${family}`;
  const lineHeight = fontSize * 1.45;
  const availableHeight = height - margin * 2.4;
  const maxLines = Math.max(1, Math.floor(availableHeight / lineHeight));
  lines = capLinesToFit(lines, measure, maxWidth, maxLines);

  // 렌더 레벨 마지막 방어선(assertLinesFitWidth) — 넘는 줄이 있으면 조용히 내보내지 않고
  // 바로 던진다.
  assertLinesFitWidth(lines, measure, maxWidth);

  ctx.fillStyle = theme.foreground;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const blockWidth = lines.reduce((widest, line) => Math.max(widest, measure(line)), 0);
  const origin = cardTextOrigin(
    input.position ?? "center",
    width,
    height,
    blockWidth,
    lines.length * lineHeight,
    margin,
  );
  let y = origin.y;
  for (const line of lines) {
    ctx.fillText(line, origin.x, y);
    y += lineHeight;
  }

  if (input.total && input.total > 1) {
    ctx.font = `600 ${Math.round(width * 0.032)}px ${family}`;
    ctx.fillStyle = theme.accent;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`${(input.index ?? 0) + 1} / ${input.total}`, margin, height - margin * 0.6);
  }

  return canvas.toDataURL("image/png");
}
