import { withTenant } from "@/lib/db";
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

export async function assertDraftCanEnterPublishQueue(tenantId: string | null, draftId: unknown): Promise<void> {
  if (tenantId && await draftHasCardDeckV3(tenantId, draftId)) {
    throw new CardDeckV3PublishBlockedError();
  }
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
