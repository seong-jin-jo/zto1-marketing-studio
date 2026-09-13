import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 2026-09-14 "무엇이 실패했는지 말하지 않는다" 회귀.
 *
 * 관측: 같은 계정에서 수집을 세 번 돌렸고 세 번 다 `updated 7 / total 8 / failed 1`,
 * 코드는 `post_not_in_account` 였다. 그런데 **어느 글이 실패한 것인지 응답이 말하지 않아서**
 * 원인 판정이 두 번 뒤집혔다. 채널과 코드와 개수만으로는 "방금 올린 글의 집계 지연" 과
 * "다른 계정에 올린 옛 글" 을 가를 수 없다. 실패했다고는 말하면서 무엇이 실패했는지는 안
 * 말하는 것이 ADR-007(조용한 실패 금지) 위반의 전형이다.
 *
 * 계약 네 줄:
 *  1) 실패 응답은 글 번호와 발행 시각과 경과 분을 싣는다.
 *  2) 왜 그 코드로 판정했는지 근거를 글마다 싣는다(추측이 아니라 그때 본 것).
 *  3) 운영자에게는 채널 쪽 식별자와 계정 대조까지 주고, 고객에게는 주지 않는다.
 *  4) 서버 로그에도 같은 줄을 남긴다. 화면도 응답도 못 볼 때 로그만으로 추적되게.
 */

const state = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => "tenant-identity") }));
vi.mock("@/lib/file-io", () => ({
  readJson: vi.fn(() => ({})),
  writeJson: vi.fn(),
  dataPath: vi.fn((name: string) => name),
}));
vi.mock("@/lib/tenant-context", () => ({ runWithTenant: vi.fn((_id: string, fn: () => unknown) => fn()) }));
vi.mock("@/lib/tiktok", () => ({ fetchTikTokVideoMetrics: vi.fn() }));
vi.mock("@/lib/publish", () => ({
  getChannelCred: vi.fn(async (_tenant: string, channel: string) =>
    channel === "threads" ? { token: "test-token", accountId: "acct-connected" } : null),
  fetchXPublicMetrics: vi.fn(),
  fetchMetaPostMetrics: vi.fn(),
  fetchYouTubeMetrics: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenant: string, fn: (sql: unknown) => Promise<unknown>) => {
    const sql = async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("UPDATE published_posts")) return [];
      if (query.includes("platform = 'threads'")) return state.rows;
      return [];
    };
    Object.assign(sql, { json: (value: unknown) => value });
    return fn(sql);
  }),
}));

const OPERATOR_TOKEN = "operator-token-for-test";
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

type FailureDetail = {
  postId: string;
  channel: string;
  code: string;
  publishedAt: string | null;
  ageMinutes: number | null;
  evidence: string;
  operator?: Record<string, unknown>;
};

async function collect(as: "operator" | "customer") {
  const { POST } = await import("@/app/api/metrics/route");
  const response = await POST(new Request("http://localhost/api/metrics", {
    method: "POST",
    // 고객도 맨몸으로 오지 않는다. 운영자 토큰이 아닌 자기 토큰을 들고 온다. 헤더를 아예
    // 비워 두면 실제로는 인증 단계에서 끝나 버려 정제 경로를 검증하지 못한다.
    headers: { Authorization: `Bearer ${as === "operator" ? OPERATOR_TOKEN : "customer-tenant-token"}` },
    body: JSON.stringify({ tenant_id: "tenant-identity" }),
  }));
  const body = await response.json() as { failureDetails: FailureDetail[]; failures: unknown[] };
  return { status: response.status, body };
}

/** insights 는 거절하고 단건 조회도 거절해 목록 판정으로 내려가는 채널. */
function stubThreads(listPages: Array<{ data: Array<{ id: string; timestamp?: string }>; next?: string }>) {
  let page = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/insights")) return new Response("forbidden", { status: 403 });
    if (url.includes("/me/threads")) {
      const current = listPages[Math.min(page, listPages.length - 1)];
      page += 1;
      return new Response(JSON.stringify({
        data: current.data,
        ...(current.next ? { paging: { next: current.next } } : {}),
      }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }));
}

