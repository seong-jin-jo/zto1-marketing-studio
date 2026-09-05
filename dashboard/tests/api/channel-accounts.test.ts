import { describe, it, expect, vi, beforeEach } from "vitest";

// SNS-007: /api/channels/{provider}/accounts REST 계약 테스트.
// - GET: 목록은 토큰/secret 필드를 절대 포함하지 않는다(listChannelAccounts 자체가 화이트리스트라
//   여기선 route가 그 반환값을 가공 없이 그대로 넘기는지만 확인).
// - POST(bluesky): createSession 검증 → upsertChannelAccount. 다른 provider는 400.
// - DELETE / POST default: cross-tenant(다른 테넌트 소유 id)면 notFound → 404.

const H = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  accounts: [
    {
      id: "acc-1", provider: "threads", external_account_id: "ext-1", display_name: "메인", username: "main",
      is_default: true, status: "active", token_expires_at: "2026-10-30T00:00:00.000Z",
      created_at: "t", updated_at: "t", connection_state: "connected", can_be_default: true,
      default_blocked_reason: null,
    },
  ],
  setDefaultResult: { ok: true } as { ok: boolean; notFound?: boolean; blockedReason?: string },
  deleteResult: { ok: true } as { ok: boolean; notFound?: boolean; promotedId?: string },
  upsertResult: { id: "acc-new", isDefault: false },
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
  AuthError: class AuthError extends Error {
    status = 401;
    code = "invalid_token";
  },
}));

vi.mock("@/lib/channel-accounts", () => ({
  listChannelAccounts: vi.fn(async () => H.accounts),
  setDefaultAccount: vi.fn(async () => H.setDefaultResult),
  defaultAccountBlockedMessage: vi.fn(() => "토큰이 만료된 계정은 기본 계정으로 지정할 수 없습니다. 다시 연결해 주세요."),
  deleteChannelAccount: vi.fn(async () => H.deleteResult),
  upsertChannelAccount: vi.fn(async () => H.upsertResult),
  syncLegacyIntegration: vi.fn(async () => {}),
}));

beforeEach(() => {
  H.tenantId = "tenant-1";
  H.setDefaultResult = { ok: true };
  H.deleteResult = { ok: true };
});

describe("GET /api/channels/{provider}/accounts", () => {
  it("계정 목록에 secret_enc/refresh_enc/token 필드가 없다", async () => {
    const { GET } = await import("@/app/api/channels/[provider]/accounts/route");
    const res = await GET(new Request("http://localhost/api/channels/threads/accounts"), { params: Promise.resolve({ provider: "threads" }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.accounts).toHaveLength(1);
    const raw = JSON.stringify(json);
    expect(raw).not.toMatch(/secret_enc|refresh_enc|"token"/);
  });

  it("테넌트 식별 실패 → 401", async () => {
    H.tenantId = null;
    const { GET } = await import("@/app/api/channels/[provider]/accounts/route");
    const res = await GET(new Request("http://localhost/api/channels/threads/accounts"), { params: Promise.resolve({ provider: "threads" }) });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/channels/{provider}/accounts (Bluesky 수동 등록)", () => {
  it("OAuth provider(threads)는 400", async () => {
    const { POST } = await import("@/app/api/channels/[provider]/accounts/route");
    const res = await POST(
      new Request("http://localhost/api/channels/threads/accounts", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ provider: "threads" }) },
    );
    expect(res.status).toBe(400);
  });

  it("handle/appPassword 누락 → 400", async () => {
    const { POST } = await import("@/app/api/channels/[provider]/accounts/route");
    const res = await POST(
      new Request("http://localhost/api/channels/bluesky/accounts", { method: "POST", body: JSON.stringify({ handle: "x.bsky.social" }) }),
      { params: Promise.resolve({ provider: "bluesky" }) },
    );
    expect(res.status).toBe(400);
  });

  it("createSession 성공 → upsertChannelAccount 호출 + 200", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ did: "did:plc:abc", handle: "me.bsky.social", accessJwt: "jwt-a", refreshJwt: "jwt-r" }), { status: 200 }),
    ) as unknown as typeof fetch;
    try {
      const { POST } = await import("@/app/api/channels/[provider]/accounts/route");
      const res = await POST(
        new Request("http://localhost/api/channels/bluesky/accounts", {
          method: "POST",
          body: JSON.stringify({ handle: "me.bsky.social", appPassword: "abcd-efgh-ijkl-mnop" }),
        }),
        { params: Promise.resolve({ provider: "bluesky" }) },
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
      const { upsertChannelAccount } = await import("@/lib/channel-accounts");
      expect(upsertChannelAccount).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "bluesky", externalId: "did:plc:abc", accessToken: "jwt-a" }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("createSession 401 → 400 + 한국어 안내(원문 미노출)", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "AuthenticationRequired", message: "raw upstream detail" }), { status: 401 })) as unknown as typeof fetch;
    try {
      const { POST } = await import("@/app/api/channels/[provider]/accounts/route");
      const res = await POST(
        new Request("http://localhost/api/channels/bluesky/accounts", { method: "POST", body: JSON.stringify({ handle: "me.bsky.social", appPassword: "wrong" }) }),
        { params: Promise.resolve({ provider: "bluesky" }) },
      );
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).not.toContain("raw upstream detail");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("POST /api/channels/{provider}/accounts/{id}/default", () => {
  it("cross-tenant(notFound) → 404", async () => {
    H.setDefaultResult = { ok: false, notFound: true };
    const { POST } = await import("@/app/api/channels/[provider]/accounts/[id]/default/route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ provider: "threads", id: "acc-other-tenant" }) });
    expect(res.status).toBe(404);
  });

  it("정상 전환 → 200", async () => {
    H.setDefaultResult = { ok: true };
    const { POST } = await import("@/app/api/channels/[provider]/accounts/[id]/default/route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ provider: "threads", id: "acc-1" }) });
    expect(res.status).toBe(200);
  });

  it("계정-API-02 거절: 만료 계정 기본 지정은 사유 코드와 함께 409를 반환한다", async () => {
    H.setDefaultResult = { ok: false, blockedReason: "token_expired" };
    const { POST } = await import("@/app/api/channels/[provider]/accounts/[id]/default/route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ provider: "threads", id: "acc-expired" }) });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json).toEqual({
      error: "토큰이 만료된 계정은 기본 계정으로 지정할 수 없습니다. 다시 연결해 주세요.",
      code: "token_expired",
    });
  });
});

describe("DELETE /api/channels/{provider}/accounts/{id}", () => {
  it("cross-tenant(notFound) → 404", async () => {
    H.deleteResult = { ok: false, notFound: true };
    const { DELETE } = await import("@/app/api/channels/[provider]/accounts/[id]/route");
    const res = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), { params: Promise.resolve({ provider: "threads", id: "acc-other-tenant" }) });
    expect(res.status).toBe(404);
  });

  it("기본계정 삭제 시 승격된 id를 반환", async () => {
    H.deleteResult = { ok: true, promotedId: "acc-2" };
    const { DELETE } = await import("@/app/api/channels/[provider]/accounts/[id]/route");
    const res = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), { params: Promise.resolve({ provider: "threads", id: "acc-1" }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.promotedId).toBe("acc-2");
  });
});
