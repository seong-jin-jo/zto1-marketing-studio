import path from "path";
import crypto from "crypto";
import { effectiveTenantId, AuthError } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { signImageToken } from "@/lib/image-token";
import { canonicalPublicOrigin } from "@/lib/social-connect";
import { mediaStore, MediaStoreError } from "@/lib/media-store";

// POST /api/images/upload — 테넌트 격리 이미지 업로드(SNS-016).
// 큐 이미지는 업로드 시점에 URL을 발급받아 queue.json에 영속 저장되고, 예약 발행이 며칠 뒤
// 실행될 때 그 URL을 그대로 Meta/Threads API에 전달한다. 그래서 응답 url은 반드시 절대 HTTPS
// 서명 URL이어야 한다(짧은 만료 토큰을 영속 저장하면 예약 발행 시점에 이미 죽어있다).
const ALLOWED_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MB = 1024 * 1024;
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function POST(request: Request) {
  let tenantId: string | null;
  try {
    tenantId = await effectiveTenantId(request, null);
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // multipart 파서가 본문을 읽기 전에 Content-Length로 명백한 과대 요청을 먼저 거른다
  // (formData()는 이 검사보다 먼저 전체 본문을 메모리로 읽으므로 완전한 방어는 아니다 — 1차
  // 방어는 프록시/플랫폼의 본문 크기 제한, 여기는 디스크 쓰기 전 되돌리는 애플리케이션 한도).
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_UPLOAD_BYTES * 2) {
    return Response.json(
      { error: `이미지가 너무 큽니다 — 최대 ${MAX_UPLOAD_BYTES / MB}MiB까지 업로드할 수 있습니다.` },
      { status: 413 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: "No file" }, { status: 400 });
  }

  const originalName = (file as File).name || "upload";
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    return Response.json({ error: `Unsupported format: ${ext}` }, { status: 400 });
  }

  // 크기 검사는 arrayBuffer() "앞"에서 — Blob.size는 본문을 메모리로 읽지 않고 알 수 있다.
  const size = file.size;
  if (!(size > 0)) {
    return Response.json({ error: "빈 파일은 업로드할 수 없습니다." }, { status: 400 });
  }
  if (size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `이미지가 너무 큽니다 — 최대 ${MAX_UPLOAD_BYTES / MB}MiB까지 업로드할 수 있습니다(현재 ${Math.ceil(size / MB)}MiB).` },
      { status: 413 },
    );
  }

  return runWithTenant(tenantId, async () => {
    const safeName = `${crypto.randomBytes(6).toString("hex")}${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    // 2차 방어: 실제 바이트 길이가 사전검사와 어긋나는 런타임 조합에서도 상한을 넘긴 파일이
    // 디스크에 남지 않게 한 번 더 확인한다(fail closed).
    if (buf.length <= 0 || buf.length > MAX_UPLOAD_BYTES) {
      return Response.json(
        { error: `업로드 크기가 허용 범위를 벗어났습니다(1B 이상 ~ ${MAX_UPLOAD_BYTES / MB}MiB 이하).` },
        { status: 413 },
      );
    }

    const origin = canonicalPublicOrigin();
    const token = origin ? signImageToken(tenantId, safeName) : null;
    if (!origin || !token) {
      return Response.json(
        { error: "공개 이미지 URL을 발급할 수 없습니다(OSMU_PUBLIC_URL / MEDIA_SIGNING_SECRET 설정 필요)." },
        { status: 500 },
      );
    }

    try {
      await mediaStore.put(tenantId, safeName, buf, CONTENT_TYPES[ext]);
    } catch (error) {
      if (error instanceof MediaStoreError) {
        const status = error.code === "R2_UNAVAILABLE" ? 503 : 500;
        return Response.json({ error: error.message }, { status });
      }
      throw error;
    }

    return Response.json({ url: `${origin}/api/images/deliver/${token}`, filename: safeName });
  });
}
