import { dataPath, mutateJson, readJson } from "@/lib/file-io";
import { mirrorQueuePost } from "@/lib/queue-store";
import { requestReviewTransition, type ReviewTransitionResult } from "@/lib/review-request";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import {
  assertDraftCanEnterPublishQueue,
  applyPreparedCardDeckV3Images,
  CardDeckV3PublishBlockedError,
  cardDeckV3PublishBlockedErrorResponse,
} from "@/lib/studio/card-deck-v3-publish-gate";

interface QueueData { posts: Array<Record<string, unknown>> }

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const body = await request.json().catch(() => ({}));
  const tenantId = await effectiveTenantId(request, body.tenant_id ?? null);
  return runWithTenant(tenantId, async () => {
    const { postId } = await params;
    const current = readJson<QueueData>(dataPath("queue.json")) || { posts: [] };
    const currentPost = current.posts.find((candidate) => candidate.id === postId);
    let prepared = null;
    try {
      if (currentPost) prepared = await assertDraftCanEnterPublishQueue(tenantId, currentPost.draftId);
    } catch (error) {
      if (error instanceof CardDeckV3PublishBlockedError) return cardDeckV3PublishBlockedErrorResponse(error);
      throw error;
    }
    let transition: ReviewTransitionResult | null = null;

    await mutateJson<QueueData>(dataPath("queue.json"), (queue) => {
      const post = (queue.posts || []).find((candidate) => candidate.id === postId);
      if (post) {
        applyPreparedCardDeckV3Images(post, prepared);
        transition = requestReviewTransition(post, new Date().toISOString());
      }
      return queue;
    }, { posts: [] });

    if (!transition) return Response.json({ error: "post not found" }, { status: 404 });
    const result = transition as ReviewTransitionResult;
    if (!result.ok) {
      return Response.json({ error: result.error, code: result.code }, { status: 409 });
    }

    await mirrorQueuePost(tenantId, result.post as Record<string, unknown> & { id: string });
    return Response.json({
      ok: true,
      post: result.post,
      reviewRequest: result.reviewRequest,
      reused: result.reused,
    });
  });
}
