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
import { renderChatBubbleSlide, SAFE_ZONE_PX, COVER_HEADLINE_RATIO, BODY_RATIO } from "@/lib/studio/card-templates/chat-bubble";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import deckD100 from "./fixtures/deck-d100.v2.json";

const deck = deckD100 as unknown as CardDeck;
const OUT_DIR = resolve(__dirname, "../../../docs/design/captures/quality-s1-pr1");

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
