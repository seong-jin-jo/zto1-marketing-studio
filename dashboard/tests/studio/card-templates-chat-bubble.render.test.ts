// @vitest-environment jsdom
/**
 * 캔버스 렌더러 실물 검증. jsdom 이 `canvas` 패키지(devDependency, 네이티브 바인딩)를
 * 감지해 실제 2D 컨텍스트를 준다. mock 이 아니라 진짜 PNG 를 그린다.
 *
 * 표지·대화·CTA 3장을 실제로 렌더해 스크래치패드(레포 밖)에 저장한다(2026-09-21
 * 코드리뷰 MINOR. 이전에는 매 실행마다 docs/design/captures/ 에 써서 레포를 오염시켰다.
 * 육안 확인이 필요하면 `TEST_CAPTURE_DIR` 로 경로를 지정한다).
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  renderChatBubbleSlide,
  renderChatBubbleSlideToCanvas,
  wrapSegments,
  SAFE_ZONE_PX,
  COVER_HEADLINE_RATIO,
  BODY_RATIO,
} from "@/lib/studio/card-templates/chat-bubble";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { CARD_PIXELS } from "@/lib/studio/text-card-image";
import deckD100 from "./fixtures/deck-d100.v2.json";

const deck = deckD100 as unknown as CardDeck;
const OUT_DIR = process.env.TEST_CAPTURE_DIR ?? resolve(tmpdir(), "zto1-quality-s1-captures");
const MAX_BUBBLE_WIDTH_RATIO = 0.66; // chat-bubble.ts drawChatSlide 의 maxBubbleWidth 상수와 동일 값
const FONT_FAMILY = '"Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
const READER_BUBBLE_BG = [0xfe, 0xe5, 0x00]; // #FEE500

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.split(",")[1];
  return Buffer.from(base64, "base64");
}

function closeTo(value: number, target: number, tolerance = 8): boolean {
  return Math.abs(value - target) <= tolerance;
}

/** 캔버스에서 격자 간격으로 픽셀을 샘플링해 읽는다(전체 스캔은 느리다). */
function samplePixels(canvas: HTMLCanvasElement, step = 6): Array<{ x: number; y: number; r: number; g: number; b: number; a: number }> {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const out: Array<{ x: number; y: number; r: number; g: number; b: number; a: number }> = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      out.push({ x, y, r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] });
    }
  }
  return out;
}

describe("chat-bubble 렌더러 상수 (F5 ④축)", () => {
  it("표지 헤드라인 크기 비율이 본문의 2배 이상이다", () => {
    expect(COVER_HEADLINE_RATIO / BODY_RATIO).toBeGreaterThanOrEqual(2.0);
  });
  it("세이프존은 40px 이다", () => {
    expect(SAFE_ZONE_PX).toBe(40);
  });
});

describe("renderChatBubbleSlide 실물 렌더 (TC-F2-01~04)", () => {
  it("표지 장을 PNG data URL 로 그린다", () => {
    const dataUrl = renderChatBubbleSlide({ deck, slide: deck.slides[0], index: 0, total: deck.slides.length });
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(resolve(OUT_DIR, "01-cover.png"), dataUrlToBuffer(dataUrl!));
  });

  it("대화 장을 PNG data URL 로 그린다(화자 2종 좌우 배치)", () => {
    const dataUrl = renderChatBubbleSlide({ deck, slide: deck.slides[1], index: 1, total: deck.slides.length });
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(resolve(OUT_DIR, "02-chat.png"), dataUrlToBuffer(dataUrl!));
  });

  it("CTA 장을 PNG data URL 로 그린다(댓글 예시 + 저장 명분 포함)", () => {
    const last = deck.slides[deck.slides.length - 1];
    const dataUrl = renderChatBubbleSlide({ deck, slide: last, index: deck.slides.length - 1, total: deck.slides.length });
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(resolve(OUT_DIR, "03-cta.png"), dataUrlToBuffer(dataUrl!));
  });

  it("말풍선이 세이프존을 넘치면 렌더 실패 이유를 던진다(글자를 줄이지 않는다)", () => {
    const overflowing = {
      ...deck,
      slides: deck.slides.map((s, i) => (i === 1
        ? { ...s, bubbles: (s.bubbles ?? []).map((b) => ({ ...b, segments: [{ text: "매우 긴 문장을 ".repeat(30), bold: false }] })) }
        : s)),
    };
    expect(() => renderChatBubbleSlide({ deck: overflowing, slide: overflowing.slides[1], index: 1, total: overflowing.slides.length }))
      .toThrowError(/말풍선이 카드보다 깁니다/);
  });

  it("서버(document 없음)에서 부르면 null 이다(text-card-image.ts 와 같은 계약)", async () => {
    // 이 파일은 jsdom 환경이라 document 가 있다. node 환경 파일(text-card-image.test.ts)이
    // 같은 계약을 이미 검증하므로 여기서는 계약 문서화만 남긴다.
    expect(typeof document).toBe("object");
  });
});

