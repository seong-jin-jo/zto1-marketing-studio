import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// GET /api/connect/readiness — SNS-001/SNS-003/SNS-004 회귀.
// 서버 credential이 없는 provider(X 등)를 고객 UI가 클릭 가능하게 보여주면 안 된다는 계약을
// readiness 엔드포인트가 지킨다: env가 없으면 available=false + 조치 가능한 한국어 reason.

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/channel-connection", () => ({
  getChannelConnectionStates: vi.fn(async (_tenantId: string, providers: string[]) => (
    Object.fromEntries(providers.map((provider) => [provider, "disconnected"]))
  )),
}));

const ENV_KEYS = [
  "X_CLIENT_ID", "X_CLIENT_SECRET",
  "FB_APP_ID", "FB_APP_SECRET", "FB_CONFIG_ID",
  "THREADS_APP_ID", "THREADS_APP_SECRET",
  "IG_APP_ID", "IG_APP_SECRET",
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetModules();
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
  }
});

function req() {
  return new Request("http://localhost/api/connect/readiness?tenant_id=tenant-1");
}

describe("GET /api/connect/readiness", () => {
  it("SNS-003: X_CLIENT_ID/SECRET 미설정이면 x.available=false + 한국어 사유", async () => {
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.providers.x.available).toBe(false);
    expect(body.providers.x.status).toBe("opening_soon");
    // 계약이 "자격증명"이라는 낱말을 요구하던 것을 바꾼다. 그 낱말은 우리 사정이지 화면을 보는
    // 사람의 언어가 아니었다(회장 2026-09-06 "앱 자격증명 등록을 하라는게 뭔말이냐").
    // 이제 요구하는 것은 낱말이 아니라 조치 가능성이다. 어디로 가야 하는지가 문구에 있어야 한다.
    expect(body.providers.x.reason).toContain("developer.x.com");
    expect(body.providers.x.reason).toContain("연결이 열립니다");
    expect(body.providers.x.reason).not.toContain("X_CLIENT_ID"); // 설정 변수 이름 노출 금지
    expect(body.providers.x.reason).not.toMatch(/^\{/); // raw JSON 아님
  });

  it("SNS-003: X_CLIENT_ID/SECRET 둘 다 설정되면 x.available=true", async () => {
    process.env.X_CLIENT_ID = "id";
    process.env.X_CLIENT_SECRET = "secret";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(req());
    const body = await res.json();
    expect(body.providers.x.available).toBe(true);
    expect(body.providers.x.status).toBe("not_connected");
    expect(body.providers.x.reason).toBeUndefined();
  });

  it("SNS-004: FB_APP_ID/SECRET은 있으나 FB_CONFIG_ID 미설정이면 facebook.available=false", async () => {
    process.env.FB_APP_ID = "id";
    process.env.FB_APP_SECRET = "secret";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(req());
    const body = await res.json();
    expect(body.providers.facebook.available).toBe(false);
    expect(body.providers.facebook.reason).toContain("FB_CONFIG_ID");
  });

  it("SNS-004: FB 3키가 있으면 외부 앱 심사 미완이어도 연결은 열어둔다(발행만 심사 후)", async () => {
    // 회장 2026-08-13 라이브 회귀 수정: 외부 심사는 연결을 막지 않는다. credential 3키가 갖춰졌고
    // 아직 미연결이면 not_connected(연결 버튼 활성). 심사 제약은 발행 단계에서만 표기한다.
    process.env.FB_APP_ID = "id";
    process.env.FB_APP_SECRET = "secret";
    process.env.FB_CONFIG_ID = "cfg";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(req());
    const body = await res.json();
    expect(body.providers.facebook.available).toBe(true);
    expect(body.providers.facebook.status).toBe("not_connected");
    expect(body.providers.facebook.reason).toMatch(/앱 심사 전/);
    expect(body.providers.facebook.reason).toMatch(/테스터로 등록/);
  });

  it("비밀값 자체는 응답에 절대 포함하지 않는다", async () => {
    process.env.X_CLIENT_ID = "super-secret-id-value";
    process.env.X_CLIENT_SECRET = "super-secret-value";
    const { GET } = await import("@/app/api/connect/readiness/route");
    const res = await GET(req());
    const text = await res.text();
    expect(text).not.toContain("super-secret-id-value");
    expect(text).not.toContain("super-secret-value");
  });
});
