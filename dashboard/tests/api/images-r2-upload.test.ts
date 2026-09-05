import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ send: vi.fn(), tenantId: "tenant-a" }));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => H.tenantId),
  AuthError: class AuthError extends Error {
    status = 401;
  },
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    readonly input: Record<string, unknown>;

    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  }
  return {
    S3Client: class S3Client {
      send = H.send;
    },
    PutObjectCommand: class PutObjectCommand extends Command {},
    GetObjectCommand: class GetObjectCommand extends Command {},
    DeleteObjectCommand: class DeleteObjectCommand extends Command {},
    HeadObjectCommand: class HeadObjectCommand extends Command {},
  };
});

const R2_ENV = {
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  R2_BUCKET: "osmu-media",
  R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
};
let dataDir: string;

async function upload() {
  const { POST } = await import("@/app/api/images/upload/route");
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" }));
  return POST(new Request("https://app.example.com/api/images/upload", { method: "POST", body: form }));
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "osmu-images-r2-route-"));
  process.env.DATA_DIR = dataDir;
  process.env.OSMU_PUBLIC_URL = "https://app.example.com";
  process.env.MEDIA_SIGNING_SECRET = "test-media-signing-secret-0123456789";
  Object.assign(process.env, R2_ENV);
  H.send.mockReset();
  vi.resetModules();
});

afterEach(() => {
  for (const key of [...Object.keys(R2_ENV), "DATA_DIR", "OSMU_PUBLIC_URL", "MEDIA_SIGNING_SECRET"]) {
    delete process.env[key];
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.resetModules();
});

describe("POST /api/images/upload R2 장애 계약", () => {
  it("IMG-R2-01 정상 R2 저장 성공이면 기존 HMAC 배달 URL을 반환한다", async () => {
    H.send.mockResolvedValueOnce({});

    const response = await upload();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/app\.example\.com\/api\/images\/deliver\//);
    expect(H.send).toHaveBeenCalledTimes(1);
  });

  it("IMG-R2-02 거절 R2 연결 실패를 한국어 오류로 반환하고 로컬 성공으로 위장하지 않는다", async () => {
    H.send.mockRejectedValueOnce(new Error("network unavailable"));

    const response = await upload();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("R2 저장소에서 이미지를 저장하지 못했습니다");
    expect(fs.existsSync(path.join(dataDir, "tenants", "tenant-a", "images"))).toBe(false);
  });

  it("IMG-R2-03 이전호환 기존 서명 URL은 R2에 객체가 없어도 로컬 원본을 배달한다", async () => {
    const legacyPath = path.join(dataDir, "tenants", "tenant-a", "images", "legacy.png");
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, "legacy-pixel");
    H.send.mockRejectedValueOnce({ name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
    const { signImageToken } = await import("@/lib/image-token");
    const { GET } = await import("@/app/api/images/deliver/[token]/route");
    const token = signImageToken("tenant-a", "legacy.png")!;

    const response = await GET(new Request(`https://app.example.com/api/images/deliver/${token}`), {
      params: Promise.resolve({ token }),
    });

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("legacy-pixel");
  });
});
