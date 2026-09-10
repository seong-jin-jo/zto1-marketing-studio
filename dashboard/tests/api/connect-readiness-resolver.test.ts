import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SAVED_REVIEW_APPROVED_PROVIDERS = process.env.OAUTH_APP_REVIEW_APPROVED_PROVIDERS;

const H = vi.hoisted(() => ({
  complete: {} as Record<string, boolean>,
  source: {} as Record<string, "db" | "env">,
  reason: {} as Record<string, "credential_store_unavailable" | undefined>,
  externalReview: {} as Record<string, "required" | "unknown">,
  connection: {} as Record<string, "connected" | "reconnect" | "disconnected">,
  connectionError: false,
  bulkCalls: [] as string[][],
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/oauth-app-credentials", () => ({
  resolveOAuthCredentialSets: vi.fn(async (providers: string[]) => {
    H.bulkCalls.push(providers);
    return Object.fromEntries(providers.map((provider) => [provider, {
      provider,
      complete: Boolean(H.complete[provider]),
      source: H.source[provider] || "env",
      values: {},
      configured: [],
      missing: H.complete[provider] ? [] : ["clientSecret"],
      updatedAt: null,
      externalReview: H.externalReview[provider] || "unknown",
      reason: H.reason[provider],
    }]));
  }),
}));

vi.mock("@/lib/channel-connection", () => ({
  getChannelConnectionStates: vi.fn(async (_tenantId: string, providers: string[]) => {
    if (H.connectionError) throw new Error("channel account DB unavailable");
    return Object.fromEntries(providers.map((provider) => [provider, H.connection[provider] || "disconnected"]));
  }),
}));

beforeEach(() => {
  vi.resetModules();
  H.complete = {};
  H.source = {};
  H.reason = {};
  H.externalReview = {};
  H.connection = {};
  H.connectionError = false;
  H.bulkCalls = [];
  delete process.env.OAUTH_APP_REVIEW_APPROVED_PROVIDERS;
});

afterEach(() => {
  if (SAVED_REVIEW_APPROVED_PROVIDERS === undefined) {
    delete process.env.OAUTH_APP_REVIEW_APPROVED_PROVIDERS;
  } else {
    process.env.OAUTH_APP_REVIEW_APPROVED_PROVIDERS = SAVED_REVIEW_APPROVED_PROVIDERS;
  }
});

