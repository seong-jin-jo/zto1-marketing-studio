import React from "react";
import { Composition } from "remotion";
import {
  INTRO_OUTRO_COMPS,
  DEFAULT_BRAND_PROPS,
  COMP_WIDTH,
  COMP_HEIGHT,
  COMP_FPS,
  type IntroOutroCompId,
} from "./IntroOutroComps";

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
    </>
  );
};
