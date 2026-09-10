import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { isSafeMediaFilename } from "@/lib/media-token";

const R2_ENV_KEYS = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_ENDPOINT"] as const;

type StoreMode =
  | { kind: "local" }
  | {
      kind: "r2";
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
      endpoint: string;
    };

export interface StoredMedia {
  body: ReadableStream<Uint8Array>;
  contentLength?: number;
  contentType?: string;
  source: "r2" | "local";
}

export class MediaStoreError extends Error {
  readonly code: "INVALID_KEY" | "R2_CONFIG" | "R2_UNAVAILABLE" | "LOCAL_IO";

  constructor(code: MediaStoreError["code"], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MediaStoreError";
    this.code = code;
  }
}

let cachedR2Client: { key: string; client: S3Client } | null = null;

function resolveMode(): StoreMode {
  const values = Object.fromEntries(R2_ENV_KEYS.map((key) => [key, process.env[key]?.trim() || ""])) as Record<
    (typeof R2_ENV_KEYS)[number],
    string
  >;
  const present = R2_ENV_KEYS.filter((key) => Boolean(values[key]));
  if (present.length === 0) return { kind: "local" };
  if (present.length !== R2_ENV_KEYS.length) {
    const missing = R2_ENV_KEYS.filter((key) => !values[key]).join(", ");
    throw new MediaStoreError("R2_CONFIG", `R2 저장소 설정이 완전하지 않습니다. 누락: ${missing}`);
  }
  return {
    kind: "r2",
    accessKeyId: values.R2_ACCESS_KEY_ID,
    secretAccessKey: values.R2_SECRET_ACCESS_KEY,
    bucket: values.R2_BUCKET,
    endpoint: values.R2_ENDPOINT,
  };
}

function r2Client(mode: Extract<StoreMode, { kind: "r2" }>): S3Client {
  const key = `${mode.endpoint}\n${mode.accessKeyId}\n${mode.bucket}`;
  if (cachedR2Client?.key === key) return cachedR2Client.client;
  const client = new S3Client({
    region: "auto",
    endpoint: mode.endpoint,
    credentials: {
      accessKeyId: mode.accessKeyId,
      secretAccessKey: mode.secretAccessKey,
    },
  });
  cachedR2Client = { key, client };
  return client;
}

function assertKey(tenantId: string, filename: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(tenantId) || !isSafeMediaFilename(filename)) {
    throw new MediaStoreError("INVALID_KEY", "안전하지 않은 미디어 저장 경로입니다.");
  }
}

export function mediaObjectKey(tenantId: string, filename: string): string {
  assertKey(tenantId, filename);
  return `tenants/${tenantId}/images/${filename}`;
}

function localFilePath(tenantId: string, filename: string): string {
  assertKey(tenantId, filename);
  const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), "../data");
  return path.join(dataDir, "tenants", tenantId, "images", filename);
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return value.$metadata?.httpStatusCode === 404 || value.name === "NoSuchKey" || value.name === "NotFound" || value.Code === "NoSuchKey";
}

function r2Failure(action: string, cause: unknown): MediaStoreError {
  return new MediaStoreError("R2_UNAVAILABLE", `R2 저장소에서 이미지를 ${action}하지 못했습니다. 잠시 후 다시 시도해 주세요.`, {
    cause,
  });
}

function localGet(tenantId: string, filename: string): StoredMedia | null {
  const filePath = localFilePath(tenantId, filename);
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    const stat = fs.statSync(filePath);
    return {
      body: Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>,
      contentLength: stat.size,
      source: "local",
    };
  } catch (cause) {
    throw new MediaStoreError("LOCAL_IO", "로컬 저장소에서 이미지를 읽지 못했습니다.", { cause });
  }
}

