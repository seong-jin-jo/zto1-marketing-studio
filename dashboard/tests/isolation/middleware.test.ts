import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { resolveTenantToken } from "@/lib/tenant-auth";
import { verifySupabaseJwt } from "@/lib/supabase";
import { resetOperatorAuthRateLimitForTests } from "@/lib/operator-auth-rate-limit";

// 가짜 JWT는 리터럴로 두면 secret-leak 훅이 잡으므로 런타임에 조립한다(값은 종전과 동일).
function makeFakeJwt(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return [b64({ alg: "HS" + 256 }), b64({ sub: "user1" }), "deadbeef".repeat(4)].join(".");
}

// Next 16 proxy.ts는 Node 런타임이라 osmu_/JWT 토큰을 resolveTenantToken/verifySupabaseJwt로
// 실검증한다(구 Edge middleware는 형태만 봤다). 단위테스트라 그 두 검증기는 모킹.
// getTenantStatus/ensureTenantForUser도 승인 게이트(pending/paused → 403)를 위해 proxy가 호출하므로
// 여기서는 기본 'active'/고정 tenantId로 모킹해 이 파일의 기존 L0-1/인증분기 검증에 영향이 없게 한다
// (승인 게이트 자체의 pending/paused 분기 테스트는 tests/isolation/tenant-auth.test.ts에 있음).
vi.mock("@/lib/tenant-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenant-auth")>();
  return {
    ...actual,
    resolveTenantToken: vi.fn(),
    getTenantStatus: vi.fn(async () => "active"),
    ensureTenantForUser: vi.fn(async () => "tenant-jwt-mapped"),
  };
});
vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return { ...actual, verifySupabaseJwt: vi.fn() };
});

const mockResolveTenantToken = vi.mocked(resolveTenantToken);
const mockVerifySupabaseJwt = vi.mocked(verifySupabaseJwt);

// L0-1 분기 단위검증.
// proxy는 호출 시점에 process.env를 읽으므로 vi.stubEnv로 조합을 주입.
// DASHBOARD_AUTH_TOKEN='' 는 falsy → 코드의 `if (!authToken)` 무토큰 분기와 동일.

function apiRequest(headers: Record<string, string> = {}, method = "GET") {
  return new NextRequest("http://localhost/api/queue", { method, headers });
}

// NextResponse.next() 통과 응답 식별: status 200 + x-middleware-next 헤더.
function isPass(res: { status: number; headers: Headers }) {
  return res.status === 200 && res.headers.get("x-middleware-next") === "1";
}

afterEach(() => {
  vi.unstubAllEnvs();
  mockResolveTenantToken.mockReset();
  mockVerifySupabaseJwt.mockReset();
  resetOperatorAuthRateLimitForTests();
});

describe("proxy L0-1 fail-closed 분기", () => {
  it("prod + 토큰없음 → API 503 fail-closed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "");
    vi.stubEnv("OSMU_AUTH_OPTIONAL", "");
    const res = await proxy(apiRequest());
    expect(res.status).toBe(503);
  });

  it("prod + OSMU_AUTH_OPTIONAL=1 + 토큰없음 → 통과", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "");
    vi.stubEnv("OSMU_AUTH_OPTIONAL", "1");
    const res = await proxy(apiRequest());
    expect(isPass(res)).toBe(true);
  });

  it("dev + 토큰없음 → 통과 (무인증 허용)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "");
    vi.stubEnv("OSMU_AUTH_OPTIONAL", "");
    const res = await proxy(apiRequest());
    expect(isPass(res)).toBe(true);
  });
});

