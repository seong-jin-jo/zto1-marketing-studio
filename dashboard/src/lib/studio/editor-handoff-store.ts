import { withTenant } from "@/lib/db";
import type { EditorHandoff } from "./editor-handoff";

type DraftHandoffRow = {
  id: string;
  idea: string;
  payload: Record<string, unknown> | null;
  status: string;
};

export async function saveEditorHandoff(
  tenantId: string,
  input: { draftId: string | null; idea: string; handoff: EditorHandoff },
): Promise<{ draftId: string; handoff: EditorHandoff }> {
  return withTenant(tenantId, async (sql) => {
    if (input.draftId) {
      const [row] = await sql<{ id: string }[]>`
        UPDATE drafts
        SET idea = CASE WHEN ${input.idea} = '' THEN idea ELSE ${input.idea} END,
            payload = COALESCE(payload, '{}'::jsonb) || ${sql.json({ editor_handoff: input.handoff })}::jsonb,
            updated_at = now()
        WHERE id = ${input.draftId} AND tenant_id = ${tenantId}
        RETURNING id`;
      if (!row) throw new Error("DRAFT_NOT_FOUND");
      return { draftId: row.id, handoff: input.handoff };
    }
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO drafts (tenant_id, idea, payload, status)
      VALUES (${tenantId}, ${input.idea}, ${sql.json({ editor_handoff: input.handoff })}, 'draft')
      RETURNING id`;
    return { draftId: row.id, handoff: input.handoff };
  });
}

export async function loadEditorHandoff(
  tenantId: string,
  draftId: string,
): Promise<{ draft: DraftHandoffRow; handoff: EditorHandoff } | null> {
  return withTenant(tenantId, async (sql) => {
    const [draft] = await sql<DraftHandoffRow[]>`
      SELECT id, idea, payload, status
      FROM drafts
      WHERE id = ${draftId} AND tenant_id = ${tenantId}
      LIMIT 1`;
    const handoff = draft?.payload?.editor_handoff;
    if (!draft || !handoff || typeof handoff !== "object" || Array.isArray(handoff)) return null;
    return { draft, handoff: handoff as EditorHandoff };
  });
}

export async function loadDraftForPublish(
  tenantId: string,
  draftId: string,
): Promise<DraftHandoffRow | null> {
  return withTenant(tenantId, async (sql) => {
    const [draft] = await sql<DraftHandoffRow[]>`
      SELECT id, idea, payload, status
      FROM drafts
      WHERE id = ${draftId} AND tenant_id = ${tenantId}
      LIMIT 1`;
    return draft ?? null;
  });
}

export function editorHandoffFromDraftPayload(payload: unknown): EditorHandoff | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const handoff = (payload as Record<string, unknown>).editor_handoff;
  return handoff && typeof handoff === "object" && !Array.isArray(handoff)
    ? handoff as EditorHandoff
    : null;
}

export async function updateEditorHandoff(
  tenantId: string,
  draftId: string,
  expectedRevision: number,
  handoff: EditorHandoff,
): Promise<boolean> {
  return withTenant(tenantId, async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      UPDATE drafts
      SET payload = jsonb_set(COALESCE(payload, '{}'::jsonb), '{editor_handoff}', ${sql.json(handoff)}::jsonb, true),
          updated_at = now()
      WHERE id = ${draftId}
        AND tenant_id = ${tenantId}
        AND COALESCE((payload->'editor_handoff'->>'revision')::int, 0) = ${expectedRevision}
      RETURNING id`;
    return Boolean(row);
  });
}