function toWebStream(body: unknown): ReadableStream<Uint8Array> {
  if (body instanceof ReadableStream) return body as ReadableStream<Uint8Array>;
  if (body instanceof Readable) return Readable.toWeb(body) as ReadableStream<Uint8Array>;
  if (body && typeof (body as { transformToWebStream?: unknown }).transformToWebStream === "function") {
    return (body as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream();
  }
  throw new MediaStoreError("R2_UNAVAILABLE", "R2 저장소가 읽을 수 있는 이미지 스트림을 반환하지 않았습니다.");
}

async function put(tenantId: string, filename: string, body: Buffer | Uint8Array, contentType?: string): Promise<void> {
  const mode = resolveMode();
  if (mode.kind === "local") {
    const filePath = localFilePath(tenantId, filename);
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, body);
      return;
    } catch (cause) {
      throw new MediaStoreError("LOCAL_IO", "로컬 저장소에 이미지를 저장하지 못했습니다.", { cause });
    }
  }

  try {
    await r2Client(mode).send(
      new PutObjectCommand({
        Bucket: mode.bucket,
        Key: mediaObjectKey(tenantId, filename),
        Body: body,
        ContentType: contentType,
      }),
    );
  } catch (cause) {
    throw r2Failure("저장", cause);
  }
}

async function get(tenantId: string, filename: string): Promise<StoredMedia | null> {
  const mode = resolveMode();
  if (mode.kind === "local") return localGet(tenantId, filename);

  try {
    const output = await r2Client(mode).send(
      new GetObjectCommand({ Bucket: mode.bucket, Key: mediaObjectKey(tenantId, filename) }),
    );
    if (!output.Body) throw new Error("empty R2 body");
    return {
      body: toWebStream(output.Body),
      contentLength: output.ContentLength,
      contentType: output.ContentType,
      source: "r2",
    };
  } catch (cause) {
    if (isNotFound(cause)) return localGet(tenantId, filename);
    if (cause instanceof MediaStoreError) throw cause;
    throw r2Failure("읽기", cause);
  }
}

async function r2Exists(mode: Extract<StoreMode, { kind: "r2" }>, tenantId: string, filename: string): Promise<boolean> {
  try {
    await r2Client(mode).send(
      new HeadObjectCommand({ Bucket: mode.bucket, Key: mediaObjectKey(tenantId, filename) }),
    );
    return true;
  } catch (cause) {
    if (isNotFound(cause)) return false;
    throw r2Failure("확인", cause);
  }
}

async function exists(tenantId: string, filename: string): Promise<boolean> {
  const mode = resolveMode();
  const localExists = () => {
    const filePath = localFilePath(tenantId, filename);
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  };
  if (mode.kind === "local") return localExists();
  return (await r2Exists(mode, tenantId, filename)) || localExists();
}

function deleteLocal(tenantId: string, filename: string): boolean {
  const filePath = localFilePath(tenantId, filename);
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
    fs.unlinkSync(filePath);
    return true;
  } catch (cause) {
    throw new MediaStoreError("LOCAL_IO", "로컬 저장소에서 이미지를 삭제하지 못했습니다.", { cause });
  }
}

async function deleteMedia(tenantId: string, filename: string): Promise<boolean> {
  const mode = resolveMode();
  if (mode.kind === "local") return deleteLocal(tenantId, filename);

  const hasR2Object = await r2Exists(mode, tenantId, filename);
  if (hasR2Object) {
    try {
      await r2Client(mode).send(
        new DeleteObjectCommand({ Bucket: mode.bucket, Key: mediaObjectKey(tenantId, filename) }),
      );
    } catch (cause) {
      throw r2Failure("삭제", cause);
    }
  }
  const deletedLocal = deleteLocal(tenantId, filename);
  return hasR2Object || deletedLocal;
}

// R2_PUBLIC_URL은 의도적으로 읽지 않는다. 외부 배달은 비공개 버킷이 아니라
// /api/images/deliver/<HMAC 토큰>을 통해서만 이뤄져 예약 발행 만료를 우리 서버가 통제한다.
export const mediaStore = { put, get, delete: deleteMedia, exists };
export { put, get, deleteMedia, exists };
