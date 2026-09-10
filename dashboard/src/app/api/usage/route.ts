import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { withTenant } from "@/lib/db";

interface DailyUsage {
  aiGenerations: number;
  publications: number;
  cronRuns: number;
  apiCalls: number;
}

interface UsageRow {
  day: string;
  event_type: string;
  quantity: number | string;
}

function emptyDay(): DailyUsage {
  return { aiGenerations: 0, publications: 0, cronRuns: 0, apiCalls: 0 };
}

function addUsage(target: DailyUsage, eventType: string, rawQuantity: number | string): void {
  const quantity = Number(rawQuantity) || 0;
  // 2026-09-06: 미디어 생성을 고객에게 열면서 mediaGeneration 이 새로 들어온다. 이 분류에
  // 안 넣으면 usage_events 에는 쌓이는데 화면 합계에서 빠져 고객이 자기 사용량을 못 본다.
  if (eventType === "aiGeneration" || eventType === "shortsGeneration" || eventType === "mediaGeneration") {
    target.aiGenerations += quantity;
  } else if (eventType === "publication" || eventType === "shortsVideoMinute") {
    target.publications += quantity;
  } else if (eventType === "cronRun") {
    target.cronRuns += quantity;
  } else if (eventType === "apiCall") {
    target.apiCalls += quantity;
  }
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, null);
  return runWithTenant(tenantId, async () => {
    const now = new Date();
    const todayStr = toDateStr(now);
    const monthStr = todayStr.slice(0, 7);

    const monday = new Date(now);
    const mondayOffset = monday.getUTCDay() === 0 ? 6 : monday.getUTCDay() - 1;
    monday.setUTCDate(monday.getUTCDate() - mondayOffset);
    const mondayStr = toDateStr(monday);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 29);
    const thirtyDaysAgoStr = toDateStr(thirtyDaysAgo);
    const monthStartStr = `${monthStr}-01`;
    const queryStart = monthStartStr < thirtyDaysAgoStr ? monthStartStr : thirtyDaysAgoStr;

    if (!tenantId) {
      return Response.json({
        source: "usage_events",
        today: emptyDay(),
        thisWeek: emptyDay(),
        thisMonth: emptyDay(),
        daily: {},
        tier: "starter",
        quota: null,
      });
    }

    try {
      let tier = "starter";
      let quota: Record<string, unknown> | null = null;
      let rows: UsageRow[] = [];

      await withTenant(tenantId, async (sql) => {
        rows = await sql<UsageRow[]>`
          SELECT
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
            event_type,
            SUM(quantity)::float8 AS quantity
          FROM usage_events
          WHERE tenant_id = ${tenantId}
            AND created_at >= ${queryStart}::date
          GROUP BY day, event_type
          ORDER BY day DESC`;

        const [tenant] = await sql<{ tier: string }[]>`
          SELECT tier FROM tenants WHERE id = ${tenantId} LIMIT 1`;
        if (tenant?.tier) tier = tenant.tier;

        const [quotaRow] = await sql<Record<string, unknown>[]>`
          SELECT * FROM usage_quotas
          WHERE tenant_id = ${tenantId} AND period = ${monthStr} LIMIT 1`;
        if (quotaRow) quota = quotaRow;
      });

      const today = emptyDay();
      const thisWeek = emptyDay();
      const thisMonth = emptyDay();
      const daily: Record<string, DailyUsage> = {};

      for (const row of rows) {
        if (row.day === todayStr) addUsage(today, row.event_type, row.quantity);
        if (row.day >= mondayStr && row.day <= todayStr) addUsage(thisWeek, row.event_type, row.quantity);
        if (row.day.startsWith(monthStr)) addUsage(thisMonth, row.event_type, row.quantity);
        if (row.day >= thirtyDaysAgoStr && row.day <= todayStr) {
          daily[row.day] ||= emptyDay();
          addUsage(daily[row.day], row.event_type, row.quantity);
        }
      }

      return Response.json({
        source: "usage_events",
        today,
        thisWeek,
        thisMonth,
        daily,
        tier,
        quota,
      });
    } catch {
      return Response.json(
        { error: "사용량 DB 원장을 읽을 수 없습니다.", source: "usage_events" },
        { status: 503 },
      );
    }
  });
}
