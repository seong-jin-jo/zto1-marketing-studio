import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression: API-READ-TRUTH-V14. Four read routes returned HTTP 200 with an
// error body, so callers and the live sweep could mistake failure for success.
// Found by /qa on 2026-09-16.
// Report: docs/qa/osmu-api-read-sweep-v14-gpt-codex.md

const H = vi.hoisted(() => ({
  files: {} as Record<string, unknown>,
}));

vi.mock("@/lib/file-io", () => ({
  readJson: vi.fn((file: string) => H.files[file] ?? null),
  writeJson: vi.fn(),
  dataPath: vi.fn((name: string) => `data/${name}`),
  configPath: vi.fn((name: string) => `config/${name}`),
}));
vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "cd1d0a40-540d-4524-9b49-bf2445d82182"),
}));
vi.mock("@/lib/tenant-context", () => ({
  runWithTenant: vi.fn((_tenantId: string, callback: () => unknown) => callback()),
}));
vi.mock("@/lib/gsc-auth", () => ({
  getGoogleAccessToken: vi.fn(async () => "access-token"),
}));

beforeEach(() => {
  H.files = {};
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function expectStatusAndCode(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ code });
}

describe("API-READ-TRUTH-V14 읽기 실패 HTTP 계약", () => {
  it("블로그 설정 누락은 503과 안정된 오류 코드를 반환한다", async () => {
    const { GET } = await import("@/app/api/blog-stats/route");
    const response = await GET(new Request("http://localhost/api/blog-stats"));
    await expectStatusAndCode(response, 503, "BLOG_NOT_CONFIGURED");
  });

  it("ElevenLabs 설정 누락은 503과 안정된 오류 코드를 반환한다", async () => {
    const { GET } = await import("@/app/api/elevenlabs-voices/route");
    const response = await GET();
    await expectStatusAndCode(response, 503, "ELEVENLABS_NOT_CONFIGURED");
  });

  it("Google Analytics 서비스 계정 누락은 503과 안정된 오류 코드를 반환한다", async () => {
    const { GET } = await import("@/app/api/ga-analytics/route");
    const response = await GET(new Request("http://localhost/api/ga-analytics"));
    await expectStatusAndCode(response, 503, "GA_NOT_CONFIGURED");
  });

  it("Google Analytics 속성 누락은 503과 구분 가능한 오류 코드를 반환한다", async () => {
    H.files["data/gsc-service-account.json"] = { client_email: "service@example.com" };
    const { GET } = await import("@/app/api/ga-analytics/route");
    const response = await GET(new Request("http://localhost/api/ga-analytics"));
    await expectStatusAndCode(response, 503, "GA_PROPERTY_NOT_CONFIGURED");
  });

  it("Search Console 설정 누락은 503과 안정된 오류 코드를 반환한다", async () => {
    const { GET } = await import("@/app/api/gsc-analytics/route");
    const response = await GET(new Request("http://localhost/api/gsc-analytics"));
    await expectStatusAndCode(response, 503, "GSC_NOT_CONFIGURED");
  });

  it("블로그 공급자 실패는 502로 노출한다", async () => {
    H.files["config/openclaw.json"] = {
      plugins: { entries: { "sample-blog": { config: { apiBaseUrl: "https://blog.example", email: "owner@example.com" } } } },
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("로그인 실패", { status: 500 })));
    const { GET } = await import("@/app/api/blog-stats/route");
    const response = await GET(new Request("http://localhost/api/blog-stats"));
    await expectStatusAndCode(response, 502, "BLOG_LOGIN_FAILED");
  });

  it("ElevenLabs 공급자 실패는 502로 노출한다", async () => {
    H.files["data/elevenlabs-config.json"] = { apiKey: "configured" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("공급자 실패", { status: 500 })));
    const { GET } = await import("@/app/api/elevenlabs-voices/route");
    const response = await GET();
    await expectStatusAndCode(response, 502, "ELEVENLABS_UPSTREAM_FAILED");
  });

  it("Google Analytics 공급자 실패는 502로 노출한다", async () => {
    H.files["data/gsc-service-account.json"] = { client_email: "service@example.com" };
    H.files["data/ga-config.json"] = { propertyId: "1234" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("공급자 실패", { status: 500 })));
    const { GET } = await import("@/app/api/ga-analytics/route");
    const response = await GET(new Request("http://localhost/api/ga-analytics"));
    await expectStatusAndCode(response, 502, "GA_UPSTREAM_FAILED");
  });

  it("Search Console 공급자 실패와 캐시 부재는 502로 노출한다", async () => {
    H.files["data/gsc-service-account.json"] = { client_email: "service@example.com" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("공급자 실패", { status: 500 })));
    const { GET } = await import("@/app/api/gsc-analytics/route");
    const response = await GET(new Request("http://localhost/api/gsc-analytics?site=sc-domain%3Aexample.com"));
    await expectStatusAndCode(response, 502, "GSC_UPSTREAM_FAILED");
  });
});
