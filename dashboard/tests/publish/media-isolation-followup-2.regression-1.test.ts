import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// 2026-09-26 독립 보안 리뷰(BLOCK, MAJOR 2 / MINOR 4) 재발 방지.
//
// MAJOR-1 — tenantScopedVideosDir이 null(운영자)일 때만 공유 폴더를 돌려주게 바뀐 뒤,
// video/delete·video/publish가 여전히 `resolveGeneratedFile(tenantId || "", ...)`로
// 빈 문자열을 넘겼다. generatedMediaDirs가 null(운영자)과 ""(형식 오류)를 다르게 처리하게
// 되면서, 빈 문자열이 "형식 오류"로 분류돼 운영자의 삭제·발행이 통째로 404/not-found가 됐다
// (리뷰어 탐침 P1). resolveGeneratedFile 시그니처를 (string | null, ...)로 바꾸고 두 라우트의
// `|| ""`를 제거했다.
//
// MAJOR-2 — clipping.ts가 외부 제공자가 돌려주는 clipId로 파일명을 만들고(`clip-${clipId}-...`)
// path.join했다. clipId가 "x/../../../<B>/videos/pwn"이면 테넌트 A의 요청이 테넌트 B의
// 폴더에 파일을 쓴다(리뷰어 탐침 P9). 파일명을 crypto.randomUUID() 기반으로 바꾸고
// containment 검사를 추가했다.
//
// MINOR-4 — isVideoFilename(".mp4")가 true였다(이름 없는 파일을 영상으로 인정).

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const H = vi.hoisted(() => ({ tenantId: null as string | null }));
vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => H.tenantId) }));

