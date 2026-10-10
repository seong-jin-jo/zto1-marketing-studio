import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { isSynchronizedChatCardDeckV3 } from "@/lib/studio/card-deck-v2-to-v3";

type FlagEnv = Record<string, string | undefined>;

export function usesChatBubbleV2(cardDeck: unknown): boolean {
  return Boolean(cardDeck)
    && typeof cardDeck === "object"
    && !Array.isArray(cardDeck)
    && (cardDeck as { template?: unknown }).template === "chat_bubble";
}

export function cardDeckV3ForDraft<T>(cardDeck: unknown, cardDeckV3: T | null | undefined): T | null {
  if (!usesChatBubbleV2(cardDeck)) return cardDeckV3 ?? null;
  return isSynchronizedChatCardDeckV3(cardDeck as CardDeck, cardDeckV3) ? cardDeckV3 ?? null : null;
}

export function cardDeckV3RenderingEnabled(env: FlagEnv = process.env): boolean {
  const serverValue = env.CARD_DECK_V3_RENDER_ENABLED;
  const publicValue = env.NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED;
  const enabled = (value: string | undefined) => value === "1" || value === "true";
  // 직접 편집과 PNG 렌더 경로가 실사용 검증을 마쳤으므로 기본값은 켠다. 긴급 중지는
  // 어느 한쪽이라도 명시적으로 0/false를 주면 유지된다. 기본 OFF이면 편집은 되는데
  // 제품 UI의 내보내기만 막히고, 검증 코드가 렌더 함수를 직접 부르는 우회가 생긴다.
  if (serverValue === undefined && publicValue === undefined) return true;
  if (serverValue !== undefined && publicValue !== undefined) return enabled(serverValue) && enabled(publicValue);
  return enabled(serverValue ?? publicValue);
}

export function cardDeckV3EntryEnabled(
  renderEnabled: boolean,
  source: {
    hasCardDeckV2: boolean;
    cardDeckTemplate?: "plain" | "chat_bubble" | null;
    textEmbedded: boolean;
  },
): boolean {
  if (source.cardDeckTemplate === "chat_bubble") return renderEnabled;
  if (renderEnabled) return true;
  if (source.textEmbedded) return false;
  if (!source.hasCardDeckV2) return true;
  return source.cardDeckTemplate === "plain";
}
