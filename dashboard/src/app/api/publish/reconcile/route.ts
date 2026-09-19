import { effectiveTenantId } from "@/lib/tenant-auth";
import { withTenant } from "@/lib/db";
import { markQueuePublished } from "@/lib/queue-store";
import { publicationUsageOutbox, recordPublicationEvent } from "@/lib/usage-events";
import { verifyRecoveryProofDetailed, type RecoveryStage } from "@/lib/publish-recovery-proof";

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
  const verified = verifyRecoveryProofDetailed(receipt);
  if (verified.reason === "expired") {
    throw new Error("복구 증표의 24시간 유효기간이 지났습니다. 같은 콘텐츠를 다시 게시하지 마세요. 외부 게시 주소와 작업물 번호를 준비해 고객 지원에 수동 확인·기록 복구를 요청해 주세요.");
  }
  const proof = verified.proof;
  if (!proof) throw new Error("복구 증표가 올바르지 않습니다. 외부 게시 상태를 확인한 뒤 고객 지원에 기록 복구를 요청해 주세요.");
  if (stage !== proof.stage || proof.tenantId !== tenantId || proof.platform !== platform
    || proof.publicationId !== publicationId || proof.draftId !== draftId
    || proof.accountId !== accountId || proof.externalId !== externalId
    || proof.permalink !== permalink) {
    throw new Error("복구 증표와 발행 정보가 일치하지 않습니다.");
  }

  const persisted = await withTenant(tenantId, async (sql) => {
    const rows = await sql<{
      id: string; draft_id: string | null; status: string; external_id: string | null;
      usage_status: string | null; first_comment_status: string | null;
      first_comment_error: string | null; first_comment_external_id: string | null;
    }[]>`
      SELECT id::text, draft_id::text, status, external_id,
             first_comment_status, first_comment_error, first_comment_external_id,
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
      if (!proof.firstComment && !["youtube", "instagram_reels", "tiktok"].includes(platform)) {
        throw new Error("이전 복구 증표에는 첫 댓글 결과가 없어 안전하게 완료 처리할 수 없습니다. 다시 게시하지 말고 외부 게시 주소와 작업물 번호를 준비해 고객 지원에 문의해 주세요.");
      }
      if (row.status === "published") {
        if (row.external_id !== proof.externalId) throw new Error("이미 완료된 발행 기록의 공급자 식별자가 다릅니다.");
        if (proof.firstComment && (row.first_comment_status !== proof.firstComment.status
          || row.first_comment_error !== proof.firstComment.error
          || row.first_comment_external_id !== proof.firstComment.externalId)) {
          throw new Error("이미 완료된 첫 댓글 결과와 복구 증표가 다릅니다.");
        }
      } else {
        const [updated] = await sql<{ id: string }[]>`
          UPDATE published_posts
             SET status = 'published', external_id = ${proof.externalId},
                 permalink = COALESCE(${proof.permalink}, permalink), error = NULL,
                 first_comment_status = COALESCE(${proof.firstComment?.status ?? null}, first_comment_status),
                 first_comment_error = CASE WHEN ${Boolean(proof.firstComment)}
                   THEN ${proof.firstComment?.error ?? null} ELSE first_comment_error END,
                 first_comment_external_id = CASE WHEN ${Boolean(proof.firstComment)}
                   THEN ${proof.firstComment?.externalId ?? null} ELSE first_comment_external_id END,
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
    if (stage === "first_comment_record") {
      const comment = proof.firstComment;
      if (!comment) throw new Error("첫 댓글 복구 결과가 없습니다.");
      const alreadyRecorded = row.first_comment_status === comment.status
        && row.first_comment_external_id === comment.externalId
        && row.first_comment_error === comment.error;
      if (!alreadyRecorded) {
        if (row.first_comment_status === "published" || row.first_comment_status === "uncertain") {
          throw new Error("이미 기록된 첫 댓글 결과와 복구 증표가 다릅니다.");
        }
        const [updated] = await sql<{ id: string }[]>`
          UPDATE published_posts
             SET first_comment_status = ${comment.status},
                 first_comment_error = ${comment.error},
                 first_comment_external_id = ${comment.externalId}
           WHERE tenant_id = ${tenantId}::uuid AND id = ${row.id}::uuid
             AND status = 'published' AND external_id IS NOT DISTINCT FROM ${proof.externalId}
             AND first_comment_status IN ('in_progress', 'failed', 'not_requested')
          RETURNING id::text`;
        if (!updated) throw new Error("첫 댓글 상태를 복구하지 못했습니다.");
      }
    }
    if (stage === "usage_record" && row.usage_status !== "pending" && row.usage_status !== "recorded") {
      throw new Error("사용량 복구 대기 기록이 없습니다.");
    }
    return { id: row.id, draftId: row.draft_id, stage: stage as RecoveryStage };
  });

  if (persisted.draftId && (persisted.stage === "publication_record" || persisted.stage === "queue_record")) {
    await markQueuePublished(tenantId, persisted.draftId, {
      platform,
      externalId: proof.externalId ?? undefined,
      permalink: proof.permalink ?? undefined,
      publishedAt: proof.occurredAt,
    });
  }
  if (persisted.stage !== "first_comment_record") {
    await recordPublicationEvent(tenantId, persisted.id, platform);
  }
  return { platform, publicationId: persisted.id,
    ...(proof.firstComment ? { firstCommentStatus: proof.firstComment.status } : {}) };
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
