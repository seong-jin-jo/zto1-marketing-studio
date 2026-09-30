import { mutateJson, dataPath } from "@/lib/file-io";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { mirrorQueuePost } from "@/lib/queue-store";

interface QueueData { posts: Array<Record<string, unknown>> }

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  // 테넌트별 파일 격리 컨텍스트로 래핑
  const __t = await effectiveTenantId(request, null);
  return runWithTenant(__t, async () => {
    const { postId } = await params;
    const data = await request.json();

    // imageUrl 검증은 mutate 전에(잘못된 값이면 쓰기 자체를 안 함).
    if (data.imageUrl !== undefined &&
        !(data.imageUrl === null || (typeof data.imageUrl === "string" && (data.imageUrl.startsWith("/images/") || data.imageUrl.startsWith("https://"))))) {
      return Response.json({ error: "imageUrl must be null, /images/ path, or https:// URL" }, { status: 400 });
    }

    let found: Record<string, unknown> | null = null;
    await mutateJson<QueueData>(dataPath("queue.json"), (queue) => {
      for (const post of queue.posts || []) {
        if (post.id === postId) {
          if (data.status && ["draft", "approved"].includes(data.status)) post.status = data.status;
          if (typeof data.text === "string" && data.text.trim()) {
            if (!post.originalText && post.text !== data.text) post.originalText = post.text;
            post.text = data.text;
          }
          if (data.topic !== undefined) post.topic = data.topic;
          if (data.hashtags !== undefined) post.hashtags = data.hashtags;
          if (data.scheduledAt !== undefined) post.scheduledAt = data.scheduledAt;
          if (data.imageUrl !== undefined) post.imageUrl = data.imageUrl;
          found = post;
        }
      }
      return queue;
    }, { posts: [] });

    if (!found) return Response.json({ error: "post not found" }, { status: 404 });
    await mirrorQueuePost(__t, found as Record<string, unknown> & { id: string });
    return Response.json({ ok: true, post: found });
  });
}
