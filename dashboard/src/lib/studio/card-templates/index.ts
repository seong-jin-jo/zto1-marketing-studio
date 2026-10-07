/**
 * 카드 템플릿 레지스트리. `card-deck.ts` 가 `CardDeckSpec.template` 으로 분기할 때 이 표를
 * 읽는다. 새 템플릿(2단계 "photo_cover")은 여기에 한 줄 추가하면 된다.
 */
import type { CardDeck, CardSlide, CardTemplate } from "../card-deck-contract";
import {
  CARD_LOGICAL_HEIGHT,
  validateCardDeckV3,
  type CardDeckV3,
  type CardElement,
  type CardSlideV3,
  type TextElement,
} from "../card-element-contract";
import { renderChatBubbleSlide } from "./chat-bubble";

export type TemplateRenderInput = { deck: CardDeck; slide: CardSlide; index: number; total: number };
// J1(2026-09-22 코드리뷰): 표지·CTA 사진 배경을 그리려면 Image 로딩을 기다려야 해서
// 렌더러가 비동기로 바뀌었다(chat-bubble.ts).
export type TemplateRenderer = (input: TemplateRenderInput) => Promise<string | null>;

export const CARD_TEMPLATE_RENDERERS: Record<Exclude<CardTemplate, "plain">, TemplateRenderer> = {
  chat_bubble: renderChatBubbleSlide,
};

export const CARD_DECK_TEMPLATE_IDS = ["chat_bubble", "headline_cover", "photo_band", "number_list", "qa", "text_only"] as const;
export type CardDeckTemplateId = (typeof CARD_DECK_TEMPLATE_IDS)[number];

export interface CardDeckTemplateDefinition {
  id: CardDeckTemplateId;
  name: string;
  family: "chat" | "photo_text";
  description: string;
}

export interface CardTemplateState {
  activeTemplateId: CardDeckTemplateId;
  previousTemplate: { id: CardDeckTemplateId; deck: CardDeckV3 } | null;
}

export function defaultCardTemplateState(deck: CardDeckV3): CardTemplateState {
  return {
    activeTemplateId: deck.template === "chat_bubble" ? "chat_bubble" : "text_only",
    previousTemplate: null,
  };
}

export const CARD_DECK_TEMPLATES: readonly CardDeckTemplateDefinition[] = [
  { id: "chat_bubble", name: "카톡 대화", family: "chat", description: "질문과 답을 말풍선으로 이어갑니다" },
  { id: "headline_cover", name: "큰 제목 표지형", family: "photo_text", description: "큰 제목으로 문제를 먼저 보여 줍니다" },
  { id: "photo_band", name: "사진 위 글 띠형", family: "photo_text", description: "사진 아래 글 띠로 핵심을 읽힙니다" },
  { id: "number_list", name: "번호 목록형", family: "photo_text", description: "순서와 항목을 큰 번호로 나눕니다" },
  { id: "qa", name: "질문 답변형", family: "photo_text", description: "질문 장과 답 장을 번갈아 보여 줍니다" },
  { id: "text_only", name: "글자만형", family: "photo_text", description: "사진 없이 브랜드 색과 글에 집중합니다" },
] as const;

export function recommendedCardTemplate(structure?: "A" | "B" | "C" | null): CardDeckTemplateId {
  if (structure === "B") return "photo_band";
  if (structure === "C") return "number_list";
  return "headline_cover";
}

export function cardTemplateName(id: CardDeckTemplateId): string {
  return CARD_DECK_TEMPLATES.find((template) => template.id === id)?.name ?? id;
}

function stackedY(input: {
  preferredStart: number;
  preferredGap: number;
  height: number;
  textIndex: number;
  textCount: number;
  stageHeight: number;
}): number {
  const edge = 48;
  const lastY = input.stageHeight - edge - input.height;
  const start = Math.min(input.preferredStart, Math.max(edge, lastY - input.preferredGap * Math.max(0, input.textCount - 1)));
  const gap = input.textCount <= 1 ? 0 : Math.min(input.preferredGap, Math.max(0, (lastY - start) / (input.textCount - 1)));
  return Math.round(start + input.textIndex * gap);
}

