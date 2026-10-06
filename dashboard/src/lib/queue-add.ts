import crypto from "node:crypto";
import { dataPath, mutateJson } from "@/lib/file-io";
import { mirrorQueuePost } from "@/lib/queue-store";
import { assertDraftCanEnterPublishQueue } from "@/lib/studio/card-deck-v3-publish-gate";

export interface PerformanceSuggestionSourceContext {
  type: "performance_suggestion";
  suggestionId: string;
  basis: "hypothesis" | "performance" | "trend";
  label: string;
  verified: boolean;
  evidence: Record<string, unknown>;
}

export interface StudioHandoffSourceContext {
  type: "studio_handoff";
  handoffId: string;
  draftId: string;
  kind: "text" | "image" | "video" | "card" | "audio";
  revision: number;
  generationId: string | null;
  candidateId: string | null;
  /** 발행실이 고정한 최신 내보내기 영수증. 카드·영상 handoff에서만 존재한다. */
  exportId?: string;
  exportSourceHash?: string;
}

export type QueueSourceContext = PerformanceSuggestionSourceContext | StudioHandoffSourceContext;

export interface AddQueuePostInput {
  text: string;
  draftId?: string | null;
  topic?: string;
  hashtags?: string[];
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  cardBatchId?: string | null;
  videoFilename?: string | null;
  videoUrl?: string | null;
  videoThumbnail?: string | null;
  sourceContext?: QueueSourceContext;
  idempotencyKey?: string;
}

export interface QueuePost {
  id: string;
  draftId: string | null;
  text: string;
  originalText: null;
  topic: string;
  hashtags: string[];
  status: string;
  generatedAt: string;
  approvedAt: null;
  scheduledAt: null;
  publishedAt: null;
  threadsMediaId: null;
  error: null;
  abVariant: string;
  model: string;
  imageUrl: string | null;
  imageUrls: string[] | null;
  cardBatchId: string | null;
  videoFilename: string | null;
  videoUrl: string | null;
  videoThumbnail: string | null;
  engagement: null;
  sourceContext?: QueueSourceContext;
  idempotencyKey?: string;
}

export class QueueInputError extends Error {}

export async function addQueuePost(
  tenantId: string | null,
  input: AddQueuePostInput,
): Promise<{ post: QueuePost; reused: boolean }> {
  const text = input.text.trim();
  if (!text) throw new QueueInputError("text required");
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;
  const prepared = await assertDraftCanEnterPublishQueue(tenantId, input.draftId);
  const imageUrls = prepared?.imageUrls ?? (Array.isArray(input.imageUrls) ? input.imageUrls : null);
  let selected: QueuePost | null = null;
  let reused = false;

  await mutateJson<{ version: number; posts: QueuePost[] }>(
    dataPath("queue.json"),
    (queue) => {
      if (idempotencyKey) {
        const existing = queue.posts.find((post) => post.idempotencyKey === idempotencyKey);
        if (existing) {
          const refreshed = prepared
            ? { ...existing, imageUrl: prepared.imageUrl, imageUrls: prepared.imageUrls }
            : existing;
          if (prepared) queue.posts = queue.posts.map((post) => post.id === existing.id ? refreshed : post);
          selected = refreshed;
          reused = true;
          return queue;
        }
      }

      const post: QueuePost = {
        id: crypto.randomUUID(),
        draftId: input.draftId?.trim() || null,
        text,
        originalText: null,
        topic: input.topic?.trim() || "general",
        hashtags: Array.isArray(input.hashtags) ? input.hashtags : [],
        status: "draft",
        generatedAt: new Date().toISOString().replace(/\.\d+Z$/, ""),
        approvedAt: null,
        scheduledAt: null,
        publishedAt: null,
        threadsMediaId: null,
        error: null,
        abVariant: "A",
        model: input.sourceContext?.type === "performance_suggestion"
          ? "suggestion"
          : input.sourceContext?.type === "studio_handoff"
            ? "studio-handoff"
            : "manual",
        imageUrl: prepared?.imageUrl || input.imageUrl || imageUrls?.[0] || null,
        imageUrls,
        cardBatchId: input.cardBatchId || null,
        videoFilename: input.videoFilename || null,
        videoUrl: input.videoUrl || null,
        videoThumbnail: input.videoThumbnail || null,
        engagement: null,
        ...(input.sourceContext ? { sourceContext: input.sourceContext } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      };
      queue.posts.push(post);
      selected = post;
      return queue;
    },
    { version: 2, posts: [] },
  );

  if (!selected) throw new Error("queue post creation failed");
  await mirrorQueuePost(tenantId, selected);
  return { post: selected, reused };
}
