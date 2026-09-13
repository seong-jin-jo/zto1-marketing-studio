import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ tenantId: "tenant-a" }));
vi.mock("@/lib/tenant-auth", () => ({
  AuthError: class AuthError extends Error { status = 401; },
  effectiveTenantId: vi.fn(async () => auth.tenantId),
}));
vi.mock("@/lib/media-store", () => ({
  MediaStoreError: class MediaStoreError extends Error { code = "R2_UNAVAILABLE"; },
  mediaStore: { exists: vi.fn(async () => true) },
}));
vi.mock("@/lib/storage", () => ({ resolveGeneratedFile: vi.fn(() => "/tmp/file") }));
vi.mock("@/lib/social-connect", () => ({ canonicalPublicOrigin: vi.fn(() => "https://studio.example.com") }));

describe("이미지 목적 배달 주소 재발급", () => {
  beforeEach(() => {
    process.env.MEDIA_SIGNING_SECRET = "test-secret-at-least-sixteen-characters";
    auth.tenantId = "tenant-a";
    vi.resetModules();
  });

  afterEach(() => delete process.env.MEDIA_SIGNING_SECRET);

  it("항목 19 정상: 만료된 유효 HMAC image-purpose URL은 같은 작업 공간에서만 갱신된다", async () => {
    const { signImageToken } = await import("@/lib/image-token");
    const expiredToken = signImageToken("tenant-a", "card.png", 1000, 0);
    expect(expiredToken).toBeTruthy();
    const deliveryUrl = `https://studio.example.com/api/images/deliver/${expiredToken}`;
    const { POST } = await import("@/app/api/media/resign/route");

    const ok = await POST(new Request("http://localhost/api/media/resign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delivery_url: deliveryUrl, purpose: "image", tenant_id: "tenant-a" }),
    }));
    const okBody = await ok.json();
    expect(ok.status).toBe(200);
    expect(okBody.file).toMatch(/^https:\/\/studio\.example\.com\/api\/images\/deliver\//);

    auth.tenantId = "tenant-b";
    const denied = await POST(new Request("http://localhost/api/media/resign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delivery_url: deliveryUrl, purpose: "image", tenant_id: "tenant-b" }),
    }));
    expect(denied.status).toBe(404);
  });
});