function textLayout(templateId: CardDeckTemplateId, element: TextElement, textIndex: number, textCount: number, slide: CardSlideV3, stageHeight: number): TextElement {
  const preserve = { ...element, style: { ...element.style } };
  if (templateId === "headline_cover") {
    const height = slide.role === "cover" ? 360 : 176;
    return { ...preserve, x: 96, y: stackedY({ preferredStart: slide.role === "cover" ? 180 : 144, preferredGap: 196, height, textIndex, textCount, stageHeight }), width: 888, height, rotation: 0, style: { ...preserve.style, font_size: slide.role === "cover" ? 88 : 56, font_weight: 800, align: "left", vertical_align: "middle" } };
  }
  if (templateId === "photo_band") {
    return { ...preserve, x: 72, y: stackedY({ preferredStart: 930, preferredGap: 128, height: 112, textIndex, textCount, stageHeight }), width: 936, height: 112, rotation: 0, style: { ...preserve.style, font_size: 48, font_weight: 700, align: "left", vertical_align: "middle" } };
  }
  if (templateId === "number_list") {
    return { ...preserve, x: textIndex === 0 ? 244 : 284, y: stackedY({ preferredStart: 160, preferredGap: 188, height: 164, textIndex, textCount, stageHeight }), width: textIndex === 0 ? 740 : 700, height: 164, rotation: 0, style: { ...preserve.style, font_size: textIndex === 0 ? 72 : 48, font_weight: textIndex === 0 ? 800 : 650, align: "left", vertical_align: "middle" } };
  }
  if (templateId === "qa") {
    return { ...preserve, x: slide.order % 2 === 0 ? 96 : 180, y: stackedY({ preferredStart: 240, preferredGap: 208, height: 176, textIndex, textCount, stageHeight }), width: 804, height: 176, rotation: 0, style: { ...preserve.style, font_size: 54, font_weight: slide.order % 2 === 0 ? 800 : 600, align: slide.order % 2 === 0 ? "left" : "right", vertical_align: "middle" } };
  }
  if (templateId === "text_only") {
    return { ...preserve, x: 108, y: stackedY({ preferredStart: 180, preferredGap: 212, height: 188, textIndex, textCount, stageHeight }), width: 864, height: 188, rotation: 0, style: { ...preserve.style, font_size: slide.role === "cover" ? 80 : 52, font_weight: slide.role === "cover" ? 800 : 650, align: "center", vertical_align: "middle" } };
  }
  return preserve;
}

function transformSlide(deck: CardDeckV3, slide: CardSlideV3, templateId: CardDeckTemplateId): CardSlideV3 {
  const textCount = slide.elements.filter((element) => element.type === "text").length;
  let textIndex = 0;
  const nextElements = slide.elements.map((element: CardElement) => {
    if (element.type !== "text") return structuredClone(element);
    const next = textLayout(templateId, element, textIndex, textCount, slide, CARD_LOGICAL_HEIGHT[deck.ratio]);
    textIndex += 1;
    return next;
  });
  const background = deck.template === "chat_bubble"
    ? structuredClone(slide.background)
    : slide.background.kind === "image"
    ? structuredClone(slide.background)
    : templateId === "photo_band"
      ? { kind: "gradient" as const, from: deck.theme.background as `#${string}`, to: deck.theme.accent as `#${string}`, angle: 180 }
      : { kind: "solid" as const, color: (slide.role === "cta" ? deck.theme.foreground : deck.theme.background) as `#${string}` };
  return { ...structuredClone(slide), background, elements: nextElements };
}

/** 한 번 호출한 결과가 undo history 한 칸이 되도록, 덱 변환 전체를 순수 명령 하나로 만든다. */
export function applyCardDeckTemplate(
  deck: CardDeckV3,
  templateId: CardDeckTemplateId,
  scope: { kind: "all" } | { kind: "slide"; slideId: string },
): CardDeckV3 {
  if (templateId === "chat_bubble" && deck.template !== "chat_bubble") {
    throw new RangeError("CARD_CHAT_TEMPLATE_CONVERSION_REQUIRED");
  }
  if (scope.kind === "slide" && deck.template === "chat_bubble") {
    throw new RangeError("CARD_CHAT_TEMPLATE_DECK_ONLY");
  }
  if (templateId !== "chat_bubble" && deck.template === "chat_bubble") {
    throw new RangeError("CARD_PHOTO_TEXT_TEMPLATE_CHAT_DECK_UNSUPPORTED");
  }
  const next = {
    ...structuredClone(deck),
    revision: deck.revision + 1,
    slides: deck.slides.map((slide) => (
      scope.kind === "all" || slide.id === scope.slideId ? transformSlide(deck, slide, templateId) : structuredClone(slide)
    )),
  };
  validateCardDeckV3(next);
  return next;
}
