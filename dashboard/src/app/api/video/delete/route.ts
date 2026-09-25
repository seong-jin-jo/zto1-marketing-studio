import fs from "fs";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { isSafeMediaFilename } from "@/lib/media-token";
import { resolveGeneratedFile } from "@/lib/storage";

export async function POST(request: Request) {
  const data = await request.json();
  const filename = data.filename || "";
  // 경로 구분자/상위참조 거부 + 화이트리스트(영숫자/./-/_ only) — 테넌트 videos 디렉터리를
  // 벗어난 삭제를 원천 차단(media-token.ts와 동일 규칙, 일관성 유지).
  if (!filename || filename.includes("..") || !isSafeMediaFilename(filename)) {
    return Response.json({ error: "invalid filename" }, { status: 400 });
  }

  const tenantId = await effectiveTenantId(request, null);

  return runWithTenant(tenantId, async () => {
    // 목록·배달·삭제가 같은 저장 위치 정본을 쓴다. 생성실 영상도 목록에서 보이는 즉시
    // 삭제할 수 있고, resolveGeneratedFile 이 현재 테넌트 밖의 폴더는 보지 않는다.
    const filepath = resolveGeneratedFile(tenantId || "", filename);
    if (filepath) {
      fs.unlinkSync(filepath);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  });
}
