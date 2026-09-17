import { effectiveTenantId } from "@/lib/tenant-auth";
import { withTenant } from "@/lib/db";
import { markQueuePublished } from "@/lib/queue-store";
import { publicationUsageOutbox, recordPublicationEvent } from "@/lib/usage-events";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLATFORM_RE = /^[a-z][a-z0-9_]{0,31}$/;

interface ReconciliationInput {
  platform?: unknown;
  draftId?: unknown;
  publicationId?: unknown;
  accountId?: unknown;
  externalId?: unknown;
  permalink?: unknown;
}

function optionalString(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("문자열 형식이 아닙니다.");
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) throw new Error("문자열 길이가 올바르지 않습니다.");
  return trimmed;
}

async function repairOne(tenantId: string, raw: ReconciliationInput) {
  const platform = optionalString(raw.platform, 32);
  const draftId = optionalString(raw.draftId, 36);
  const publicationId = optionalString(raw.publicationId, 36);
  const accountId = optionalString(raw.accountId, 36);
  const externalId = optionalString(raw.externalId, 512);
  const permalink = optionalString(raw.permalink, 2048);

  if (!platform || !PLATFORM_RE.test(platform)) throw new Error("플랫폼 형식이 올바르지 않습니다.");
  if (draftId && !UUID_RE.test(draftId)) throw new Error("초안 식별자 형식이 올바르지 않습니다.");
  if (publicationId && !UUID_RE.test(publicationId)) throw new Error("발행 식별자 형식이 올바르지 않습니다.");
  if (accountId && !UUID_RE.test(accountId)) throw new Error("계정 식별자 형식이 올바르지 않습니다.");
  if (!publicationId && !draftId) throw new Error("복구할 발행 또는 초안 식별자가 필요합니다.");

  const repairedId = await withTenant(tenantId, async (sql) => {
    const rows = publicationId
      ? await sql<{ id: string }[]>`
          SELECT id::text
            FROM published_posts
           WHERE tenant_id = ${tenantId}::uuid
             AND id = ${publicationId}::uuid
             AND platform = ${platform}
             AND (${accountId}::uuid IS NULL OR account_id = ${accountId}::uuid)
           FOR UPDATE`
      : await sql<{ id: string }[]>`
          SELECT id::text
            FROM published_posts
           WHERE tenant_id = ${tenantId}::uuid
             AND draft_id = ${draftId}::uuid
             AND platform = ${platform}
             AND account_id IS NOT DISTINCT FROM ${accountId}::uuid
             AND status IN ('in_progress', 'uncertain', 'published')
           ORDER BY published_at DESC
           LIMIT 1
           FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new Error("현재 작업 공간에서 복구할 발행 기록을 찾지 못했습니다.");

    const [updated] = await sql<{ id: string }[]>`
      UPDATE published_posts
         SET status = 'published',
             external_id = COALESCE(${externalId}, external_id),
             permalink = COALESCE(${permalink}, permalink),
             error = NULL,
             reserved_at = NULL,
             published_at = now(),
             provider_meta = CASE
               WHEN provider_meta #>> '{usageEvent,status}' = 'recorded' THEN provider_meta
               ELSE COALESCE(provider_meta, '{}'::jsonb)
                 || ${sql.json(publicationUsageOutbox(platform) as never)}::jsonb
             END
       WHERE tenant_id = ${tenantId}::uuid AND id = ${row.id}::uuid
       RETURNING id::text`;
    if (!updated) throw new Error("발행 기록을 복구하지 못했습니다.");
    return updated.id;
  });

  if (draftId) {
    await markQueuePublished(tenantId, draftId, {
      platform,
      externalId: externalId ?? undefined,
      permalink: permalink ?? undefined,
    });
  }
  await recordPublicationEvent(tenantId, repairedId, platform);
  return { platform, publicationId: repairedId };
}

export async function POST(request: Request) {
  let body: { tenant_id?: unknown; reconciliations?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문을 JSON으로 읽을 수 없습니다." }, { status: 400 });
  }
  const tenantId = await effectiveTenantId(request, typeof body.tenant_id === "string" ? body.tenant_id : null);
  if (!tenantId) return Response.json({ error: "작업 공간을 확인할 수 없습니다." }, { status: 400 });
  if (!Array.isArray(body.reconciliations) || body.reconciliations.length === 0 || body.reconciliations.length > 10) {
    return Response.json({ error: "복구 항목은 1개 이상 10개 이하여야 합니다." }, { status: 400 });
  }

  const repaired: Array<{ platform: string; publicationId: string }> = [];
  const failed: Array<{ platform: string; error: string }> = [];
  for (const raw of body.reconciliations) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      failed.push({ platform: "알 수 없음", error: "복구 항목 형식이 올바르지 않습니다." });
      continue;
    }
    try {
      repaired.push(await repairOne(tenantId, raw as ReconciliationInput));
    } catch (error) {
      const platform = typeof (raw as ReconciliationInput).platform === "string"
        ? String((raw as ReconciliationInput).platform)
        : "알 수 없음";
      failed.push({ platform, error: error instanceof Error ? error.message : "복구하지 못했습니다." });
    }
  }

  return Response.json({
    ok: failed.length === 0,
    partial: repaired.length > 0 && failed.length > 0,
    repaired,
    failed,
  }, { status: repaired.length > 0 ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
