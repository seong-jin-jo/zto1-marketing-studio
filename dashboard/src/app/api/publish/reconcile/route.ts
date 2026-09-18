import { effectiveTenantId } from "@/lib/tenant-auth";
import { withTenant } from "@/lib/db";
import { markQueuePublished } from "@/lib/queue-store";
import { publicationUsageOutbox, recordPublicationEvent } from "@/lib/usage-events";
import { verifyRecoveryProof, type RecoveryStage } from "@/lib/publish-recovery-proof";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLATFORM_RE = /^[a-z][a-z0-9_]{0,31}$/;

interface ReconciliationInput {
  platform?: unknown;
  draftId?: unknown;
  publicationId?: unknown;
  accountId?: unknown;
  externalId?: unknown;
  permalink?: unknown;
  stage?: unknown;
  receipt?: unknown;
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
  const stage = optionalString(raw.stage, 32);
  const receipt = optionalString(raw.receipt, 8192);

  if (!platform || !PLATFORM_RE.test(platform)) throw new Error("플랫폼 형식이 올바르지 않습니다.");
  if (draftId && !UUID_RE.test(draftId)) throw new Error("초안 식별자 형식이 올바르지 않습니다.");
  if (publicationId && !UUID_RE.test(publicationId)) throw new Error("발행 식별자 형식이 올바르지 않습니다.");
  if (accountId && !UUID_RE.test(accountId)) throw new Error("계정 식별자 형식이 올바르지 않습니다.");
  if (!publicationId) throw new Error("복구할 발행 식별자가 필요합니다.");
  if (!receipt) throw new Error("서버가 발급한 복구 증표가 없습니다. 외부 게시 상태를 확인한 뒤 운영자에게 기록 복구를 요청해주세요.");
  const proof = verifyRecoveryProof(receipt);
  if (!proof) throw new Error("복구 증표가 만료되었거나 올바르지 않습니다. 외부 게시 상태를 다시 확인해주세요.");
  if (stage !== proof.stage || proof.tenantId !== tenantId || proof.platform !== platform
    || proof.publicationId !== publicationId || proof.draftId !== draftId
    || proof.accountId !== accountId || proof.externalId !== externalId
    || proof.permalink !== permalink) {
    throw new Error("복구 증표와 발행 정보가 일치하지 않습니다.");
  }

  const persisted = await withTenant(tenantId, async (sql) => {
    const rows = await sql<{
      id: string; draft_id: string | null; status: string; external_id: string | null;
      usage_status: string | null;
    }[]>`
      SELECT id::text, draft_id::text, status, external_id,
             provider_meta #>> '{usageEvent,status}' AS usage_status
        FROM published_posts
       WHERE tenant_id = ${tenantId}::uuid
         AND id = ${publicationId}::uuid
         AND platform = ${platform}
         AND account_id IS NOT DISTINCT FROM ${accountId}::uuid
       FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new Error("현재 작업 공간에서 복구할 발행 기록을 찾지 못했습니다.");
    if (row.draft_id !== proof.draftId) throw new Error("발행 기록의 원본 초안이 복구 증표와 다릅니다.");
    if (row.status === "failed" || !["in_progress", "uncertain", "published"].includes(row.status)) {
      throw new Error("외부 성공이 확인되지 않은 발행 기록은 완료 처리할 수 없습니다.");
    }
    // A signed receipt is issued only after the provider returned success. Some
    // providers do not return a post ID, so a null ID is part of that signed result.
    if (stage === "publication_record") {
      if (row.status === "published") {
        if (row.external_id !== proof.externalId) throw new Error("이미 완료된 발행 기록의 공급자 식별자가 다릅니다.");
      } else {
        const [updated] = await sql<{ id: string }[]>`
          UPDATE published_posts
             SET status = 'published', external_id = ${proof.externalId},
                 permalink = COALESCE(${proof.permalink}, permalink), error = NULL,
                 reserved_at = NULL, published_at = ${proof.occurredAt}::timestamptz,
                 provider_meta = COALESCE(provider_meta, '{}'::jsonb)
                   || ${sql.json(publicationUsageOutbox(platform, proof.occurredAt) as never)}::jsonb
           WHERE tenant_id = ${tenantId}::uuid AND id = ${row.id}::uuid
             AND status IN ('in_progress', 'uncertain')
          RETURNING id::text`;
        if (!updated) throw new Error("발행 기록을 복구하지 못했습니다.");
      }
    } else if (row.status !== "published" || row.external_id !== proof.externalId) {
      throw new Error("발행 기록의 외부 성공 상태와 복구 증표가 일치하지 않습니다.");
    }
    if (stage === "usage_record" && row.usage_status !== "pending" && row.usage_status !== "recorded") {
      throw new Error("사용량 복구 대기 기록이 없습니다.");
    }
    return { id: row.id, draftId: row.draft_id, stage: stage as RecoveryStage };
  });

  if (persisted.draftId && persisted.stage !== "usage_record") {
    await markQueuePublished(tenantId, persisted.draftId, {
      platform,
      externalId: proof.externalId ?? undefined,
      permalink: proof.permalink ?? undefined,
    });
  }
  await recordPublicationEvent(tenantId, persisted.id, platform);
  return { platform, publicationId: persisted.id };
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
