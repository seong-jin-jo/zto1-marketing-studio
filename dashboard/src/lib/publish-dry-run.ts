import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DATA_DIR } from "@/lib/file-io";
import type { PublishResult } from "@/lib/publish";

export type DryRunMediaSpec = {
  path: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  codec: string | null;
  format: string | null;
};

export type DryRunRequestRecord = {
  timestamp: string;
  requestId: string;
  tenantId: string;
  platform: string;
  sequence: number;
  sequenceTotal: number;
  step: string;
  method: "POST" | "PUT";
  endpoint: string;
  body: Record<string, unknown>;
  mediaUrls: string[];
  mediaSpec: DryRunMediaSpec | null;
};

const TEXT_ENDPOINTS: Record<string, string> = {
  threads: "https://graph.threads.net/v1.0/{user-id}/threads",
  x: "https://api.twitter.com/2/tweets",
  instagram: "https://graph.facebook.com/v21.0/{ig-user-id}/media",
  facebook: "https://graph.facebook.com/v21.0/{page-id}/feed",
  linkedin: "https://api.linkedin.com/v2/ugcPosts",
  bluesky: "https://bsky.social/xrpc/com.atproto.repo.createRecord",
  telegram: "https://api.telegram.org/bot[REDACTED]/sendMessage",
  discord: "https://discord.com/api/webhooks/[REDACTED]",
  slack: "https://hooks.slack.com/services/[REDACTED]",
  kakao: "https://kapi.kakao.com/v2/api/talk/memo/default/send",
};

const VIDEO_ENDPOINTS: Record<string, string> = {
  youtube: "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
  tiktok: "https://open.tiktokapis.com/v2/post/publish/video/init/",
  reels: "https://graph.facebook.com/v21.0/{ig-user-id}/media",
  instagram_reels: "https://graph.facebook.com/v21.0/{ig-user-id}/media",
};

export function isPublishDryRunEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.PUBLISH_DRY_RUN === "1" && environment.NODE_ENV !== "production";
}

export function publishDryRunLogPath(environment: NodeJS.ProcessEnv = process.env): string {
  return environment.PUBLISH_DRY_RUN_LOG?.trim()
    || path.join(environment.DATA_DIR || DATA_DIR, "publish-dry-run", "requests.jsonl");
}

function appendRecord(record: DryRunRequestRecord): void {
  const target = publishDryRunLogPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
}

