import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// effectiveTenantId 우선순위/fail-closed 회귀. 구버전 버그: 무효 bearer가 조용히
// query fallback(tenant_id)으로 폴스루 — 다른 테넌트 스코프 탈취 가능했다. 이제는
// bearer가 있으면 AuthError(invalid=401 / unavailable=503)를 throw하고 fallback에 닿지 않는다.

const H = vi.hoisted(() => ({
  tokenRow: null as { tenant_id: string } | null,
  dbThrows: false,
  tenantRow: null as { id: string } | null,
  tenantStatus: null as string | null,
  statusThrows: false,
  accessThrows: false,
  accessWriteCalls: [] as unknown[][],
  insertCalls: [] as unknown[][],
}));

vi.mock("@/lib/db", () => ({
  db: vi.fn(() => {
    if (H.dbThrows) throw new Error("DB down");
    return (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join(" ");
      if (text.includes("UPDATE tenant_tokens")) return Promise.resolve([]);
      if (text.includes("FROM tenant_tokens")) return Promise.resolve(H.tokenRow ? [H.tokenRow] : []);
      if (text.includes("SELECT status FROM tenants")) {
        if (H.statusThrows) return Promise.reject(new Error("status DB down"));
        return Promise.resolve(H.tenantStatus ? [{ status: H.tenantStatus }] : []);
      }
      if (text.includes("INSERT INTO tenant_access_events")) {
        H.accessWriteCalls.push([text, ...values]);
        if (H.accessThrows) return Promise.reject(new Error("access ledger unavailable"));
        return Promise.resolve([]);
      }
      if (text.includes("FROM tenants WHERE owner_auth_id")) return Promise.resolve(H.tenantRow ? [H.tenantRow] : []);
      if (text.includes("INSERT INTO tenants")) {
        H.insertCalls.push([text, ...values]);
        return Promise.resolve([H.tenantRow ?? { id: "new-tenant" }]);
      }
      if (text.includes("FROM tenants WHERE domain")) return Promise.resolve([]);
      return Promise.resolve([]);
    };
  }),
}));

const H2 = vi.hoisted(() => ({
  jwtResult: { status: "invalid" as "invalid" | "unavailable" | "valid", user: undefined as unknown },
}));

vi.mock("@/lib/supabase", () => ({
  verifySupabaseJwt: vi.fn(async () => H2.jwtResult),
}));

import { effectiveTenantId, AuthError, resolveTenantToken, ensureTenantForUser } from "@/lib/tenant-auth";
import { verifySupabaseJwt } from "@/lib/supabase";

function reqWith(auth?: string) {
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = `Bearer ${auth}`;
  return new Request("http://localhost/api/queue", { headers });
}

const OP = "operator-secret";

beforeEach(() => {
  H.tokenRow = null;
  H.dbThrows = false;
  H.tenantRow = null;
  H.tenantStatus = null;
  H.statusThrows = false;
  H.accessThrows = false;
  H.accessWriteCalls = [];
  H.insertCalls = [];
  H2.jwtResult = { status: "invalid", user: undefined };
  process.env.DASHBOARD_AUTH_TOKEN = OP;
});

afterEach(() => {
  delete process.env.DASHBOARD_AUTH_TOKEN;
  vi.clearAllMocks();
});

describe("effectiveTenantId — 무효/미인식 bearer", () => {
  it("가짜 JWT(형태만 그럴싸) → AuthError 401", async () => {
    (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "invalid" });
    await expect(effectiveTenantId(reqWith("not.a.real.jwt.at.all"), "tenant-fallback")).rejects.toMatchObject({
      name: "AuthError",
      status: 401,
    });
  });

  it("완전 무작위 bearer(osmu_도 JWT 형태도 아님) → AuthError throw, fallback에 닿지 않음", async () => {
    (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "invalid" });
    await expect(effectiveTenantId(reqWith("garbage-token-xyz"), "tenant-fallback")).rejects.toBeInstanceOf(AuthError);
  });
});

describe("effectiveTenantId — Supabase JWT 경로", () => {
  it("유효 JWT → 매핑된 tenant 반환(공급된 fallback 무시)", async () => {
    (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "valid",
      user: { id: "user-1", email: "a@b.com" },
    });
    H.tenantRow = { id: "tenant-mapped" };
    H.tenantStatus = "active";
    const result = await effectiveTenantId(reqWith("valid.jwt.token"), "tenant-fallback-should-be-ignored");
    expect(result).toBe("tenant-mapped");
  });

  it("Supabase 검증 불가(env/네트워크 장애) → AuthError 503", async () => {
    (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "unavailable" });
    await expect(effectiveTenantId(reqWith("some.jwt.token"), "fallback")).rejects.toMatchObject({
      name: "AuthError",
      status: 503,
    });
  });
});

