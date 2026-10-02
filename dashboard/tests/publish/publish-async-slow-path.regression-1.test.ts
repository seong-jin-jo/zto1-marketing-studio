// 2026-10-02 컨트롤러 감사: Instagram carousel/Threads 상태 폴링이 약 150초 걸릴 수 있는데
// 클라이언트는 PUBLISH_REQUEST_TIMEOUT_MS(45초)에 끊는다 — video/publish와 같은 거짓-실패
// 계열. POST /api/publish가 예산(기본 8초, 테스트는 env로 단축) 안에 못 끝나면 202 +
// {processing:true, draftId, platform}으로 접수만 알리고 같은 실행을 백그라운드로 잇는다.
// 결과 조회는 새 라우트가 아니라 이미 있던 GET /api/publish?draft_id=...&platforms=...
// (buildUnifiedPublishStatus)가 맡는다 — draft_id가 그대로 "작업 id" 역할을 한다.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const H = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  cred: { token: "tok", userId: "u-1" } as { token: string; userId?: string; accountId?: string } | null,
  threadsDelayMs: 0,
  threadsResult: { ok: true, externalId: "post-1", permalink: "https://www.threads.net/@u/post/1" } as
    { ok: boolean; externalId?: string; permalink?: string; error?: string; failureKind?: "definitive" | "indeterminate" },
  threadsCalls: [] as unknown[][],
  rows: [] as Array<{
    id: string; draft_id: string; platform: string; account_id: string | null;
    status: string; external_id: string | null; permalink: string | null; error: string | null;
    published_at: string;
  }>,
  seq: 0,
}));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => H.tenantId) }));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_t: string, cb: (sql: unknown) => unknown) => {
    const sql = (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join(" ");
      const live = (draft: unknown, platform: unknown, account: unknown) =>
        H.rows.find((r) => r.draft_id === draft && r.platform === platform && r.account_id === (account ?? null)
          && (r.status === "published" || r.status === "in_progress"));
      if (q.includes("INSERT INTO published_posts") && q.includes("'in_progress'")) {
        const [, draft, platform, , account] = vals as [unknown, string, string, unknown, string | null];
        if (live(draft, platform, account)) return Promise.resolve([]);
        const id = `res-${++H.seq}`;
        H.rows.push({
          id, draft_id: draft, platform, account_id: account ?? null, status: "in_progress",
          external_id: null, permalink: null, error: null, published_at: new Date().toISOString(),
        });
        return Promise.resolve([{ id }]);
      }
      if (q.includes("SELECT id::text, status")) {
        // 이 쿼리의 치환 순서는 INSERT와 다르다: tenant, platform, account, draftId(두 번),
        // idempotencyKey(두 번) — vals[0]=tenant, vals[1]=platform, vals[2]=account,
        // vals[3]=draftId.
        const [, platform, account, draft] = vals as [unknown, string, string | null, unknown];
        const row = live(draft, platform, account);
        return Promise.resolve(row ? [{
          id: row.id, status: row.status, external_id: row.external_id, permalink: row.permalink,
          reserved_at: new Date().toISOString(), first_comment_status: null, published_at: row.published_at,
        }] : []);
      }
      // GET 조회(buildUnifiedPublishStatus)가 쓰는 조회 — platform, status, external_id,
      // provider_post_id, permalink, error, published_at, first_comment_status, first_comment_error.
      if (q.includes("SELECT platform, status")) {
        return Promise.resolve(H.rows.map((r) => ({
          platform: r.platform, status: r.status, external_id: r.external_id, provider_post_id: r.external_id,
          permalink: r.permalink, error: r.error, published_at: r.published_at,
          first_comment_status: null, first_comment_error: null,
        })));
      }
      if (q.includes("UPDATE published_posts") && q.includes("SET external_id")) {
        const reservation = H.rows.find((r) => r.status === "in_progress");
        if (reservation) {
          reservation.external_id = vals[0] as string | null;
          reservation.permalink = vals[1] as string | null;
          reservation.status = vals[3] as string;
          reservation.error = vals[4] as string | null;
        }
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    };
    sql.json = (value: unknown) => value;
    return cb(sql);
  }),
}));

vi.mock("@/lib/usage-events", () => ({
  publicationUsageOutbox: (platform: string) => ({ usageEvent: { status: "pending", platform } }),
  recordPublicationEvent: vi.fn(async () => ({ recorded: true, alreadyRecorded: false })),
}));

vi.mock("@/lib/queue-store", () => ({
  markQueuePublished: vi.fn(async () => "updated"),
}));

vi.mock("@/lib/publish", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/publish")>();
  return {
    ...actual,
    getChannelCred: vi.fn(async () => H.cred),
    publishThreads: vi.fn(async (...args: unknown[]) => {
      H.threadsCalls.push(args);
      if (H.threadsDelayMs > 0) await new Promise((r) => setTimeout(r, H.threadsDelayMs));
      return H.threadsResult;
    }),
  };
});

