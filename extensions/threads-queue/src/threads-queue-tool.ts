import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Type } from "@sinclair/typebox";
import { jsonResult, readStringParam } from "openclaw/plugin-sdk/agent-runtime";
import { optionalStringEnum } from "openclaw/plugin-sdk/core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-runtime";
import {
  claimPost,
  isClaimActive,
  releaseClaim,
  verifyPublishable,
  DEFAULT_LEASE_MS,
  type ChannelKey,
  type QueueClaim,
} from "./queue-claim.js";

type Engagement = {
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  collectedAt: string;
  collectCount: number;
  fedToPopular: boolean;
  fedToStyle: boolean;
};

type ChannelStatus = {
  status: "pending" | "published" | "failed" | "skipped" | "canceled";
  mediaId?: string | null;
  tweetId?: string | null;
  publishedAt: string | null;
  error: string | null;
};

type Channels = {
  threads: ChannelStatus;
  x: ChannelStatus;
  instagram: ChannelStatus;
};

type Post = {
  id: string;
  text: string;
  originalText: string | null;
  topic: string;
  hashtags: string[];
  status: "draft" | "approved" | "published" | "failed" | "canceled";
  generatedAt: string;
  approvedAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  threadsMediaId: string | null;
  error: string | null;
  abVariant: string;
  model: string | null;
  imageUrl: string | null;
  imageUrls?: string[] | null;
  cardBatchId?: string | null;
  engagement: Engagement | null;
  channels?: Channels;
  // 발행기 lease. get_approved 가 걸고 update_channel/취소가 해제한다(queue-claim.ts 계약).
  claim?: QueueClaim | null;
  canceledAt?: string | null;
};

type QueueData = {
  version: number;
  posts: Post[];
};

type QueueConfig = {
  queuePath?: string;
};

const DEFAULT_QUEUE_DIR = path.resolve(process.cwd(), "data");
const DEFAULT_QUEUE_PATH = path.join(DEFAULT_QUEUE_DIR, "queue.json");
const DEFAULT_ANALYTICS_PATH = path.join(DEFAULT_QUEUE_DIR, "analytics-history.json");

type AnalyticsHistory = {
  posts: Array<{
    id: string;
    text: string;
    topic: string;
    hashtags: string[];
    publishedAt: string | null;
    archivedAt: string;
    engagement: Engagement | null;
  }>;
};

function resolveQueuePath(api: OpenClawPluginApi): string {
  const pluginCfg = (api.pluginConfig ?? {}) as QueueConfig;
  return (
    (typeof pluginCfg.queuePath === "string" && pluginCfg.queuePath.trim()) ||
    process.env.THREADS_QUEUE_PATH ||
    DEFAULT_QUEUE_PATH
  );
}

function migratePost(post: Post): Post {
  if (!post.channels && post.status !== "draft") {
    post.channels = {
      threads: {
        status:
          post.status === "published"
            ? "published"
            : post.status === "failed"
              ? "failed"
              : post.status === "canceled"
                ? "canceled"
                : "pending",
        mediaId: post.threadsMediaId ?? null,
        publishedAt: post.publishedAt ?? null,
        error: post.status === "failed" ? (post.error ?? null) : null,
      },
      x: { status: "skipped", tweetId: null, publishedAt: null, error: null },
      instagram: { status: post.imageUrl ? "pending" : "skipped", publishedAt: null, error: null },
    };
  }
  if (post.channels && !post.channels.instagram) {
    post.channels.instagram = {
      status: post.status === "canceled" ? "canceled" : post.imageUrl ? "pending" : "skipped",
      publishedAt: null,
      error: null,
    };
  }
  return post;
}

async function readQueue(queuePath: string): Promise<QueueData> {
  try {
    const raw = await fs.readFile(queuePath, "utf-8");
    const data = JSON.parse(raw) as QueueData;
    data.version = 2;
    data.posts = data.posts.map(migratePost);
    return data;
  } catch {
    return { version: 2, posts: [] };
  }
}

