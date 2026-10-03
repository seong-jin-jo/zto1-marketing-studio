import { withTenant } from "@/lib/db";
import { deckProjection, type CardDeck } from "@/lib/studio/card-deck-contract";
import { createEditorHandoff } from "@/lib/studio/editor-handoff";
import { saveEditorHandoff } from "@/lib/studio/editor-handoff-store";
import type { DerivationDraftSink } from "./service";

/**
 * 카드 갈래는 계약 v2 덱이 진실원이다(D-2026-09-21-2 OD-A). `editor_handoff.payload` 는
 * 아직(F4·PR4 전까지) 납작한 `slides:[{text}]` 만 아는 소비자(발행 큐)를 위해 `deckProjection`
 * 으로 만든 투영을 싣는다. 편집실이 여는 진실원은 `drafts.payload.cardDeck` 이고, 그 값은
 * `saveEditorHandoff` 가 초안을 만드는 트랜잭션과 **별도** 트랜잭션인 아래 `UPDATE drafts`
 * 가 채운다(같은 트랜잭션이 아니다 — 한 줄 위 문장이 실물과 어긋났던 자리, 회장 리뷰
 * 2026-09-21). 그래서 UPDATE 가 실패하면 초안·handoff 는 이미 커밋된 채로 `cardDeck` 이
 * 없는 반쪽 초안이 남는다. 그 자리를 남기지 않으려고 실패 시 초안을 보상 삭제한다.
 */
function flattenForHandoff(deck: CardDeck): { id: string; order: number; text: string; image_url: string | null }[] {
  const { lines, refs } = deckProjection(deck);
  return lines.map((text, index) => ({ id: refs[index]?.bubbleId ?? refs[index]?.slideId ?? `line-${index}`, order: index, text, image_url: null }));
}

// 파생물은 한 덩어리로 뭉치지 않고 갈래마다 편집실 작업물 하나가 된다.
// 회원이 편집실에서 카드뉴스와 영상을 각각 열어 고칠 수 있어야 하기 때문이다.
export class EditorDerivationSink implements DerivationDraftSink {
  async createDraft(input: {
    workspaceId: string;
    summary: string;
    jobId: string;
    candidateId: string;
    payload: Parameters<DerivationDraftSink["createDraft"]>[0]["payload"];
  }): Promise<{ draftId: string; handoffId: string }> {
    const isCard = input.payload.kind === "card";
    const deck = isCard ? (input.payload as Extract<typeof input.payload, { kind: "card" }>).deck : null;
    const handoffPayload = deck
      ? { kind: "card" as const, slides: flattenForHandoff(deck) }
      : input.payload;
    const handoff = createEditorHandoff({
      kind: handoffPayload.kind,
      summary: input.summary,
      source: { generation_id: input.jobId, candidate_id: input.candidateId },
      payload: handoffPayload,
    });
    const saved = await saveEditorHandoff(input.workspaceId, {
      draftId: null,
      idea: input.summary,
      handoff,
    });
    if (deck) {
      // brand.display_name 은 모델이 지어내지 않는다(설계 §5 F3). 저장 시점에 워크스페이스
      // 표시명으로 채운다. 조회 실패는 파생 자체를 실패시키지 않는다 — 자리표시 값으로 남고
      // 편집실에서 고칠 수 있다(실수.md 2026-09-10 "안 찾아보고 넘기는 것이 회피"의 반대,
      // 여기서는 이미 찾아봤고 실패해도 회원이 결과를 잃지 않는 쪽을 택한다).
      const displayName = await this.workspaceDisplayName(input.workspaceId);
      const finalDeck: CardDeck = displayName ? { ...deck, brand: { ...deck.brand, display_name: displayName } } : deck;
      try {
        await withTenant(input.workspaceId, (sql) => sql`
          UPDATE drafts
          SET payload = COALESCE(payload, '{}'::jsonb) || ${sql.json({ cardDeck: finalDeck, editLines: deckProjection(finalDeck).lines })}::jsonb
          WHERE id = ${saved.draftId} AND tenant_id = ${input.workspaceId}`);
      } catch (error) {
        // 초안·handoff 는 이미 커밋됐다. cardDeck 없는 반쪽 초안을 편집실에 남기지 않도록
        // 보상 삭제한다 — 회원은 다시 확정을 눌러 새로 받는다(실수.md 반쪽 상태 방치 금지).
        console.warn(`[derivation-sink] draft ${saved.draftId} cardDeck UPDATE 실패, 보상 삭제`, error);
        await this.deleteDrafts(input.workspaceId, [saved.draftId]);
        throw error;
      }
    }
    return { draftId: saved.draftId, handoffId: saved.handoff.handoff_id };
  }

  private async workspaceDisplayName(workspaceId: string): Promise<string | null> {
    try {
      const rows = await withTenant(workspaceId, (sql) => sql<{ name: string }[]>`
        SELECT name FROM tenants WHERE id = ${workspaceId}`);
      const name = rows[0]?.name?.trim();
      return name || null;
    } catch (error) {
      console.warn(`[derivation-sink] workspace ${workspaceId} 표시명 조회 실패, 자리표시 값으로 진행`, error);
      return null;
    }
  }

  async deleteDrafts(workspaceId: string, draftIds: readonly string[]): Promise<void> {
    if (draftIds.length === 0) return;
    await withTenant(workspaceId, async (sql) => {
      await sql`
        DELETE FROM drafts
        WHERE tenant_id = ${workspaceId} AND id = ANY(${sql.array([...draftIds])}::uuid[])`;
    });
  }
}
