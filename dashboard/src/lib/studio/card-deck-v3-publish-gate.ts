import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { withTenant } from "@/lib/db";
import { mediaStore } from "@/lib/media-store";
import { signImageToken } from "@/lib/image-token";
import { cardDeckV3RenderingEnabled } from "@/lib/studio/card-deck-v3-render-feature";
import { parseCardDeckV3, type CardDeckV3 } from "@/lib/studio/card-element-contract";
import { cardSlideRenderModel } from "@/lib/studio/card-render-model";
import { renderCardSlidePng } from "@/lib/studio/card-slide-render";
import { resolveCardAssetUrls } from "@/lib/studio/card-assets";
import {
  CARD_DECK_V3_PUBLISH_BLOCK_CODE,
  CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE,
} from "@/lib/studio/card-deck-v3-publish-contract";

export { CARD_DECK_V3_PUBLISH_BLOCK_CODE, CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CardDeckV3PublishBlockedError extends Error {
  readonly code = CARD_DECK_V3_PUBLISH_BLOCK_CODE;
  readonly status = 409;

  constructor() {
    super(CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE);
    this.name = "CardDeckV3PublishBlockedError";
  }
}

export interface PreparedCardDeckV3Publish {
  imageUrl: string;
  imageUrls: string[];
  filenames: string[];
}

type DraftRenderRow = { payload: Record<string, unknown> | null };
const inflightRenders = new Map<string, Promise<PreparedCardDeckV3Publish | null>>();

function deliveryUrl(tenantId: string, filename: string): string {
  const token = signImageToken(tenantId, filename);
  const origin = process.env.OSMU_PUBLIC_URL?.replace(/\/+$/, "") ?? "";
  let parsed: URL;
  try { parsed = new URL(origin); } catch { throw new Error("CARD_RENDER_PUBLIC_URL_MISSING"); }
  const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!token || (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:"))) {
    throw new Error("CARD_RENDER_PUBLIC_URL_MISSING");
  }
  return `${origin}/api/images/deliver/${encodeURIComponent(token)}`;
}

function cardAssetIds(deck: CardDeckV3): string[] {
  const ids = new Set<string>();
  for (const slide of deck.slides) {
    if (slide.background.kind === "image") ids.add(slide.background.asset_id);
    for (const element of slide.elements) {
      if ((element.type === "image" || element.type === "sticker" || element.type === "logo") && !element.asset_id.startsWith("builtin:")) ids.add(element.asset_id);
    }
  }
  return [...ids];
}

async function renderDraftDeck(tenantId: string, draftId: string, payload: Record<string, unknown>, deck: CardDeckV3): Promise<PreparedCardDeckV3Publish> {
  const assetUrls = await resolveCardAssetUrls(tenantId, cardAssetIds(deck), (filename) => deliveryUrl(tenantId, filename));
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(deck)).digest("hex").slice(0, 16);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "card-slide-render-"));
  const filenames: string[] = [];
  try {
    for (const slide of [...deck.slides].sort((left, right) => left.order - right.order)) {
      const filename = `card-v3-${draftId.replaceAll("-", "")}-${slide.order}-${fingerprint}.png`;
      filenames.push(filename);
      if (await mediaStore.exists(tenantId, filename)) continue;
      const outputPath = path.join(tmpDir, filename);
      await renderCardSlidePng({ model: cardSlideRenderModel(deck, slide.id, assetUrls), outputPath });
      await mediaStore.put(tenantId, filename, fs.readFileSync(outputPath), "image/png");
    }
    const imageUrls = filenames.map((filename) => deliveryUrl(tenantId, filename));
    const existingImg = payload.img && typeof payload.img === "object" && !Array.isArray(payload.img)
      ? payload.img as Record<string, unknown>
      : {};
    const img = {
      ...existingImg,
      url: imageUrls[0], file: imageUrls[0], filename: filenames[0], imageUrls,
      textEmbedded: true, textSourceRecoverable: true, aspectRatio: deck.ratio,
    };
    const legacy = payload.cardDeck && typeof payload.cardDeck === "object" && !Array.isArray(payload.cardDeck)
      ? structuredClone(payload.cardDeck) as { slides?: Array<Record<string, unknown>> }
      : null;
    if (legacy?.slides?.length === imageUrls.length) {
      legacy.slides = legacy.slides.map((slide, index) => ({ ...slide, image_url: imageUrls[index] }));
    }
    const updated = await withTenant(tenantId, (sql) => sql<{ id: string }[]>`
      UPDATE drafts
         SET payload = COALESCE(payload, '{}'::jsonb)
           || ${sql.json({ img, ...(legacy ? { cardDeck: legacy } : {}) } as Parameters<typeof sql.json>[0])}::jsonb,
             updated_at = now()
       WHERE tenant_id = ${tenantId}::uuid AND id = ${draftId}::uuid
         AND payload->'cardDeckV3' = ${JSON.stringify(deck)}::jsonb
       RETURNING id
    `);
    if (updated.length !== 1) throw new Error("CARD_RENDER_STALE_DECK");
    return { imageUrl: imageUrls[0], imageUrls, filenames };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** 발행·예약·큐 등록이 공유하는 v3→PNG 단일 경계. flag off면 기존 409를 유지한다. */
export async function prepareDraftCardDeckV3ForPublish(tenantId: string | null, draftId: unknown): Promise<PreparedCardDeckV3Publish | null> {
  if (!tenantId || typeof draftId !== "string" || !UUID_RE.test(draftId)) return null;
  const [row] = await withTenant(tenantId, (sql) => sql<DraftRenderRow[]>`
    SELECT payload FROM drafts WHERE tenant_id = ${tenantId}::uuid AND id = ${draftId}::uuid LIMIT 1
  `);
  const rawDeck = row?.payload?.cardDeckV3;
  if (rawDeck == null) return null;
  if (!cardDeckV3RenderingEnabled()) throw new CardDeckV3PublishBlockedError();
  const deck = parseCardDeckV3(rawDeck);
  const key = `${tenantId}:${draftId}:${deck.revision}:${deck.id}`;
  const existing = inflightRenders.get(key);
  if (existing) return existing;
  const work = renderDraftDeck(tenantId, draftId, row.payload ?? {}, deck).finally(() => inflightRenders.delete(key));
  inflightRenders.set(key, work);
  return work;
}

export async function draftHasCardDeckV3(tenantId: string, draftId: unknown): Promise<boolean> {
  if (typeof draftId !== "string" || !UUID_RE.test(draftId)) return false;
  const [row] = await withTenant(tenantId, (sql) => sql<{ has_card_deck_v3: boolean }[]>`
    SELECT COALESCE(payload ? 'cardDeckV3' AND payload->'cardDeckV3' <> 'null'::jsonb, false) AS has_card_deck_v3
      FROM drafts
     WHERE tenant_id = ${tenantId}::uuid AND id = ${draftId}::uuid
     LIMIT 1
  `);
  return row?.has_card_deck_v3 === true;
}

export async function assertDraftCanEnterPublishQueue(tenantId: string | null, draftId: unknown): Promise<PreparedCardDeckV3Publish | null> {
  return prepareDraftCardDeckV3ForPublish(tenantId, draftId);
}

export function applyPreparedCardDeckV3Images(
  post: Record<string, unknown>,
  prepared: PreparedCardDeckV3Publish | null,
): void {
  if (!prepared) return;
  post.imageUrl = prepared.imageUrl;
  post.imageUrls = prepared.imageUrls;
}

export function payloadHasCardDeckV3(payload: Record<string, unknown> | null | undefined): boolean {
  return Boolean(payload)
    && Object.prototype.hasOwnProperty.call(payload, "cardDeckV3")
    && payload?.cardDeckV3 != null;
}

export function cardDeckV3PublishBlockedResponse(): Response {
  return Response.json({
    ok: false,
    code: CARD_DECK_V3_PUBLISH_BLOCK_CODE,
    error: CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE,
  }, { status: 409, headers: { "Cache-Control": "no-store" } });
}

export function cardDeckV3PublishBlockedErrorResponse(error: CardDeckV3PublishBlockedError): Response {
  return Response.json({ ok: false, code: error.code, error: error.message }, {
    status: error.status,
    headers: { "Cache-Control": "no-store" },
  });
}
