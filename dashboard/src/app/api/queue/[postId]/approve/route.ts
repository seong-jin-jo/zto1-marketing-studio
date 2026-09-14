import { mutateJson, dataPath } from "@/lib/file-io";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { mirrorQueuePost } from "@/lib/queue-store";
import { missingReviewFields, type MissingReviewField } from "@/lib/review-content";

interface QueueData { posts: Array<Record<string, unknown>> }

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  // 테넌트별 파일 격리 컨텍스트로 래핑
  const __t = await effectiveTenantId(request, null);
  return runWithTenant(__t, async () => {
    const { postId } = await params;
    const data = await request.json();
    let found: Record<string, unknown> | null = null;
    let invalidFields: MissingReviewField[] | null = null;
    await mutateJson<QueueData>(dataPath("queue.json"), (queue) => {
      for (const post of queue.posts || []) {
        if (post.id === postId) {
          const missingFields = missingReviewFields(post);
          if (missingFields.length > 0) {
            invalidFields = missingFields;
            break;
          }
          post.status = "approved";
          const now = new Date();
          post.approvedAt = now.toISOString();
          const hours = typeof data.hours === "number" && data.hours >= 0 ? data.hours : 0;
          post.scheduledAt = new Date(now.getTime() + hours * 3600000).toISOString();
          found = post;
        }
      }
      return queue;
    }, { posts: [] });
    if (invalidFields) {
      return Response.json({
        error: "검토할 제목과 본문을 확인할 수 없습니다",
        code: "REVIEW_CONTENT_MISSING",
        missingFields: invalidFields,
      }, { status: 422 });
    }
    if (!found) return Response.json({ error: "post not found" }, { status: 404 });
    // P4 dual-write: 상태변경 미러(best-effort, 무중단).
    await mirrorQueuePost(__t, found as Record<string, unknown> & { id: string });
    return Response.json({ ok: true, post: found });
  });
}
