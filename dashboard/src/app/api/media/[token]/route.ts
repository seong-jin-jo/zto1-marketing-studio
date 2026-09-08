import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { dataPath } from "@/lib/file-io";
import { runWithTenant } from "@/lib/tenant-context";
import { verifyMediaToken } from "@/lib/media-token";
import { tenantMediaDir } from "@/lib/storage";

// GET /api/media/<signed-token> — SNS-015 서명 미디어 배달.
// Instagram Reels 컨테이너 생성 시 Meta 서버가 직접 이 URL을 가져간다(= 인증 헤더를 못 붙임).
// 그래서 인증 대신 "짧게 만료되는 HMAC 서명 토큰"이 자격증명 역할을 한다.
// 보안: 토큰이 테넌트를 결정하고(cross-tenant 불가), 파일 경로는 항상 그 테넌트 컨텍스트의
// data/videos 아래로만 해석되며, 모든 실패는 404로 통일해 파일 존재 여부 열거를 차단한다.
// 2026-09-07: 생성실이 만든 그림과 영상도 이 길로 배달한다. img·video 태그는 인증 헤더를
// 못 붙이므로 헤더 인증만 있는 경로로는 화면에 아무것도 안 뜬다. 실제로 만들기는 성공했는데
// 그림이 안 떠서 "생성 안 됨" 으로 읽혔다(회장 2026-09-07). 서명 토큰이 자격증명 역할을 한다.
const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/**
 * 파일 앞머리를 읽어 진짜 종류를 정한다. 확장자를 믿지 않는다.
 *
 * 2026-09-08 회장 실사용: 생성실에서 만든 그림이 화면에 안 떴다. 원인은 생성기가 WebP 를
 * 주는데 우리가 `.png` 라는 이름으로 저장하고, 배달할 때 확장자만 보고 image/png 라고
 * 알려 준 것이다. 브라우저는 png 라고 들은 바이트가 webp 라 그리기를 거부했다.
 * 만들기는 성공하고 화면만 비어 있으니 "생성이 안 된다" 로 읽힌다.
 *
 * 앞으로 저장 이름을 고쳐도 이미 저장된 파일은 그대로다. 그래서 내용을 보고 정한다.
 */
