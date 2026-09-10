import { Readable } from "node:stream";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const S3 = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    readonly input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }

  return {
    S3Client: class S3Client {
      send = S3.send;
    },
    PutObjectCommand: class PutObjectCommand extends Command {},
    GetObjectCommand: class GetObjectCommand extends Command {},
    DeleteObjectCommand: class DeleteObjectCommand extends Command {},
    HeadObjectCommand: class HeadObjectCommand extends Command {},
  };
});

const R2_ENV_KEYS = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT"] as const;
let dataDir: string;

function configureR2() {
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.R2_BUCKET = "osmu-media";
  process.env.R2_ENDPOINT = "https://account.r2.cloudflarestorage.com";
}

function localPath(tenantId: string, filename: string) {
  return path.join(dataDir, "tenants", tenantId, "images", filename);
}

async function readWebStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString();
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-media-store-"));
  process.env.DATA_DIR = dataDir;
  for (const key of R2_ENV_KEYS) delete process.env[key];
  S3.send.mockReset();
  vi.resetModules();
});

afterEach(() => {
  delete process.env.DATA_DIR;
  for (const key of R2_ENV_KEYS) delete process.env[key];
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.resetModules();
});

describe("media-store 저장소 선택과 장애 계약", () => {
  it("MS-01 정상 R2 설정이 모두 있으면 테넌트 객체 키로 R2에 저장한다", async () => {
    configureR2();
    S3.send.mockResolvedValueOnce({});
    const { put } = await import("@/lib/media-store");

    await put("tenant-a", "photo.png", Buffer.from("pixel"), "image/png");

    expect(S3.send).toHaveBeenCalledTimes(1);
    const command = S3.send.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(command.input).toMatchObject({
      Bucket: "osmu-media",
      Key: "tenants/tenant-a/images/photo.png",
      ContentType: "image/png",
    });
    expect(fs.existsSync(localPath("tenant-a", "photo.png"))).toBe(false);
  });

  it("MS-02 정상 R2 설정이 전혀 없으면 기존 테넌트 로컬 경로에 저장한다", async () => {
    const { put } = await import("@/lib/media-store");

    await put("tenant-a", "photo.png", Buffer.from("pixel"), "image/png");

    expect(S3.send).not.toHaveBeenCalled();
    expect(fs.readFileSync(localPath("tenant-a", "photo.png"), "utf8")).toBe("pixel");
  });

  it("MS-03 거절 R2 쓰기가 실패하면 로컬 저장 성공으로 위장하지 않는다", async () => {
    configureR2();
    S3.send.mockRejectedValueOnce(new Error("R2 unavailable"));
    const { put, MediaStoreError } = await import("@/lib/media-store");

    await expect(put("tenant-a", "photo.png", Buffer.from("pixel"), "image/png")).rejects.toBeInstanceOf(MediaStoreError);
    expect(fs.existsSync(localPath("tenant-a", "photo.png"))).toBe(false);
  });

  it("MS-04 경계 R2 설정이 일부만 있으면 로컬로 조용히 전환하지 않는다", async () => {
    process.env.R2_BUCKET = "osmu-media";
    const { put, MediaStoreError } = await import("@/lib/media-store");

    await expect(put("tenant-a", "photo.png", Buffer.from("pixel"))).rejects.toBeInstanceOf(MediaStoreError);
    expect(fs.existsSync(localPath("tenant-a", "photo.png"))).toBe(false);
  });

  it("MS-05 이전호환 R2에 객체가 없으면 기존 로컬 파일을 읽는다", async () => {
    configureR2();
    const filePath = localPath("tenant-a", "legacy.png");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "legacy-pixel");
    S3.send.mockRejectedValueOnce({ name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
    const { get } = await import("@/lib/media-store");

    const stored = await get("tenant-a", "legacy.png");

    expect(stored).not.toBeNull();
    expect(await readWebStream(stored!.body)).toBe("legacy-pixel");
    expect(stored!.source).toBe("local");
  });

  it("MS-06 정상 R2 객체를 웹 스트림으로 읽는다", async () => {
    configureR2();
    S3.send.mockResolvedValueOnce({
      Body: Readable.from(Buffer.from("r2-pixel")),
      ContentLength: 8,
      ContentType: "image/png",
    });
    const { get } = await import("@/lib/media-store");

    const stored = await get("tenant-a", "photo.png");

    expect(await readWebStream(stored!.body)).toBe("r2-pixel");
    expect(stored).toMatchObject({ source: "r2", contentLength: 8, contentType: "image/png" });
  });

  it("MS-07 정상 R2와 이전 로컬에 함께 있는 이미지를 모두 삭제한다", async () => {
    configureR2();
    const filePath = localPath("tenant-a", "photo.png");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "legacy-copy");
    S3.send.mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const { mediaStore } = await import("@/lib/media-store");

    const deleted = await mediaStore.delete("tenant-a", "photo.png");

    expect(deleted).toBe(true);
    expect(S3.send).toHaveBeenCalledTimes(2);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
