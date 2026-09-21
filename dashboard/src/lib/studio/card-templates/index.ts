/**
 * 카드 템플릿 레지스트리. `card-deck.ts` 가 `CardDeckSpec.template` 으로 분기할 때 이 표를
 * 읽는다. 새 템플릿(2단계 "photo_cover")은 여기에 한 줄 추가하면 된다.
 */
import type { CardDeck, CardSlide, CardTemplate } from "../card-deck-contract";
import { renderChatBubbleSlide } from "./chat-bubble";

export type TemplateRenderInput = { deck: CardDeck; slide: CardSlide; index: number; total: number };
export type TemplateRenderer = (input: TemplateRenderInput) => string | null;

export const CARD_TEMPLATE_RENDERERS: Record<Exclude<CardTemplate, "plain">, TemplateRenderer> = {
  chat_bubble: renderChatBubbleSlide,
};
