import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { addQueuePost, QueueInputError } from "@/lib/queue-add";

export async function POST(request: Request) {
  const data = await request.json().catch(() => ({}));
  const __t = await effectiveTenantId(request, data.tenant_id ?? null);
  return runWithTenant(__t, async () => {
    try {
      const result = await addQueuePost(__t, {
        text: typeof data.text === "string" ? data.text : "",
        draftId: typeof data.draftId === "string" ? data.draftId : null,
        topic: data.topic,
        hashtags: data.hashtags,
        imageUrl: data.imageUrl,
        imageUrls: data.imageUrls,
        cardBatchId: data.cardBatchId,
        videoFilename: data.videoFilename,
        videoUrl: data.videoUrl,
        videoThumbnail: data.videoThumbnail,
      });
      return Response.json({ success: true, ...result });
    } catch (error) {
      if (error instanceof QueueInputError) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  });
}
