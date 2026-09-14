import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseRetirement,
  retirementDecision,
  type MetricsRetirement,
} from "@/lib/metrics-collector";
import { buildPerformanceMetricsCoverage } from "@/lib/performance-metrics-coverage";

/**
 * 2026-09-14 "지워진 글 한 편이 영원한 빨간 불로 남는다" 회귀.
 *
 * 관측(실계정, 커밋 3c3581b1 배포 후 수집):
 *   postId d32378cb… / publishedAt 2026-09-04T20:41:14Z / code post_not_in_account
 *   "발행 13175분 전이라 유예 60분을 지났고, 계정 글 목록 2쪽을 끝까지 봤는데 이 글이 없었습니다."
 *
 * 열흘 된 글이 스레드에서 지워졌다. 지워진 글은 다시 생기지 않는다. 그래서 수집을 돌릴 때마다
 * `ok:false / partial:true / failed 1` 이 나오고, 그 빨간 불은 영원하다. **상시 경보는 경보가
 * 아니다.** 그 옆에 진짜 문제가 생겨도 묻힌다.
 *
 * 계약 다섯 줄:
 *  1) 지워진 글과 다른 계정 글을 **가른다**. 목록에 없다는 것만으로 지워졌다고 단정하지 않고,
 *     올린 계정과 수집한 계정이 같을 때만 그렇게 말한다.
 *  2) 판정한 글은 수집 대상에서 내려놓는다. 두 번째 수집부터 실패가 아니다.
 *  3) 내려놓아도 기록은 남는다. 왜 언제 무슨 근거로 내려놨는지 응답과 글에 남는다.
 *  4) 되돌릴 수 있다. 계정이 바뀌면 자동으로, 그 밖에는 운영자가 손으로.
 *  5) **살아 있는 글은 절대 지워진 것으로 분류되지 않는다.** 목록을 끝까지 못 봤거나 방금 올린
 *     글이면 단정하지 않는다.
 */

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ query: string; values: unknown[] }>,
  connectedAccountId: "acct-connected" as string | null,
}));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => "tenant-retire") }));
vi.mock("@/lib/file-io", () => ({
  readJson: vi.fn(() => ({})),
  writeJson: vi.fn(),
  dataPath: vi.fn((name: string) => name),
}));
vi.mock("@/lib/tenant-context", () => ({ runWithTenant: vi.fn((_id: string, fn: () => unknown) => fn()) }));
vi.mock("@/lib/tiktok", () => ({ fetchTikTokVideoMetrics: vi.fn() }));
vi.mock("@/lib/publish", () => ({
  getChannelCred: vi.fn(async (_tenant: string, channel: string) =>
    channel === "threads" ? { token: "test-token", accountId: state.connectedAccountId ?? undefined } : null),
  fetchXPublicMetrics: vi.fn(),
  fetchMetaPostMetrics: vi.fn(),
  fetchYouTubeMetrics: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenant: string, fn: (sql: unknown) => Promise<unknown>) => {
    const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(" ");
      if (query.includes("UPDATE published_posts")) {
        state.updates.push({ query, values });
        // 되돌리기는 한 문장에서 잠그고 지우고 지운 값을 돌려받는다. 지울 것이 없으면 한 줄도
        // 안 나온다 — 그 "0줄" 이 곧 "되돌릴 것이 없다" 의 신호라 모사에서도 그대로 지킨다.
        if (query.includes("RETURNING target.was")) {
          const row = state.rows.find((candidate) => candidate.id === values[1]);
          return row?.metrics_retired ? [{ was_retired: row.metrics_retired }] : [];
        }
        return [];
      }
      if (query.includes("platform = 'threads'")) return state.rows;
      return [];
    };
    Object.assign(sql, { json: (value: unknown) => value });
    return fn(sql);
  }),
}));

const OPERATOR_TOKEN = "operator-token-for-test";
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

