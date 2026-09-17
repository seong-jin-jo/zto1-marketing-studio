import { beforeEach, describe, expect, it, vi } from "vitest";

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
    status: "in_progress",
  },
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
        return Promise.resolve(matches ? [{ id: H.row.id }] : []);
      }
      if (query.includes("UPDATE published_posts")) {
        H.row.status = "published";
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

async function reconcile(tenantId = TENANT_A) {
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
      }],
    }),
  }));
  return { response, body: await response.json() as Record<string, unknown> };
}

describe("POST /api/publish/reconcile", () => {
  beforeEach(() => {
    H.tenantId = TENANT_A;
    H.row = { id: PUBLICATION_ID, tenantId: TENANT_A, platform: "threads", accountId: ACCOUNT_ID, status: "in_progress" };
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
});
