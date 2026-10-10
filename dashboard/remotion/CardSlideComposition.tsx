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
      .then(async (loaded) => {
        if (canceled) return;
        document.fonts.add(loaded);
        await document.fonts.load(`700 64px "${CARD_REMOTION_FONT_FAMILY}"`, "캔버스 글꼴 확인 ABC 123");
        await document.fonts.ready;
        if (!document.fonts.check(`700 64px "${CARD_REMOTION_FONT_FAMILY}"`, "캔버스 글꼴 확인 ABC 123")) {
          throw new Error("Pretendard Variable was not resolved after loading");
        }
        if (canceled) return;
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