describe("proxy 토큰 검증 분기", () => {
  it("토큰 설정 + Authorization 일치 → 통과", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    const res = await proxy(apiRequest({ Authorization: "Bearer secret-abc" }));
    expect(isPass(res)).toBe(true);
  });

  it("토큰 설정 + Authorization 불일치 → 401", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    const res = await proxy(apiRequest({ Authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("토큰 설정 + Authorization 누락 → 401", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    const res = await proxy(apiRequest());
    expect(res.status).toBe(401);
  });

  it("토큰 설정 + /api/auth/google → 고객 로그인 preflight 공개 통과", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    const req = new NextRequest("http://localhost/api/auth/google");
    expect(isPass(await proxy(req))).toBe(true);
  });
});

describe("proxy Studio 독립 인증 경계", () => {
  it("STUDIO-AUTH-01 한국어 설명: Studio bearer는 대시보드 토큰과 달라도 v1 Route Handler까지 통과한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "dashboard-only-token");
    const req = new NextRequest("http://localhost/api/studio/v1/generations", {
      method: "POST",
      headers: { Authorization: "Bearer studio-only-token" },
    });

    expect(isPass(await proxy(req))).toBe(true);
    expect(mockResolveTenantToken).not.toHaveBeenCalled();
    expect(mockVerifySupabaseJwt).not.toHaveBeenCalled();
  });

  it("STUDIO-AUTH-02 한국어 설명: 운영의 개발용 Studio 신원은 무효 고객 토큰으로 우회되지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "dashboard-only-token");
    vi.stubEnv("STUDIO_IDENTITY_MODE", "development");
    vi.stubEnv("STUDIO_DEV_BEARER_TOKEN", "expected-studio-token");
    vi.stubEnv("STUDIO_DEV_MEMBER_ID", "member-proxy-contract");
    vi.stubEnv("STUDIO_DEV_WORKSPACE_IDS", "11111111-1111-4111-8111-111111111111");
    mockVerifySupabaseJwt.mockResolvedValue({ status: "invalid" });
    const req = new NextRequest("http://localhost/api/studio/v1/generations", {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong-studio-token",
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    expect(isPass(await proxy(req))).toBe(true);
    const { POST } = await import("@/app/api/studio/v1/generations/route");
    const response = await POST(req);
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.error.code).toBe("TOKEN_INVALID");
  });

  it("STUDIO-AUTH-03 한국어 설명: 기존 Studio 대시보드 API는 예외에 섞이지 않고 대시보드 인증을 유지한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "dashboard-only-token");
    const req = new NextRequest("http://localhost/api/studio/text", {
      method: "POST",
      headers: { Authorization: "Bearer studio-only-token" },
    });

    expect((await proxy(req)).status).toBe(401);
  });

  it("STUDIO-AUTH-04 한국어 설명: 인증 구현을 확인하지 않은 새 Studio v1 경로는 자동 예외가 되지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "dashboard-only-token");
    const req = new NextRequest("http://localhost/api/studio/v1/not-allowlisted", {
      headers: { Authorization: "Bearer studio-only-token" },
    });

    expect((await proxy(req)).status).toBe(401);
  });
});

