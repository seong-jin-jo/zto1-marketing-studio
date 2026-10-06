import fs from "fs";
import path from "path";
import crypto from "crypto";
import { dataPath } from "@/lib/file-io";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { signMediaToken } from "@/lib/media-token";
import { MAX_VIDEO_BYTES } from "@/lib/video-limits";

const ALLOWED_VIDEO_EXTS = [".mp4", ".mov", ".m4v", ".webm"];
const ALLOWED_AUDIO_EXTS = [".mp3", ".m4a", ".wav"];
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

// SNS-015 업로드 상한: 제품 정책값(100 MiB)을 발행 경로와 **같은 상수**로 공유한다.
// 주의 — 이 검사는 multipart 파서의 메모리 할당을 막지 못한다(Request.formData()는 이 코드보다
// 먼저 본문을 파싱한다). 1차 방어는 프록시/플랫폼의 본문 크기 제한이고, 여기는 디스크 쓰기 전
// 되돌리는 2차 방어 겸 애플리케이션 한도다. 자세한 근거는 @/lib/video-limits.
const MAX_UPLOAD_BYTES = MAX_VIDEO_BYTES;
const MB = 1024 * 1024;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const kind = formData.get("kind") === "music" ? "music" : "video";

  if (!file || !(file instanceof Blob)) {
    return Response.json({ error: "No file" }, { status: 400 });
  }

  const originalName = (file as File).name || "upload";
  const ext = path.extname(originalName).toLowerCase();

  const allowed = kind === "music" ? ALLOWED_AUDIO_EXTS : ALLOWED_VIDEO_EXTS;
  const maxBytes = kind === "music" ? MAX_AUDIO_BYTES : MAX_UPLOAD_BYTES;
  if (!allowed.includes(ext)) {
    return Response.json({ error: kind === "music" ? `Unsupported audio format: ${ext}` : `Unsupported video format: ${ext}` }, { status: 400 });
  }
  if (kind === "music" && formData.get("rightsConfirmed") !== "true") {
    return Response.json({ error: "음악 사용 권한 확인이 필요합니다." }, { status: 422 });
  }

  // 크기 검사는 반드시 arrayBuffer() "앞"에서 — Blob.size는 본문을 메모리로 읽지 않고 알 수 있다.
  // 빈 파일도 거부한다(0B는 재생도 발행도 불가한데 디스크/목록만 오염시킨다).
  const size = file.size;
  if (!(size > 0)) {
    return Response.json({ error: "빈 파일은 업로드할 수 없습니다. 영상 파일을 다시 선택해주세요." }, { status: 400 });
  }
  if (size > maxBytes) {
    return Response.json(
      {
        error: `${kind === "music" ? "음악" : "영상"}이 너무 큽니다 — 최대 ${maxBytes / MB}MiB까지 업로드할 수 있습니다(현재 ${Math.ceil(size / MB)}MiB). 파일을 압축하거나 길이를 줄여 다시 시도해주세요.`,
      },
      { status: 413 },
    );
  }

  const tenantId = await effectiveTenantId(request, null);

  return runWithTenant(tenantId, async () => {
    // dataPath()는 runWithTenant 컨텍스트 "안"에서 호출해야 테넌트별 tenants/{id}/videos로
    // 격리된다(finding 6과 동일 함정 — 모듈 스코프 상수 금지).
    const videosDir = dataPath("videos");
    const safeName = `${crypto.randomBytes(6).toString("hex")}${ext}`;
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

    const savePath = path.join(videosDir, safeName);
    const buf = Buffer.from(await file.arrayBuffer());
    // 2차 방어: Blob.size는 신뢰 가능한 값이지만, 사전검사와 실제 바이트가 어긋나는 런타임/폴리필
    // 조합에서도 상한을 넘긴 파일이 디스크에 남지 않게 한 번 더 확인한다(fail closed).
    if (buf.length <= 0 || buf.length > maxBytes) {
      return Response.json(
        { error: `업로드 크기가 허용 범위를 벗어났습니다(1B 이상 ~ ${maxBytes / MB}MiB 이하).` },
        { status: 413 },
      );
    }
    fs.writeFileSync(savePath, buf);

    let url: string;
    if (tenantId) {
      const token = signMediaToken(tenantId, safeName);
      if (!token) {
        // 서명 불가면 방금 저장한 파일을 되돌려 흔적을 남기지 않는다(fail closed, 부분성공 방지).
        try { fs.unlinkSync(savePath); } catch { /* ignore */ }
        return Response.json(
          { error: "미디어 서명 비밀이 설정되지 않아 업로드를 완료할 수 없습니다(MEDIA_SIGNING_SECRET 필요)." },
          { status: 400 },
        );
      }
      url = `/api/media/${token}`;
    } else {
      url = `/videos/${safeName}`; // 운영자(공유 루트) — 기존 정적 경로 유지.
    }

    return Response.json({ url, filename: safeName, kind });
  });
}
