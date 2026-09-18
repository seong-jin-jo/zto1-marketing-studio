import crypto from "node:crypto";
import { db, withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { reportFailure, reportRecovery, normalizePlatform, classifyPublishFailure } from "@/lib/observability";
import { normalizeIncidentSource } from "@/lib/observability/incidents";
import { refreshImageDeliveryUrl } from "@/lib/image-token";
import { SCHEDULABLE_PLATFORMS } from "@/lib/constants";
import { channelImageCapacity } from "@/lib/studio/channel-image-capacity";
import { runWithTenant } from "@/lib/tenant-context";
import { drainQueueMirrorOutbox, listQueueMirrorOutboxTenantIds } from "@/lib/queue-mirror-outbox";
import { publicationUsageOutbox, recordPublicationEvent, drainPendingPublicationEvents, pendingPublicationUsageTenantIds } from "@/lib/usage-events";
import {
  getChannelCred,
  publishFacebook,
  publishInstagram,
  publishThreads,
  publishX,
  publishBluesky,
  publishTelegram,
  publishDiscord,
  publishSlack,
  publishLinkedIn,
  type PublishResult,
} from "@/lib/publish";

// POST /api/schedule/publish-due — cron/gateway용 예약 실발행 루프.
// 두 가지 호출 방식:
//   ① 테넌트 스코프: 로그인 세션/테넌트 토큰/tenant_id로 한 테넌트의 due를 처리(고객/포크).
//   ② 운영자 전체 스윕: tenant_id 없이 운영자 토큰(DASHBOARD_AUTH_TOKEN)으로 호출하면
//      due schedule이 있는 모든 테넌트를 순회한다 — 단일 크론(curl)이 전 테넌트를 발행하는 진입점.
// 테넌트별 due schedules를 processing으로 claim해 중복 발행을 막고, 플랫폼별 결과를
// published_posts에 기록한 뒤 schedule 상태를 published/partial/failed로 닫는다.

interface PublishDueBody {
  tenant_id?: string;
  limit?: number;
}

interface DueScheduleRow {
  id: string;
  draft_id: string | null;
  platforms: string[] | null;
  payload: Record<string, unknown> | null;
  draft_payload: Record<string, unknown> | null;
  worker_token: string;
}

interface PlatformPublishResult extends PublishResult {
  platform: string;
  accountId?: string;
}

// 발행 가능한 플랫폼은 constants.ts SSOT(SchedulePanel UI와 단일 소스). 여기 없는 platform은
// "미지원"으로 떨궈 정직하게 실패 기록한다(UI에선 애초에 노출 안 됨).
const SUPPORTED_PLATFORMS = new Set<string>(SCHEDULABLE_PLATFORMS);
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const SCHEDULE_LEASE_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as PublishDueBody;
  const limit = clampLimit(body.limit);

  const tenantId = await effectiveTenantId(request, body.tenant_id);
  if (tenantId) {
    const outbox = await runWithTenant(tenantId, () => drainQueueMirrorOutbox());
    const schedules = await processTenant(tenantId, limit);
    const usageRelay = await drainPendingPublicationEvents(tenantId);
    return Response.json({ ok: usageRelay.remaining === 0 && usageRelay.failed === 0,
      processed: schedules.length, schedules, outbox, usageRelay },
      { status: usageRelay.remaining || usageRelay.failed ? 503 : 200 });
  }

  // 테넌트 미해석 — 운영자 토큰이면 전체 테넌트 스윕(단일 크론 진입점), 아니면 400.
  const raw = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  const operatorToken = process.env.DASHBOARD_AUTH_TOKEN || "";
  if (operatorToken && raw === operatorToken) {
    const tenantIds = [...new Set([...(await dueTenantIds()), ...listQueueMirrorOutboxTenantIds(),
      ...(await pendingPublicationUsageTenantIds())])];
    const tenants = [];
    let processed = 0;
    let pendingUsage = 0;
    for (const tid of tenantIds) {
      const outbox = await runWithTenant(tid, () => drainQueueMirrorOutbox());
      const schedules = await processTenant(tid, limit);
      const usageRelay = await drainPendingPublicationEvents(tid);
      processed += schedules.length;
      pendingUsage += usageRelay.remaining;
      tenants.push({ tenantId: tid, processed: schedules.length, schedules, outbox, usageRelay });
    }
    return Response.json({ ok: pendingUsage === 0, mode: "all-tenants", tenantCount: tenants.length,
      processed, pendingUsage, tenants }, { status: pendingUsage ? 503 : 200 });
  }

  return Response.json({ error: "tenant_id required" }, { status: 400 });
}

