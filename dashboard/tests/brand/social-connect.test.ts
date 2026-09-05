import { describe, it, expect, beforeEach, vi } from "vitest";

// (B) 소셜 OAuth "연결" E2E — 고객이 비번 없이 버튼만 → 우리가 토큰 받아 테넌트별 저장(ADR-004).
// auth-url 구성 + callback 토큰교환·integrations 저장 분기를 박제. 라이브 OAuth는 Meta 앱 redirect URI
// 등록 + 배포 필요(미검증으로 명시) — 여기선 로직/저장 계약을 mock으로 검증.

const H = vi.hoisted(() => ({
  tenantId: "tenant-1" as string | null,
  inserts: [] as unknown[][],
  fetchSeq: [] as Array<{ status: number; body: unknown }>,
  fetchCalls: [] as string[],
  identityError: "",
  reconnected: false,
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async (_r: Request, fb?: string | null) => H.tenantId ?? fb ?? null),
}));

vi.mock("@/lib/db", () => ({
  db: vi.fn(() => Object.assign(
    async () => [],
    { json: (value: unknown) => value },
  )),
  withTenant: vi.fn(async (_t: string, cb: (sql: unknown) => unknown) => {
    const sql = Object.assign(
      (_s: TemplateStringsArray, ...vals: unknown[]) => { H.inserts.push(vals); return Promise.resolve([]); },
      { json: (v: unknown) => v },
    );
    return cb(sql);
  }),
}));

// SNS-007: callback route는 이제 integrations를 직접 INSERT하지 않고 channel-accounts.ts의
// upsertChannelAccount(channel_accounts에 저장) → isDefault면 syncLegacyIntegration(legacy 미러링)을
// 거친다. 이 테스트 파일은 callback route의 "provider별 토큰교환·state 검증" 로직만 검증하는
// 것이 목적이라(channel-accounts.ts 내부 SQL 시퀀스 자체는 tests/api/channel-accounts.test.ts +
// tests/lib/channel-accounts.test.ts가 별도로 커버) — 여기선 channel-accounts.ts를 모킹해
// upsertChannelAccount에 전달된 input을 그대로 H.inserts에 기록한다(기존 "integrations INSERT값"
// 검증 assertion들과 동일한 형태 유지). resolveExternalIdentity는 실 네트워크 호출 없이
// fallbackUserId를 그대로 externalId로 반환(테스트가 이미 통제하는 tok.userId 값 보존).
vi.mock("@/lib/channel-accounts", () => ({
  resolveExternalIdentity: vi.fn(async (_provider: string, _token: string, fallbackUserId?: string, tenantId?: string) => {
    if (H.identityError) throw new Error(H.identityError);
    return { externalId: fallbackUserId || `legacy-test-${tenantId || "unknown"}` };
  }),
  upsertChannelAccount: vi.fn(async (input: Record<string, unknown>) => {
    H.inserts.push([input]);
    return { id: `acc-${H.inserts.length}`, isDefault: true, reconnected: H.reconnected };
  }),
  syncLegacyIntegration: vi.fn(async () => {}),
}));

function params(provider: string) { return { params: Promise.resolve({ provider }) }; }

// callback route가 서명(HMAC)·provider 바인딩된 state만 신뢰하므로(Critical/Major 하드닝,
// 2026-07-10), 아래 callback 테스트들은 평문 state 대신 이 헬퍼로 만든 signed state를 쓴다.
async function signedState(tenantId: string, provider: string): Promise<string> {
  const { signState } = await import("@/lib/social-connect");
  return signState(tenantId, provider);
}