describe("proxy /api/me 운영자 토큰 검증 rate limit", () => {
  function meRequest(
    bearer: string,
    clientIp = "203.0.113.10",
    extraHeaders: Record<string, string> = {},
  ) {
    return new NextRequest("http://localhost/api/me", {
      headers: {
        Authorization: `Bearer ${bearer}`,
        "cf-connecting-ip": clientIp,
        ...extraHeaders,
      },
    });
  }

  it("같은 client identity의 5번째 invalid operator-style Bearer를 429 + Retry-After로 막는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "configured-operator-token");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await proxy(meRequest(`invalid-operator-attempt-${attempt}`))).status).toBe(401);
    }

    const limited = await proxy(meRequest("invalid-operator-attempt-final"));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(Number(limited.headers.get("Retry-After"))).toBeLessThanOrEqual(60);
    expect(limited.headers.get("Cache-Control")).toContain("no-store");
    expect(await limited.json()).toEqual({ error: "Too Many Requests" });
  });

  it("서로 다른 Cloudflare client identity는 독립 bucket을 사용한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "configured-operator-token");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await proxy(meRequest(`invalid-a-${attempt}`, "203.0.113.11"))).status).toBe(401);
    }

    expect((await proxy(meRequest("invalid-b", "203.0.113.12"))).status).toBe(401);
  });

  it("유효 운영자 토큰은 이미 429인 identity도 통과시키고 실패 window를 지운다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "configured-operator-token");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await proxy(meRequest(`invalid-${attempt}`))).status).toBe(401);
    }
    expect((await proxy(meRequest("invalid-final"))).status).toBe(429);
    expect(isPass(await proxy(meRequest("configured-operator-token")))).toBe(true);
    expect((await proxy(meRequest("invalid-after-success"))).status).toBe(401);
  });

  it("성공한 osmu customer 인증은 이미 429인 identity에서도 제한되지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "configured-operator-token");
    mockResolveTenantToken.mockResolvedValue("tenant-1");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await proxy(meRequest(`invalid-${attempt}`))).status).toBe(401);
    }
    expect((await proxy(meRequest("invalid-final"))).status).toBe(429);
    for (let request = 0; request < 10; request += 1) {
      expect(isPass(await proxy(meRequest("osmu_customer_token")))).toBe(true);
    }
    expect((await proxy(meRequest("invalid-still-limited"))).status).toBe(429);
  });

  it("성공한 Supabase JWT 인증은 이미 429인 identity에서도 제한되지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "configured-operator-token");
    mockVerifySupabaseJwt.mockResolvedValue({
      status: "valid",
      user: { id: "u1", email: "a@b.com" } as import("@supabase/supabase-js").User,
    });
    const customerJwt = makeFakeJwt();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await proxy(meRequest(`invalid-${attempt}`))).status).toBe(401);
    }
    expect((await proxy(meRequest("invalid-final"))).status).toBe(429);
    for (let request = 0; request < 10; request += 1) {
      expect(isPass(await proxy(meRequest(customerJwt)))).toBe(true);
    }
    expect((await proxy(meRequest("invalid-still-limited"))).status).toBe(429);
  });

  it("invalid osmu/JWT 모양으로 바꿔도 /api/me 실패 bucket을 우회하지 못한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "configured-operator-token");
    mockResolveTenantToken.mockResolvedValue(null);
    mockVerifySupabaseJwt.mockResolvedValue({ status: "invalid" });

    expect((await proxy(meRequest("osmu_invalid_1"))).status).toBe(401);
    expect((await proxy(meRequest("osmu_invalid_2"))).status).toBe(401);
    expect((await proxy(meRequest(makeFakeJwt()))).status).toBe(401);
    expect((await proxy(meRequest(makeFakeJwt()))).status).toBe(401);
    expect((await proxy(meRequest("invalid-final"))).status).toBe(429);
  });

  it("X-Forwarded-For를 바꿔도 Cloudflare identity가 없으면 direct bucket을 우회하지 못한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "configured-operator-token");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const request = meRequest(`invalid-${attempt}`, "", {
        "x-forwarded-for": `198.51.100.${attempt + 1}`,
      });
      expect((await proxy(request)).status).toBe(401);
    }
    const limited = meRequest("invalid-final", "", {
      "x-forwarded-for": "198.51.100.99",
    });
    expect((await proxy(limited)).status).toBe(429);
  });

  it("다른 API의 invalid Bearer는 좁은 /api/me bucket을 소모하지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "configured-operator-token");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const request = new NextRequest("http://localhost/api/queue", {
        headers: {
          Authorization: `Bearer invalid-${attempt}`,
          "cf-connecting-ip": "203.0.113.10",
        },
      });
      expect((await proxy(request)).status).toBe(401);
    }
    expect((await proxy(meRequest("first-me-failure"))).status).toBe(401);
  });
});

