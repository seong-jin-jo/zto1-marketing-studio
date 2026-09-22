// @vitest-environment jsdom
/**
 * F7(2026-09-22 코드리뷰 3차): cover_image_url을 세팅한 슬라이드를 렌더하는 테스트가
 * 레포에 0건이었다. loadCoverImage·drawBackgroundPhoto·hasPhoto 신규 코드(J1/F2/F3)를
 * 실제로 검증한다. 실물 PNG를 스크래치패드(레포 밖)에 남겨 육안으로도 확인할 수 있게
 * 한다(card-templates-chat-bubble.render.test.ts와 같은 관습).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { Image as NodeCanvasImage } from "canvas";
import { renderChatBubbleSlideToCanvas, ChatBubbleRenderError } from "@/lib/studio/card-templates/chat-bubble";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import deckD100 from "./fixtures/deck-d100.v2.json";

const deck = deckD100 as unknown as CardDeck;
const OUT_DIR = process.env.TEST_CAPTURE_DIR ?? resolve(tmpdir(), "zto1-quality-s1-captures");

/**
 * jsdom의 `Image`는 리소스 로딩이 기본으로 꺼져 있어(resources 옵션 없음) data: URL이든
 * 뭐든 onload/onerror가 절대 안 온다 — 8초 타임아웃만 매번 친다. 실제 브라우저에서는
 * Image가 정상 동작한다(이건 jsdom의 한계지 chat-bubble.ts의 결함이 아니다). node-canvas가
 * 제공하는 실제 동작하는 Image로 전역을 교체해, 이 테스트만큼은 진짜 이미지 디코딩·
 * onload/onerror 경로를 태운다(node -e로 실측: data URL은 동기적으로 onload가 온다).
 */
beforeAll(() => {
  // @ts-expect-error -- node-canvas Image가 DOM lib의 HTMLImageElement 타입과 완전히
  // 같지 않지만, chat-bubble.ts의 loadCoverImage가 쓰는 표면(onload/onerror/src)은 같다.
  globalThis.Image = NodeCanvasImage;
});

function dataUrlToBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** 40x50 단색 테스트 사진을 data URL로 만든다(네트워크 없이 loadCoverImage를 태운다). */
function makeTestPhotoDataUrl(hex: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 40; canvas.height = 50;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 40, 50);
  return canvas.toDataURL("image/png");
}

function countDistinctColors(canvas: HTMLCanvasElement, step = 400): number {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const colors = new Set<string>();
  for (let i = 0; i < data.length; i += step) {
    colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  }
  return colors.size;
}

describe("J1/F2/F3: 표지·CTA 사진 렌더", () => {
  it("표지 장에 cover_image_url을 넣으면 캔버스가 순수 테마 배경보다 다양한 색으로 그려진다(사진이 실제로 그려졌다는 증거)", async () => {
    const withPhoto: CardDeck = {
      ...deck,
      slides: deck.slides.map((s, i) => (i === 0 ? { ...s, cover_image_url: makeTestPhotoDataUrl("#3355aa") } : s)),
    };
    const canvas = await renderChatBubbleSlideToCanvas({ deck: withPhoto, slide: withPhoto.slides[0], index: 0, total: withPhoto.slides.length });
    expect(canvas).not.toBeNull();
    expect(countDistinctColors(canvas!)).toBeGreaterThan(5);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(resolve(OUT_DIR, "04-cover-with-photo.png"), dataUrlToBuffer(canvas!.toDataURL("image/png")));
  });

  it("사진 없는 표지와 비교하면 색 다양성이 늘어난다(단색 배경 대비)", async () => {
    const withoutPhoto = await renderChatBubbleSlideToCanvas({ deck, slide: deck.slides[0], index: 0, total: deck.slides.length });
    const withPhotoDeck: CardDeck = {
      ...deck,
      slides: deck.slides.map((s, i) => (i === 0 ? { ...s, cover_image_url: makeTestPhotoDataUrl("#22aa77") } : s)),
    };
    const withPhoto = await renderChatBubbleSlideToCanvas({ deck: withPhotoDeck, slide: withPhotoDeck.slides[0], index: 0, total: withPhotoDeck.slides.length });
    expect(countDistinctColors(withPhoto!)).toBeGreaterThan(countDistinctColors(withoutPhoto!));
  });

  it("CTA(마지막) 장에 cover_image_url을 넣어도 렌더가 죽지 않고 말풍선·배경이 함께 그려진다(F2 대비 처리 대상)", async () => {
    const last = deck.slides[deck.slides.length - 1];
    const withPhoto: CardDeck = {
      ...deck,
      slides: deck.slides.map((s) => (s.id === last.id ? { ...s, cover_image_url: makeTestPhotoDataUrl("#aa3355") } : s)),
    };
    const canvas = await renderChatBubbleSlideToCanvas({ deck: withPhoto, slide: withPhoto.slides[withPhoto.slides.length - 1], index: withPhoto.slides.length - 1, total: withPhoto.slides.length });
    expect(canvas).not.toBeNull();
    expect(countDistinctColors(canvas!)).toBeGreaterThan(5);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(resolve(OUT_DIR, "05-cta-with-photo.png"), dataUrlToBuffer(canvas!.toDataURL("image/png")));
  });

  it("F3: 사진을 못 불러오면(깨진 data URL) 조용히 배경색으로 물러나지 않고 ChatBubbleRenderError를 던진다", async () => {
    const broken: CardDeck = {
      ...deck,
      // 네트워크 없이도 빠르게 onerror를 태우도록 형식이 깨진 data URL을 쓴다
      // (네트워크 의존 URL은 샌드박스/CI마다 타임아웃 시간이 달라 테스트가 불안정해진다).
      slides: deck.slides.map((s, i) => (i === 0 ? { ...s, cover_image_url: "data:image/png;base64,%%not-valid-base64%%" } : s)),
    };
    await expect(renderChatBubbleSlideToCanvas({ deck: broken, slide: broken.slides[0], index: 0, total: broken.slides.length }))
      .rejects.toThrow(ChatBubbleRenderError);
  }, 15000);

  it("cover_image_url이 없으면 렌더가 예전 그대로 성공한다(회귀 0 — 새 코드 경로를 안 탄다)", async () => {
    const canvas = await renderChatBubbleSlideToCanvas({ deck, slide: deck.slides[0], index: 0, total: deck.slides.length });
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBeGreaterThan(0);
  });
});