describe("effectiveTenantId — osmu 테넌트 토큰 경로", () => {
  it("미인식/폐기 osmu 토큰 → AuthError 401", async () => {
    H.tokenRow = null;
    await expect(effectiveTenantId(reqWith("osmu_unknown"), "fallback")).rejects.toMatchObject({
      name: "AuthError",
      status: 401,
    });
  });

  it("DB 장애(resolveTenantToken 실패) → AuthError 503", async () => {
    H.dbThrows = true;
    await expect(effectiveTenantId(reqWith("osmu_xxx"), "fallback")).rejects.toMatchObject({
      name: "AuthError",
      status: 503,
    });
  });

  it("유효 osmu 토큰 → 매핑된 tenant 반환(공급된 fallback 무시)", async () => {
    H.tokenRow = { tenant_id: "tenant-osmu" };
    H.tenantStatus = "active";
    const result = await effectiveTenantId(reqWith("osmu_valid"), "tenant-fallback-should-be-ignored");
    expect(result).toBe("tenant-osmu");
  });

  it("resolveTenantToken 직접 호출도 동일하게 동작(DB 매핑)", async () => {
    H.tokenRow = { tenant_id: "tenant-osmu-2" };
    await expect(resolveTenantToken("osmu_valid2")).resolves.toBe("tenant-osmu-2");
  });
});

describe("effectiveTenantId — 운영자/무인증 fallback 허용 범위", () => {
  it("운영자 토큰 정확일치 → 공급된 fallback 허용(워크스페이스 선택)", async () => {
    const result = await effectiveTenantId(reqWith(OP), "chosen-workspace");
    expect(result).toBe("chosen-workspace");
  });

  it("operator token 미설정 + dev(NODE_ENV!=production) + Authorization 없음 → fallback 허용(auth-disabled dev)", async () => {
    delete process.env.DASHBOARD_AUTH_TOKEN;
    vi.stubEnv("NODE_ENV", "development");
    const result = await effectiveTenantId(reqWith(undefined), "dev-fallback");
    expect(result).toBe("dev-fallback");
    vi.unstubAllEnvs();
  });

  it("operator token 미설정 + prod + OSMU_AUTH_OPTIONAL=1 + Authorization 없음 → fallback 허용", async () => {
    delete process.env.DASHBOARD_AUTH_TOKEN;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OSMU_AUTH_OPTIONAL", "1");
    const result = await effectiveTenantId(reqWith(undefined), "dev-fallback");
    expect(result).toBe("dev-fallback");
    vi.unstubAllEnvs();
  });

  it("operator token 미설정 + dev + Authorization 없음 + fallback도 없음 → null(throw 아님)", async () => {
    delete process.env.DASHBOARD_AUTH_TOKEN;
    vi.stubEnv("NODE_ENV", "development");
    const result = await effectiveTenantId(reqWith(undefined), null);
    expect(result).toBeNull();
    vi.unstubAllEnvs();
  });

  it("[Codex 2nd-pass 반려 수정] production + operator token 설정됨 + Authorization 없음 → fallback 무시, AuthError 401", async () => {
    // process.env.DASHBOARD_AUTH_TOKEN = OP는 beforeEach가 이미 세팅함(운영자 토큰 구성된 prod 상태 재현).
    vi.stubEnv("NODE_ENV", "production");
    await expect(effectiveTenantId(reqWith(undefined), "should-not-leak-to-this-tenant")).rejects.toMatchObject({
      name: "AuthError",
      status: 401,
    });
    vi.unstubAllEnvs();
  });

  it("[회귀] operator token 설정됨 + dev인데도 Authorization 없음 → fallback 여전히 거부(operator 설정=fail-closed 우선)", async () => {
    // operator token이 설정된 이상 NODE_ENV가 dev여도 무인증 fallback을 허용하면 안 된다 —
    // "auth-disabled dev"는 운영자 토큰이 아예 없을 때의 개념이지, dev 환경 자체가 면제부가 아니다.
    vi.stubEnv("NODE_ENV", "development");
    await expect(effectiveTenantId(reqWith(undefined), "fallback")).rejects.toMatchObject({
      name: "AuthError",
      status: 401,
    });
    vi.unstubAllEnvs();
  });
});

describe("ensureTenantForUser — OSMU v1.0.0 공개 대시보드(가입 즉시 active)", () => {
  it("신규 테넌트 생성 시 status='active'로 INSERT(승인 대기 없음 — 공유 AI 승인은 별도 entitlement)", async () => {
    H.tenantRow = null; // SELECT owner_auth_id → 없음(신규)
    await ensureTenantForUser("auth-new", "new@example.com");
    expect(H.insertCalls.length).toBe(1);
    expect(String(H.insertCalls[0][0])).toContain("'active'");
    expect(String(H.insertCalls[0][0])).not.toContain("'pending'");
  });

  it("기존 테넌트(가입 전 생성됨)는 INSERT를 타지 않고 status 그대로 유지", async () => {
    H.tenantRow = { id: "existing-tenant" };
    const id = await ensureTenantForUser("auth-existing", "old@example.com");
    expect(id).toBe("existing-tenant");
    expect(H.insertCalls.length).toBe(0);
  });

  it("TENANT-ACCESS-02 거절: 접속 기록 쓰기가 실패해도 기존 고객 로그인은 테넌트를 반환한다", async () => {
    H.tenantRow = { id: "existing-tenant" };
    H.accessThrows = true;

    await expect(ensureTenantForUser("auth-existing", "old@example.com")).resolves.toBe("existing-tenant");
    expect(H.accessWriteCalls).toHaveLength(1);
  });

  it("TENANT-ACCESS-05 정상: 운영자 계정 조치는 접속 기록을 명시적으로 생략할 수 있다", async () => {
    H.tenantRow = { id: "existing-tenant" };

    await expect(ensureTenantForUser("auth-existing", "old@example.com", { recordAccess: false })).resolves.toBe("existing-tenant");
    expect(H.accessWriteCalls).toHaveLength(0);
  });
});