describe("customer readiness central resolver wiring", () => {
  it("reports DB-backed readiness without exposing source secrets", async () => {
    H.complete.x = true;
    H.source.x = "db";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(new Request("https://app.example/api/connect/readiness?tenant_id=tenant-1"));
    const text = await res.text();
    const body = JSON.parse(text);

    expect(body.providers.x).toEqual({ status: "not_connected", available: true });
    expect(text).not.toContain("clientSecret");
    expect(H.bulkCalls).toHaveLength(1);
    expect(new Set(H.bulkCalls[0])).toContain("facebook");
  });

  it("keeps a partial DB set unavailable even when env could exist", async () => {
    H.complete.facebook = false;
    H.source.facebook = "db";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(new Request("https://app.example/api/connect/readiness?tenant_id=tenant-1"));
    const body = await res.json();

    expect(body.providers.facebook).toMatchObject({ status: "opening_soon", available: false });
    expect(body.providers.facebook.reason).toContain("자격증명");
  });

  it("reports credential-store outages distinctly instead of telling customers to reconfigure OAuth", async () => {
    H.reason.x = "credential_store_unavailable";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(new Request("https://app.example/api/connect/readiness?tenant_id=tenant-1"));
    const body = await res.json();

    expect(body.providers.x).toEqual({
      status: "error",
      available: false,
      reason: "OAuth 자격증명 저장소에 일시적으로 연결할 수 없습니다. 관리자 복구 후 다시 시도해주세요.",
    });
    expect(H.bulkCalls).toHaveLength(1);
  });

  it("distinguishes tenant connection from operator readiness", async () => {
    H.complete.x = true;
    H.connection.x = "connected";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(new Request("https://app.example/api/connect/readiness?tenant_id=tenant-1"));
    const body = await res.json();

    expect(body.providers.x).toEqual({ status: "connected", available: true });
  });

  it("returns publish_pending but keeps the connection available while external review is pending", async () => {
    // 외부 심사는 발행만 제한한다 — 연결 자체는 유효(available:true). 심사를 이유로 연결을
    // available:false로 막던 회귀(회장 2026-08-13 라이브)를 이 케이스가 잠근다.
    H.complete.instagram = true;
    H.externalReview.instagram = "required";
    H.connection.instagram = "connected";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(new Request("https://app.example/api/connect/readiness?tenant_id=tenant-1"));
    const body = await res.json();

    expect(body.providers.instagram).toMatchObject({
      status: "publish_pending",
      available: true,
    });
    expect(body.providers.instagram.reason).toContain("앱 심사 전");
    expect(body.providers.instagram.reason).toContain("테스터 계정");
  });

  it("keeps the connect button available for an unconnected provider whose external review is pending", async () => {
    // 미연결 + credential 있음 + 심사 대기 → not_connected(연결 버튼 활성). opening_soon으로 막지 않는다.
    H.complete.youtube = true;
    H.externalReview.youtube = "required";
    H.connection.youtube = "disconnected";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(new Request("https://app.example/api/connect/readiness?tenant_id=tenant-1"));
    const body = await res.json();

    expect(body.providers.youtube).toMatchObject({
      status: "not_connected",
      available: true,
    });
  });

  it("AR-UI-01: Meta 심사 전에는 테스터 등록과 초대 수락 조건을 연결 전에 알린다", async () => {
    H.complete.threads = true;
    H.externalReview.threads = "required";
    H.connection.threads = "disconnected";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(new Request("https://app.example/api/connect/readiness?tenant_id=tenant-1"));
    const body = await res.json();

    expect(body.providers.threads).toMatchObject({
      status: "not_connected",
      available: true,
    });
    expect(body.providers.threads.reason).toContain("테스터로 등록");
    expect(body.providers.threads.reason).toContain("초대를 수락");
    expect(body.providers.threads.reason).toContain("테스터 등록 없이 OAuth로 연결");
  });

  it("AR-GUIDE-001 정상: 심사 전에는 provider별 초대 수락 안내 계약을 반환한다", async () => {
    H.complete.threads = true;
    H.complete.instagram = true;
    H.externalReview.threads = "required";
    H.externalReview.instagram = "required";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(new Request("https://app.example/api/connect/readiness?tenant_id=tenant-1"));
    const body = await res.json();

    expect(body.providers.threads.guidance).toMatchObject({
      title: "심사 전 연결 안내",
      externalLink: {
        label: "초대 수락하러 가기 (새 탭)",
        url: "https://www.threads.com/settings/website_permissions",
      },
    });
    expect(body.providers.threads.guidance.steps).toHaveLength(4);
    expect(body.providers.instagram.guidance.externalLink.url).toBe(
      "https://www.instagram.com/accounts/manage_access/",
    );
    expect(body.providers.instagram.guidance.externalLink.url).not.toBe(
      body.providers.threads.guidance.externalLink.url,
    );
  });

  it("AR-GUIDE-002 거절: 심사 승인 provider에는 초대 수락 안내 계약을 반환하지 않는다", async () => {
    H.complete.threads = true;
    H.externalReview.threads = "required";
    process.env.OAUTH_APP_REVIEW_APPROVED_PROVIDERS = "threads";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(new Request("https://app.example/api/connect/readiness?tenant_id=tenant-1"));
    const body = await res.json();

    expect(body.providers.threads).toMatchObject({
      status: "not_connected",
      available: true,
    });
    expect(body.providers.threads.reason).toBeUndefined();
    expect(body.providers.threads.guidance).toBeUndefined();
  });

  it("fails closed with error when tenant channel accounts cannot be read", async () => {
    H.complete.x = true;
    H.connectionError = true;
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(new Request("https://app.example/api/connect/readiness?tenant_id=tenant-1"));
    const body = await res.json();

    expect(body.providers.x).toMatchObject({ status: "error", available: false });
  });
});
