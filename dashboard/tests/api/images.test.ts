import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// /api/images — SNS-016: tenant_id는 클라이언트 쿼리가 아니라 effectiveTenantId(인증에서
// 유도)로만 정해져야 한다. 저장 경로는 다른 테넌트 미디어와 동일하게 data/tenants/{id}/images/
// 로 격리되고, 목록/업로드/삭제 응답 URL은 서명된 절대 HTTPS 딜리버리 URL이어야 한다.

const H = vi.hoisted(() => ({ tenantId: null as string | null }));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
  AuthError: class AuthError extends Error {
    status = 401;
  },
}));

const SECRET = "test-media-signing-secret-0123456789";
let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-images-test-"));
  process.env.DATA_DIR = dataDir;
  process.env.MEDIA_SIGNING_SECRET = SECRET;
  process.env.OSMU_PUBLIC_URL = "https://app.example.com";
  H.tenantId = null;
});

afterEach(() => {
  delete process.env.DATA_DIR;
  delete process.env.MEDIA_SIGNING_SECRET;
  delete process.env.OSMU_PUBLIC_URL;
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.resetModules();
});

async function get(url: string) {
  const { GET } = await import("@/app/api/images/route");
  const res = await GET(new Request(url));
  return { status: res.status, body: await res.json() };
}

function tenantImagesDir(tenant: string) {
  return path.join(dataDir, "tenants", tenant, "images");
}

function seedTenantImage(tenant: string, filename: string) {
  const dir = tenantImagesDir(tenant);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), "x");
}