type FailureDetail = { postId: string; code: string; evidence: string };
type CollectBody = {
  ok: boolean;
  updated: number;
  total: number;
  failed: number;
  failureDetails: FailureDetail[];
  excluded: Array<{ postId: string; channel: string; code: string; retiredAt: string }>;
  reason?: string;
};

async function collect() {
  const { POST } = await import("@/app/api/metrics/route");
  const response = await POST(new Request("http://localhost/api/metrics", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPERATOR_TOKEN}` },
    body: JSON.stringify({ tenant_id: "tenant-retire" }),
  }));
  return { status: response.status, body: await response.json() as CollectBody };
}

async function reinstate(postId: string | undefined, as: "operator" | "customer" = "operator") {
  const { POST } = await import("@/app/api/metrics/route");
  const response = await POST(new Request("http://localhost/api/metrics", {
    method: "POST",
    headers: { Authorization: `Bearer ${as === "operator" ? OPERATOR_TOKEN : "customer-token"}` },
    body: JSON.stringify({ tenant_id: "tenant-retire", action: "reinstate", post_id: postId }),
  }));
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

/**
 * insights 는 거절하고 단건 조회도 거절하는 채널. 목록은 주어진 쪽을 그대로 돌려준다.
 * 실계정에서 지워진 글이 겪은 경로 그대로다.
 */
function stubThreads(listPages: Array<{ data: Array<{ id: string; timestamp?: string }>; next?: string }>) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/insights")) return new Response("forbidden", { status: 400 });
    if (url.includes("/me/threads")) {
      const after = new URL(url).searchParams.get("after");
      const index = after ? Number(after) : 0;
      const current = listPages[Math.min(index, listPages.length - 1)];
      return new Response(JSON.stringify({
        data: current.data,
        ...(current.next ? { paging: { cursors: { after: current.next } } } : {}),
      }), { status: 200 });
    }
    return new Response("not found", { status: 400 });
  }));
}

/** 살아 있고 성과도 읽히는 채널. */
function stubHealthyThreads() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    data: [
      { name: "views", values: [{ value: 100 }] },
      { name: "likes", values: [{ value: 3 }] },
    ],
  }), { status: 200 })));
}

describe("채널에서 사라진 글은 영원한 실패로 남지 않는다", () => {
  beforeEach(() => {
    state.rows = [];
    state.updates = [];
    state.connectedAccountId = "acct-connected";
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", OPERATOR_TOKEN);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("올린 계정과 수집한 계정이 같은데 목록 끝까지 없으면 '지워진 글' 로 가른다", async () => {
    state.rows = [{
      id: "row-deleted",
      external_id: "threads-deleted",
      published_at: minutesAgo(13175),
      account_id: "acct-connected",
      metrics_retired: null,
    }];
    stubThreads([{ data: [{ id: "other", timestamp: minutesAgo(20000) }] }]);

    const { status, body } = await collect();

    expect(body.failureDetails[0].code).toBe("post_deleted");
    // 근거는 추측이 아니라 그때 본 것이어야 한다.
    expect(body.failureDetails[0].evidence).toContain("올린 계정과 수집에 쓴 계정이 같으므로");
    // 다시 시도해도 같으므로 장애(503)가 아니다.
    expect(status).toBe(422);
    // 사용자가 할 일이 없다는 것을 말해야 한다. 재연결을 권하면 없는 문제를 만든다.
    expect(body.reason).toContain("채널을 다시 연결할 필요는 없습니다");
  });

  it("올린 계정이 다르면 지워졌다고 단정하지 않는다", async () => {
    state.rows = [{
      id: "row-other-account",
      external_id: "threads-other",
      published_at: minutesAgo(13175),
      account_id: "acct-other",
      metrics_retired: null,
    }];
    stubThreads([{ data: [{ id: "x", timestamp: minutesAgo(20000) }] }]);

    const { body } = await collect();

    expect(body.failureDetails[0].code).toBe("post_not_in_account");
  });

  it("올린 계정 기록이 없으면 지워졌다고 단정하지 않는다", async () => {
    state.rows = [{
      id: "row-unknown-account",
      external_id: "threads-unknown",
      published_at: minutesAgo(13175),
      account_id: null,
      metrics_retired: null,
    }];
    stubThreads([{ data: [{ id: "x", timestamp: minutesAgo(20000) }] }]);

    const { body } = await collect();

    expect(body.failureDetails[0].code).toBe("post_not_in_account");
    expect(body.failureDetails[0].evidence).toContain("계정 기록이 없어");
  });

  it("판정과 동시에 왜 내려놓는지를 글에 적는다", async () => {
    state.rows = [{
      id: "row-deleted",
      external_id: "threads-deleted",
      published_at: minutesAgo(13175),
      account_id: "acct-connected",
      metrics_retired: null,
    }];
    stubThreads([{ data: [{ id: "other", timestamp: minutesAgo(20000) }] }]);

    await collect();

    const write = state.updates.find((update) => update.query.includes("provider_meta"));
    const payload = write?.values.find((value) =>
      typeof value === "object" && value !== null && "metricsRetired" in (value as object)) as
      { metricsRetired: MetricsRetirement } | undefined;
    expect(payload).toBeDefined();
    expect(payload!.metricsRetired.code).toBe("post_deleted");
    // 되돌림의 열쇠. 어느 계정 기준의 판정이었는지가 없으면 되돌릴 수 없다.
    expect(payload!.metricsRetired.accountId).toBe("acct-connected");
    expect(payload!.metricsRetired.evidence).toContain("지워진 글로 봅니다");
    expect(payload!.metricsRetired.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("두 번째 수집부터는 실패가 아니다. 대신 건너뛴 사실을 말한다", async () => {
    state.rows = [
      {
        id: "row-deleted",
        external_id: "threads-deleted",
        published_at: minutesAgo(13175),
        account_id: "acct-connected",
        metrics_retired: {
          code: "post_deleted",
          at: "2026-09-14T00:00:00.000Z",
          evidence: "계정 글 목록을 끝까지 봤는데 없었습니다",
          accountId: "acct-connected",
        },
      },
      { id: "row-live", external_id: "threads-live", published_at: minutesAgo(200), account_id: "acct-connected" },
    ];
    stubHealthyThreads();

    const { status, body } = await collect();

    // 이것이 이 과제의 본체다. 영원한 빨간 불이 꺼진다.
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.failed).toBe(0);
    expect(body.total).toBe(1);
    expect(body.updated).toBe(1);
    // 그러나 조용히 사라지지는 않는다(ADR-007).
    expect(body.excluded).toEqual([{
      postId: "row-deleted",
      channel: "threads",
      code: "post_deleted",
      retiredAt: "2026-09-14T00:00:00.000Z",
    }]);
    // 내려놓은 글에는 아무 UPDATE 도 나가지 않는다.
    expect(state.updates.every((update) => !update.values.includes("row-deleted"))).toBe(true);
  });

  it("계정이 바뀌면 저절로 다시 물어본다", async () => {
    state.connectedAccountId = "acct-reconnected";
    state.rows = [{
      id: "row-retired",
      external_id: "threads-retired",
      published_at: minutesAgo(13175),
      account_id: "acct-old",
      metrics_retired: {
        code: "post_not_in_account",
        at: "2026-09-14T00:00:00.000Z",
        evidence: "계정에 없었습니다",
        accountId: "acct-old",
      },
    }];
    stubHealthyThreads();

    const { body } = await collect();

    // "다른 계정으로 올린 글이면 그 계정으로 다시 연결하라" 는 안내가 실제로 작동해야 한다.
    expect(body.excluded).toEqual([]);
    expect(body.total).toBe(1);
    expect(body.updated).toBe(1);
    expect(body.ok).toBe(true);
    // 성과를 읽었으면 꼬리표도 함께 뗀다.
    const clear = state.updates.find((update) => update.query.includes("- 'metricsRetired'"));
    expect(clear).toBeDefined();
  });

  it("운영자는 글 번호로 손수 되돌릴 수 있다", async () => {
    state.rows = [{
      id: "row-retired",
      external_id: "threads-retired",
      published_at: minutesAgo(13175),
      account_id: "acct-connected",
      metrics_retired: {
        code: "post_deleted",
        at: "2026-09-14T00:00:00.000Z",
        evidence: "계정 글 목록을 끝까지 봤는데 없었습니다",
        accountId: "acct-connected",
      },
    }];

    const { status, body } = await reinstate("row-retired");

    expect(status).toBe(200);
    expect(body.reinstated).toBe(true);
    expect((body.wasRetired as MetricsRetirement).code).toBe("post_deleted");
    expect(state.updates.some((update) => update.query.includes("- 'metricsRetired'"))).toBe(true);
  });

  it("되돌릴 것이 없으면 됐다고 말하지 않는다", async () => {
    state.rows = [{ id: "row-live", external_id: "threads-live", published_at: minutesAgo(10), account_id: "acct-connected" }];

    const { status, body } = await reinstate("row-live");

    expect(status).toBe(404);
    expect(body.reinstated).toBe(false);
    expect(String(body.error)).toContain("되돌릴 것이 없습니다");
  });

  it("되돌리기는 운영자만 할 수 있다", async () => {
    const { status } = await reinstate("row-retired", "customer");
    expect(status).toBe(403);
  });

  it("살아 있는 글은 지워진 것으로 분류되지 않는다 - 목록에 있으면 계정 판정으로 안 간다", async () => {
    state.rows = [{
      id: "row-alive",
      external_id: "threads-alive",
      published_at: minutesAgo(13175),
      account_id: "acct-connected",
      metrics_retired: null,
    }];
    stubThreads([{ data: [{ id: "threads-alive", timestamp: minutesAgo(13175) }] }]);

    const { body } = await collect();

    expect(body.failureDetails[0].code).not.toBe("post_deleted");
    expect(body.excluded).toEqual([]);
    expect(state.updates.every((update) =>
      !update.values.some((value) =>
        typeof value === "object" && value !== null && "metricsRetired" in (value as object)))).toBe(true);
  });

  it("살아 있는 글은 지워진 것으로 분류되지 않는다 - 목록을 끝까지 못 봤으면 단정하지 않는다", async () => {
    state.rows = [{
      id: "row-maybe",
      external_id: "threads-maybe",
      published_at: minutesAgo(13175),
      account_id: "acct-connected",
      metrics_retired: null,
    }];
    // 다음 쪽이 계속 남아 있어 상한까지 가도 끝을 못 본다.
    stubThreads([{ data: [{ id: "x", timestamp: minutesAgo(100) }], next: "1" }]);

    const { body } = await collect();

    expect(body.failureDetails[0].code).toBe("metrics_lookup_incomplete");
    expect(body.excluded).toEqual([]);
  });

  it("살아 있는 글은 지워진 것으로 분류되지 않는다 - 방금 올린 글은 집계 대기다", async () => {
    state.rows = [{
      id: "row-fresh",
      external_id: "threads-fresh",
      published_at: minutesAgo(3),
      account_id: "acct-connected",
      metrics_retired: null,
    }];
    stubThreads([{ data: [] }]);

    const { body } = await collect();

    expect(body.failureDetails[0].code).toBe("metrics_pending_ingest");
    expect(body.excluded).toEqual([]);
  });

  it("살아 있는 글은 지워진 것으로 분류되지 않는다 - 목록 항목에 글 번호가 없으면 대조를 포기한다", async () => {
    // `{data:[{}]}` 한 번이 곧장 "계정에 없다" 로 굳던 구멍. 번호를 못 읽었는데 번호로 비교한
    // 셈이 된다.
    state.rows = [{
      id: "row-malformed",
      external_id: "threads-malformed",
      published_at: minutesAgo(13175),
      account_id: "acct-connected",
      metrics_retired: null,
    }];
    stubThreads([{ data: [{ id: undefined as unknown as string, timestamp: minutesAgo(20000) }] }]);

    const { body } = await collect();

    expect(body.failureDetails[0].code).toBe("metrics_lookup_incomplete");
    expect(body.excluded).toEqual([]);
  });

  it("살아 있는 글은 지워진 것으로 분류되지 않는다 - 정렬 지름길로 끊었으면 지워졌다고 말하지 않는다", async () => {
    // 다음 쪽이 남아 있는데 이 쪽 꼬리가 더 오래돼서 앞질러 끊은 경우. 고정 글이 섞이거나
    // 정렬이 흔들리면 이 지름길은 틀린다. 재연결로 되돌릴 수 있는 쪽으로만 말한다.
    state.rows = [{
      id: "row-shortcut",
      external_id: "threads-shortcut",
      published_at: minutesAgo(13175),
      account_id: "acct-connected",
      metrics_retired: null,
    }];
    stubThreads([{ data: [{ id: "pinned", timestamp: minutesAgo(20000) }], next: "1" }]);

    const { body } = await collect();

    expect(body.failureDetails[0].code).toBe("post_not_in_account");
    expect(body.failureDetails[0].evidence).toContain("정렬 순서로 앞질러 끊었으므로");
  });

  it("살아 있는 글은 지워진 것으로 분류되지 않는다 - 발행 시각이 미래면 단정하지 않는다", async () => {
    // 시계가 크게 어긋나 미래로 저장된 글은 목록의 어떤 글보다도 새것이라 무조건 "지나쳤다"
    // 로 읽힌다. 그건 글에 대한 사실이 아니라 우리 시각 기록에 대한 사실이다.
    state.rows = [{
      id: "row-future",
      external_id: "threads-future",
      published_at: minutesAgo(-5000),
      account_id: "acct-connected",
      metrics_retired: null,
    }];
    stubThreads([{ data: [{ id: "other", timestamp: minutesAgo(10) }] }]);

    const { body } = await collect();

    expect(body.failureDetails[0].code).toBe("post_not_in_account");
    expect(body.failureDetails[0].evidence).toContain("미래로 기록돼 있어");
  });

  it("운영자 토큰이 설정 안 된 배포에서는 되돌리기가 아예 안 열린다", async () => {
    // 진단 노출(읽기)은 토큰 미설정 환경을 전부 운영자로 보지만, 되돌리기는 남의 데이터를
    // 바꾸는 쓰기다. 설정을 잊은 것이 권한이 되어서는 안 된다.
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "");
    state.rows = [{
      id: "row-retired",
      external_id: "threads-retired",
      published_at: minutesAgo(13175),
      account_id: "acct-connected",
      metrics_retired: {
        code: "post_deleted", at: "2026-09-14T00:00:00.000Z", evidence: "e", accountId: "acct-connected",
      },
    }];

    const { status } = await reinstate("row-retired", "customer");

    expect(status).toBe(403);
    expect(state.updates).toEqual([]);
  });

  it("채널 장애는 지워진 글로 둔갑하지 않는다", async () => {
    state.rows = [{
      id: "row-outage",
      external_id: "threads-outage",
      published_at: minutesAgo(13175),
      account_id: "acct-connected",
      metrics_retired: null,
    }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));

    const { body } = await collect();

    expect(body.failureDetails[0].code).toBe("provider_503");
    expect(body.excluded).toEqual([]);
  });
});

describe("되돌림 판정은 계정을 근거로만 움직인다", () => {
  const retirement: MetricsRetirement = {
    code: "post_deleted",
    at: "2026-09-14T00:00:00.000Z",
    evidence: "e",
    accountId: "acct-a",
  };

  it("꼬리표가 없으면 그냥 수집한다", () => {
    expect(retirementDecision(null, "acct-a")).toBe("collect");
  });

  it("같은 계정이면 계속 내려놓은 채로 둔다", () => {
    expect(retirementDecision(retirement, "acct-a")).toBe("skip");
  });

  it("계정이 바뀌면 되돌린다", () => {
    expect(retirementDecision(retirement, "acct-b")).toBe("reinstate");
  });

  it("연결 계정을 모르면 되돌리지 않는다. 모름은 '달라졌다' 의 근거가 아니다", () => {
    // 모름을 근거로 움직이면 매 수집마다 되돌렸다 다시 내려놓기를 반복한다.
    expect(retirementDecision(retirement, null)).toBe("skip");
    expect(retirementDecision({ ...retirement, accountId: null }, "acct-b")).toBe("skip");
  });

  it("망가진 꼬리표는 꼬리표로 치지 않는다", () => {
    expect(parseRetirement(null)).toBeNull();
    expect(parseRetirement({ at: "x" })).toBeNull();
    expect(parseRetirement({ code: "post_deleted" })).toEqual({
      code: "post_deleted", at: "", evidence: "", accountId: null,
    });
  });
});

describe("성과 범위 표시도 내려놓은 글을 미수집으로 세지 않는다", () => {
  const row = (over: Record<string, unknown>) => ({
    platform: "threads",
    published_count: 8,
    collected_count: 7,
    last_collected_at: "2026-09-14T00:00:00.000Z",
    ...over,
  });

  it("지워진 글 한 편 때문에 '8건 중 7건' 이 영원히 뜨지 않는다", () => {
    const coverage = buildPerformanceMetricsCoverage([row({ retired_count: 1 })]);
    const threads = coverage.platforms.find((platform) => platform.platform === "threads")!;
    expect(threads.retiredCount).toBe(1);
    expect(threads.missingCount).toBe(0);
    expect(threads.missingReason).toBeNull();
  });

  it("내려놓은 글이 있어도 진짜 미수집은 그대로 말한다", () => {
    const coverage = buildPerformanceMetricsCoverage([row({ collected_count: 5, retired_count: 1 })]);
    const threads = coverage.platforms.find((platform) => platform.platform === "threads")!;
    expect(threads.missingCount).toBe(2);
    expect(threads.missingReason?.code).toBe("PARTIAL_COLLECTION");
    expect(threads.missingReason?.message).toContain("1건은 채널에서 더 읽을 수 없어");
  });

  it("한동안 수집되다 지워진 글이 두 칸에 겹쳐 세어지지 않는다", () => {
    // metrics_at 도 있고 metricsRetired 도 있는 글이 실제로 생긴다. 집계 쿼리가 collected 에서
    // 빼 주므로 8건 = 수집 7 + 내려놓음 1 로 딱 맞아야 한다.
    const coverage = buildPerformanceMetricsCoverage([row({ collected_count: 7, retired_count: 1 })]);
    const threads = coverage.platforms.find((platform) => platform.platform === "threads")!;
    expect(threads.collectedCount + threads.retiredCount).toBe(threads.publishedCount);
    expect(threads.missingCount).toBe(0);
    expect(threads.missingReason).toBeNull();
  });

  it("옛 호출자가 이 칸을 안 보내도 예전과 똑같이 판정한다", () => {
    const coverage = buildPerformanceMetricsCoverage([row({})]);
    const threads = coverage.platforms.find((platform) => platform.platform === "threads")!;
    expect(threads.retiredCount).toBe(0);
    expect(threads.missingCount).toBe(1);
    expect(threads.missingReason?.code).toBe("PARTIAL_COLLECTION");
  });
});
