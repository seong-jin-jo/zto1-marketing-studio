import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureTenantForUser, getTenantStatus, resolveTenantToken } from "@/lib/tenant-auth";
import { verifySupabaseJwt } from "@/lib/supabase";
import { resolveStudioPrincipal } from "@/lib/studio/generation/identity";

vi.mock("@/lib/tenant-auth", () => ({
  ensureTenantForUser: vi.fn(),
  getTenantStatus: vi.fn(),
  resolveTenantToken: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ verifySupabaseJwt: vi.fn() }));

const mockVerify = vi.mocked(verifySupabaseJwt);
const mockEnsureTenant = vi.mocked(ensureTenantForUser);
const mockTenantStatus = vi.mocked(getTenantStatus);
const mockResolveTenantToken = vi.mocked(resolveTenantToken);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Studio 고객 신원 계약", () => {
  it("GEN-AUTH-01 정상: 운영 Supabase 고객 JWT를 회원과 active tenant 하나로 해석한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_IDENTITY_MODE", "development");
    mockVerify.mockResolvedValue({
      status: "valid",
      user: { id: "auth-user-1", email: "qa@example.test" } as never,
    });
    mockEnsureTenant.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mockTenantStatus.mockResolvedValue("active");

    const principal = await resolveStudioPrincipal(new Request("https://example.test/api/studio/v1/generations", {
      headers: { Authorization: "Bearer customer-jwt" },
    }));

    expect(principal.memberId).toBe("auth-user-1");
    expect([...principal.allowedWorkspaceIds]).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(mockVerify).toHaveBeenCalledWith("customer-jwt");
  });

  it("GEN-AUTH-02 거절: 운영에서는 개발 bearer 설정이 있어도 무효 고객 토큰을 통과시키지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STUDIO_IDENTITY_MODE", "development");
    vi.stubEnv("STUDIO_DEV_BEARER_TOKEN", "dev-token");
    mockVerify.mockResolvedValue({ status: "invalid" });

    await expect(resolveStudioPrincipal(new Request("https://example.test/api/studio/v1/generations", {
      headers: { Authorization: "Bearer dev-token" },
    }))).rejects.toEqual(expect.objectContaining({ status: 401, code: "TOKEN_INVALID" }));
  });

  it("GEN-AUTH-03 거절: 정지 tenant는 유효 고객 JWT여도 생성 권한을 주지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockVerify.mockResolvedValue({ status: "valid", user: { id: "auth-user-2" } as never });
    mockEnsureTenant.mockResolvedValue("22222222-2222-4222-8222-222222222222");
    mockTenantStatus.mockResolvedValue("paused");

    await expect(resolveStudioPrincipal(new Request("https://example.test/api/studio/v1/generations", {
      headers: { Authorization: "Bearer customer-jwt" },
    }))).rejects.toEqual(expect.objectContaining({ status: 403, code: "ACCOUNT_PAUSED" }));
  });

  it("GEN-AUTH-04 정상: 개발 모드에서도 개발 bearer와 다른 실제 고객 JWT를 검증한다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STUDIO_IDENTITY_MODE", "development");
    vi.stubEnv("STUDIO_DEV_BEARER_TOKEN", "dev-only-token");
    mockVerify.mockResolvedValue({
      status: "valid",
      user: { id: "auth-user-local", email: "local@example.test" } as never,
    });
    mockEnsureTenant.mockResolvedValue("33333333-3333-4333-8333-333333333333");
    mockTenantStatus.mockResolvedValue("active");

    const customerJwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    const principal = await resolveStudioPrincipal(new Request("http://localhost/api/studio/v1/generations", {
      headers: { Authorization: `Bearer ${customerJwt}` },
    }));

    expect(principal.memberId).toBe("auth-user-local");
    expect([...principal.allowedWorkspaceIds]).toEqual(["33333333-3333-4333-8333-333333333333"]);
    expect(mockVerify).toHaveBeenCalledWith(customerJwt);
  });

  it("GEN-AUTH-05 정상: 고객 osmu API 토큰을 active 작업 공간 실행 주체로 해석한다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STUDIO_IDENTITY_MODE", "development");
    mockResolveTenantToken.mockResolvedValue("44444444-4444-4444-8444-444444444444");
    mockTenantStatus.mockResolvedValue("active");

    const principal = await resolveStudioPrincipal(new Request("http://localhost/api/studio/drafts/draft/exports", {
      headers: { Authorization: "Bearer osmu_valid-customer-token" },
    }));

    expect(principal.memberId).toBe("tenant-token:44444444-4444-4444-8444-444444444444");
    expect([...principal.allowedWorkspaceIds]).toEqual(["44444444-4444-4444-8444-444444444444"]);
    expect(mockResolveTenantToken).toHaveBeenCalledWith("osmu_valid-customer-token");
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("GEN-AUTH-06 거절: 폐기되었거나 알 수 없는 osmu API 토큰은 개발 신원으로 폴스루하지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STUDIO_IDENTITY_MODE", "development");
    vi.stubEnv("STUDIO_DEV_BEARER_TOKEN", "dev-token");
    mockResolveTenantToken.mockResolvedValue(null);

    await expect(resolveStudioPrincipal(new Request("http://localhost/api/studio/drafts/draft/exports", {
      headers: { Authorization: "Bearer osmu_revoked" },
    }))).rejects.toEqual(expect.objectContaining({ status: 401, code: "TOKEN_INVALID" }));
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
