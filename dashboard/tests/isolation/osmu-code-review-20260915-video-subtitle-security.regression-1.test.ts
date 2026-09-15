import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression: CODE-REVIEW-20260915-04, CODE-REVIEW-20260915-06
// 고객 자막 경로가 공용 영상을 읽고 실패를 HTTP 200으로 숨겼던 결함.
// Found by code-review on 2026-09-15.
// Report: docs/_archive/legacy-20260912/audit/osmu-code-review-2026-09-15.md
vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "tenant-review-subtitle"),
}));

let root = "";

beforeEach(() => {
  vi.resetModules();
  root = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-subtitle-security-"));
  vi.stubEnv("DATA_DIR", root);
  vi.stubEnv("CONFIG_DIR", path.join(root, "config"));
  vi.stubEnv("SUBTITLE_FONT_FILE", path.join(root, "missing-font.ttf"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function subtitleRequest(filename: string) {
  return new Request("http://localhost/api/video/subtitle", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer osmu_customer" },
    body: JSON.stringify({ filename, lines: ["첫 자막"], tenant_id: "attacker-choice" }),
  });
}

describe("CODE-REVIEW-20260915-04 고객 자막 파일 소유권", () => {
  it("CODE-REVIEW-20260915-04 정상: 자기 작업 공간 파일만 실제 경로로 푼다", async () => {
    const ownDir = path.join(root, "studio", "tenant-review-subtitle");
    fs.mkdirSync(ownDir, { recursive: true });
    fs.writeFileSync(path.join(ownDir, "owned.mp4"), "owned");
    const { resolveTenantGeneratedFile } = await import("@/lib/storage");
    expect(resolveTenantGeneratedFile("tenant-review-subtitle", "owned.mp4")).toBe(path.join(ownDir, "owned.mp4"));
  });

  it("CODE-REVIEW-20260915-04 거절: 공용 legacy 파일 이름을 알아도 고객 요청은 422로 막힌다", async () => {
    const sharedDir = path.join(root, "videos");
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.writeFileSync(path.join(sharedDir, "shared.mp4"), "shared");
    const { POST } = await import("@/app/api/video/subtitle/route");
    const response = await POST(subtitleRequest("shared.mp4"));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false });
  });
});

describe("CODE-REVIEW-20260915-06 자막 실패 HTTP 계약", () => {
  it("CODE-REVIEW-20260915-06 거절: 서버 글꼴 미준비는 성공이 아니라 503이다", async () => {
    const ownDir = path.join(root, "studio", "tenant-review-subtitle");
    fs.mkdirSync(ownDir, { recursive: true });
    fs.writeFileSync(path.join(ownDir, "owned.mp4"), "not-empty");
    const { POST } = await import("@/app/api/video/subtitle/route");
    const response = await POST(subtitleRequest("owned.mp4"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, code: "SUBTITLE_FONT_MISSING" });
  });

  it("CODE-REVIEW-20260915-06 경계: 실행기 없음, 제한시간 초과, 잘못된 영상은 서로 다른 상태다", async () => {
    const { subtitleFailureStatus } = await import("@/lib/studio/video-subtitle");
    expect(subtitleFailureStatus(Object.assign(new Error("spawn failed"), { code: "ENOENT" }))).toEqual({ status: 503, code: "ENCODER_MISSING" });
    expect(subtitleFailureStatus(new Error("No such filter: 'drawtext'\nFilter not found"))).toEqual({ status: 503, code: "ENCODER_MISSING" });
    expect(subtitleFailureStatus(Object.assign(new Error("timed out"), { killed: true }))).toEqual({ status: 504, code: "SUBTITLE_TIMEOUT" });
    expect(subtitleFailureStatus(new Error("invalid media"))).toEqual({ status: 422, code: "SUBTITLE_BURN_FAILED" });
  });
});
