// 발행 1건을 사용량 정본(usage_events)에 남긴다.
//
// 2026-09-16 실측(j.the.great.investor): 실제로 Threads·YouTube 에 2건을 방금 발행했는데
// 성과실 "오늘 생성 5 · 발행 0 · 크론 0" 이 그대로 0 이었다. /api/usage 는 usage_events 의
// event_type='publication' 합계를 센다(dashboard/src/app/api/usage/route.ts). 그런데
// /api/publish 와 /api/video/publish 어느 쪽도 성공한 발행에 이 이벤트를 한 번도 쓴 적이
// 없었다. published_posts 에는 남는데(그래서 발행 자체는 됐다) 사용량 집계 표에는 한
// 번도 닿지 않았다. 생성(higgsfield.ts recordMediaGenerationEvent)에는 있던 것이 발행에는
// 빠져 있었다.
export async function recordPublicationEvent(
  tenantId: string,
  platform: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { withTenant } = await import("@/lib/db");
    await withTenant(tenantId, (sql) => sql`
      INSERT INTO usage_events (tenant_id, event_type, quantity, meta)
      VALUES (${tenantId}, ${"publication"}, ${1}, ${sql.json({ platform, ...meta })})`);
  } catch (e) {
    // 기록 실패가 이미 성공한 발행을 뒤집지 않는다(higgsfield.ts recordMediaGenerationEvent와 같은 원칙).
    if (process.env.OSMU_DEBUG) console.error("[usage-events] publication 기록 실패(무시):", e);
  }
}