function appendSequence(input: {
  tenantId: string;
  platform: string;
  mediaUrls: string[];
  mediaSpec: DryRunMediaSpec | null;
  requests: Array<{ step: string; method: "POST" | "PUT"; endpoint: string; body: Record<string, unknown> }>;
}): void {
  const requestId = `dry-run-${input.platform}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  input.requests.forEach((request, index) => appendRecord({
    timestamp: new Date().toISOString(),
    requestId,
    tenantId: input.tenantId,
    platform: input.platform,
    sequence: index + 1,
    sequenceTotal: input.requests.length,
    step: request.step,
    method: request.method,
    endpoint: request.endpoint,
    body: request.body,
    mediaUrls: input.mediaUrls,
    mediaSpec: input.mediaSpec,
  }));
}

export function inspectDryRunMedia(filePath: string): DryRunMediaSpec {
  const stat = fs.statSync(filePath);
  const probe = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_name,width,height:format=format_name,duration",
    "-of", "json",
    filePath,
  ], { encoding: "utf8", timeout: 15_000 });
  let parsed: { streams?: Array<{ codec_name?: string; width?: number; height?: number }>; format?: { format_name?: string; duration?: string } } = {};
  if (probe.status === 0 && probe.stdout) {
    try { parsed = JSON.parse(probe.stdout) as typeof parsed; } catch { parsed = {}; }
  }
  const stream = parsed.streams?.find((candidate) => candidate.width || candidate.height) ?? parsed.streams?.[0];
  const duration = Number(parsed.format?.duration);
  return {
    path: filePath,
    bytes: stat.size,
    width: Number.isFinite(stream?.width) ? stream?.width ?? null : null,
    height: Number.isFinite(stream?.height) ? stream?.height ?? null : null,
    durationSeconds: Number.isFinite(duration) ? duration : null,
    codec: stream?.codec_name ?? null,
    format: parsed.format?.format_name ?? null,
  };
}

export function recordTextPublishDryRun(input: {
  tenantId: string;
  platform: string;
  text: string;
  imageUrls?: string[];
  imagePaths?: string[];
  videoUrl?: string;
  videoPath?: string;
}): PublishResult {
  const endpoint = TEXT_ENDPOINTS[input.platform];
  if (!endpoint) return { ok: false, error: `${input.platform} 드라이런 어댑터 미지원` };
  const firstImage = input.imageUrls?.[0];
  const mediaUrls = input.videoUrl ? [input.videoUrl] : input.imageUrls ?? [];
  const mediaSpec = input.videoPath
    ? inspectDryRunMedia(input.videoPath)
    : input.imagePaths?.[0] ? inspectDryRunMedia(input.imagePaths[0]) : null;
  const requests: Array<{ step: string; method: "POST" | "PUT"; endpoint: string; body: Record<string, unknown> }> = [];

  if (input.platform === "x" && firstImage) {
    requests.push(
      {
        step: "media.initialize",
        method: "POST",
        endpoint: "https://api.x.com/2/media/upload/initialize",
        body: { media_type: mediaSpec?.format?.includes("png") ? "image/png" : "image/jpeg", total_bytes: mediaSpec?.bytes, media_category: "tweet_image" },
      },
      {
        step: "media.append",
        method: "POST",
        endpoint: "https://api.x.com/2/media/upload/[MEDIA_ID]/append",
        body: { segment_index: 0, media: firstImage },
      },
      {
        step: "media.finalize",
        method: "POST",
        endpoint: "https://api.x.com/2/media/upload/[MEDIA_ID]/finalize",
        body: { media_id: "[MEDIA_ID]" },
      },
      {
        step: "post.create",
        method: "POST",
        endpoint,
        body: { text: input.text, media: { media_ids: ["[MEDIA_ID]"] } },
      },
    );
  } else if (input.platform === "linkedin" && firstImage) {
    requests.push(
      {
        step: "asset.register",
        method: "POST",
        endpoint: "https://api.linkedin.com/v2/assets?action=registerUpload",
        body: {
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: "urn:li:person:[ACCOUNT]",
            serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
          },
        },
      },
      {
        step: "asset.upload",
        method: "PUT",
        endpoint: "https://[LINKEDIN_UPLOAD_HOST]/[UPLOAD_PATH]",
        body: { media: firstImage, bytes: mediaSpec?.bytes, content_type: mediaSpec?.format?.includes("png") ? "image/png" : "image/jpeg" },
      },
      {
        step: "post.create",
        method: "POST",
        endpoint,
        body: {
          author: "urn:li:person:[ACCOUNT]",
          lifecycleState: "PUBLISHED",
          specificContent: {
            "com.linkedin.ugc.ShareContent": {
              shareCommentary: { text: input.text },
              shareMediaCategory: "IMAGE",
              media: [{ status: "READY", media: "urn:li:digitalmediaAsset:[ASSET_ID]" }],
            },
          },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        },
      },
    );
  } else if (input.platform === "bluesky" && firstImage) {
    requests.push(
      {
        step: "session.create",
        method: "POST",
        endpoint: "https://bsky.social/xrpc/com.atproto.server.createSession",
        body: { identifier: "[ACCOUNT]", password: "[REDACTED]" },
      },
      {
        step: "blob.upload",
        method: "POST",
        endpoint: "https://bsky.social/xrpc/com.atproto.repo.uploadBlob",
        body: { media: firstImage, bytes: mediaSpec?.bytes },
      },
      {
        step: "post.create",
        method: "POST",
        endpoint,
        body: {
          repo: "[DID]",
          collection: "app.bsky.feed.post",
          record: {
            $type: "app.bsky.feed.post",
            text: input.text,
            createdAt: "[NOW]",
            embed: { $type: "app.bsky.embed.images", images: [{ image: "[BLOB_REF]", alt: "" }] },
          },
        },
      },
    );
  } else {
    const body: Record<string, unknown> = (() => {
    if (input.platform === "threads") return { text: input.text, media_type: firstImage ? "IMAGE" : "TEXT", image_url: firstImage };
    if (input.platform === "x") return { text: input.text };
    if (input.platform === "instagram") return { caption: input.text, media_type: (input.imageUrls?.length ?? 0) > 1 ? "CAROUSEL" : "IMAGE", image_url: firstImage };
    if (input.platform === "facebook") return input.videoUrl
      ? { description: input.text, file_url: input.videoUrl }
      : firstImage ? { caption: input.text, url: firstImage } : { message: input.text };
    if (input.platform === "linkedin") return { author: "urn:li:person:[ACCOUNT]", commentary: input.text, visibility: "PUBLIC" };
    if (input.platform === "bluesky") return { collection: "app.bsky.feed.post", record: { text: input.text, createdAt: "[NOW]" } };
    if (input.platform === "telegram") return input.videoUrl
      ? { chat_id: "[ACCOUNT]", caption: input.text, video: input.videoUrl }
      : firstImage ? { chat_id: "[ACCOUNT]", caption: input.text, photo: firstImage } : { chat_id: "[ACCOUNT]", text: input.text };
    if (input.platform === "discord") return { content: input.text, embeds: firstImage ? [{ image: { url: firstImage } }] : [] };
    if (input.platform === "slack") return { text: input.text, blocks: firstImage ? [{ type: "image", image_url: firstImage, alt_text: "publish media" }] : [] };
    if (input.platform === "kakao") {
      const linkUrl = firstImage || "http://127.0.0.1:3483/studio";
      return {
        template_object: {
          object_type: "text",
          text: input.text,
          link: { web_url: linkUrl, mobile_web_url: linkUrl },
          button_title: firstImage ? "이미지 보기" : "내용 보기",
        },
      };
    }
    return { text: input.text, media_count: input.imageUrls?.length ?? 0 };
    })();
    requests.push({
      step: "post.create",
      method: "POST",
      endpoint: input.platform === "facebook" && input.videoUrl
        ? "https://graph.facebook.com/v21.0/{page-id}/videos"
        : input.platform === "facebook" && firstImage
          ? "https://graph.facebook.com/v21.0/{page-id}/photos"
          : input.platform === "telegram" && input.videoUrl
            ? "https://api.telegram.org/bot[REDACTED]/sendVideo"
            : input.platform === "telegram" && firstImage
              ? "https://api.telegram.org/bot[REDACTED]/sendPhoto"
          : endpoint,
      body,
    });
  }
  appendSequence({ tenantId: input.tenantId, platform: input.platform, mediaUrls, mediaSpec, requests });
  return {
    ok: true,
    externalId: `dry-run-${input.platform}-${Date.now()}`,
    permalink: `http://127.0.0.1:3483/studio?dry_run=${encodeURIComponent(input.platform)}`,
  };
}

