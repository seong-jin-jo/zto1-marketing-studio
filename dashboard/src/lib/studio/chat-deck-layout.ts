import type { CardDeck } from "./card-deck-contract";
import {
  renderChatBubbleSlideToCanvas,
  type ChatBubbleRenderInput,
} from "./card-templates/chat-bubble";

export type ChatSlideLayoutRenderer = (input: ChatBubbleRenderInput) => Promise<HTMLCanvasElement | null>;

/** 톤 후보처럼 여러 장을 바꾸는 작업은 반영 전에 변경 대상 전체를 발행 렌더러로 검증한다. */
export async function assertChatSlidesRenderable(
  deck: CardDeck,
  slideIds: Iterable<string>,
  render: ChatSlideLayoutRenderer = renderChatBubbleSlideToCanvas,
): Promise<void> {
  const targets = new Set(slideIds);
  for (const [index, slide] of deck.slides.entries()) {
    if (!targets.has(slide.id)) continue;
    await render({ deck, slide, index, total: deck.slides.length });
  }
}
