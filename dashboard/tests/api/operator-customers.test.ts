import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const H = vi.hoisted(() => ({
  customers: [
    {
      id: "tenant-1",
      slug: "customer-one",
      name: "Customer One",
      status: "active",
      tier: "team",
      owner_auth_id: "auth-1",
      created_at: "2026-07-01T00:00:00Z",
      last_accessed_at: null,
      recent_access_days_30: null,
      shared_cli_approved_at: null,
      integrations: [],
      channel_accounts: [
        { provider: "instagram", account_count: 2, default_username: "main", last_connected_at: "2026-07-02T00:00:00Z" },
      ],
      drafts_count: 0,
      published_count: 0,
      failed_count: 0,
      usage_events_count: 0,
      last_usage_at: null,
      shorts_used: 0,
      generations_used: 0,
    },
  ],
  authUsers: [
    {
      id: "auth-1",
      email: "owner@example.com",
      provider: "email",
      created_at: "2026-07-01T00:00:00Z",
      email_confirmed_at: "2026-07-01T00:01:00Z",
      confirmation_sent_at: null,
      last_sign_in_at: "2026-07-02T00:00:00Z",
      tenant_id: "tenant-1",
      tenant_slug: "customer-one",
      tenant_shared_ai_approved_at: null,
    },
  ],
  fetchUrl: "",
  fetchHeaders: {} as Record<string, string>,
  fetchBody: "",
  // pause_user/resume_user/approve_shared_ai/revoke_shared_ai 테스트용 — auth.users 존재 검증 +
  // ensureTenantForUser 경유 UPDATE 추적. status UPDATE와 shared_cli_approved_at UPDATE를
  // 별도 배열로 나눠 관찰한다(계정 게이트와 공유 AI entitlement가 서로 다른 컬럼이라 섞이면 안 됨).
  authUsersById: {} as Record<string, { id: string; email: string | null }>,
  tenantByAuthId: {} as Record<string, { id: string }>,
  newTenantId: "new-tenant-id",
  insertCalls: [] as unknown[][],
  statusUpdateCalls: [] as unknown[][],
  sharedAiUpdateCalls: [] as unknown[][],
  customerQuery: "",
}));

