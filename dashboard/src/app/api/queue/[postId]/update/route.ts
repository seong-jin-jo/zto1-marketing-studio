import { mutateJson, dataPath } from "@/lib/file-io";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { mirrorQueuePost } from "@/lib/queue-store";
import { QueueInputError } from "@/lib/queue-add";
import { validateQueueEditFields, type ValidatedQueueEditFields } from "@/lib/queue-edit-fields";

interface QueueData { posts: Array<Record<string, unknown>> }

function hasOwn(data: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(data, field);
}

function replaceFormatOwnedFields(
  post: Record<string, unknown>,
  data: Record<string, unknown>,
  edit: ValidatedQueueEditFields,
) {
  const kind = edit.editFormat?.kind;
  if (!kind) return;

  post.editFormat = edit.editFormat;
  post.editLines = edit.editLines ?? null;
  post.draftId = typeof data.draftId === "string" && data.draftId.trim() ? data.draftId.trim() : null;

  if (kind === "card") {
    const imageUrls = Array.isArray(data.imageUrls) ? data.imageUrls : null;
    post.imageUrls = imageUrls;
    post.imageUrl = typeof data.imageUrl === "string" && data.imageUrl
      ? data.imageUrl
      : imageUrls?.[0] ?? null;
    post.textEmbedded = edit.textEmbedded;
    post.cardTextPositions = edit.textEmbedded ? edit.cardTextPositions ?? null : null;
    post.cardBatchId = null;
    post.videoFilename = null;
    post.videoUrl = null;
    post.videoThumbnail = null;
  } else {
    post.imageUrl = null;
    post.imageUrls = null;
    post.textEmbedded = false;
    post.cardTextPositions = null;
    post.cardBatchId = null;
    post.videoFilename = kind === "video" && typeof data.videoFilename === "string" ? data.videoFilename : null;
    post.videoUrl = kind === "video" && typeof data.videoUrl === "string" ? data.videoUrl : null;
    post.videoThumbnail = kind === "video" && typeof data.videoThumbnail === "string" ? data.videoThumbnail : null;
  }

  // 기존 검토 요청은 이전 본문의 publishContext를 붙잡고 있다. 본문 교체와 같은 원자
  // 변경 안에서 제거해야 다음 request-review가 현재 형식으로 새 문맥을 만든다.
  delete post.reviewRequest;
}

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const data = await request.json().catch(() => ({}));
  // 테넌트별 파일 격리 컨텍스트로 래핑
  const __t = await effectiveTenantId(request, data.tenant_id ?? null);
  return runWithTenant(__t, async () => {
    const { postId } = await params;

    // imageUrl 검증은 mutate 전에(잘못된 값이면 쓰기 자체를 안 함).
    if (data.imageUrl !== undefined &&
        !(data.imageUrl === null || (typeof data.imageUrl === "string" && (data.imageUrl.startsWith("/images/") || data.imageUrl.startsWith("/api/images/") || data.imageUrl.startsWith("https://"))))) {
      return Response.json({ error: "imageUrl must be null, /images/ or /api/images/ path, or https:// URL" }, { status: 400 });
    }

    let edit: ValidatedQueueEditFields | null = null;
    try {
      if (hasOwn(data, "editFormat")) edit = validateQueueEditFields(data);
    } catch (error) {
      if (error instanceof QueueInputError) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    let found: Record<string, unknown> | null = null;
    await mutateJson<QueueData>(dataPath("queue.json"), (queue) => {
      for (const post of queue.posts || []) {
        if (post.id === postId) {
          if (data.status && ["draft", "approved"].includes(data.status)) post.status = data.status;
          // 형식 교체 요청은 빈 발행 본문도 현재 스냅샷의 값이다. 글자 카드처럼 editLines만
          // 있는 작업에서 과거 본문을 남기면 원자 교체가 아니므로, editFormat이 검증된
          // 요청은 빈 문자열도 그대로 저장한다. 구형 부분 수정은 종전의 비어 있지 않은 값만 허용한다.
          if (typeof data.text === "string" && (edit || data.text.trim())) {
            if (!post.originalText && post.text !== data.text) post.originalText = post.text;
            post.text = data.text;
          }
          if (data.topic !== undefined) post.topic = data.topic;
          if (data.hashtags !== undefined) post.hashtags = data.hashtags;
          if (data.scheduledAt !== undefined) post.scheduledAt = data.scheduledAt;
          if (edit) replaceFormatOwnedFields(post, data, edit);
          else if (data.imageUrl !== undefined) post.imageUrl = data.imageUrl;
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
