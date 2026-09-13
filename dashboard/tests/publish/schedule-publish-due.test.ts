import { describe, it, expect, beforeEach, vi } from "vitest";
import { withTenant } from "@/lib/db";
import { getChannelCred, publishInstagram, publishThreads, publishX } from "@/lib/publish";

const H = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  rows: [] as Array<{
    id: string;
    draft_id: string | null;
    platforms: string[] | null;
    payload: Record<string, unknown> | null;
    draft_payload: Record<string, unknown> | null;
  }>,
  dueTenants: [] as string[], // 운영자 전체 스윕 시 db()가 돌려줄 due 테넌트 id
  claimedTenants: [] as string[], // processTenant가 호출된 테넌트 추적
  inserts: [] as unknown[][],
  updates: [] as unknown[][],
  sqlTexts: [] as string[],
  leaseOwned: true,
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

vi.mock("@/lib/db", () => ({
  // 운영자 전체 스윕에서 due 테넌트 id를 긁는 RLS 우회 service-role 커넥션.
  db: vi.fn(() => (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    if (/SELECT\s+DISTINCT\s+tenant_id/i.test(text)) {
      return Promise.resolve(H.dueTenants.map((tenant_id) => ({ tenant_id })));
    }
    return Promise.resolve([]);
  }),
  withTenant: vi.fn(async (tenantId: string, cb: (sql: unknown) => unknown) => {
    H.claimedTenants.push(tenantId);
    const sql = Object.assign(
      (strings: TemplateStringsArray, ...vals: unknown[]) => {
        const text = strings.join("?");
        H.sqlTexts.push(text);
        if (/WITH\s+due\s+AS/i.test(text)) return Promise.resolve(H.rows);
        if (/INSERT\s+INTO\s+published_posts/i.test(text)) {
          H.inserts.push(vals);
          return Promise.resolve([]);
        }
        if (/UPDATE\s+schedules\s+SET\s+status/i.test(text)) {
          H.updates.push(vals);
          return Promise.resolve([]);
        }
        if (/UPDATE\s+schedules/i.test(text) && /RETURNING\s+id/i.test(text)) {
          return Promise.resolve(H.leaseOwned ? [{ id: "lease-owned" }] : []);
        }
        return Promise.resolve([]);
      },
      { json: (value: unknown) => value },
    );
    return cb(sql);
  }),
}));

vi.mock("@/lib/publish", () => ({
  getChannelCred: vi.fn(async () => ({ token: "tok", userId: "u-1" })),
  publishThreads: vi.fn(async () => ({ ok: true, externalId: "th-1", permalink: "https://threads/1" })),
  publishX: vi.fn(async () => ({ ok: true, externalId: "tw-1", permalink: "https://x/1" })),
  publishInstagram: vi.fn(async () => ({ ok: true, externalId: "ig-1" })),
  publishFacebook: vi.fn(async () => ({ ok: true, externalId: "fb-1" })),
}));

