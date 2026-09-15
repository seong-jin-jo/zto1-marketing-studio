import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTestPluginApi } from "openclaw/plugin-sdk/plugin-test-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  record: vi.fn(),
  uploads: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../threads-queue/api.js", () => ({
  beginQueuePublishAttempt: mocks.begin,
  recordQueueProviderResult: mocks.record,
  resolvePublisherQueuePath: () => "/tmp/threads-queue.json",
}));

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: class PutObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  },
  S3Client: class S3Client {
    async send(command: { input: Record<string, unknown> }) {
      mocks.uploads.push(command.input);
      return {};
    }
  },
}));

import { createInstagramPublishTool } from "./instagram-publish-tool.js";

let dataDir = "";

describe("CODE-REVIEW-20260915-08 Instagram 캐러셀 객체 보존", () => {
  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-instagram-carousel-"));
    fs.mkdirSync(path.join(dataDir, "images"), { recursive: true });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fs.writeFileSync(path.join(dataDir, "images", "first.png"), png);
    fs.writeFileSync(path.join(dataDir, "images", "second.png"), png);
    vi.stubEnv("DATA_DIR", dataDir);
    vi.stubEnv("INSTAGRAM_ACCESSTOKEN", "test-access-token");
    vi.stubEnv("INSTAGRAM_USERID", "test-user-id");
    vi.stubEnv("R2_ACCESS_KEY_ID", "test-r2-access");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-r2-secret");
    vi.stubEnv("R2_BUCKET", "test-bucket");
    vi.stubEnv("R2_PUBLIC_URL", "https://media.example.test");
    vi.stubEnv("R2_ENDPOINT", "https://r2.example.test");
    mocks.begin.mockResolvedValue({ idempotencyKey: "attempt-1" });
    mocks.record.mockResolvedValue(undefined);
    mocks.uploads.length = 0;
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("CODE-REVIEW-20260915-08 정상: 같은 확장자의 두 장이 서로 다른 객체와 URL을 쓴다", async () => {
    const requestedImageUrls: string[] = [];
    let sequence = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
        const imageUrl = body.get("image_url");
        if (imageUrl) requestedImageUrls.push(imageUrl);
        sequence += 1;
        return new Response(JSON.stringify({ id: `provider-${sequence}` }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const api = createTestPluginApi({ id: "instagram-publish", name: "instagram-publish" });
    const tool = createInstagramPublishTool(api);

    await tool.execute("call-1", {
      caption: "검증 캐러셀",
      image_urls: ["/images/first.png", "/images/second.png"],
      queue_id: "post-1",
      claim_token: "claim-1",
    });

    const keys = mocks.uploads.map((upload) => upload.Key);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(new Set(requestedImageUrls).size).toBe(2);
  });

  it("CODE-REVIEW-20260915-12 거절: 공급자 호출 전 저장소 준비 실패를 결과 불명으로 기록하지 않는다", async () => {
    vi.stubEnv("R2_BUCKET", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const api = createTestPluginApi({ id: "instagram-publish", name: "instagram-publish" });
    const tool = createInstagramPublishTool(api);

    await expect(tool.execute("call-2", {
      caption: "저장소 실패 검증",
      image_urls: ["/images/first.png"],
      queue_id: "post-2",
      claim_token: "claim-2",
    })).rejects.toThrow("R2 credentials not configured");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenLastCalledWith(expect.objectContaining({ state: "provider_failed" }));
  });
});
