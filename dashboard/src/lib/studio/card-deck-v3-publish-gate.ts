import { withTenant } from "@/lib/db";

export const CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE = "자유 배치 결과물 만들기는 다음 업데이트에서 열립니다. 기본 편집으로 돌아가면 지금 발행할 수 있습니다.";
export const CARD_DECK_V3_PUBLISH_BLOCK_CODE = "CARD_DECK_V3_RENDER_PENDING";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function cardDeckV3PublishBlockedResponse(): Response {
  return Response.json({
    ok: false,
    code: CARD_DECK_V3_PUBLISH_BLOCK_CODE,
    error: CARD_DECK_V3_PUBLISH_BLOCK_MESSAGE,
  }, { status: 409, headers: { "Cache-Control": "no-store" } });
}
