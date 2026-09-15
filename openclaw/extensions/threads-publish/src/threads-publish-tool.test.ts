import { createTestPluginApi } from "openclaw/plugin-sdk/plugin-test-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const queue = vi.hoisted(() => ({
  begin: vi.fn(),
  record: vi.fn(),
  uploads: [] as Array<Record<string, unknown>>,
  deletes: [] as Array<Record<string, unknown>>,
}));

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: class PutObjectCommand { kind = "put"; constructor(public input: Record<string, unknown>) {} },
  GetObjectCommand: class GetObjectCommand { kind = "get"; constructor(public input: Record<string, unknown>) {} },
  DeleteObjectCommand: class DeleteObjectCommand { kind = "delete"; constructor(public input: Record<string, unknown>) {} },
  S3Client: class S3Client {
    async send(command: { kind: string; input: Record<string, unknown> }) {
      if (command.kind === "put") queue.uploads.push(command.input);
      if (command.kind === "delete") queue.deletes.push(command.input);
      return {};
    }
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async (_client: unknown, command: { input: { Key: string } }, options: { expiresIn: number }) =>
    `https://signed.example.test/${command.input.Key}?expires=${options.expiresIn}`),
}));

vi.mock("../../threads-queue/api.js", () => ({
  beginQueuePublishAttempt: queue.begin,
  recordQueueProviderResult: queue.record,
  resolvePublisherQueuePath: () => "/tmp/threads-queue.json",
}));

import { createThreadsPublishTool } from "./threads-publish-tool.js";

let dataDir = "";

describe("OSMU-CODE-REVIEW-20260916-08 Threads 고객 이미지 단기 배달", () => {
  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-threads-image-"));
    fs.mkdirSync(path.join(dataDir, "images"), { recursive: true });
    fs.writeFileSync(path.join(dataDir, "images", "customer.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    vi.stubEnv("THREADS_ACCESS_TOKEN", "test-access-token");
    vi.stubEnv("THREADS_USER_ID", "test-user-id");
    vi.stubEnv("DATA_DIR", dataDir);
    vi.stubEnv("R2_ACCESS_KEY_ID", "test-r2-access");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-r2-secret");
    vi.stubEnv("R2_BUCKET", "test-bucket");
    vi.stubEnv("R2_ENDPOINT", "https://r2.example.test");
    queue.begin.mockResolvedValue({ idempotencyKey: "attempt-1" });
    queue.record.mockResolvedValue(undefined);
    queue.uploads.length = 0;
    queue.deletes.length = 0;
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("정상: 로컬 이미지는 15분 서명 주소로 공급자에게 주고 발행 뒤 지운다", async () => {
    const requestedImageUrls: string[] = [];
    let sequence = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
      const imageUrl = body.get("image_url");
      if (imageUrl) requestedImageUrls.push(imageUrl);
      sequence += 1;
      return new Response(JSON.stringify({ id: `provider-${sequence}` }), { status: 200 });
    }));
    const api = createTestPluginApi({ id: "threads-publish", name: "threads-publish" });
    const tool = createThreadsPublishTool(api);

    await tool.execute("call-1", {
      text: "검증 글",
      image_url: "/images/customer.png",
      queue_id: "post-1",
      claim_token: "claim-1",
    });

    expect(requestedImageUrls).toEqual([expect.stringContaining("expires=900")]);
    expect(queue.uploads).toHaveLength(1);
    expect(queue.deletes.map((entry) => entry.Key)).toEqual(queue.uploads.map((entry) => entry.Key));
    expect(queue.record).toHaveBeenCalledWith(expect.objectContaining({ state: "provider_succeeded" }));
  });

  it("거절: 저장소 설정이 없으면 공급자 호출 전에 확정 실패로 닫는다", async () => {
    vi.stubEnv("R2_BUCKET", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const tool = createThreadsPublishTool(createTestPluginApi({ id: "threads-publish", name: "threads-publish" }));
    await expect(tool.execute("call-2", {
      text: "검증 글", image_url: "/images/customer.png", queue_id: "post-2", claim_token: "claim-2",
    })).rejects.toThrow("보호된 이미지 배달 저장소 설정");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(queue.record).toHaveBeenCalledWith(expect.objectContaining({ state: "provider_failed" }));
  });
});
