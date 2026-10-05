import { withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { channelAccountBelongsToProvider } from "@/lib/channel-accounts";
import {
  CardDeckV3PublishBlockedError,
  cardDeckV3PublishBlockedErrorResponse,
  prepareDraftCardDeckV3ForPublish,
} from "@/lib/studio/card-deck-v3-publish-gate";

// P6 예약 발행 API — schedules 테이블(테넌트별, RLS 방어심층).
//   GET  ?tenant_id=...           → 워크스페이스 예약 목록(최근 50)
//   POST { tenant_id, draft_id?, platforms[], scheduled_at, payload? }
//          → schedules INSERT(withTenant) + (선택) 게이트웨이 promote 위임.
// 스케줄러(게이트웨이 크론)가 scheduled_at 도래 시 status=scheduled 행을 발행한다.
// 모든 테넌트-스코프 쿼리는 withTenant 경유(L1 RLS). 하드코딩 금지(CLAUDE.md 서비스 중립).

interface ScheduleRow {
  id: string;
  tenant_id: string;
  draft_id: string | null;
  platforms: string[] | null;
  scheduled_at: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface ScheduleBody {
  tenant_id?: string;
  draft_id?: string;
  platforms?: string[];
  scheduled_at?: string;
  payload?: Record<string, unknown>;
  promote?: boolean; // true면 게이트웨이 큐(promote)에도 위임 시도
  // SNS-007: 플랫폼별 선택계정. { threads: "<accountId>", x: "<accountId>" }.
  // publish-due가 payload.account_ids에서 그대로 읽어 그 계정으로만 발행(삭제/cross-tenant면 실패, fallback 없음).
  account_ids?: Record<string, string>;
}

// GET /api/schedule?tenant_id=... — 워크스페이스 예약 목록(예정 시각 오름차순, 최근 50)
export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, new URL(request.url).searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ schedules: [] });
  try {
    const rows = await withTenant(tenantId, (sql) => sql<ScheduleRow[]>`
      SELECT id, tenant_id, draft_id, platforms, scheduled_at, status, payload, created_at
      FROM schedules WHERE tenant_id = ${tenantId}
      ORDER BY scheduled_at ASC LIMIT 50`);
    const schedules = rows.map((r) => ({
      id: r.id,
      draftId: r.draft_id,
      platforms: r.platforms ?? [],
      scheduledAt: r.scheduled_at,
      status: r.status,
      payload: r.payload ?? {},
      createdAt: r.created_at,
    }));
    return Response.json({ schedules });
  } catch (e) {
    return Response.json({ schedules: [], error: String(e) }, { status: 500 });
  }
}

// POST /api/schedule — 예약 생성
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ScheduleBody;
  const tenantId = await effectiveTenantId(request, body.tenant_id);
  const platforms = body.platforms;
  const scheduledAt = body.scheduled_at;

  if (!tenantId) return Response.json({ error: "tenant_id required" }, { status: 400 });
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return Response.json({ error: "platforms[] required (1개 이상)" }, { status: 400 });
  }
  if (!scheduledAt) return Response.json({ error: "scheduled_at required" }, { status: 400 });
  // 예약 시각은 미래여야 함(과거 거부 — P6 예약 정합).
  const t = Date.parse(scheduledAt);
  if (Number.isNaN(t)) return Response.json({ error: "scheduled_at 형식 오류(ISO-8601)" }, { status: 400 });
  if (t <= Date.now()) return Response.json({ error: "scheduled_at은 미래 시각이어야 함" }, { status: 400 });

  const accountIds = body.account_ids && typeof body.account_ids === "object" && !Array.isArray(body.account_ids)
    ? body.account_ids
    : undefined;
  if (accountIds) {
    for (const [provider, accountId] of Object.entries(accountIds)) {
      if (!platforms.includes(provider) || typeof accountId !== "string" || !accountId) {
        return Response.json({ error: `account_ids.${provider} 값이 올바르지 않습니다.` }, { status: 400 });
      }
      if (!await channelAccountBelongsToProvider(tenantId, provider, accountId)) {
        return Response.json(
          { error: `선택한 ${provider} 계정을 찾을 수 없거나 사용할 수 없습니다.` },
          { status: 400 },
        );
      }
    }
  }
  let payload = accountIds ? { ...(body.payload ?? {}), account_ids: accountIds } : (body.payload ?? {});
  const draftId = body.draft_id ?? null;
  try {
    const prepared = await prepareDraftCardDeckV3ForPublish(tenantId, draftId);
    if (prepared) payload = { ...payload, imageUrl: prepared.imageUrl, imageUrls: prepared.imageUrls };
  } catch (error) {
    if (error instanceof CardDeckV3PublishBlockedError) return cardDeckV3PublishBlockedErrorResponse(error);
    throw error;
  }
  // 단일 플랫폼 예약이면 schedules.account_id 컬럼(감사/조인용)도 함께 채운다 — 여러 플랫폼이면
  // 플랫폼마다 계정이 다를 수 있어 단일 컬럼으로 못 담고 payload.account_ids가 SSOT.
  const singleAccountId = platforms.length === 1 ? (accountIds?.[platforms[0]] ?? null) : null;

  let scheduleId: string;
  try {
    scheduleId = await withTenant(tenantId, async (sql) => {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO schedules (tenant_id, draft_id, platforms, scheduled_at, status, payload, account_id)
        VALUES (${tenantId}, ${draftId}, ${platforms}, ${scheduledAt}, 'scheduled', ${sql.json(payload as Parameters<typeof sql.json>[0])}, ${singleAccountId})
        RETURNING id`;
      return row.id;
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }

  // 선택: 게이트웨이 큐(threads-queue)에도 예약 위임 — promote 브릿지 재사용.
  // 게이트웨이 미연결/실패는 치명 아님(스케줄은 DB에 이미 적재됨). 결과만 함께 반환.
  let gateway: unknown = null;
  if (body.promote && draftId) {
    try {
      const origin = new URL(request.url).origin;
      const resp = await fetch(`${origin}/api/queue/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, draft_id: draftId, platforms, scheduled_at: scheduledAt }),
      });
      gateway = await resp.json().catch(() => ({ ok: resp.ok }));
    } catch (e) {
      gateway = { ok: false, error: String(e) };
    }
  }

  return Response.json({ ok: true, id: scheduleId, scheduled_at: scheduledAt, platforms, gateway });
}
