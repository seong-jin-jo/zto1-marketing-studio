import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDatabaseUrl } from "../isolation/_env";

// Regression: OSMU-BLOCK-C5. 동시 좋아요 요청 둘이 기존 상태 확인을 함께 통과해
// 외부 공급자를 두 번 호출하던 결함.
// Found by 교차 모델 검수 on 2026-08-28.
// Report: docs/_archive/legacy-20260912/audit/osmu-cross-review-2026-08-28-opus.md

let admin: ReturnType<typeof postgres> | null = null;
let tenantId = "";

afterEach(async () => {
  if (admin && tenantId) await admin`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
  if (admin) {
    const { db } = await import("@/lib/db");
    await db().end({ timeout: 5 });
    await admin.end({ timeout: 5 });
  }
  admin = null;
  tenantId = "";
  vi.resetModules();
});

describe("댓글 좋아요 외부 호출 직렬화 회귀", () => {
  it("OSMU-BLOCK-C5 경합: 같은 댓글의 동시 요청 둘은 공급자를 한 번만 호출한다", async (ctx) => {
    const url = getDatabaseUrl();
    if (!url) {
      if (process.env.CI) throw new Error("CI requires DATABASE_URL for C5 regression");
      ctx.skip();
      return;
    }
    process.env.DATABASE_URL = url;
    admin = postgres(url, { max: 3, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
    tenantId = randomUUID();
    const postId = randomUUID();
    await admin`INSERT INTO tenants (id, slug, name, status, tier)
      VALUES (${tenantId}::uuid, ${`engagement-c5-${tenantId}`}, 'Engagement C5', 'active', 'team')`;
    await admin`INSERT INTO published_posts (id, tenant_id, platform, external_id, status)
      VALUES (${postId}::uuid, ${tenantId}::uuid, 'threads', 'provider-post-c5', 'published')`;

    vi.resetModules();
    const { likeEngagementOnce } = await import("@/lib/engagement-store");
    let providerCalls = 0;
    const providerLike = async () => {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
    };
    const input = { tenantId, postId, platform: "threads", commentId: "comment-c5" };
    const results = await Promise.all([
      likeEngagementOnce(input, providerLike),
      likeEngagementOnce(input, providerLike),
    ]);

    expect(providerCalls).toBe(1);
    expect(results.map((result) => result.reused).sort()).toEqual([false, true]);
    expect(results.every((result) => result.row.liked_at !== null)).toBe(true);
  });

  it("OSMU-BLOCK-C5 거절: 공급자 실패는 좋아요 완료로 저장하지 않고 다음 요청을 막지 않는다", async (ctx) => {
    const url = getDatabaseUrl();
    if (!url) {
      if (process.env.CI) throw new Error("CI requires DATABASE_URL for C5 regression");
      ctx.skip();
      return;
    }
    process.env.DATABASE_URL = url;
    admin = postgres(url, { max: 3, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
    tenantId = randomUUID();
    const postId = randomUUID();
    await admin`INSERT INTO tenants (id, slug, name, status, tier)
      VALUES (${tenantId}::uuid, ${`engagement-c5-reject-${tenantId}`}, 'Engagement C5 reject', 'active', 'team')`;
    await admin`INSERT INTO published_posts (id, tenant_id, platform, external_id, status)
      VALUES (${postId}::uuid, ${tenantId}::uuid, 'threads', 'provider-post-c5-reject', 'published')`;

    vi.resetModules();
    const { likeEngagementOnce } = await import("@/lib/engagement-store");
    const input = { tenantId, postId, platform: "threads", commentId: "comment-c5-reject" };
    await expect(likeEngagementOnce(input, async () => { throw new Error("provider rejected"); })).rejects.toThrow("provider rejected");
    const [afterFailure] = await admin<{ liked_at: Date | null }[]>`
      SELECT liked_at FROM engagement_items
      WHERE tenant_id = ${tenantId}::uuid AND provider_comment_id = 'comment-c5-reject'`;
    expect(afterFailure).toBeUndefined();

    const recovered = await likeEngagementOnce(input, async () => undefined);
    expect(recovered.reused).toBe(false);
    expect(recovered.row.liked_at).not.toBeNull();
  });
});
