import React from "react";
import { Composition, Still } from "remotion";
import {
  INTRO_OUTRO_COMPS,
  DEFAULT_BRAND_PROPS,
  COMP_WIDTH,
  COMP_HEIGHT,
  COMP_FPS,
  type IntroOutroCompId,
} from "./IntroOutroComps";
import { CardSlideComposition } from "./CardSlideComposition";
import type { CardSlideRenderModel } from "../src/lib/studio/card-render-model";

const defaultCardModel: CardSlideRenderModel = {
  deckId: "deck_remotion_default",
  ratio: "4:5",
  logicalWidth: 1080,
  logicalHeight: 1350,
  theme: { background: "#FFF9F0", foreground: "#111111", accent: "#2563EB" },
  brand: { display_name: "OSMU", handle: null },
  slide: {
    id: "slide_remotion_default", order: 0, role: "cover", content_state: "filled",
    background: { kind: "solid", color: "#FFF9F0" }, base: { kind: "plain", lines: ["OSMU"] }, elements: [],
  },
  assetUrls: {},
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {(Object.keys(INTRO_OUTRO_COMPS) as IntroOutroCompId[]).map((id) => {
        const comp = INTRO_OUTRO_COMPS[id];
        return (
          <Composition
            key={id}
            id={id}
            component={comp.component}
            durationInFrames={comp.durationInFrames}
            fps={COMP_FPS}
            width={COMP_WIDTH}
            height={COMP_HEIGHT}
            defaultProps={DEFAULT_BRAND_PROPS}
          />
        );
      })}
      <Still id="CardSlideComposition-4x5" component={CardSlideComposition} width={1080} height={1350} defaultProps={{ model: defaultCardModel }} />
      <Still id="CardSlideComposition-1x1" component={CardSlideComposition} width={1080} height={1080} defaultProps={{ model: { ...defaultCardModel, ratio: "1:1", logicalHeight: 1080 } }} />
    </>
  );
};
