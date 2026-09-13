import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  beginPublishAttempt,
  verifyClaimOwnership,
  type ChannelKey,
  type ClaimablePost,
} from "./src/queue-claim.js";
import { withQueueLock } from "./src/queue-lock.js";

type QueueData = { version?: number; posts: ClaimablePost[] };

export type ApprovedPublishPayload = {
  text: string;
  imageUrls?: string[];
  quotePostId?: string;
};

export type QueueGuardConfig = { queuePath?: string };

export function resolvePublisherQueuePath(config: QueueGuardConfig = {}): string {
  const configured = typeof config.queuePath === "string" ? config.queuePath.trim() : "";
  if (configured) return configured;
  if (process.env.THREADS_QUEUE_PATH) return process.env.THREADS_QUEUE_PATH;
  const dataDir = process.env.DATA_DIR || path.join(process.env.HOME || process.cwd(), "data");
  return path.join(dataDir, "queue.json");
}

async function readQueue(queuePath: string): Promise<QueueData> {
  const raw = await fs.readFile(queuePath, "utf-8");
  const queue = JSON.parse(raw) as QueueData;
  if (!Array.isArray(queue.posts)) throw new Error("queue.json posts 형식이 올바르지 않습니다");
  return queue;
}

async function writeQueue(queuePath: string, queue: QueueData): Promise<void> {
  const tempPath = `${queuePath}.tmp.${process.pid}.${crypto.randomUUID()}`;
  await fs.writeFile(tempPath, JSON.stringify(queue, null, 2), "utf-8");
  await fs.rename(tempPath, queuePath);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function hashApprovedQueuePayload(post: ClaimablePost): string {
  return crypto.createHash("sha256").update(JSON.stringify({
    text: stringField(post.text),
    imageUrl: stringField(post.imageUrl),
    imageUrls: stringArrayField(post.imageUrls),
    quotePostId: stringField(post.quotePostId),
  })).digest("hex");
}

function approvedPayloadForChannel(post: ClaimablePost, channel: ChannelKey): Required<ApprovedPublishPayload> {
  const imageUrl = stringField(post.imageUrl);
  const imageUrls = stringArrayField(post.imageUrls);
  return {
    text: stringField(post.text),
    imageUrls: channel === "instagram" ? (imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : []) : channel === "threads" && imageUrl ? [imageUrl] : [],
    quotePostId: channel === "threads" ? stringField(post.quotePostId) : "",
  };
}

function normalizeAttemptedPayload(payload: ApprovedPublishPayload): Required<ApprovedPublishPayload> {
  return {
    text: stringField(payload.text),
    imageUrls: stringArrayField(payload.imageUrls),
    quotePostId: stringField(payload.quotePostId),
  };
}

/** 공급자 호출 직전에 pending을 publishing으로 원자 전이한다. */
export async function beginQueuePublishAttempt(options: {
  queuePath: string;
  postId: string;
  channel: ChannelKey;
  claimToken: string;
  payload: ApprovedPublishPayload;
}): Promise<{ idempotencyKey: string }> {
  return withQueueLock(options.queuePath, async () => {
    const queue = await readQueue(options.queuePath);
    const post = queue.posts.find((item) => item.id === options.postId);
    const claimHash = post?.claim?.approvedPayloadHash;
    if (!post || !claimHash || claimHash !== hashApprovedQueuePayload(post)) {
      throw new Error("발행 차단: approved-payload-changed: 승인 뒤 작업물 내용이 바뀌었습니다");
    }
    if (JSON.stringify(normalizeAttemptedPayload(options.payload)) !== JSON.stringify(approvedPayloadForChannel(post, options.channel))) {
      throw new Error("발행 차단: approved-payload-mismatch: 승인하지 않은 본문 또는 미디어입니다");
    }
    const idempotencyKey = crypto.randomUUID();
    const verdict = beginPublishAttempt(post, options.channel, {
      claimToken: options.claimToken,
      idempotencyKey,
    });
    if (!verdict.ok) throw new Error(`발행 차단: ${verdict.reason}: ${verdict.message}`);
    await writeQueue(options.queuePath, queue);
    return { idempotencyKey: verdict.idempotencyKey };
  });
}

/**
 * 공급자가 응답한 결과를 같은 시도에 붙인다. 성공 응답과 응답 불명 상태를 모두 남겨
 * 프로세스가 중단돼도 외부 게시가 로컬에서 사라지지 않게 한다.
 */
export async function recordQueueProviderResult(options: {
  queuePath: string;
  postId: string;
  channel: ChannelKey;
  claimToken: string;
  idempotencyKey: string;
  state: "provider_succeeded" | "provider_failed" | "result_unknown";
  providerId?: string | null;
  error?: string | null;
}): Promise<void> {
  await withQueueLock(options.queuePath, async () => {
    const queue = await readQueue(options.queuePath);
    const post = queue.posts.find((item) => item.id === options.postId);
    const ownership = verifyClaimOwnership(post, options.claimToken, { allowExpired: true });
    if (!ownership.ok) throw new Error(`발행 결과 기록 차단: ${ownership.reason}: ${ownership.message}`);
    const channel = post?.channels?.[options.channel];
    const attempt = channel?.publishAttempt;
    if (!channel || channel.status !== "publishing" || !attempt) {
      throw new Error("publishing 상태의 발행 시도를 찾을 수 없습니다");
    }
    if (attempt.claimToken !== options.claimToken || attempt.idempotencyKey !== options.idempotencyKey) {
      throw new Error("다른 발행 시도의 결과는 기록할 수 없습니다");
    }
    attempt.state = options.state;
    attempt.providerId = options.providerId ?? null;
    attempt.error = options.error ?? null;
    attempt.updatedAt = new Date().toISOString();
    await writeQueue(options.queuePath, queue);
  });
}
