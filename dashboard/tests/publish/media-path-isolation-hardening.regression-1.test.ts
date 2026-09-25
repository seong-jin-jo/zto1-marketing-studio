import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// 2026-09-25 교차 리뷰(PR #86 뒤 실측) 재발 방지.
//
// 리뷰어가 실제로 재현한 두 구멍:
//
// MAJOR-0a — storage.ts의 generatedMediaDirs가 옛 공용 data/videos 폴더를 "인자 tenantId"가
// 아니라 "호출 시점의 테넌트 컨텍스트(AsyncLocalStorage)"로 골랐다. runWithTenant로 감싸지
// 않은 채 부르는 라우트(media/resign, higgsfield/video)에서는 컨텍스트가 없으니 항상 운영자
// 공유 data/videos가 나왔다 — 인자로 준 테넌트 A와 무관하게. 그래서 컨텍스트 밖에서
// resolveGeneratedFile(A, "operator-secret.mp4")를 부르면 운영자의 비밀 파일이 그대로
// 열렸다. 이 판은 tenantScopedVideosDir로 인자만으로 경로를 고정했다.
//
// MAJOR-0b — higgsfield/video 라우트가 body.localPath(서버 절대경로 문자열)를 그대로 받아
// fs.existsSync만 확인했다. 인증된 사용자가 서버의 아무 파일 경로나 넣어 생성기 CLI에
// --image로 먹일 수 있었다. 이 판은 입력에서 localPath를 완전히 없애고 filename만 받는다.
//
// MINOR — video/delete가 .mp4가 아닌 파일(생성실의 img_*.webp 등)도 지울 수 있었다.
// 목록(video/list)과 같은 기준(.mp4)으로 제한했다.

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// vi.hoisted는 vi.mock 팩토리와 함께 모듈 맨 위로 끌어올려진다 — 아래 const TENANT_A를
// 참조하면 TDZ(초기화 전 접근) 오류가 난다. 같은 리터럴을 hoisted 안에서 다시 적는다.
const H = vi.hoisted(() => ({ tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as string | null }));
vi.mock("@/lib/tenant-auth", () => ({ effectiveTenantId: vi.fn(async () => H.tenantId) }));
vi.mock("child_process", () => ({ execFile: vi.fn() }));
vi.mock("@/lib/higgsfield", async () => {
  const actual = await vi.importActual<typeof import("@/lib/higgsfield")>("@/lib/higgsfield");
  return {
    ...actual,
    hfRun: vi.fn(async () => ({ stdout: '{"status":"completed","url":"https://cdn.example/video.mp4"}' })),
    extractJson: vi.fn(() => ({ status: "completed" })),
    findResultUrl: vi.fn(() => "https://cdn.example/video.mp4"),
    downloadTo: vi.fn(async () => 1),
    addNarration: vi.fn(async () => ({ ok: false, reason: "narration_empty" })),
    logGen: vi.fn(),
    recordMediaGenerationEvent: vi.fn(async () => {}),
    assertHiggsfieldReady: vi.fn(async () => {}),
  };
});

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "media-hardening-"));
  process.env.DATA_DIR = root;
  process.env.MEDIA_SIGNING_SECRET = "test-media-signing-secret-0123456789";
  H.tenantId = TENANT_A;
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  delete process.env.MEDIA_SIGNING_SECRET;
  vi.restoreAllMocks();
});