vi.mock("@/lib/db", () => ({
  db: vi.fn(() => async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = Array.from(strings).join(" ");
    if (sql.includes("FROM auth.users WHERE id")) {
      const found = H.authUsersById[String(values[0])];
      return found ? [found] : [];
    }
    if (sql.includes("FROM auth.users")) return H.authUsers;
    if (sql.includes("FROM tenants t")) {
      H.customerQuery = sql;
      return H.customers;
    }
    if (sql.includes("SELECT id FROM tenants WHERE owner_auth_id")) {
      const t = H.tenantByAuthId[String(values[0])];
      return t ? [t] : [];
    }
    if (sql.includes("INSERT INTO tenants")) {
      H.insertCalls.push([sql, ...values]);
      return [{ id: H.newTenantId }];
    }
    if (sql.includes("UPDATE tenants SET status")) {
      H.statusUpdateCalls.push([sql, ...values]);
      return [];
    }
    if (sql.includes("UPDATE tenants SET shared_cli_approved_at")) {
      H.sharedAiUpdateCalls.push([sql, ...values]);
      return [];
    }
    return [];
  }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DASHBOARD_AUTH_TOKEN", "op-token");
  vi.stubEnv("DATABASE_URL", "postgres://test");
  vi.stubEnv("OSMU_SECRET_KEY", "credential-test-key");
  H.fetchUrl = "";
  H.fetchHeaders = {};
  H.fetchBody = "";
  H.authUsersById = {};
  H.tenantByAuthId = {};
  H.insertCalls = [];
  H.statusUpdateCalls = [];
  H.sharedAiUpdateCalls = [];
  H.customerQuery = "";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    H.fetchUrl = String(url);
    H.fetchHeaders = Object.fromEntries(new Headers(init?.headers).entries());
    H.fetchBody = String(init?.body || "");
    return new Response("{}", { status: 200 });
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/api/operator/customers", () => {
  it("운영자 토큰으로 tenants와 auth users를 반환하되 비밀번호 필드는 반환하지 않는다(shared_cli_approved_at 포함)", async () => {
    const { GET } = await import("@/app/api/operator/customers/route");
    const res = await GET(new Request("https://app.example/api/operator/customers", {
      headers: { Authorization: "Bearer op-token" },
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.customers[0].slug).toBe("customer-one");
    expect(body.customers[0]).toHaveProperty("shared_cli_approved_at");
    expect(body.customers[0].last_accessed_at).toBeNull();
    expect(body.customers[0].recent_access_days_30).toBeNull();
    expect(body.authUsers[0].email).toBe("owner@example.com");
    expect(body.authUsers[0]).toHaveProperty("tenant_shared_ai_approved_at");
    expect(body.summary).toEqual(expect.objectContaining({
      authUsers: 1,
      workspaces: 1,
      activeWorkspaces: 1,
      connectedAccounts: 2,
    }));
    expect(H.customerQuery).toContain("ca.status = 'active'");
    expect(H.customerQuery).toContain("FROM tenant_access_events");
    expect(H.customerQuery).toContain("AT TIME ZONE 'UTC'");
    expect(body.oauthProviders).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "x", credentialsConfigured: false }),
      expect.objectContaining({ provider: "facebook", credentialsConfigured: false }),
    ]));
    expect(JSON.stringify(body)).not.toContain("encrypted_password");
    expect(JSON.stringify(body)).not.toContain("password");
    expect(JSON.stringify(body)).not.toContain("op-token");
  }, 15_000);

  it("중앙 OAuth 메타데이터는 정본 공개 origin의 정확한 callback·필수 secret 이름·공식 링크만 반환한다", async () => {
    vi.stubEnv("OSMU_PUBLIC_URL", "https://public.example/");
    vi.stubEnv("YOUTUBE_CLIENT_ID", "secret-client-id-value");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "secret-client-secret-value");
    const { GET } = await import("@/app/api/operator/customers/route");
    const res = await GET(new Request("http://internal:3000/api/operator/customers", {
      headers: {
        Authorization: "Bearer op-token",
        "x-forwarded-host": "forwarded.example",
        "x-forwarded-proto": "https",
      },
    }));
    const body = await res.json();
    const youtube = body.oauthProviders.find((item: { provider: string }) => item.provider === "youtube");

    expect(res.status).toBe(200);
    expect(youtube).toEqual(expect.objectContaining({
      provider: "youtube",
      credentialsConfigured: true,
      callbackUrl: "https://public.example/api/connect/youtube/callback",
      requiredSecrets: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
      consoleUrl: expect.stringMatching(/^https:\/\//),
      docsUrl: expect.stringMatching(/^https:\/\//),
    }));
    expect(JSON.stringify(body)).not.toContain("secret-client-id-value");
    expect(JSON.stringify(body)).not.toContain("secret-client-secret-value");
  });

  it("정본 공개 URL이 없으면 신뢰된 forwarded request origin으로 provider별 callback을 만든다", async () => {
    vi.stubEnv("OSMU_PUBLIC_URL", "");
    const { GET } = await import("@/app/api/operator/customers/route");
    const res = await GET(new Request("http://internal:3000/api/operator/customers", {
      headers: {
        Authorization: "Bearer op-token",
        "x-forwarded-host": "tenant.example",
        "x-forwarded-proto": "https",
      },
    }));
    const body = await res.json();
    const tiktok = body.oauthProviders.find((item: { provider: string }) => item.provider === "tiktok");

    expect(tiktok.callbackUrl).toBe("https://tenant.example/api/connect/tiktok/callback");
    expect(tiktok.requiredSecrets).toEqual(["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"]);
  });

  it("고객 인증은 Google OAuth 전용이라 send_password_reset은 미지원 — 400이고 fetch(메일 발송)는 호출되지 않는다", async () => {
    const { POST } = await import("@/app/api/operator/customers/route");
    const res = await POST(new Request("https://app.example/api/operator/customers", {
      method: "POST",
      headers: { Authorization: "Bearer op-token", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send_password_reset", email: "OWNER@EXAMPLE.COM" }),
    }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/unsupported/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("운영자 토큰이 틀리면 차단한다", async () => {
    const { GET } = await import("@/app/api/operator/customers/route");
    const res = await GET(new Request("https://app.example/api/operator/customers", {
      headers: { Authorization: "Bearer wrong" },
    }));

    expect(res.status).toBe(401);
  });

  it("Authorization 헤더 자체가 없으면 401(빈 문자열은 토큰과 불일치)", async () => {
    const { GET } = await import("@/app/api/operator/customers/route");
    const res = await GET(new Request("https://app.example/api/operator/customers"));

    expect(res.status).toBe(401);
  });

  it("fail-closed: DASHBOARD_AUTH_TOKEN이 미설정이면 헤더 유무와 무관하게 503으로 닫히고 DB에 닿지 않는다(구 fail-open 회귀 방지)", async () => {
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "");
    const { GET } = await import("@/app/api/operator/customers/route");
    const res = await GET(new Request("https://app.example/api/operator/customers", {
      headers: { Authorization: "Bearer anything" },
    }));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toMatch(/not configured/i);
  });

  it("fail-closed: DASHBOARD_AUTH_TOKEN 미설정 시 POST(pause_user)도 503 — tenants UPDATE/INSERT 없음", async () => {
    vi.stubEnv("DASHBOARD_AUTH_TOKEN", "");
    const { POST } = await import("@/app/api/operator/customers/route");
    const res = await POST(new Request("https://app.example/api/operator/customers", {
      method: "POST",
      headers: { Authorization: "Bearer anything", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause_user", user_id: "11111111-1111-1111-1111-111111111111" }),
    }));

    expect(res.status).toBe(503);
    expect(H.statusUpdateCalls.length).toBe(0);
    expect(H.insertCalls.length).toBe(0);
  });
});

const OP_HEADERS = { Authorization: "Bearer op-token", "Content-Type": "application/json" };
const UID = "11111111-1111-1111-1111-111111111111";

async function postAction(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/operator/customers/route");
  const res = await POST(new Request("https://app.example/api/operator/customers", {
    method: "POST",
    headers: OP_HEADERS,
    body: JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json() };
}

describe("/api/operator/customers — pause_user / resume_user (계정 게이트, user_id 키잉)", () => {
  it("pause_user: status='paused'로 UPDATE", async () => {
    H.authUsersById[UID] = { id: UID, email: "target@example.com" };
    H.tenantByAuthId[UID] = { id: "tenant-target" };
    const { status, body } = await postAction({ action: "pause_user", user_id: UID });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("paused");
    expect(body.tenant_id).toBe("tenant-target");
    expect(H.statusUpdateCalls.length).toBe(1);
    expect(H.statusUpdateCalls[0]).toContain("paused");
    expect(H.insertCalls.length).toBe(0); // 기존 테넌트라 INSERT 안 탐
  });

  it("resume_user: status='active'로 UPDATE(정지 해제)", async () => {
    H.authUsersById[UID] = { id: UID, email: "target@example.com" };
    H.tenantByAuthId[UID] = { id: "tenant-target" };
    const { body } = await postAction({ action: "resume_user", user_id: UID });
    expect(body.status).toBe("active");
    expect(H.statusUpdateCalls[0]).toContain("active");
  });

  it("pause_user: 테넌트가 아직 없으면(첫 로그인 전) 멱등하게 active로 생성 후 즉시 paused로 전환", async () => {
    H.authUsersById[UID] = { id: UID, email: "target@example.com" };
    // H.tenantByAuthId에 없음 = 테넌트 미존재
    const { status, body } = await postAction({ action: "pause_user", user_id: UID });
    expect(status).toBe(200);
    expect(body.tenant_id).toBe(H.newTenantId);
    expect(H.insertCalls.length).toBe(1);
    expect(String(H.insertCalls[0][0])).toContain("'active'"); // ensureTenantForUser는 OSMU v1.0.0부터 active로 생성
    expect(String(H.insertCalls[0][0])).not.toContain("'pending'");
    expect(H.statusUpdateCalls[0]).toContain("paused"); // 이후 즉시 paused로 전환
  });

  it("존재하지 않는 user_id → 404, UPDATE/INSERT 없음", async () => {
    // H.authUsersById에 등록 안 함 = auth.users에 없는 것으로 시뮬레이션
    const { status, body } = await postAction({ action: "pause_user", user_id: UID });
    expect(status).toBe(404);
    expect(body.error).toMatch(/unknown/i);
    expect(H.statusUpdateCalls.length).toBe(0);
    expect(H.insertCalls.length).toBe(0);
  });

  it("잘못된 형식의 user_id(email 등) → 400", async () => {
    const { status, body } = await postAction({ action: "pause_user", user_id: "not-a-uuid" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/user_id/);
  });

  it("email 기반 정지/재개는 지원하지 않는다 — user_id 없이 email만 주면 400", async () => {
    const { status } = await postAction({ action: "pause_user", email: "target@example.com" });
    // user_id가 없으므로 400(valid user_id required) — email로 우회 불가
    expect(status).toBe(400);
  });

  it("알 수 없는 action → 400 unsupported action", async () => {
    const { status, body } = await postAction({ action: "delete_everything", email: "a@b.com" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/unsupported/i);
  });

  it("구 승인형 액션(approve_user)은 더 이상 지원하지 않는다 — 4개 user_id 액션 외 전부 unsupported", async () => {
    const { status, body } = await postAction({ action: "approve_user", user_id: UID });
    expect(status).toBe(400);
    expect(body.error).toMatch(/unsupported/i);
    expect(H.statusUpdateCalls.length).toBe(0);
    expect(H.insertCalls.length).toBe(0);
  });

  it("운영자 토큰이 틀리면 pause_user도 401로 차단", async () => {
    const { POST } = await import("@/app/api/operator/customers/route");
    const res = await POST(new Request("https://app.example/api/operator/customers", {
      method: "POST",
      headers: { Authorization: "Bearer wrong", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause_user", user_id: UID }),
    }));
    expect(res.status).toBe(401);
    expect(H.statusUpdateCalls.length).toBe(0);
  });
});

describe("/api/operator/customers — approve_shared_ai / revoke_shared_ai (공유 AI entitlement, 계정 게이트와 분리)", () => {
  it("approve_shared_ai: shared_cli_approved_at을 now()로 UPDATE, status는 건드리지 않는다", async () => {
    H.authUsersById[UID] = { id: UID, email: "target@example.com" };
    H.tenantByAuthId[UID] = { id: "tenant-target" };
    const { status, body } = await postAction({ action: "approve_shared_ai", user_id: UID });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.shared_ai_approved).toBe(true);
    expect(body.tenant_id).toBe("tenant-target");
    expect(H.sharedAiUpdateCalls.length).toBe(1);
    expect(String(H.sharedAiUpdateCalls[0][0])).toContain("now()");
    expect(H.statusUpdateCalls.length).toBe(0);
  });

  it("revoke_shared_ai: shared_cli_approved_at을 NULL로 UPDATE", async () => {
    H.authUsersById[UID] = { id: UID, email: "target@example.com" };
    H.tenantByAuthId[UID] = { id: "tenant-target" };
    const { body } = await postAction({ action: "revoke_shared_ai", user_id: UID });
    expect(body.shared_ai_approved).toBe(false);
    expect(H.sharedAiUpdateCalls.length).toBe(1);
    expect(String(H.sharedAiUpdateCalls[0][0])).toContain("NULL");
    expect(H.statusUpdateCalls.length).toBe(0);
  });

  it("존재하지 않는 user_id → 404, UPDATE/INSERT 없음", async () => {
    const { status, body } = await postAction({ action: "approve_shared_ai", user_id: UID });
    expect(status).toBe(404);
    expect(body.error).toMatch(/unknown/i);
    expect(H.sharedAiUpdateCalls.length).toBe(0);
  });

  it("잘못된 형식의 user_id → 400", async () => {
    const { status, body } = await postAction({ action: "approve_shared_ai", user_id: "not-a-uuid" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/user_id/);
  });

  it("운영자 토큰이 틀리면 approve_shared_ai도 401로 차단", async () => {
    const { POST } = await import("@/app/api/operator/customers/route");
    const res = await POST(new Request("https://app.example/api/operator/customers", {
      method: "POST",
      headers: { Authorization: "Bearer wrong", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve_shared_ai", user_id: UID }),
    }));
    expect(res.status).toBe(401);
    expect(H.sharedAiUpdateCalls.length).toBe(0);
  });
});