describe("수집 실패는 어느 글이 왜 실패했는지 말한다", () => {
  beforeEach(() => {
    state.rows = [];
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    // 운영자 토큰이 설정된 운영 환경을 재현한다. 미설정(개발)이면 전부 운영자로 통과한다.
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", OPERATOR_TOKEN);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("실패한 글의 번호와 발행 시각과 경과 분을 응답에 싣는다", async () => {
    state.rows = [
      { id: "row-old", external_id: "threads-old", published_at: minutesAgo(600), account_id: "acct-other" },
      { id: "row-fresh", external_id: "threads-fresh", published_at: minutesAgo(3), account_id: "acct-connected" },
    ];
    stubThreads([{ data: [{ id: "other", timestamp: minutesAgo(900) }] }]);

    const { body } = await collect("operator");

    // 이것이 없어서 "뭔가 하나 실패했다" 에서 멈췄다.
    expect(body.failureDetails).toHaveLength(2);
    const byId = Object.fromEntries(body.failureDetails.map((detail) => [detail.postId, detail]));
    expect(Object.keys(byId).sort()).toEqual(["row-fresh", "row-old"]);
    expect(byId["row-old"].publishedAt).toBe(state.rows[0].published_at);
    expect(byId["row-old"].ageMinutes).toBeGreaterThanOrEqual(599);
    expect(byId["row-fresh"].ageMinutes).toBeLessThanOrEqual(5);
    // 오래된 것이 위에 온다. 유예 밖의 그 글이 맨 먼저 보여야 한다.
    expect(body.failureDetails[0].postId).toBe("row-old");
  });

  it("판정 코드마다 왜 그렇게 판정했는지 근거가 함께 실린다", async () => {
    state.rows = [
      { id: "row-old", external_id: "threads-old", published_at: minutesAgo(600), account_id: "acct-other" },
      { id: "row-fresh", external_id: "threads-fresh", published_at: minutesAgo(3), account_id: "acct-connected" },
    ];
    stubThreads([{ data: [{ id: "other", timestamp: minutesAgo(900) }] }]);

    const { body } = await collect("operator");
    const byId = Object.fromEntries(body.failureDetails.map((detail) => [detail.postId, detail]));

    expect(byId["row-fresh"].code).toBe("metrics_pending_ingest");
    // 유예 안이라는 판정은 시간으로 한 것이지 계정을 봐서 한 것이 아니다.
    expect(byId["row-fresh"].evidence).toContain("유예");
    expect(byId["row-fresh"].evidence).toContain("60분 안");

    expect(byId["row-old"].code).toBe("post_not_in_account");
    // 계정에 없다고 단정한 근거는 "목록을 어디까지 봤나" 다.
    expect(byId["row-old"].evidence).toContain("목록");
    expect(byId["row-old"].evidence).toContain("유예");
    expect(byId["row-old"].operator?.lookupPages).toBe(1);
  });

  it("끝까지 못 본 경우는 못 봤다는 사실이 근거로 남는다", async () => {
    state.rows = [{ id: "row-deep", external_id: "threads-deep", published_at: minutesAgo(60 * 24 * 30) }];
    stubThreads([{
      data: [{ id: "recent", timestamp: minutesAgo(10) }],
      next: "https://graph.threads.net/v1.0/me/threads?after=cursor",
    }]);

    const { body } = await collect("operator");

    expect(body.failureDetails[0].code).toBe("metrics_lookup_incomplete");
    expect(body.failureDetails[0].evidence).toContain("단정하지 않았습니다");
    expect(body.failureDetails[0].operator?.lookupPages).toBe(5);
  });

  it("한도 초과는 계정을 보지 않았다는 사실까지 근거에 적는다", async () => {
    state.rows = [{ id: "row-429", external_id: "threads-429", published_at: minutesAgo(600) }];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/insights")) return new Response("rate limited", { status: 429 });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }));

    const { body } = await collect("operator");

    expect(body.failureDetails[0].code).toBe("provider_429");
    expect(body.failureDetails[0].evidence).toContain("429");
    expect(body.failureDetails[0].evidence).toContain("계정 확인으로 넘어가지 않았습니다");
    expect(body.failureDetails[0].operator?.providerStatus).toBe(429);
  });

  it("운영자에게는 계정 대조까지 주고 고객에게는 주지 않는다", async () => {
    state.rows = [{ id: "row-old", external_id: "threads-old", published_at: minutesAgo(600), account_id: "acct-other" }];
    stubThreads([{ data: [{ id: "other", timestamp: minutesAgo(900) }] }]);

    const operator = await collect("operator");
    const operatorDetail = operator.body.failureDetails[0];
    // "계정에 없다" 의 진짜 원인이 여기 있다. 글이 올라간 계정과 수집이 쓴 계정이 다르다.
    expect(operatorDetail.operator).toMatchObject({
      externalId: "threads-old",
      postAccountId: "acct-other",
      collectedWithAccountId: "acct-connected",
    });

    state.rows = [{ id: "row-old", external_id: "threads-old", published_at: minutesAgo(600), account_id: "acct-other" }];
    vi.resetModules();
    stubThreads([{ data: [{ id: "other", timestamp: minutesAgo(900) }] }]);
    const customer = await collect("customer");
    const customerDetail = customer.body.failureDetails[0];

    // 고객도 자기 글은 찾을 수 있어야 한다.
    expect(customerDetail.postId).toBe("row-old");
    expect(customerDetail.publishedAt).toBeTruthy();
    expect(customerDetail.evidence).toBeTruthy();
    // 계정 바인딩과 공급자 내부 상태는 넘기지 않는다.
    expect(customerDetail.operator).toBeUndefined();
    expect(JSON.stringify(customerDetail)).not.toContain("acct-connected");
    expect(JSON.stringify(customerDetail)).not.toContain("acct-other");
  });

  it("예외 메시지에 토큰이 섞여 와도 근거와 로그에는 나가지 않는다", async () => {
    state.rows = [{ id: "row-boom", external_id: "threads-boom", published_at: minutesAgo(600) }];
    // 런타임이 요청 URL 을 통째로 예외 메시지에 넣는 경우를 그대로 재현한다.
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("fetch failed: https://graph.threads.net/v1.0/x/insights?access_token=super-secret-token");
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { body } = await collect("operator");

    expect(body.failureDetails[0].code).toBe("exception");
    expect(body.failureDetails[0].evidence).not.toContain("super-secret-token");
    expect(body.failureDetails[0].evidence).toContain("[가려짐]");
    const line = warn.mock.calls.find((call) => call[0] === "[metrics][failure]");
    expect(String(line?.[1])).not.toContain("super-secret-token");
  });

  it("목록 응답에 글 목록이 없으면 계정 불일치로 굳히지 않는다", async () => {
    state.rows = [{ id: "row-broken", external_id: "threads-broken", published_at: minutesAgo(600) }];
    // 빈 배열이 아니라 `data` 자체가 없는 응답이다. 이건 빈 계정이 아니라 못 읽은 응답이다.
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/insights")) return new Response("forbidden", { status: 403 });
      if (url.includes("/me/threads")) return new Response(JSON.stringify({ error: { message: "oops" } }), { status: 200 });
      return new Response("not found", { status: 404 });
    }));

    const { status, body } = await collect("operator");

    expect(body.failureDetails[0].code).toBe("metrics_lookup_incomplete");
    expect(status).not.toBe(422);
  });

  it("같은 줄을 서버 로그에도 남긴다", async () => {
    state.rows = [{ id: "row-old", external_id: "threads-old", published_at: minutesAgo(600), account_id: "acct-other" }];
    stubThreads([{ data: [{ id: "other", timestamp: minutesAgo(900) }] }]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await collect("operator");

    const line = warn.mock.calls.find((call) => call[0] === "[metrics][failure]");
    expect(line).toBeDefined();
    const logged = JSON.parse(String(line?.[1])) as Record<string, unknown>;
    expect(logged.postId).toBe("row-old");
    expect(logged.code).toBe("post_not_in_account");
    expect(logged.tenantId).toBe("tenant-identity");
    // 토큰은 절대 로그로 나가지 않는다.
    expect(String(line?.[1])).not.toContain("test-token");
  });
});