export function recordVideoPublishDryRun(input: {
  tenantId: string;
  platform: string;
  title: string;
  description: string;
  videoPath: string;
  videoUrl?: string;
  extra?: Record<string, unknown>;
}): { result: PublishResult; mediaSpec: DryRunMediaSpec } {
  const endpoint = VIDEO_ENDPOINTS[input.platform];
  if (!endpoint) return { result: { ok: false, error: `${input.platform} 드라이런 어댑터 미지원` }, mediaSpec: inspectDryRunMedia(input.videoPath) };
  const mediaSpec = inspectDryRunMedia(input.videoPath);
  appendRecord({
    timestamp: new Date().toISOString(),
    requestId: `dry-run-${input.platform}-${Date.now()}`,
    tenantId: input.tenantId,
    platform: input.platform,
    sequence: 1,
    sequenceTotal: 1,
    step: "video.publish",
    method: "POST",
    endpoint,
    body: {
      title: input.title,
      description: input.description,
      media: { bytes: mediaSpec.bytes, width: mediaSpec.width, height: mediaSpec.height, duration_seconds: mediaSpec.durationSeconds, codec: mediaSpec.codec, format: mediaSpec.format },
      ...(input.extra ?? {}),
    },
    mediaUrls: input.videoUrl ? [input.videoUrl] : [],
    mediaSpec,
  });
  return {
    result: {
      ok: true,
      externalId: `dry-run-${input.platform}-${Date.now()}`,
      permalink: `http://127.0.0.1:3483/studio?dry_run=${encodeURIComponent(input.platform)}`,
    },
    mediaSpec,
  };
}

export const PUBLISH_DRY_RUN_TEXT_PLATFORMS = Object.freeze(Object.keys(TEXT_ENDPOINTS));
export const PUBLISH_DRY_RUN_VIDEO_PLATFORMS = Object.freeze(Object.keys(VIDEO_ENDPOINTS));
