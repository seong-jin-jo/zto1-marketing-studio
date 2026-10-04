import {
  CARD_LOGICAL_HEIGHT,
  CARD_LOGICAL_WIDTH,
  type CardDeckV3,
  type CardElement,
  type CardSlideV3,
} from "./card-element-contract";

export interface CardSlideRenderModel {
  deckId: string;
  ratio: CardDeckV3["ratio"];
  logicalWidth: number;
  logicalHeight: number;
  theme: CardDeckV3["theme"];
  brand: CardDeckV3["brand"];
  slide: CardSlideV3;
  assetUrls: Record<string, string>;
}

export function cardSlideRenderModel(
  deck: CardDeckV3,
  slideId: string,
  assetUrls: Record<string, string> = {},
): CardSlideRenderModel {
  const slide = deck.slides.find((candidate) => candidate.id === slideId) ?? deck.slides[0];
  if (!slide) throw new Error("카드 덱에는 장이 하나 이상 있어야 합니다");
  return {
    deckId: deck.id,
    ratio: deck.ratio,
    logicalWidth: CARD_LOGICAL_WIDTH,
    logicalHeight: CARD_LOGICAL_HEIGHT[deck.ratio],
    theme: structuredClone(deck.theme),
    brand: structuredClone(deck.brand),
    slide: structuredClone(slide),
    assetUrls: { ...assetUrls },
  };
}

export function visibleCardElements(model: CardSlideRenderModel): CardElement[] {
  return model.slide.elements
    .filter((element) => !element.hidden)
    .sort((left, right) => left.z_index - right.z_index);
}

export function cardElementStyle(element: CardElement, model: CardSlideRenderModel): Record<string, string | number> {
  return {
    "--card-element-left": `${element.x / model.logicalWidth * 100}%`,
    "--card-element-top": `${element.y / model.logicalHeight * 100}%`,
    "--card-element-width": `${element.width / model.logicalWidth * 100}%`,
    "--card-element-height": `${element.height / model.logicalHeight * 100}%`,
    "--card-element-rotation": `${element.rotation}deg`,
    "--card-element-opacity": element.opacity,
    "--card-element-z": element.z_index,
  };
}