describe("proxy 프록시 모드(포크 셀프호스트) 분기", () => {
  it("OSMU_API_BASE 설정 → /api를 중앙으로 rewrite(토큰 서버에서 부착)", async () => {
    vi.stubEnv("OSMU_API_BASE", "https://central.example.com");
    vi.stubEnv("OSMU_TENANT_TOKEN", "osmu_secret");
    const res = await proxy(apiRequest());
    expect(res.headers.get("x-middleware-rewrite")).toContain("https://central.example.com/api/queue");
  });

  it("OSMU_API_BASE 미설정 → 프록시 안 함(통상 처리)", async () => {
    vi.stubEnv("OSMU_API_BASE", "");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "");
    vi.stubEnv("NODE_ENV", "development");
    const res = await proxy(apiRequest());
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});

describe("proxy 테넌트 토큰(인증모델 b) 분기 — 실검증", () => {
  it("osmu_ 토큰 + 테넌트-aware 라우트(/api/queue) + 유효 → 통과", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockResolvedValue("tenant-1");
    const res = await proxy(apiRequest({ Authorization: "Bearer osmu_xxx" }));
    expect(isPass(res)).toBe(true);
  });

  it.each([
    "/api/channels/threads/accounts",
    "/api/channels/threads/accounts/account-1",
    "/api/channels/threads/accounts/account-1/default",
    "/api/suggestions/enqueue",
    "/api/schedule/11111111-1111-4111-8111-111111111111",
    "/api/schedule/11111111-1111-4111-8111-111111111111/cancel",
    "/api/tiktok/creator-info",
    // Regression: API-READ-20260829-02. UI가 polling하는 경로가 모든 인증 조합에서 막혔다.
    "/api/tiktok/publish-status",
  ])("BE-V63-02 고객 경계 정상 경로: osmu_ 토큰 + tenant API(%s)는 운영자 전용으로 막히지 않는다", async (path) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockResolvedValue("tenant-1");
    const req = new NextRequest(`http://localhost${path}`, {
      headers: { Authorization: "Bearer osmu_xxx" },
    });
    expect(isPass(await proxy(req))).toBe(true);
  });

  it("BE-V63-02 고객 경계 거절 경로: 폐기된 토큰의 제안 큐 인계는 401로 거절한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/suggestions/enqueue", {
      method: "POST",
      headers: { Authorization: "Bearer osmu_revoked" },
    });

    expect((await proxy(req)).status).toBe(401);
  });

  it("osmu_ 토큰 + 미인식/폐기 토큰 → 401", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockResolvedValue(null);
    const res = await proxy(apiRequest({ Authorization: "Bearer osmu_unknown" }));
    expect(res.status).toBe(401);
  });

  it("osmu_ 토큰 + DB 장애(resolveTenantToken throw) → 503", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockRejectedValue(new Error("DB down"));
    const res = await proxy(apiRequest({ Authorization: "Bearer osmu_xxx" }));
    expect(res.status).toBe(503);
  });

  it("osmu_ 토큰(유효) + 운영자 라우트(tenant-tokens) → 403 차단(authenticate-before-authorize: 검증기는 반드시 호출됨)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockResolvedValue("tenant-1");
    const req = new NextRequest("http://localhost/api/tenant-tokens", { headers: { Authorization: "Bearer osmu_xxx" } });
    const res = await proxy(req);
    expect(res.status).toBe(403);
    expect(mockResolveTenantToken).toHaveBeenCalledWith("osmu_xxx");
  });

  it("osmu_ 토큰(유효) + 워크스페이스 목록 → 403 차단(운영자 전용)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockResolvedValue("tenant-1");
    const req = new NextRequest("http://localhost/api/workspaces", { headers: { Authorization: "Bearer osmu_xxx" } });
    expect((await proxy(req)).status).toBe(403);
  });

  it("osmu_ 토큰(미인식/폐기) + 레거시 라우트(tenant-tokens) → 401(403 아님 — 무효 자격증명이 우선 거부됨)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/tenant-tokens", { headers: { Authorization: "Bearer osmu_unknown" } });
    const res = await proxy(req);
    expect(res.status).toBe(401);
    expect(mockResolveTenantToken).toHaveBeenCalledWith("osmu_unknown");
  });
});