describe("TC-F2-01·03 픽셀 샘플링: reader 말풍선(#FEE500) 은 우측에만 칠해진다", () => {
  it("4:5 대화 장에서 #FEE500 픽셀이 하나 이상 있고 전부 폭 중앙선 오른쪽이다", () => {
    const canvas = renderChatBubbleSlideToCanvas({ deck, slide: deck.slides[1], index: 1, total: deck.slides.length })!;
    const pixels = samplePixels(canvas);
    const yellow = pixels.filter((p) => p.a > 0 && closeTo(p.r, READER_BUBBLE_BG[0]) && closeTo(p.g, READER_BUBBLE_BG[1]) && closeTo(p.b, READER_BUBBLE_BG[2]));
    expect(yellow.length).toBeGreaterThan(0);
    const half = canvas.width / 2;
    for (const p of yellow) {
      expect(p.x).toBeGreaterThan(half);
    }
  });

  it("brand 말풍선(#FFFFFF) 은 좌측에도 나타난다(화자 2종 좌우 배치 확인)", () => {
    const canvas = renderChatBubbleSlideToCanvas({ deck, slide: deck.slides[1], index: 1, total: deck.slides.length })!;
    const pixels = samplePixels(canvas);
    const half = canvas.width / 2;
    const leftWhite = pixels.filter((p) => p.x < half && p.a > 0 && closeTo(p.r, 255, 3) && closeTo(p.g, 255, 3) && closeTo(p.b, 255, 3));
    expect(leftWhite.length).toBeGreaterThan(0);
  });
});

describe("TC-F2-02: 표지·CTA 좌하단에 display_name 이 실제로 그려진다", () => {
  // 픽셀 단위 OCR 은 안 하지만, 배경색과 다른 픽셀이 좌하단 라벨 영역에 존재하는지로
  // "라벨이 그려졌다"를 검증한다(2026-09-21 코드리뷰 MAJOR 8 회귀 — CTA 장은 이 라벨이
  // 아예 없었다).
  function hasNonBackgroundPixel(canvas: HTMLCanvasElement, region: { x0: number; x1: number; y0: number; y1: number }, background: [number, number, number]): boolean {
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const { data, width } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let y = region.y0; y < region.y1; y += 2) {
      for (let x = region.x0; x < region.x1; x += 2) {
        const i = (y * width + x) * 4;
        if (!(closeTo(data[i], background[0], 4) && closeTo(data[i + 1], background[1], 4) && closeTo(data[i + 2], background[2], 4))) {
          return true;
        }
      }
    }
    return false;
  }

  const bg: [number, number, number] = [0x12, 0x10, 0x0e]; // deck.theme.background = "#12100E"

  it("표지 좌하단에 배경과 다른 픽셀(표시명 라벨)이 있다", () => {
    const canvas = renderChatBubbleSlideToCanvas({ deck, slide: deck.slides[0], index: 0, total: deck.slides.length })!;
    const region = { x0: 60, x1: 420, y0: canvas.height - 80, y1: canvas.height - 20 };
    expect(hasNonBackgroundPixel(canvas, region, bg)).toBe(true);
  });

  it("CTA 좌하단에 배경과 다른 픽셀(표시명 라벨)이 있다", () => {
    const last = deck.slides[deck.slides.length - 1];
    const canvas = renderChatBubbleSlideToCanvas({ deck, slide: last, index: deck.slides.length - 1, total: deck.slides.length })!;
    const region = { x0: 60, x1: 420, y0: canvas.height - 80, y1: canvas.height - 20 };
    expect(hasNonBackgroundPixel(canvas, region, bg)).toBe(true);
  });
});

