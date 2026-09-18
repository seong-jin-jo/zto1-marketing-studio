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
          status: H.row.status, external_id: H.row.externalId, usage_status: H.row.usageStatus }] : []);
      }
      if (query.includes("UPDATE published_posts")) {
        H.updateCalls += 1;
        H.row.status = "published";
        H.row.externalId = "provider-1";
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
      draftId: DRAFT_ID, externalId: null, usageStatus: null, status: "in_progress" };
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
});
