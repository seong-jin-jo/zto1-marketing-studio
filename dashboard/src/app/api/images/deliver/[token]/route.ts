import path from "path";
import { runWithTenant } from "@/lib/tenant-context";
import { verifyImageToken } from "@/lib/image-token";
import { mediaStore, MediaStoreError } from "@/lib/media-store";

// GET /api/images/deliver/<signed-token> — SNS-016 서명 이미지 배달.
// Meta/Threads 서버가 큐에 저장된 이미지 URL을 직접 가져가므로(Authorization 헤더를 못 붙임)
// 인증 대신 HMAC 서명 토큰이 자격증명 역할을 한다. media/[token](영상)과 같은 형태지만
// image-token.ts가 별도 서명 키를 쓰므로 토큰이 서로 교차 재생되지 않는다.
const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const notFound = () => Response.json({ error: "not found" }, { status: 404 });

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let decodedToken: string;
  try {
    decodedToken = decodeURIComponent(token || "");
  } catch {
    return notFound();
  }
  const claim = verifyImageToken(decodedToken);
  if (!claim) return notFound();

  return runWithTenant(claim.tenantId, async () => {
    const ct = TYPES[path.extname(claim.filename).toLowerCase()];
    if (!ct) return notFound(); // 허용된 이미지 확장자만 배달 — 임의 파일 유출 방지

    try {
      const stored = await mediaStore.get(claim.tenantId, claim.filename);
      if (!stored) return notFound();
      const headers = new Headers({
        "Content-Type": ct,
        // 삭제 직후에도 CDN/브라우저 캐시에서 원본이 남지 않게 한다. URL 토큰의 30일 수명은
        // 예약 발행을 위한 접근 수명이지, 삭제를 무시하는 캐시 수명이 아니다.
        "Cache-Control": "private, no-store",
      });
      if (stored.contentLength !== undefined) headers.set("Content-Length", String(stored.contentLength));
      return new Response(stored.body, { headers });
    } catch (error) {
      if (error instanceof MediaStoreError) {
        return Response.json({ error: "이미지 저장소에 일시적으로 연결할 수 없습니다." }, { status: 503 });
      }
      throw error;
    }
  });
}
