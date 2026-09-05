import { withTenant } from "@/lib/db";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { markQueuePublished } from "@/lib/queue-store";
import { reportFailure, reportRecovery, normalizePlatform, classifyPublishFailure } from "@/lib/observability";
import { normalizeIncidentSource } from "@/lib/observability/incidents";
import { refreshImageDeliveryUrl } from "@/lib/image-token";
import {
  getFirstCommentCapability,
  normalizeFirstComment,
  publishFirstComment,
  type FirstCommentPlatform,
} from "@/lib/first-comment";
import {
  buildUnifiedPublishStatus,
  isPublishStatusTarget,
  PUBLISH_STATUS_TARGETS,
  type PublishedPostStatusRow,
  type PublishStatusTarget,
} from "@/lib/publish-job-status";
import {
  getChannelCred,
  fetchInstagramPermalink,
  fetchThreadsPermalink,
  findRecentProviderPost,
  publishThreads,
  publishInstagram,
  publishX,
  publishFacebook,
  publishBluesky,
  publishTelegram,
  publishDiscord,
  publishSlack,
  type PublishResult,
} from "@/lib/publish";
import { validateContentEditFormat } from "@/lib/studio/content-edit-format";
import {
  buildPlatformPublishText,
  validatePlatformPublish,
  type PlatformPublishInput,
  type PublishPlatform,
} from "@/lib/studio/platform-publish-fields";

type PersistenceStage = "publication_record" | "queue_record";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 예약 임차 시간. 이 시간이 지나도록 in_progress 로 남은 예약은 발행 프로세스가 죽은 것으로 보고
// 회수한다. 임차를 두지 않으면 예약 직후 프로세스가 죽은 작업이 영원히 409 가 된다.
// 기본 10분은 최장 외부 발행 경로(threads container 대기 + 15초 제한 요청들)보다 넉넉히 길다.
const DEFAULT_RESERVATION_LEASE_MS = 10 * 60 * 1000;
function reservationLeaseMs(): number {
  const raw = Number(process.env.PUBLISH_RESERVATION_LEASE_MS);
  return Number.isSafeInteger(raw) && raw >= 30_000 ? raw : DEFAULT_RESERVATION_LEASE_MS;
}

// 발행 의도 식별자. UUID 초안이면 초안 번호가, 아니면 호출자가 준 멱등 키가 의도를 가른다.
// 둘 다 없으면 같은 의도의 동시 두 요청을 구분할 수 없어 외부 게시가 두 번 나간다.
function normalizeIdempotencyKey(request: Request, body: Record<string, unknown>): string | null {
  const raw = request.headers.get("Idempotency-Key") ?? body.idempotency_key;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= 255 ? trimmed : null;
}

type ReservationConflictRow = {
  id: string;
  status: string;
  external_id: string | null;
  permalink: string | null;
  reserved_at: string | null;
  first_comment_status: string | null;
};

