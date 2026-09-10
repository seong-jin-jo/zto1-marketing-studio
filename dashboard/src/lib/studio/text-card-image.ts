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
export type CardRatio = "1:1" | "4:5" | "9:16" | "1.91:1" | "16:9";

/** 올릴 곳이 요구하는 실제 픽셀. 화면 크기가 아니라 이 값으로 그려야 흐리지 않다. */
export const CARD_PIXELS: Record<CardRatio, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
  "1.91:1": { width: 1200, height: 628 },
  "16:9": { width: 1920, height: 1080 },
};

export type CardTheme = { background: string; foreground: string; accent: string };

/** 기본 색. 브랜드 색을 아직 안 고른 작업 공간도 결과가 나와야 한다. */
export const DEFAULT_CARD_THEME: CardTheme = {
  background: "#12100E",
  foreground: "#F7F3EE",
  accent: "#E8843C",
};

/**
 * 학습 정보의 "브랜드 색" 칸에서 색을 읽는다.
 *
 * 그 칸은 "오렌지·베이지. 예: 오렌지와 베이지를 중심으로…" 처럼 사람 말로 저장된다.
 * 색 코드가 아니라 색 이름이다. 그래서 이름을 코드로 옮긴다. 못 알아본 이름은 버리고
 * 기본값을 쓴다. **모르는 색을 억지로 찍으면 브랜드가 아닌 색이 나간다.**
 */
const COLOR_WORDS: Record<string, string> = {
  "빨강": "#D7263D", "주황": "#E8843C", "오렌지": "#E8843C", "노랑": "#F2C14E",
  "초록": "#3E8E5A", "그린": "#3E8E5A", "파랑": "#2F6FED", "블루": "#2F6FED",
  "남색": "#1B3A6B", "보라": "#6B4E9B", "분홍": "#E37B9A", "핑크": "#E37B9A",
  "베이지": "#E8DCC8", "갈색": "#6B4A2F", "브라운": "#6B4A2F",
  "검정": "#12100E", "블랙": "#12100E", "흰색": "#F7F3EE", "화이트": "#F7F3EE",
  "회색": "#6E6A66", "그레이": "#6E6A66",
};

/** 배경이 밝으면 글자는 어둡게. 대비가 없으면 글자가 안 읽힌다. */
function readableOn(background: string): string {
  const hex = background.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // 사람 눈은 초록에 가장 민감하다. 단순 평균을 쓰면 노랑 배경에서 흰 글자가 나온다.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#12100E" : "#F7F3EE";
}

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

export type TextCardInput = {
  text: string;
  ratio: CardRatio;
  theme?: CardTheme;
  /** 몇 번째 장인지. 여러 장이면 사람은 순서를 먼저 찾는다. */
  index?: number;
  total?: number;
};

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
  const family = '"Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
  const measure = (text: string) => ctx.measureText(text).width;
  let lines: string[] = [];
  // 글이 길면 글자를 줄여 한 장에 담는다. 줄여도 안 담기면 그때 잘린다.
  for (;;) {
    ctx.font = `700 ${fontSize}px ${family}`;
    lines = wrapLines(measure, input.text.trim(), maxWidth);
    const blockHeight = lines.length * fontSize * 1.45;
    if (blockHeight <= height - margin * 2.4 || fontSize <= Math.round(width * 0.032)) break;
    fontSize -= 4;
  }

  ctx.fillStyle = theme.foreground;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const lineHeight = fontSize * 1.45;
  let y = Math.round((height - lines.length * lineHeight) / 2);
  for (const line of lines) {
    ctx.fillText(line, margin, y);
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
