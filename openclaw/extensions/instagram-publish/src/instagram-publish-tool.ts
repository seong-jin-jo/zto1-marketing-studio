import { Type } from "typebox";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk/agent-runtime";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import { readFile, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  beginQueuePublishAttempt,
  recordQueueProviderResult,
  resolvePublisherQueuePath,
} from "../../threads-queue/api.js";

const API_BASE = "https://graph.instagram.com/v21.0";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const LOCAL_IMAGE_PREFIX = "/images/";

function hasExpectedImageSignature(buffer: Buffer, extension: string): boolean {
  if (extension === ".jpg" || extension === ".jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (extension === ".png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === ".gif") {
    const signature = buffer.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }
  return extension === ".webp"
    && buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

export async function readOwnedLocalImage(
  imageUrl: string,
  dataDir: string,
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  if (!imageUrl.startsWith(LOCAL_IMAGE_PREFIX)) throw new Error("로컬 이미지 경로가 아닙니다");
  const requested = imageUrl.slice(LOCAL_IMAGE_PREFIX.length);
  if (!requested || requested.includes("\0") || isAbsolute(requested)) {
    throw new Error("허용되지 않은 로컬 이미지 경로입니다");
  }

  const imageRoot = await realpath(resolve(dataDir, "images"));
  const filePath = await realpath(resolve(imageRoot, requested));
  const childPath = relative(imageRoot, filePath);
  if (!childPath || childPath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || childPath === ".." || isAbsolute(childPath)) {
    throw new Error("이미지 저장소 밖의 파일은 발행할 수 없습니다");
  }

  const extension = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension];
  if (!contentType) throw new Error("지원하지 않는 이미지 파일 형식입니다");
  const buffer = await readFile(filePath);
  if (!hasExpectedImageSignature(buffer, extension)) throw new Error("파일 내용이 이미지 형식과 일치하지 않습니다");
  return { buffer, filename: basename(filePath), contentType };
}

type Config = { accessToken?: string; userId?: string; queuePath?: string };

function resolveConfig(api: OpenClawPluginApi) {
  const pluginCfg = (api.pluginConfig ?? {}) as Config;
  const accessToken = (typeof pluginCfg.accessToken === "string" && pluginCfg.accessToken.trim()) || process.env.INSTAGRAM_ACCESSTOKEN || "";
  const userId = (typeof pluginCfg.userId === "string" && pluginCfg.userId.trim()) || process.env.INSTAGRAM_USERID || "";
  if (!accessToken) throw new Error("Instagram access token not configured. Set INSTAGRAM_ACCESSTOKEN env var.");
  if (!userId) throw new Error("Instagram user ID not configured. Set INSTAGRAM_USERID env var.");
  return { accessToken, userId };
}

async function uploadToR2(localPath: string, idempotencyKey: string): Promise<string> {
  const dataDir = process.env.DATA_DIR || "/home/node/data";
  const { buffer: fileBuffer, filename, contentType } = await readOwnedLocalImage(localPath, dataDir);

  const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
  const bucket = process.env.R2_BUCKET || "";
  const publicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  const endpoint = process.env.R2_ENDPOINT || "";

  if (!accessKeyId || !secretAccessKey || !bucket || !publicUrl || !endpoint) {
    throw new Error("R2 credentials not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL, R2_ENDPOINT env vars.");
  }

  const ext = extname(filename).toLowerCase();
  const key = `instagram/${idempotencyKey}${ext}`;

  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  }));

  return `${publicUrl}/${key}`;
}

async function resolveImageUrl(url: string, idempotencyKey: string): Promise<string> {
  if (url.startsWith("/images/")) return await uploadToR2(url, idempotencyKey);
  return url;
}

const ToolSchema = Type.Object({
  caption: Type.String({ description: "Post caption. Max 2200 characters." }),
  image_urls: Type.Array(Type.String(), {
    description: "Array of image URLs (1-10). Local /images/ paths are auto-uploaded. 1 image = single post, 2+ = carousel.",
    minItems: 1,
    maxItems: 10,
  }),
  queue_id: Type.String({ description: "get_approved가 반환한 큐 작업물 ID." }),
  claim_token: Type.String({ description: "get_approved가 반환한 claimToken." }),
}, { additionalProperties: false });