// 첫 댓글 결과를 본문 상태와 따로 저장한다. 본문 성공 + 댓글 실패를 published/error NULL 로
// 뭉개면 새로고침한 사용자에게 전체 성공으로 보이고, 복구할 대상도 사라진다.
function firstCommentState(
  requested: boolean,
  result: PublishResult | null,
): { status: string; error: string | null; externalId: string | null } {
  if (!requested) return { status: "not_requested", error: null, externalId: null };
  if (!result) return { status: "failed", error: "첫 댓글을 발행하지 못했습니다.", externalId: null };
  if (result.ok) return { status: "published", error: null, externalId: result.externalId ?? null };
  return {
    status: result.failureKind === "indeterminate" ? "uncertain" : "failed",
    error: result.error ?? "첫 댓글 발행에 실패했습니다.",
    externalId: null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const draftId = url.searchParams.get("draft_id") || "";
  const tenantId = await effectiveTenantId(request, url.searchParams.get("tenant_id"));
  if (!tenantId) return Response.json({ error: "tenant required" }, { status: 401 });
  if (!UUID_RE.test(draftId)) {
    return Response.json({ error: "draft_id must be a UUID" }, { status: 400 });
  }

  const platformParam = url.searchParams.get("platforms");
  const targets: PublishStatusTarget[] = platformParam
    ? platformParam.split(",").map((value) => value.trim()).filter(Boolean) as PublishStatusTarget[]
    : [...PUBLISH_STATUS_TARGETS];
  if (targets.length === 0 || targets.some((target) => !isPublishStatusTarget(target))) {
    return Response.json({ error: "platforms contains an unsupported target" }, { status: 400 });
  }

  try {
    const rows = await withTenant(tenantId, (sql) => sql<PublishedPostStatusRow[]>`
      SELECT platform, status, external_id, provider_post_id, permalink, error, published_at,
             first_comment_status, first_comment_error
        FROM published_posts
       WHERE tenant_id = ${tenantId}::uuid
         AND draft_id = ${draftId}::uuid
       ORDER BY published_at DESC
    `);
    return Response.json(buildUnifiedPublishStatus(draftId, rows, targets));
  } catch {
    return Response.json({ error: "publish status unavailable" }, { status: 503 });
  }
}

function partialPersistenceFailure(
  result: PublishResult,
  input: {
    stage: PersistenceStage;
    draftId: unknown;
    platform: string;
    accountId?: string;
  },
): Response {
  const publicationRecorded = input.stage === "queue_record";
  const code = input.stage === "publication_record"
    ? "PUBLICATION_RECORD_FAILED"
    : "QUEUE_RECORD_FAILED";
  const message = input.stage === "publication_record"
    ? "외부 게시에는 성공했지만 발행 기록 저장에 실패했습니다."
    : "외부 게시와 발행 기록 저장에는 성공했지만 queue 상태 저장에 실패했습니다.";

  return Response.json(
    {
      ok: false,
      externalPublished: true,
      externalId: result.externalId,
      permalink: result.permalink,
      error: `${message} 같은 콘텐츠를 다시 게시하지 말고 내부 기록만 복구하세요.`,
      persistence: {
        ok: false,
        stage: input.stage,
        publicationRecorded,
        queueRecorded: false,
        error: {
          code,
          message,
        },
        reconciliation: {
          required: true,
          action: "repair_persistence_only",
          retryPublish: false,
          draftId: typeof input.draftId === "string" ? input.draftId : null,
          platform: input.platform,
          accountId: input.accountId ?? null,
          externalId: result.externalId ?? null,
          permalink: result.permalink ?? null,
        },
      },
    },
    {
      // RFC 9110 §15.6.1: the provider fulfilled its side effect, but this server
      // could not fulfill the complete request because its own persistence failed.
      // 502 would be incorrect because the upstream response was valid and successful.
      status: 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

// POST /api/publish — 한 플랫폼 실발행 { tenant_id, platform, text, image_url?, draft_id? }
// 발행 후 published_posts에 기록(성과 수집 대상). 토큰 없으면 명확한 에러(크래시 X).
export async function POST(request: Request) {
  const __b = await request.json();
  const { platform, image_url, draft_id, account_id } = __b;
  const legacyText = typeof __b.text === "string" ? __b.text : "";
  if (__b.edit_format !== undefined) {
    const formatValidation = validateContentEditFormat(__b.edit_format);
    if (!formatValidation.valid) {
      return Response.json({
        ok: false,
        code: "INVALID_EDIT_FORMAT",
        error: "편집 형식값을 확인해 주세요",
        issues: formatValidation.issues,
      }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
  }
  let firstCommentText: string | null;
  try {
    firstCommentText = normalizeFirstComment(__b.first_comment);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
  const tenant_id = await effectiveTenantId(request, __b.tenant_id);
  if (!tenant_id || !platform) {
    return Response.json({ error: "tenant_id, platform required" }, { status: 400 });
  }
  const fieldPlatforms = new Set<PublishPlatform>(["threads", "x", "facebook", "instagram", "shorts", "reels", "tiktok"]);
  const rawFields = __b.publish_fields;
  if (rawFields !== undefined && (!rawFields || typeof rawFields !== "object" || Array.isArray(rawFields))) {
    return Response.json({
      ok: false,
      code: "INVALID_PUBLISH_FIELDS",
      error: "플랫폼별 발행 필드값을 확인해 주세요",
    }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
  const publishFields: PlatformPublishInput = rawFields ? {
    title: typeof rawFields.title === "string" ? rawFields.title : "",
    body: typeof rawFields.body === "string" ? rawFields.body : legacyText,
    hashtags: typeof rawFields.hashtags === "string" ? rawFields.hashtags : "",
    topicTag: typeof rawFields.topicTag === "string" ? rawFields.topicTag : "",
  } : { body: legacyText };
  const fieldPlatform = fieldPlatforms.has(platform as PublishPlatform) ? platform as PublishPlatform : null;
  if (fieldPlatform) {
    const fieldValidation = validatePlatformPublish(fieldPlatform, publishFields);
    if (fieldValidation.blocking.length > 0) {
      return Response.json({
        ok: false,
        code: "PUBLISH_FIELD_LIMIT_EXCEEDED",
        error: fieldValidation.blocking[0].message,
        issues: fieldValidation.blocking,
      }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
  }
  const text = fieldPlatform && rawFields
    ? buildPlatformPublishText(fieldPlatform, publishFields)
    : legacyText;
  if (firstCommentText) {
    const capability = getFirstCommentCapability(platform);
    if (!capability?.supported) {
      return Response.json({
        error: capability?.reason ?? `${platform} first comment unsupported`,
        capability: capability ?? { platform, supported: false },
      }, { status: 400 });
    }
  }

  // 되돌릴 수 없는 외부 게시는 의도마다 한 번만 나가야 한다.
  // UUID 초안이면 초안 번호가 의도를 가르고, 초안이 없으면 호출자가 준 멱등 키가 가른다.
  // 예전에는 초안이 없는 요청이 이 관문을 통째로 건너뛰어, 같은 본문 두 건을 동시에 보내면
  // 외부 게시가 두 번 실행됐다.
  const isDraftUuid = typeof draft_id === "string" && UUID_RE.test(draft_id);
  const idempotencyKey = normalizeIdempotencyKey(request, __b);
  if (!isDraftUuid && !idempotencyKey) {
    return Response.json({
      ok: false,
      code: "PUBLISH_IDEMPOTENCY_KEY_REQUIRED",
      error: "초안 번호가 없는 발행은 Idempotency-Key 머리말이나 idempotency_key 값이 필요합니다. 중복 게시를 막기 위해 외부 게시를 시작하지 않았습니다.",
    }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const reservationDraftId = isDraftUuid ? (draft_id as string) : null;
  const reservationKey = isDraftUuid ? null : idempotencyKey;

  let publishImageUrl: string | undefined;
  if (image_url) {
    const refreshed = refreshImageDeliveryUrl(tenant_id, image_url);
    if (!refreshed) {
      return Response.json({ ok: false, error: "이미지 URL이 만료되었거나 유효하지 않습니다. 이미지를 다시 선택해주세요." }, { status: 400 });
    }
    publishImageUrl = refreshed;
  }

  // SNS-007: account_id 지정 시 그 계정으로만 발행 — getChannelCred는 삭제/cross-tenant면 조용히
  // 기본계정으로 새지 않고 null을 반환하므로, 여기선 그 null을 "선택계정 미연결"로 그대로 노출한다.
  const cred = await getChannelCred(tenant_id, platform, account_id || undefined);
  if (!cred) {
    return Response.json(
      {
        ok: false,
        error: account_id
          ? `선택한 ${platform} 계정을 찾을 수 없음 — 삭제되었거나 다른 테넌트 소유`
          : `${platform} 채널 미연결 — Settings에서 토큰 등록 필요`,
      },
      { status: 400 },
    );
  }
  const incidentResourceKey = `account:${cred.accountId ?? "default"}`;

  let reservationId: string | null = null;
  {
    try {
      const [reservation] = await withTenant(tenant_id, (sql) => sql<{ id: string }[]>`
        INSERT INTO published_posts
          (tenant_id, draft_id, platform, text, status, account_id, idempotency_key, reserved_at)
        VALUES
          (${tenant_id}::uuid, ${reservationDraftId}::uuid, ${platform}, ${text ?? null}, 'in_progress',
           ${cred.accountId ?? null}::uuid, ${reservationKey}, now())
        ON CONFLICT DO NOTHING
        RETURNING id::text
      `);
      reservationId = reservation?.id ?? null;
    } catch {
      return Response.json({
        ok: false,
        code: "PUBLISH_RESERVATION_FAILED",
        error: "발행 중복 방지 예약을 만들지 못해 외부 게시를 시작하지 않았습니다.",
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }

    if (!reservationId) {
    const [conflict] = await withTenant(tenant_id, (sql) => sql<ReservationConflictRow[]>`
      SELECT id::text, status, external_id, permalink,
             reserved_at::text AS reserved_at, first_comment_status
        FROM published_posts
       WHERE tenant_id = ${tenant_id}::uuid
         AND platform = ${platform}
         AND account_id IS NOT DISTINCT FROM ${cred.accountId ?? null}::uuid
         AND status IN ('published', 'in_progress', 'uncertain')
         AND (
           (${reservationDraftId}::uuid IS NOT NULL AND draft_id = ${reservationDraftId}::uuid)
           OR (${reservationKey}::text IS NOT NULL AND idempotency_key = ${reservationKey})
         )
       ORDER BY published_at DESC
       LIMIT 1
    `);

    if (!conflict) {
      // 예약은 막혔는데 막은 행을 못 찾았다. 상태를 모르는 채로 외부 게시를 시작하지 않는다.
      return Response.json({
        ok: false,
        code: "PUBLISH_RESERVATION_FAILED",
        error: "발행 예약 상태를 확인하지 못해 외부 게시를 시작하지 않았습니다. 잠시 후 다시 시도해주세요.",
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }

    if (conflict.status === "uncertain") {
      return Response.json({
        ok: false,
        code: "PUBLISH_STATE_UNCERTAIN",
        error: "직전 발행의 외부 결과를 확인하지 못했습니다. 중복 게시를 막기 위해 다시 보내지 않았습니다. 채널에서 게시 여부를 확인한 뒤 처리해주세요.",
        reconciliation: { required: true, action: "verify_with_provider", retryPublish: false, platform },
      }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    if (conflict.status === "in_progress") {
      const reservedAt = conflict.reserved_at ? new Date(conflict.reserved_at) : null;
      const expired = reservedAt !== null && Date.now() - reservedAt.getTime() > reservationLeaseMs();
      if (!expired) {
        return Response.json({
          ok: false,
          code: "PUBLISH_ALREADY_IN_PROGRESS",
          error: "같은 작업물의 발행이 진행 중이거나 결과 확인이 필요합니다. 중복 게시를 막기 위해 다시 보내지 않았습니다.",
        }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }

      // 임차가 만료됐다. 회수 전에 공급자에게 이미 올라갔는지 먼저 묻는다.
      // 조회 결과가 "있다"면 그 게시물을 이 예약의 결과로 확정하고 다시 올리지 않는다.
      const readback = await findRecentProviderPost(platform, cred, text || "", reservedAt!);
      if (readback.state === "found") {
        try {
          await withTenant(tenant_id, (sql) => sql`
            UPDATE published_posts
               SET status = 'published', external_id = ${readback.hit.externalId},
                   permalink = ${readback.hit.permalink ?? null}, error = NULL,
                   reserved_at = NULL, published_at = now()
             WHERE tenant_id = ${tenant_id}::uuid AND id = ${conflict.id}::uuid AND status = 'in_progress'
          `);
        } catch {
          return partialPersistenceFailure(
            { ok: true, externalId: readback.hit.externalId, permalink: readback.hit.permalink },
            { stage: "publication_record", draftId: draft_id, platform, accountId: cred.accountId },
          );
        }
        return Response.json({
          ok: true,
          externalId: readback.hit.externalId,
          permalink: readback.hit.permalink,
          alreadyPublished: true,
          recoveredFrom: "provider_readback",
        });
      }
      if (readback.state === "unknown") {
        // 모르는 것을 없는 것으로 바꾸지 않는다. uncertain 으로 못 박고 사람이 확인하게 한다.
        await withTenant(tenant_id, (sql) => sql`
          UPDATE published_posts
             SET status = 'uncertain',
                 error = '발행 예약이 만료됐고 공급자 조회도 실패해 게시 여부를 확인하지 못했습니다.',
                 reserved_at = NULL
           WHERE tenant_id = ${tenant_id}::uuid AND id = ${conflict.id}::uuid AND status = 'in_progress'
        `).catch(() => {});
        return Response.json({
          ok: false,
          code: "PUBLISH_STATE_UNCERTAIN",
          error: "직전 발행의 외부 결과를 확인하지 못했습니다. 중복 게시를 막기 위해 다시 보내지 않았습니다. 채널에서 게시 여부를 확인한 뒤 처리해주세요.",
          reconciliation: { required: true, action: "verify_with_provider", retryPublish: false, platform },
        }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }

      // 공급자가 "그런 게시물 없다"고 답했다. 그때만 임차를 회수해 다시 시도한다.
      // 회수 경쟁은 예약 시각 비교로 닫는다. 한 요청만 이긴다.
      const [taken] = await withTenant(tenant_id, (sql) => sql<{ id: string }[]>`
        UPDATE published_posts
           SET reserved_at = now(), error = NULL, text = ${text ?? null}
         WHERE tenant_id = ${tenant_id}::uuid AND id = ${conflict.id}::uuid
           AND status = 'in_progress'
           AND reserved_at = ${conflict.reserved_at}::timestamptz
        RETURNING id::text
      `);
      if (!taken) {
        return Response.json({
          ok: false,
          code: "PUBLISH_ALREADY_IN_PROGRESS",
          error: "같은 작업물의 발행이 진행 중이거나 결과 확인이 필요합니다. 중복 게시를 막기 위해 다시 보내지 않았습니다.",
        }, { status: 409, headers: { "Cache-Control": "no-store" } });
      }
      void reportFailure({
        event: "publish_failed",
        severity: "warning",
        workspaceId: tenant_id,
        resourceKey: incidentResourceKey,
        context: { platform: normalizePlatform(platform), reason: "reservation_lease_reclaimed", httpStatus: null },
      });
      reservationId = taken.id;
    }

    if (!reservationId) {
      const existing = conflict;
      // 본문은 이미 올라갔다. 첫 댓글만 요청됐고 그 상태를 서버가 알고 있으면 댓글만 멱등 복구한다.
      if (firstCommentText) {
        if (existing.first_comment_status === "published") {
          return Response.json({
            ok: true,
            externalId: existing.external_id ?? undefined,
            permalink: existing.permalink ?? undefined,
            alreadyPublished: true,
            firstComment: { ok: true, alreadyPublished: true },
          });
        }
        if (existing.first_comment_status === "uncertain" || existing.first_comment_status === null) {
          return Response.json({
            error: "이미 발행된 게시물의 first comment 상태를 확인할 수 없어 중복 방지를 위해 거절했습니다.",
            code: "first_comment_state_unknown",
          }, { status: 409 });
        }
        // not_requested 또는 failed. 본문은 그대로 두고 댓글만 다시 시도한다.
        if (!existing.external_id) {
          return Response.json({
            error: "본문 게시물 번호가 없어 first comment를 복구할 수 없습니다.",
            code: "first_comment_recovery_unavailable",
          }, { status: 409 });
        }
        const recovered = await publishFirstComment(
          platform as FirstCommentPlatform,
          cred,
          existing.external_id,
          firstCommentText,
        );
        const state = firstCommentState(true, recovered);
        try {
          await withTenant(tenant_id, (sql) => sql`
            UPDATE published_posts
               SET first_comment_status = ${state.status},
                   first_comment_error = ${state.error},
                   first_comment_external_id = ${state.externalId}
             WHERE tenant_id = ${tenant_id}::uuid AND id = ${existing.id}::uuid
          `);
        } catch {
          return partialPersistenceFailure(
            { ok: true, externalId: existing.external_id, permalink: existing.permalink ?? undefined },
            { stage: "publication_record", draftId: draft_id, platform, accountId: cred.accountId },
          );
        }
        return Response.json({
          ok: true,
          externalId: existing.external_id,
          permalink: existing.permalink ?? undefined,
          alreadyPublished: true,
          firstComment: recovered,
          partial: !recovered.ok,
        }, recovered.ok ? undefined : { headers: { "Cache-Control": "no-store" } });
      }
      let permalink = existing.permalink ?? undefined;
      if (!permalink && existing.external_id && (platform === "threads" || platform === "instagram")) {
        const recoveredPermalink = platform === "threads"
          ? await fetchThreadsPermalink(cred.token, existing.external_id)
          : await fetchInstagramPermalink(cred, existing.external_id);
        if (recoveredPermalink) {
          permalink = recoveredPermalink;
          try {
            await withTenant(tenant_id, (sql) => sql`
              UPDATE published_posts SET permalink = ${recoveredPermalink}
               WHERE tenant_id = ${tenant_id}::uuid AND id = ${existing.id}::uuid
                 AND status = 'published'
            `);
          } catch {
            return partialPersistenceFailure(
              { ok: true, externalId: existing.external_id ?? undefined, permalink },
              {
                stage: "publication_record",
                draftId: draft_id,
                platform,
                accountId: cred.accountId,
              },
            );
          }
        }
      }
      const existingResult: PublishResult = {
        ok: true,
        externalId: existing.external_id ?? undefined,
        permalink,
      };
      // queue 기록은 초안 기반 발행에만 있다. 멱등 키 기반 발행은 대상 queue 행이 없다.
      if (isDraftUuid) {
        try {
          const queueRecorded = await markQueuePublished(tenant_id, draft_id, {
            platform,
            externalId: existing.external_id ?? undefined,
            permalink,
          });
          // 위와 같은 이유로 큐에 없는 것은 실패가 아니다.
          if (queueRecorded === "absent") {
            console.info("[publish] queue_record_absent(dedupe)", platform, "승인 큐를 거치지 않은 직접 발행");
          }
        } catch {
          return partialPersistenceFailure(existingResult, {
            stage: "queue_record",
            draftId: draft_id,
            platform,
            accountId: cred.accountId,
          });
        }
      }
      return Response.json({
        ok: true,
        externalId: existing.external_id ?? undefined,
        permalink,
        alreadyPublished: true,
      });
    }
    }
  }

  // 여기까지 왔으면 이 요청이 예약을 쥐고 있어야 한다. 쥐지 않은 채 외부 게시로 넘어가면
  // 결과를 적을 행이 없고 중복 방지도 걸리지 않는다. 방어적으로 닫는다.
  if (!reservationId) {
    return Response.json({
      ok: false,
      code: "PUBLISH_RESERVATION_FAILED",
      error: "발행 예약을 쥐지 못해 외부 게시를 시작하지 않았습니다.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  let result: PublishResult;
  if (platform === "threads") {
    result = await publishThreads(cred, text || "", publishImageUrl, undefined, publishFields.topicTag);
  } else if (platform === "instagram") {
    result = await publishInstagram(cred, text || "", publishImageUrl);
  } else if (platform === "x") {
    // X API v2 + OAuth1.0a 직접발행(P5). text only, 280자 자동 절단.
    result = await publishX(cred, text || "");
  } else if (platform === "facebook") {
    // Facebook 페이지 Graph API 직접발행(P5). image_url 있으면 /photos, 없으면 /feed.
    result = await publishFacebook(cred, text || "", publishImageUrl);
  } else if (platform === "bluesky") {
    result = await publishBluesky(cred, text || "", publishImageUrl);
  } else if (platform === "telegram") {
    result = await publishTelegram(cred, text || "", publishImageUrl);
  } else if (platform === "discord") {
    result = await publishDiscord(cred, text || "", publishImageUrl);
  } else if (platform === "slack") {
    result = await publishSlack(cred, text || "", publishImageUrl);
  } else {
    result = { ok: false, error: `${platform} 미지원` };
  }

  let firstCommentResult: PublishResult | null = null;
  if (result.ok && firstCommentText) {
    firstCommentResult = result.externalId
      ? await publishFirstComment(platform as FirstCommentPlatform, cred, result.externalId, firstCommentText)
      : { ok: false, error: "게시물 ID가 없어 first comment를 발행하지 못했습니다." };
  }

  // 실발행 실패 고위험 경계 — "채널 미연결"(설정 문제, 위에서 이미 400 반환)은 대상이 아니고,
  // 여기 도달한 !ok는 플랫폼 API 호출이 실제로 실패한 경우만. fire-and-forget — 응답/상태코드 불변.
  // platform(요청 바디 원문, 공격자 통제 가능)과 result.error(플랫폼 API 응답 본문 포함 가능한
  // 임의 외부 텍스트)를 절대 그대로 넘기지 않고 고정 코드로만 정규화한다(observability.ts 참고).
  if (!result.ok) {
    const { reason, httpStatus } = classifyPublishFailure(result.error);
    void reportFailure({
      event: "publish_failed",
      severity: "warning",
      workspaceId: tenant_id,
      resourceKey: incidentResourceKey,
      context: { platform: normalizePlatform(platform), reason, httpStatus },
    });
  } else if (!firstCommentResult || firstCommentResult.ok) {
    void reportRecovery?.({
      workspaceId: tenant_id,
      category: "publish_failed",
      source: normalizeIncidentSource(platform),
      resourceKey: incidentResourceKey,
    });
  } else {
    const { reason, httpStatus } = classifyPublishFailure(firstCommentResult.error);
    void reportFailure({
      event: "publish_failed",
      severity: "warning",
      workspaceId: tenant_id,
      resourceKey: incidentResourceKey,
      context: { platform: normalizePlatform(platform), reason, httpStatus },
    });
  }

  // published_posts 기록.
  // 게시 성공 뒤 응답만 끊긴 경우(failureKind indeterminate)는 실패가 아니라 uncertain 이다.
  // 이걸 failed 로 저장하면 다음 시도가 같은 글을 한 번 더 올린다.
  const recordStatus = result.ok
    ? "published"
    : result.failureKind === "indeterminate" ? "uncertain" : "failed";
  // 본문과 첫 댓글은 독립 상태다. 댓글만 실패한 게시물이 전체 성공으로 보이면 안 된다.
  const commentState = firstCommentState(Boolean(firstCommentText) && result.ok, firstCommentResult);
  try {
    await withTenant(tenant_id, (sql) => sql`
      UPDATE published_posts
      SET external_id = ${result.externalId ?? null},
          permalink = ${result.permalink ?? null},
          text = ${text ?? null},
          status = ${recordStatus},
          error = ${result.error ?? null},
          reserved_at = NULL,
          first_comment_status = ${commentState.status},
          first_comment_error = ${commentState.error},
          first_comment_external_id = ${commentState.externalId},
          provider_meta = ${sql.json(firstCommentResult ? { firstComment: firstCommentResult } as never : {} as never)},
          published_at = now()
      WHERE tenant_id = ${tenant_id}::uuid AND id = ${reservationId}::uuid
    `);
  } catch (error) {
    // 2026-09-05 회장 계정 실측: 실제로는 올라갔는데 "내부 기록 실패"만 뜨고, 컨테이너
    // 로그에는 아무것도 없었다. 여기서 예외를 그대로 버렸기 때문이다. 이유를 안 남기면
    // 같은 증상이 나도 매번 처음부터 추측해야 한다. 값은 남기지 않고 사유만 남긴다.
    console.error("[publish][persist-fail] publication_record", platform,
      error instanceof Error ? error.message : String(error));
    if (result.ok) {
      return partialPersistenceFailure(result, {
        stage: "publication_record",
        draftId: draft_id,
        platform,
        accountId: cred.accountId,
      });
    }
    return Response.json(
      {
        ...result,
        persistence: {
          ok: false,
          stage: "publication_record",
          error: { code: "PUBLICATION_RECORD_FAILED", message: "실패한 발행 시도 기록 저장에 실패했습니다." },
        },
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (result.ok && isDraftUuid) {
    try {
      const queueRecorded = await markQueuePublished(tenant_id, draft_id, {
        platform,
        externalId: result.externalId,
        permalink: result.permalink,
      });
      // 큐에 없는 것은 실패가 아니다. 스튜디오에서 바로 발행하면 승인 큐를 거치지 않으므로
      // 없는 것이 정상이다. 종전에는 이것을 내부 기록 실패로 보고 사용자에게 복구를
      // 요구하며 재발행을 막았다(2026-09-05 회장 계정 실측). 갱신 실패는 예외로 잡힌다.
      if (queueRecorded === "absent") {
        console.info("[publish] queue_record_absent", platform, "승인 큐를 거치지 않은 직접 발행");
      }
    } catch (error) {
      console.error("[publish][persist-fail] queue_record", platform,
        error instanceof Error ? error.message : String(error));
      return partialPersistenceFailure(result, {
        stage: "queue_record",
        draftId: draft_id,
        platform,
        accountId: cred.accountId,
      });
    }
  }
  if (recordStatus === "uncertain") {
    return Response.json({
      ...result,
      code: "PUBLISH_STATE_UNCERTAIN",
      reconciliation: { required: true, action: "verify_with_provider", retryPublish: false, platform },
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({
    ...result,
    ...(firstCommentResult ? {
      firstComment: firstCommentResult,
      firstCommentStatus: commentState.status,
      partial: result.ok && !firstCommentResult.ok,
    } : {}),
  });
}