function callbackRequest(provider: string, state: string, code: string, extraCookies: string[] = []): Request {
  const cookies = [
    `oauth_state_${provider}=${encodeURIComponent(state)}`,
    ...extraCookies,
  ];
  return new Request(
    `https://app.example/api/connect/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    { headers: { cookie: cookies.join("; ") } },
  );
}

function expectOAuthCallbackCookies(response: Response, provider: "x" | "tiktok", maxAge: "0" | "600") {
  const cookies = response.headers.getSetCookie();
  const expectedNames = [`oauth_state_${provider}`, `pkce_${provider}`];
  expect(cookies).toHaveLength(2);
  for (const name of expectedNames) {
    const cookie = cookies.find((value) => value.startsWith(`${name}=`));
    expect(cookie).toBeDefined();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain(`Max-Age=${maxAge}`);
    expect(cookie).toContain(`Path=/api/connect/${provider}/callback`);
    expect(cookie).toContain("Secure");
  }
}

function expectExpiredCallbackCookies(response: Response, provider: "x" | "tiktok") {
  expectOAuthCallbackCookies(response, provider, "0");
}

beforeEach(() => {
  vi.resetModules();
  H.tenantId = "tenant-1";
  H.inserts = [];
  H.fetchCalls = [];
  H.identityError = "";
  H.reconnected = false;
  H.fetchSeq = [
    { status: 200, body: { access_token: "SHORT", user_id: 17841400000000001 } }, // 단기
    { status: 200, body: { access_token: "LONGLIVED60D", expires_in: 5_184_000 } }, // 장기
  ];
  process.env.IG_APP_ID = "ig-app-123";
  process.env.IG_APP_SECRET = "ig-secret";
  process.env.THREADS_APP_ID = "th-app-456";
  process.env.THREADS_APP_SECRET = "th-secret";
  process.env.OSMU_SECRET_KEY = "enc-key";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    H.fetchCalls.push(String(url));
    const n = H.fetchSeq.shift() || { status: 200, body: {} };
    return new Response(JSON.stringify(n.body), { status: n.status });
  }));
});

describe("GET /api/connect/instagram — OAuth 동의 URL", () => {
  it("META-SCOPE-001 정상: 첫 심사에 필요한 Instagram 연결·발행·댓글 권한을 요청한다", async () => {
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/instagram?tenant_id=tenant-1"), params("instagram"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.authUrl).toContain("instagram.com/oauth/authorize");
    expect(body.authUrl).toContain("client_id=ig-app-123");
    expect(body.authUrl).toContain("instagram_business_basic");
    expect(body.authUrl).toContain("instagram_business_content_publish");
    expect(body.authUrl).toContain("instagram_business_manage_comments");
    // state는 이제 base64url(payload).sig로 서명되어 있어 "tenant-1"이 그대로 노출되지 않는다 —
    // verifyState로 왕복 복원해 tenantId가 맞는지 확인한다.
    const { verifyState } = await import("@/lib/social-connect");
    const state = new URL(body.authUrl).searchParams.get("state")!;
    const verified = await verifyState(state, "instagram");
    expect(verified.valid).toBe(true);
    expect(verified.tenantId).toBe("tenant-1");
    expect(body.authUrl).toContain("api%2Fconnect%2Finstagram%2Fcallback");
  });

  it("META-SCOPE-002 거절: 실제 조회 기능이 없는 Instagram 인사이트 권한은 요청하지 않는다", async () => {
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/instagram?tenant_id=tenant-1"), params("instagram"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(new URL(body.authUrl).searchParams.get("scope")).not.toContain("instagram_business_manage_insights");
  });

  it("고객 JWT tenant와 쿼리 tenant_id가 다르면 값 없이 불일치 사실만 서버 로그에 남긴다", async () => {
    H.tenantId = "tenant-from-customer-jwt";
    const customerJwt = `${"a".repeat(24)}.${"b".repeat(24)}.${"c".repeat(24)}`;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { GET } = await import("@/app/api/connect/[provider]/route");

    const res = await GET(new Request(
      "https://app.example/api/connect/instagram?tenant_id=tenant-from-query",
      { headers: { Authorization: `Bearer ${customerJwt}` } },
    ), params("instagram"));

    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(
      JSON.stringify({ kind: "oauth_connect_tenant_mismatch", customerJwt: true }),
    );
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).not.toContain("tenant-from-customer-jwt");
    expect(logged).not.toContain("tenant-from-query");
    expect(logged).not.toContain(customerJwt);
  });

  // 리버스 프록시 뒤 "Invalid redirect_uri" 회귀 방지(2026-07-03 실측: request.url이 0.0.0.0:PORT).
  it("OSMU_PUBLIC_URL 설정 시 redirect_uri가 내부 request host가 아닌 공개 URL을 쓴다", async () => {
    process.env.OSMU_PUBLIC_URL = "https://live.example";
    const { GET } = await import("@/app/api/connect/[provider]/route");
    // request.url은 내부 bind처럼 0.0.0.0:18789 — 여기 새면 Meta 등록값과 불일치.
    const res = await GET(new Request("http://0.0.0.0:18789/api/connect/instagram?tenant_id=tenant-1"), params("instagram"));
    const body = await res.json();
    expect(body.authUrl).toContain(encodeURIComponent("https://live.example/api/connect/instagram/callback"));
    expect(body.authUrl).not.toContain("0.0.0.0");
    delete process.env.OSMU_PUBLIC_URL;
  });

  it("OSMU_PUBLIC_URL 없으면 x-forwarded-host/proto로 공개 origin 복원", async () => {
    delete process.env.OSMU_PUBLIC_URL;
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const req = new Request("http://0.0.0.0:18789/api/connect/instagram?tenant_id=tenant-1", {
      headers: { "x-forwarded-host": "live.example", "x-forwarded-proto": "https" },
    });
    const res = await GET(req, params("instagram"));
    const body = await res.json();
    expect(body.authUrl).toContain(encodeURIComponent("https://live.example/api/connect/instagram/callback"));
    expect(body.authUrl).not.toContain("0.0.0.0");
  });

  it("지원하지 않는 provider → 400", async () => {
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/myspace?tenant_id=tenant-1"), params("myspace"));
    expect(res.status).toBe(400);
  });

  it("Object.prototype 이름도 지원하지 않는 provider로 거부한다", async () => {
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/toString?tenant_id=tenant-1"), params("toString"));
    expect(res.status).toBe(400);
  });

  // Regression: API-READ-20260829-01. OAuth 설정 부재를 서버 고장으로 오분류했다.
  // Found by /qa on 2026-08-29
  // Report: docs/audit/openclaw-api-live-sweep-2026-08-29.md
  it("IG_APP_ID 미설정 → 503", async () => {
    delete process.env.IG_APP_ID;
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/instagram?tenant_id=tenant-1"), params("instagram"));
    expect(res.status).toBe(503);
  });
});

describe("GET /api/connect/threads — reply 권한", () => {
  it("THREADS_APP_ID 미설정은 서버 고장이 아니라 준비 안 됨으로 답한다", async () => {
    delete process.env.THREADS_APP_ID;
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/threads?tenant_id=tenant-1"), params("threads"));
    expect(res.status).toBe(503);
  });

  it("BE-V63-11 정상 경로: authUrl에 댓글 읽기와 답글 발행 권한을 포함한다", async () => {
    process.env.THREADS_APP_ID = "threads-app-1";
    process.env.THREADS_APP_SECRET = "threads-secret-1";
    const { buildAuthUrl, getProvider } = await import("@/lib/social-connect");
    const url = await buildAuthUrl(getProvider("threads")!, "https://app.example", "threads", "tenant-1");
    expect(url).toContain("threads_read_replies");
    expect(url).toContain("threads_manage_replies");
    delete process.env.THREADS_APP_ID;
    delete process.env.THREADS_APP_SECRET;
  });
});

describe("GET /api/connect/instagram/callback — 토큰교환·저장", () => {
  it("code+state → 단기→장기 토큰 교환 후 integrations에 저장", async () => {
    const startedAt = Date.now();
    const state = await signedState("tenant-1", "instagram");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      callbackRequest("instagram", state, "AUTHCODE"),
      params("instagram"),
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/연결 완료/);
    // 단기+장기 두 번 호출
    expect(H.fetchCalls.length).toBe(2);
    expect(H.fetchCalls[0]).toContain("api.instagram.com/oauth/access_token");
    expect(H.fetchCalls[1]).toContain("graph.instagram.com/access_token");
    // 장기토큰이 저장됨(단기 아님)
    expect(H.inserts).toHaveLength(1);
    expect(JSON.stringify(H.inserts[0])).toContain("LONGLIVED60D");
    const input = H.inserts[0][0] as Record<string, unknown>;
    const expiresAt = new Date(String(input.tokenExpiresAt)).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(startedAt + 5_184_000_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 5_184_000_000 + 1_000);
  });

  it("채널-재연결-03 정상: 기존 계정 갱신이면 사용자에게 연결 새로 고침 결과를 알린다", async () => {
    H.reconnected = true;
    const state = await signedState("tenant-1", "instagram");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      callbackRequest("instagram", state, "AUTHCODE"),
      params("instagram"),
    );

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("연결을 새로 고쳤습니다");
    expect(html).not.toContain("연결 실패");
  });

  it("장기 토큰 교환이 실패하면 단기 토큰을 active 계정으로 저장하지 않는다", async () => {
    H.fetchSeq = [
      { status: 200, body: { access_token: "SHORT", user_id: "thread-user" } },
      { status: 400, body: { error: { message: "invalid exchange" } } },
    ];
    const state = await signedState("tenant-1", "threads");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(callbackRequest("threads", state, "THCODE"), params("threads"));

    expect(await res.text()).toMatch(/연결 실패/);
    expect(H.inserts).toHaveLength(0);
  });

  it("/me 신원 검증이 실패하면 active 계정을 저장하지 않는다", async () => {
    H.identityError = "Threads 계정 검증 실패";
    const state = await signedState("tenant-1", "threads");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(callbackRequest("threads", state, "THCODE"), params("threads"));

    expect(await res.text()).toMatch(/연결 실패/);
    expect(H.inserts).toHaveLength(0);
  });

  it("threads — graph.threads.net로 교환 후 저장(같은 코드 경로)", async () => {
    const state = await signedState("tenant-1", "threads");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      callbackRequest("threads", state, "THCODE"),
      params("threads"),
    );
    expect(res.status).toBe(200);
    expect(H.fetchCalls[0]).toContain("graph.threads.net/oauth/access_token");
    expect(H.fetchCalls[1]).toContain("graph.threads.net/access_token");
    expect(JSON.stringify(H.inserts[0])).toContain("threads");
  });

  it("facebook — user→장기→/me/accounts 페이지 토큰 저장", async () => {
    H.fetchSeq = [
      { status: 200, body: { access_token: "FB_USER" } },               // user token
      { status: 200, body: { access_token: "FB_USER_LONG", expires_in: 5_184_000 } }, // 장기 user
      { status: 200, body: { data: [{ access_token: "PAGE_TOKEN", id: "990011" }] } }, // pages
    ];
    process.env.FB_APP_ID = "fb-app";
    process.env.FB_APP_SECRET = "fb-secret";
    process.env.FB_CONFIG_ID = "fb-config";
    const state = await signedState("tenant-1", "facebook");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      callbackRequest("facebook", state, "FBCODE"),
      params("facebook"),
    );
    expect(res.status).toBe(200);
    expect(H.fetchCalls[2]).toContain("/me/accounts");
    // 페이지 토큰이 저장됨(user 토큰 아님)
    expect(JSON.stringify(H.inserts[0])).toContain("PAGE_TOKEN");
    expect(JSON.stringify(H.inserts[0])).toContain("990011");
    delete process.env.FB_APP_ID;
    delete process.env.FB_APP_SECRET;
    delete process.env.FB_CONFIG_ID;
  });

  it("state(tenant) 누락 → 저장 안 함", async () => {
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      new Request("https://app.example/api/connect/instagram/callback?code=AUTHCODE"),
      params("instagram"),
    );
    const html = await res.text();
    expect(html).toMatch(/연결 실패/);
    expect(H.inserts).toHaveLength(0);
  });
});

// 비즈니스용 Facebook 로그인(Facebook Login for Business) = authorize에 scope 대신 config_id.
// 근거: developers.facebook.com/documentation/facebook-login/facebook-login-for-business
describe("Facebook Login for Business — config_id authorize URL", () => {
  it("buildAuthUrl(facebook)는 scope가 아니라 config_id를 넣는다", async () => {
    process.env.FB_APP_ID = "fb-app-1";
    process.env.FB_APP_SECRET = "fb-secret-1";
    process.env.FB_CONFIG_ID = "cfg-777";
    const { buildAuthUrl, getProvider } = await import("@/lib/social-connect");
    const cfg = getProvider("facebook")!;
    const url = (await buildAuthUrl(cfg, "https://live.example", "facebook", "tenant-1"))!;
    expect(url).toContain("facebook.com/v21.0/dialog/oauth");
    expect(url).toContain("config_id=cfg-777");
    expect(url).toContain("response_type=code");
    expect(url).toContain("state=tenant-1");
    expect(url).toContain(encodeURIComponent("https://live.example/api/connect/facebook/callback"));
    // config_id 모델은 scope를 보내지 않는다
    expect(url).not.toContain("scope=");
    expect(url).not.toContain("pages_manage_posts");
    delete process.env.FB_APP_SECRET;
    delete process.env.FB_CONFIG_ID;
  });

  it("FB_CONFIG_ID 없으면 buildAuthUrl(facebook)=null", async () => {
    process.env.FB_APP_ID = "fb-app-1";
    delete process.env.FB_CONFIG_ID;
    const { buildAuthUrl, getProvider } = await import("@/lib/social-connect");
    const cfg = getProvider("facebook")!;
    expect(await buildAuthUrl(cfg, "https://live.example", "facebook", "tenant-1")).toBeNull();
  });

  it("GET /api/connect/facebook — FB_CONFIG_ID 미설정 시 503 + 안내 메시지", async () => {
    process.env.FB_APP_ID = "fb-app-1";
    delete process.env.FB_CONFIG_ID;
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/facebook?tenant_id=tenant-1"), params("facebook"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("FB_CONFIG_ID");
  });

  it("GET /api/connect/facebook — config_id 설정 시 authUrl 반환", async () => {
    process.env.FB_APP_ID = "fb-app-1";
    process.env.FB_APP_SECRET = "fb-secret-1";
    process.env.FB_CONFIG_ID = "cfg-777";
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/facebook?tenant_id=tenant-1"), params("facebook"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authUrl).toContain("config_id=cfg-777");
    expect(body.authUrl).not.toContain("scope=");
    delete process.env.FB_APP_SECRET;
    delete process.env.FB_CONFIG_ID;
  });
});

// ── 새 채널 — OAuth authUrl 구조 검증 ──────────────────────────────────────

describe("GET /api/connect/linkedin — authUrl", () => {
  it("scope·state·redirect_uri 포함, space 구분자", async () => {
    process.env.LINKEDIN_CLIENT_ID = "li-client";
    process.env.LINKEDIN_CLIENT_SECRET = "li-secret";
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/linkedin?tenant_id=tenant-1"), params("linkedin"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.authUrl).toContain("linkedin.com/oauth/v2/authorization");
    const { verifyState } = await import("@/lib/social-connect");
    const state = new URL(body.authUrl).searchParams.get("state")!;
    const verified = await verifyState(state, "linkedin");
    expect(verified.valid).toBe(true);
    expect(verified.tenantId).toBe("tenant-1");
    // space-separated scopes
    expect(body.authUrl).toContain("w_member_social");
    expect(body.authUrl).toContain("openid");
    delete process.env.LINKEDIN_CLIENT_ID;
    delete process.env.LINKEDIN_CLIENT_SECRET;
  });

  it("LINKEDIN_CLIENT_ID 미설정 → 503", async () => {
    delete process.env.LINKEDIN_CLIENT_ID;
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/linkedin?tenant_id=tenant-1"), params("linkedin"));
    expect(res.status).toBe(503);
  });
});

describe("GET /api/connect/youtube — access_type=offline", () => {
  it("access_type=offline·prompt=consent 포함(refresh_token 취득용)", async () => {
    process.env.YOUTUBE_CLIENT_ID = "yt-client";
    process.env.YOUTUBE_CLIENT_SECRET = "yt-secret";
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/youtube?tenant_id=tenant-1"), params("youtube"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.authUrl).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(body.authUrl).toContain("access_type=offline");
    expect(body.authUrl).toContain("prompt=consent");
    expect(body.authUrl).toContain("youtube.upload");
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
  });

  it("YOUTUBE_CLIENT_ID 미설정 → 503", async () => {
    delete process.env.YOUTUBE_CLIENT_ID;
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/youtube?tenant_id=tenant-1"), params("youtube"));
    expect(res.status).toBe(503);
  });
});

describe("GET /api/connect/naver_blog — authUrl", () => {
  it("naver 인증 URL 반환", async () => {
    process.env.NAVER_CLIENT_ID = "nv-id";
    process.env.NAVER_CLIENT_SECRET = "nv-secret";
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/naver_blog?tenant_id=tenant-1"), params("naver_blog"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.authUrl).toContain("nid.naver.com/oauth2.0/authorize");
    delete process.env.NAVER_CLIENT_ID;
    delete process.env.NAVER_CLIENT_SECRET;
  });
});

// ── PKCE 채널 — X·TikTok ────────────────────────────────────────────────────

describe("GET /api/connect/x — PKCE", () => {
  it("authUrl에 code_challenge·code_challenge_method=S256 포함", async () => {
    process.env.X_CLIENT_ID = "x-client-123";
    process.env.X_CLIENT_SECRET = "x-secret";
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/x?tenant_id=tenant-1"), params("x"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.authUrl).toContain("twitter.com/i/oauth2/authorize");
    expect(body.authUrl).toContain("code_challenge=");
    expect(body.authUrl).toContain("code_challenge_method=S256");
    const { verifyState } = await import("@/lib/social-connect");
    const state = new URL(body.authUrl).searchParams.get("state")!;
    const verified = await verifyState(state, "x");
    expect(verified.valid).toBe(true);
    expect(verified.tenantId).toBe("tenant-1");
    // X scopes: space-separated
    expect(body.authUrl).toContain("tweet.read");
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
  });

  it("PKCE verifier와 state 쿠키를 별도 Set-Cookie 헤더로 발급한다", async () => {
    process.env.X_CLIENT_ID = "x-client-123";
    process.env.X_CLIENT_SECRET = "x-secret";
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/x?tenant_id=tenant-1"), params("x"));
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.find((cookie) => cookie.startsWith("pkce_x="))).toContain("HttpOnly");
    expect(cookies.find((cookie) => cookie.startsWith("pkce_x="))).toContain("Max-Age=600");
    expect(cookies.find((cookie) => cookie.startsWith("oauth_state_x="))).toContain("HttpOnly");
    expect(cookies.find((cookie) => cookie.startsWith("oauth_state_x="))).toContain("Max-Age=600");
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
  });

  it("X_CLIENT_ID 미설정 → 503", async () => {
    delete process.env.X_CLIENT_ID;
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/x?tenant_id=tenant-1"), params("x"));
    expect(res.status).toBe(503);
  });
});

describe("GET /api/connect/tiktok — PKCE", () => {
  it("authUrl에 explicit re-authorization·code_challenge 포함, PKCE/state 쿠키를 별도 보안 헤더로 발급", async () => {
    process.env.TIKTOK_CLIENT_KEY = "tt-key";
    process.env.TIKTOK_CLIENT_SECRET = "tt-secret";
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(new Request("https://app.example/api/connect/tiktok?tenant_id=tenant-1"), params("tiktok"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.authUrl).toContain("tiktok.com");
    const authUrl = new URL(body.authUrl);
    expect(authUrl.searchParams.get("client_key")).toBe("tt-key");
    expect(authUrl.searchParams.has("client_id")).toBe(false);
    expect(authUrl.searchParams.get("disable_auto_auth")).toBe("1");
    expect(body.authUrl).toContain("code_challenge=");
    expectOAuthCallbackCookies(res, "tiktok", "600");
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
  });
});

// ── exchangeCode — 표준 OAuth 채널 단위 테스트 ──────────────────────────────

describe("exchangeCode — PKCE (code_verifier POST body 포함)", () => {
  it("TikTok token 교환은 client_key와 open_id를 사용한다", async () => {
    process.env.TIKTOK_CLIENT_KEY = "tt-key";
    process.env.TIKTOK_CLIENT_SECRET = "tt-secret";
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = String(init?.body || "");
      return new Response(JSON.stringify({ access_token: "TT_ACCESS", open_id: "tt-user-1" }), { status: 200 });
    }));
    const { exchangeCode } = await import("@/lib/social-connect");
    const result = await exchangeCode("tiktok", "TTCODE", "https://app.example", { codeVerifier: "VERIFIER" });
    expect(result).toMatchObject({ accessToken: "TT_ACCESS", userId: "tt-user-1" });
    expect(capturedBody).toContain("client_key=tt-key");
    expect(capturedBody).not.toContain("client_id=");
    expect(capturedBody).toContain("code_verifier=VERIFIER");
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
  });

  it("options.codeVerifier가 POST body에 code_verifier로 포함됨", async () => {
    process.env.X_CLIENT_ID = "x-client-id";
    process.env.X_CLIENT_SECRET = "x-secret";
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = (init?.body as string) || "";
      return new Response(JSON.stringify({ access_token: "X_ACCESS_TOKEN" }), { status: 200 });
    }));
    const { exchangeCode } = await import("@/lib/social-connect");
    const result = await exchangeCode("x", "XCODE", "https://app.example", { codeVerifier: "MY_VERIFIER_VALUE" });
    expect(result.accessToken).toBe("X_ACCESS_TOKEN");
    expect(capturedBody).toContain("code_verifier=MY_VERIFIER_VALUE");
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
  });

  it("codeVerifier 없으면 code_verifier body에 포함 안 됨(비PKCE 채널 정합)", async () => {
    process.env.LINKEDIN_CLIENT_ID = "li-id";
    process.env.LINKEDIN_CLIENT_SECRET = "li-secret";
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = (init?.body as string) || "";
      return new Response(JSON.stringify({ access_token: "LI_TOKEN" }), { status: 200 });
    }));
    const { exchangeCode } = await import("@/lib/social-connect");
    const result = await exchangeCode("linkedin", "LICODE", "https://app.example");
    expect(result.accessToken).toBe("LI_TOKEN");
    expect(capturedBody).not.toContain("code_verifier");
    delete process.env.LINKEDIN_CLIENT_ID;
    delete process.env.LINKEDIN_CLIENT_SECRET;
  });
});

describe("exchangeCode — YouTube refresh_token", () => {
  it("YouTube authorize URL이 매번 Google 계정 선택을 요구한다", async () => {
    process.env.YOUTUBE_CLIENT_ID = "yt-client";
    process.env.YOUTUBE_CLIENT_SECRET = "yt-secret";
    const { buildAuthUrl, getProvider } = await import("@/lib/social-connect");
    const url = new URL((await buildAuthUrl(getProvider("youtube")!, "https://app.example", "youtube", "state-1"))!);
    expect(url.searchParams.get("prompt")).toBe("consent select_account");
    expect(url.searchParams.get("access_type")).toBe("offline");
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
  });

  it("응답의 refresh_token을 ExchangedToken.refreshToken으로 반환", async () => {
    process.env.YOUTUBE_CLIENT_ID = "yt-client";
    process.env.YOUTUBE_CLIENT_SECRET = "yt-secret";
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "YT_ACCESS", refresh_token: "YT_REFRESH", expires_in: 3600 }), { status: 200 }),
    ));
    const { exchangeCode } = await import("@/lib/social-connect");
    const result = await exchangeCode("youtube", "YTCODE", "https://app.example");
    expect(result.accessToken).toBe("YT_ACCESS");
    expect(result.refreshToken).toBe("YT_REFRESH");
    expect(result.expiresInSeconds).toBe(3600);
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
  });

  it("refresh_token 없으면 refreshToken=undefined", async () => {
    process.env.YOUTUBE_CLIENT_ID = "yt-client";
    process.env.YOUTUBE_CLIENT_SECRET = "yt-secret";
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "YT_ACCESS_ONLY" }), { status: 200 }),
    ));
    const { exchangeCode } = await import("@/lib/social-connect");
    const result = await exchangeCode("youtube", "YTCODE", "https://app.example");
    expect(result.accessToken).toBe("YT_ACCESS_ONLY");
    expect(result.refreshToken).toBeUndefined();
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
  });
});

describe("exchangeCode — Slack authed_user.access_token fallback", () => {
  it("top-level access_token 우선", async () => {
    process.env.SLACK_CLIENT_ID = "sl-id";
    process.env.SLACK_CLIENT_SECRET = "sl-secret";
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "SLACK_BOT_TOKEN" }), { status: 200 }),
    ));
    const { exchangeCode } = await import("@/lib/social-connect");
    const result = await exchangeCode("slack", "SLCODE", "https://app.example");
    expect(result.accessToken).toBe("SLACK_BOT_TOKEN");
    delete process.env.SLACK_CLIENT_ID;
    delete process.env.SLACK_CLIENT_SECRET;
  });

  it("top-level 없으면 authed_user.access_token fallback", async () => {
    process.env.SLACK_CLIENT_ID = "sl-id";
    process.env.SLACK_CLIENT_SECRET = "sl-secret";
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ authed_user: { access_token: "SLACK_USER_TOKEN" } }), { status: 200 }),
    ));
    const { exchangeCode } = await import("@/lib/social-connect");
    const result = await exchangeCode("slack", "SLCODE", "https://app.example");
    expect(result.accessToken).toBe("SLACK_USER_TOKEN");
    delete process.env.SLACK_CLIENT_ID;
    delete process.env.SLACK_CLIENT_SECRET;
  });

  it("SLACK_CLIENT_ID 미설정 → error 반환", async () => {
    delete process.env.SLACK_CLIENT_ID;
    const { exchangeCode } = await import("@/lib/social-connect");
    const result = await exchangeCode("slack", "SLCODE", "https://app.example");
    expect(result.accessToken).toBe("");
    expect(result.error).toContain("SLACK_CLIENT_ID");
    delete process.env.SLACK_CLIENT_SECRET;
  });
});

// ── callback route — 새 채널 저장 검증 ─────────────────────────────────────

describe("GET /api/connect/youtube/callback — refresh_token 암호화 저장", () => {
  it("refresh_token은 upsert의 전용 인자로 전달되고 meta에는 포함되지 않는다", async () => {
    process.env.YOUTUBE_CLIENT_ID = "yt-client";
    process.env.YOUTUBE_CLIENT_SECRET = "yt-secret";
    H.fetchSeq = [{ status: 200, body: { access_token: "YT_ACCESS", refresh_token: "YT_REFRESH", expires_in: 3600 } }];
    const state = await signedState("tenant-1", "youtube");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      callbackRequest("youtube", state, "YTCODE"),
      params("youtube"),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/연결 완료/);
    expect(H.inserts).toHaveLength(1);
    const input = H.inserts[0][0] as Record<string, unknown>;
    expect(input.refreshToken).toBe("YT_REFRESH");
    expect(input.provider).toBe("youtube");
    expect(input.meta).not.toHaveProperty("refreshToken");
    expect(new Date(String(input.tokenExpiresAt)).getTime()).toBeGreaterThan(Date.now());
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
  });
});

describe("GET /api/connect/x/callback — PKCE code_verifier 쿠키 처리", () => {
  it("pkce_x 쿠키 있으면 code_verifier 포함해 토큰 교환, 저장 성공", async () => {
    process.env.X_CLIENT_ID = "x-client-id";
    process.env.X_CLIENT_SECRET = "x-secret";
    H.fetchSeq = [{ status: 200, body: { access_token: "X_ACCESS_TOKEN" } }];
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = (init?.body as string) || "";
      const n = H.fetchSeq.shift() || { status: 200, body: {} };
      return new Response(JSON.stringify(n.body), { status: n.status });
    }));
    const state = await signedState("tenant-1", "x");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      callbackRequest("x", state, "XCODE", ["pkce_x=MY_VERIFIER_VALUE"]),
      params("x"),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/연결 완료/);
    expect(capturedBody).toContain("code_verifier=MY_VERIFIER_VALUE");
    expect(JSON.stringify(H.inserts[0])).toContain("X_ACCESS_TOKEN");
    expectExpiredCallbackCookies(res, "x");
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
  });

  it("provider error 결과에서도 state와 PKCE verifier를 함께 만료한다", async () => {
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      new Request("https://app.example/api/connect/x/callback?error=access_denied"),
      params("x"),
    );
    expect(await res.text()).toMatch(/연결 실패/);
    expectExpiredCallbackCookies(res, "x");
  });

  it("state가 현재 브라우저와 불일치해도 state와 PKCE verifier를 함께 만료한다", async () => {
    const state = await signedState("tenant-1", "x");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      new Request(`https://app.example/api/connect/x/callback?code=XCODE&state=${encodeURIComponent(state)}`),
      params("x"),
    );
    expect(await res.text()).toMatch(/현재 브라우저와 일치하지|이미 처리/);
    expectExpiredCallbackCookies(res, "x");
  });

  it("토큰 교환 실패 결과에서도 state와 PKCE verifier를 함께 만료한다", async () => {
    process.env.X_CLIENT_ID = "x-client-id";
    process.env.X_CLIENT_SECRET = "x-secret";
    H.fetchSeq = [{ status: 400, body: { error: "invalid_grant" } }];
    const state = await signedState("tenant-1", "x");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      callbackRequest("x", state, "XCODE", ["pkce_x=MY_VERIFIER_VALUE"]),
      params("x"),
    );
    expect(await res.text()).toMatch(/연결 실패/);
    expect(H.inserts).toHaveLength(0);
    expectExpiredCallbackCookies(res, "x");
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
  });
});