// 한 테넌트의 due schedule을 claim→발행→기록→마감. 반환: 처리한 스케줄 요약 목록.
async function processTenant(tenantId: string, limit: number) {
  const rows = await claimDueSchedules(tenantId, limit);
  const schedules = [];
  for (const row of rows) {
    const platforms = Array.isArray(row.platforms) ? row.platforms : [];
    const results: PlatformPublishResult[] = [];

    if (platforms.length === 0) {
      results.push({ platform: "(none)", ok: false, error: "platforms 없음" });
    } else {
      for (const platform of platforms) {
        const leaseOwned = await renewScheduleLease(tenantId, row.id, row.worker_token);
        if (!leaseOwned) {
          results.push({ platform, ok: false, error: "예약 처리 소유권이 만료되어 발행을 중단했습니다." });
          break;
        }
        const requestedAccountId = accountIdForPlatform(row.payload, platform);
        const { resolvedAccountId, ...result } = await publishOne(tenantId, row, platform, requestedAccountId);
        // results.accountId는 감사/응답용이라 요청값으로 폴백해도 안전(FK 아님) — 그러나 DB 기록
        // (published_posts.account_id, 아래)은 channel_accounts를 FK 참조하므로 실제로 존재를
        // 확인한 resolvedAccountId만 쓴다. requestedAccountId가 삭제/cross-tenant면 resolvedAccountId가
        // undefined이므로 FK 위반(존재하지 않는 계정 참조) 없이 NULL로 기록된다.
        results.push({ platform, accountId: resolvedAccountId ?? requestedAccountId, ...result });
        // /api/publish/route.ts와 동일한 경계: "채널 미연결"(설정 문제)은 알림 대상이 아니고,
        // 그 외 !ok(플랫폼 API 실발행 실패·미지원 플랫폼)만 fire-and-forget으로 보고한다.
        // 응답/스케줄 상태는 이 보고와 무관 — reportFailure는 아래 로직에 어떤 영향도 주지 않는다.
        if (!result.ok && !isConnectionMissing(result.error)) {
          // platform(schedules.platforms 저장값)과 result.error(플랫폼 API 응답 본문 포함 가능한
          // 임의 외부 텍스트)를 절대 그대로 넘기지 않고 고정 코드로만 정규화한다(observability.ts).
          const { reason, httpStatus } = classifyPublishFailure(result.error);
          void reportFailure({
            event: "publish_failed",
            severity: "warning",
            workspaceId: tenantId,
            resourceKey: `account:${resolvedAccountId ?? "default"}`,
            context: { platform: normalizePlatform(platform), reason, httpStatus },
          });
        } else if (result.ok) {
          void reportRecovery?.({
            workspaceId: tenantId,
            category: "publish_failed",
            source: normalizeIncidentSource(platform),
            resourceKey: `account:${resolvedAccountId ?? "default"}`,
          });
        }
        // FK-safe: 존재가 확인된 resolvedAccountId만 기록(requestedAccountId 폴백 금지 — 삭제된
        // 계정 id를 그대로 넣으면 channel_accounts FK 위반으로 INSERT 자체가 실패한다).
        await recordPublishedPost(tenantId, row, platform, result, resolvedAccountId);
      }
    }

    const status = scheduleStatus(results);
    await finishSchedule(tenantId, row.id, row.worker_token, status, results);
    schedules.push({ id: row.id, status, results });
  }
  return schedules;
}

// due schedule이 하나라도 있는 테넌트 id 목록. RLS 우회 service-role(db())로 전 테넌트 스캔 —
// 운영자 전체 스윕 전용(테넌트 스코프 쿼리가 아니므로 withTenant 미사용).
async function dueTenantIds(): Promise<string[]> {
  const sql = db();
  const rows = await sql<{ tenant_id: string }[]>`
    SELECT DISTINCT tenant_id FROM schedules
    WHERE status = 'scheduled' AND scheduled_at <= now()`;
  return rows.map((r) => r.tenant_id);
}

