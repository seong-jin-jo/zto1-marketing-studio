import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 2026-09-14 실계정 오진 회귀.
 *
 * 관측: 발행 직후 수집은 `updated 6 / total 7 / failed 1` 로 방금 올린 글만 실패했고, 약 한
 * 시간 뒤 같은 계정 같은 토큰으로 돌린 수집은 `updated 7 / total 8` 로 그 글을 집계했다.
 * 계정은 그대로였다. 그런데 수집기는 그것을 "글을 올린 계정으로 다시 연결해 주세요" 라고
 * 말했고, 컨트롤러가 그 문구를 믿고 회장께 채널 재연결을 잘못 보고했다.
 *
 * 계약 세 줄:
 *  1) 방금 올린 글의 실패는 집계 대기이지 계정 불일치가 아니다.
 *  2) 오래된 글은 계정 목록을 끝까지 되짚은 뒤에만 계정 불일치로 단정한다. 목록 상한에
 *     걸려 끝까지 못 봤으면 "확인하지 못했다" 라고 말한다.
 *  3) 재연결하라는 말은 진짜 계정 불일치일 때만 한다.
 */

const state = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, patched: [] as unknown[] }));

vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => "tenant-pending") }));
vi.mock("@/lib/file-io", () => ({
  readJson: vi.fn(() => ({})),
  writeJson: vi.fn(),
  dataPath: vi.fn((name: string) => name),
}));
vi.mock("@/lib/tenant-context", () => ({ runWithTenant: vi.fn((_id: string, fn: () => unknown) => fn()) }));
vi.mock("@/lib/tiktok", () => ({ fetchTikTokVideoMetrics: vi.fn() }));
vi.mock("@/lib/publish", () => ({
  getChannelCred: vi.fn(async (_tenant: string, channel: string) => channel === "threads" ? { token: "test-token" } : null),
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
    Object.assign(sql, { json: (value: unknown) => { state.patched.push(value); return value; } });
    return fn(sql);
  }),
}));

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

async function collect() {
  const { POST } = await import("@/app/api/metrics/route");
  const response = await POST(new Request("http://localhost/api/metrics", {
    method: "POST",
    body: JSON.stringify({ tenant_id: "tenant-pending" }),
  }));
  return { status: response.status, body: await response.json() };
}

/** insights 는 거절하고 게시물 단건 조회도 거절하는(= 목록 판정으로 내려가는) 채널. */
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
    // 게시물 단건 조회 실패 = insights 권한 문제가 아니라는 뜻
    return new Response("not found", { status: 404 });
  }));
}