function sniffContentType(fp: string, fallback: string): string {
  try {
    const fd = fs.openSync(fp, "r");
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    if (head.slice(0, 4).toString("ascii") === "RIFF" && head.slice(8, 12).toString("ascii") === "WEBP") return "image/webp";
    if (head[0] === 0x89 && head.slice(1, 4).toString("ascii") === "PNG") return "image/png";
    if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
    if (head.slice(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  } catch { /* 못 읽으면 확장자 판정을 그대로 쓴다 */ }
  return fallback;
}

// 토큰이 정한 테넌트 안에서만 찾는다. 영상 업로드 폴더와 생성실 폴더 두 곳을 본다.
// 두 경로 모두 runWithTenant 안에서 계산되므로 다른 테넌트로 새지 않는다.
function resolveDeliverable(tenantId: string, filename: string): string | null {
  // data/tenants/{id}/videos (영상 업로드) 와 data/studio/{id} (생성실 산출물) 두 곳이다.
  // 경로 계산이 서로 다른 뿌리를 쓰므로 한쪽만 보면 못 찾는다.
  for (const dir of [dataPath("videos"), tenantMediaDir(tenantId)]) {
    const fp = path.join(dir, filename);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) return fp;
  }
  return null;
}

/** Range 응답 1회 상한 — 메모리 보호. */
const MAX_RANGE_CHUNK = 8 * 1024 * 1024;

const notFound = () => Response.json({ error: "not found" }, { status: 404 });

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = verifyMediaToken(decodeURIComponent(token || ""));
  if (!claim) return notFound();

  return runWithTenant(claim.tenantId, async () => {
    const fp = resolveDeliverable(claim.tenantId, claim.filename);
    if (!fp) return notFound();
    const declared = TYPES[path.extname(fp).toLowerCase()];
    const ct = declared ? sniffContentType(fp, declared) : declared;
    if (!ct) return notFound(); // 아는 확장자만 배달 — 임의 파일 유출 방지

    const size = fs.statSync(fp).size;
    const range = req.headers.get("range");
    if (range) {
      // RFC 9110 §14.1.2: 값이 "bytes="로 시작하지 않거나, 콤마로 여러 range-spec을 담은
      // multi-range 요청은 우리가 구현하지 않는 형태 — 416으로 거부한다(부분범위를 잘못
      // 해석해 엉뚱한 바이트를 주지 않기 위함. multipart/byteranges 미구현).
      if (!range.startsWith("bytes=") || range.includes(",")) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      const spec = range.slice("bytes=".length).trim();
      // suffix-range(RFC 9110 §14.1.2 "bytes=-N" — 파일 끝에서 N바이트) vs 일반 range(start-end / start-).
      const suffixMatch = spec.match(/^-(\d+)$/);
      const rangeMatch = spec.match(/^(\d+)-(\d*)$/);
      let start: number;
      let requestedEnd: number;
      if (suffixMatch) {
        const suffixLen = parseInt(suffixMatch[1], 10);
        if (!(suffixLen > 0)) {
          return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
        }
        start = Math.max(0, size - suffixLen);
        requestedEnd = size - 1;
      } else if (rangeMatch) {
        start = parseInt(rangeMatch[1], 10);
        // 요청 끝이 열려 있으면(bytes=0-) 파일 전체가 아니라 청크 상한까지만 준다 —
        // 서버는 요청보다 적게 줘도 되며(RFC 9110), 과대 요청 버퍼 할당을 막는다.
        requestedEnd = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : size - 1;
      } else {
        // 형식 자체가 malformed(예: "abc-def", 빈 스펙) — RFC 9110 §14.1.2에 따르면 문법상
        // 무효한 Range는 무시하고 전체 응답(200)으로 대응하는 것도 허용되나, 이 배달 경로는
        // 단순 순차/랜덤 재생만 지원하므로 명확히 거부(416)해 모호한 동작을 없앤다.
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      const end = Math.min(requestedEnd, size - 1, start + MAX_RANGE_CHUNK - 1);
      if (!(start >= 0) || !(end >= start) || start >= size || end >= size) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      const len = end - start + 1;
      const buf = Buffer.alloc(len);
      let fd: number | null = null;
      try {
        fd = fs.openSync(fp, "r");
        fs.readSync(fd, buf, 0, len, start);
      } finally {
        if (fd !== null) fs.closeSync(fd);
      }
      return new Response(new Uint8Array(buf), {
        status: 206,
        headers: {
          "Content-Type": ct,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(len),
          "Cache-Control": "private, no-store",
        },
      });
    }
    // 전체 응답은 스트리밍한다 — 영상은 최대 100MiB라 readFileSync는 그만큼을 통째로 메모리에 올린다.
    const stream = Readable.toWeb(fs.createReadStream(fp)) as unknown as ReadableStream<Uint8Array>;
    return new Response(stream, {
      headers: {
        "Content-Type": ct,
        "Accept-Ranges": "bytes",
        "Content-Length": String(size),
        "Cache-Control": "private, no-store",
      },
    });
  });
}

// HEAD — 일부 프로바이더/디버깅 클라이언트가 본문 없이 존재·크기·Range 지원 여부만 확인한다.
// 동일한 토큰 검증 + 404 통일 규약을 따르되 파일을 읽지 않아(스트림/버퍼 0) 자원 소모가 없다.
export async function HEAD(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = verifyMediaToken(decodeURIComponent(token || ""));
  if (!claim) return new Response(null, { status: 404 });

  return runWithTenant(claim.tenantId, async () => {
    const fp = resolveDeliverable(claim.tenantId, claim.filename);
    if (!fp) return new Response(null, { status: 404 });
    const declared = TYPES[path.extname(fp).toLowerCase()];
    const ct = declared ? sniffContentType(fp, declared) : declared;
    if (!ct) return new Response(null, { status: 404 });
    const size = fs.statSync(fp).size;
    return new Response(null, {
      headers: {
        "Content-Type": ct,
        "Accept-Ranges": "bytes",
        "Content-Length": String(size),
        "Cache-Control": "private, no-store",
      },
    });
  });
}
