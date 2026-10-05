import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_ID = "tenant-asset-hidden";

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => TENANT_ID),
}));

let root = "";

beforeEach(() => {
  vi.resetModules();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "higgsfield-hidden-asset-"));
  vi.stubEnv("DATA_DIR", root);
  const dir = path.join(root, "studio", TENANT_ID);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "clip.mp4"), "public-media");
  fs.writeFileSync(path.join(dir, ".subtitle-bakes.json"), JSON.stringify({ secret: "lineage" }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

async function getAsset(filename: string) {
  const { GET } = await import("@/app/api/higgsfield/asset/[file]/route");
  return GET(new Request(`http://localhost/api/higgsfield/asset/${encodeURIComponent(filename)}?tenant_id=${TENANT_ID}`), {
    params: Promise.resolve({ file: filename }),
  });
}

describe("HIGGSFIELD-ASSET-HIDDEN-01 숨김 운영 파일 비공개", () => {
  it("정상 미디어는 같은 테넌트에서 내려준다", async () => {
    const response = await getAsset("clip.mp4");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("public-media");
  });

  it("점으로 시작하는 자막 계보 레지스트리는 파일이 있어도 404다", async () => {
    const response = await getAsset(".subtitle-bakes.json");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not found" });
  });
});