async function callPublish(body: Record<string, unknown>, idempotencyKey = "slow-path-test") {
  const { POST } = await import("@/app/api/publish/route");
  const res = await POST(new Request("http://internal.local/api/publish", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  }));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function callStatus(draftId: string, platforms = "threads") {
  const { GET } = await import("@/app/api/publish/route");
  const res = await GET(new Request(
    `http://internal.local/api/publish?draft_id=${draftId}&platforms=${platforms}&tenant_id=${H.tenantId}`,
  ));
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const DRAFT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("/api/publish — 느린 발행(Threads/Instagram 폴링 150초대)은 거짓 실패 대신 202+폴링", () => {
  beforeEach(() => {
    H.tenantId = "tenant-1";
    H.cred = { token: "tok", userId: "u-1" };
    H.threadsDelayMs = 0;
    H.threadsCalls = [];
    H.rows = [];
    H.seq = 0;
    H.threadsResult = { ok: true, externalId: "post-1", permalink: "https://www.threads.net/@u/post/1" };
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.PUBLISH_FAST_PATH_BUDGET_MS;
  });

  it("예산 안쪽이면 기존과 똑같이 200으로 그 자리에서 바로 응답한다", async () => {
    process.env.PUBLISH_FAST_PATH_BUDGET_MS = "200";
    H.threadsDelayMs = 5;
    const { status, json } = await callPublish({ tenant_id: "tenant-1", platform: "threads", text: "본문", draft_id: DRAFT_ID });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.processing).toBeUndefined();
  });

  it("예산을 넘기면 202 + processing을 돌려주고, GET 상태 조회가 완료 결과(permalink 포함)를 돌려준다", async () => {
    process.env.PUBLISH_FAST_PATH_BUDGET_MS = "30";
    H.threadsDelayMs = 300;
    const { status, json } = await callPublish({ tenant_id: "tenant-1", platform: "threads", text: "본문", draft_id: DRAFT_ID });
    expect(status).toBe(202);
    expect(json.ok).toBe(true);
    expect(json.processing).toBe(true);
    expect(json.draftId).toBe(DRAFT_ID);
    expect(json.platform).toBe("threads");

    await new Promise((r) => setTimeout(r, 400)); // 백그라운드 발행이 끝나도록 기다린다.

    const statusRes = await callStatus(DRAFT_ID);
    expect(statusRes.status).toBe(200);
    const target = (statusRes.json.targets as Array<Record<string, unknown>>).find((t) => t.platform === "threads");
    expect(target?.status).toBe("published");
    expect(target?.permalink).toBe("https://www.threads.net/@u/post/1");
    expect(H.threadsCalls.length).toBe(1);
  });

  it("처리 중에 GET 상태를 조회하면 processing을 돌려준다(완료 전 조기 조회)", async () => {
    process.env.PUBLISH_FAST_PATH_BUDGET_MS = "30";
    H.threadsDelayMs = 300;
    await callPublish({ tenant_id: "tenant-1", platform: "threads", text: "본문", draft_id: DRAFT_ID });
    const statusRes = await callStatus(DRAFT_ID);
    const target = (statusRes.json.targets as Array<Record<string, unknown>>).find((t) => t.platform === "threads");
    expect(target?.status).toBe("processing");
    await new Promise((r) => setTimeout(r, 400));
  });

  it("백그라운드 발행이 실패하면 GET 상태 조회가 failed + 에러 메시지를 돌려준다", async () => {
    process.env.PUBLISH_FAST_PATH_BUDGET_MS = "30";
    H.threadsDelayMs = 300;
    H.threadsResult = { ok: false, error: "Threads API 거절(400)" };
    await callPublish({ tenant_id: "tenant-1", platform: "threads", text: "본문", draft_id: DRAFT_ID });
    await new Promise((r) => setTimeout(r, 400));
    const statusRes = await callStatus(DRAFT_ID);
    const target = (statusRes.json.targets as Array<Record<string, unknown>>).find((t) => t.platform === "threads");
    expect(target?.status).toBe("failed");
    expect(target?.error).toBe("Threads API 거절(400)");
  });

  it("느린 1차 발행이 아직 끝나기 전에 같은 draft_id로 재호출하면 409(기존 예약 로직 그대로)", async () => {
    process.env.PUBLISH_FAST_PATH_BUDGET_MS = "30";
    H.threadsDelayMs = 300;
    const first = await callPublish({ tenant_id: "tenant-1", platform: "threads", text: "본문", draft_id: DRAFT_ID }, "key-1");
    expect(first.status).toBe(202);

    const second = await callPublish({ tenant_id: "tenant-1", platform: "threads", text: "본문", draft_id: DRAFT_ID }, "key-2");
    expect(second.status).toBe(409);
    expect(H.threadsCalls.length).toBe(1);

    await new Promise((r) => setTimeout(r, 400));
  });
});