let root: string;
const vd = (t: string) => path.join(root, "tenants", t, "videos");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "media-followup2-"));
  process.env.DATA_DIR = root;
  process.env.MEDIA_SIGNING_SECRET = "test-media-signing-secret-0123456789";
  fs.mkdirSync(vd(A), { recursive: true });
  fs.mkdirSync(vd(B), { recursive: true });
  fs.mkdirSync(path.join(root, "videos"), { recursive: true });
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.MEDIA_SIGNING_SECRET;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MAJOR-1 — 운영자(null) 요청이 `|| \"\"` 때문에 차단되지 않는다", () => {
  it("resolveGeneratedFile(null, ...)은 공유 파일을 찾지만, resolveGeneratedFile(\"\", ...)은 형식 오류로 차단한다(둘이 다르다는 것 자체가 계약)", async () => {
    fs.writeFileSync(path.join(root, "videos", "shared.mp4"), "S");
    const { resolveGeneratedFile } = await import("@/lib/storage");
    expect(resolveGeneratedFile(null, "shared.mp4")).toBe(path.join(root, "videos", "shared.mp4"));
    expect(resolveGeneratedFile("", "shared.mp4")).toBeNull();
  });

  it("운영자(null) delete는 200이고 공유 폴더 파일이 실제로 지워진다", async () => {
    H.tenantId = null;
    fs.writeFileSync(path.join(root, "videos", "shared.mp4"), "S");
    const { POST } = await import("@/app/api/video/delete/route");
    const res = await POST(
      new Request("http://internal.local/api/video/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "shared.mp4" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(root, "videos", "shared.mp4"))).toBe(false);
  });

  it("운영자(null) list는 여전히 공유 폴더 파일을 본다(회귀 없음)", async () => {
    H.tenantId = null;
    fs.writeFileSync(path.join(root, "videos", "shared.mp4"), "S");
    const { GET } = await import("@/app/api/video/list/route");
    const res = await GET(new Request("http://internal.local/api/video/list"));
    const json = (await res.json()) as { videos: Array<{ filename: string }> };
    expect(json.videos.map((v) => v.filename)).toEqual(["shared.mp4"]);
  });

  it("돌연변이 검증: delete/route.ts가 `tenantId || \"\"`로 되돌아가면 운영자 삭제가 다시 404가 된다", async () => {
    const routeSrc = fs.readFileSync(
      path.resolve(__dirname, "../../src/app/api/video/delete/route.ts"),
      "utf8",
    );
    expect(routeSrc).not.toMatch(/resolveGeneratedFile\(\s*tenantId\s*\|\|\s*""/);
    const publishSrc = fs.readFileSync(
      path.resolve(__dirname, "../../src/app/api/video/publish/route.ts"),
      "utf8",
    );
    expect(publishSrc).not.toMatch(/resolveGeneratedFile\(\s*tenantId\s*\|\|\s*""/);
  });
});

describe("MAJOR-2 — 제공자 clipId로 경로를 이탈할 수 없다(리뷰어 P9 재현)", () => {
  it("악성 clipId(\"x/../../../<B>/videos/pwn\")를 돌려줘도 B 폴더는 그대로이고 A 폴더에만 UUID 파일명으로 저장된다", async () => {
    H.tenantId = A;
    fs.writeFileSync(path.join(root, "clipping-config.json"), JSON.stringify({ provider: "reap", apiKey: "k" }));
    const maliciousId = `x/../../../${B}/videos/pwn`;
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/clips")) return { ok: true, json: async () => ({ projectId: "p1" }) } as Response;
      if (url.includes("/status/")) return { ok: true, json: async () => ({ status: "completed" }) } as Response;
      if (url.endsWith("/clips/p1")) {
        return {
          ok: true,
          json: async () => ({ clips: [{ id: maliciousId, url: "https://example.com/c.mp4" }] }),
        } as Response;
      }
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const bBefore = fs.readdirSync(vd(B));

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
      const json = (await res.json()) as { ok: boolean; clips: Array<{ url: string; localSaveFailed?: boolean }> };

      expect(res.status).toBe(200);
      // B 폴더는 손대지 않았다 — 이 malicious id가 실제로 경로를 이탈했다면 pwn 같은
      // 새 파일이나 삭제·덮어쓰기가 생긴다.
      expect(fs.readdirSync(vd(B))).toEqual(bBefore);
      expect(fs.existsSync(path.join(root, "tenants", B, "videos", "pwn"))).toBe(false);
      // A 폴더에는 clipId와 무관한 UUID 파일명으로만 저장됐다.
      const aFiles = fs.readdirSync(vd(A));
      expect(aFiles.some((f) => /^clip-[0-9a-f-]{36}\.mp4$/.test(f))).toBe(true);
      expect(aFiles.some((f) => f.includes("pwn"))).toBe(false);
      expect(json.clips[0].url).not.toContain("pwn");
      expect(json.clips[0].localSaveFailed).not.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  }, 10000);

  it("돌연변이 검증: clipping.ts가 clipId를 파일명에 다시 섞으면(주석·소스 가드) 이 회귀가 재발한다", async () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/lib/clipping.ts"), "utf8");
    expect(src).toMatch(/crypto\.randomUUID\(\)/);
    // downloadClipToLocal의 실제 시그니처(주석은 clipId 함정을 설명하려고 옛 코드를
    // 인용할 수 있으므로 함수 정의 자체만 본다)에 clipId 파라미터가 없어야 한다.
    const fnDef = src.slice(src.indexOf("async function downloadClipToLocal"));
    const signature = fnDef.slice(0, fnDef.indexOf(")") + 1);
    expect(signature).not.toMatch(/clipId/);
    expect(src).not.toMatch(/downloadClipToLocal\([^)]*,\s*c\.id\s*,/);
  });
});

describe("MINOR-2 — 로컬 저장 실패를 조용히 원본 URL로 감추지 않는다(ADR-007)", () => {
  it("다운로드가 실패하면 응답에 localSaveFailed:true가 실린다", async () => {
    H.tenantId = A;
    fs.writeFileSync(path.join(root, "clipping-config.json"), JSON.stringify({ provider: "reap", apiKey: "k" }));
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/clips")) return { ok: true, json: async () => ({ projectId: "p1" }) } as Response;
      if (url.includes("/status/")) return { ok: true, json: async () => ({ status: "completed" }) } as Response;
      if (url.endsWith("/clips/p1")) {
        return { ok: true, json: async () => ({ clips: [{ id: "c1", url: "https://example.com/c.mp4" }] }) } as Response;
      }
      // 클립 바이트 다운로드만 실패시킨다.
      return { ok: false, status: 502, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
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
      expect(res.status).toBe(200);
      expect(json.clips[0].localSaveFailed).toBe(true);
      expect(json.clips[0].url).toBe("https://example.com/c.mp4"); // 원본으로 폴백했지만 표식이 있다
    } finally {
      vi.useRealTimers();
    }
  }, 10000);
});

describe("MINOR-3 — 사설·루프백 호스트로의 클립 다운로드(SSRF)를 막는다", () => {
  it.each([
    ["http://127.0.0.1/secret.mp4", "loopback"],
    ["http://169.254.169.254/latest/meta-data", "cloud metadata"],
    ["http://10.0.0.5/x.mp4", "private 10/8"],
    ["http://192.168.1.5/x.mp4", "private 192.168/16"],
    ["file:///etc/hosts", "file scheme"],
  ])("%s(%s)는 fetch를 부르지 않고 localSaveFailed:true로 닫는다", async (maliciousUrl) => {
    H.tenantId = A;
    fs.writeFileSync(path.join(root, "clipping-config.json"), JSON.stringify({ provider: "reap", apiKey: "k" }));
    const fetchMock = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.endsWith("/clips")) return { ok: true, json: async () => ({ projectId: "p1" }) } as Response;
      if (url.includes("/status/")) return { ok: true, json: async () => ({ status: "completed" }) } as Response;
      if (url.endsWith("/clips/p1")) {
        return { ok: true, json: async () => ({ clips: [{ id: "c1", url: maliciousUrl }] }) } as Response;
      }
      // 이 지점까지 오면 SSRF 방어가 뚫린 것이다 — 실제로 fetch를 태운다.
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response;
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
      expect(res.status).toBe(200);
      expect(json.clips[0].localSaveFailed).toBe(true);
      // 이 URL로는 fetch가 절대 불리지 않는다(스킴/사설-루프백 검사가 먼저 막는다).
      expect(fetchMock.mock.calls.some((c) => String(c[0]) === maliciousUrl)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  }, 10000);
});

describe("MINOR-4 — 이름 없는 파일(.mp4 자체)을 영상으로 인정하지 않는다(리뷰어 P7)", () => {
  it.each([".mp4", "..mp4", "...mp4"])("isVideoFilename(%s) === false", async (name) => {
    const { isVideoFilename } = await import("@/lib/media-token");
    expect(isVideoFilename(name)).toBe(false);
  });

  it("정상 파일명은 여전히 true(회귀 없음)", async () => {
    const { isVideoFilename } = await import("@/lib/media-token");
    expect(isVideoFilename("a.mp4")).toBe(true);
    expect(isVideoFilename("vid_123.mp4")).toBe(true);
  });
});
