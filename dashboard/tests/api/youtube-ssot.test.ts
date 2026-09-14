// 2026-09-07 정정: 제공자 실패를 502 로 돌려주던 계약을 바꿨다. 우리 앞의 리버스 프록시가
// 502 를 보면 우리 JSON 본문을 자기 HTML 오류 페이지로 갈아치워, 화면에 남는 것이
// "<!DOCTYPE html>" 뿐이었다. 실제로 릴스 발행을 시험했을 때 코드가 죽은 것인지 제공자가
// 거절한 것인지조차 구분할 수 없었다. 이제 200 + ok:false 로 답한다(/api/publish 와 같은 계약).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { createTempDir, setupTestEnv, cleanupTestEnv } from "../helpers";

// SNS-006 회귀: YouTube callback(DB) / status / refresh / video publish가 같은 저장소(DB
// integrations, getChannelCred)를 SSOT로 써야 한다. 과거엔 status가 data/youtube-token.json,
// publish가 config/openclaw.json을 읽어 "연결됐는데 미연결로 보임/연결 안 했는데 발행 시도" 드리프트가
// 났고, 그 파일들은 테넌트 격리도 없어 전 테넌트가 공유했다(토큰 유출 위험).
//
// findings 4/5/6/8: status는 실제 Google API를 bounded로 호출해 valid/invalid/unverified로
// 분류하고, 401 발생 시 publish는 공유 refresh 헬퍼로 정확히 1회만 재시도하며, 영상 파일 경로는
// 테넌트별로 격리된다(module-scope 상수가 아니라 요청 컨텍스트 안에서 해석).

const H = vi.hoisted(() => ({
  cred: null as { token: string; refreshToken?: string; userId?: string; meta?: Record<string, unknown>; accountId?: string } | null,
  updateCalls: [] as unknown[][],
  tenantId: "tenant-1" as string | null,
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
}));

vi.mock("@/lib/publish", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/publish")>();
  return { ...actual, getChannelCred: vi.fn(async () => H.cred) };
});

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_t: string, cb: (sql: unknown) => unknown) => {
    const sql = Object.assign(
      (s: TemplateStringsArray, ...vals: unknown[]) => {
        H.updateCalls.push(vals);
        return Promise.resolve(s.join("?").includes("UPDATE channel_accounts") ? [{ is_default: false }] : []);
      },
      { json: (v: unknown) => v },
    );
    return cb(sql);
  }),
}));

let tmpDir: string;
let tenantVideoDir: string;

beforeEach(() => {
  vi.resetModules();
  H.cred = null;
  H.updateCalls = [];
  H.tenantId = "tenant-1";
  process.env.OSMU_SECRET_KEY = "enc-key";
  tmpDir = createTempDir();
  setupTestEnv(tmpDir);
  // finding 6: 영상은 tenant-1의 격리 디렉터리(tenants/tenant-1/videos)에만 존재한다 — 공유
  // 루트(tmpDir/videos)에는 두지 않는다. publish 라우트가 module-scope 상수로 되돌아가면
  // 공유 루트를 보게 되므로 이 배치 자체가 회귀 감지 장치다.
  tenantVideoDir = path.join(tmpDir, "tenants", "tenant-1", "videos");
  fs.mkdirSync(tenantVideoDir, { recursive: true });
  fs.writeFileSync(path.join(tenantVideoDir, "x.mp4"), "fake-video-bytes");
});

afterEach(() => {
  delete process.env.OSMU_SECRET_KEY;
  delete process.env.YOUTUBE_CLIENT_ID;
  delete process.env.YOUTUBE_CLIENT_SECRET;
  vi.unstubAllGlobals();
  cleanupTestEnv(tmpDir);
});

