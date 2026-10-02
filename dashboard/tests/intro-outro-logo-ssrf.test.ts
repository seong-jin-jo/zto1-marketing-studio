import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-02 독립 리뷰 M-1(SSRF): remotion/IntroOutroComps.tsx의 <Img src={logoUrl}>가
// 헤드리스 Chrome 안에서 그대로 fetch된다 — 검증 없이 받으면 사설망·클라우드 메타데이터
// 주소(169.254.169.254 등)를 서버가 대신 가져와 렌더 결과(영상 프레임)로 유출할 수 있다.
// Bluesky/X 업로드가 쓰는 isSafePublicImageUrl + isAllowedServerFetchImageHost 두 단계
// 가드를 그대로 재사용해 막는다.
const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const H = vi.hoisted(() => ({ tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as string | null }));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async (_r: Request, fallback?: string | null) => fallback ?? H.tenantId),
}));
vi.mock("@/lib/media-token", () => ({ signMediaToken: vi.fn(() => "signed-token") }));
vi.mock("@/lib/intro-outro-render", () => ({ composeIntroOutro: vi.fn(async () => ({ outputPath: "x", durationSec: 1 })) }));

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "intro-outro-ssrf-"));
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

const MALICIOUS_LOGO_URLS = [
  "http://localhost/evil.png",
  "http://192.168.1.5/evil.png",
  "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
  "http://10.0.0.1/evil.png",
  "http://127.0.0.1/evil.png",
];

describe("POST /api/video/intro-outro — logoUrl SSRF 가드", () => {
  for (const malicious of MALICIOUS_LOGO_URLS) {
    it(`내부 주소 logoUrl(${malicious})은 400으로 거부한다`, async () => {
      await withSourceFile(TENANT_A, "source.mp4");
      const { POST } = await import("@/app/api/video/intro-outro/route");
      const req = new Request("http://x/api/video/intro-outro", {
        method: "POST",
        body: JSON.stringify({
          sourceFilename: "source.mp4",
          introCompId: "intro-logo-reveal",
          outroCompId: null,
          logoUrl: malicious,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    });
  }

  it("logoUrl 없이 보내면 그대로 통과한다(로고 없이 기본 렌더)", async () => {
    await withSourceFile(TENANT_A, "source.mp4");
    const { POST } = await import("@/app/api/video/intro-outro/route");
    const req = new Request("http://x/api/video/intro-outro", {
      method: "POST",
      body: JSON.stringify({ sourceFilename: "source.mp4", introCompId: "intro-logo-reveal", outroCompId: null }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);
  });
});