// "PLATFORM 채널 미연결 — Settings에서 토큰 등록 필요"(getChannelCred null) — 고객 설정 문제일 뿐
// 인프라 장애가 아니므로 publish_failed 알림 대상에서 제외한다(/api/publish/route.ts와 동일 규칙).
function isConnectionMissing(error?: string | null): boolean {
  return typeof error === "string" && (error.includes("채널 미연결") || error.includes("선택한") && error.includes("계정을 찾을 수 없음"));
}

// SNS-007: 예약 payload.account_ids[platform] — 예약 생성 시점에 고른 계정. 없으면 undefined(기본계정 사용).
function accountIdForPlatform(payload: Record<string, unknown> | null, platform: string): string | undefined {
  const map = payload?.account_ids;
  if (!map || typeof map !== "object") return undefined;
  const v = (map as Record<string, unknown>)[platform];
  return typeof v === "string" && v ? v : undefined;
}

function clampLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}

async function claimDueSchedules(tenantId: string, limit: number): Promise<DueScheduleRow[]> {
  const workerToken = crypto.randomUUID();
  const now = new Date();
  const lease = {
    processingLease: {
      workerToken,
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SCHEDULE_LEASE_MS).toISOString(),
    },
  };
  const rows = await withTenant(tenantId, (sql) => sql<DueScheduleRow[]>`
    WITH due AS (
      SELECT id
      FROM schedules
      WHERE tenant_id = ${tenantId}
        AND (
          (status = 'scheduled' AND scheduled_at <= now())
          OR (
            status = 'processing'
            AND COALESCE(
              NULLIF(payload->'processingLease'->>'expiresAt', '')::timestamptz,
              scheduled_at
            ) <= now()
          )
        )
      ORDER BY scheduled_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
      UPDATE schedules
      SET status = 'processing',
          payload = COALESCE(payload, '{}'::jsonb) || ${sql.json(lease as never)}::jsonb
      WHERE id IN (SELECT id FROM due)
      RETURNING id, tenant_id, draft_id, platforms, payload
    )
    SELECT
      claimed.id,
      claimed.draft_id,
      claimed.platforms,
      claimed.payload,
      drafts.payload AS draft_payload,
      ${workerToken}::text AS worker_token
    FROM claimed
    LEFT JOIN drafts
      ON drafts.id = claimed.draft_id
     AND drafts.tenant_id = ${tenantId}
  `);
  return rows.map((row) => ({ ...row, worker_token: row.worker_token || workerToken }));
}

async function renewScheduleLease(tenantId: string, scheduleId: string, workerToken: string): Promise<boolean> {
  const expiresAt = new Date(Date.now() + SCHEDULE_LEASE_MS).toISOString();
  const rows = await withTenant(tenantId, (sql) => sql<{ id: string }[]>`
    UPDATE schedules
    SET payload = jsonb_set(
      COALESCE(payload, '{}'::jsonb),
      '{processingLease,expiresAt}',
      to_jsonb(${expiresAt}::text),
      true
    )
    WHERE id = ${scheduleId}
      AND tenant_id = ${tenantId}
      AND status = 'processing'
      AND payload->'processingLease'->>'workerToken' = ${workerToken}
    RETURNING id
  `);
  return rows.length === 1;
}