describe("effectiveTenantId — 계정 게이트(paused/unavailable → 403, active는 통과)", () => {
  it("JWT 유효 + 레거시 pending 테넌트(신규 가입은 더 이상 이 값을 안 씀) → AuthError 403 account_unavailable(fail-closed, approval_required 분기는 제거됨)", async () => {
    (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "valid",
      user: { id: "user-pending", email: "p@b.com" },
    });
    H.tenantRow = { id: "tenant-pending" };
    H.tenantStatus = "pending";
    await expect(effectiveTenantId(reqWith("valid.jwt.token"))).rejects.toMatchObject({
      name: "AuthError",
      status: 403,
      code: "account_unavailable",
    });
  });

  it("JWT 유효 + paused 테넌트 → AuthError 403 account_paused", async () => {
    (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "valid",
      user: { id: "user-paused", email: "pa@b.com" },
    });
    H.tenantRow = { id: "tenant-paused" };
    H.tenantStatus = "paused";
    await expect(effectiveTenantId(reqWith("valid.jwt.token"))).rejects.toMatchObject({
      name: "AuthError",
      status: 403,
      code: "account_paused",
    });
  });

  it("JWT 유효 + active 테넌트 → 정상 통과(tenantId 반환)", async () => {
    (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "valid",
      user: { id: "user-active", email: "a@b.com" },
    });
    H.tenantRow = { id: "tenant-active" };
    H.tenantStatus = "active";
    const result = await effectiveTenantId(reqWith("valid.jwt.token"));
    expect(result).toBe("tenant-active");
  });

  it("allowInactive:true면 pending이어도 403 없이 tenantId 반환(/api/me 전용 경로)", async () => {
    (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "valid",
      user: { id: "user-pending2", email: "p2@b.com" },
    });
    H.tenantRow = { id: "tenant-pending2" };
    H.tenantStatus = "pending";
    const result = await effectiveTenantId(reqWith("valid.jwt.token"), null, { allowInactive: true });
    expect(result).toBe("tenant-pending2");
  });

  it("status 조회 DB 장애 → AuthError 503(승인 판정 불가는 401/403으로 오분류 금지)", async () => {
    (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "valid",
      user: { id: "user-x", email: "x@b.com" },
    });
    H.tenantRow = { id: "tenant-x" };
    H.statusThrows = true;
    await expect(effectiveTenantId(reqWith("valid.jwt.token"))).rejects.toMatchObject({
      name: "AuthError",
      status: 503,
    });
  });

  it("osmu 토큰 + 레거시 pending 테넌트 → AuthError 403 account_unavailable(fail-closed)", async () => {
    H.tokenRow = { tenant_id: "tenant-osmu-pending" };
    H.tenantStatus = "pending";
    await expect(effectiveTenantId(reqWith("osmu_valid"))).rejects.toMatchObject({
      name: "AuthError",
      status: 403,
      code: "account_unavailable",
    });
  });

  it("운영자 토큰 경로는 승인 게이트 영향 없음(fallback 그대로 반환)", async () => {
    H.tenantStatus = "pending"; // 운영자는 이 값을 아예 조회하지 않는다
    const result = await effectiveTenantId(reqWith(OP), "chosen-workspace");
    expect(result).toBe("chosen-workspace");
  });

  it("[Codex 2nd-pass 반려 수정] status=null(테넌트 행 없음/알수없음) → fail-closed 403 account_unavailable(통과 금지)", async () => {
    (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "valid",
      user: { id: "user-null-status", email: "n@b.com" },
    });
    H.tenantRow = { id: "tenant-null-status" };
    H.tenantStatus = null;
    await expect(effectiveTenantId(reqWith("valid.jwt.token"))).rejects.toMatchObject({
      name: "AuthError",
      status: 403,
      code: "account_unavailable",
    });
  });

  it("[Codex 2nd-pass 반려 수정] status='trial'처럼 알 수 없는 값 → fail-closed 403 account_unavailable", async () => {
    H.tokenRow = { tenant_id: "tenant-weird-status" };
    H.tenantStatus = "trial";
    await expect(effectiveTenantId(reqWith("osmu_valid"))).rejects.toMatchObject({
      name: "AuthError",
      status: 403,
      code: "account_unavailable",
    });
  });
});
