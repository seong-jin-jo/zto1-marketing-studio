import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "99999999-9999-9999-9999-999999999999";
const ACCOUNT_A = "22222222-2222-2222-2222-222222222222";
const H = vi.hoisted(() => ({
  tenantId: "11111111-1111-1111-1111-111111111111",
  row: { id: "row-1", tenantId: "11111111-1111-1111-1111-111111111111", status: "in_progress", accountId: "22222222-2222-2222-2222-222222222222", externalId: "pub-1", providerPostId: null as string | null, providerMeta: { privacyLevel: "PUBLIC_TO_EVERYONE" } as Record<string, unknown>, permalink: null as string | null, error: null as string | null },
  cred: { token: "tenant-a-token", accountId: "22222222-2222-2222-2222-222222222222" } as { token: string; accountId: string } | null,
  provider: { ok: true, status: "PROCESSING_UPLOAD", providerError: { code: "ok", message: "", logId: null } } as Record<string, unknown> | null,
  creator: { username: "creator-a" } as { username: string } | null,
  credentialCalls: [] as unknown[][],
  statusCalls: [] as unknown[][],
  usageEvents: [] as unknown[][],
  diagnosticWrites: 0,
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
  AuthError: class AuthError extends Error {},
}));
vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" ");
      if (query.includes("SELECT id, status, account_id")) {
        if (tenantId !== H.row.tenantId || values[2] !== H.row.externalId) return Promise.resolve([]);
        return Promise.resolve([{
          id: H.row.id, status: H.row.status, account_id: H.row.accountId,
          external_id: H.row.externalId, provider_post_id: H.row.providerPostId, provider_meta: H.row.providerMeta,
          permalink: H.row.permalink, error: H.row.error,
        }]);
      }
      if (query.includes("SET status = 'published'")) {
        H.row.status = "published";
        if (query.includes("provider_post_id = null")) {
          H.row.providerPostId = null;
          H.row.permalink = null;
        } else {
          H.row.providerPostId = values[0] as string | null;
          H.row.permalink = values[1] as string | null;
        }
        return Promise.resolve([]);
      }
      if (query.includes("SET status = 'failed'")) {
        H.row.status = "failed";
        const message = values.find((value) => typeof value === "string" && value.includes("TikTok"));
        if (typeof message === "string") H.row.error = message;
        const metadata = values.find((value) => typeof value === "object" && value !== null) as Record<string, unknown> | undefined;
        if (metadata) H.row.providerMeta = { ...H.row.providerMeta, ...metadata };
        return Promise.resolve([]);
      }
      if (query.includes("SET provider_meta")) {
        H.diagnosticWrites += 1;
        const metadata = values.find((value) => typeof value === "object" && value !== null) as Record<string, unknown> | undefined;
        if (metadata) H.row.providerMeta = { ...H.row.providerMeta, ...metadata };
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }, { json: (value: unknown) => value });
    return callback(sql);
  }),
}));
vi.mock("@/lib/publish", () => ({
  getChannelCred: vi.fn(async (...args: unknown[]) => { H.credentialCalls.push(args); return H.cred; }),
}));
vi.mock("@/lib/tiktok", async (importActual) => ({
  ...await importActual<typeof import("@/lib/tiktok")>(),
  fetchTikTokPostStatus: vi.fn(async (...args: unknown[]) => { H.statusCalls.push(args); return H.provider; }),
  queryTikTokCreatorInfo: vi.fn(async () => H.creator),
}));
vi.mock("@/lib/usage-events", () => ({
  publicationUsageOutbox: (platform: string) => ({ usageEvent: { status: "pending", platform } }),
  recordPublicationEvent: vi.fn(async (...args: unknown[]) => {
    H.usageEvents.push(args);
    return { recorded: true, alreadyRecorded: false };
  }),
}));

async function status(publishId = "pub-1") {
  const { GET } = await import("@/app/api/tiktok/publish-status/route");
  const response = await GET(new Request(`http://localhost/api/tiktok/publish-status?publish_id=${encodeURIComponent(publishId)}`));
  return { response, body: await response.json() as Record<string, unknown> };
}