describe("MAJOR-0a — 컨텍스트 밖 교차 테넌트 접근 (리뷰어 탐침 P1)", () => {
  it("컨텍스트 없이 불러도 운영자 공유 data/videos를 보지 않는다", async () => {
    fs.mkdirSync(path.join(root, "videos"), { recursive: true });
    fs.writeFileSync(path.join(root, "videos", "operator-secret.mp4"), "x");
    const { resolveGeneratedFile } = await import("@/lib/storage");

    // 컨텍스트 없이(= runWithTenant로 감싸지 않고) 직접 부른다 — media/resign, higgsfield/video가
    // 실제로 이렇게 부른다.
    expect(resolveGeneratedFile(TENANT_A, "operator-secret.mp4")).toBeNull();
  });

  it("테넌트 B 요청 컨텍스트 한복판에서 테넌트 A로 불러도 A/B 어느 쪽 결과도 새지 않는다", async () => {
    const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    fs.mkdirSync(path.join(root, "tenants", TENANT_B, "videos"), { recursive: true });
    fs.writeFileSync(path.join(root, "tenants", TENANT_B, "videos", "b-secret.mp4"), "b");
    const { resolveGeneratedFile } = await import("@/lib/storage");
    const { runWithTenant } = await import("@/lib/tenant-context");

    // 컨텍스트가 B인 채로 A를 인자로 넘긴다 — 결과가 B 폴더에서 새면 안 되고, A 폴더에
    // 아무것도 없으니 null이어야 한다.
    const result = runWithTenant(TENANT_B, () => resolveGeneratedFile(TENANT_A, "b-secret.mp4"));
    expect(result).toBeNull();
  });

  it("자기 컨텍스트 안에서는 정상적으로 자기 파일을 찾는다(회귀 없음)", async () => {
    fs.mkdirSync(path.join(root, "tenants", TENANT_A, "videos"), { recursive: true });
    fs.writeFileSync(path.join(root, "tenants", TENANT_A, "videos", "a-own.mp4"), "a");
    const { resolveGeneratedFile } = await import("@/lib/storage");
    const { runWithTenant } = await import("@/lib/tenant-context");

    const result = runWithTenant(TENANT_A, () => resolveGeneratedFile(TENANT_A, "a-own.mp4"));
    expect(result).toBe(path.join(root, "tenants", TENANT_A, "videos", "a-own.mp4"));
  });

  it("운영자(tenantId=null)는 여전히 공유 data/videos를 본다(회귀 없음)", async () => {
    fs.mkdirSync(path.join(root, "videos"), { recursive: true });
    fs.writeFileSync(path.join(root, "videos", "shared.mp4"), "s");
    const { resolveGeneratedFile } = await import("@/lib/storage");
    expect(resolveGeneratedFile(null as unknown as string, "shared.mp4")).toBe(path.join(root, "videos", "shared.mp4"));
  });

  it("돌연변이 검증: tenantScopedVideosDir을 다시 dataPath 기반으로 되돌리면 이 회귀가 재발한다", async () => {
    // 구현이 여전히 인자 기반 고정을 쓰고 있는지 소스로 확인 — 수정이 되돌려지면 실패한다.
    const src = fs.readFileSync(path.resolve(__dirname, "../../src/lib/storage.ts"), "utf8");
    const fn = src.slice(src.indexOf("function tenantScopedVideosDir"), src.indexOf("export function generatedMediaDirs"));
    expect(fn).not.toContain("dataPath(");
    expect(fn).toContain("DATA_DIR");
  });
});

