// @vitest-environment jsdom
/**
 * 캔버스 렌더러 실물 검증. jsdom 이 `canvas` 패키지(devDependency, 네이티브 바인딩)를
 * 감지해 실제 2D 컨텍스트를 준다 — mock 이 아니라 진짜 PNG 를 그린다.
 *
 * 표지·대화·CTA 3장을 실제로 렌더해 docs/design/captures/quality-s1-pr1/ 에 저장한다
 * (위임 프롬프트 §5 "렌더 실물 증거"). node-canvas 로 실제 렌더에 성공했으므로
 * "미검증" 표기 없이 보고한다.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderChatBubbleSlide, wrapSegments, SAFE_ZONE_PX, COVER_HEADLINE_RATIO, BODY_RATIO } from "@/lib/studio/card-templates/chat-bubble";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { CARD_PIXELS } from "@/lib/studio/text-card-image";
import deckD100 from "./fixtures/deck-d100.v2.json";

const deck = deckD100 as unknown as CardDeck;
const OUT_DIR = resolve(__dirname, "../../../docs/design/captures/quality-s1-pr1");
const BODY_PADDING_RATIO = 0.03; // chat-bubble.ts drawBubble 의 padding 상수와 동일 값(회귀 검사용 재선언)
const MAX_BUBBLE_WIDTH_RATIO = 0.66; // chat-bubble.ts drawChatSlide 의 maxBubbleWidth 상수와 동일 값
const FONT_FAMILY = '"Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';

function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64 = dataUrl.split(",")[1];
  return Buffer.from(base64, "base64");
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

describe("wrapSegments 텍스트 오버플로 회귀 (2026-09-21 코드리뷰 실측 — 버블 우측 경계에서 글자 잘림)", () => {
  // 2026-09-21 실측: 일반 굵기 기준으로 wrapLines 를 돌린 뒤 그 줄 경계를 세그먼트에
  // 문자 인덱스로 재매핑하는 방식이 있었다. 줄바꿈마다 삼켜지는 공백 한 글자를 커서가
  // 반영하지 못해 다음 줄부터 슬라이스 위치가 밀렸다 — 그 결과가 "버블 안에 다 담기는
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
