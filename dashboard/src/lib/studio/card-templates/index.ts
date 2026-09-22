/**
 * 카드 템플릿 레지스트리. `card-deck.ts` 가 `CardDeckSpec.template` 으로 분기할 때 이 표를
 * 읽는다. 새 템플릿(2단계 "photo_cover")은 여기에 한 줄 추가하면 된다.
 */
import type { CardDeck, CardSlide, CardTemplate } from "../card-deck-contract";
import { renderChatBubbleSlide } from "./chat-bubble";

export type TemplateRenderInput = { deck: CardDeck; slide: CardSlide; index: number; total: number };
// J1(2026-09-22 코드리뷰): 표지·CTA 사진 배경을 그리려면 Image 로딩을 기다려야 해서
// 렌더러가 비동기로 바뀌었다(chat-bubble.ts).
export type TemplateRenderer = (input: TemplateRenderInput) => Promise<string | null>;

export const CARD_TEMPLATE_RENDERERS: Record<Exclude<CardTemplate, "plain">, TemplateRenderer> = {
  chat_bubble: renderChatBubbleSlide,
};