describe("MAJOR-0b — localPath 입력 제거(임의 경로 주입 차단)", () => {
  it("body.localPath에 서버의 임의 절대경로(/etc/hosts)를 넣어도 무시되고 생성기에 전달되지 않는다", async () => {
    const { hfRun } = await import("@/lib/higgsfield");
    const { POST } = await import("@/app/api/higgsfield/video/route");
    const res = await POST(new Request("http://internal.local/api/higgsfield/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPath: "/etc/hosts", prompt: "motion", tenant_id: TENANT_A }),
    }));
    const body = await res.json();
    // filename이 없으니 바탕 그림을 못 찾은 것으로 정직하게 400을 낸다 — /etc/hosts를
    // 생성기에 들이밀지 않는다.
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(hfRun).not.toHaveBeenCalled();
  });

  it("filename으로 자기 작업 공간의 실제 생성 이미지를 가리키면 정상적으로 영상이 만들어진다(생성실 흐름 회귀)", async () => {
    // /api/higgsfield/image가 실제로 만들었을 법한 파일을 studio 폴더에 미리 둔다.
    fs.mkdirSync(path.join(root, "studio", TENANT_A), { recursive: true });
    fs.writeFileSync(path.join(root, "studio", TENANT_A, "img_123.webp"), "pixel");

    const { hfRun, downloadTo } = await import("@/lib/higgsfield");
    const { POST } = await import("@/app/api/higgsfield/video/route");
    const res = await POST(new Request("http://internal.local/api/higgsfield/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "img_123.webp", prompt: "motion", tenant_id: TENANT_A }),
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // 생성기 CLI에 실제로 넘어간 --image 값이 자기 작업 공간 안의 진짜 경로였는지 확인한다.
    const call = (hfRun as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string[];
    const imageArgIndex = call.indexOf("--image");
    expect(imageArgIndex).toBeGreaterThan(-1);
    expect(call[imageArgIndex + 1]).toBe(path.join(root, "studio", TENANT_A, "img_123.webp"));
    expect(downloadTo).toHaveBeenCalled();
  });

  it("타 테넌트 studio 폴더의 파일명을 filename으로 넣어도 찾지 못한다(교차 접근 차단)", async () => {
    const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    fs.mkdirSync(path.join(root, "studio", TENANT_B), { recursive: true });
    fs.writeFileSync(path.join(root, "studio", TENANT_B, "img_999.webp"), "pixel");

    const { POST } = await import("@/app/api/higgsfield/video/route");
    const res = await POST(new Request("http://internal.local/api/higgsfield/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "img_999.webp", prompt: "motion", tenant_id: TENANT_A }),
    }));
    expect(res.status).toBe(400);
  });

  it("이미지 생성 라우트는 더 이상 서버 절대경로(localPath)를 응답에 담지 않는다", async () => {
    vi.doMock("@/lib/higgsfield", async () => {
      const actual = await vi.importActual<typeof import("@/lib/higgsfield")>("@/lib/higgsfield");
      return {
        ...actual,
        hfRun: vi.fn(async () => ({ stdout: '{"status":"completed","url":"https://cdn.example/img.webp"}' })),
        extractJson: vi.fn(() => ({ status: "completed" })),
        findResultUrl: vi.fn(() => "https://cdn.example/img.webp"),
        downloadTo: vi.fn(async () => 1),
        logGen: vi.fn(),
        recordMediaGenerationEvent: vi.fn(async () => {}),
        assertHiggsfieldReady: vi.fn(async () => {}),
      };
    });
    const { POST } = await import("@/app/api/higgsfield/image/route");
    const res = await POST(new Request("http://internal.local/api/higgsfield/image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "a cat", tenant_id: TENANT_A }),
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body).not.toHaveProperty("localPath");
    expect(typeof body.filename).toBe("string");
    expect(body.filename.length).toBeGreaterThan(0);
  });
});

describe("MINOR — video/delete는 .mp4만 지운다 (리뷰어 탐침 P3)", () => {
  it("생성실의 이미지 파일(img_*.webp)은 filename으로 넣어도 지워지지 않는다", async () => {
    fs.mkdirSync(path.join(root, "studio", TENANT_A), { recursive: true });
    fs.writeFileSync(path.join(root, "studio", TENANT_A, "img_1.webp"), "i");

    const { POST } = await import("@/app/api/video/delete/route");
    const res = await POST(new Request("http://internal.local/api/video/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "img_1.webp" }),
    }));

    expect(res.status).toBe(400);
    expect(fs.existsSync(path.join(root, "studio", TENANT_A, "img_1.webp"))).toBe(true);
  });

  it("영상 파일(.mp4)은 여전히 정상 삭제된다(회귀 없음)", async () => {
    fs.mkdirSync(path.join(root, "studio", TENANT_A), { recursive: true });
    fs.writeFileSync(path.join(root, "studio", TENANT_A, "vid_1.mp4"), "v");

    const { POST } = await import("@/app/api/video/delete/route");
    const res = await POST(new Request("http://internal.local/api/video/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: "vid_1.mp4" }),
    }));

    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(root, "studio", TENANT_A, "vid_1.mp4"))).toBe(false);
  });

  it("돌연변이 검증: 확장자 검사를 되돌리면 이 회귀가 재발한다(소스 가드)", () => {
    // MINOR-3(코드리뷰 2026-09-25): list(대소문자 구분 .endsWith)와 delete(대소문자 무시)가
    // 서로 다른 기준을 쓰던 것을 media-token.ts의 isVideoFilename 하나로 통일했다. delete
    // 라우트가 그 정본 함수를 실제로 쓰는지, 그 함수가 여전히 .mp4로 제한하는지를 함께 가드한다.
    const routeSrc = fs.readFileSync(path.resolve(__dirname, "../../src/app/api/video/delete/route.ts"), "utf8");
    expect(routeSrc).toMatch(/isVideoFilename\(/);
    const tokenSrc = fs.readFileSync(path.resolve(__dirname, "../../src/lib/media-token.ts"), "utf8");
    const fn = tokenSrc.slice(tokenSrc.indexOf("export function isVideoFilename"));
    expect(fn).toMatch(/\.endsWith\(["']\.mp4["']\)/i);
  });
});