async function writeQueue(queuePath: string, data: QueueData): Promise<void> {
  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  const tmpPath = queuePath + `.tmp.${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, queuePath);
}

const ThreadsQueueToolSchema = Type.Object(
  {
    action: optionalStringEnum(
      ["list", "add", "update", "delete", "get_approved", "cleanup", "update_channel", "verify_claim", "release_claim"] as const,
      {
        description:
          'Action to perform: "list", "add", "update", "delete", "get_approved" (claims posts with a lease), "cleanup", "update_channel" (update per-channel publish status), "verify_claim" (MUST be called immediately before every provider publish call), "release_claim".',
      },
    ),
    id: Type.Optional(
      Type.String({ description: "Post ID for update/delete actions." }),
    ),
    text: Type.Optional(
      Type.String({ description: "Post text content (for add/update)." }),
    ),
    topic: Type.Optional(
      Type.String({ description: "Post topic (for add)." }),
    ),
    hashtags: Type.Optional(
      Type.Array(Type.String(), { description: "Hashtags (for add)." }),
    ),
    status: optionalStringEnum(
      ["draft", "approved", "published", "failed"] as const,
      { description: "New status (for update)." },
    ),
    scheduledAt: Type.Optional(
      Type.String({ description: "ISO datetime for scheduled publishing (for update)." }),
    ),
    threadsMediaId: Type.Optional(
      Type.String({ description: "Threads media ID after publishing (for update)." }),
    ),
    error: Type.Optional(
      Type.String({ description: "Error message (for update on failure)." }),
    ),
    abVariant: Type.Optional(
      Type.String({ description: 'A/B test variant label (for add). Default: "A".' }),
    ),
    model: Type.Optional(
      Type.String({ description: 'Model used to generate this post (e.g. "gemini-2.5-flash", "llama3.1:8b"). For add action.' }),
    ),
    imageUrl: Type.Optional(
      Type.String({ description: "Public image URL to attach to the post (for add/update). For card news, use the first slide." }),
    ),
    imageUrls: Type.Optional(
      Type.Array(Type.String(), { description: "Array of image URLs for carousel/card news (for add/update). Overrides imageUrl for Instagram." }),
    ),
    cardBatchId: Type.Optional(
      Type.String({ description: "Card news batch ID from card_generate tool (for add). Links slides together." }),
    ),
    channel: optionalStringEnum(
      ["threads", "x", "instagram"] as const,
      { description: 'Target channel for update_channel action: "threads", "x", or "instagram".' },
    ),
    channelStatus: optionalStringEnum(
      ["published", "failed", "skipped", "canceled"] as const,
      { description: 'Channel publish status for update_channel action.' },
    ),
    tweetId: Type.Optional(
      Type.String({ description: "X tweet ID after publishing (for update_channel)." }),
    ),
    statusFilter: optionalStringEnum(
      ["draft", "approved", "published", "failed"] as const,
      { description: "Filter by status (for list)." },
    ),
    limit: Type.Optional(
      Type.Number({ description: "Max posts to return for get_approved (default: 1)." }),
    ),
    claimToken: Type.Optional(
      Type.String({
        description:
          "Lease token returned by get_approved. Required for verify_claim/release_claim and strongly recommended on update_channel.",
      }),
    ),
    workerId: Type.Optional(
      Type.String({ description: "Publisher worker identity for get_approved lease bookkeeping." }),
    ),
    leaseMs: Type.Optional(
      Type.Number({ description: "Lease duration in ms for get_approved (default: 300000)." }),
    ),
  },
  { additionalProperties: false },
);

export function createThreadsQueueTool(api: OpenClawPluginApi) {
  return {
    name: "threads_queue",
    label: "Threads Queue",
    description:
      "Manage the Threads content queue. List, add, update, or delete posts. Get approved posts ready for publishing.",
    parameters: ThreadsQueueToolSchema,
    async execute(_toolCallId: string, rawParams: Record<string, unknown>) {
      const action = readStringParam(rawParams, "action", { required: true });
      const queuePath = resolveQueuePath(api);
      const queue = await readQueue(queuePath);

      switch (action) {
        case "list": {
          const statusFilter = readStringParam(rawParams, "statusFilter");
          const filtered = statusFilter
            ? queue.posts.filter((p) => p.status === statusFilter)
            : queue.posts;
          return jsonResult({
            total: filtered.length,
            posts: filtered.map((p, i) => ({
              index: i + 1,
              ...p,
            })),
          });
        }

        case "add": {
          const text = readStringParam(rawParams, "text", { required: true });
          const topic = readStringParam(rawParams, "topic") ?? "general";
          let hashtags = Array.isArray(rawParams.hashtags)
            ? (rawParams.hashtags as string[]).filter((h) => typeof h === "string")
            : [];
          const abVariant = readStringParam(rawParams, "abVariant") ?? "A";
          const model = readStringParam(rawParams, "model") ?? null;
          const imageUrl = readStringParam(rawParams, "imageUrl") ?? null;

          // Validate text length
          if (text.length > 500) {
            return jsonResult({ success: false, reason: "500자 초과" });
          }

          // Validate Korean ratio: count Korean characters (Hangul syllables + Jamo)
          const koreanChars = (text.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length;
          const totalChars = text.replace(/\s/g, "").length;
          if (totalChars > 0 && koreanChars / totalChars < 0.3) {
            return jsonResult({ success: false, reason: "한국어 비율 부족" });
          }

          const imageUrls = Array.isArray(rawParams.imageUrls)
            ? (rawParams.imageUrls as string[]).filter((u) => typeof u === "string")
            : null;
          const cardBatchId = readStringParam(rawParams, "cardBatchId") ?? null;

          const post: Post = {
            id: crypto.randomUUID(),
            text,
            originalText: null,
            topic,
            hashtags,
            status: "draft",
            generatedAt: new Date().toISOString(),
            approvedAt: null,
            scheduledAt: null,
            publishedAt: null,
            threadsMediaId: null,
            error: null,
            abVariant,
            model,
            imageUrl: imageUrl || (imageUrls?.[0] ?? null),
            imageUrls: imageUrls?.length ? imageUrls : null,
            cardBatchId,
            engagement: null,
          };

          queue.posts.push(post);
          await writeQueue(queuePath, queue);
          return jsonResult({ success: true, post });
        }

        case "update": {
          const id = readStringParam(rawParams, "id", { required: true });
          const post = queue.posts.find((p) => p.id === id);
          if (!post) {
            throw new Error(`Post not found: ${id}`);
          }

          const newText = readStringParam(rawParams, "text");
          if (newText && newText !== post.text) {
            if (!post.originalText) {
              post.originalText = post.text;
            }
            post.text = newText;
          }

          const newStatus = readStringParam(rawParams, "status") as Post["status"] | undefined;
          if (newStatus) {
            post.status = newStatus;
            if (newStatus === "approved") {
              post.approvedAt = new Date().toISOString();
            } else if (newStatus === "published") {
              post.publishedAt = new Date().toISOString();
            }
          }

          const scheduledAt = readStringParam(rawParams, "scheduledAt");
          if (scheduledAt) {
            post.scheduledAt = scheduledAt;
          }

          const threadsMediaId = readStringParam(rawParams, "threadsMediaId");
          if (threadsMediaId) {
            post.threadsMediaId = threadsMediaId;
          }

          const error = readStringParam(rawParams, "error");
          if (error !== undefined) {
            post.error = error ?? null;
          }

          const newImageUrl = readStringParam(rawParams, "imageUrl");
          if (newImageUrl !== undefined) {
            post.imageUrl = newImageUrl ?? null;
          }

          if (Array.isArray(rawParams.imageUrls)) {
            post.imageUrls = (rawParams.imageUrls as string[]).filter((u) => typeof u === "string");
            if (!post.imageUrl && post.imageUrls.length) post.imageUrl = post.imageUrls[0];
          }

          await writeQueue(queuePath, queue);
          return jsonResult({ success: true, post });
        }

        case "delete": {
          const id = readStringParam(rawParams, "id", { required: true });
          const idx = queue.posts.findIndex((p) => p.id === id);
          if (idx === -1) {
            throw new Error(`Post not found: ${id}`);
          }
          const removed = queue.posts.splice(idx, 1)[0];
          await writeQueue(queuePath, queue);
          return jsonResult({ success: true, removed });
        }

        case "get_approved": {
          // 스냅샷이 아니라 lease 를 건 claim 을 준다. 이미 다른 워커가 가져간 글은
          // 돌려주지 않는다(경합 차단 1단계). 반환된 claimToken 은 공급자 호출 직전
          // verify_claim 과 update_channel 에서 소유권 증명으로 쓴다.
          const now = new Date();
          const limitParam = rawParams.limit;
          const limit = typeof limitParam === "number" && limitParam > 0 ? limitParam : 1;
          const leaseParam = rawParams.leaseMs;
          const leaseMs = typeof leaseParam === "number" && leaseParam > 0 ? leaseParam : DEFAULT_LEASE_MS;
          const workerId = readStringParam(rawParams, "workerId") ?? `worker-${process.pid}`;

          const ready = queue.posts
            .filter(
              (p) =>
                p.status === "approved" &&
                p.scheduledAt &&
                new Date(p.scheduledAt) <= now &&
                !isClaimActive(p, now),
            )
            .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
            .slice(0, limit);

          const claimed: Array<Post & { claimToken: string }> = [];
          for (const post of ready) {
            const claim = claimPost(post, {
              workerId,
              token: crypto.randomUUID(),
              now,
              leaseMs,
            });
            if (!claim) continue;
            claimed.push({ ...post, claimToken: claim.token });
          }
          if (claimed.length > 0) await writeQueue(queuePath, queue);

          return jsonResult({
            total: claimed.length,
            posts: claimed,
            // 발행기 계약: 공급자 호출 직전 반드시 verify_claim 을 부른다.
            mustVerifyBeforePublish: true,
          });
        }

        case "verify_claim": {
          // 공급자 호출 직전 재검증(경합 차단 2단계). 파일을 방금 새로 읽은 queue 로 판정한다.
          const id = readStringParam(rawParams, "id", { required: true });
          const channel = readStringParam(rawParams, "channel", { required: true }) as ChannelKey;
          const claimToken = readStringParam(rawParams, "claimToken") ?? null;
          const post = queue.posts.find((p) => p.id === id);
          const verdict = verifyPublishable(post, channel, { claimToken });
          return jsonResult(verdict.ok ? { ok: true, id, channel } : { ok: false, id, channel, ...verdict });
        }

        case "release_claim": {
          const id = readStringParam(rawParams, "id", { required: true });
          const post = queue.posts.find((p) => p.id === id);
          if (!post) throw new Error(`Post not found: ${id}`);
          releaseClaim(post);
          await writeQueue(queuePath, queue);
          return jsonResult({ success: true, id });
        }

        case "update_channel": {
          const id = readStringParam(rawParams, "id", { required: true });
          const channel = readStringParam(rawParams, "channel", { required: true }) as "threads" | "x" | "instagram";
          const channelStatus = readStringParam(rawParams, "channelStatus", { required: true }) as ChannelStatus["status"];
          const post = queue.posts.find((p) => p.id === id);
          if (!post) throw new Error(`Post not found: ${id}`);

          // 경합 차단 3단계 — 마지막 관문. 재검증을 건너뛴 워커가 있어도 취소된 글·채널에
          // published/failed 를 기록하지 못한다. skipped/canceled 기록은 되돌림이 아니라
          // 정리이므로 통과시킨다.
          if (channelStatus === "published" || channelStatus === "failed") {
            const claimToken = readStringParam(rawParams, "claimToken") ?? null;
            const verdict = verifyPublishable(post, channel, { claimToken });
            if (!verdict.ok) {
              return jsonResult({
                success: false,
                blocked: true,
                id,
                channel,
                reason: verdict.reason,
                message: verdict.message,
              });
            }
          }

          if (!post.channels) {
            post.channels = {
              threads: { status: "pending", mediaId: null, publishedAt: null, error: null },
              x: { status: "pending", tweetId: null, publishedAt: null, error: null },
              instagram: { status: "pending", publishedAt: null, error: null },
            };
          }

          const now = new Date().toISOString();
          const ch = post.channels[channel];
          ch.status = channelStatus;
          ch.error = null;

          if (channelStatus === "published") {
            ch.publishedAt = now;
            if (channel === "threads") {
              const mediaId = readStringParam(rawParams, "threadsMediaId");
              if (mediaId) { ch.mediaId = mediaId; post.threadsMediaId = mediaId; }
            } else if (channel === "x") {
              const tweet = readStringParam(rawParams, "tweetId");
              if (tweet) ch.tweetId = tweet;
            }
          } else if (channelStatus === "failed") {
            const error = readStringParam(rawParams, "error");
            ch.error = error ?? "Unknown error";
          }

          const allChannels = Object.values(post.channels);
          const allDone = allChannels.every((c) => c.status === "published" || c.status === "skipped");
          const anyFailed = allChannels.some((c) => c.status === "failed");
          const anyPending = allChannels.some((c) => c.status === "pending");

          if (allDone) { post.status = "published"; post.publishedAt = now; releaseClaim(post); }
          else if (anyFailed && !anyPending) {
            post.status = "failed";
            post.error = allChannels.filter((c) => c.status === "failed").map((c) => c.error).join("; ");
            releaseClaim(post);
          }

          await writeQueue(queuePath, queue);
          return jsonResult({ success: true, post });
        }

        case "cleanup": {
          const now = new Date();
          const PUBLISHED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
          const FAILED_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
          const details: { id: string; status: string; age: string }[] = [];
          const toArchive: Post[] = [];

          queue.posts = queue.posts.filter((p) => {
            if (p.status === "published" && p.publishedAt) {
              const age = now.getTime() - new Date(p.publishedAt).getTime();
              if (age > PUBLISHED_MAX_AGE_MS) {
                details.push({ id: p.id, status: "published", age: `${Math.floor(age / 86400000)}d` });
                toArchive.push(p);
                return false;
              }
            }
            if (p.status === "failed" && p.generatedAt) {
              const age = now.getTime() - new Date(p.generatedAt).getTime();
              if (age > FAILED_MAX_AGE_MS) {
                details.push({ id: p.id, status: "failed", age: `${Math.floor(age / 86400000)}d` });
                return false;
              }
            }
            return true;
          });

          // Archive published posts' engagement to analytics-history.json
          if (toArchive.length > 0) {
            const analyticsPath = path.join(path.dirname(queuePath), "analytics-history.json");
            let history: AnalyticsHistory;
            try {
              const raw = await fs.readFile(analyticsPath, "utf-8");
              history = JSON.parse(raw) as AnalyticsHistory;
            } catch {
              history = { posts: [] };
            }
            for (const p of toArchive) {
              history.posts.push({
                id: p.id,
                text: p.text,
                topic: p.topic,
                hashtags: p.hashtags,
                publishedAt: p.publishedAt,
                archivedAt: now.toISOString(),
                engagement: p.engagement,
              });
            }
            const tmpPath = analyticsPath + `.tmp.${process.pid}`;
            await fs.writeFile(tmpPath, JSON.stringify(history, null, 2), "utf-8");
            await fs.rename(tmpPath, analyticsPath);
          }

          await writeQueue(queuePath, queue);
          return jsonResult({ removed: details.length, archived: toArchive.length, details });
        }

        default:
          throw new Error(
            `Unknown action: ${action}. Use list, add, update, delete, get_approved, verify_claim, release_claim, update_channel, or cleanup.`,
          );
      }
    },
  };
}