async function publishOne(
  tenantId: string,
  row: DueScheduleRow,
  platform: string,
  accountId?: string,
): Promise<PublishResult & { resolvedAccountId?: string }> {
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return { ok: false, error: `${platform} 미지원` };
  }

  // accountId 지정 시 getChannelCred는 삭제/cross-tenant면 null(조용한 기본계정 폴백 없음) — /api/publish와 동일 계약.
  const cred = await getChannelCred(tenantId, platform, accountId);
  if (!cred) {
    return {
      ok: false,
      error: accountId
        ? `선택한 ${platform} 계정을 찾을 수 없음 — 삭제되었거나 다른 테넌트 소유`
        : `${platform} 채널 미연결 — Settings에서 토큰 등록 필요`,
    };
  }

  const text = textForPlatform(platform, row.payload, row.draft_payload);
  const storedImageUrls = imageUrlsFromPayload(row.payload, row.draft_payload);
  if (platform === "linkedin" && storedImageUrls.length > 0) {
    return {
      ok: false,
      error: "LinkedIn은 현재 글만 발행할 수 있습니다. 예약에 담긴 이미지를 버리지 않도록 발행을 시작하지 않았습니다.",
      resolvedAccountId: cred.accountId,
    };
  }
  if (storedImageUrls.length > channelImageCapacity(platform)) {
    return {
      ok: false,
      error: `${platform} 은 한 번에 이미지 ${channelImageCapacity(platform)}장까지 올릴 수 있습니다. ${storedImageUrls.length}장을 보내면 나머지가 올라가지 않으므로 발행을 시작하지 않았습니다.`,
      resolvedAccountId: cred.accountId,
    };
  }
  const imageUrls: string[] = [];
  for (const storedImageUrl of storedImageUrls) {
    const refreshed = refreshImageDeliveryUrl(tenantId, storedImageUrl);
    if (!refreshed) {
      return {
        ok: false,
        error: "예약 이미지 URL이 만료되었거나 유효하지 않습니다. 이미지를 다시 선택해주세요.",
        resolvedAccountId: cred.accountId,
      };
    }
    imageUrls.push(refreshed);
  }
  const imageUrl = imageUrls[0];

  try {
    let result: PublishResult;
    if (platform === "threads") result = await publishThreads(cred, text, imageUrl);
    else if (platform === "instagram") result = await publishInstagram(cred, text, imageUrls, {
      onProgress: async (progress) => {
        const [saved] = await withTenant(tenantId, (sql) => sql<{ id: string }[]>`
          UPDATE schedules
             SET payload = COALESCE(payload, '{}'::jsonb)
               || ${sql.json({ instagramAttempt: progress } as never)}::jsonb
           WHERE tenant_id = ${tenantId}
             AND id = ${row.id}
             AND status = 'processing'
             AND payload->'processingLease'->>'workerToken' = ${row.worker_token}
          RETURNING id
        `);
        if (!saved) throw new Error("예약 발행 진행 상태를 저장하지 못했습니다.");
      },
    });
    else if (platform === "x") result = await publishX(cred, text);
    else if (platform === "facebook") result = await publishFacebook(cred, text, imageUrl);
    else if (platform === "bluesky") result = await publishBluesky(cred, text, imageUrl);
    else if (platform === "telegram") result = await publishTelegram(cred, text, imageUrl);
    else if (platform === "discord") result = await publishDiscord(cred, text, imageUrl);
    else if (platform === "slack") result = await publishSlack(cred, text, imageUrl);
    else if (platform === "linkedin") result = await publishLinkedIn(cred, text);
    else return { ok: false, error: `${platform} 미지원` };
    return { ...result, resolvedAccountId: cred.accountId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), resolvedAccountId: cred.accountId };
  }
}

function textForPlatform(
  platform: string,
  schedulePayload: Record<string, unknown> | null,
  draftPayload: Record<string, unknown> | null,
): string {
  const raw = schedulePayload?.text ?? draftPayload?.text ?? "";
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return "";

  const text = raw as Record<string, unknown>;
  // bluesky/telegram/discord/slack은 플랫폼 전용 본문 필드가 없다 — threads 본문(공용 소셜 텍스트)을 그대로 사용.
  if (platform === "threads" || platform === "facebook" || platform === "bluesky" || platform === "telegram" || platform === "discord" || platform === "slack") {
    return stringValue(text.threads);
  }
  if (platform === "x") return stringValue(text.x);
  if (platform === "instagram") {
    const ig = text.instagram;
    if (ig && typeof ig === "object") return stringValue((ig as Record<string, unknown>).caption);
    return stringValue(ig);
  }

  const shorts = text.shorts;
  if (shorts && typeof shorts === "object") {
    const parts = ["hook", "body", "cta"]
      .map((key) => stringValue((shorts as Record<string, unknown>)[key]))
      .filter(Boolean);
    if (parts.length > 0) return parts.join("\n");
  }
  return stringValue(text.threads);
}