describe("GET /api/connect/tiktok/callback — PKCE/state 쿠키 폐기", () => {
  it("성공 시 code_verifier로 토큰 교환하고 두 쿠키를 별도 만료한다", async () => {
    process.env.TIKTOK_CLIENT_KEY = "tt-key";
    process.env.TIKTOK_CLIENT_SECRET = "tt-secret";
    H.fetchSeq = [{ status: 200, body: { access_token: "TT_ACCESS_TOKEN", open_id: "tt-user-1" } }];
    let capturedBody = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = String(init?.body || "");
      const n = H.fetchSeq.shift() || { status: 200, body: {} };
      return new Response(JSON.stringify(n.body), { status: n.status });
    }));
    const state = await signedState("tenant-1", "tiktok");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      callbackRequest("tiktok", state, "TTCODE", ["pkce_tiktok=MY_TIKTOK_VERIFIER"]),
      params("tiktok"),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/연결 완료/);
    expect(capturedBody).toContain("code_verifier=MY_TIKTOK_VERIFIER");
    expect(JSON.stringify(H.inserts[0])).toContain("TT_ACCESS_TOKEN");
    expectExpiredCallbackCookies(res, "tiktok");
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
  });

  it("provider error 시에도 PKCE/state 쿠키를 별도 만료한다", async () => {
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      new Request("https://app.example/api/connect/tiktok/callback?error=access_denied"),
      params("tiktok"),
    );
    expect(await res.text()).toMatch(/연결 실패/);
    expectExpiredCallbackCookies(res, "tiktok");
  });
});

