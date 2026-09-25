import fs from "fs";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { isVideoFilename } from "@/lib/media-token";
import { resolveGeneratedFile } from "@/lib/storage";

export async function POST(request: Request) {
  const data = await request.json();
  const filename = data.filename || "";
  // 경로 구분자/상위참조 거부 + 화이트리스트(영숫자/./-/_ only) — 테넌트 videos 디렉터리를
  // 벗어난 삭제를 원천 차단(media-token.ts와 동일 규칙, 일관성 유지).
  // 확장자는 목록(video/list)이 보여주는 것과 정확히 같은 판정 함수(isVideoFilename)로
  // 제한한다 — 예전엔 list가 대소문자 구분(.endsWith), delete가 대소문자 무시로 서로 다른
  // 기준을 써서 두 라우트가 어긋났다(MINOR-3, 코드리뷰 2026-09-25).
  if (!isVideoFilename(filename)) {
    return Response.json({ error: "invalid filename" }, { status: 400 });
  }

  const tenantId = await effectiveTenantId(request, null);

  return runWithTenant(tenantId, async () => {
    // 목록·배달·삭제가 같은 저장 위치 정본을 쓴다. 생성실 영상도 목록에서 보이는 즉시
    // 삭제할 수 있고, resolveGeneratedFile 이 현재 테넌트 밖의 폴더는 보지 않는다.
    // tenantId를 `|| ""`로 뭉개지 않는다 — null(운영자)과 ""(형식 오류)는 다르게 처리돼야
    // 하고, 뭉개면 운영자의 삭제가 통째로 404가 된다(MAJOR-1, 코드리뷰 2026-09-26).
    const filepath = resolveGeneratedFile(tenantId, filename);
    if (filepath) {
      fs.unlinkSync(filepath);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  });
}
