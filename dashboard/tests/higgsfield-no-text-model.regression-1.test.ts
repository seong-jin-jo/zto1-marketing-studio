import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 회장 R4(2026-10-11): Soul V2가 참조 이미지와 초안 본문 없이도 결과에 읽을 수 없는
// 세로 캡션을 추가했다. 무문자 대표 이미지 경로는 GPT Image 2.5 1k/low를 사용하고,
// 클라이언트가 참조 이미지를 끼워 보내도 CLI 요청에는 전달하지 않는 계약을 고정한다.
const TENANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const H = vi.hoisted(() => ({ calls: [] as Array<{ args: string[]; timeoutMs?: number }> }));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async (_request: Request, fallback?: string | null) => fallback ?? TENANT),
}));
vi.mock("@/lib/higgsfield", async () => {
  const actual = await vi.importActual<typeof import("@/lib/higgsfield")>("@/lib/higgsfield");
  return {
    ...actual,
    assertHiggsfieldReady: vi.fn(async () => {}),
    hfRun: vi.fn(async (args: string[], timeoutMs?: number) => {
      H.calls.push({ args, timeoutMs });
      return { stdout: '["provider-job-r4"]', stderr: "" };
    }),
  };
});
vi.mock("@/lib/higgsfield-background-poll", () => ({
  scheduleHiggsfieldBackgroundPoll: vi.fn(),
}));

let dataDir: string;
beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-no-text-r4-"));
  process.env.DATA_DIR = dataDir;
  H.calls = [];
  vi.resetModules();
});
afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function post(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/higgsfield/image/route");
  return POST(new Request("http://internal.local/api/higgsfield/image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, tenant_id: TENANT }),
  }));
}

describe("R4 무문자 이미지 생성 모델 계약", () => {
  it("R4-01 정상 경로: GPT Image 2.5 1k/low로 접수하고 참조 이미지를 보내지 않는다", async () => {
    const response = await post({
      prompt: "A ceramic cup on a clean wooden table. Every surface is blank and unmarked.",
      aspectRatio: "9:16",
    });

    expect(response.status).toBe(202);
    const create = H.calls.at(0)?.args ?? [];
    expect(create.slice(0, 3)).toEqual(["generate", "create", "gpt_image_2_5"]);
    expect(create).toContain("--resolution");
    expect(create[create.indexOf("--resolution") + 1]).toBe("1k");
    expect(create).toContain("--quality");
    expect(create[create.indexOf("--quality") + 1]).toBe("low");
    expect(create).not.toContain("--image-references");
    expect(create).not.toContain("--image");
    expect(create).not.toContain("text2image_soul_v2");
  });

  it("R4-02 거절 경로: 요청 본문의 참조 이미지는 CLI 인자로 승격하지 않는다", async () => {
    const response = await post({
      prompt: "A blank ceramic cup on a plain table.",
      imageReferences: ["/tmp/draft-screen-with-copy.png"],
      image_references: ["/tmp/legacy-screen-with-copy.png"],
    });

    expect(response.status).toBe(202);
    const create = H.calls.at(0)?.args ?? [];
    expect(create.join(" ")).not.toContain("draft-screen-with-copy");
    expect(create.join(" ")).not.toContain("legacy-screen-with-copy");
    expect(create).not.toContain("--image-references");
  });
});