function imageUrlsFromPayload(
  schedulePayload: Record<string, unknown> | null,
  draftPayload: Record<string, unknown> | null,
): string[] {
  const list =
    schedulePayload?.image_urls ??
    schedulePayload?.imageUrls ??
    draftPayload?.image_urls ??
    draftPayload?.imageUrls;
  if (Array.isArray(list)) {
    const urls = list.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (urls.length > 0) return urls;
  }

  const img = schedulePayload?.img ?? draftPayload?.img;
  if (img && typeof img === "object") {
    const imageUrls = (img as Record<string, unknown>).imageUrls;
    if (Array.isArray(imageUrls)) {
      const urls = imageUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
      if (urls.length > 0) return urls;
    }
  }

  const direct =
    schedulePayload?.image_url ??
    schedulePayload?.imageUrl ??
    draftPayload?.image_url ??
    draftPayload?.imageUrl;
  const directValue = stringValue(direct);
  if (directValue) return [directValue];

  if (typeof img === "string") return [img];
  if (img && typeof img === "object") {
    const url = stringValue((img as Record<string, unknown>).url);
    if (url) return [url];
  }
  return [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function recordPublishedPost(
  tenantId: string,
  row: DueScheduleRow,
  platform: string,
  result: PublishResult,
  accountId?: string,
) {
  const text = textForPlatform(platform, row.payload, row.draft_payload);
  // 게시 성공 뒤 응답만 끊긴 경우는 실패가 아니라 uncertain 이다. failed 로 적으면
  // 다음 예약 처리나 수동 재시도가 같은 글을 한 번 더 올린다.
  const status = result.ok
    ? "published"
    : result.failureKind === "indeterminate" ? "uncertain" : "failed";
  const [publication] = await withTenant(tenantId, (sql) => sql<{ id: string }[]>`
    INSERT INTO published_posts (tenant_id, draft_id, platform, external_id, permalink, text, status, error, account_id, provider_meta)
    VALUES (${tenantId}, ${row.draft_id ?? null}, ${platform}, ${result.externalId ?? null},
            ${result.permalink ?? null}, ${text || null},
            ${status}, ${result.error ?? null}, ${accountId ?? null},
            ${sql.json(result.ok ? publicationUsageOutbox(platform) as never : {} as never)}::jsonb)
    RETURNING id::text
  `);
  if (result.ok && publication) {
    // relay가 잠시 실패해도 같은 INSERT에 pending outbox가 남는다. 다음 /api/usage 조회가
    // 멱등하게 다시 처리하며, 예약 발행 자체를 실패나 재발행 대상으로 바꾸지 않는다.
    await recordPublicationEvent(tenantId, publication.id, platform).catch(() => {});
  }
}

// 결과를 확인하지 못한 채널이 하나라도 있으면 그 예약은 failed 로 닫지 않는다.
// failed 로 닫으면 사람이 안심하고 다시 예약해 중복 게시가 난다.
function scheduleStatus(results: PlatformPublishResult[]): "published" | "partial" | "failed" | "uncertain" {
  const ok = results.filter((r) => r.ok).length;
  const uncertain = results.filter((r) => !r.ok && r.failureKind === "indeterminate").length;
  if (ok === results.length && results.length > 0) return "published";
  if (uncertain > 0) return "uncertain";
  if (ok > 0) return "partial";
  return "failed";
}

async function finishSchedule(
  tenantId: string,
  scheduleId: string,
  workerToken: string,
  status: "published" | "partial" | "failed" | "uncertain",
  results: PlatformPublishResult[],
) {
  const publishResultPayload = {
    publishResults: results,
    processedAt: new Date().toISOString(),
  };
  await withTenant(tenantId, (sql) => sql`
    UPDATE schedules
    SET status = ${status},
        payload = COALESCE(payload, '{}'::jsonb) || ${sql.json(publishResultPayload as never)}::jsonb
    WHERE id = ${scheduleId}
      AND tenant_id = ${tenantId}
      AND status = 'processing'
      AND payload->'processingLease'->>'workerToken' = ${workerToken}
  `);
}