describe("GET /api/connect/linkedin/callback — 표준 OAuth 저장", () => {
  it("code → access_token 단일 교환 후 integrations 저장", async () => {
    process.env.LINKEDIN_CLIENT_ID = "li-id";
    process.env.LINKEDIN_CLIENT_SECRET = "li-secret";
    H.fetchSeq = [{ status: 200, body: { access_token: "LI_ACCESS" } }];
    const state = await signedState("tenant-1", "linkedin");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      callbackRequest("linkedin", state, "LICODE"),
      params("linkedin"),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/연결 완료/);
    // 표준 OAuth는 fetch 1회만(단기→장기 2단계 없음 — Instagram은 2회)
    expect(H.fetchCalls.length).toBe(1);
    expect(H.inserts).toHaveLength(1);
    expect(JSON.stringify(H.inserts[0])).toContain("LI_ACCESS");
    delete process.env.LINKEDIN_CLIENT_ID;
    delete process.env.LINKEDIN_CLIENT_SECRET;
  });
});

// ── OAuth state HMAC 서명 — CSRF 방지 (2026-07-10 하드닝, Codex 2nd-pass 반영) ─
// state=tenantId 평문(위조 가능)을 signState()/verifyState()로 서명·검증하도록 강화.
// 서명 payload는 `base64url(JSON.stringify({t,p,ts})).sig`(2-파트) — tenantId/provider를
// "."로 직접 이어붙이지 않고 JSON+base64url로 감싸 구분자 주입/파싱 혼동을 원천 차단한다
// (tenantId에 "."가 섞여도 안전 — Codex 2nd-pass Major 최종 라운드, 2026-07-10).
// OSMU_SECRET_KEY가 설정된 환경에서는 이 2-파트 형식이 아닌 state(평문 등)를 무조건 거부한다
// (Critical — 다운그레이드 공격 차단). 위 기존 callback 테스트들은 이제 전부 signedState()
// 헬퍼로 만든 서명 state를 쓴다(더 이상 평문 아님).
describe("signState/verifyState — OAuth state HMAC 서명·검증", () => {
  it("signState: OSMU_SECRET_KEY 있으면 base64url(payload).sig 2-파트로 서명, payload에 t/p/ts 포함", async () => {
    process.env.OSMU_SECRET_KEY = "enc-key";
    const { signState } = await import("@/lib/social-connect");
    const state = await signState("tenant-42", "instagram");
    const parts = state.split(".");
    expect(parts).toHaveLength(2);
    const payload = JSON.parse(Buffer.from(parts[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
    expect(payload.t).toBe("tenant-42");
    expect(payload.p).toBe("instagram");
    expect(payload.ts).toBeGreaterThan(0);
  });

  // Major 최종 라운드 회귀 테스트 — tenantId에 "."가 섞여도(구분자 주입) 왕복이 깨지지 않아야 한다.
  // 구현 방식(`tenantId.provider.timestamp.sig` 문자열 이어붙이기 + split("."))이었다면 이 케이스가
  // 필드 경계를 잘못 잡아 정상 서명 state도 거부됐을 것 — JSON+base64url 직렬화라 안전하다.
  it("tenantId에 '.'가 포함돼도 signState→verifyState 왕복이 정확히 복원된다(구분자 주입 방지)", async () => {
    process.env.OSMU_SECRET_KEY = "enc-key";
    const { signState, verifyState } = await import("@/lib/social-connect");
    const trickyTenantId = "tenant.with.dots.42";
    const state = await signState(trickyTenantId, "instagram");
    const result = await verifyState(state, "instagram");
    expect(result.valid).toBe(true);
    expect(result.tenantId).toBe(trickyTenantId);
  });

  it("signState: OSMU_SECRET_KEY 없으면 평문 tenantId 그대로(로컬 dev 폴백)", async () => {
    delete process.env.OSMU_SECRET_KEY;
    const { signState } = await import("@/lib/social-connect");
    const state = await signState("tenant-42", "instagram");
    expect(state).toBe("tenant-42");
    process.env.OSMU_SECRET_KEY = "enc-key"; // 이후 테스트 위해 복원
  });

  it("verifyState: signState로 만든 정상 state는 valid=true + 원래 tenantId 복원", async () => {
    process.env.OSMU_SECRET_KEY = "enc-key";
    const { signState, verifyState } = await import("@/lib/social-connect");
    const state = await signState("tenant-42", "instagram");
    const result = await verifyState(state, "instagram");
    expect(result.valid).toBe(true);
    expect(result.tenantId).toBe("tenant-42");
  });

  it("verifyState: 위조된 서명(sig 변조) → valid=false", async () => {
    process.env.OSMU_SECRET_KEY = "enc-key";
    const { signState, verifyState } = await import("@/lib/social-connect");
    const state = await signState("tenant-42", "instagram");
    const [payloadB64] = state.split(".");
    const tampered = `${payloadB64}.deadbeef0000deadbeef0000deadbeef0000deadbeef0000deadbeef0000dead`;
    const result = await verifyState(tampered, "instagram");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/위조|손상/);
  });

  it("verifyState: 다른 시크릿으로 만든 state(위조 시도) → valid=false", async () => {
    process.env.OSMU_SECRET_KEY = "attacker-key";
    const { signState } = await import("@/lib/social-connect");
    const forged = await signState("tenant-victim", "instagram");
    process.env.OSMU_SECRET_KEY = "enc-key"; // 서버는 진짜 키로 검증
    vi.resetModules();
    const { verifyState } = await import("@/lib/social-connect");
    const result = await verifyState(forged, "instagram");
    expect(result.valid).toBe(false);
  });

  it("verifyState: 만료(10분 초과) state → valid=false + 만료 사유", async () => {
    process.env.OSMU_SECRET_KEY = "enc-key";
    const { signState, verifyState } = await import("@/lib/social-connect");
    const elevenMinAgo = Date.now() - 11 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(elevenMinAgo);
    const oldState = await signState("tenant-42", "instagram");
    vi.restoreAllMocks();
    const result = await verifyState(oldState, "instagram");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/만료/);
  });

  // Major 하드닝 회귀 테스트 — 서명은 유효하나 발급 당시 provider와 callback URL의 provider가
  // 다르면(cross-provider replay) 거부한다.
  it("verifyState: 다른 provider용으로 서명된 state → valid=false(재사용 의심)", async () => {
    process.env.OSMU_SECRET_KEY = "enc-key";
    const { signState, verifyState } = await import("@/lib/social-connect");
    const state = await signState("tenant-42", "instagram"); // instagram용으로 서명
    const result = await verifyState(state, "threads"); // threads callback에서 재사용 시도
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/다른 provider|재사용/);
  });

  // Critical 하드닝 회귀 테스트 — 키가 설정된 환경(prod)에서 평문(비서명) state는
  // "다운그레이드 공격" 통로이므로 반드시 거부해야 한다(과거엔 신뢰해 취약했던 지점).
  it("verifyState: OSMU_SECRET_KEY 설정 상태에서 평문 state(비서명, 3-파트 아님) → valid=false(다운그레이드 거부)", async () => {
    process.env.OSMU_SECRET_KEY = "enc-key";
    const { verifyState } = await import("@/lib/social-connect");
    const result = await verifyState("tenant-legacy-plain", "instagram");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/다운그레이드|서명 형식/);
  });

  it("verifyState: OSMU_SECRET_KEY 미설정(로컬 dev)이면 평문 state를 여전히 tenantId로 신뢰(하위호환)", async () => {
    delete process.env.OSMU_SECRET_KEY;
    const { verifyState } = await import("@/lib/social-connect");
    const result = await verifyState("tenant-legacy-plain", "instagram");
    expect(result.valid).toBe(true);
    expect(result.tenantId).toBe("tenant-legacy-plain");
    process.env.OSMU_SECRET_KEY = "enc-key"; // 이후 테스트 위해 복원
  });
});

