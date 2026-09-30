import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  tenantId: "11111111-1111-4111-8111-111111111111" as string | null,
  posts: [] as Array<Record<string, unknown>>,
  signals: [{ id: "signal-1", content: "짧은 체크리스트 형식의 저장 반응이 오르는 흐름", score: "9" }] as Array<Record<string, unknown>>,
  brandRows: [{ prompt_guide: "작은 팀이 복잡한 콘텐츠 운영을 단순하게 만드는 브랜드" }] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = (strings: TemplateStringsArray) => {
      const query = Array.from(strings).join(" ").replace(/\s+/g, " ");
      if (query.includes("FROM published_posts")) return Promise.resolve(H.posts);
      if (query.includes("FROM viral_signals")) return Promise.resolve(H.signals);
      if (query.includes("FROM brand_guides")) return Promise.resolve(H.brandRows);
      return Promise.resolve([]);
    };
    sql.json = (value: unknown) => value;
    return callback(sql);
  }),
}));

beforeEach(() => {
  H.tenantId = "11111111-1111-4111-8111-111111111111";
  H.posts = [];
  H.signals = [{ id: "signal-1", content: "짧은 체크리스트 형식의 저장 반응이 오르는 흐름", score: "9" }];
  H.brandRows = [{ prompt_guide: "작은 팀이 복잡한 콘텐츠 운영을 단순하게 만드는 브랜드" }];
});

describe("BE-V63-01 성과 0건 방향 제안", () => {
  it("BE-V63-01 정상 경로: 브랜드 맥락과 시장 신호로 가설 세 개를 반환한다", async () => {
    const { POST } = await import("@/app/api/suggestions/route");
    const response = await POST(new Request("http://localhost/api/suggestions", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ideas).toHaveLength(3);
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        basis: "hypothesis",
        label: "가설 · 우리 검증 기록 아님",
        verified: false,
        evidence: expect.objectContaining({ sampleCount: 0, marketTrendAvailable: true }),
      }),
    ]));
  });

  it("BE-V63-01 거절 경로: tenant가 없으면 401을 반환한다", async () => {
    H.tenantId = null;
    const { POST } = await import("@/app/api/suggestions/route");
    const response = await POST(new Request("http://localhost/api/suggestions", {
      method: "POST",
      body: "{}",
    }));
    expect(response.status).toBe(401);
  });
});

describe("BE-V63-02 제안을 생성 큐로 인계", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-v63-queue-"));
    process.env.DATA_DIR = dataDir;
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it("BE-V63-02 정상 경로: suggestion id와 근거를 queue payload에 보존한다", async () => {
    const { POST } = await import("@/app/api/suggestions/enqueue/route");
    const suggestion = {
      id: "hyp_test_1",
      text: "문제와 해결 전후를 비교하는 콘텐츠",
      basis: "hypothesis",
      label: "가설 · 우리 검증 기록 아님",
      verified: false,
      evidence: {
        postIds: [], signalIds: ["signal-1"], sampleCount: 0,
        brandContextAvailable: true, marketTrendAvailable: true,
        secretShouldNotPersist: "blocked",
      },
    };
    const response = await POST(new Request("http://localhost/api/suggestions/enqueue", {
      method: "POST",
      body: JSON.stringify({ tenant_id: H.tenantId, suggestion }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.post.sourceContext).toEqual(expect.objectContaining({
      suggestionId: "hyp_test_1",
      basis: "hypothesis",
      label: "가설 · 우리 검증 기록 아님",
    }));
    expect(body.post.sourceContext.evidence).not.toHaveProperty("secretShouldNotPersist");
  });

  it("BE-V63-02 거절 경로: 가설 면책 라벨이 없으면 400으로 거절한다", async () => {
    const { POST } = await import("@/app/api/suggestions/enqueue/route");
    const response = await POST(new Request("http://localhost/api/suggestions/enqueue", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: H.tenantId,
        suggestion: { id: "hyp_bad", text: "라벨 없는 가설", basis: "hypothesis", verified: false },
      }),
    }));
    expect(response.status).toBe(400);
  });

  it("BE-V63-02 경합 경로: 같은 제안을 동시에 두 번 보내도 큐에는 한 건만 만든다", async () => {
    const { runWithTenant } = await import("@/lib/tenant-context");
    const { addQueuePost } = await import("@/lib/queue-add");
    const sourceContext = {
      type: "performance_suggestion" as const,
      suggestionId: "hyp_race",
      basis: "hypothesis" as const,
      label: "가설 · 우리 검증 기록 아님",
      verified: false,
      evidence: { postIds: [], signalIds: [], sampleCount: 0 },
    };
    const results = await runWithTenant(H.tenantId, () => Promise.all([
      addQueuePost(H.tenantId, { text: "경합 가설", sourceContext, idempotencyKey: "suggestion:hyp_race" }),
      addQueuePost(H.tenantId, { text: "경합 가설", sourceContext, idempotencyKey: "suggestion:hyp_race" }),
    ]));
    const queueFile = path.join(dataDir, "tenants", H.tenantId!, "queue.json");
    const queue = JSON.parse(fs.readFileSync(queueFile, "utf8"));

    expect(queue.posts).toHaveLength(1);
    expect(results.filter((item) => item.reused)).toHaveLength(1);
  });
});

