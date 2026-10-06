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

/**
 * v2 chat_bubble의 원문을 무손실 projection 하기 위해 남겨 둔 글 요소다.
 * 화면에는 slide.base가 말풍선 형태를 직접 그리므로 이 요소까지 그리거나 선택하면
 * 같은 문장이 두 번 보인다. 자유 배치 요소 목록에서는 제외하되 legacy projection에는
 * 그대로 남겨 직접 편집 왕복 계약을 보존한다.
 */
export function isChatBaseProjectionElement(slide: CardSlideV3, element: CardElement): boolean {
  if (slide.base.kind !== "chat_bubble" || element.type !== "text") return false;
  if (element.id === `el_${slide.id}_cover` || element.id === `el_${slide.id}_sub`) return true;
  if (slide.base.bubbles.some((bubble) => element.id === `el_${bubble.id}`)) return true;
  // converter v1은 원형 projection을 `el_<원본 id>` namespace로 만들었고, 자유 글은
  // `el_text_<uuid>` namespace로 만든다. 사용자에게 보이는 name 정규식에 기대지 않고
  // 이 구조적 ID 계약으로 삭제·이동 뒤 고아 projection과 그 복사본을 제외한다.
  return element.id.startsWith("el_") && !element.id.startsWith("el_text_");
}

export function visibleCardElements(model: CardSlideRenderModel): CardElement[] {
  return model.slide.elements
    .filter((element) => !element.hidden && !isChatBaseProjectionElement(model.slide, element))
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