describe("GET /api/youtube/status — 실 Google API bounded check", () => {
  it("DB에 토큰이 없으면 connected=false", async () => {
    const { GET } = await import("@/app/api/youtube/status/route");
    const res = await GET(new Request("http://localhost/api/youtube/status"));
    const body = await res.json();
    expect(body.connected).toBe(false);
  });

  it("finding 4: Google이 200이면 status=valid, connected=true", async () => {
    H.cred = { token: "AT", refreshToken: "RT", meta: {} };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [{ id: "c1" }] }) })));
    const { GET } = await import("@/app/api/youtube/status/route");
    const res = await GET(new Request("http://localhost/api/youtube/status"));
    const body = await res.json();
    expect(body.status).toBe("valid");
    expect(body.connected).toBe(true);
    expect(body.hasRefreshToken).toBe(true);
  });

  it("finding 4: Google 401이면 status=invalid, connected=false(fail-closed, DB에 토큰 문자열이 있어도 유효 단정 안 함)", async () => {
    H.cred = { token: "EXPIRED_AT", meta: {} };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: "invalid_token" }) })));
    const { GET } = await import("@/app/api/youtube/status/route");
    const res = await GET(new Request("http://localhost/api/youtube/status"));
    const body = await res.json();
    expect(body.status).toBe("invalid");
    expect(body.connected).toBe(false);
  });

  it("finding 4: 네트워크 오류/타임아웃이면 status=unverified(연결됐다고 fail-open 하지 않음)", async () => {
    H.cred = { token: "AT", meta: {} };
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const { GET } = await import("@/app/api/youtube/status/route");
    const res = await GET(new Request("http://localhost/api/youtube/status"));
    const body = await res.json();
    expect(body.status).toBe("unverified");
    expect(body.connected).toBe(false);
  });

  it("finding 4: Google 5xx도 unverified로 분류한다(invalid/valid 단정 금지)", async () => {
    H.cred = { token: "AT", meta: {} };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const { GET } = await import("@/app/api/youtube/status/route");
    const res = await GET(new Request("http://localhost/api/youtube/status"));
    const body = await res.json();
    expect(body.status).toBe("unverified");
  });

  it("finding 4: 응답 바디에 raw 토큰 문자열이 노출되지 않는다", async () => {
    H.cred = { token: "SUPER_SECRET_TOKEN_VALUE", meta: {} };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) })));
    const { GET } = await import("@/app/api/youtube/status/route");
    const res = await GET(new Request("http://localhost/api/youtube/status"));
    const text = await res.text();
    expect(text).not.toContain("SUPER_SECRET_TOKEN_VALUE");
  });
});

describe("POST /api/youtube/refresh — 공유 헬퍼(lib/youtube-token) 사용", () => {
  it("refresh token이 DB에 없으면 400 + 한국어 안내", async () => {
    const { POST } = await import("@/app/api/youtube/refresh/route");
    const res = await POST(new Request("http://localhost/api/youtube/refresh", { method: "POST" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("다시 연결");
  });

  it("성공 시 새 access_token을 DB integrations에 UPDATE한다(파일 아님)", async () => {
    H.cred = { token: "OLD_AT", refreshToken: "RT", meta: {} };
    process.env.YOUTUBE_CLIENT_ID = "cid";
    process.env.YOUTUBE_CLIENT_SECRET = "csecret";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "NEW_AT", expires_in: 3600 }),
    })));
    const { POST } = await import("@/app/api/youtube/refresh/route");
    const res = await POST(new Request("http://localhost/api/youtube/refresh", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(H.updateCalls).toHaveLength(1);
    expect(JSON.stringify(H.updateCalls[0])).toContain("NEW_AT");
  });

  it("갱신 응답에 expires_in이 없으면 새 token을 저장하지 않는다", async () => {
    H.cred = { token: "OLD_AT", refreshToken: "RT", meta: {}, accountId: "yt-acc-1" };
    process.env.YOUTUBE_CLIENT_ID = "cid";
    process.env.YOUTUBE_CLIENT_SECRET = "csecret";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "NEW_WITHOUT_EXPIRY" }),
    })));
    const { refreshYoutubeAccessToken } = await import("@/lib/youtube-token");
    const result = await refreshYoutubeAccessToken("tenant-1", "yt-acc-1");

    expect(result).toEqual(expect.objectContaining({ ok: false, status: 502 }));
    expect(H.updateCalls).toHaveLength(0);
  });

  it("선택 accountId의 암호화 access/refresh token만 갱신한다", async () => {
    H.cred = { token: "OLD_SELECTED", refreshToken: "RT_SELECTED", meta: {}, accountId: "yt-acc-2" };
    process.env.YOUTUBE_CLIENT_ID = "cid";
    process.env.YOUTUBE_CLIENT_SECRET = "csecret";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "NEW_SELECTED", expires_in: 3600 }),
    })));
    const { refreshYoutubeAccessToken } = await import("@/lib/youtube-token");
    const result = await refreshYoutubeAccessToken("tenant-1", "yt-acc-2");
    expect(result.ok).toBe(true);
    expect(JSON.stringify(H.updateCalls)).toContain("NEW_SELECTED");
    expect(JSON.stringify(H.updateCalls)).toContain("RT_SELECTED");
    expect(JSON.stringify(H.updateCalls)).toContain("yt-acc-2");
    const persistedExpiry = H.updateCalls.flat().find((value) =>
      typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now(),
    );
    expect(persistedExpiry).toBeDefined();
  });
});