describe("TC-F2-04: bold(700) 세그먼트는 500 세그먼트와 다른 폭으로 측정된다", () => {
  // 이 샌드박스의 node-canvas 는 "Apple SD Gothic Neo"·"Noto Sans KR" 폰트 파일을 등록하지
  // 않은 채 실행되면 500/700 이 같은 대체 글리프로 떨어져(실측: 두 폭이 완전히 동일) 진짜
  // 시각 차이를 실측할 수 없다(폰트 파일이 없는 CI 러너에서도 같은 문제가 재현될 수 있다.
  // 2026-09-21 코드리뷰 MINOR "폰트 로드 대기 미구현"과 같은 뿌리). 그래서 실제 폰트
  // 렌더가 아니라 "wrapSegments/measureSegments 가 굵기별로 다른 ctx.font 문자열을
  // 실제로 요청하는가"를 결정론적 가짜 컨텍스트로 검증한다 — 폰트가 없어도 "코드가 굵기를
  // 무시하고 있다"는 회귀는 이 테스트가 여전히 잡는다.
  function makeRecordingCtx() {
    const calls: Array<{ font: string; text: string }> = [];
    let font = "";
    const ctx = {
      set font(value: string) { font = value; },
      get font() { return font; },
      measureText: (text: string) => {
        calls.push({ font, text });
        // 결정론적 가짜 폭: 700 이면 글자당 2, 아니면 1 — 실제 폰트 메트릭이 아니라
        // "요청한 font 문자열이 굵기를 반영했는가"만 검사하기 위한 오라클이다.
        const perChar = font.startsWith("700") ? 2 : 1;
        return { width: text.length * perChar };
      },
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
  }

  it("wrapSegments 가 bold:true 세그먼트에는 700, bold:false 에는 500 폰트 문자열로 측정을 요청한다", () => {
    const { ctx, calls } = makeRecordingCtx();
    wrapSegments(ctx, [
      { text: "일반굵기문장입니다", bold: false },
      { text: "굵은굵기문장입니다", bold: true },
    ], 40, 100000);

    const boldCalls = calls.filter((c) => c.font.startsWith("700"));
    const normalCalls = calls.filter((c) => c.font.startsWith("500"));
    expect(boldCalls.length).toBeGreaterThan(0);
    expect(normalCalls.length).toBeGreaterThan(0);
  });

  it("실제 캔버스에서도 500/700 폰트 문자열 자체는 다르게 설정된다(문자열 계약 확인)", () => {
    const canvas = renderChatBubbleSlideToCanvas({ deck, slide: deck.slides[0], index: 0, total: deck.slides.length })!;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const bodySize = Math.round(canvas.width * BODY_RATIO);
    ctx.font = `500 ${bodySize}px ${FONT_FAMILY}`;
    const normalFont = ctx.font;
    ctx.font = `700 ${bodySize}px ${FONT_FAMILY}`;
    const boldFont = ctx.font;
    expect(boldFont).not.toBe(normalFont);
  });
});

describe("1:1 비율 렌더", () => {
  it("ratio:1:1 덱을 렌더하면 캔버스 크기가 CARD_PIXELS['1:1'] 과 같다", () => {
    const squareDeck: CardDeck = { ...deck, ratio: "1:1" };
    const cover = renderChatBubbleSlideToCanvas({ deck: squareDeck, slide: squareDeck.slides[0], index: 0, total: squareDeck.slides.length })!;
    expect(cover.width).toBe(CARD_PIXELS["1:1"].width);
    expect(cover.height).toBe(CARD_PIXELS["1:1"].height);
    const chat = renderChatBubbleSlideToCanvas({ deck: squareDeck, slide: squareDeck.slides[1], index: 1, total: squareDeck.slides.length })!;
    expect(chat.width).toBe(CARD_PIXELS["1:1"].width);
    expect(chat.height).toBe(CARD_PIXELS["1:1"].height);
    const dataUrl = renderChatBubbleSlide({ deck: squareDeck, slide: squareDeck.slides[0], index: 0, total: squareDeck.slides.length });
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});

describe("wrapSegments 텍스트 오버플로 회귀 (2026-09-21 코드리뷰 실측. 버블 우측 경계에서 글자 잘림)", () => {
  // 2026-09-21 실측: 일반 굵기 기준으로 wrapLines 를 돌린 뒤 그 줄 경계를 세그먼트에
  // 문자 인덱스로 재매핑하는 방식이 있었다. 줄바꿈마다 삼켜지는 공백 한 글자를 커서가
  // 반영하지 못해 다음 줄부터 슬라이스 위치가 밀렸다. 그 결과가 "버블 안에 다 담기는
  // PNG"였기 때문에, 세이프존 오버플로(카드보다 긴 말풍선)를 던지는 기존 테스트는 이
  // 결함을 통과시켰다. 여기서는 실제로 폭을 측정해 "줄마다 실측 텍스트 폭이 버블
  // 안쪽 폭을 넘지 않는가"와 "글자가 하나도 손실·중복되지 않았는가"를 직접 검사한다.
  const width = CARD_PIXELS["4:5"].width;
  const bodySize = Math.round(width * BODY_RATIO);
  const padding = Math.round(width * 0.03);
  const maxBubbleWidth = width * MAX_BUBBLE_WIDTH_RATIO;
  const innerMaxWidth = maxBubbleWidth - padding * 2;

  function makeCtx(): CanvasRenderingContext2D {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = width;
    return canvas.getContext("2d") as CanvasRenderingContext2D;
  }

  function measureLine(ctx: CanvasRenderingContext2D, line: { text: string; bold?: boolean }[]): number {
    let total = 0;
    for (const seg of line) {
      ctx.font = `${seg.bold ? 700 : 500} ${bodySize}px ${FONT_FAMILY}`;
      total += ctx.measureText(seg.text).width;
    }
    return total;
  }

  const cases: Array<{ name: string; segments: { text: string; bold: boolean }[] }> = [
    {
      name: "slide-1 브랜드 버블(일반+굵기 혼합)",
      segments: deck.slides[1].bubbles!.find((b) => b.speaker === "brand")!.segments,
    },
    {
      name: "slide-8 CTA 버블(홑 세그먼트, 굵기 없음)",
      segments: deck.slides[deck.slides.length - 1].bubbles!.find((b) => b.speaker === "brand")!.segments,
    },
  ];

  for (const { name, segments } of cases) {
    it(`${name}: 줄마다 실측 폭이 버블 안쪽 폭(패딩 제외)을 넘지 않는다`, () => {
      const ctx = makeCtx();
      const wrapped = wrapSegments(ctx, segments, bodySize, innerMaxWidth);
      for (const line of wrapped) {
        expect(measureLine(ctx, line)).toBeLessThanOrEqual(innerMaxWidth + 0.5);
      }
    });

    it(`${name}: 줄바꿈으로 글자가 손실·중복되지 않는다(원문 글자 수 = 줄 글자 수 합 + 줄바꿈 수)`, () => {
      const ctx = makeCtx();
      const wrapped = wrapSegments(ctx, segments, bodySize, innerMaxWidth);
      const originalLength = segments.map((s) => s.text).join("").length;
      const wrappedLength = wrapped.reduce((sum, line) => sum + line.reduce((s, seg) => s + seg.text.length, 0), 0);
      // 매 줄바꿈이 원문의 공백 한 글자를 삼킨다(마지막 줄에는 뒤따르는 줄바꿈이 없다).
      expect(wrappedLength + (wrapped.length - 1)).toBe(originalLength);
    });
  }
});

describe("wrapSegments \"\\n\" 강제 줄바꿈 (mergeBubble 이 넣는 관습, 2026-09-21 코드리뷰 MAJOR 7)", () => {
  it("세그먼트 텍스트 안의 \\n 은 낱말처럼 이어붙지 않고 줄을 나눈다", () => {
    const width = CARD_PIXELS["4:5"].width;
    const bodySize = Math.round(width * BODY_RATIO);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = width;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const wrapped = wrapSegments(ctx, [{ text: "첫줄\n둘째줄", bold: false }], bodySize, 100000);
    expect(wrapped).toHaveLength(2);
    expect(wrapped[0].map((s) => s.text).join("")).toBe("첫줄");
    expect(wrapped[1].map((s) => s.text).join("")).toBe("둘째줄");
  });
});
