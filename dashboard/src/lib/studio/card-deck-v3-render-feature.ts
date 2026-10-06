type FlagEnv = Record<string, string | undefined>;

export function cardDeckV3RenderingEnabled(env: FlagEnv = process.env): boolean {
  const serverValue = env.CARD_DECK_V3_RENDER_ENABLED;
  const publicValue = env.NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED;
  const enabled = (value: string | undefined) => value === "1" || value === "true";
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
  // 렌더 스위치는 PNG 경로만 연다. v71 고급 도구가 CardCanvasEditor에
  // 모두 이식되기 전까지 카톡 덱은 기존 BubbleEditor를 유지한다.
  if (source.cardDeckTemplate === "chat_bubble") return false;
  if (renderEnabled) return true;
  if (source.textEmbedded) return false;
  if (!source.hasCardDeckV2) return true;
  return source.cardDeckTemplate === "plain";
}
