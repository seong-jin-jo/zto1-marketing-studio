import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { createTempDir, setupTestEnv, cleanupTestEnv } from "../helpers";

// 수동 입력 키(Settings CredentialForm) → /api/channel-config/[channel] → integrations 브리지 검증.
// 대시보드 직접 발행(publish.ts getChannelCred)이 읽는 곳은 integrations 테이블이므로,
// 수동 키가 openclaw.json(게이트웨이)뿐 아니라 integrations에도 저장돼야 발행 경로가 안 끊긴다.

const H = vi.hoisted(() => ({
  inserts: [] as unknown[][],
  verify: { verified: true, account: "@ok" } as { verified: boolean; unverified?: boolean; account?: string; error?: string },
  accounts: [] as unknown[],
  selected: [] as unknown[],
  failAccount: false,
  accountIsDefault: true,
  failMirror: false,
}));

vi.mock("@/lib/channel-accounts", () => ({
  upsertChannelAccount: vi.fn(async (input: unknown) => {
    H.accounts.push(input);
    if (H.failAccount) throw new Error("db unavailable");
    return { id: "account-1", isDefault: H.accountIsDefault, reconnected: false };
  }),
  syncLegacyIntegration: vi.fn(async (...args: unknown[]) => {
    if (H.failMirror) throw new Error("fixture mirror unavailable");
    H.selected.push(["sync", ...args]);
  }),
  setDefaultAccount: vi.fn(async (...args: unknown[]) => {
    H.selected.push(["default", ...args]);
    return { ok: true };
  }),
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_t: string, cb: (sql: unknown) => unknown) => {
    const sql = Object.assign(
      (strings: TemplateStringsArray, ...vals: unknown[]) => {
        const query = Array.from(strings).join(" ");
        if (query.includes("SELECT provider AS label")) {
          return Promise.resolve(H.accounts.map((account) => {
            const a = account as { provider: string; accessToken: string; meta: Record<string, unknown> };
            return { label: a.provider, token: a.accessToken, meta: a.meta, status: "active", token_expires_at: null, has_refresh: false };
          }));
        }
        H.inserts.push(vals);
        return Promise.resolve([]);
      },
      { json: (v: unknown) => v },
    );
    return cb(sql);
  }),
}));

vi.mock("@/lib/channel-connection", () => ({
  getChannelConnectionStates: vi.fn(async () => Object.fromEntries(
    H.accounts.map((account) => [(account as { provider: string }).provider, "connected"]),
  )),
}));

vi.mock("@/lib/verify-channel", () => ({
  verifyChannel: vi.fn(async () => H.verify),
}));

let tmpDir: string;

