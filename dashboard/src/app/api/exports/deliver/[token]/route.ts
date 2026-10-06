import path from "node:path";
import { verifyImageToken } from "@/lib/image-token";
import { mediaStore, MediaStoreError } from "@/lib/media-store";
import { runWithTenant } from "@/lib/tenant-context";

const TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4",
};
const notFound = () => Response.json({ error: "not found" }, { status: 404 });

/** S3/S6 내보내기 산출물 전용 배달. 이미지와 MP4만 허용하고 저장소의 content type을 신뢰하지 않는다. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  let token: string;
  try { token = decodeURIComponent((await params).token || ""); } catch { return notFound(); }
  const claim = verifyImageToken(token);
  if (!claim) return notFound();
  const contentType = TYPES[path.extname(claim.filename).toLowerCase()];
  if (!contentType) return notFound();
  return runWithTenant(claim.tenantId, async () => {
    try {
      const stored = await mediaStore.get(claim.tenantId, claim.filename);
      if (!stored) return notFound();
      const headers = new Headers({ "Content-Type": contentType, "Cache-Control": "private, no-store" });
      if (stored.contentLength !== undefined) headers.set("Content-Length", String(stored.contentLength));
      return new Response(stored.body, { headers });
    } catch (error) {
      if (error instanceof MediaStoreError) return Response.json({ error: "내보내기 저장소에 일시적으로 연결할 수 없습니다." }, { status: 503 });
      throw error;
    }
  });
}
