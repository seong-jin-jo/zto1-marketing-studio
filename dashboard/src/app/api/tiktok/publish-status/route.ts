import { effectiveTenantId, AuthError } from "@/lib/tenant-auth";
import { withTenant } from "@/lib/db";
import { getChannelCred } from "@/lib/publish";
import { fetchTikTokPostStatus, queryTikTokCreatorInfo } from "@/lib/tiktok";

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
    return Response.json({ status: "failed", publishId, error: "TikTok 영상 처리에 실패했습니다. 영상 규격과 계정 권한을 확인해주세요." }, { status: 502 });
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
  if (!provider || !provider.status) {
    // provider 일시 실패는 failed로 덮어쓰지 않는다. 저장된 작업은 다음 poll/reload에서 회수 가능하다.
    return Response.json({ ok: true, status: "processing", publishId }, { status: 202 });
  }
  if (provider.status === "PUBLISH_COMPLETE") {
    const isSelfOnly = post.provider_meta?.privacyLevel === "SELF_ONLY";
    if (isSelfOnly) {
      try {
        await withTenant(tenantId, (sql) => sql`
          UPDATE published_posts
             SET status = 'published', provider_post_id = null, permalink = null,
                 error = null, published_at = now()
           WHERE id = ${post.id}::uuid
             AND tenant_id = ${tenantId}::uuid
             AND platform = ${"tiktok"}
             AND external_id = ${publishId}
             AND status = 'in_progress'
        `);
      } catch {
        return Response.json({ error: "TikTok 완료 상태를 저장하지 못했습니다. 잠시 후 다시 확인해주세요." }, { status: 503 });
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
               permalink = ${permalink}, error = null, published_at = now()
         WHERE id = ${post.id}::uuid
           AND tenant_id = ${tenantId}::uuid
           AND platform = ${"tiktok"}
           AND external_id = ${publishId}
           AND status = 'in_progress'
      `);
    } catch {
      return Response.json({ error: "TikTok 완료 상태를 저장하지 못했습니다. 중복 방지를 위해 잠시 후 다시 확인해주세요." }, { status: 503 });
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
    try {
      await withTenant(tenantId, (sql) => sql`
        UPDATE published_posts
           SET status = 'failed', error = ${"TikTok 영상 처리 실패"}, published_at = now()
         WHERE id = ${post.id}::uuid
           AND tenant_id = ${tenantId}::uuid
           AND platform = ${"tiktok"}
           AND external_id = ${publishId}
           AND status = 'in_progress'
      `);
    } catch {
      return Response.json({ error: "TikTok 실패 상태를 저장하지 못했습니다. 잠시 후 다시 확인해주세요." }, { status: 503 });
    }
    return Response.json({ status: "failed", publishId, error: "TikTok 영상 처리에 실패했습니다. 영상 규격과 계정 권한을 확인해주세요." }, { status: 502 });
  }

  return Response.json({ ok: true, status: "processing", publishId }, { status: 202 });
}