function post(channel: string, body: Record<string, string>) {
  return new Request(`http://localhost/api/channel-config/${channel}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = (channel: string) => ({ params: Promise.resolve({ channel }) });

beforeEach(() => {
  vi.resetModules();
  tmpDir = createTempDir();
  setupTestEnv(tmpDir);
  // 라우트는 runWithTenant(tenant-1) 안에서 configPath("openclaw.json")를 tenants/tenant-1/ 아래로
  // 격리해 읽는다 — 픽스처를 그 경로에 둔다.
  const src = path.resolve(__dirname, "../fixtures/openclaw.json");
  const dir = path.join(tmpDir, "tenants", "tenant-1");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, path.join(dir, "openclaw.json"));
  H.inserts = [];
  H.accounts = [];
  H.selected = [];
  H.failAccount = false;
  H.accountIsDefault = true;
  H.failMirror = false;
  H.verify = { verified: true, account: "@ok" };
  process.env.OSMU_SECRET_KEY = "enc-key";
});

afterEach(() => {
  cleanupTestEnv(tmpDir);
  delete process.env.OSMU_SECRET_KEY;
});

describe("POST /api/channel-config/[channel] — integrations 브리지", () => {
  it("X 4키 저장 시 integrations에 meta로 브리지(publishX가 읽는 형태)", async () => {
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("x", {
      apiKey: "AK", apiKeySecret: "AKS", accessToken: "AT", accessTokenSecret: "ATS",
    }), params("x"));
    expect(res.status).toBe(200);
    expect(H.inserts).toHaveLength(1);
    const s = JSON.stringify(H.inserts[0]);
    expect(s).toContain("AK");
    expect(s).toContain("AKS");
    expect(s).toContain("AT");
    expect(s).toContain("ATS");
    expect(s).toContain("tenant-1");
  });

  it("facebook 수동 키 → integrations(secret=token, meta.userId=pageId)", async () => {
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("facebook", { accessToken: "PAGE_TOKEN", pageId: "990011" }), params("facebook"));
    expect(res.status).toBe(200);
    expect(H.inserts).toHaveLength(1);
    const s = JSON.stringify(H.inserts[0]);
    expect(s).toContain("PAGE_TOKEN");
    expect(s).toContain("990011");
    expect(s).toContain("facebook_graph");
  });

  it("threads 수동 키 → integrations 브리지", async () => {
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("threads", { accessToken: "TH_TOKEN", userId: "1234" }), params("threads"));
    expect(res.status).toBe(200);
    expect(H.inserts).toHaveLength(1);
    expect(JSON.stringify(H.inserts[0])).toContain("TH_TOKEN");
  });

  it("bluesky 수동 키 → integrations(secret=appPassword, meta.handle)", async () => {
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("bluesky", { handle: "user.bsky.social", appPassword: "abcd-efgh-ijkl-mnop" }), params("bluesky"));
    expect(res.status).toBe(200);
    expect(H.inserts).toHaveLength(1);
    const s = JSON.stringify(H.inserts[0]);
    expect(s).toContain("abcd-efgh-ijkl-mnop");
    expect(s).toContain("user.bsky.social");
    expect(s).toContain("bluesky_app_password");
  });

  it("CHANNEL-01 텔레그램 검증된 수동 키를 테넌트 기본 발행 계정에 저장한다", async () => {
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("telegram", { botToken: "BOT", chatId: "1" }), params("telegram"));
    expect(res.status).toBe(200);
    expect(H.accounts).toHaveLength(1);
    const s = JSON.stringify(H.accounts[0]);
    expect(s).toContain("BOT");
    expect(s).toContain("telegram_bot");
    expect(s).toContain("tenant-1");
    expect(H.selected).toEqual([["sync", "tenant-1", "telegram", "account-1"]]);
  });

  it("CHANNEL-02 디스코드 Webhook을 기본 발행 계정에 저장한다", async () => {
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("discord", { webhookUrl: "https://discord.com/api/webhooks/1/abc" }), params("discord"));
    expect(res.status).toBe(200);
    expect(H.accounts).toHaveLength(1);
    const s = JSON.stringify(H.accounts[0]);
    expect(s).toContain("discord.com/api/webhooks");
    expect(s).toContain("discord_webhook");
  });

  it("CHANNEL-03 슬랙 Webhook을 기존 OAuth 기본 계정 대신 발행 기본 계정으로 지정한다", async () => {
    H.accountIsDefault = false;
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("slack", { webhookUrl: "https://hooks.slack.com/services/T1/B1/xyz", tenant_id: "other-tenant" }), params("slack"));
    expect(res.status).toBe(200);
    expect(H.accounts).toHaveLength(1);
    const s = JSON.stringify(H.accounts[0]);
    expect(s).toContain("hooks.slack.com");
    expect(s).toContain("slack_webhook");
    expect((H.accounts[0] as { tenantId: string }).tenantId).toBe("tenant-1");
    expect(H.selected).toEqual([["default", "tenant-1", "slack", "account-1"]]);
    expect(JSON.stringify(await res.json())).not.toContain("hooks.slack.com");
  });

  it("CHANNEL-04 계정 DB 저장 실패는 연결 성공으로 응답하지 않는다", async () => {
    H.failAccount = true;
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("slack", { webhookUrl: "https://hooks.slack.com/services/T1/B1/xyz" }), params("slack"));
    expect(res.status).toBe(503);
    expect((await res.json()).verified).toBe(false);
    expect(H.selected).toHaveLength(0);
  });

  it("CHANNEL-32 미러 실패는 503을 반환하고 재조회 상태를 드러내며 동일 값 재시도로 복구한다", async () => {
    H.failMirror = true;
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const request = () => post("slack", { webhookUrl: "https://hooks.slack.com/services/T1/B1/fixture" });
    const failed = await POST(request(), params("slack"));
    expect(failed.status).toBe(503);
    expect((await failed.json()).verified).toBe(false);
    expect(H.accounts).toHaveLength(1);
    const { GET } = await import("@/app/api/channel-config/route");
    const loaded = await (await GET(new Request("http://localhost/api/channel-config"))).json();
    expect(loaded.slack.connected).toBe(true);
    H.failMirror = false;
    const retried = await POST(request(), params("slack"));
    expect(retried.status).toBe(200);
    expect((await retried.json()).verified).toBe(true);
    expect(H.selected).toEqual([["sync", "tenant-1", "slack", "account-1"]]);
  });

  it("CHANNEL-33 파일 저장 실패도 성공 응답을 막고 동일 값 재시도로 복구한다", async () => {
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const rename = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => { throw new Error("fixture file unavailable"); });
    const request = () => post("slack", { webhookUrl: "https://hooks.slack.com/services/T1/B1/fixture" });
    const failed = await POST(request(), params("slack"));
    expect(failed.status).toBe(503);
    expect((await failed.json()).verified).toBe(false);
    expect(H.accounts).toHaveLength(1);
    const { GET } = await import("@/app/api/channel-config/route");
    const loaded = await (await GET(new Request("http://localhost/api/channel-config"))).json();
    expect(loaded.slack.connected).toBe(true);
    rename.mockRestore();
    const retried = await POST(request(), params("slack"));
    expect(retried.status).toBe(200);
    expect((await retried.json()).verified).toBe(true);
  });

  it("CHANNEL-05 인증 검증 실패 시 테넌트 계정 생성과 기본 계정 교체를 거부한다", async () => {
    H.verify = { verified: false, error: "bad" };
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("slack", { webhookUrl: "invalid" }), params("slack"));
    expect((await res.json()).verified).toBe(false);
    expect(H.accounts).toHaveLength(0);
    expect(H.selected).toHaveLength(0);
  });

  it.each([
    ["CHANNEL-36", { verified: false, error: "bad" }],
    ["CHANNEL-37", { verified: false, unverified: true }],
  ])("%s 메시징 신규 연결 실패·확인 불가면 기존 파일과 기본 계정을 보존한다", async (_id, verification) => {
    const filePath = path.join(tmpDir, "tenants", "tenant-1", "openclaw.json");
    const before = fs.readFileSync(filePath, "utf-8");
    H.accounts = [{ provider: "slack", accessToken: "https://hooks.slack.com/services/OLD/DEFAULT/fixture", meta: { api: "slack_webhook" } }];
    H.verify = verification;
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const response = await POST(post("slack", { webhookUrl: "https://hooks.slack.com/services/NEW/INVALID/fixture" }), params("slack"));
    expect((await response.json()).verified).toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe(before);
    expect(H.accounts).toHaveLength(1);
    expect(H.selected).toHaveLength(0);
    const { GET } = await import("@/app/api/channel-config/route");
    const loaded = await (await GET(new Request("http://localhost/api/channel-config"))).json();
    expect(loaded.slack.connected).toBe(true);
  });

  it("CHANNEL-15 슬랙 Webhook 저장 뒤 동일 테넌트 설정 재조회에서 연결됨을 반환한다", async () => {
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const saved = await POST(post("slack", { webhookUrl: "https://hooks.slack.com/services/T1/B1/fixture" }), params("slack"));
    expect((await saved.json()).verified).toBe(true);
    const { GET } = await import("@/app/api/channel-config/route");
    const loaded = await GET(new Request("http://localhost/api/channel-config"));
    const data = await loaded.json();
    expect(data.slack.connected).toBe(true);
    expect(JSON.stringify(data)).not.toContain("fixture");
  });

  it("직접발행 없는 채널(pinterest)은 integrations 브리지 안 함(게이트웨이 전용)", async () => {
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("pinterest", { accessToken: "PIN", boardId: "1" }), params("pinterest"));
    expect(res.status).toBe(200);
    expect(H.inserts).toHaveLength(0);
  });

  it("검증 실패(키 미저장) 시 브리지 안 함", async () => {
    H.verify = { verified: false, error: "bad" };
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("x", { apiKey: "AK", apiKeySecret: "AKS", accessToken: "AT", accessTokenSecret: "ATS" }), params("x"));
    expect(res.status).toBe(200);
    expect(H.inserts).toHaveLength(0);
  });

  it("unverified(네트워크 확인 실패지만 키 저장됨)면 브리지함", async () => {
    H.verify = { verified: false, unverified: true };
    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("x", { apiKey: "AK", apiKeySecret: "AKS", accessToken: "AT", accessTokenSecret: "ATS" }), params("x"));
    expect(res.status).toBe(200);
    expect(H.inserts).toHaveLength(1);
  });

  // SNS-005 회귀: openclaw.json 자체가 아직 없는 신규 tenant(DB에만 존재, 파일 캐시 미생성)에서
  // bluesky를 저장하면 과거엔 404("openclaw.json not found")로 막혀 최초 연결이 불가능했다.
  // 파일이 없어도 빈 config로 시작해 저장 성공 + integrations 브리지가 되어야 한다.
  it("SNS-005: openclaw.json 파일이 없는 신규 tenant도 bluesky 저장이 404 없이 성공한다", async () => {
    const dir = path.join(tmpDir, "tenants", "tenant-1");
    fs.rmSync(path.join(dir, "openclaw.json"));
    expect(fs.existsSync(path.join(dir, "openclaw.json"))).toBe(false);

    const { POST } = await import("@/app/api/channel-config/[channel]/route");
    const res = await POST(post("bluesky", { handle: "new.bsky.social", appPassword: "aaaa-bbbb-cccc-dddd" }), params("bluesky"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(fs.existsSync(path.join(dir, "openclaw.json"))).toBe(true);
    expect(H.inserts).toHaveLength(1);
    const s = JSON.stringify(H.inserts[0]);
    expect(s).toContain("aaaa-bbbb-cccc-dddd");
    expect(s).toContain("new.bsky.social");
  });

  // SNS-005: verifyChannel이 401/400을 던지면 raw JSON이 아니라 조치 가능한 한국어 문구로 나가야 한다.
  it("SNS-005: bluesky 인증 실패 시 에러가 한국어로 정규화된다(raw JSON 미노출)", async () => {
    vi.doUnmock("@/lib/verify-channel");
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "AuthenticationRequired", message: "Invalid identifier or password" }),
    })));
    const { verifyChannel } = await import("@/lib/verify-channel");
    const result = await verifyChannel("bluesky", { handle: "user.bsky.social", appPassword: "wrong" });
    expect(result.verified).toBe(false);
    expect(result.error).toContain("계정 정보가 올바르지 않습니다");
    expect(result.error).not.toMatch(/^API error \(/);
    vi.unstubAllGlobals();
  });
});
