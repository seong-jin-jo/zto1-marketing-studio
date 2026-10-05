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
  if (renderEnabled) return true;
  if (source.textEmbedded) return false;
  if (!source.hasCardDeckV2) return true;
  return source.cardDeckTemplate === "plain";
}
