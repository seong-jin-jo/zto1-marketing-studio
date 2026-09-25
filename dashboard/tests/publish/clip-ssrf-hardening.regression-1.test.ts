import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import http from "http";

// 2026-09-26 재리뷰(MINOR 5건) 재발 방지. PR #89(580251fe, main 머지)가 SSRF를 정규식으로
// 막았는데, 리뷰어가 IPv4-mapped IPv6 리터럴(`[::ffff:127.0.0.1]`, `[::ffff:a9fe:a9fe]`)로
// 우회를 실측했다 — 루프백 서버 응답 본문이 실제로 테넌트 폴더에 저장됐다. 정규식을
// net.isIP + net.BlockList로 바꾸고, 리다이렉트 재검증, DNS 리바인딩(connect.lookup 훅),
// fc/fd 접두 오탐(일반 도메인 차단), 저장 직전 폴더 안전성(P11 심볼릭 링크) 5건을 고친다.

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const H = vi.hoisted(() => ({ tenantId: null as string | null }));
vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => H.tenantId) }));

let root: string;
const realFetch = globalThis.fetch;
const vd = (t: string) => path.join(root, "tenants", t, "videos");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ssrf-hardening-"));
  process.env.DATA_DIR = root;
  process.env.MEDIA_SIGNING_SECRET = "test-media-signing-secret-0123456789";
  fs.mkdirSync(vd(A), { recursive: true });
  fs.mkdirSync(vd(B), { recursive: true });
  fs.mkdirSync(path.join(root, "videos"), { recursive: true });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.MEDIA_SIGNING_SECRET;
});

/**
 * repurpose 라우트를 통해 clipUrl 하나를 실제로 다운로드시킨다. Reap API 호출(생성/폴링/조회)만
 * 목으로 가로채고, 클립 바이트 다운로드(clipUrl 자체)는 실제 fetch로 흘려보낸다 — 그래야
 * SSRF 방어가 실제 undici 경로(dispatcher·리다이렉트 처리 포함)를 통과하는지 확인할 수 있다.
 */
async function repurpose(clipUrl: string, clipId = "c1") {
  fs.writeFileSync(path.join(root, "clipping-config.json"), JSON.stringify({ provider: "reap", apiKey: "k" }));
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: any, init?: any) => {
      const url = String(u);
      calls.push(url);
      if (url.startsWith("https://api.reap.video")) {
        if (url.endsWith("/clips")) return { ok: true, json: async () => ({ projectId: "p1" }) } as any;
        if (url.includes("/status/")) return { ok: true, json: async () => ({ status: "completed" }) } as any;
        if (url.endsWith("/clips/p1")) return { ok: true, json: async () => ({ clips: [{ id: clipId, url: clipUrl }] }) } as any;
      }
      return realFetch(u, init);
    }),
  );
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    const { POST } = await import("@/app/api/video/repurpose/route");
    const p = POST(
      new Request("http://internal.local/api/video/repurpose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoUrl: "https://youtube.com/watch?v=x" }),
      }),
    );
    await vi.advanceTimersByTimeAsync(3000);
    const r = await p;
    return { status: r.status, clips: (await r.json() as any).clips, calls };
  } finally {
    vi.useRealTimers();
  }
}

