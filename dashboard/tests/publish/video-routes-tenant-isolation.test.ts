import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// SNS-015 BLOCKER #2: /api/video/{list,upload,delete,generate,publish}가 effectiveTenantId +
// runWithTenant로 격리되어 있는지 — 테넌트 A의 요청이 테넌트 B의 파일을 절대 보거나 지우지
// 못하고, module-scope dataPath()로 회귀(모든 테넌트가 같은 공유 경로를 쓰는 구멍, finding 6)
// 하지 않았는지를 다섯 라우트 전부에서 직접 확인한다.

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const H = vi.hoisted(() => ({ tenantId: null as string | null }));
vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => H.tenantId) }));

let tmpRoot: string;

function tenantVideosDir(tenant: string) {
  return path.join(tmpRoot, "tenants", tenant, "videos");
}

function studioVideosDir(tenant: string) {
  return path.join(tmpRoot, "studio", tenant);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-video-iso-"));
  process.env.DATA_DIR = tmpRoot;
  process.env.MEDIA_SIGNING_SECRET = "test-media-signing-secret-0123456789";
  fs.mkdirSync(tenantVideosDir(TENANT_A), { recursive: true });
  fs.mkdirSync(tenantVideosDir(TENANT_B), { recursive: true });
  fs.writeFileSync(path.join(tenantVideosDir(TENANT_A), "a-only.mp4"), Buffer.alloc(10, 1));
  fs.writeFileSync(path.join(tenantVideosDir(TENANT_B), "b-only.mp4"), Buffer.alloc(10, 2));
  H.tenantId = TENANT_A;
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.MEDIA_SIGNING_SECRET;
  vi.restoreAllMocks();
});

