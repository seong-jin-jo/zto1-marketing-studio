import fs from "fs";
import path from "path";
import { resolveMediaPath } from "@/lib/storage";
import { effectiveTenantId } from "@/lib/tenant-auth";

const TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm",
};

// GET /api/higgsfield/asset/<file>?tenant_id=... — 테넌트 격리 미디어 스트리밍.
// 테넌트의 data/studio/{tenantId}/ 디렉토리에서만 서빙. tenant_id 없거나 파일이 그 테넌트 dir 밖이면 404.
// 영상 재생/탐색 위해 HTTP Range(206 Partial Content) 지원.
// 보안: 모든 실패를 404로 통일해 다른 테넌트 파일 존재 여부 열거(enumerate)를 차단.
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  // 2026-09-07 감사 지적: 쿼리 tenant_id 를 그대로 믿으면 인증된 고객 A 가
  // ?tenant_id=B 로 다른 작업 공간 파일을 받아 갈 수 있다. 파일명이 어렵다는 것은
  // 인가가 아니라 은폐다. 부르는 쪽 토큰으로 테넌트를 확정하고, 쿼리 값은 그 확정값과
  // 같을 때만 통과시킨다(다르면 없는 것처럼 404).
  const asked = new URL(req.url).searchParams.get("tenant_id") || req.headers.get("x-tenant-id");
  const tenantId = await effectiveTenantId(req, asked);
  if (!tenantId) return Response.json({ error: "not found" }, { status: 404 });
  if (asked && asked !== tenantId) return Response.json({ error: "not found" }, { status: 404 });

  // resolveMediaPath가 path traversal( .. / \ )과 타테넌트 경로를 차단. null이면 404.
  const fp = resolveMediaPath(tenantId, file);
  if (!fp) return Response.json({ error: "not found" }, { status: 404 });
  if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) return Response.json({ error: "not found" }, { status: 404 });

  const size = fs.statSync(fp).size;
  const ct = TYPES[path.extname(fp).toLowerCase()] || "application/octet-stream";
  const range = req.headers.get("range");

  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    if (start >= size || end >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const fd = fs.openSync(fp, "r");
    const len = end - start + 1;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);
    return new Response(new Uint8Array(buf), {
      status: 206,
      headers: { "Content-Type": ct, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": String(len) },
    });
  }
  const buf = fs.readFileSync(fp);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": ct, "Accept-Ranges": "bytes", "Content-Length": String(size), "Cache-Control": "private, max-age=3600" },
  });
}
