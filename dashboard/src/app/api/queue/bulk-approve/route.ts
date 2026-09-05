import { mutateJson, dataPath } from "@/lib/file-io";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { mirrorQueuePost } from "@/lib/queue-store";
import { missingReviewFields, type MissingReviewField } from "@/lib/review-content";

interface QueueData { posts: Array<Record<string, unknown>> }

export async function POST(request: Request) {
  // 테넌트별 파일 격리 컨텍스트로 래핑
  const __t = await effectiveTenantId(request, null);
  return runWithTenant(__t, async () => {
    const data = await request.json();
    const ids: string[] = data.ids || [];
    const intervalHours = data.intervalHours ?? 2;
    const now = Date.now();
    let approved = 0;
    const changed: Array<Record<string, unknown> & { id: string }> = [];
    let invalid: Array<{ id: string; missingFields: MissingReviewField[] }> = [];

    await mutateJson<QueueData>(dataPath("queue.json"), (queue) => {
      approved = 0;
      invalid = (queue.posts || [])
        .filter((post) => ids.includes(post.id as string) && post.status === "draft")
        .map((post) => ({ id: post.id as string, missingFields: missingReviewFields(post) }))
        .filter((post) => post.missingFields.length > 0);
      if (invalid.length > 0) return queue;

      for (const post of queue.posts || []) {
        if (ids.includes(post.id as string) && post.status === "draft") {
          post.status = "approved";
          post.approvedAt = new Date(now).toISOString();
          post.scheduledAt = new Date(now + intervalHours * 3600000 * approved).toISOString();
          changed.push(post as Record<string, unknown> & { id: string });
          approved++;
        }
      }
      return queue;
    }, { posts: [] });

    if (invalid.length > 0) {
      return Response.json({
        error: "검토할 제목과 본문을 확인할 수 없는 항목이 있습니다",
        code: "REVIEW_CONTENT_MISSING",
        invalid,
      }, { status: 422 });
    }

    await Promise.all(changed.map((post) => mirrorQueuePost(__t, post)));

    return Response.json({ ok: true, approved });
  });
}