describe("/api/video/list — 테넌트 격리", () => {
  it("A로 요청하면 A의 파일만 보이고, B 파일명/테넌트ID는 URL에 없다", async () => {
    const { GET } = await import("@/app/api/video/list/route");
    const res = await GET(new Request("http://internal.local/api/video/list"));
    const json = (await res.json()) as { videos: Array<{ filename: string; url: string }> };
    expect(json.videos.map((v) => v.filename)).toEqual(["a-only.mp4"]);
    expect(json.videos[0].url).toMatch(/^\/api\/media\//);
    expect(json.videos[0].url).not.toContain("a-only.mp4");
    expect(json.videos[0].url).not.toContain(TENANT_A);
  });

  it("VIDEO-LIST-STUDIO-01 작업 공간 폴더에만 있는 생성실 영상을 최신순 목록과 서명 URL로 준다", async () => {
    fs.mkdirSync(studioVideosDir(TENANT_A), { recursive: true });
    fs.writeFileSync(path.join(studioVideosDir(TENANT_A), "vid_200.mp4"), Buffer.alloc(12, 4));
    fs.utimesSync(path.join(tenantVideosDir(TENANT_A), "a-only.mp4"), new Date(100_000), new Date(100_000));
    fs.utimesSync(path.join(studioVideosDir(TENANT_A), "vid_200.mp4"), new Date(200_000), new Date(200_000));

    const { GET } = await import("@/app/api/video/list/route");
    const res = await GET(new Request("http://internal.local/api/video/list"));
    const json = (await res.json()) as { videos: Array<{ filename: string; url: string; size: number }> };

    expect(json.videos.map((video) => video.filename)).toEqual(["vid_200.mp4", "a-only.mp4"]);
    expect(json.videos[0]).toMatchObject({ filename: "vid_200.mp4", size: 12 });
    expect(json.videos[0].url).toMatch(/^\/api\/media\//);
    expect(json.videos[0].url).not.toContain("vid_200.mp4");
    expect(json.videos[0].url).not.toContain(TENANT_A);
  });

  it("VIDEO-LIST-STUDIO-02 다른 작업 공간의 생성실 영상은 파일명이 알려져도 노출하지 않는다", async () => {
    fs.mkdirSync(studioVideosDir(TENANT_A), { recursive: true });
    fs.mkdirSync(studioVideosDir(TENANT_B), { recursive: true });
    fs.writeFileSync(path.join(studioVideosDir(TENANT_A), "a-studio.mp4"), Buffer.alloc(7, 5));
    fs.writeFileSync(path.join(studioVideosDir(TENANT_B), "b-studio.mp4"), Buffer.alloc(8, 6));

    const { GET } = await import("@/app/api/video/list/route");
    const res = await GET(new Request("http://internal.local/api/video/list"));
    const json = (await res.json()) as { videos: Array<{ filename: string }> };

    expect(json.videos.map((video) => video.filename)).toContain("a-studio.mp4");
    expect(json.videos.map((video) => video.filename)).not.toContain("b-studio.mp4");
  });

  it("VIDEO-LIST-STUDIO-03 같은 파일명이 두 폴더에 있으면 다른 파일로 갈아타지 않게 목록·배달 모두 거부한다", async () => {
    fs.mkdirSync(studioVideosDir(TENANT_A), { recursive: true });
    fs.writeFileSync(path.join(tenantVideosDir(TENANT_A), "same.mp4"), Buffer.alloc(11, 7));
    fs.writeFileSync(path.join(studioVideosDir(TENANT_A), "same.mp4"), Buffer.alloc(22, 8));
    fs.utimesSync(path.join(tenantVideosDir(TENANT_A), "same.mp4"), new Date(100_000), new Date(100_000));
    fs.utimesSync(path.join(studioVideosDir(TENANT_A), "same.mp4"), new Date(200_000), new Date(200_000));

    const { GET } = await import("@/app/api/video/list/route");
    const { resolveGeneratedFile } = await import("@/lib/storage");
    const { runWithTenant } = await import("@/lib/tenant-context");
    const res = await GET(new Request("http://internal.local/api/video/list"));
    const json = (await res.json()) as { videos: Array<{ filename: string; size: number; createdAt: number }> };
    expect(json.videos.map((video) => video.filename)).not.toContain("same.mp4");
    expect(runWithTenant(TENANT_A, () => resolveGeneratedFile(TENANT_A, "same.mp4"))).toBeNull();
  });

  it("VIDEO-LIST-STUDIO-05 다른 작업 공간 파일을 가리키는 심볼릭 링크는 목록·배달에서 거부한다", async () => {
    const linkedName = "linked-secret.mp4";
    fs.symlinkSync(
      path.join(tenantVideosDir(TENANT_B), "b-only.mp4"),
      path.join(tenantVideosDir(TENANT_A), linkedName),
    );

    const { GET } = await import("@/app/api/video/list/route");
    const { resolveGeneratedFile } = await import("@/lib/storage");
    const { runWithTenant } = await import("@/lib/tenant-context");
    const res = await GET(new Request("http://internal.local/api/video/list"));
    const json = (await res.json()) as { videos: Array<{ filename: string }> };

    expect(json.videos.map((video) => video.filename)).not.toContain(linkedName);
    expect(runWithTenant(TENANT_A, () => resolveGeneratedFile(TENANT_A, linkedName))).toBeNull();
  });

  it("VIDEO-LIST-STUDIO-06 다른 작업 공간 폴더를 가리키는 링크는 목록·배달·삭제에서 모두 거부한다", async () => {
    const linkedName = "directory-linked.mp4";
    fs.mkdirSync(studioVideosDir(TENANT_B), { recursive: true });
    fs.writeFileSync(path.join(studioVideosDir(TENANT_B), linkedName), Buffer.alloc(13, 9));
    fs.symlinkSync(studioVideosDir(TENANT_B), studioVideosDir(TENANT_A));

    const { GET: listVideos } = await import("@/app/api/video/list/route");
    const listRes = await listVideos(new Request("http://internal.local/api/video/list"));
    const listJson = (await listRes.json()) as { videos: Array<{ filename: string }> };
    expect(listJson.videos.map((video) => video.filename)).not.toContain(linkedName);

    const { signMediaToken } = await import("@/lib/media-token");
    const { GET: deliverMedia } = await import("@/app/api/media/[token]/route");
    const token = signMediaToken(TENANT_A, linkedName)!;
    const deliveryRes = await deliverMedia(new Request(`http://internal.local/api/media/${token}`), {
      params: Promise.resolve({ token }),
    });
    expect(deliveryRes.status).toBe(404);

    const { POST: deleteVideo } = await import("@/app/api/video/delete/route");
    const deleteRes = await deleteVideo(
      new Request("http://internal.local/api/video/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: linkedName }),
      }),
    );
    expect(deleteRes.status).toBe(404);
    expect(fs.existsSync(path.join(studioVideosDir(TENANT_B), linkedName))).toBe(true);
  });

  it("B로 요청하면 B의 파일만 보인다 — A 파일이 새지 않는다", async () => {
    H.tenantId = TENANT_B;
    const { GET } = await import("@/app/api/video/list/route");
    const res = await GET(new Request("http://internal.local/api/video/list"));
    const json = (await res.json()) as { videos: Array<{ filename: string }> };
    expect(json.videos.map((v) => v.filename)).toEqual(["b-only.mp4"]);
  });

  it("테넌트 없음(운영자)은 공유 루트 + 기존 /videos/ 경로를 유지한다(회귀 없음)", async () => {
    H.tenantId = null;
    fs.mkdirSync(path.join(tmpRoot, "videos"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, "videos", "shared.mp4"), Buffer.alloc(5, 3));
    const { GET } = await import("@/app/api/video/list/route");
    const res = await GET(new Request("http://internal.local/api/video/list"));
    const json = (await res.json()) as { videos: Array<{ filename: string; url: string }> };
    expect(json.videos).toEqual([{ filename: "shared.mp4", url: "/videos/shared.mp4", size: 5, createdAt: expect.any(Number) }]);
  });
});

describe("/api/video/upload — 테넌트 격리", () => {
  it("A가 업로드한 파일은 tenants/A/videos 아래에만 생기고 B 디렉토리엔 없다", async () => {
    const { POST } = await import("@/app/api/video/upload/route");
    const form = new FormData();
    form.append("file", new Blob([Buffer.alloc(20, 9)]), "clip.mp4");
    const res = await POST(new Request("http://internal.local/api/video/upload", { method: "POST", body: form }));
    const json = (await res.json()) as { filename: string; url: string };
    expect(fs.existsSync(path.join(tenantVideosDir(TENANT_A), json.filename))).toBe(true);
    expect(fs.readdirSync(tenantVideosDir(TENANT_B))).toEqual(["b-only.mp4"]);
    expect(json.url).toMatch(/^\/api\/media\//);
  });
});

describe("/api/video/delete — 테넌트 격리", () => {
  it("A 컨텍스트로 B의 파일명을 지정해도 A 디렉토리에 그 파일이 없으므로 404 — B 파일은 그대로 남는다", async () => {
    const { POST } = await import("@/app/api/video/delete/route");
    const res = await POST(
      new Request("http://internal.local/api/video/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "b-only.mp4" }),
      }),
    );
    expect(res.status).toBe(404);
    expect(fs.existsSync(path.join(tenantVideosDir(TENANT_B), "b-only.mp4"))).toBe(true);
  });

  it("A 컨텍스트로 A 자신의 파일은 정상 삭제된다", async () => {
    const { POST } = await import("@/app/api/video/delete/route");
    const res = await POST(
      new Request("http://internal.local/api/video/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "a-only.mp4" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(tenantVideosDir(TENANT_A), "a-only.mp4"))).toBe(false);
  });

  it("VIDEO-LIST-STUDIO-04 목록에 나온 A의 생성실 영상을 삭제하고 B의 생성실 영상은 유지한다", async () => {
    fs.mkdirSync(studioVideosDir(TENANT_A), { recursive: true });
    fs.mkdirSync(studioVideosDir(TENANT_B), { recursive: true });
    fs.writeFileSync(path.join(studioVideosDir(TENANT_A), "studio-delete.mp4"), Buffer.alloc(7, 5));
    fs.writeFileSync(path.join(studioVideosDir(TENANT_B), "studio-delete.mp4"), Buffer.alloc(8, 6));

    const { POST } = await import("@/app/api/video/delete/route");
    const res = await POST(
      new Request("http://internal.local/api/video/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: "studio-delete.mp4" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(studioVideosDir(TENANT_A), "studio-delete.mp4"))).toBe(false);
    expect(fs.existsSync(path.join(studioVideosDir(TENANT_B), "studio-delete.mp4"))).toBe(true);
  });
});

describe("/api/video/generate — 테넌트 격리(module-scope dataPath 회귀 가드)", () => {
  it("VIDEO_OUTPUT_DIR을 모듈 스코프 상수로 재도입하지 않았다(finding 6 회귀 방지, 소스 가드)", async () => {
    const src = await import("node:fs/promises").then((m) =>
      m.readFile(new URL("../../src/app/api/video/generate/route.ts", import.meta.url), "utf-8"),
    );
    expect(src).not.toMatch(/^const VIDEO_OUTPUT_DIR = dataPath\(/m);
  });
});

describe("/api/video/publish — publicOrigin이 아니라 canonicalPublicOrigin(폴백 없음)을 쓴다", () => {
  it("x-forwarded-host 헤더만으로는 provider video_url의 origin이 결정되지 않는다(OSMU_PUBLIC_URL 없으면 거부)", async () => {
    vi.doMock("@/lib/db", () => ({ withTenant: vi.fn(async () => []) }));
    vi.doMock("@/lib/publish", async (importActual) => {
      const actual = await importActual<typeof import("@/lib/publish")>();
      return {
        ...actual,
        getChannelCred: vi.fn(async () => ({ token: "t", userId: "u", accountId: "acc" })),
        publishInstagramReels: vi.fn(async () => ({ ok: true, externalId: "m", permalink: "p" })),
      };
    });
    delete process.env.OSMU_PUBLIC_URL;
    const { POST } = await import("@/app/api/video/publish/route");
    const res = await POST(
      new Request("http://internal.local/api/video/publish", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-host": "attacker.example.com", "x-forwarded-proto": "https" },
        body: JSON.stringify({ filename: "a-only.mp4", platform: "reels" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("OSMU_PUBLIC_URL");
  });
});
