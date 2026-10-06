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

export type ChatSlideSplit = { bubbleIndex: number; offset?: number };

/** 실제 발행 renderer로 가장 앞의 안전한 분할 경계를 찾는다. null이면 분할이 필요 없다. */
export async function findChatSlideOverflowSplit(
  deck: CardDeck,
  slideId: string,
  render: ChatSlideLayoutRenderer = renderChatBubbleSlideToCanvas,
): Promise<ChatSlideSplit | null> {
  const index = deck.slides.findIndex((slide) => slide.id === slideId);
  const slide = deck.slides[index];
  if (!slide || slide.role !== "chat") return null;
  try {
    await render({ deck, slide, index, total: deck.slides.length });
    return null;
  } catch (cause) {
    if (!(cause instanceof Error) || !cause.message.includes("말풍선이 카드보다 깁니다")) throw cause;
  }
  const bubbles = slide.bubbles ?? [];
  let firstMoved = -1;
  for (let count = 1; count <= bubbles.length; count += 1) {
    try {
      await render({ deck, slide: { ...slide, bubbles: bubbles.slice(0, count) }, index, total: deck.slides.length + 1 });
    } catch (cause) {
      if (!(cause instanceof Error) || !cause.message.includes("말풍선이 카드보다 깁니다")) throw cause;
      firstMoved = count - 1;
      break;
    }
  }
  if (firstMoved > 0) return { bubbleIndex: firstMoved };
  const bubble = bubbles[0];
  const length = bubble?.segments.reduce((sum, segment) => sum + segment.text.length, 0) ?? 0;
  let low = 1;
  let high = length - 1;
  let fit = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    let cursor = 0;
    const prefix = bubble.segments.flatMap((segment) => {
      if (cursor >= middle) return [];
      const take = Math.min(segment.text.length, middle - cursor);
      cursor += segment.text.length;
      return take > 0 ? [{ ...segment, text: segment.text.slice(0, take) }] : [];
    });
    try {
      await render({ deck, slide: { ...slide, bubbles: [{ ...bubble, segments: prefix }] }, index, total: deck.slides.length + 1 });
      fit = middle;
      low = middle + 1;
    } catch (cause) {
      if (!(cause instanceof Error) || !cause.message.includes("말풍선이 카드보다 깁니다")) throw cause;
      high = middle - 1;
    }
  }
  return fit > 0 ? { bubbleIndex: 0, offset: fit } : null;
}
