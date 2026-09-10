import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression: OSMU-BLOCK-F3/F4. 첫 댓글 실패와 멱등 재생을 새 성공으로 세어
// 열린 발행 장애를 복구하던 결함.
// Found by 교차 모델 검수 on 2026-08-28.
// Report: docs/audit/osmu-cross-review-2026-08-28-opus.md

const H = vi.hoisted(() => ({
  failures: [] as unknown[],
  recoveries: [] as unknown[],
  existing: null as null | { external_id: string; permalink: string },
  accountId: "11111111-1111-4111-8111-111111111111",
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "cd1d0a40-540d-4524-9b49-bf2445d82182"),
}));
vi.mock("@/lib/observability", async (importActual) => ({
  ...await importActual<typeof import("@/lib/observability")>(),
  reportFailure: vi.fn(async (input: unknown) => H.failures.push(input)),
  reportRecovery: vi.fn(async (input: unknown) => H.recoveries.push(input)),
}));
vi.mock("@/lib/queue-store", () => ({ markQueuePublished: vi.fn(async () => "updated" as const) }));
vi.mock("@/lib/first-comment", () => ({
  getFirstCommentCapability: vi.fn(() => ({ platform: "threads", supported: true })),
  normalizeFirstComment: vi.fn((value: unknown) => typeof value === "string" ? value.trim() : null),
  publishFirstComment: vi.fn(async () => ({ ok: false, error: "first comment failed (500)" })),
}));
vi.mock("@/lib/publish", () => ({
  getChannelCred: vi.fn(async () => ({ token: "token", userId: "user", accountId: H.accountId })),
  publishThreads: vi.fn(async () => ({ ok: true, externalId: "post-1", permalink: "https://example.test/post-1" })),
  publishInstagram: vi.fn(), publishX: vi.fn(), publishFacebook: vi.fn(), publishBluesky: vi.fn(),
  publishTelegram: vi.fn(), publishDiscord: vi.fn(), publishSlack: vi.fn(),
  fetchThreadsPermalink: vi.fn(), fetchInstagramPermalink: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("INSERT INTO published_posts") && query.includes("'in_progress'")) {
        return Promise.resolve(H.existing ? [] : [{ id: "22222222-2222-4222-8222-222222222222" }]);
      }
      if (query.includes("SELECT id::text, status")) {
        return Promise.resolve(H.existing
          ? [{
            id: "44444444-4444-4444-8444-444444444444",
            status: "published",
            external_id: H.existing.external_id,
            permalink: H.existing.permalink,
            reserved_at: null,
            first_comment_status: "not_requested",
          }]
          : []);
      }
      return Promise.resolve([]);
    };
    sql.json = (value: unknown) => value;
    return callback(sql);
  }),
}));

async function publish(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/publish/route");
  const response = await POST(new Request("http://localhost/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  H.failures = [];
  H.recoveries = [];
  H.existing = null;
});

describe("발행 복구 신호 회귀", () => {
  it("OSMU-BLOCK-F3 거절: 첫 댓글 실패는 계정 장애를 열고 정상 복구로 세지 않는다", async () => {
    const result = await publish({
      platform: "threads",
      text: "본문",
      first_comment: "첫 댓글",
      draft_id: "33333333-3333-4333-8333-333333333333",
    });

    expect(result.body).toMatchObject({ ok: true, partial: true });
    expect(H.recoveries).toHaveLength(0);
    expect(H.failures).toEqual([expect.objectContaining({
      event: "publish_failed",
      resourceKey: `account:${H.accountId}`,
    })]);
  });

  it("OSMU-BLOCK-F4 거절: 저장된 발행 응답 재생은 새 복구 신호를 만들지 않는다", async () => {
    H.existing = { external_id: "existing-post", permalink: "https://example.test/existing" };
    const result = await publish({
      platform: "threads",
      text: "본문",
      draft_id: "33333333-3333-4333-8333-333333333333",
    });

    expect(result.body).toMatchObject({ ok: true, alreadyPublished: true });
    expect(H.failures).toHaveLength(0);
    expect(H.recoveries).toHaveLength(0);
  });
});
