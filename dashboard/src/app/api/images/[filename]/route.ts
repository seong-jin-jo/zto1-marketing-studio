import { effectiveTenantId, AuthError } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { isSafeMediaFilename } from "@/lib/image-token";
import { mediaStore, MediaStoreError } from "@/lib/media-store";

// DELETE /api/images/[filename] — 테넌트 격리 이미지 삭제(SNS-016).
// 테넌트는 effectiveTenantId(req)로 인증에서 직접 유도한다(클라이언트가 보내는 tenant_id를
// 신뢰하면 다른 테넌트 파일을 삭제하는 IDOR이 된다). filename은 단일 파일명만 허용해
// path traversal("../")로 테넌트 dir 밖 파일을 지우는 것을 차단한다.
export async function DELETE(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;

  let tenantId: string | null;
  try {
    tenantId = await effectiveTenantId(request, null);
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let decoded: string;
  try {
    decoded = decodeURIComponent(filename || "");
  } catch {
    return Response.json({ error: "File not found" }, { status: 404 });
  }
  if (!isSafeMediaFilename(decoded)) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  return runWithTenant(tenantId, async () => {
    try {
      const deleted = await mediaStore.delete(tenantId, decoded);
      if (!deleted) return Response.json({ error: "File not found" }, { status: 404 });
      return Response.json({ success: true });
    } catch (error) {
      if (error instanceof MediaStoreError) {
        return Response.json({ error: "이미지 저장소에서 파일을 삭제하지 못했습니다." }, { status: 503 });
      }
      throw error;
    }
  });
}
