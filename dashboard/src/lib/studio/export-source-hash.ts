import crypto from "node:crypto";
import { parseCardDeckV3, type CardDeckV3, type CardSlideV3 } from "./card-element-contract";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export function sha256Hex(value: string | Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function cardDeckExportSource(value: unknown): { deck: CardDeckV3; sourceHash: string; sourceRevision: number } {
  const deck = parseCardDeckV3(value);
  return {
    deck,
    sourceHash: sha256Hex(canonicalJson(deck)),
    sourceRevision: deck.revision,
  };
}

export function cardSlideSourceHash(deck: CardDeckV3, slide: CardSlideV3): string {
  return sha256Hex(canonicalJson({
    contract_version: deck.contract_version,
    deck_id: deck.id,
    ratio: deck.ratio,
    theme: deck.theme,
    brand: deck.brand,
    slide,
  }));
}

export function firstEmptySlide(deck: CardDeckV3): { order: number; number: number; item_key: string } | null {
  const slide = deck.slides.find((candidate) => candidate.content_state === "empty");
  return slide ? { order: slide.order, number: slide.order + 1, item_key: slide.id } : null;
}
