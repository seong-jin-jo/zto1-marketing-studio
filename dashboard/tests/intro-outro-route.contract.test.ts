import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-02 — 인트로/아웃트로(Remotion) 라우트 계약 테스트. higgsfield 비동기 라우트와
// 같은 계약을 강제한다: POST 는 202+jobId, GET job 은 완료 전엔 상태만, 다른 테넌트
// jobId 조회는 404(존재 비공개), proxy.ts allowlist 와 공격목록에 둘 다 올라야 한다.
const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const H = vi.hoisted(() => ({ tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as string | null }));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async (_r: Request, fallback?: string | null) => fallback ?? H.tenantId),
}));
vi.mock("@/lib/media-token", () => ({ signMediaToken: vi.fn(() => "signed-token") }));
vi.mock("@/lib/intro-outro-render", () => ({ composeIntroOutro: vi.fn(async () => ({ outputPath: "x", durationSec: 1 })) }));

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "intro-outro-route-"));
  process.env.DATA_DIR = tmpRoot;
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.DATA_DIR;
});

async function withSourceFile(tenantId: string, filename: string) {
  const { tenantMediaDir } = await import("@/lib/storage");
  const dir = tenantMediaDir(tenantId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), "fake-mp4-bytes");
}

describe("POST /api/video/intro-outro", () => {
  it("유효한 요청은 202 + jobId 를 즉시 돌려준다", async () => {
    await withSourceFile(TENANT_A, "source.mp4");
    const { POST } = await import("@/app/api/video/intro-outro/route");
    const req = new Request("http://x/api/video/intro-outro", {
      method: "POST",
      body: JSON.stringify({ sourceFilename: "source.mp4", introCompId: "intro-logo-reveal", outroCompId: null }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.jobId).toBe("string");
  });

  it("인트로·아웃트로 둘 다 없으면 400", async () => {
    await withSourceFile(TENANT_A, "source.mp4");
    const { POST } = await import("@/app/api/video/intro-outro/route");
    const req = new Request("http://x/api/video/intro-outro", {
      method: "POST",
      body: JSON.stringify({ sourceFilename: "source.mp4" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("원본 파일이 없으면 404", async () => {
    const { POST } = await import("@/app/api/video/intro-outro/route");
    const req = new Request("http://x/api/video/intro-outro", {
      method: "POST",
      body: JSON.stringify({ sourceFilename: "missing.mp4", introCompId: "intro-logo-reveal" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/video/intro-outro/job/[id]", () => {
  it("다른 테넌트의 jobId 로는 404(존재 비공개)", async () => {
    await withSourceFile(TENANT_A, "source.mp4");
    const { createIntroOutroJob } = await import("@/lib/intro-outro-jobs");
    const job = createIntroOutroJob(TENANT_A, {
      sourceFilename: "source.mp4",
      introCompId: "intro-logo-reveal",
      outroCompId: null,
      brandName: "OSMU",
    });
    const { GET } = await import("@/app/api/video/intro-outro/job/[id]/route");
    H.tenantId = TENANT_B;
    const req = new Request(`http://x/api/video/intro-outro/job/${job.jobId}`);
    const res = await GET(req, { params: Promise.resolve({ id: job.jobId }) });
    expect(res.status).toBe(404);
  });

  it("같은 테넌트는 완료 전엔 status 만 받는다", async () => {
    await withSourceFile(TENANT_A, "source.mp4");
    const { createIntroOutroJob } = await import("@/lib/intro-outro-jobs");
    const job = createIntroOutroJob(TENANT_A, {
      sourceFilename: "source.mp4",
      introCompId: "intro-logo-reveal",
      outroCompId: null,
      brandName: "OSMU",
    });
    const { GET } = await import("@/app/api/video/intro-outro/job/[id]/route");
    H.tenantId = TENANT_A;
    const req = new Request(`http://x/api/video/intro-outro/job/${job.jobId}`);
    const res = await GET(req, { params: Promise.resolve({ id: job.jobId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("queued");
    expect(body.file).toBeUndefined();
  });
});

describe("proxy.ts allowlist", () => {
  it("TENANT_AWARE_PATHS 에 두 라우트가 모두 등록돼 있다", async () => {
    const proxySource = fs.readFileSync(path.join(process.cwd(), "src/proxy.ts"), "utf8");
    expect(proxySource).toContain('"/api/video/intro-outro"');
    expect(proxySource).toContain('"/api/video/intro-outro/job/[id]"');
  });
});

describe("tenant isolation attack list", () => {
  it("verify-tenant-isolation-e2e.mjs 에 job 조회 공격이 등록돼 있다", async () => {
    const src = fs.readFileSync(path.join(process.cwd(), "scripts/verify-tenant-isolation-e2e.mjs"), "utf8");
    expect(src).toContain("/api/video/intro-outro/job/probe-job-id");
  });
});
