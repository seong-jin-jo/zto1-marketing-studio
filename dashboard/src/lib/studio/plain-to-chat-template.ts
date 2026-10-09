import { validateCardDeck, type Bubble, type CardDeck, type CardSlide } from "./card-deck-contract";
import type { CardDeckV3 } from "./card-element-contract";
import { migrateCardDeckV2ToV3, synchronizeChatCardDeckV3 } from "./card-deck-v2-to-v3";

function safeText(value: string): string {
  return value.replace(/[—–]/g, ",").replace(/<[^>]+>/g, "").trim();
}

function plainSlideText(deck: CardDeckV3, slideIndex: number): string {
  const slide = deck.slides[slideIndex];
  if (!slide) return "";
  const elementText = slide.elements
    .filter((element) => element.type === "text" && !element.hidden)
    .map((element) => element.type === "text" ? element.text : "")
    .filter(Boolean)
    .join("\n");
  const baseText = slide.base.kind === "plain" ? slide.base.lines.join("\n") : "";
  return safeText(elementText || baseText);
}

function chunks(value: string, max = 120): string[] {
  const chars = Array.from(value || "내용을 함께 살펴봅니다.");
  const result: string[] = [];
  for (let index = 0; index < chars.length; index += max) result.push(chars.slice(index, index + max).join(""));
  return result;
}

function pairedBubbles(text: string, slideIndex: number): Bubble[] {
  let parts = chunks(text);
  if (parts.length === 1) {
    const chars = Array.from(parts[0]);
    const split = Math.max(1, Math.ceil(chars.length / 2));
    parts = chars.length > 1
      ? [chars.slice(0, split).join(""), chars.slice(split).join("")]
      : ["이 내용을 볼까요?", chars[0]];
  }
  return parts.map((part, bubbleIndex) => ({
    id: `bubble_${slideIndex}_${bubbleIndex}`,
    order: bubbleIndex,
    speaker: bubbleIndex % 2 === 0 ? "reader" : "brand",
    segments: [{ text: part, bold: false }],
    reaction: null,
  }));
}

/**
 * OD-2026-10-09-2의 "별도 자유배치 모드 없음"을 지키면서, 편집실 템플릿 선택만으로
 * 사진·글 덱을 카톡 대화 덱으로 전환한다. 모든 원문은 표지 또는 네 대화 장에 배분하고,
 * 서버의 7~11장·화자 2종·댓글 유도·CTA 계약을 먼저 통과한 뒤 v3로 올린다.
 */
export function convertPlainCardDeckV3ToChat(deck: CardDeckV3): { source: CardDeck; deck: CardDeckV3 } {
  if (deck.template !== "plain") throw new RangeError("CARD_CHAT_TEMPLATE_PLAIN_REQUIRED");
  const texts = deck.slides.map((_, index) => plainSlideText(deck, index)).filter(Boolean);
  const coverText = texts[0] || "핵심 내용을\n대화로 봅니다";
  const coverChars = Array.from(coverText);
  const headline = coverChars.slice(0, 30).reduce<string[]>((lines, char, index) => {
    const lineIndex = Math.floor(index / 10);
    lines[lineIndex] = `${lines[lineIndex] ?? ""}${char}`;
    return lines;
  }, []).join("\n");
  const remaining = texts.slice(1);
  const groups = Array.from({ length: 4 }, () => [] as string[]);
  (remaining.length ? remaining : [coverText]).forEach((text, index) => groups[index % groups.length].push(text));
  const fallback = remaining[0] || coverText;
  const keyword = deck.cta.keyword.trim().slice(0, 8) || "궁금해요";
  const slides: CardSlide[] = [
    {
      id: "chat_cover", order: 0, role: "cover",
      cover: { headline, sub: coverChars.slice(30).join("").trim() || null }, image_url: null,
    },
    ...groups.map((group, index): CardSlide => ({
      id: `chat_${index + 1}`, order: index + 1, role: "chat",
      bubbles: pairedBubbles(group.join("\n") || fallback, index + 1), image_url: null,
    })),
    {
      id: "chat_comment", order: 5, role: "comment_prompt", image_url: null,
      bubbles: [{ id: "bubble_comment", order: 0, speaker: "brand", segments: [{ text: safeText(deck.cta.comment_example) || "어떤 점이 가장 궁금한가요?", bold: false }], reaction: null }],
    },
    {
      id: "chat_cta", order: 6, role: "cta", image_url: null,
      bubbles: [{ id: "bubble_cta", order: 0, speaker: "brand", segments: [{ text: `댓글에 '${keyword}'라고 남겨주세요.`, bold: false }], reaction: null }],
    },
  ];
  const source: CardDeck = {
    contract_version: "2.0", template: "chat_bubble", ratio: deck.ratio,
    theme: structuredClone(deck.theme), brand: structuredClone(deck.brand),
    hook_type: deck.hook_type, cta: { ...structuredClone(deck.cta), keyword },
    slides, revision: deck.revision + 1,
  };
  validateCardDeck(source);
  const migrated = migrateCardDeckV2ToV3(source);
  return { source, deck: synchronizeChatCardDeckV3(migrated, source) };
}
