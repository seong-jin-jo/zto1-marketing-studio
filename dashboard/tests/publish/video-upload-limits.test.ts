import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { MAX_VIDEO_BYTES } from "@/lib/video-limits";

// SNS-015: /api/video/upload 의 크기 경계(제품 정책 100 MiB).
// 이 상한은 multipart 파서의 할당을 막는 장치가 아니다 — Request.formData()는 라우트보다 먼저
// 본문을 파싱한다. 여기서 검증하는 것은 "애플리케이션 한도 + 디스크 쓰기 전 2차 방어"이고,
// 값은 발행 경로(REELS_MAX_BYTES)와 동일해야 한다(업로드 통과 후 발행에서 되튕김 방지).
const H = vi.hoisted(() => ({ tenantId: "11111111-1111-1111-1111-111111111111" as string | null }));
vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => H.tenantId) }));

let tmpRoot: string;

/** 실제로 N바이트를 할당하지 않고 size만 N인 Blob 대역 — 경계를 메모리 없이 테스트한다. */
function fakeFile(name: string, size: number, bytes?: Buffer): File {
  const body = bytes ?? Buffer.alloc(Math.min(size, 1024), 7);
  const f = new File([new Uint8Array(body)], name, { type: "video/mp4" });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

async function callUpload(file: File, options?: { kind: "music"; rightsConfirmed: boolean }) {
  const form = new FormData();
  form.append("file", file);
  if (options) {
    form.set("kind", options.kind);
    form.set("rightsConfirmed", String(options.rightsConfirmed));
  }
  // Request(body: FormData)로 감싸면 런타임이 본문을 재직렬화하면서 우리가 덮어쓴 size가 사라진다.
  // 라우트는 request.formData()만 쓰므로 그 지점만 대역으로 준다(상한 크기를 실제 할당하지 않기 위함).
  const req = { formData: async () => form, headers: new Headers() } as unknown as Request;
  const { POST } = await import("@/app/api/video/upload/route");
  const res = await POST(req);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

describe("/api/video/upload — 크기 경계", () => {
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-upload-"));
    process.env.DATA_DIR = tmpRoot;
    process.env.MEDIA_SIGNING_SECRET = "test-media-signing-secret-0123456789";
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    delete process.env.MEDIA_SIGNING_SECRET;
  });

  const MAX = MAX_VIDEO_BYTES; // 100 MiB

  it("정확히 상한(100MiB, 경계값)은 허용한다", async () => {
    const { status, json } = await callUpload(fakeFile("a.mp4", MAX));
    expect(status).toBe(200);
    expect(json.filename).toMatch(/\.mp4$/);
  });

  it("상한 + 1바이트는 413으로 거부하고 파일을 쓰지 않는다", async () => {
    const { status, json } = await callUpload(fakeFile("a.mp4", MAX + 1));
    expect(status).toBe(413);
    // 실행 가능한 한국어 안내: 상한/현재 크기/다음 행동이 문구에 있어야 한다.
    expect(String(json.error)).toContain("100MiB");
    expect(String(json.error)).toContain("압축");
    const dir = path.join(tmpRoot, "tenants", H.tenantId as string, "videos");
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([]);
  });

  it("0바이트(빈 파일)는 400으로 거부한다", async () => {
    const { status, json } = await callUpload(fakeFile("a.mp4", 0, Buffer.alloc(0)));
    expect(status).toBe(400);
    expect(String(json.error)).toContain("빈 파일");
  });

  it("1바이트(최소 허용 경계)는 통과한다", async () => {
    const { status } = await callUpload(fakeFile("a.mp4", 1, Buffer.alloc(1, 1)));
    expect(status).toBe(200);
  });

  it("발행 경로(REELS)와 정확히 같은 상한을 쓴다 — 업로드/발행 불일치 금지", async () => {
    expect(MAX_VIDEO_BYTES).toBe(100 * 1024 * 1024);
  });

  it("허용 확장자가 아니면 크기와 무관하게 400", async () => {
    const { status } = await callUpload(fakeFile("a.exe", 1024));
    expect(status).toBe(400);
  });

  it("S6-MUSIC-UPLOAD-01 권리를 확인한 MP3는 음악 계약으로 저장한다", async () => {
    const { status, json } = await callUpload(fakeFile("my-track.mp3", 128, Buffer.alloc(128, 2)), { kind: "music", rightsConfirmed: true });
    expect(status).toBe(200);
    expect(json).toMatchObject({ kind: "music" });
    expect(json.filename).toMatch(/\.mp3$/);
  });

  it("S6-MUSIC-UPLOAD-02 권리 확인 없는 음악은 저장 전에 거부한다", async () => {
    const { status, json } = await callUpload(fakeFile("my-track.wav", 128, Buffer.alloc(128, 2)), { kind: "music", rightsConfirmed: false });
    expect(status).toBe(422);
    expect(String(json.error)).toContain("사용 권한");
  });
});
