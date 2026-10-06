import type { Bubble, CardDeck, CardSlide } from "./card-deck-contract";
import {
  CARD_LOGICAL_HEIGHT,
  CARD_LOGICAL_WIDTH,
  type CardDeckV3,
  type CardElement,
  type ImageElement,
  type CardSlideV3,
  type TextElement,
} from "./card-element-contract";

const CONVERTER_VERSION = "card-deck-v2-to-v3@1" as const;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/** 브라우저와 서버가 같은 migration id를 만들도록 Node crypto에 기대지 않는 SHA-256. */
export function sha256Text(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const k = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const a = words[index - 15];
      const b = words[index - 2];
      const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,hh] = h;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + k[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0]=(h[0]+a)>>>0; h[1]=(h[1]+b)>>>0; h[2]=(h[2]+c)>>>0; h[3]=(h[3]+d)>>>0;
    h[4]=(h[4]+e)>>>0; h[5]=(h[5]+f)>>>0; h[6]=(h[6]+g)>>>0; h[7]=(h[7]+hh)>>>0;
  }
  return [...h].map((value) => value.toString(16).padStart(8, "0")).join("");
}

function safePart(value: string): string {
  if (value.length <= 120 && /^[A-Za-z0-9:_.-]+$/.test(value) && !value.includes("..")) return value;
  const suffix = sha256Text(value).slice(0, 12);
  const safe = value.replace(/[^A-Za-z0-9:_.-]/g, "_").replace(/\.\./g, "_");
  const prefix = safe.slice(0, 120 - suffix.length - 1) || "id";
  return `${prefix}_${suffix}`;
}

function hexColor(value: string, fallback: `#${string}`): `#${string}` {
  return /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/.test(value) ? value as `#${string}` : fallback;
}

function slideText(slide: CardSlide): string {
  if (slide.role === "cover") return [slide.cover?.headline ?? "", slide.cover?.sub ?? ""].filter(Boolean).join("\n");
  return [...(slide.bubbles ?? [])]
    .sort((left, right) => left.order - right.order)
    .map((bubble) => bubble.segments.map((segment) => segment.text).join(""))
    .join("\n");
}

function textElement(id: string, text: string, order: number, total: number, position: CardSlide["position"]): TextElement {
  const y = position === "top" ? 70 : position === "bottom" ? CARD_LOGICAL_HEIGHT["4:5"] - 510 : 425;
  return {
    id, type: "text", name: "글", x: 120, y, width: 840, height: 440, rotation: 0, z_index: order,
    opacity: 1, locked: false, hidden: false, text,
    style: {
      font_family: "Pretendard Variable", font_size: order === 0 ? 76 : 60, font_weight: 700,
      line_height: 1.2, letter_spacing: 0, color: order === total - 1 ? "#FFFFFF" : "#111111",
      align: "center", vertical_align: "middle",
    },
  };
}

function bubbleElements(slide: CardSlide): CardElement[] {
  const elements: CardElement[] = [];
  if (slide.role === "cover" && slide.cover) {
    elements.push(textElement(safePart(`el_${slide.id}_cover`), slide.cover.headline, 0, 2, "top"));
    if (slide.cover.sub) elements.push({ ...textElement(safePart(`el_${slide.id}_sub`), slide.cover.sub, 1, 3, "center"), y: 650, height: 260, style: { ...textElement("x", "", 1, 3, "center").style, font_size: 38, font_weight: 500 } });
    return elements.map((element, index) => ({ ...element, z_index: index }));
  }
  for (const bubble of [...(slide.bubbles ?? [])].sort((left, right) => left.order - right.order)) {
    const text = bubble.segments.map((segment) => segment.text).join("");
    elements.push({
      ...textElement(safePart(`el_${bubble.id}`), text, elements.length, Math.max(2, slide.bubbles?.length ?? 2), "top"),
      name: bubble.speaker === "reader" ? "독자 말풍선" : "브랜드 말풍선",
      x: bubble.speaker === "reader" ? 420 : 70,
      y: 100 + elements.length * 230,
      width: 590,
      height: 190,
      style: { ...textElement("x", "", 1, 3, "center").style, font_size: 38, font_weight: bubble.segments.some((segment) => segment.bold) ? 700 : 500, align: bubble.speaker === "reader" ? "right" : "left" },
    });
  }
  return elements.map((element, index) => ({ ...element, z_index: index }));
}

export interface CardDeckV2ToV3Options {
  coverImageAssetIds?: Readonly<Record<string, string>>;
}

function plainElements(source: CardDeck, slide: CardSlide, index: number, text: string, options: CardDeckV2ToV3Options): CardElement[] {
  const elements: CardElement[] = [];
  if (slide.cover_image_url) {
    const assetId = options.coverImageAssetIds?.[slide.cover_image_url];
    if (!assetId) throw new Error("CARD_COVER_IMAGE_ASSET_REQUIRED");
    const image: ImageElement = {
      id: safePart(`el_${slide.id}_photo`), type: "image", name: "표지 사진",
      x: 0, y: 0, width: CARD_LOGICAL_WIDTH, height: CARD_LOGICAL_HEIGHT[source.ratio],
      rotation: 0, z_index: 0, opacity: 1, locked: false, hidden: false,
      asset_id: assetId, alt: "표지 사진", decorative: true, fit: "cover",
      crop: { x: 0, y: 0, width: 1, height: 1 }, corner_radius: 0,
    };
    elements.push(image);
  }
  if (text.trim()) elements.push({ ...textElement(safePart(`el_${slide.id}_text`), text, index, source.slides.length, slide.position), z_index: elements.length });
  return elements;
}