describe("집계 대기와 계정 불일치를 갈라서 말한다", () => {
  beforeEach(() => {
    state.rows = [];
    state.patched = [];
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("방금 올린 글은 집계 대기이고 재연결을 요구하지 않는다", async () => {
    state.rows = [{ id: "row-fresh", external_id: "threads-fresh", published_at: minutesAgo(3) }];
    // 목록에 아직 안 올라온 상태를 그대로 재현한다.
    stubThreads([{ data: [] }]);

    const { status, body } = await collect();

    expect(body.failures).toContainEqual({ channel: "threads", code: "metrics_pending_ingest", count: 1 });
    expect(body.reason).toContain("시간이 걸립니다");
    expect(body.reason).not.toContain("다시 연결해 주세요");
    // 장애가 아니라 접수 후 대기다.
    expect(status).toBe(202);
  });

  it("유예를 지난 글이 계정 목록에 끝까지 없으면 그때만 계정 불일치다", async () => {
    state.rows = [{ id: "row-old", external_id: "threads-missing", published_at: minutesAgo(600) }];
    // 대상보다 오래된 글이 목록에 있고 다음 쪽이 없다 = 계정 전체를 다 봤다.
    stubThreads([{ data: [{ id: "other", timestamp: minutesAgo(900) }] }]);

    const { status, body } = await collect();

    expect(body.failures).toContainEqual({ channel: "threads", code: "post_not_in_account", count: 1 });
    expect(body.reason).toContain("다시 연결해 주세요");
    // 계정 불일치는 다시 시도한다고 풀리지 않는다. 장애(503)가 아니다.
    expect(status).toBe(422);
  });

  it("고정 글처럼 오래된 글이 목록 앞에 끼어 있어도 계정 불일치로 단정하지 않는다", async () => {
    state.rows = [{ id: "row-pinned", external_id: "threads-behind-pin", published_at: minutesAgo(600) }];
    // 첫 줄이 아주 오래된 고정 글이고 꼬리는 대상보다 최신이다. 아직 지나치지 않았다.
    stubThreads([{
      data: [
        { id: "pinned", timestamp: minutesAgo(60 * 24 * 365) },
        { id: "recent", timestamp: minutesAgo(30) },
      ],
      next: "https://graph.threads.net/v1.0/me/threads?after=cursor",
    }]);

    const { body } = await collect();

    expect(body.failures).toContainEqual({ channel: "threads", code: "metrics_lookup_incomplete", count: 1 });
    expect(body.reason).not.toContain("계정으로 다시 연결해 주세요");
  });

  it("한도 초과와 채널 장애는 계정 판정으로 넘어가지 않는다", async () => {
    state.rows = [{ id: "row-429", external_id: "threads-429", published_at: minutesAgo(600) }];
    const listCalls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/insights")) return new Response("rate limited", { status: 429 });
      listCalls.push(url);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }));

    const { status, body } = await collect();

    expect(body.failures).toContainEqual({ channel: "threads", code: "provider_429", count: 1 });
    // 한도 초과인데 계정을 뒤지면 호출만 더 쓰고 오진 위험만 는다.
    expect(listCalls).toHaveLength(0);
    expect(status).toBe(429);
  });

  it("목록 다음 쪽이 우리가 아는 주소가 아니면 따라가지 않고 확인 못 했다고 말한다", async () => {
    state.rows = [{ id: "row-evil", external_id: "threads-evil", published_at: minutesAgo(600) }];
    const fetched: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      fetched.push(url);
      if (url.includes("/insights")) return new Response("forbidden", { status: 403 });
      if (url.includes("/me/threads")) {
        return new Response(JSON.stringify({
          data: [{ id: "other", timestamp: minutesAgo(1) }],
          paging: { next: "https://evil.example.com/me/threads?access_token=leak" },
        }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }));

    const { body } = await collect();

    expect(body.failures).toContainEqual({ channel: "threads", code: "metrics_lookup_incomplete", count: 1 });
    // 토큰이 남의 호스트로 나가면 안 된다.
    expect(fetched.some((url) => url.includes("evil.example.com"))).toBe(false);
  });

  it("목록 상한에 걸려 끝까지 못 보면 계정 불일치로 단정하지 않는다", async () => {
    state.rows = [{ id: "row-deep", external_id: "threads-deep", published_at: minutesAgo(60 * 24 * 30) }];
    // 최신 글만 계속 나오고 다음 쪽이 남아 있다 = 옛 글까지 되짚지 못했다.
    // 전에는 첫 25편만 보고 없으면 곧장 계정 불일치로 단정했다.
    stubThreads([{
      data: [{ id: "recent", timestamp: minutesAgo(10) }],
      next: "https://graph.threads.net/v1.0/me/threads?after=cursor",
    }]);

    const { status, body } = await collect();

    expect(body.failures).toContainEqual({ channel: "threads", code: "metrics_lookup_incomplete", count: 1 });
    expect(body.reason).toContain("다시 연결할 필요는 없습니다");
    expect(body.reason).not.toContain("계정으로 다시 연결해 주세요");
    expect(status).toBe(503);
  });

  it("유예 판정은 발행 시각으로 하고 시각을 모르면 대기로 단정하지 않는다", async () => {
    const { isWithinIngestGrace, METRICS_INGEST_GRACE_MINUTES } = await import("@/lib/metrics-collector");
    const now = Date.now();
    expect(METRICS_INGEST_GRACE_MINUTES).toBe(60);
    expect(isWithinIngestGrace(new Date(now - 59 * 60_000).toISOString(), now)).toBe(true);
    expect(isWithinIngestGrace(new Date(now - 61 * 60_000).toISOString(), now)).toBe(false);
    expect(isWithinIngestGrace(null, now)).toBe(false);
    expect(isWithinIngestGrace("발행시각아님", now)).toBe(false);
    // 시계가 조금 어긋난 것은 봐주되, 한없이 미래인 시각은 영원한 "집계 대기" 가 된다.
    expect(isWithinIngestGrace(new Date(now + 5 * 60_000).toISOString(), now)).toBe(true);
    expect(isWithinIngestGrace(new Date(now + 61 * 60_000).toISOString(), now)).toBe(false);
  });
});