describe("MINOR-1 — IPv4-mapped IPv6로 SSRF 필터를 우회할 수 없다(리뷰어 P10 재현)", () => {
  it("단위: isSafeExternalMediaUrl이 ::ffff: 점표기·16진표기 루프백/메타데이터를 모두 거부한다", async () => {
    const { isSafeExternalMediaUrl } = await import("@/lib/clipping");
    // ::ffff:127.0.0.1 (점표기 IPv4-mapped 루프백)
    expect(isSafeExternalMediaUrl("http://[::ffff:127.0.0.1]/x")).toBe(false);
    // ::ffff:7f00:1 (16진표기 IPv4-mapped, 7f00:1 = 127.0.0.1)
    expect(isSafeExternalMediaUrl("http://[::ffff:7f00:1]/x")).toBe(false);
    // ::ffff:a9fe:a9fe (16진표기, a9fe:a9fe = 169.254.169.254 클라우드 메타데이터)
    expect(isSafeExternalMediaUrl("http://[::ffff:a9fe:a9fe]/x")).toBe(false);
    // 순수 IPv6 루프백·링크로컬·ULA
    expect(isSafeExternalMediaUrl("http://[::1]/x")).toBe(false);
    expect(isSafeExternalMediaUrl("http://[fe80::1]/x")).toBe(false);
    expect(isSafeExternalMediaUrl("http://[fc00::1]/x")).toBe(false);
    // 정상 공개 IPv6는 통과
    expect(isSafeExternalMediaUrl("http://[2606:4700::1]/x")).toBe(true);
  });

  it("단위: URL 파서가 정규화하는 10진·8진 IPv4 루프백 표기도 막는다", async () => {
    const { isSafeExternalMediaUrl } = await import("@/lib/clipping");
    expect(isSafeExternalMediaUrl("http://2130706433/x")).toBe(false); // 127.0.0.1의 10진수
    expect(isSafeExternalMediaUrl("http://0177.0.0.1/x")).toBe(false); // 127.0.0.1의 8진수
    expect(isSafeExternalMediaUrl("HTTP://127.0.0.1/x")).toBe(false); // 대문자 스킴
  });

  it("실측: 루프백 HTTP 서버에 ::ffff: 리터럴로 접근해도 서버가 요청을 못 받고, 응답이 저장되지 않는다", async () => {
    H.tenantId = A;
    let hits = 0;
    const srv = http.createServer((_, res) => {
      hits++;
      res.end("SECRET-METADATA");
    }).listen(0, "127.0.0.1");
    await new Promise((r) => srv.once("listening", r));
    const port = (srv.address() as any).port;

    for (const clipUrl of [
      `http://[::ffff:127.0.0.1]:${port}/x`,
      `http://[::ffff:7f00:1]:${port}/x`,
    ]) {
      vi.resetModules();
      const before = hits;
      const r = await repurpose(clipUrl);
      expect(hits).toBe(before); // 서버는 단 한 번도 맞지 않았다
      expect(r.clips[0]?.localSaveFailed).toBe(true);
      const saved = fs.readdirSync(vd(A)).filter((f) => f.startsWith("clip-"));
      expect(saved).toEqual([]); // SECRET-METADATA가 파일로 저장되지 않았다
    }
    srv.close();
  }, 20000);
});

describe("MINOR-1b — fc/fd 접두 오탐 수정: 일반 도메인은 막지 않는다", () => {
  it("fdn.example.com처럼 fd로 시작하는 도메인은 IP 리터럴이 아니므로 차단되지 않는다", async () => {
    const { isPrivateOrLoopbackHost, isSafeExternalMediaUrl } = await import("@/lib/clipping");
    expect(isPrivateOrLoopbackHost("fdn.example.com")).toBe(false);
    expect(isPrivateOrLoopbackHost("fc-media.example.net")).toBe(false);
    expect(isSafeExternalMediaUrl("https://fdn.example.com/clip.mp4")).toBe(true);
  });

  it("실제 fd/fc IPv6 리터럴은 여전히 차단된다(회귀 없음)", async () => {
    const { isPrivateOrLoopbackHost } = await import("@/lib/clipping");
    expect(isPrivateOrLoopbackHost("[fd00::1]")).toBe(true);
    expect(isPrivateOrLoopbackHost("[fc00::1]")).toBe(true);
  });
});