async function publishDue(body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const { POST } = await import("@/app/api/schedule/publish-due/route");
  const res = await POST(
    new Request("http://localhost/api/schedule/publish-due", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  delete process.env.DASHBOARD_AUTH_TOKEN;
  H.tenantId = "tenant-1";
  H.rows = [];
  H.dueTenants = [];
  H.claimedTenants = [];
  H.inserts = [];
  H.updates = [];
  H.sqlTexts = [];
  H.leaseOwned = true;
});

describe("POST /api/schedule/publish-due — 예약 실발행 루프", () => {
  it("테넌트 해석 불가 → 400, DB 접근 없음", async () => {
    H.tenantId = null;
    const { status, body } = await publishDue();
    expect(status).toBe(400);
    expect(body.error).toMatch(/tenant_id/);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("due schedule 없음 → processed=0", async () => {
    const { status, body } = await publishDue({ tenant_id: "tenant-1" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(0);
    expect(H.inserts).toHaveLength(0);
    expect(H.updates).toHaveLength(0);
  });

  it("due schedule을 claim하고 플랫폼별 발행/기록 후 published로 닫는다", async () => {
    H.rows = [
      {
        id: "sched-1",
        draft_id: "draft-1",
        platforms: ["threads", "x"],
        payload: null,
        draft_payload: {
          text: { threads: "threads body", x: "x body" },
          img: { url: "https://cdn/image.png" },
        },
      },
    ];

    const { status, body } = await publishDue({ tenant_id: "tenant-1", limit: 10 });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.processed).toBe(1);
    expect(body.schedules[0].status).toBe("published");
    expect(getChannelCred).toHaveBeenCalledTimes(2);
    expect(publishThreads).toHaveBeenCalledWith({ token: "tok", userId: "u-1" }, "threads body", "https://cdn/image.png");
    expect(publishX).toHaveBeenCalledWith({ token: "tok", userId: "u-1" }, "x body");
    expect(H.inserts).toHaveLength(2);
    expect(H.updates).toHaveLength(1);
    expect(H.updates[0]).toContain("published");
  });

  it("일부 플랫폼 실패 시 published_posts에 실패 기록을 남기고 partial로 닫는다", async () => {
    H.rows = [
      {
        id: "sched-2",
        draft_id: "draft-2",
        platforms: ["threads", "myspace"],
        payload: { text: "shared body" },
        draft_payload: null,
      },
    ];

    const { body } = await publishDue({ tenant_id: "tenant-1" });

    expect(body.schedules[0].status).toBe("partial");
    expect(H.inserts).toHaveLength(2);
    expect(H.updates[0]).toContain("partial");
  });
});

describe("OSMU 코드리뷰 예약 발행 회귀", () => {
  it("OSMU-008 정상 경로: 만료된 processing 예약도 lease 토큰으로 다시 claim하고 소유권을 갱신한다", async () => {
    H.rows = [{
      id: "sched-stale",
      draft_id: "draft-stale",
      platforms: ["threads"],
      payload: { text: "lease recovery" },
      draft_payload: null,
    }];

    const { body } = await publishDue({ tenant_id: "tenant-1" });

    expect(body.schedules[0].status).toBe("published");
    const claimSql = H.sqlTexts.find((text) => /WITH\s+due\s+AS/i.test(text));
    expect(claimSql).toMatch(/status = 'processing'/);
    expect(claimSql).toMatch(/processingLease/);
    expect(H.sqlTexts.some((text) => /processingLease,expiresAt/.test(text) && /workerToken/.test(text))).toBe(true);
  });

  it("OSMU-008 거절 경로: lease 갱신이 거절되면 공급자 호출 전에 발행을 멈춘다", async () => {
    H.leaseOwned = false;
    H.rows = [{
      id: "sched-lost",
      draft_id: "draft-lost",
      platforms: ["threads"],
      payload: { text: "must not publish" },
      draft_payload: null,
    }];

    const { body } = await publishDue({ tenant_id: "tenant-1" });

    expect(body.schedules[0].results[0].error).toMatch(/소유권이 만료/);
    expect(publishThreads).not.toHaveBeenCalled();
  });

  it("OSMU-009 정상 경로: 예약된 인스타그램 카드뉴스 세 장을 배열 그대로 발행한다", async () => {
    H.rows = [{
      id: "sched-carousel",
      draft_id: "draft-carousel",
      platforms: ["instagram"],
      payload: {
        text: { instagram: { caption: "세 장 카드뉴스" } },
        img: { imageUrls: ["https://cdn/1.png", "https://cdn/2.png", "https://cdn/3.png"] },
      },
      draft_payload: null,
    }];

    const { body } = await publishDue({ tenant_id: "tenant-1" });

    expect(body.schedules[0].status).toBe("published");
    expect(publishInstagram).toHaveBeenCalledWith(
      { token: "tok", userId: "u-1" },
      "세 장 카드뉴스",
      ["https://cdn/1.png", "https://cdn/2.png", "https://cdn/3.png"],
    );
  });

  it("OSMU-009 거절 경로: 한 장만 받는 채널에 여러 장을 예약하면 조용히 버리지 않는다", async () => {
    H.rows = [{
      id: "sched-overflow",
      draft_id: "draft-overflow",
      platforms: ["threads"],
      payload: { text: "overflow", image_urls: ["https://cdn/1.png", "https://cdn/2.png"] },
      draft_payload: null,
    }];

    const { body } = await publishDue({ tenant_id: "tenant-1" });

    expect(body.schedules[0].status).toBe("failed");
    expect(body.schedules[0].results[0].error).toMatch(/발행을 시작하지 않았습니다/);
    expect(publishThreads).not.toHaveBeenCalled();
  });
});

describe("POST /api/schedule/publish-due — 운영자 전체 테넌트 스윕", () => {
  it("tenant_id 없음 + 운영자 토큰 불일치 → 400, DB 접근 없음", async () => {
    H.tenantId = null;
    process.env.DASHBOARD_AUTH_TOKEN = "op-secret";
    const { status, body } = await publishDue({}, { Authorization: "Bearer wrong-token" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/tenant_id/);
    expect(H.claimedTenants).toHaveLength(0);
  });

  it("운영자 토큰 + due 테넌트들 → 각 테넌트를 순회 발행하고 합계를 반환", async () => {
    H.tenantId = null; // effectiveTenantId 미해석 → 운영자 분기
    process.env.DASHBOARD_AUTH_TOKEN = "op-secret";
    H.dueTenants = ["tenant-a", "tenant-b"];
    H.rows = [
      {
        id: "sched-x",
        draft_id: "draft-x",
        platforms: ["threads"],
        payload: { text: "body" },
        draft_payload: null,
      },
    ];

    const { status, body } = await publishDue({}, { Authorization: "Bearer op-secret" });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("all-tenants");
    expect(body.tenantCount).toBe(2);
    expect(body.processed).toBe(2); // 테넌트당 1건 × 2
    // 각 테넌트가 자기 스코프(withTenant)로 처리됐는지 — 순서·집합 모두 due 테넌트와 일치(크로스테넌트 누수 방지).
    expect([...new Set(H.claimedTenants)]).toEqual(["tenant-a", "tenant-b"]);
    for (const t of H.claimedTenants) expect(["tenant-a", "tenant-b"]).toContain(t);
  });

  it("운영자 토큰 + due 테넌트 0개 → processed=0, 발행 없음", async () => {
    H.tenantId = null;
    process.env.DASHBOARD_AUTH_TOKEN = "op-secret";
    H.dueTenants = [];

    const { status, body } = await publishDue({}, { Authorization: "Bearer op-secret" });

    expect(status).toBe(200);
    expect(body.mode).toBe("all-tenants");
    expect(body.processed).toBe(0);
    expect(H.claimedTenants).toHaveLength(0);
    expect(H.inserts).toHaveLength(0);
  });
});

// published_posts INSERT 값 순서(publish-due):
// [tenant_id, draft_id, platform, external_id, permalink, text, status, error, account_id]
const PD_I = { accountId: 8 };

describe("POST /api/schedule/publish-due — SNS-007 payload.account_ids 선택 발행", () => {
  it("payload.account_ids[platform]이 getChannelCred(accountId)로 그대로 전달되고 published_posts.account_id에 기록된다", async () => {
    vi.mocked(getChannelCred).mockImplementation(async (_tid, _platform, accountId) => {
      if (accountId) return { token: "tok-selected", userId: "u-selected", accountId };
      return { token: "tok-default", userId: "u-default", accountId: "acc-default-threads" };
    });
    H.rows = [
      {
        id: "sched-acc",
        draft_id: "draft-acc",
        platforms: ["threads"],
        payload: { text: "body", account_ids: { threads: "acc-selected-1" } },
        draft_payload: null,
      },
    ];

    const { body } = await publishDue({ tenant_id: "tenant-1" });

    expect(body.schedules[0].status).toBe("published");
    expect(getChannelCred).toHaveBeenCalledWith("tenant-1", "threads", "acc-selected-1");
    expect(H.inserts[0][PD_I.accountId]).toBe("acc-selected-1");
  });

  it("account_ids 미지정이면 undefined로 조회하고, 기본계정 resolve 결과(cred.accountId)를 기록한다", async () => {
    vi.mocked(getChannelCred).mockImplementation(async () => ({ token: "tok-default", userId: "u-default", accountId: "acc-default-threads" }));
    H.rows = [
      {
        id: "sched-def",
        draft_id: "draft-def",
        platforms: ["threads"],
        payload: { text: "body" },
        draft_payload: null,
      },
    ];

    const { body } = await publishDue({ tenant_id: "tenant-1" });

    expect(body.schedules[0].status).toBe("published");
    expect(getChannelCred).toHaveBeenCalledWith("tenant-1", "threads", undefined);
    expect(H.inserts[0][PD_I.accountId]).toBe("acc-default-threads");
  });

  it("선택계정이 삭제/cross-tenant(getChannelCred=null)면 기본계정으로 새지 않고 failed 기록 — 다른 계정으로 발행 안 함", async () => {
    vi.mocked(getChannelCred).mockImplementation(async (_tid, _platform, accountId) => {
      if (accountId === "gone-acc") return null; // 삭제된 계정
      return { token: "tok-default", userId: "u-default", accountId: "acc-default-threads" };
    });
    H.rows = [
      {
        id: "sched-gone",
        draft_id: "draft-gone",
        platforms: ["threads"],
        payload: { text: "body", account_ids: { threads: "gone-acc" } },
        draft_payload: null,
      },
    ];

    const { body } = await publishDue({ tenant_id: "tenant-1" });

    expect(body.schedules[0].status).toBe("failed");
    expect(body.schedules[0].results[0].error).toMatch(/선택한.*계정을 찾을 수 없음/);
    expect(H.inserts[0][PD_I.accountId]).toBeNull();
  });
});
