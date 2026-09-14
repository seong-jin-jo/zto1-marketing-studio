import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import { getDatabaseUrl } from "../isolation/_env";

// Regression: OSMU-BLOCK-C4. 공급자가 공개 답글을 만들고 응답만 끊긴 청구가
// 일반 lease 만료 뒤 다시 획득되어 같은 답글이 중복 게시될 수 있던 결함.
// Found by 교차 모델 검수 on 2026-08-28.
// Report: docs/_archive/legacy-20260912/audit/osmu-cross-review-2026-08-28-opus.md

describe("답글 결과 불명 청구 회귀", () => {
  it("OSMU-BLOCK-C4 거절: 결과 불명 표식이 있는 청구는 lease가 지나도 다시 획득하지 않는다", async (ctx) => {
    const url = getDatabaseUrl();
    if (!url) {
      if (process.env.CI) throw new Error("CI requires DATABASE_URL for C4 regression");
      ctx.skip();
      return;
    }
    const admin = postgres(url, { max: 3, idle_timeout: 5, connect_timeout: 8, onnotice: () => {} });
    const tenantId = randomUUID();
    const postId = randomUUID();
    const previousUrl = process.env.DATABASE_URL;
    const previousLease = process.env.ENGAGEMENT_REPLY_CLAIM_STALE_AFTER_MS;
    let appDb: { end: (options: { timeout: number }) => Promise<void> } | null = null;
    try {
      await admin`INSERT INTO tenants (id, slug, name, status, tier)
        VALUES (${tenantId}::uuid, ${`engagement-c4-${tenantId}`}, 'Engagement C4', 'active', 'team')`;
      await admin`INSERT INTO published_posts (id, tenant_id, platform, external_id, status)
        VALUES (${postId}::uuid, ${tenantId}::uuid, 'threads', 'provider-post-c4', 'published')`;
      process.env.DATABASE_URL = url;
      process.env.ENGAGEMENT_REPLY_CLAIM_STALE_AFTER_MS = "1000";
      vi.resetModules();
      const { claimReply, touchReplyClaim } = await import("@/lib/engagement-store");

      const first = await claimReply({
        tenantId,
        postId,
        platform: "threads",
        commentId: "comment-c4",
        requestKey: "request-c4-first",
        text: "공개됐을 수 있는 답글",
      });
      expect(first.status).toBe("claimed");
      await touchReplyClaim(tenantId, "threads", "comment-c4", "request-c4-first");
      await admin`UPDATE engagement_items SET updated_at = now() - interval '2 seconds'
        WHERE tenant_id = ${tenantId} AND provider_comment_id = 'comment-c4'`;

      const retry = await claimReply({
        tenantId,
        postId,
        platform: "threads",
        commentId: "comment-c4",
        requestKey: "request-c4-retry",
        text: "공개됐을 수 있는 답글",
      });

      expect(retry.status).toBe("conflict");
      expect(retry.row?.reply_external_id).toBe("status-unknown");
      const { db } = await import("@/lib/db");
      appDb = db();
    } finally {
      await admin`DELETE FROM tenants WHERE id = ${tenantId}::uuid`;
      if (appDb) await appDb.end({ timeout: 5 });
      await admin.end({ timeout: 5 });
      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
      if (previousLease === undefined) delete process.env.ENGAGEMENT_REPLY_CLAIM_STALE_AFTER_MS;
      else process.env.ENGAGEMENT_REPLY_CLAIM_STALE_AFTER_MS = previousLease;
      vi.resetModules();
    }
  });
});