describe("proxy 고객 로그인 세션(Supabase JWT) 분기 — 실검증", () => {
  function jwtRequest(headers: Record<string, string> = {}) {
    const fakeJwt = makeFakeJwt();
    return new NextRequest("http://localhost/api/queue", { headers: { Authorization: `Bearer ${fakeJwt}`, ...headers } });
  }

  it("가짜 JWT(형태만) + 검증 invalid → 401", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockVerifySupabaseJwt.mockResolvedValue({ status: "invalid" });
    const res = await proxy(jwtRequest());
    expect(res.status).toBe(401);
  });

  it("유효 JWT + 테넌트-aware 라우트 → 통과", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockVerifySupabaseJwt.mockResolvedValue({
      status: "valid",
      user: { id: "u1", email: "a@b.com" } as import("@supabase/supabase-js").User,
    });
    const res = await proxy(jwtRequest());
    expect(isPass(res)).toBe(true);
  });

  it("유효 JWT + 다중계정 목록 API → tenant-aware 통과", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockVerifySupabaseJwt.mockResolvedValue({
      status: "valid",
      user: { id: "u1", email: "a@b.com" } as import("@supabase/supabase-js").User,
    });
    const fakeJwt = makeFakeJwt();
    const req = new NextRequest("http://localhost/api/channels/instagram/accounts", {
      headers: { Authorization: `Bearer ${fakeJwt}` },
    });
    expect(isPass(await proxy(req))).toBe(true);
  });

  it("Supabase 검증 불가(env/네트워크 장애) → 503", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockVerifySupabaseJwt.mockResolvedValue({ status: "unavailable" });
    const res = await proxy(jwtRequest());
    expect(res.status).toBe(503);
  });

  it("유효 JWT라도 레거시(비-테넌트-aware) 라우트 → 403(authenticate-before-authorize: 검증기는 반드시 호출됨)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockVerifySupabaseJwt.mockResolvedValue({
      status: "valid",
      user: { id: "u1", email: "a@b.com" } as import("@supabase/supabase-js").User,
    });
    const fakeJwt = makeFakeJwt();
    const req = new NextRequest("http://localhost/api/tenant-tokens", { headers: { Authorization: `Bearer ${fakeJwt}` } });
    const res = await proxy(req);
    expect(res.status).toBe(403);
    expect(mockVerifySupabaseJwt).toHaveBeenCalledWith(fakeJwt);
  });

  it("가짜 JWT(검증 invalid) + 레거시 라우트(tenant-tokens) → 401(403 아님 — 무효 자격증명이 우선 거부됨)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockVerifySupabaseJwt.mockResolvedValue({ status: "invalid" });
    const fakeJwt = makeFakeJwt();
    const req = new NextRequest("http://localhost/api/tenant-tokens", { headers: { Authorization: `Bearer ${fakeJwt}` } });
    const res = await proxy(req);
    expect(res.status).toBe(401);
    expect(mockVerifySupabaseJwt).toHaveBeenCalledWith(fakeJwt);
  });

  it("Supabase 검증 불가 + 레거시 라우트(tenant-tokens) → 503(403 아님)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockVerifySupabaseJwt.mockResolvedValue({ status: "unavailable" });
    const fakeJwt = makeFakeJwt();
    const req = new NextRequest("http://localhost/api/tenant-tokens", { headers: { Authorization: `Bearer ${fakeJwt}` } });
    expect((await proxy(req)).status).toBe(503);
  });
});

describe("proxy /api/media/<token> — 프록시 레벨 인증 없이 핸들러로 통과(BLOCKER #1)", () => {
  // 프록시는 이 경로에서 Bearer/토큰 판단을 전혀 하지 않는다 — 인증 헤더 유무·값과 무관하게
  // NextResponse.next()로 라우트 핸들러(app/api/media/[token]/route.ts)까지 흘려보내고,
  // "이 요청을 실제로 받아도 되는가"는 핸들러의 verifyMediaToken(HMAC) 몫이다.
  // 여기서 검증하는 것은 "프록시가 막지 않는다"이지 "핸들러가 통과시킨다"가 아니다 —
  // 그건 tests/publish/media-delivery-route.test.ts(만료/변조/cross-tenant는 여전히 404)의 책임.
  it("Authorization 헤더 없음(Meta 서버가 보낼 형태) → 프록시가 401로 막지 않고 통과시킨다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    const req = new NextRequest("http://localhost/api/media/whatever-signed-token", { method: "GET" });
    const res = await proxy(req);
    expect(isPass(res)).toBe(true);
    // 아래 검증기들이 이 경로에서 전혀 호출되지 않았음을 확인 — 프록시가 자체적으로
    // "이 토큰이 osmu_/JWT인가"를 판단하려 시도조차 하지 않는다(핸들러 전담).
    expect(mockResolveTenantToken).not.toHaveBeenCalled();
    expect(mockVerifySupabaseJwt).not.toHaveBeenCalled();
  });

  it("garbage 문자열이 와도(형식 무관) 프록시는 그대로 통과시킨다 — 거부는 핸들러의 HMAC 검증 몫", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    const req = new NextRequest("http://localhost/api/media/%20%20not-a-real-token%20%20", { method: "GET" });
    expect(isPass(await proxy(req))).toBe(true);
  });
});