describe("BE-V63-03 inbox와 calendar 발행실 복귀 컨텍스트", () => {
  it("BE-V63-03 정상 경로: queue 항목에 source와 발행실 return URL을 붙인다", async () => {
    vi.doMock("@/lib/file-io", () => ({
      readJson: vi.fn(() => ({ posts: [{ id: "queue-1", draftId: "draft-1", text: "초안" }] })),
      dataPath: vi.fn(() => "/tmp/queue.json"),
    }));
    vi.resetModules();
    const { GET } = await import("@/app/api/queue/route");
    const response = await GET(new Request("http://localhost/api/queue?status=all&returnTo=calendar"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.posts[0].publishContext).toEqual({
      sourceRoute: "calendar",
      queuePostId: "queue-1",
      draftId: "draft-1",
      returnUrl: "/studio?room=publish&queue_id=queue-1&from=calendar&draft_id=draft-1",
    });
    vi.doUnmock("@/lib/file-io");
  });

  it("BE-V63-03 정상 경로: Studio 인계 큐는 sourceContext의 draft id를 복귀 URL에 보존한다", async () => {
    const { buildPublishReturnContext } = await import("@/lib/publish-return-context");
    expect(buildPublishReturnContext({
      id: "queue-2",
      sourceContext: { type: "studio_handoff", draftId: "draft-source" },
    }, "inbox")).toEqual(expect.objectContaining({
      draftId: "draft-source",
      returnUrl: "/studio?room=publish&queue_id=queue-2&from=inbox&draft_id=draft-source",
    }));
  });

  it("BE-V63-03 거절 경로: 알 수 없는 source는 400으로 거절한다", async () => {
    const { GET } = await import("@/app/api/queue/route");
    const response = await GET(new Request("http://localhost/api/queue?returnTo=unknown"));
    expect(response.status).toBe(400);
  });

  it("BE-V63-03 거절 경로: returnTo와 legacy source가 다르면 400으로 거절한다", async () => {
    const { GET } = await import("@/app/api/queue/route");
    const response = await GET(new Request("http://localhost/api/queue?returnTo=inbox&source=calendar"));
    expect(response.status).toBe(400);
  });
});

describe("BE-V63-04 제안 표본 5건 문턱", () => {
  it("BE-V63-04 정상 경로: 5건이면 문턱 충족으로 판정한다", async () => {
    const { assessPerformanceSample } = await import("@/lib/performance-suggestions");
    expect(assessPerformanceSample(5)).toEqual({ count: 5, threshold: 5, thresholdMet: true });
  });

  it("BE-V63-04 거절 경로: 4건은 검증 표본으로 승격하지 않는다", async () => {
    const { assessPerformanceSample } = await import("@/lib/performance-suggestions");
    expect(assessPerformanceSample(4)).toEqual({ count: 4, threshold: 5, thresholdMet: false });
  });
});
