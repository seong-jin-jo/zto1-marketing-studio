import { renderStill, selectComposition } from "@remotion/renderer";
import { getRemotionBundleUrl, remotionBrowserExecutable, withRemotionRenderSlot } from "@/lib/remotion-runtime";
import { assertCardFontReady } from "./card-font";
import type { CardSlideRenderModel } from "./card-render-model";

export interface RenderCardSlidePngInput {
  model: CardSlideRenderModel;
  outputPath: string;
}

export async function renderCardSlidePng({ model, outputPath }: RenderCardSlidePngInput): Promise<void> {
  assertCardFontReady();
  await withRemotionRenderSlot(async () => {
    const serveUrl = await getRemotionBundleUrl();
    const browserExecutable = remotionBrowserExecutable();
    const inputProps = { model };
    const composition = await selectComposition({
      serveUrl,
      id: model.ratio === "1:1" ? "CardSlideComposition-1x1" : "CardSlideComposition-4x5",
      inputProps,
      browserExecutable,
    });
    await renderStill({
      serveUrl,
      composition,
      output: outputPath,
      imageFormat: "png",
      inputProps,
      browserExecutable,
      chromiumOptions: { gl: "swangle" },
    });
  });
}
