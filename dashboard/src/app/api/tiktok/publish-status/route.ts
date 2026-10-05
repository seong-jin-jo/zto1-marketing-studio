import { effectiveTenantId, AuthError } from "@/lib/tenant-auth";
import { withTenant } from "@/lib/db";
import { getChannelCred } from "@/lib/publish";
import {
  fetchTikTokPostStatus,
  queryTikTokCreatorInfo,
  tiktokRejectReasonMessage,
  type TikTokProviderError,
} from "@/lib/tiktok";
import { publicationUsageOutbox, recordPublicationEvent } from "@/lib/usage-events";

function tiktokErrorMetadata(
  providerError: TikTokProviderError,
  code = providerError.code,
  failReasonCode?: string,
) {
  return {
    tiktokError: {
      ...providerError,
      code,
    },
    ...(failReasonCode ? { tiktokFailReasonCode: failReasonCode } : {}),
  };
}

function hasSameTikTokError(
  providerMeta: Record<string, unknown> | null,
  providerError: TikTokProviderError,
): boolean {
  const stored = providerMeta?.tiktokError;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return false;
  const value = stored as Record<string, unknown>;
  return value.code === providerError.code
    && value.message === providerError.message
    && value.logId === providerError.logId;
}

// publish_id는 client가 임의로 제출할 수 있지만, 이 endpoint는 먼저 현재 tenant의
// published_posts 예약을 찾는다. 저장되지 않은 ID나 다른 tenant/account의 토큰으로는 절대
// provider status를 조회하지 않는다.
export async function GET(request: Request) {
  const publishId = new URL(request.url).searchParams.get("publish_id") || "";
  if (!publishId || publishId.length > 128) {
    return Response.json({ error: "TikTok 발행 식별자 형식이 올바르지 않습니다." }, { status: 400 });
  }

  let tenantId: string | null;
  try {
    tenantId = await effectiveTenantId(request, null);
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return Response.json({ error: "테넌트를 확인할 수 없습니다." }, { status: 500 });
  }
  if (!tenantId) return Response.json({ error: "테넌트를 확인할 수 없습니다." }, { status: 400 });

  type StoredPost = {
    id: string;
    status: "in_progress" | "published" | "failed";
    account_id: string | null;
    external_id: string;
    provider_post_id: string | null;
    provider_meta: Record<string, unknown> | null;
    permalink: string | null;
    error: string | null;
  };
  let post: StoredPost | undefined;
  try {
    [post] = await withTenant(tenantId, (sql) => sql<StoredPost[]>`
      SELECT id, status, account_id, external_id, provider_post_id, provider_meta, permalink, error
        FROM published_posts
       WHERE tenant_id = ${tenantId}::uuid
         AND platform = ${"tiktok"}
         AND external_id = ${publishId}
         AND status IN ('in_progress', 'published', 'failed')
       ORDER BY published_at DESC
       LIMIT 1
    `);
  } catch {
    return Response.json({ error: "TikTok 발행 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요." }, { status: 503 });
  }
  // Tenant-scoped query가 찾지 못한 경우도 동일한 404로 처리해 다른 tenant의 publish_id 존재를 숨긴다.
  if (!post) return Response.json({ error: "저장된 TikTok 발행 건을 찾을 수 없습니다." }, { status: 404 });

  if (post.status === "published") {
    return Response.json({
      ok: true,
      status: "published",
      publishId,
      videoId: post.provider_post_id ?? undefined,
      url: post.permalink ?? undefined,
    });
  }
  if (post.status === "failed") {
    return Response.json({
      status: "failed",
      publishId,
      error: post.error || "TikTok 영상 처리에 실패했습니다. 영상 규격과 계정 권한을 확인해주세요.",
    }, { status: 502 });
  }

  // account_id는 예약을 만든 실제 TikTok 계정이다. UI 선택값/기본계정이 이후 바뀌어도 이 작업의
  // 상태 조회가 다른 계정 토큰으로 새지 않도록 그 값만 사용한다.
  if (!post.account_id) {
    return Response.json({ error: "TikTok 발행 계정 정보가 없어 상태를 안전하게 확인할 수 없습니다." }, { status: 409 });
  }
  const cred = await getChannelCred(tenantId, "tiktok", post.account_id);
  if (!cred?.token || cred.accountId !== post.account_id) {
    return Response.json({ error: "TikTok 발행 계정을 찾을 수 없습니다. 계정 연결 상태를 확인해주세요." }, { status: 409 });
  }

  const provider = await fetchTikTokPostStatus(cred.token, publishId);
  if (!provider.ok) {
    const rejectMessage = tiktokRejectReasonMessage(provider.providerError.code);
    const providerMeta = tiktokErrorMetadata(provider.providerError);
    // 상태 조회 실패는 실제 발행 실패가 아니다. 인증·권한·4xx·손상 응답을
    // failed로 마감하면 TikTok에 이미 게시된 영상을 다시 올릴 수 있으므로 진단만 남긴다.
    if (!hasSameTikTokError(post.provider_meta, provider.providerError)) {
      try {
        await withTenant(tenantId, (sql) => sql`
          UPDATE published_posts
             SET provider_meta = COALESCE(provider_meta, '{}'::jsonb)
                   || ${sql.json(providerMeta as never)}::jsonb
           WHERE id = ${post.id}::uuid
             AND tenant_id = ${tenantId}::uuid
             AND platform = ${"tiktok"}
             AND external_id = ${publishId}
             AND status = 'in_progress'
        `);
      } catch {
        return Response.json({ error: "TikTok 상태 오류를 저장하지 못했습니다. 잠시 후 다시 확인해주세요." }, { status: 503 });
      }
    }
    return Response.json({ ok: true, status: "processing", publishId, error: rejectMessage }, { status: 202 });
  }
  if (provider.status === "PUBLISH_COMPLETE") {
    const isSelfOnly = post.provider_meta?.privacyLevel === "SELF_ONLY";
    if (isSelfOnly) {
      try {
        await withTenant(tenantId, (sql) => sql`
          UPDATE published_posts
             SET status = 'published', provider_post_id = null, permalink = null,
                 error = null, published_at = now(),
                 provider_meta = COALESCE(provider_meta, '{}'::jsonb)
                   || ${sql.json(publicationUsageOutbox("tiktok") as never)}::jsonb
           WHERE id = ${post.id}::uuid
             AND tenant_id = ${tenantId}::uuid
             AND platform = ${"tiktok"}
             AND external_id = ${publishId}
             AND status = 'in_progress'
        `);
      } catch {
        return Response.json({ error: "TikTok 완료 상태를 저장하지 못했습니다. 잠시 후 다시 확인해주세요." }, { status: 503 });
      }
      try {
        await recordPublicationEvent(tenantId, post.id, "tiktok");
      } catch {
        return Response.json({
          error: "TikTok 발행은 완료됐지만 사용량 반영이 대기 중입니다. 같은 영상을 다시 게시하지 마세요.",
          status: "published",
          publishId,
          usagePending: true,
        }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
      return Response.json({ ok: true, status: "published", publishId });
    }
    // TikTok 완료 신호와 최종 metadata 조회는 서로 다른 API다. post ID가 없거나 creator-info가
    // 429/5xx로 일시 실패하면 성공을 확정하지 않고 다음 poll에서 다시 회수한다.
    if (!provider.postId) {
      return Response.json({ ok: true, status: "processing", publishId }, { status: 202 });
    }
    const postId = provider.postId;
    const creator = await queryTikTokCreatorInfo(cred.token);
    if (!creator?.username) {
      return Response.json({ ok: true, status: "processing", publishId }, { status: 202 });
    }
    const permalink = `https://www.tiktok.com/@${encodeURIComponent(creator.username)}/video/${postId}`;
    try {
      await withTenant(tenantId, (sql) => sql`
        UPDATE published_posts
           SET status = 'published', provider_post_id = ${postId},
               permalink = ${permalink}, error = null, published_at = now(),
               provider_meta = COALESCE(provider_meta, '{}'::jsonb)
                 || ${sql.json(publicationUsageOutbox("tiktok") as never)}::jsonb
         WHERE id = ${post.id}::uuid
           AND tenant_id = ${tenantId}::uuid
           AND platform = ${"tiktok"}
           AND external_id = ${publishId}
           AND status = 'in_progress'
      `);
    } catch {
      return Response.json({ error: "TikTok 완료 상태를 저장하지 못했습니다. 중복 방지를 위해 잠시 후 다시 확인해주세요." }, { status: 503 });
    }
    try {
      await recordPublicationEvent(tenantId, post.id, "tiktok");
    } catch {
      return Response.json({
        error: "TikTok 발행은 완료됐지만 사용량 반영이 대기 중입니다. 같은 영상을 다시 게시하지 마세요.",
        status: "published",
        publishId,
        videoId: postId,
        url: permalink,
        usagePending: true,
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({
      ok: true,
      status: "published",
      publishId,
      videoId: postId,
      url: permalink ?? undefined,
    });
  }
  if (provider.status === "FAILED") {
    const failureCode = provider.failReason || provider.providerError.code;
    const rejectMessage = tiktokRejectReasonMessage(failureCode);
    const providerMeta = tiktokErrorMetadata(
      provider.providerError,
      failureCode,
      provider.rawFailReason,
    );
    try {
      await withTenant(tenantId, (sql) => sql`
        UPDATE published_posts
           SET status = 'failed', error = ${rejectMessage}, published_at = now(),
               provider_meta = COALESCE(provider_meta, '{}'::jsonb)
                 || ${sql.json(providerMeta as never)}::jsonb
         WHERE id = ${post.id}::uuid
           AND tenant_id = ${tenantId}::uuid
           AND platform = ${"tiktok"}
           AND external_id = ${publishId}
           AND status = 'in_progress'
      `);
    } catch {
      return Response.json({ error: "TikTok 실패 상태를 저장하지 못했습니다. 잠시 후 다시 확인해주세요." }, { status: 503 });
    }
    return Response.json({ status: "failed", publishId, error: rejectMessage }, { status: 502 });
  }

  return Response.json({ ok: true, status: "processing", publishId }, { status: 202 });
}
