import React, { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { CardSlideScene } from "../src/components/studio/card/CardSlideScene";
import type { CardSlideRenderModel } from "../src/lib/studio/card-render-model";

export interface CardSlideCompositionProps extends Record<string, unknown> {
  model: CardSlideRenderModel;
}

export const CARD_REMOTION_FONT_FAMILY = "Pretendard Variable";
export const CARD_REMOTION_FONT_URL = "fonts/PretendardVariable.woff2";

export function CardSlideComposition({ model }: CardSlideCompositionProps) {
  const [fontHandle] = useState(() => delayRender("Pretendard Variable font"));
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let canceled = false;
    const font = new FontFace(CARD_REMOTION_FONT_FAMILY, `url(${staticFile(CARD_REMOTION_FONT_URL)})`, {
      style: "normal",
      weight: "100 900",
    });
    font.load()
      .then((loaded) => {
        if (canceled) return;
        document.fonts.add(loaded);
        setFontReady(true);
        continueRender(fontHandle);
      })
      .catch((error) => {
        if (!canceled) {
          const detail = error instanceof Error ? error.message : String(error);
          cancelRender(new Error(`FONT_LOAD_FAILED: ${detail}`, { cause: error }));
        }
      });
    return () => { canceled = true; };
  }, [fontHandle]);
  if (!fontReady) return null;
  return <CardSlideScene model={model} renderMode="export" />;
}