describe("POST /api/video/publish — youtube 브랜치", () => {
  it("account_id를 getChannelCred의 선택 계정 인자로 전달한다", async () => {
    const { getChannelCred } = await import("@/lib/publish");
    const { POST } = await import("@/app/api/video/publish/route");
    await POST(new Request("http://localhost/api/video/publish", {
      method: "POST",
      body: JSON.stringify({ filename: "x.mp4", platform: "youtube", account_id: "yt-acc-2" }),
    }));
    expect(getChannelCred).toHaveBeenCalledWith("tenant-1", "youtube", "yt-acc-2");
  });

  it("finding 8: Missing DB credential은 정확히 400", async () => {
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(new Request("http://localhost/api/video/publish", {
      method: "POST",
      body: JSON.stringify({ filename: "x.mp4", platform: "youtube" }),
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("연결되지 않았습니다");
  });

  it("finding 8: 존재하지 않는 파일은 정확히 404", async () => {
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(new Request("http://localhost/api/video/publish", {
      method: "POST",
      body: JSON.stringify({ filename: "nonexistent.mp4", platform: "youtube" }),
    }));
    expect(res.status).toBe(404);
  });

  it("finding 6: 공유 루트(tmpDir/videos)에만 있고 tenant 격리 디렉터리엔 없는 파일은 404 — 테넌트 스코프 밖 파일을 읽지 않는다", async () => {
    fs.mkdirSync(path.join(tmpDir, "videos"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "videos", "shared-only.mp4"), "shared-bytes");
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(new Request("http://localhost/api/video/publish", {
      method: "POST",
      body: JSON.stringify({ filename: "shared-only.mp4", platform: "youtube" }),
    }));
    expect(res.status).toBe(404);
  });

  it("finding 6: path traversal 파일명은 400", async () => {
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(new Request("http://localhost/api/video/publish", {
      method: "POST",
      body: JSON.stringify({ filename: "../../etc/passwd", platform: "youtube" }),
    }));
    expect(res.status).toBe(400);
  });

  it("finding 5: 유효한 cred + video면 init 성공(Google mock) → 200 ok", async () => {
    H.cred = { token: "VALID_AT", meta: {} };
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url.toString());
      if (url.toString().includes("uploadType=resumable")) {
        return { ok: true, status: 200, headers: { get: () => "https://upload.example/session1" }, json: async () => ({}) };
      }
      if (url.toString().includes("upload.example")) {
        return { ok: true, status: 200, json: async () => ({ id: "VIDEO123" }) };
      }
      throw new Error(`unexpected fetch ${url}`);
    }));
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(new Request("http://localhost/api/video/publish", {
      method: "POST",
      body: JSON.stringify({ filename: "x.mp4", platform: "youtube" }),
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.videoId).toBe("VIDEO123");
  });

  it("upload PUT non-2xx는 video id가 든 JSON이어도 실패한다", async () => {
    H.cred = { token: "VALID_AT", meta: {} };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.toString().includes("uploadType=resumable")) {
        return { ok: true, status: 200, headers: { get: () => "https://upload.example/non-2xx" } };
      }
      return { ok: false, status: 500, json: async () => ({ id: "MUST_NOT_SUCCEED" }) };
    }));
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(new Request("http://localhost/api/video/publish", {
      method: "POST",
      body: JSON.stringify({ filename: "x.mp4", platform: "youtube" }),
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).not.toEqual(expect.objectContaining({ ok: true }));
  });

  it("upload PUT의 성공 응답이 invalid JSON이면 실패한다", async () => {
    H.cred = { token: "VALID_AT", meta: {} };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.toString().includes("uploadType=resumable")) {
        return { ok: true, status: 200, headers: { get: () => "https://upload.example/invalid-json" } };
      }
      return { ok: true, status: 201, json: async () => { throw new SyntaxError("invalid json"); } };
    }));
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(new Request("http://localhost/api/video/publish", {
      method: "POST",
      body: JSON.stringify({ filename: "x.mp4", platform: "youtube" }),
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).not.toEqual(expect.objectContaining({ ok: true }));
  });

  it("upload PUT의 성공 응답에 유효한 video id가 없으면 실패한다", async () => {
    H.cred = { token: "VALID_AT", meta: {} };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.toString().includes("uploadType=resumable")) {
        return { ok: true, status: 200, headers: { get: () => "https://upload.example/empty-id" } };
      }
      return { ok: true, status: 201, json: async () => ({ id: "   " }) };
    }));
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(new Request("http://localhost/api/video/publish", {
      method: "POST",
      body: JSON.stringify({ filename: "x.mp4", platform: "youtube" }),
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).not.toEqual(expect.objectContaining({ ok: true }));
  });

  it("finding 5: init에서 401이면 refresh 헬퍼를 정확히 1회 호출하고 1회만 재시도해 성공한다", async () => {
    H.cred = { token: "EXPIRED_AT", refreshToken: "RT", meta: {} };
    process.env.YOUTUBE_CLIENT_ID = "cid";
    process.env.YOUTUBE_CLIENT_SECRET = "csecret";
    let initCallCount = 0;
    let refreshCallCount = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.includes("oauth2.googleapis.com/token")) {
        refreshCallCount += 1;
        return { ok: true, status: 200, json: async () => ({ access_token: "REFRESHED_AT", expires_in: 3600 }) };
      }
      if (u.includes("uploadType=resumable")) {
        initCallCount += 1;
        if (initCallCount === 1) {
          return { ok: false, status: 401, headers: { get: () => null }, json: async () => ({ error: "invalid_grant" }) };
        }
        return { ok: true, status: 200, headers: { get: () => "https://upload.example/session2" }, json: async () => ({}) };
      }
      if (u.includes("upload.example")) {
        return { ok: true, status: 200, json: async () => ({ id: "VIDEO_RETRY" }) };
      }
      throw new Error(`unexpected fetch ${u}`);
    }));
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(new Request("http://localhost/api/video/publish", {
      method: "POST",
      body: JSON.stringify({ filename: "x.mp4", platform: "youtube" }),
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.videoId).toBe("VIDEO_RETRY");
    expect(refreshCallCount).toBe(1); // 정확히 1회 refresh — 재시도 루프 아님
    expect(initCallCount).toBe(2); // 최초 시도 + 재시도 1회, 그 이상 없음
    expect(H.updateCalls).toHaveLength(1); // refresh 헬퍼가 DB를 정확히 1회만 UPDATE
  });

  it("TikTok 발행은 미연결이면 구현 사칭 없이 연결 조치를 반환한다", async () => {
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(new Request("http://localhost/api/video/publish", {
      method: "POST",
      body: JSON.stringify({ filename: "x.mp4", platform: "tiktok" }),
    }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("TikTok 계정을 먼저 연결");
    expect(JSON.stringify(body)).not.toContain("not_implemented");
  });

  // SNS-015: Reels는 더 이상 501(미구현)이 아니다. 단 Instagram 미연결이면 "구현됨"인 척하지 않고
  // 조치 가능한 미연결 사유를 준다 — 정직한 비활성 상태는 유지된다.
  it("Reels는 Instagram 미연결이면 501이 아니라 조치 가능한 미연결 사유를 반환한다", async () => {
    H.cred = null;
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(new Request("http://localhost/api/video/publish", {
      method: "POST",
      body: JSON.stringify({ filename: "x.mp4", platform: "reels" }),
    }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("Instagram");
    expect(JSON.stringify(body)).not.toContain("not_implemented");
  });
});