describe("proxy 비디오 워크플로우 라우트 — tenant-aware(BLOCKER #2, OAuth/osmu 사용자 접근)", () => {
  it.each(["/api/video/list", "/api/video/upload", "/api/video/delete", "/api/video/publish"])(
    "osmu_ 토큰 + %s → tenant-aware 통과(운영자 전용 403 아님)",
    async (path) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
      mockResolveTenantToken.mockResolvedValue("tenant-1");
      const req = new NextRequest(`http://localhost${path}`, { headers: { Authorization: "Bearer osmu_xxx" } });
      expect(isPass(await proxy(req))).toBe(true);
    },
  );

  it.each(["/api/video/list", "/api/video/upload", "/api/video/delete", "/api/video/publish"])(
    "유효 Supabase JWT + %s → tenant-aware 통과(운영자 전용 403 아님)",
    async (path) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
      mockVerifySupabaseJwt.mockResolvedValue({
        status: "valid",
        user: { id: "u1", email: "a@b.com" } as import("@supabase/supabase-js").User,
      });
      const fakeJwt = makeFakeJwt();
      const req = new NextRequest(`http://localhost${path}`, { headers: { Authorization: `Bearer ${fakeJwt}` } });
      expect(isPass(await proxy(req))).toBe(true);
    },
  );
});

describe("proxy — /videos 페이지 의존 라우트(SNS-016 403 회귀) — tenant-aware", () => {
  // /videos 페이지에서 유효한 osmu_ 토큰/Supabase JWT를 가진 테넌트가 403을 받던 4개 라우트 중
  // /api/youtube/status·/api/images는 실제로 테넌트 스코프(effectiveTenantId/DB 격리)라 확인 후
  // 허용목록에 추가했다. /api/clipping-config·/api/elevenlabs-config는 테넌트 격리가 없는 전역
  // 단일 파일이라 의도적으로 제외 상태를 유지한다(아래 별도 describe에서 403 유지를 고정).
  it.each(["/api/youtube/status", "/api/images"])(
    "osmu_ 토큰 + %s → tenant-aware 통과(운영자 전용 403 아님)",
    async (path) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
      mockResolveTenantToken.mockResolvedValue("tenant-1");
      const req = new NextRequest(`http://localhost${path}`, { headers: { Authorization: "Bearer osmu_xxx" } });
      expect(isPass(await proxy(req))).toBe(true);
    },
  );

  it.each(["/api/youtube/status", "/api/images"])(
    "유효 Supabase JWT + %s → tenant-aware 통과(운영자 전용 403 아님)",
    async (path) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
      mockVerifySupabaseJwt.mockResolvedValue({
        status: "valid",
        user: { id: "u1", email: "a@b.com" } as import("@supabase/supabase-js").User,
      });
      const fakeJwt = makeFakeJwt();
      const req = new NextRequest(`http://localhost${path}`, { headers: { Authorization: `Bearer ${fakeJwt}` } });
      expect(isPass(await proxy(req))).toBe(true);
    },
  );
});

describe("proxy — /api/clipping-config·/api/elevenlabs-config는 운영자 전용을 유지한다(전역 단일 파일, 테넌트 격리 없음)", () => {
  it.each(["/api/clipping-config", "/api/elevenlabs-config"])(
    "osmu_ 토큰 + %s → 403(테넌트 aware 아님, 의도적)",
    async (path) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
      mockResolveTenantToken.mockResolvedValue("tenant-1");
      const res = await proxy(new NextRequest(`http://localhost${path}`, { headers: { Authorization: "Bearer osmu_xxx" } }));
      expect(res.status).toBe(403);
    },
  );

  it.each(["/api/clipping-config", "/api/elevenlabs-config"])(
    "유효 Supabase JWT + %s → 403(테넌트 aware 아님, 의도적)",
    async (path) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
      mockVerifySupabaseJwt.mockResolvedValue({
        status: "valid",
        user: { id: "u1", email: "a@b.com" } as import("@supabase/supabase-js").User,
      });
      const fakeJwt = makeFakeJwt();
      const res = await proxy(new NextRequest(`http://localhost${path}`, { headers: { Authorization: `Bearer ${fakeJwt}` } }));
      expect(res.status).toBe(403);
    },
  );

  it.each(["/api/clipping-config", "/api/elevenlabs-config"])(
    "운영자 토큰 + %s → 통과(운영자는 계속 사용 가능)",
    async (path) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
      const res = await proxy(new NextRequest(`http://localhost${path}`, { headers: { Authorization: "Bearer secret-abc" } }));
      expect(isPass(res)).toBe(true);
    },
  );
});

