import fs from "fs";
import path from "path";
import { effectiveTenantId } from "@/lib/tenant-auth";
import { runWithTenant } from "@/lib/tenant-context";
import { signMediaToken, isSafeMediaFilename } from "@/lib/media-token";
import { generatedMediaDirs, isGeneratedMediaDirSafe } from "@/lib/storage";

// SNS-015: 테넌트별로 자기 영상만 본다(운영자는 기존과 동일한 공유 루트 + /videos/ 정적 경로를
// 유지 — 운영자는 대시보드 인증(Bearer=DASHBOARD_AUTH_TOKEN)을 이미 통과한 신뢰 주체라 서명
// URL이 필요 없다. dataPath()는 반드시 runWithTenant(...) 컨텍스트 "안"에서 호출한다 — 모듈
// 스코프 상수로 두면 최초 로드 시점(테넌트 컨텍스트 없음)에 한 번만 평가되어 모든 테넌트가
// 같은 경로를 공유하게 된다(finding 6, video/publish/route.ts와 동일 함정).
export async function GET(request: Request) {
  const tenantId = await effectiveTenantId(request, null);

  return runWithTenant(tenantId, async () => {
    const dirs = generatedMediaDirs(tenantId);
    // 기존 계약: 목록을 처음 열면 업로드 폴더가 준비된다. 생성실 폴더는 생성기가 만든다.
    fs.mkdirSync(dirs[0], { recursive: true });
    const videos: Array<{ filename: string; url: string; size: number; createdAt: number }> = [];
    const candidatesByName = new Map<string, Array<{ size: number; createdAt: number }>>();

    for (const dir of dirs) {
      if (!isGeneratedMediaDirSafe(dir)) continue;
      try {
        const files = await fs.promises.readdir(dir, { withFileTypes: true });
        const candidates = files.filter(
          (entry) => entry.isFile() && entry.name.endsWith(".mp4") && isSafeMediaFilename(entry.name),
        );
        // 파일시스템 작업은 이벤트 루프를 막지 않되, 한 작업 공간에 영상이 많이 쌓여도
        // 동시에 여는 파일 수가 폭증하지 않게 작은 묶음으로 stat 한다.
        for (let offset = 0; offset < candidates.length; offset += 32) {
          const batch = candidates.slice(offset, offset + 32);
          const stats = await Promise.all(
            batch.map(async (entry) => {
              try {
                const stat = await fs.promises.lstat(path.join(dir, entry.name));
                return stat.isFile() && !stat.isSymbolicLink() ? { entry, stat } : null;
              } catch {
                return null;
              }
            }),
          );
          for (const item of stats) {
            if (!item) continue;
            const f = item.entry.name;
            const stat = item.stat;
            const matches = candidatesByName.get(f) ?? [];
            matches.push({ size: stat.size, createdAt: stat.mtimeMs });
            candidatesByName.set(f, matches);
          }
        }
      } catch {
        // 아직 없거나 읽을 수 없는 폴더 하나는 건너뛰고 나머지 폴더를 계속 본다.
      }
    }

    for (const [filename, matches] of candidatesByName) {
      // 파일명만으로 서명·발행·삭제하는 기존 계약상 두 저장소에 같은 이름이 있으면 대상이
      // 불안정해진다. 임의 파일을 고르지 않고 충돌 파일 모두를 숨겨 fail closed 한다.
      if (matches.length !== 1) continue;
      let url: string;
      if (tenantId) {
        // 단수명 HMAC 서명 미디어 URL. 경로 파라미터를 임의로 바꿔 다른 테넌트/파일을 열 수
        // 없다는 것(변조 불가 + 만료)이 보장이며, 기밀성은 아니다 — 토큰 payload는 base64url
        // 평문 JSON이라 디코드하면 파일명·테넌트가 보인다(media-token.ts 상단 주석 참조).
        // 서명 불가(비밀 미설정)면 그 파일은 목록에서 제외한다 — 열람 불가능한 링크를
        // 주느니 안 보이는 게 정직하다(fail closed).
        const token = signMediaToken(tenantId, filename);
        if (!token) continue;
        url = `/api/media/${token}`;
      } else {
        // 운영자(공유 루트) — 기존 정적 경로 유지, 회귀 없음.
        url = `/videos/${filename}`;
      }
      const [match] = matches;
      videos.push({ filename, url, size: match.size, createdAt: match.createdAt });
    }
    videos.sort((a, b) => b.createdAt - a.createdAt);

    return Response.json({ videos });
  });
}
