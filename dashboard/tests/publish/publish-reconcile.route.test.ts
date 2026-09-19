import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueRecoveryProof } from "@/lib/publish-recovery-proof";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "99999999-9999-4999-8999-999999999999";
const DRAFT_ID = "22222222-2222-4222-8222-222222222222";
const PUBLICATION_ID = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";

const H = vi.hoisted(() => ({
  tenantId: "11111111-1111-4111-8111-111111111111",
  row: {
    id: "33333333-3333-4333-8333-333333333333",
    tenantId: "11111111-1111-4111-8111-111111111111",
    platform: "threads",
    accountId: "44444444-4444-4444-8444-444444444444",
    draftId: "22222222-2222-4222-8222-222222222222",
    externalId: null as string | null,
    usageStatus: null as string | null,
    firstCommentStatus: "failed" as string | null,
    firstCommentError: null as string | null,
    firstCommentExternalId: null as string | null,
    status: "in_progress",
  },
  updateCalls: 0,
  queueCalls: [] as unknown[][],
  usageCalls: [] as unknown[][],
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" ");
      if (query.includes("SELECT id::text")) {
        const requestedId = values[1];
        const platform = values[2];
        const accountId = values[3];
        const matches = tenantId === H.row.tenantId
          && requestedId === H.row.id
          && platform === H.row.platform
          && accountId === H.row.accountId;
        return Promise.resolve(matches ? [{ id: H.row.id, draft_id: H.row.draftId,
          status: H.row.status, external_id: H.row.externalId, usage_status: H.row.usageStatus,
          first_comment_status: H.row.firstCommentStatus,
          first_comment_error: H.row.firstCommentError,
          first_comment_external_id: H.row.firstCommentExternalId }] : []);
      }
      if (query.includes("UPDATE published_posts")) {
        H.updateCalls += 1;
        if (query.includes("SET first_comment_status")) {
          H.row.firstCommentStatus = values[0] as string;
          H.row.firstCommentError = values[1] as string | null;
          H.row.firstCommentExternalId = values[2] as string | null;
        } else {
          H.row.status = "published";
          H.row.externalId = "provider-1";
          if (query.includes("first_comment_status = COALESCE")) {
            H.row.firstCommentStatus = values[2] as string;
            H.row.firstCommentError = values[4] as string | null;
            H.row.firstCommentExternalId = values[6] as string | null;
          }
        }
        return Promise.resolve([{ id: H.row.id }]);
      }
      return Promise.resolve([]);
    }, { json: (value: unknown) => value });
    return callback(sql);
  }),
}));

vi.mock("@/lib/queue-store", () => ({
  markQueuePublished: vi.fn(async (...args: unknown[]) => {
    H.queueCalls.push(args);
    return "updated";
  }),
}));

vi.mock("@/lib/usage-events", () => ({
  publicationUsageOutbox: (platform: string) => ({ usageEvent: { status: "pending", platform } }),
  recordPublicationEvent: vi.fn(async (...args: unknown[]) => {
    H.usageCalls.push(args);
    return { recorded: true, alreadyRecorded: false };
  }),
}));

async function reconcile(tenantId = TENANT_A, changes: Record<string, unknown> = {}) {
  const stage = (changes.stage ?? "publication_record") as "publication_record" | "queue_record" | "usage_record";
  const receipt = changes.receipt === undefined ? issueRecoveryProof({
    tenantId, publicationId: PUBLICATION_ID, draftId: DRAFT_ID, accountId: ACCOUNT_ID,
    platform: "threads", externalId: "provider-1", permalink: "https://example.com/post/1",
    occurredAt: "2026-08-31T23:59:00.000Z", stage,
    firstComment: { status: "not_requested", error: null, externalId: null },
  }) : changes.receipt;
  const { POST } = await import("@/app/api/publish/reconcile/route");
  const response = await POST(new Request("http://localhost/api/publish/reconcile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tenant_id: tenantId,
      reconciliations: [{
        platform: "threads",
        draftId: DRAFT_ID,
        publicationId: PUBLICATION_ID,
        accountId: ACCOUNT_ID,
        externalId: "provider-1",
        permalink: "https://example.com/post/1",
        stage,
        receipt,
        ...changes,
      }],
    }),
  }));
  return { response, body: await response.json() as Record<string, unknown> };
}