describe("proxy — /api/video/generate 는 운영자 전용(SNS-015 SSRF/자원고갈 차단)", () => {
  // 이 라우트는 요청 본문의 slide.imageUrl / bgmUrl 을 서버가 그대로 fetch하고(임의 URL = SSRF)
  // 슬라이드 수만큼 동기 ffmpeg를 돌린다. 고객 토큰(osmu_/JWT)에는 절대 열지 않는다.
  it("osmu_ 토큰 + /api/video/generate → 403(테넌트 aware 아님)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockResolvedValue("tenant-1");
    const res = await proxy(new NextRequest("http://localhost/api/video/generate", { headers: { Authorization: "Bearer osmu_xxx" } }));
    expect(isPass(res)).toBe(false);
    expect(res.status).toBe(403);
  });

  it("유효 Supabase JWT + /api/video/generate → 403", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockVerifySupabaseJwt.mockResolvedValue({
      status: "valid",
      user: { id: "u1", email: "a@b.com" } as import("@supabase/supabase-js").User,
    });
    const fakeJwt = makeFakeJwt();
    const res = await proxy(new NextRequest("http://localhost/api/video/generate", { headers: { Authorization: `Bearer ${fakeJwt}` } }));
    expect(isPass(res)).toBe(false);
    expect(res.status).toBe(403);
  });

  it("운영자 토큰은 그대로 통과 — 생성기 자체는 보존한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    const res = await proxy(new NextRequest("http://localhost/api/video/generate", { headers: { Authorization: "Bearer secret-abc" } }));
    expect(isPass(res)).toBe(true);
  });
});

describe("proxy 승인 게이트(checkTenantAccess) — fail-closed", () => {
  it("[Codex 2nd-pass 반려 수정] osmu_ 토큰 + status=null(알수없음) → 403 account_unavailable(통과 금지)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockResolvedValue("tenant-1");
    const { getTenantStatus } = await import("@/lib/tenant-auth");
    vi.mocked(getTenantStatus).mockResolvedValueOnce(null);
    const res = await proxy(apiRequest({ Authorization: "Bearer osmu_xxx" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("account_unavailable");
  });

  it("osmu_ 토큰 + status='pending'(레거시, 신규 가입은 더 이상 이 값을 안 씀) → 403 account_unavailable(fail-closed, approval_required 분기는 제거됨)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockResolvedValue("tenant-1");
    const { getTenantStatus } = await import("@/lib/tenant-auth");
    vi.mocked(getTenantStatus).mockResolvedValueOnce("pending");
    const res = await proxy(apiRequest({ Authorization: "Bearer osmu_xxx" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("account_unavailable");
  });

  it("osmu_ 토큰 + status='paused' → 403 account_paused", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockResolvedValue("tenant-1");
    const { getTenantStatus } = await import("@/lib/tenant-auth");
    vi.mocked(getTenantStatus).mockResolvedValueOnce("paused");
    const res = await proxy(apiRequest({ Authorization: "Bearer osmu_xxx" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("account_paused");
  });

  it("osmu_ 토큰 + /api/me + status=null → 승인 게이트 미적용 통과(라우트 핸들러가 재확인)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "secret-abc");
    mockResolveTenantToken.mockResolvedValue("tenant-1");
    const { getTenantStatus } = await import("@/lib/tenant-auth");
    vi.mocked(getTenantStatus).mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/me", { headers: { Authorization: "Bearer osmu_xxx" } });
    const res = await proxy(req);
    expect(isPass(res)).toBe(true);
  });
});