describe("GET /api/images — 테넌트는 effectiveTenantId(인증)로만 정해진다", () => {
  it("인증된 테넌트 자신의 이미지만 절대 서명 URL로 반환한다", async () => {
    H.tenantId = "tenant-a";
    seedTenantImage("tenant-a", "mine.png");
    const { status, body } = await get("http://localhost/api/images");
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].filename).toBe("mine.png");
    expect(body[0].url).toMatch(/^https:\/\/app\.example\.com\/api\/images\/deliver\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("클라이언트가 다른 tenant_id 쿼리를 보내도 무시되고 자기 인증 테넌트만 조회된다(IDOR 차단)", async () => {
    H.tenantId = "tenant-a";
    seedTenantImage("tenant-a", "mine.png");
    seedTenantImage("tenant-b", "victim-secret.png");
    const { status, body } = await get("http://localhost/api/images?tenant_id=tenant-b");
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].filename).toBe("mine.png");
    expect(body.some((f: { filename: string }) => f.filename === "victim-secret.png")).toBe(false);
  });

  it("인증 결과가 없으면(비인증/미확인) 빈 목록(fail-closed)", async () => {
    H.tenantId = null;
    seedTenantImage("tenant-b", "victim-secret.png");
    const { status, body } = await get("http://localhost/api/images?tenant_id=tenant-b");
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it("서명/공개 origin이 없으면 파일이 있어도 목록에서 제외한다(fail-closed)", async () => {
    delete process.env.OSMU_PUBLIC_URL;
    H.tenantId = "tenant-a";
    seedTenantImage("tenant-a", "mine.png");
    const { status, body } = await get("http://localhost/api/images");
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});

describe("POST /api/images/upload — 테넌트 격리 업로드", () => {
  async function upload(file: File) {
    const { POST } = await import("@/app/api/images/upload/route");
    const formData = new FormData();
    formData.append("file", file);
    const res = await POST(new Request("http://localhost/api/images/upload", { method: "POST", body: formData }));
    return { status: res.status, body: await res.json() };
  }

  it("인증 없으면 401", async () => {
    H.tenantId = null;
    const { status } = await upload(new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    expect(status).toBe(401);
  });

  it("허용된 확장자를 테넌트 dir에 저장하고 절대 서명 URL을 반환한다", async () => {
    H.tenantId = "tenant-a";
    const { status, body } = await upload(new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" }));
    expect(status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/app\.example\.com\/api\/images\/deliver\/.+$/);
    const dir = tenantImagesDir("tenant-a");
    expect(fs.readdirSync(dir)).toContain(body.filename);
    // 다른 테넌트 dir에는 아무것도 쓰이지 않는다
    expect(fs.existsSync(tenantImagesDir("tenant-b"))).toBe(false);
  });

  it("S1-R3-ASSET-ID-01 실제 업로드 filename을 CardDeckV3 asset_id로 저장할 수 있다", async () => {
    H.tenantId = "tenant-a";
    const { status, body } = await upload(new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" }));
    const { validateCardDeckV3 } = await import("@/lib/studio/card-element-contract");
    const element = {
      id: "el_photo", type: "image", name: "업로드 사진", x: 0, y: 0, width: 100, height: 100,
      rotation: 0, z_index: 0, opacity: 1, locked: false, hidden: false,
      asset_id: body.filename, alt: "업로드 사진", decorative: false, fit: "cover",
      crop: { x: 0, y: 0, width: 1, height: 1 }, corner_radius: 0,
    };
    const value = {
      contract_version: "3.0", id: "deck_upload", template: "plain", ratio: "4:5", revision: 0,
      theme: { background: "#FFFFFF", foreground: "#111111", accent: "#2563EB" },
      brand: { display_name: "OSMU", handle: null }, hook_type: "pain",
      cta: { keyword: "정리본", comment_example: "정리본을 남겨 주세요", save_reason: "나중에 다시 확인하세요" },
      slides: [
        { id: "slide_upload", order: 0, role: "cover", content_state: "filled", background: { kind: "solid", color: "#FFFFFF" }, base: { kind: "plain", lines: [] }, elements: [element] },
        { id: "slide_cta", order: 1, role: "cta", content_state: "filled", background: { kind: "solid", color: "#111111" }, base: { kind: "plain", lines: ["저장하세요"] }, elements: [] },
      ],
    };
    expect(status).toBe(200);
    expect(() => validateCardDeckV3(value)).not.toThrow();
  });

  it("허용되지 않은 확장자는 거부한다", async () => {
    H.tenantId = "tenant-a";
    const { status } = await upload(new File([new Uint8Array([1, 2, 3])], "evil.exe", { type: "application/octet-stream" }));
    expect(status).toBe(400);
  });

  it("빈 파일은 거부한다", async () => {
    H.tenantId = "tenant-a";
    const { status } = await upload(new File([], "empty.png", { type: "image/png" }));
    expect(status).toBe(400);
  });

  it("10MiB 초과 파일은 거부하고 디스크에 남기지 않는다", async () => {
    H.tenantId = "tenant-a";
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const { status } = await upload(new File([big], "big.png", { type: "image/png" }));
    expect(status).toBe(413);
    const dir = tenantImagesDir("tenant-a");
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toHaveLength(0);
  });

  it("공개 origin이 없으면 저장을 되돌리고 500(fail-closed cleanup)", async () => {
    delete process.env.OSMU_PUBLIC_URL;
    H.tenantId = "tenant-a";
    const { status } = await upload(new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" }));
    expect(status).toBe(500);
    const dir = tenantImagesDir("tenant-a");
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toHaveLength(0);
  });
});

describe("DELETE /api/images/[filename] — 테넌트 격리 삭제", () => {
  async function del(filename: string) {
    const { DELETE } = await import("@/app/api/images/[filename]/route");
    const res = await DELETE(new Request(`http://localhost/api/images/${encodeURIComponent(filename)}`, { method: "DELETE" }), {
      params: Promise.resolve({ filename }),
    });
    return { status: res.status, body: await res.json() };
  }

  it("인증 없으면 401", async () => {
    H.tenantId = null;
    const { status } = await del("mine.png");
    expect(status).toBe(401);
  });

  it("자기 테넌트 파일은 삭제된다", async () => {
    H.tenantId = "tenant-a";
    seedTenantImage("tenant-a", "mine.png");
    const { status, body } = await del("mine.png");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(fs.existsSync(path.join(tenantImagesDir("tenant-a"), "mine.png"))).toBe(false);
  });

  it("다른 테넌트 파일은 지울 수 없다(cross-tenant 404)", async () => {
    H.tenantId = "tenant-a";
    seedTenantImage("tenant-b", "victim.png");
    const { status } = await del("victim.png");
    expect(status).toBe(404);
    expect(fs.existsSync(path.join(tenantImagesDir("tenant-b"), "victim.png"))).toBe(true);
  });

  it("path traversal 파일명은 404로 거부한다", async () => {
    H.tenantId = "tenant-a";
    seedTenantImage("tenant-a", "mine.png");
    const { status } = await del("../mine.png");
    expect(status).toBe(404);
  });
});
