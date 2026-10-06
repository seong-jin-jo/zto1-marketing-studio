import crypto from "node:crypto";
import { parseCardDeckV3, type CardDeckV3, type CardSlideV3 } from "./card-element-contract";
import { verifyMediaTokenSignature } from "@/lib/media-token";
import { isIntroOutroStale, normalizeVideoEdit, validateVideoEdit, type VideoEdit } from "./video-edit-contract";
import { readSubtitleBakeLineage } from "./video-bake-lineage";
import { alignVideoEditToRenderSource, resolveVideoRenderSourceFilename } from "./video-publish-filename";
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

export class VideoExportSourceError extends Error {
  constructor(readonly code: "SUBTITLE_INPUT_ALREADY_BAKED" | "VIDEO_SOURCE_MISSING", message: string) {
    super(message);
    this.name = "VideoExportSourceError";
  }
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
  const explicitSource = typeof editSource.filename === "string" && editSource.filename ? editSource.filename : undefined;
  const currentFilename = (typeof vid.filename === "string" ? vid.filename : null)
    || filenameFromDeliveryUrl(vid.file, tenantId)
    || filenameFromDeliveryUrl(vid.url, tenantId)
    || explicitSource;
  if (!currentFilename) throw new VideoExportSourceError("VIDEO_SOURCE_MISSING", "영상 원본을 찾을 수 없습니다");
  const registryLineage = readSubtitleBakeLineage(tenantId, currentFilename);
  const persistedState = vid.subtitleLineageState === "baked" || vid.subtitleLineageState === "unbaked" || vid.subtitleLineageState === "unknown"
    ? vid.subtitleLineageState
    : vid.subtitlesBaked === true ? "baked" : vid.subtitlesBaked === false ? "unbaked" : undefined;
  const recordedSource = registryLineage.state === "baked" ? registryLineage.sourceFilename : undefined;
  const currentIsKnownComposite = Boolean(edit.introOutro?.compositeFilename === currentFilename
    && !isIntroOutroStale(edit.introOutro, currentFilename));
  const lineageState = registryLineage.state === "unknown" ? persistedState ?? "unknown" : registryLineage.state;
  const unbakedFilename = recordedSource
    || explicitSource
    || (lineageState === "unbaked" || currentIsKnownComposite ? currentFilename : undefined);
  if (!unbakedFilename) {
    throw new VideoExportSourceError(
      "SUBTITLE_INPUT_ALREADY_BAKED",
      "자막이 이미 들어간 영상의 자막 없는 원본을 찾을 수 없습니다",
    );
  }
  const sourceFilename = resolveVideoRenderSourceFilename(unbakedFilename, edit.introOutro);
  const renderEdit = alignVideoEditToRenderSource(edit, edit.introOutro, unbakedFilename);
  const lines = Array.isArray(payload.editLines) ? payload.editLines.filter((line): line is string => typeof line === "string") : [];
  const editFormat = payload.editFormat && typeof payload.editFormat === "object" ? payload.editFormat as Record<string, unknown> : {};
  const subtitleSize: SubtitleSize = editFormat.subtitleSize === "작게" || editFormat.subtitleSize === "크게" ? editFormat.subtitleSize : "보통";
  const source = { sourceFilename, edit: renderEdit, lines, subtitleSize };
  return { ...source, sourceHash: sha256Hex(canonicalJson(source)), sourceRevision: edit.revision };
}