export function createInstagramPublishTool(api: OpenClawPluginApi) {
  return {
    name: "instagram_publish",
    label: "Instagram Publish",
    description: "Publish single image or carousel to Instagram. Pass image_urls array (1=single, 2+=carousel). Local /images/ paths are auto-uploaded to public URL. Max 2200 char caption.",
    parameters: ToolSchema,
    async execute(_toolCallId: string, rawParams: Record<string, unknown>) {
      const caption = readStringParam(rawParams, "caption", { required: true });
      const postId = readStringParam(rawParams, "queue_id", { required: true });
      const claimToken = readStringParam(rawParams, "claim_token", { required: true });
      if (caption.length > 2200) throw new Error(`Caption exceeds 2200 char limit (${caption.length} chars).`);

      const imageUrls = rawParams.image_urls as string[];
      if (!imageUrls?.length) throw new Error("At least one image_url is required.");

      const { accessToken, userId } = resolveConfig(api);
      const queuePath = resolvePublisherQueuePath((api.pluginConfig ?? {}) as Config);
      const attempt = await beginQueuePublishAttempt({ queuePath, postId, channel: "instagram", claimToken });
      let resultRecorded = false;

      try {
      // Resolve all image URLs (upload local paths)
      const publicUrls: string[] = [];
      for (const url of imageUrls) {
        publicUrls.push(await resolveImageUrl(url, attempt.idempotencyKey));
      }

      let mediaId: string;

      if (publicUrls.length === 1) {
        // Single image post
        const createResp = await fetch(`${API_BASE}/${userId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": attempt.idempotencyKey },
          body: new URLSearchParams({ image_url: publicUrls[0], caption, access_token: accessToken }),
        });
        if (!createResp.ok) throw new Error(`IG container failed: ${await createResp.text()}`);
        const { id: containerId } = (await createResp.json()) as { id: string };

        const pubResp = await fetch(`${API_BASE}/${userId}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": attempt.idempotencyKey },
          body: new URLSearchParams({ creation_id: containerId, access_token: accessToken }),
        });
        if (!pubResp.ok) throw new Error(`IG publish failed: ${await pubResp.text()}`);
        const pub = (await pubResp.json()) as { id: string };
        mediaId = pub.id;
      } else {
        // Carousel: create children first, then carousel container, then publish
        const childIds: string[] = [];
        for (const url of publicUrls) {
          const childResp = await fetch(`${API_BASE}/${userId}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `${attempt.idempotencyKey}-${childIds.length}` },
            body: new URLSearchParams({
              image_url: url,
              is_carousel_item: "true",
              access_token: accessToken,
            }),
          });
          if (!childResp.ok) throw new Error(`IG carousel child failed: ${await childResp.text()}`);
          const child = (await childResp.json()) as { id: string };
          childIds.push(child.id);
        }

        // Create carousel container
        const carouselResp = await fetch(`${API_BASE}/${userId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": attempt.idempotencyKey },
          body: new URLSearchParams({
            media_type: "CAROUSEL",
            caption,
            children: childIds.join(","),
            access_token: accessToken,
          }),
        });
        if (!carouselResp.ok) throw new Error(`IG carousel container failed: ${await carouselResp.text()}`);
        const { id: carouselId } = (await carouselResp.json()) as { id: string };

        // Publish carousel
        const pubResp = await fetch(`${API_BASE}/${userId}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": attempt.idempotencyKey },
          body: new URLSearchParams({ creation_id: carouselId, access_token: accessToken }),
        });
        if (!pubResp.ok) throw new Error(`IG carousel publish failed: ${await pubResp.text()}`);
        const pub = (await pubResp.json()) as { id: string };
        mediaId = pub.id;
      }

      await recordQueueProviderResult({
        queuePath,
        postId,
        channel: "instagram",
        claimToken,
        idempotencyKey: attempt.idempotencyKey,
        state: "provider_succeeded",
        providerId: mediaId,
      });
      resultRecorded = true;

      return jsonResult({
        success: true,
        mediaId,
        type: publicUrls.length === 1 ? "SINGLE" : "CAROUSEL",
        imageCount: publicUrls.length,
        captionLength: caption.length,
        idempotencyKey: attempt.idempotencyKey,
      });
      } catch (error) {
        if (!resultRecorded) {
          await recordQueueProviderResult({
            queuePath,
            postId,
            channel: "instagram",
            claimToken,
            idempotencyKey: attempt.idempotencyKey,
            state: "result_unknown",
            error: error instanceof Error ? error.message : String(error),
          }).catch(() => {});
        }
        throw error;
      }
    },
  };
}