describe("GET /api/tiktok/publish-status", () => {
  beforeEach(() => {
    H.tenantId = TENANT_A;
    H.row = { id: "row-1", tenantId: TENANT_A, status: "in_progress", accountId: ACCOUNT_A, externalId: "pub-1", providerPostId: null, providerMeta: { privacyLevel: "PUBLIC_TO_EVERYONE" }, permalink: null, error: null };
    H.cred = { token: "tenant-a-token", accountId: ACCOUNT_A };
    H.provider = { ok: true, status: "PROCESSING_UPLOAD", providerError: { code: "ok", message: "", logId: null } };
    H.creator = { username: "creator-a" };
    H.credentialCalls = [];
    H.statusCalls = [];
    H.usageEvents = [];
    H.diagnosticWrites = 0;
    vi.resetModules();
  });

  it("uses only the saved reservation account token and keeps a non-final post processing", async () => {
    const { response, body } = await status();
    expect(response.status).toBe(202);
    expect(body).toEqual({ ok: true, status: "processing", publishId: "pub-1" });
    expect(H.credentialCalls).toEqual([[TENANT_A, "tiktok", ACCOUNT_A]]);
    expect(H.statusCalls).toEqual([["tenant-a-token", "pub-1"]]);
    expect(JSON.stringify(body)).not.toContain("tenant-a-token");
  });

  it("persists PUBLISH_COMPLETE and returns the post id/permalink without changing the saved publish_id", async () => {
    H.provider = { ok: true, status: "PUBLISH_COMPLETE", postId: "post-9", providerError: { code: "ok", message: "", logId: "log-complete-1" } };
    const { response, body } = await status();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "published",
      publishId: "pub-1",
      videoId: "post-9",
      url: "https://www.tiktok.com/@creator-a/video/post-9",
    });
    expect(H.row).toMatchObject({
      status: "published",
      externalId: "pub-1",
      providerPostId: "post-9",
      permalink: "https://www.tiktok.com/@creator-a/video/post-9",
    });
    H.provider = { ok: true, status: "PROCESSING_UPLOAD", providerError: { code: "ok", message: "", logId: null } };
    const stored = await status();
    expect(stored.body).toMatchObject({
      status: "published",
      publishId: "pub-1",
      videoId: "post-9",
      url: "https://www.tiktok.com/@creator-a/video/post-9",
    });
    expect(H.statusCalls).toHaveLength(1);
    expect(H.usageEvents).toEqual([[TENANT_A, "row-1", "tiktok"]]);
  });

  it("persists provider failure with a fixed message and hides raw provider reasons", async () => {
    H.provider = { ok: true, status: "FAILED", failReason: "spam_risk_too_many_posts", providerError: { code: "ok", message: "", logId: "log-failed-1" } };
    const { response, body } = await status();
    expect(response.status).toBe(502);
    expect(body).toMatchObject({ status: "failed" });
    expect(H.row.status).toBe("failed");
    expect(body.error).toContain("하루 게시 한도");
    expect(H.row.error).toContain("하루 게시 한도");
    expect(H.row.providerMeta).toMatchObject({
      tiktokError: { code: "spam_risk_too_many_posts", message: "", logId: "log-failed-1" },
    });
  });

  it("keeps a completed provider job pending until post id and creator metadata can both be recovered", async () => {
    H.provider = { ok: true, status: "PUBLISH_COMPLETE", postId: "post-9", providerError: { code: "ok", message: "", logId: null } };
    H.creator = null;
    const transient = await status();
    expect(transient.response.status).toBe(202);
    expect(transient.body).toEqual({ ok: true, status: "processing", publishId: "pub-1" });
    expect(H.row).toMatchObject({ status: "in_progress", providerPostId: null, permalink: null });

    H.creator = { username: "creator-a" };
    const recovered = await status();
    expect(recovered.response.status).toBe(200);
    expect(recovered.body).toMatchObject({
      status: "published",
      videoId: "post-9",
      url: "https://www.tiktok.com/@creator-a/video/post-9",
    });

    H.row.status = "in_progress";
    H.row.providerPostId = null;
    H.row.permalink = null;
    H.provider = { ok: true, status: "PUBLISH_COMPLETE", providerError: { code: "ok", message: "", logId: null } };
    const missingPostId = await status();
    expect(missingPostId.response.status).toBe(202);
    expect(H.row.status).toBe("in_progress");
  });

  it("settles SELF_ONLY on PUBLISH_COMPLETE without requiring a public post id or permalink", async () => {
    H.row.providerMeta = { privacyLevel: "SELF_ONLY" };
    H.provider = { ok: true, status: "PUBLISH_COMPLETE", providerError: { code: "ok", message: "", logId: null } };
    const { response, body } = await status();
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, status: "published", publishId: "pub-1" });
    expect(H.row).toMatchObject({ status: "published", providerPostId: null, permalink: null });
    expect(H.statusCalls).toHaveLength(1);
    expect(H.usageEvents).toEqual([[TENANT_A, "row-1", "tiktok"]]);
  });

  it("does not reveal or poll another tenant's reservation", async () => {
    H.tenantId = TENANT_B;
    const { response, body } = await status();
    expect(response.status).toBe(404);
    expect(String(body.error)).toContain("찾을 수 없습니다");
    expect(H.credentialCalls).toHaveLength(0);
    expect(H.statusCalls).toHaveLength(0);
  });

  it("refuses an account mismatch instead of falling back to another TikTok token", async () => {
    H.cred = { token: "other-account-token", accountId: "33333333-3333-3333-3333-333333333333" };
    const { response, body } = await status();
    expect(response.status).toBe(409);
    expect(String(body.error)).toContain("계정");
    expect(H.statusCalls).toHaveLength(0);
    expect(JSON.stringify(body)).not.toContain("other-account-token");
  });

  it.each([
    ["access_token_invalid", "Access token expired", "다시 연결"],
    ["scope_not_authorized", "Scope missing", "권한"],
    ["provider_rejected", "", "발행 요청을 거부"],
  ])("TIKTOK-ERROR-03 정상: 상태 조회 오류 %s는 진단만 남기고 발행 상태를 실패로 바꾸지 않는다", async (code, message, guidance) => {
    H.provider = {
      ok: false,
      providerError: { code, message, logId: "log-status-1" },
    };

    const { response, body } = await status();
    expect(response.status).toBe(202);
    expect(body).toMatchObject({ ok: true, status: "processing", publishId: "pub-1" });
    expect(body.error).toContain(guidance);
    expect(H.row.status).toBe("in_progress");
    expect(H.row.error).toBeNull();
    expect(H.row.providerMeta).toMatchObject({
      tiktokError: { code, message, logId: "log-status-1" },
    });
    expect(H.diagnosticWrites).toBe(1);
  });

  it("TIKTOK-ERROR-07 정상: FAILED의 알려지지 않은 형식 정상 fail_reason을 진단용 원문 code로 보존한다", async () => {
    H.provider = {
      ok: true,
      status: "FAILED",
      failReason: "provider_rejected",
      rawFailReason: "video_under_review_timeout",
      providerError: { code: "ok", message: "", logId: "log-failed-raw-1" },
    };

    const { response, body } = await status();
    expect(response.status).toBe(502);
    expect(body.error).toContain("발행 요청을 거부");
    expect(H.row.status).toBe("failed");
    expect(H.row.providerMeta).toMatchObject({
      tiktokError: { code: "provider_rejected", message: "", logId: "log-failed-raw-1" },
      tiktokFailReasonCode: "video_under_review_timeout",
    });
  });

  it.each([
    ["provider_unavailable", "잠시 후"],
    ["rate_limit_exceeded", "몇 분 뒤"],
  ])("TIKTOK-ERROR-05 정상: 재시도 오류 %s는 진행 상태를 유지하고 진단을 한 번만 저장한다", async (code, guidance) => {
    H.provider = {
      ok: false,
      providerError: { code, message: "temporary provider failure", logId: "log-retry-1" },
    };

    const first = await status();
    expect(first.response.status).toBe(202);
    expect(first.body).toMatchObject({ ok: true, status: "processing", publishId: "pub-1" });
    expect(first.body.error).toContain(guidance);
    expect(H.row.status).toBe("in_progress");
    expect(H.row.providerMeta).toMatchObject({
      tiktokError: { code, message: "temporary provider failure", logId: "log-retry-1" },
    });
    expect(H.diagnosticWrites).toBe(1);

    const second = await status();
    expect(second.response.status).toBe(202);
    expect(H.row.status).toBe("in_progress");
    expect(H.diagnosticWrites).toBe(1);
  });
});