describe("POST /api/publish/reconcile", () => {
  beforeEach(() => {
    process.env.OSMU_SECRET_KEY = "recovery-test-key";
    H.tenantId = TENANT_A;
    H.row = { id: PUBLICATION_ID, tenantId: TENANT_A, platform: "threads", accountId: ACCOUNT_ID,
      draftId: DRAFT_ID, externalId: null, usageStatus: null, status: "in_progress",
      firstCommentStatus: "failed", firstCommentError: null, firstCommentExternalId: null };
    H.updateCalls = 0;
    H.queueCalls = [];
    H.usageCalls = [];
    vi.resetModules();
  });

  it("REVIEW-24H-20260918-01 정상: 외부 재게시 없이 발행 원장, 승인 큐, 사용량만 복구한다", async () => {
    const { response, body } = await reconcile();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, repaired: [{ platform: "threads", publicationId: PUBLICATION_ID }] });
    expect(H.row.status).toBe("published");
    expect(H.queueCalls).toEqual([[TENANT_A, DRAFT_ID, {
      platform: "threads",
      externalId: "provider-1",
      permalink: "https://example.com/post/1",
      publishedAt: "2026-08-31T23:59:00.000Z",
    }]]);
    expect(H.usageCalls).toEqual([[TENANT_A, PUBLICATION_ID, "threads"]]);
  });

  it("REVIEW-24H-20260918-01 거절: 다른 작업 공간의 발행 식별자는 복구하지 않는다", async () => {
    H.tenantId = TENANT_B;
    const { response, body } = await reconcile(TENANT_B);

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ ok: false, repaired: [] });
    expect(H.row.status).toBe("in_progress");
    expect(H.queueCalls).toHaveLength(0);
    expect(H.usageCalls).toHaveLength(0);
  });

  it("REVIEW-20260918-01 거절: 실패한 발행을 서버 증표로도 성공 처리하지 않는다", async () => {
    H.row.status = "failed";
    const { response } = await reconcile();
    expect(response.status).toBe(409);
    expect(H.updateCalls).toBe(0);
    expect(H.queueCalls).toHaveLength(0);
  });

  it("REVIEW-20260918-02 거절: 같은 작업 공간의 다른 초안 큐를 닫지 않는다", async () => {
    H.row.draftId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const { response } = await reconcile();
    expect(response.status).toBe(409);
    expect(H.updateCalls).toBe(0);
    expect(H.queueCalls).toHaveLength(0);
  });

  it("REVIEW-20260918-03 정상: 사용량만 지연되면 발행 행과 큐를 다시 쓰지 않는다", async () => {
    H.row.status = "published";
    H.row.externalId = "provider-1";
    H.row.usageStatus = "pending";
    const { response } = await reconcile(TENANT_A, { stage: "usage_record" });
    expect(response.status).toBe(200);
    expect(H.updateCalls).toBe(0);
    expect(H.queueCalls).toHaveLength(0);
    expect(H.usageCalls).toEqual([[TENANT_A, PUBLICATION_ID, "threads"]]);
  });

  it("REVIEW-20260918-04 거절: 클라이언트가 외부 ID 또는 증표를 바꾸면 복구하지 않는다", async () => {
    const changed = await reconcile(TENANT_A, { externalId: "invented-id" });
    expect(changed.response.status).toBe(409);
    const unsigned = await reconcile(TENANT_A, { receipt: null });
    expect(unsigned.response.status).toBe(409);
    expect(H.updateCalls).toBe(0);
  });

  it("REVIEW-20260918-05 멱등: 이미 복구한 발행은 다시 덮어쓰지 않는다", async () => {
    const first = await reconcile();
    const second = await reconcile();
    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect(H.updateCalls).toBe(1);
  });

  it("REVIEW-20260918-21 정상: 초기 본문 증표의 첫 댓글 성공을 같은 트랜잭션에서 복원한다", async () => {
    const receipt = issueRecoveryProof({ tenantId: TENANT_A, publicationId: PUBLICATION_ID,
      draftId: DRAFT_ID, accountId: ACCOUNT_ID, platform: "threads", externalId: "provider-1",
      permalink: "https://example.com/post/1", occurredAt: "2026-08-31T23:59:00.000Z",
      stage: "publication_record",
      firstComment: { status: "published", error: null, externalId: "comment-1" } });
    const result = await reconcile(TENANT_A, { receipt });
    expect(result.response.status).toBe(200);
    expect(result.body.repaired).toEqual([expect.objectContaining({ firstCommentStatus: "published" })]);
    expect(H.row.firstCommentStatus).toBe("published");
    expect(H.row.firstCommentExternalId).toBe("comment-1");
    expect((await reconcile(TENANT_A, { receipt })).response.status).toBe(200);
  });

  it("REVIEW-20260918-21 정상: 댓글 미요청 증표는 not_requested로 복원해 본문 완료를 유지한다", async () => {
    const result = await reconcile();
    expect(result.response.status).toBe(200);
    expect(result.body.repaired).toEqual([expect.objectContaining({ firstCommentStatus: "not_requested" })]);
    expect(H.row.firstCommentStatus).toBe("not_requested");
  });

  it("REVIEW-20260918-15 월경계: 큐만 다음 달 복구해도 공급자 성공 시각을 넘긴다", async () => {
    H.row.status = "published";
    H.row.externalId = "provider-1";
    const { response } = await reconcile(TENANT_A, { stage: "queue_record" });
    expect(response.status).toBe(200);
    expect(H.queueCalls[0]?.[2]).toMatchObject({ publishedAt: "2026-08-31T23:59:00.000Z" });
    expect(H.updateCalls).toBe(0);
  });

  it("REVIEW-20260918-14 정상·멱등: 첫 댓글 성공 증표는 댓글 필드만 복구하고 재실행해도 큐·사용량을 건드리지 않는다", async () => {
    H.row.status = "published";
    H.row.externalId = "provider-1";
    const receipt = issueRecoveryProof({ tenantId: TENANT_A, publicationId: PUBLICATION_ID,
      draftId: DRAFT_ID, accountId: ACCOUNT_ID, platform: "threads", externalId: "provider-1",
      permalink: "https://example.com/post/1", occurredAt: "2026-09-18T00:00:00Z",
      stage: "first_comment_record",
      firstComment: { status: "published", error: null, externalId: "comment-1" } });
    const first = await reconcile(TENANT_A, { stage: "first_comment_record", receipt });
    const repeat = await reconcile(TENANT_A, { stage: "first_comment_record", receipt });
    expect(first.response.status).toBe(200);
    expect(repeat.response.status).toBe(200);
    expect(H.row.firstCommentStatus).toBe("published");
    expect(H.row.firstCommentExternalId).toBe("comment-1");
    expect(H.updateCalls).toBe(1);
    expect(H.queueCalls).toHaveLength(0);
    expect(H.usageCalls).toHaveLength(0);
  });

  it("REVIEW-20260918-14 거절: 첫 댓글 증표를 본문 복구 단계에 재사용하거나 다른 게시물에 적용하지 않는다", async () => {
    H.row.status = "published";
    H.row.externalId = "provider-1";
    const receipt = issueRecoveryProof({ tenantId: TENANT_A, publicationId: PUBLICATION_ID,
      draftId: DRAFT_ID, accountId: ACCOUNT_ID, platform: "threads", externalId: "provider-1",
      permalink: "https://example.com/post/1", occurredAt: "2026-09-18T00:00:00Z",
      stage: "first_comment_record",
      firstComment: { status: "published", error: null, externalId: "comment-1" } });
    expect((await reconcile(TENANT_A, { receipt, stage: "publication_record" })).response.status).toBe(409);
    H.row.externalId = "another-post";
    expect((await reconcile(TENANT_A, { receipt, stage: "first_comment_record" })).response.status).toBe(409);
    expect(H.updateCalls).toBe(0);
  });

  it("REVIEW-20260918-19 만료: 서명이 맞지만 24시간 지난 증표는 재게시 금지와 지원 조치를 안내한다", async () => {
    const issuedAt = Date.now();
    const receipt = issueRecoveryProof({ tenantId: TENANT_A, publicationId: PUBLICATION_ID,
      draftId: DRAFT_ID, accountId: ACCOUNT_ID, platform: "threads", externalId: "provider-1",
      permalink: "https://example.com/post/1", occurredAt: "2026-09-18T00:00:00Z",
      stage: "publication_record" });
    const now = vi.spyOn(Date, "now").mockReturnValue(issuedAt + 25 * 60 * 60 * 1000);
    try {
      const { response, body } = await reconcile(TENANT_A, { receipt });
      expect(response.status).toBe(409);
      expect(body.failed).toEqual(expect.arrayContaining([expect.objectContaining({
        error: expect.stringContaining("24시간 유효기간"),
      })]));
      expect(JSON.stringify(body)).toContain("다시 게시하지 마세요");
      expect(H.updateCalls).toBe(0);
    } finally { now.mockRestore(); }
  });
});
