// @vitest-environment jsdom
/**
 * F7(2026-09-22 코드리뷰 3차): cover_image_url을 세팅한 슬라이드를 렌더하는 테스트가
 * 레포에 0건이었다. loadCoverImage·drawBackgroundPhoto·hasPhoto 신규 코드(J1/F2/F3)를
 * 실제로 검증한다. 실물 PNG를 스크래치패드(레포 밖)에 남겨 육안으로도 확인할 수 있게
 * 한다(card-templates-chat-bubble.render.test.ts와 같은 관습).
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { renderChatBubbleSlideToCanvas, ChatBubbleRenderError } from "@/lib/studio/card-templates/chat-bubble";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import deckD100 from "./fixtures/deck-d100.v2.json";

const deck = deckD100 as unknown as CardDeck;
const OUT_DIR = process.env.TEST_CAPTURE_DIR ?? resolve(tmpdir(), "zto1-quality-s1-captures");

/**
 * `canvas`는 네이티브 바인딩이라 optionalDependencies다(package.json). 배포 이미지
 * (Dockerfile FROM node:20-alpine, musl libc)에는 prebuilt binary가 없어 설치가 조용히
 * 빠진다 — CI(node:20-bookworm, glibc)에는 설치되니 CI는 통과하고 배포 typecheck:ci만
 * 죽었다(2026-09-22 핫픽스: 정적 import가 그 자리에서 "Cannot find module 'canvas'"를
 * 던졌다). 그래서 정적 import 대신 top-level await + try/catch로 동적으로 가져온다 —
 * canvas가 없는 어떤 tsc/실행 환경에서도 이 파일이 타입 검사·수집 단계에서 죽지 않는다.
 *
 * jsdom의 `Image`는 리소스 로딩이 기본으로 꺼져 있어(resources 옵션 없음) data: URL이든
 * 뭐든 onload/onerror가 절대 안 온다 — 8초 타임아웃만 매번 친다(이건 jsdom의 한계지
 * chat-bubble.ts의 결함이 아니다. 실제 브라우저에서는 Image가 정상 동작한다). node-canvas가
 * 있으면 그 실제 동작하는 Image로 전역을 교체해 진짜 이미지 디코딩·onload/onerror 경로를
 * 태우고, 없으면 이 describe 전체를 건너뛴다(canvas 없이 이 테스트가 도는 유일한 방법인
 * 8초 타임아웃 대기는 값이 안 맞는다 — 의미 있게 검증 못 하면 정직하게 skip한다).
 * describe.skipIf는 수집 시점에 값을 평가하므로 beforeAll이 아니라 top-level await로
 * 그 전에 canvas 가용성을 확정한다.
 */
let canvasAvailable = true;
try {
  // 문자열 리터럴이 아니라 변수로 모듈명을 넘긴다 — tsc는 동적 import()도 인자가
  // 리터럴이면 그 모듈의 타입 선언을 정적으로 찾으려 한다(canvas가 없는 typecheck:ci
  // 환경에서 "Cannot find module 'canvas'"로 죽었다, 2026-09-22 핫픽스 재발). 변수로
  // 넘기면 tsc가 `any`로 취급해 canvas 미설치 환경에서도 타입 검사가 통과한다.
  const canvasModuleName = "canvas";
  const mod = (await import(canvasModuleName)) as { Image: typeof Image };
  globalThis.Image = mod.Image;
} catch {
  canvasAvailable = false;
}

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

describe.skipIf(!canvasAvailable)("J1/F2/F3: 표지·CTA 사진 렌더", () => {
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
