import deckFixture from "../../studio/fixtures/deck-d100.v2.json";
import {
  renderPlainCardDeck,
  renderPlainCardDeckIncremental,
  type CardDeckSpec,
} from "../../../src/lib/studio/card-deck";
import {
  renderChatBubbleSlide,
  renderChatBubbleSlideToCanvas,
} from "../../../src/lib/studio/card-templates/chat-bubble";
import type { CardDeck, CardSlide } from "../../../src/lib/studio/card-deck-contract";

type TextMetric = {
  text: string;
  font: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type RenderCapture = {
  dataUrl: string;
  text: TextMetric[];
  drawImageCount: number;
};

type ParityFixture = {
  name: string;
  kind: "plain" | "chat_bubble";
  preview: RenderCapture;
  output: RenderCapture;
};

async function captureText(run: () => string | Promise<string>): Promise<RenderCapture> {
  const prototype = CanvasRenderingContext2D.prototype;
  const originalFillText = prototype.fillText;
  const originalDrawImage = prototype.drawImage;
  const text: TextMetric[] = [];
  let drawImageCount = 0;
  prototype.fillText = function patchedFillText(value, x, y, maxWidth) {
    const label = String(value);
    const measured = this.measureText(label);
    const width = measured.width;
    const ascent = measured.actualBoundingBoxAscent || Number.parseFloat(this.font) || 0;
    const descent = measured.actualBoundingBoxDescent || 0;
    const left = this.textAlign === "center" ? x - width / 2 : this.textAlign === "right" || this.textAlign === "end" ? x - width : x;
    const top = this.textBaseline === "top" ? y : y - ascent;
    text.push({
      text: label,
      font: this.font,
      left,
      top,
      right: left + width,
      bottom: top + ascent + descent,
    });
    if (maxWidth === undefined) return originalFillText.call(this, value, x, y);
    return originalFillText.call(this, value, x, y, maxWidth);
  };
  prototype.drawImage = function patchedDrawImage(...args) {
    drawImageCount += 1;
    return originalDrawImage.apply(this, args);
  } as typeof prototype.drawImage;
  try {
    return { dataUrl: await run(), text, drawImageCount };
  } finally {
    prototype.fillText = originalFillText;
    prototype.drawImage = originalDrawImage;
  }
}

const plainFixtures: Array<{ name: string; spec: CardDeckSpec; index?: number }> = [
  { name: "plain-4x5-short-top", spec: { lines: ["오늘 한 단계만 바꿔 보세요"], ratio: "4:5", positions: ["top-center"] } },
  { name: "plain-4x5-long-center", spec: { lines: ["긴 한국어 문장도 화면과 결과 그림에서 같은 줄 수와 같은 위치로 읽혀야 합니다"], ratio: "4:5", positions: ["center"] } },
  { name: "plain-4x5-short-bottom", spec: { lines: ["저장해 두고 다시 보기"], ratio: "4:5", positions: ["bottom-center"] } },
  { name: "plain-square-long", spec: { lines: ["정사각형 카드의 긴 한국어 문장은 가장자리에서 잘리지 않고 같은 자리에서 줄바꿈됩니다"], ratio: "1:1", positions: ["center"] } },
  { name: "plain-empty-slot", spec: { lines: ["첫 장", "", "셋째 장"], ratio: "4:5", positions: ["top-center", "center", "bottom-center"] }, index: 2 },
];

function chatDeck(): CardDeck {
  const deck = structuredClone(deckFixture) as unknown as CardDeck;
  const longSlide = deck.slides[1];
  if (longSlide?.bubbles?.[1]) {
    longSlide.bubbles[1].segments = [
      { text: "같은 렌더러를 사용하면 긴 한국어 말풍선도 ", bold: false },
      { text: "굵은 구간과 줄바꿈", bold: true },
      { text: "이 미리보기와 결과 그림에서 달라지지 않습니다", bold: false },
    ];
  }
  const photoUrl = "/qa/alignment-card-1.jpg";
  deck.slides[0].cover_image_url = photoUrl;
  deck.slides[deck.slides.length - 1].cover_image_url = photoUrl;
  return deck;
}

async function capturePlain(name: string, spec: CardDeckSpec, index = 0): Promise<ParityFixture> {
  const preview = await captureText(() => {
    const rendered = renderPlainCardDeckIncremental(spec);
    return rendered.urls[index];
  });
  const output = await captureText(() => renderPlainCardDeck(spec)[index]);
  return { name, kind: "plain", preview, output };
}

async function captureChat(name: string, deck: CardDeck, slide: CardSlide): Promise<ParityFixture> {
  const index = deck.slides.findIndex((candidate) => candidate.id === slide.id);
  const input = { deck, slide, index, total: deck.slides.length };
  const preview = await captureText(async () => {
    const canvas = await renderChatBubbleSlideToCanvas(input);
    if (!canvas) throw new Error(`${name} 미리보기 캔버스를 만들지 못했습니다.`);
    return canvas.toDataURL("image/png");
  });
  const output = await captureText(async () => {
    const dataUrl = await renderChatBubbleSlide(input);
    if (!dataUrl) throw new Error(`${name} 출력 PNG를 만들지 못했습니다.`);
    return dataUrl;
  });
  return { name, kind: "chat_bubble", preview, output };
}

async function renderParityFixtures(): Promise<ParityFixture[]> {
  const results: ParityFixture[] = [];
  for (const fixture of plainFixtures) {
    results.push(await capturePlain(fixture.name, fixture.spec, fixture.index));
  }
  const deck = chatDeck();
  results.push(await captureChat("chat-cover-photo", deck, deck.slides[0]));
  results.push(await captureChat("chat-long-bold", deck, deck.slides[1]));
  results.push(await captureChat("chat-cta-photo", deck, deck.slides[deck.slides.length - 1]));
  return results;
}

declare global {
  interface Window {
    renderEditroomCardParityFixtures: typeof renderParityFixtures;
  }
}

window.renderEditroomCardParityFixtures = renderParityFixtures;
