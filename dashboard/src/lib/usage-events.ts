import { withTenant } from "@/lib/db";

type PublicationUsageOutbox = {
  usageEvent: {
    status: "pending";
    platform: string;
  };
};

export type PublicationUsageRelayResult = {
  recorded: boolean;
  alreadyRecorded: boolean;
};

export function publicationUsageOutbox(platform: string): PublicationUsageOutbox {
  return { usageEvent: { status: "pending", platform } };
}

// published_posts 확정과 함께 provider_meta에 pending outbox를 넣은 뒤 이 relay가 usage_events를
// 기록한다. 같은 published_posts 행을 FOR UPDATE로 잠그고 event INSERT와 recorded 전환을 한
// 트랜잭션에서 끝내므로 동시 relay도 발행 1건을 두 번 세지 않는다.
export async function recordPublicationEvent(
  tenantId: string,
  publicationId: string,
  platform: string,
): Promise<PublicationUsageRelayResult> {
  return withTenant(tenantId, async (sql) => {
    const [publication] = await sql<{ usage_status: string | null }[]>`
      SELECT provider_meta #>> '{usageEvent,status}' AS usage_status
        FROM published_posts
       WHERE tenant_id = ${tenantId}::uuid AND id = ${publicationId}::uuid
       FOR UPDATE`;

    if (!publication) throw new Error("발행 사용량 outbox 행을 찾을 수 없습니다.");
    if (publication.usage_status === "recorded") {
      return { recorded: false, alreadyRecorded: true };
    }
    // 옛 published_posts에는 outbox가 없다. 멱등 키 없이 과거 사용량을 새로 만들면 기존 집계와
    // 중복될 수 있으므로, 이 relay가 만든 pending 상태만 처리한다.
    if (publication.usage_status !== "pending") {
      return { recorded: false, alreadyRecorded: false };
    }

    await sql`
      INSERT INTO usage_events (tenant_id, event_type, quantity, meta)
      VALUES (${tenantId}::uuid, ${"publication"}, ${1},
              ${sql.json({ platform, publicationId } as never)})`;
    await sql`
      UPDATE published_posts
         SET provider_meta = jsonb_set(
           COALESCE(provider_meta, '{}'::jsonb),
           '{usageEvent}',
           ${sql.json({ status: "recorded", platform } as never)}::jsonb,
           true
         )
       WHERE tenant_id = ${tenantId}::uuid AND id = ${publicationId}::uuid`;

    return { recorded: true, alreadyRecorded: false };
  });
}

export async function reconcilePendingPublicationEvents(
  tenantId: string,
  limit = 50,
): Promise<{ processed: number; failed: number }> {
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50;
  const rows = await withTenant(tenantId, (sql) => sql<{ id: string; platform: string }[]>`
    SELECT id::text, platform
      FROM published_posts
     WHERE tenant_id = ${tenantId}::uuid
       AND status = 'published'
       AND provider_meta #>> '{usageEvent,status}' = 'pending'
     ORDER BY published_at ASC
     LIMIT ${safeLimit}`);

  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const result = await recordPublicationEvent(tenantId, row.id, row.platform);
      if (result.recorded || result.alreadyRecorded) processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, failed };
}
