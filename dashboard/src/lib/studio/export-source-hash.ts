import crypto from "node:crypto";
import { parseCardDeckV3, type CardDeckV3, type CardSlideV3 } from "./card-element-contract";
import { verifyMediaTokenSignature } from "@/lib/media-token";
import { normalizeVideoEdit, validateVideoEdit, type VideoEdit } from "./video-edit-contract";
import { alignVideoEditToRenderSource } from "./video-publish-filename";
import type { SubtitleSize } from "./video-subtitle";

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

export interface VideoExportSource {
  sourceFilename: string;
  edit: VideoEdit;
  lines: string[];
  subtitleSize: SubtitleSize;
  sourceHash: string;
  sourceRevision: number;
}

function filenameFromDeliveryUrl(value: unknown, tenantId: string): string | null {
  if (typeof value !== "string") return null;
  const marker = "/api/media/";
  const at = value.indexOf(marker);
  if (at < 0) return null;
  const token = decodeURIComponent(value.slice(at + marker.length).split(/[?#]/)[0]);
  const payload = verifyMediaTokenSignature(token);
  return payload?.tenantId === tenantId ? payload.filename : null;
}

export function videoExportSource(payloadValue: unknown, tenantId: string): VideoExportSource {
  const payload = payloadValue && typeof payloadValue === "object" ? payloadValue as Record<string, unknown> : {};
  validateVideoEdit(payload.videoEdit);
  const edit = normalizeVideoEdit(payload.videoEdit);
  const vid = payload.vid && typeof payload.vid === "object" ? payload.vid as Record<string, unknown> : {};
  const editSource = vid.editSource && typeof vid.editSource === "object" ? vid.editSource as Record<string, unknown> : {};
  const sourceFilename = edit.introOutro?.compositeFilename
    || (typeof editSource.filename === "string" ? editSource.filename : null)
    || filenameFromDeliveryUrl(vid.file, tenantId)
    || filenameFromDeliveryUrl(vid.url, tenantId);
  if (!sourceFilename) throw new Error("VIDEO_SOURCE_MISSING");
  const renderEdit = edit.introOutro?.compositeFilename === sourceFilename
    ? alignVideoEditToRenderSource(edit, edit.introOutro, edit.introOutro.sourceFilename)
    : edit;
  const lines = Array.isArray(payload.editLines) ? payload.editLines.filter((line): line is string => typeof line === "string") : [];
  const editFormat = payload.editFormat && typeof payload.editFormat === "object" ? payload.editFormat as Record<string, unknown> : {};
  const subtitleSize: SubtitleSize = editFormat.subtitleSize === "작게" || editFormat.subtitleSize === "크게" ? editFormat.subtitleSize : "보통";
  const source = { sourceFilename, edit: renderEdit, lines, subtitleSize };
  return { ...source, sourceHash: sha256Hex(canonicalJson(source)), sourceRevision: edit.revision };
}