export function migrateCardDeckV2ToV3(source: CardDeck, options: CardDeckV2ToV3Options = {}): CardDeckV3 {
  const sourceSha256 = sha256Text(canonicalJson(source));
  const deckId = `deck_migrated_${sourceSha256.slice(0, 16)}`;
  const slides: CardSlideV3[] = source.slides.map((slide, index) => {
    const text = slideText(slide);
    const isChat = source.template === "chat_bubble";
    const coverAssetId = slide.cover_image_url ? options.coverImageAssetIds?.[slide.cover_image_url] : undefined;
    if (slide.cover_image_url && !coverAssetId) throw new Error("CARD_COVER_IMAGE_ASSET_REQUIRED");
    return {
      id: safePart(slide.id), order: slide.order,
      role: slide.role === "cover" ? "cover" : slide.role === "cta" ? "cta" : "body",
      content_state: text.trim() ? "filled" : "empty",
      background: isChat && coverAssetId
        ? { kind: "image", asset_id: coverAssetId, crop: { x: 0, y: 0, width: 1, height: 1 }, overlay: "#000000" }
        : { kind: "solid", color: !isChat && index === source.slides.length - 1 ? hexColor(source.theme.foreground, "#111111") : hexColor(source.theme.background, "#FFF9F0") },
      base: isChat
        ? { kind: "chat_bubble", cover: slide.cover ? structuredClone(slide.cover) : null, bubbles: structuredClone(slide.bubbles ?? []) }
        : { kind: "plain", lines: text ? [text] : [] },
      elements: isChat ? bubbleElements(slide) : plainElements(source, slide, index, text, options),
    };
  });
  return {
    contract_version: "3.0", id: deckId, template: source.template, ratio: source.ratio, revision: source.revision,
    theme: {
      background: hexColor(source.theme.background, "#FFF9F0"),
      foreground: hexColor(source.theme.foreground, "#111111"),
      accent: hexColor(source.theme.accent, "#2563EB"),
    },
    brand: structuredClone(source.brand), hook_type: source.hook_type, cta: structuredClone(source.cta), slides,
    migration: { source_contract_version: "2.0", source_sha256: sourceSha256, converter_version: CONVERTER_VERSION },
  };
}

function patchBubbleFromElement(bubble: Bubble, elements: CardElement[]): Bubble {
  const element = elements.find((candidate) => candidate.id === safePart(`el_${bubble.id}`) && candidate.type === "text");
  if (!element || element.type !== "text") return structuredClone(bubble);
  const current = bubble.segments.map((segment) => segment.text).join("");
  if (element.text === current) return structuredClone(bubble);
  return { ...structuredClone(bubble), segments: [{ text: element.text, bold: bubble.segments.some((segment) => segment.bold) }] };
}

function patchCoverFromElements(slideId: string, cover: NonNullable<CardSlide["cover"]>, elements: CardElement[]): NonNullable<CardSlide["cover"]> {
  const headlineElement = elements.find((candidate) => candidate.id === safePart(`el_${slideId}_cover`) && candidate.type === "text");
  const subElement = elements.find((candidate) => candidate.id === safePart(`el_${slideId}_sub`) && candidate.type === "text");
  return {
    headline: headlineElement?.type === "text" ? headlineElement.text : cover.headline,
    sub: subElement?.type === "text" ? subElement.text || null : cover.sub,
  };
}

/** S2 동안 v2 소비자를 유지하기 위한 projection. 원본에 없는 필드는 만들지 않는다. */
export function projectCardDeckV3ToV2(deck: CardDeckV3, source: CardDeck): CardDeck {
  const projected = structuredClone(source);
  projected.ratio = deck.ratio;
  projected.theme = structuredClone(deck.theme);
  projected.brand = structuredClone(deck.brand);
  projected.hook_type = deck.hook_type;
  projected.cta = structuredClone(deck.cta);
  projected.revision = deck.revision;
  projected.slides = projected.slides.map((legacySlide) => {
    const slide = deck.slides.find((candidate) => candidate.id === safePart(legacySlide.id));
    if (!slide) return legacySlide;
    if (slide.base.kind === "chat_bubble") {
      return {
        ...legacySlide,
        ...(legacySlide.role === "cover" && slide.base.cover
          ? { cover: patchCoverFromElements(legacySlide.id, slide.base.cover, slide.elements) }
          : {}),
        ...(legacySlide.bubbles ? { bubbles: legacySlide.bubbles.map((bubble) => patchBubbleFromElement(bubble, slide.elements)) } : {}),
      };
    }
    const text = slide.elements.find((element) => element.type === "text");
    const value = text?.type === "text" ? text.text : slide.base.lines.join("\n");
    if (legacySlide.role === "cover" && legacySlide.cover) {
      const [headline = "", ...sub] = value.split("\n");
      return { ...legacySlide, cover: { headline, sub: sub.length ? sub.join("\n") : null } };
    }
    if (legacySlide.bubbles?.length) {
      const [first, ...rest] = legacySlide.bubbles;
      return { ...legacySlide, bubbles: [{ ...first, segments: [{ text: value, bold: first.segments.some((segment) => segment.bold) }] }, ...rest] };
    }
    return legacySlide;
  });
  return projected;
}