describe("MINOR-2 — 리다이렉트마다 재검증하고 최대 3회만 따라간다", () => {
  it("공개 URL 체인(3회 이내)은 정상 다운로드된다", async () => {
    H.tenantId = A;
    fs.writeFileSync(path.join(root, "clipping-config.json"), JSON.stringify({ provider: "reap", apiKey: "k" }));
    const hops = ["https://hop0.example/a", "https://hop1.example/b", "https://hop2.example/c", "https://hop3.example/final.mp4"];
    const fetchMock = vi.fn(async (u: any) => {
      const url = String(u);
      if (url.endsWith("/clips")) return { ok: true, json: async () => ({ projectId: "p1" }) } as any;
      if (url.includes("/status/")) return { ok: true, json: async () => ({ status: "completed" }) } as any;
      if (url.endsWith("/clips/p1")) return { ok: true, json: async () => ({ clips: [{ id: "c1", url: hops[0] }] }) } as any;
      const idx = hops.indexOf(url);
      if (idx >= 0 && idx < hops.length - 1) {
        return { status: 302, ok: false, headers: new Headers({ location: hops[idx + 1] }) } as any;
      }
      if (url === hops[hops.length - 1]) {
        return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("VIDEO-BYTES").buffer } as any;
      }
      throw new Error("unexpected fetch " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    try {
      const { POST } = await import("@/app/api/video/repurpose/route");
      const p = POST(
        new Request("http://internal.local/api/video/repurpose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoUrl: "https://youtube.com/watch?v=x" }),
        }),
      );
      await vi.advanceTimersByTimeAsync(3000);
      const res = await p;
      const json = (await res.json()) as { clips: Array<{ url: string; localSaveFailed?: boolean }> };
      expect(json.clips[0].localSaveFailed).not.toBe(true);
      const saved = fs.readdirSync(vd(A)).filter((f) => f.startsWith("clip-"));
      expect(saved.length).toBe(1);
      expect(fs.readFileSync(path.join(vd(A), saved[0]), "utf8")).toBe("VIDEO-BYTES");
    } finally {
      vi.useRealTimers();
    }
  }, 10000);

  it("리다이렉트가 4회를 넘으면 닫는다(too many redirects)", async () => {
    H.tenantId = A;
    fs.writeFileSync(path.join(root, "clipping-config.json"), JSON.stringify({ provider: "reap", apiKey: "k" }));
    let hopCount = 0;
    const fetchMock = vi.fn(async (u: any) => {
      const url = String(u);
      if (url.endsWith("/clips")) return { ok: true, json: async () => ({ projectId: "p1" }) } as any;
      if (url.includes("/status/")) return { ok: true, json: async () => ({ status: "completed" }) } as any;
      if (url.endsWith("/clips/p1")) return { ok: true, json: async () => ({ clips: [{ id: "c1", url: "https://loop.example/0" }] }) } as any;
      // 라우트가 클립 개수를 사용량 API로 relay하는 별도 fetch — 리다이렉트 카운트와 무관.
      if (url.includes("/api/usage/record")) return { ok: true, json: async () => ({}) } as any;
      // 무한히 다음 hop으로 리다이렉트한다.
      hopCount++;
      return { status: 302, ok: false, headers: new Headers({ location: `https://loop.example/${hopCount}` }) } as any;
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    try {
      const { POST } = await import("@/app/api/video/repurpose/route");
      const p = POST(
        new Request("http://internal.local/api/video/repurpose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoUrl: "https://youtube.com/watch?v=x" }),
        }),
      );
      await vi.advanceTimersByTimeAsync(3000);
      const res = await p;
      const json = (await res.json()) as { clips: Array<{ localSaveFailed?: boolean }> };
      expect(json.clips[0].localSaveFailed).toBe(true);
      // 최대 3회(hop 0~3, 총 4번의 fetch 시도)만 따라가고 닫는다 — 무한 루프가 아니다.
      expect(hopCount).toBeLessThanOrEqual(4);
    } finally {
      vi.useRealTimers();
    }
  }, 10000);

  it("리다이렉트 Location이 사설 IP를 가리키면 그 hop에서 막힌다", async () => {
    H.tenantId = A;
    fs.writeFileSync(path.join(root, "clipping-config.json"), JSON.stringify({ provider: "reap", apiKey: "k" }));
    let privateHostHit = false;
    const fetchMock = vi.fn(async (u: any) => {
      const url = String(u);
      if (url.endsWith("/clips")) return { ok: true, json: async () => ({ projectId: "p1" }) } as any;
      if (url.includes("/status/")) return { ok: true, json: async () => ({ status: "completed" }) } as any;
      if (url.endsWith("/clips/p1")) return { ok: true, json: async () => ({ clips: [{ id: "c1", url: "https://public.example/redirect" }] }) } as any;
      if (url === "https://public.example/redirect") {
        return { status: 302, ok: false, headers: new Headers({ location: "http://169.254.169.254/latest/meta-data" }) } as any;
      }
      if (url.includes("169.254.169.254")) {
        privateHostHit = true;
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as any;
      }
      throw new Error("unexpected fetch " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    try {
      const { POST } = await import("@/app/api/video/repurpose/route");
      const p = POST(
        new Request("http://internal.local/api/video/repurpose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoUrl: "https://youtube.com/watch?v=x" }),
        }),
      );
      await vi.advanceTimersByTimeAsync(3000);
      const res = await p;
      const json = (await res.json()) as { clips: Array<{ localSaveFailed?: boolean }> };
      expect(json.clips[0].localSaveFailed).toBe(true);
      expect(privateHostHit).toBe(false); // 사설 IP로는 fetch가 절대 나가지 않았다
    } finally {
      vi.useRealTimers();
    }
  }, 10000);
});

describe("MINOR-3 — 저장 직전 폴더 안전성 확인(리뷰어 P11: tenants/A/videos가 B로 가는 링크)", () => {
  it("A의 videos 폴더가 B로 가는 심볼릭 링크면 클립을 저장하지 않고 localSaveFailed로 닫는다", async () => {
    fs.rmSync(vd(A), { recursive: true });
    fs.symlinkSync(vd(B), vd(A));
    H.tenantId = A;
    const bBefore = fs.readdirSync(fs.realpathSync(vd(B)));

    // 실제 네트워크 없이도(그래서 SSRF 필터와는 독립적으로) 이 검사 하나만 겨눈다 —
    // clipUrl은 isSafeExternalMediaUrl을 통과하는 공개 호스트처럼 보이는 값으로 두고,
    // 클립 바이트 다운로드 자체를 직접 목으로 성공시켜서 "다운로드는 됐는데 저장 직전에
    // 막히는가"만 본다. (repurpose() 헬퍼는 미매칭 URL을 realFetch로 흘려보내 실제
    // 네트워크가 필요해지므로, 이 테스트는 자체 fetch mock을 쓴다.)
    fs.writeFileSync(path.join(root, "clipping-config.json"), JSON.stringify({ provider: "reap", apiKey: "k" }));
    const fetchMock = vi.fn(async (u: any) => {
      const url = String(u);
      if (url.endsWith("/clips")) return { ok: true, json: async () => ({ projectId: "p1" }) } as any;
      if (url.includes("/status/")) return { ok: true, json: async () => ({ status: "completed" }) } as any;
      if (url.endsWith("/clips/p1")) {
        return { ok: true, json: async () => ({ clips: [{ id: "c1", url: "https://example.com/c.mp4" }] }) } as any;
      }
      if (url.includes("/api/usage/record")) return { ok: true, json: async () => ({}) } as any;
      if (url === "https://example.com/c.mp4") {
        return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode("SHOULD-NOT-LAND-IN-B").buffer } as any;
      }
      throw new Error("unexpected fetch " + url);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    let r: { status: number; clips: Array<{ localSaveFailed?: boolean }> };
    try {
      const { POST } = await import("@/app/api/video/repurpose/route");
      const p = POST(
        new Request("http://internal.local/api/video/repurpose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoUrl: "https://youtube.com/watch?v=x" }),
        }),
      );
      await vi.advanceTimersByTimeAsync(3000);
      const res = await p;
      r = { status: res.status, clips: (await res.json() as any).clips };
    } finally {
      vi.useRealTimers();
    }

    expect(r.status).toBe(200);
    expect(r.clips[0]?.localSaveFailed).toBe(true);
    // B 폴더(A의 링크가 실제로 가리키는 곳)에는 새 파일이 생기지 않았다 — 다운로드
    // 자체는 성공했는데도(목으로 200을 줬는데도) 저장 직전 안전성 검사가 막았다는 뜻이다.
    expect(fs.readdirSync(fs.realpathSync(vd(B)))).toEqual(bBefore);
  }, 15000);
});

describe("MINOR-4 — 운영자(null)로 /api/video/publish를 부르는 라우트 수준 회귀 테스트", () => {
  it("운영자(null) + 공유 폴더 파일은 'video not found'(파일 못 찾음)로 막히지 않는다", async () => {
    H.tenantId = null;
    fs.writeFileSync(path.join(root, "videos", "shared.mp4"), "S");
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(
      new Request("http://internal.local/api/video/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "shared.mp4", platform: "youtube" }),
      }),
    );
    const json = (await res.json()) as { error?: string };
    // MAJOR-1(이전 판)이 재발하면 여기서 404 "video not found"가 나온다. 파일을 찾았다면
    // youtube 분기가 그 다음 검사(운영자는 테넌트가 없어 youtube 업로드를 못 한다)에서
    // 걸린다 — 이 400은 "파일을 찾았다"는 증거이지 이 테스트의 실패가 아니다.
    expect(res.status).not.toBe(404);
    expect(json.error).not.toBe("video not found");
    expect(res.status).toBe(400);
    expect(json.error).toContain("테넌트를 확인할 수 없습니다");
  });
});
