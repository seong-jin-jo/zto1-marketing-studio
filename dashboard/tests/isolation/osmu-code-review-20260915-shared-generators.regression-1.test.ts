import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression: CODE-REVIEW-20260915-01, CODE-REVIEW-20260915-03
// 고객 토큰이 공용 유료 생성기와 운영 계정 원문에 직접 닿았던 결함.
// Found by code-review on 2026-09-15.
// Report: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-15.md
const state = vi.hoisted(() => ({
  generated: "",
  tenantId: "tenant-review-fix",
}));

vi.mock("@/lib/tenant-auth", () => ({
  resolveTenantToken: vi.fn(async () => state.tenantId),
  getTenantStatus: vi.fn(async () => "active"),
  ensureTenantForUser: vi.fn(async () => state.tenantId),
  effectiveTenantId: vi.fn(async () => state.tenantId),
}));

vi.mock("@/lib/supabase", () => ({
  verifySupabaseJwt: vi.fn(async () => ({ status: "invalid" })),
}));

vi.mock("@/lib/anthropic", () => ({
  generateText: vi.fn(async () => state.generated),
  sharedGenerationQuotaErrorResponse: vi.fn(() => null),
  sharedAiApprovalErrorResponse: vi.fn(() => null),
}));

function request(path: string, token: string, method = "GET") {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
}

function post(path: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer osmu_customer" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DASHBOARD_AUTH_TOKEN", "operator-review-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("CODE-REVIEW-20260915-01 공용 유료 생성 경계", () => {
  it.each([
    "/api/generate-image",
    "/api/midjourney/generate",
    "/api/card-news/generate",
  ])("CODE-REVIEW-20260915-01 거절: 고객 토큰은 예산 장부 없는 %s에 닿지 않는다", async (path) => {
    const { proxy } = await import("@/proxy");
    expect((await proxy(request(path, "osmu_customer", "POST"))).status).toBe(403);
  });

  it("CODE-REVIEW-20260915-01 정상: 운영자 토큰은 기존 내부 생성 경로를 유지한다", async () => {
    const { proxy } = await import("@/proxy");
    const response = await proxy(request("/api/generate-image", "operator-review-token", "POST"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("CODE-REVIEW-20260915-03 거절: 고객은 공유 Higgsfield 계정 원문을 읽지 못한다", async () => {
    const { proxy } = await import("@/proxy");
    expect((await proxy(request("/api/higgsfield/status", "osmu_customer"))).status).toBe(403);
  });
});

describe("CODE-REVIEW-20260915-01 텍스트 제안은 테넌트 사용량 경계를 탄다", () => {
  it("CODE-REVIEW-20260915-01 정상: 가이드 제안은 인증된 테넌트로 generateText를 호출한다", async () => {
    state.generated = JSON.stringify({ guide: "검증된 가이드" });
    const anthropic = await import("@/lib/anthropic");
    const { POST } = await import("@/app/api/ai-suggest/guide/route");
    const response = await POST(post("/api/ai-suggest/guide", { channel: "Threads" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, guide: "검증된 가이드" });
    expect(anthropic.generateText).toHaveBeenCalledWith(expect.any(String), state.tenantId);
  });

  it("CODE-REVIEW-20260915-01 정상: 키워드 제안과 카드뉴스 초안도 같은 테넌트 경계를 탄다", async () => {
    const anthropic = await import("@/lib/anthropic");
    state.generated = JSON.stringify({ keywords: ["첫 키워드", "둘째 키워드"] });
    const keywordRoute = await import("@/app/api/ai-suggest/keywords/route");
    expect((await keywordRoute.POST(post("/api/ai-suggest/keywords", { channel: "Instagram" }))).status).toBe(200);

    state.generated = JSON.stringify({ slides: ["첫 장"], caption: "설명", hashtags: ["태그"] });
    const outlineRoute = await import("@/app/api/card-news/outline/route");
    expect((await outlineRoute.POST(post("/api/card-news/outline", { title: "주제" }))).status).toBe(200);

    expect(anthropic.generateText).toHaveBeenNthCalledWith(1, expect.any(String), state.tenantId);
    expect(anthropic.generateText).toHaveBeenNthCalledWith(2, expect.any(String), state.tenantId);
  });

  it("CODE-REVIEW-20260915-01 거절: 필수 입력이 없으면 생성기를 호출하지 않고 400을 반환한다", async () => {
    const anthropic = await import("@/lib/anthropic");
    const guideRoute = await import("@/app/api/ai-suggest/guide/route");
    const outlineRoute = await import("@/app/api/card-news/outline/route");
    expect((await guideRoute.POST(post("/api/ai-suggest/guide", {}))).status).toBe(400);
    expect((await outlineRoute.POST(post("/api/card-news/outline", {}))).status).toBe(400);
    expect(anthropic.generateText).not.toHaveBeenCalled();
  });
});
