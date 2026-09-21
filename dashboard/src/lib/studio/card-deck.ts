/**
 * 카드뉴스 한 벌(deck)을 그리고 저장하는 한 자리.
 *
 * 2026-09-14 실측(컨트롤러가 배포된 화면에서 직접 관통): 생성실에서 글자 카드 3장을 만들면
 * 편집실에는 한 장도 안 오고, 편집실에서 글자를 고치고 비율을 바꿔도 발행되는 그림에는
 * 하나도 반영되지 않았다. 원인은 **카드를 그리는 코드가 생성실 안에만 있었기 때문**이다.
 * (`docs/design-docs/osmu-four-room-ux-uplift-v1.0-opus-20260913.md` §2.2 · §4.1)
 *
 * 그래서 그리기와 저장을 화면 밖으로 꺼내 한 벌 단위로 만든다. 생성실도 편집실도 같은
 * 함수를 부른다. **보이는 것과 나가는 것이 한 코드에서 나온다.**
 *
 * 그리기(render)와 저장(upload)을 인자로 받는 이유는 시험 때문만이 아니다. 그리기는
 * 브라우저 캔버스가, 저장은 서버가 한다. 둘을 한 함수 안에 박으면 어느 쪽이 깨졌는지
 * 구분이 안 된다.
 */
import {
  CARD_PIXELS,
  DEFAULT_CARD_THEME,
  renderTextCard,
  type CardRatio,
  type CardTextVerticalPosition,
  type CardTheme,
  type TextCardInput,
} from "./text-card-image";
import type { CardDeck, CardTemplate } from "./card-deck-contract";
import { CARD_TEMPLATE_RENDERERS } from "./card-templates";

/** 편집실이 쓰는 아홉 자리 표기를 카드 그리기가 쓰는 세 자리로 줄인다. */
export function verticalFrom(position: string | undefined): CardTextVerticalPosition {
  if (typeof position === "string" && position.startsWith("top")) return "top";
  if (typeof position === "string" && position.startsWith("bottom")) return "bottom";
  return "center";
}

/** "4:5" 같은 화면 표기를 실제 픽셀이 정의된 비율로 바꾼다. 모르는 값은 4:5 로 둔다. */
export function cardRatioFrom(value: string | null | undefined): CardRatio {
  return value && value in CARD_PIXELS ? value as CardRatio : "4:5";
}

export type CardDeckSpec = {
  lines: string[];
  ratio: CardRatio;
  theme?: CardTheme;
  /** 장마다의 글자 자리. 편집실 표기(top-center 등)를 그대로 받는다. */
  positions?: (string | undefined)[];
  /** "plain"(기존 글자 카드) | "chat_bubble"(신규). 없으면 plain 으로 본다(회귀 0). */
  template?: CardTemplate;
  /** template="chat_bubble" 일 때만 쓴다. 렌더 입력은 이 덱의 slides 에서 직접 만든다. */
  deck?: CardDeck;
};

/**
 * 한 벌을 그리기 위한 장별 입력을 만든다. 순수 함수라 그대로 시험할 수 있다.
 * 빈 줄은 뺀다. 빈 카드는 올릴 수 없는 그림이고, 그것이 섞이면 장 번호가 어긋난다.
 */
export function cardDeckRenderInputs(spec: CardDeckSpec): TextCardInput[] {
  const kept = spec.lines
    .map((text, index) => ({ text, index }))
    .filter((entry) => entry.text.trim().length > 0);
  return kept.map((entry, order) => ({
    text: entry.text,
    ratio: spec.ratio,
    theme: spec.theme ?? DEFAULT_CARD_THEME,
    position: verticalFrom(spec.positions?.[entry.index]),
    index: order,
    total: kept.length,
  }));
}

export type CardDeckDeps = {
  /** 카드 한 장을 PNG data URL 로 그린다. 못 그리면 null. */
  render?: (input: TextCardInput) => string | null;
  /** data URL 한 장을 저장하고 배달 주소를 돌려준다. */
  upload: (dataUrl: string, index: number) => Promise<string | CardDeckUpload>;
};

export type CardDeckUpload = {
  url: string;
  /** 같은 요청에서 뒤 장이 실패했을 때 이미 저장된 이 객체를 회수한다. */
  rollback?: () => Promise<void>;
};