describe("GET /api/connect/instagram → callback — 서명된 state 전체 왕복", () => {
  it("connect가 서명한 state를 callback이 검증해 올바른 tenantId로 저장", async () => {
    process.env.OSMU_SECRET_KEY = "enc-key";
    H.tenantId = "tenant-roundtrip"; // effectiveTenantId mock이 반환할 값(라우트가 이 값을 서명함)
    const { GET: connectGET } = await import("@/app/api/connect/[provider]/route");
    const connectRes = await connectGET(
      new Request("https://app.example/api/connect/instagram?tenant_id=tenant-roundtrip"),
      params("instagram"),
    );
    const { authUrl } = (await connectRes.json()) as { authUrl: string };
    const signedStateFromAuthUrl = new URL(authUrl).searchParams.get("state")!;
    expect(signedStateFromAuthUrl.split(".")).toHaveLength(2);

    const { GET: callbackGET } = await import("@/app/api/connect/[provider]/callback/route");
    const callbackRes = await callbackGET(
      callbackRequest("instagram", signedStateFromAuthUrl, "AUTHCODE"),
      params("instagram"),
    );
    expect(await callbackRes.text()).toMatch(/연결 완료/);
    expect(JSON.stringify(H.inserts[0])).toContain("tenant-roundtrip");
  });

  it("callback: 같은 provider의 유효 state라도 auth-url 브라우저 쿠키가 없거나 다르면 저장하지 않는다", async () => {
    process.env.OSMU_SECRET_KEY = "enc-key";
    const state = await signedState("tenant-victim", "instagram");
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      new Request(`https://app.example/api/connect/instagram/callback?code=ATTACKER_CODE&state=${encodeURIComponent(state)}`),
      params("instagram"),
    );
    expect(await res.text()).toMatch(/현재 브라우저와 일치하지|이미 처리/);
    expect(H.fetchCalls).toHaveLength(0);
    expect(H.inserts).toHaveLength(0);
    expect(res.headers.get("set-cookie")).toContain("oauth_state_instagram=");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("auth-url은 callback 전용 httpOnly state 쿠키를 발급한다", async () => {
    H.tenantId = "tenant-cookie-bound";
    const { GET } = await import("@/app/api/connect/[provider]/route");
    const res = await GET(
      new Request("https://app.example/api/connect/instagram?tenant_id=tenant-cookie-bound"),
      params("instagram"),
    );
    const { authUrl } = (await res.json()) as { authUrl: string };
    const state = new URL(authUrl).searchParams.get("state")!;
    const cookie = res.headers.get("set-cookie") || "";
    expect(cookie).toContain(`oauth_state_instagram=${encodeURIComponent(state)}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=600");
  });

  it("callback: 위조된 state → '연결 실패' HTML + integrations 미저장", async () => {
    process.env.OSMU_SECRET_KEY = "enc-key";
    const { signState } = await import("@/lib/social-connect");
    const validState = await signState("tenant-attacker", "instagram");
    const [payloadB64] = validState.split(".");
    const tamperedState = `${payloadB64}.0000000000000000000000000000000000000000000000000000000000000000`;
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await GET(
      new Request(`https://app.example/api/connect/instagram/callback?code=AUTHCODE&state=${encodeURIComponent(tamperedState)}`),
      params("instagram"),
    );
    const html = await res.text();
    expect(html).toMatch(/연결 실패/);
    expect(H.inserts).toHaveLength(0);
  });

  it("callback: instagram용 signed state를 threads callback에 재사용 → '연결 실패'(cross-provider replay 차단)", async () => {
    process.env.OSMU_SECRET_KEY = "enc-key";
    H.tenantId = "tenant-cross";
    const { GET: connectGET } = await import("@/app/api/connect/[provider]/route");
    const connectRes = await connectGET(
      new Request("https://app.example/api/connect/instagram?tenant_id=tenant-cross"),
      params("instagram"),
    );
    const { authUrl } = (await connectRes.json()) as { authUrl: string };
    const stateForInstagram = new URL(authUrl).searchParams.get("state")!;

    process.env.THREADS_APP_ID = "th-app-456";
    process.env.THREADS_APP_SECRET = "th-secret";
    const { GET: callbackGET } = await import("@/app/api/connect/[provider]/callback/route");
    const res = await callbackGET(
      new Request(`https://app.example/api/connect/threads/callback?code=THCODE&state=${encodeURIComponent(stateForInstagram)}`),
      params("threads"),
    );
    const html = await res.text();
    expect(html).toMatch(/연결 실패/);
    expect(H.inserts).toHaveLength(0);
  });
});

// finding 1 (XSS): resultHtml()이 postMessage payload를 인라인 <script> 안에
// JSON.stringify()만으로 넣으면, provider가 돌려준(혹은 URL 경로 세그먼트로 위장된) 텍스트에
// literal "</script>"가 있을 때 HTML 파서가 <script> 태그를 조기 종료시켜 뒤의 <script> 태그가
// 새 실행 컨텍스트로 파싱된다 — JSON.stringify는 HTML-safe가 아니다(JS 문법 이스케이프만 함).
// "지원하지 않는 provider" 분기는 URL path param(공격자가 완전히 통제 가능)을 오류 메시지에
// 그대로 보간하므로 이 취약점의 실제 도달 경로다.
describe("callback resultHtml — XSS 이스케이프 (finding 1)", () => {
  it("provider 세그먼트에 </script><script>alert(1)</script> 페이로드를 넣어도 원문 그대로(unescaped)로 script 태그가 조기 종료되지 않는다", async () => {
    const { GET } = await import("@/app/api/connect/[provider]/callback/route");
    const payload = "</script><script>alert(1)</script>";
    const res = await GET(
      new Request("https://app.example/api/connect/evil/callback?code=x&state=y"),
      { params: Promise.resolve({ provider: payload }) },
    );
    const html = await res.text();

    // 1) 취약한 원문 시퀀스가 스크립트 컨텍스트 안에 살아있으면 안 된다.
    expect(html).not.toContain("</script><script>alert(1)</script>");

    // 2) 이스케이프된 형태로 인라인 스크립트 payload 안에 안전하게 들어있어야 한다 —
    //    정확한 이스케이프 출력을 직접 확인(self-question (b) 근거).
    expect(html).toContain("\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e");

    // 3) 페이지 안에서 실제 <script> 여는 태그는 정확히 하나(postMessage 로직)뿐이어야 한다 —
    //    페이로드가 태그를 조기종료해 두 번째 <script>가 생겼다면 이 카운트가 깨진다.
    const scriptOpenTags = (html.match(/<script>/g) || []).length;
    expect(scriptOpenTags).toBe(1);

    // 지원하지 않는 provider 문자열은 Set-Cookie의 name/path에 넣지 않는다. 그렇지 않으면
    // URL path param의 CRLF/구분자가 HTTP response splitting 또는 invalid cookie가 될 수 있다.
    expect(res.headers.getSetCookie()).toEqual([]);

    const prototypeNameRes = await GET(
      new Request("https://app.example/api/connect/toString/callback?code=x&state=y"),
      params("toString"),
    );
    expect(prototypeNameRes.headers.getSetCookie()).toEqual([]);
  });
});
