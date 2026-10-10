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
  tenantId: string;
  platform: string;
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
}): PublishResult {
  const endpoint = TEXT_ENDPOINTS[input.platform];
  if (!endpoint) return { ok: false, error: `${input.platform} 드라이런 어댑터 미지원` };
  const firstImage = input.imageUrls?.[0];
  const body: Record<string, unknown> = (() => {
    if (input.platform === "threads") return { text: input.text, media_type: firstImage ? "IMAGE" : "TEXT", image_url: firstImage };
    if (input.platform === "x") return { text: input.text, media: firstImage ? { media_ids: ["[UPLOAD_REQUIRED]"] } : undefined };
    if (input.platform === "instagram") return { caption: input.text, media_type: (input.imageUrls?.length ?? 0) > 1 ? "CAROUSEL" : "IMAGE", image_url: firstImage };
    if (input.platform === "facebook") return { message: input.text, url: firstImage };
    if (input.platform === "linkedin") return { author: "urn:li:person:[ACCOUNT]", commentary: input.text, visibility: "PUBLIC" };
    if (input.platform === "bluesky") return { collection: "app.bsky.feed.post", record: { text: input.text, createdAt: "[NOW]" }, image_url: firstImage };
    if (input.platform === "telegram") return firstImage ? { chat_id: "[ACCOUNT]", caption: input.text, photo: firstImage } : { chat_id: "[ACCOUNT]", text: input.text };
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
  appendRecord({
    timestamp: new Date().toISOString(),
    tenantId: input.tenantId,
    platform: input.platform,
    method: "POST",
    endpoint,
    body,
    mediaUrls: input.imageUrls ?? [],
    mediaSpec: input.imagePaths?.[0] ? inspectDryRunMedia(input.imagePaths[0]) : null,
  });
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
    tenantId: input.tenantId,
    platform: input.platform,
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