export class CardDeckError extends Error {}

/** template="chat_bubble" 일 때 덱의 slides 순서대로 PNG data URL 목록을 그린다. */
function renderChatBubbleDeck(deck: CardDeck): string[] {
  const renderer = CARD_TEMPLATE_RENDERERS.chat_bubble;
  const total = deck.slides.length;
  return deck.slides.map((slide, index) => {
    const dataUrl = renderer({ deck, slide, index, total });
    if (!dataUrl) throw new CardDeckError("이 브라우저에서는 카드를 그릴 수 없습니다.");
    return dataUrl;
  });
}

/**
 * 한 벌을 그려 전부 저장하고 배달 주소 목록을 돌려준다.
 * 한 장이라도 저장에 실패하면 전체를 실패로 본다. 반쪽 카드뉴스는 올리면 안 된다.
 *
 * template 이 "chat_bubble" 이면 spec.deck 의 slides 로 그린다(글자 위치 9칸 경로 대신).
 * template 이 없거나 "plain" 이면 기존 lines 기반 경로 그대로(회귀 0).
 */
export async function renderAndUploadCardDeck(spec: CardDeckSpec, deps: CardDeckDeps): Promise<string[]> {
  if (spec.template === "chat_bubble") {
    if (!spec.deck) throw new CardDeckError("chat_bubble 템플릿에는 deck 이 필요합니다.");
    const drawn = renderChatBubbleDeck(spec.deck);
    return uploadDrawnCards(drawn, deps);
  }
  const inputs = cardDeckRenderInputs(spec);
  if (!inputs.length) throw new CardDeckError("카드로 만들 글자가 없습니다.");
  const render = deps.render ?? renderTextCard;
  const drawn: string[] = [];
  for (const input of inputs) {
    const dataUrl = render(input);
    if (!dataUrl) throw new CardDeckError("이 브라우저에서는 카드를 그릴 수 없습니다.");
    drawn.push(dataUrl);
  }
  return uploadDrawnCards(drawn, deps);
}

async function uploadDrawnCards(drawn: string[], deps: CardDeckDeps): Promise<string[]> {
  const urls: string[] = [];
  const rollbacks: Array<() => Promise<void>> = [];
  try {
    for (let index = 0; index < drawn.length; index += 1) {
      const uploaded = await deps.upload(drawn[index], index);
      if (typeof uploaded === "string") {
        urls.push(uploaded);
      } else {
        urls.push(uploaded.url);
        if (uploaded.rollback) rollbacks.push(uploaded.rollback);
      }
    }
  } catch (error) {
    const cleanup = await Promise.allSettled([...rollbacks].reverse().map((rollback) => rollback()));
    const cleanupFailures = cleanup.filter((result) => result.status === "rejected").length;
    if (cleanupFailures > 0) {
      throw new CardDeckError(`카드 저장이 중단됐고 임시 파일 ${cleanupFailures}개를 회수하지 못했습니다. 다시 시도하기 전에 저장소를 확인해주세요.`);
    }
    throw error;
  }
  return urls;
}

/** 브라우저에서 /api/images/upload 로 한 장을 저장한다. */
export function browserCardUploader(headers: Record<string, string>): CardDeckDeps["upload"] {
  return async (dataUrl, index) => {
    const blob = await fetch(dataUrl).then((response) => response.blob());
    const form = new FormData();
    form.append("file", new File([blob], `text-card-${index + 1}.png`, { type: "image/png" }));
    const response = await fetch("/api/images/upload", { method: "POST", headers, body: form });
    const payload = await response.json().catch(() => ({})) as { url?: string; error?: string; filename?: string };
    if (!response.ok || !payload.url) {
      throw new CardDeckError(payload.error || `글자 카드 ${index + 1}장을 저장하지 못했습니다`);
    }
    const filename = typeof payload.filename === "string" ? payload.filename : null;
    return {
      url: payload.url,
      rollback: filename
        ? async () => {
          const deleted = await fetch(`/api/images/${encodeURIComponent(filename)}`, {
            method: "DELETE",
            headers,
          });
          if (!deleted.ok && deleted.status !== 404) {
            throw new CardDeckError(`임시 카드 ${index + 1}장을 회수하지 못했습니다`);
          }
        }
        : undefined,
    };
  };
}
