import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-02 독립 리뷰 M-2(자원): 테넌트 하나가 완료 전에 또 접수하면 전역 렌더 슬롯
// (프로세스당 1개)을 혼자 독점해 다른 테넌트가 무기한 대기한다 — 접수 단계에서 거절한다.
const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const H = vi.hoisted(() => ({ tenantId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as string | null }));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async (_r: Request, fallback?: string | null) => fallback ?? H.tenantId),
}));
vi.mock("@/lib/media-token", () => ({ signMediaToken: vi.fn(() => "signed-token") }));
vi.mock("@/lib/intro-outro-render", () => ({ composeIntroOutro: vi.fn(async () => ({ outputPath: "x", durationSec: 1 })) }));

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "intro-outro-tenant-conc-"));
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

describe("테넌트당 진행 중 작업 1개 (route.ts 409)", () => {
  it("같은 테넌트가 완료 전에 또 접수하면 409로 거절한다", async () => {
    await withSourceFile(TENANT_A, "source.mp4");
    const { POST } = await import("@/app/api/video/intro-outro/route");
    const req = () =>
      new Request("http://x/api/video/intro-outro", {
        method: "POST",
        body: JSON.stringify({ sourceFilename: "source.mp4", introCompId: "intro-logo-reveal", outroCompId: null }),
      });
    const first = await POST(req());
    expect(first.status).toBe(202);
    const second = await POST(req());
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toBeTruthy();
  });
});
