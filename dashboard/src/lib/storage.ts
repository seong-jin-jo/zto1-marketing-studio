// 테넌트별 미디어 격리 — 생성된 이미지/영상을 테넌트 디렉토리 + UUID 파일명으로 분리.
// 목적: 한 워크스페이스(테넌트)의 산출물이 다른 테넌트 경로에서 조회/열거되지 않도록 한다.
// 격리 모델: data/studio/{tenantId}/{uuid}.{ext}  (테넌트별 하위 디렉토리)
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { dataPath } from "@/lib/file-io";

// 모든 테넌트 미디어의 루트 (data/studio).
export const MEDIA_ROOT = dataPath("studio");

// 테넌트 ID 정규화 — path traversal / 디렉토리 분리문자를 원천 차단.
// 영문/숫자/하이픈/언더스코어만 허용. "..", "/", "\\", 공백, 점 등이 들어오면 거부(null).
// 길이 64자 제한으로 비정상 입력 방어.
export function safeTenantId(tenantId: string | null | undefined): string | null {
  if (tenantId == null) return null;
  const t = String(tenantId).trim();
  if (!t || t.length > 64) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null; // 슬래시·점·공백 전부 차단 → traversal 불가
  return t;
}

// 테넌트 미디어 디렉토리(data/studio/{tenantId}/). 유효하지 않은 테넌트면 throw.
export function tenantMediaDir(tenantId: string): string {
  const t = safeTenantId(tenantId);
  if (!t) throw new Error("invalid tenant id");
  return path.join(MEDIA_ROOT, t);
}

// 미디어 저장 — crypto.randomUUID로 파일명 생성 후 테넌트 dir에 기록, 상대키(파일명)만 반환.
// 반환 키는 테넌트 dir 내부의 단일 파일명이라 호출부가 테넌트를 알아야만 경로를 복원할 수 있다.
export function saveMedia(tenantId: string, bytes: Buffer | Uint8Array, ext: string): string {
  const dir = tenantMediaDir(tenantId);
  fs.mkdirSync(dir, { recursive: true });
  // 확장자 정규화 — 점/특수문자 제거, 영숫자만. 빈 값이면 bin.
  const clean = String(ext || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "bin";
  const key = `${crypto.randomUUID()}.${clean}`;
  fs.writeFileSync(path.join(dir, key), bytes);
  return key;
}

// 테넌트 dir 내부의 실제 경로 조립 + path traversal 방지.
// 단일 파일명만 허용하며, 결과가 반드시 해당 테넌트 dir 바로 아래여야 한다. 아니면 null.
// 호출부는 null이면 404로 응답해 열거(enumerate)를 차단한다.
export function resolveMediaPath(tenantId: string, key: string): string | null {
  const t = safeTenantId(tenantId);
  if (!t || !key) return null;
  // 경로 구분자·상위참조·null 바이트가 포함된 키는 즉시 거부 (단일 파일명만 허용)
  if (key.includes("/") || key.includes("\\") || key.includes("..") || key.includes("\0")) return null;
  const base = path.resolve(MEDIA_ROOT, t);
  const resolved = path.resolve(base, key);
  // 이중 방어: resolve 결과가 테넌트 base 밖이면 거부
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

// 테넌트 미디어 에셋 URL — asset 라우트가 tenant_id로 대조하도록 쿼리에 테넌트를 명시.
export function assetUrl(tenantId: string, key: string): string {
  const t = safeTenantId(tenantId) || "";
  return `/api/higgsfield/asset/${encodeURIComponent(key)}?tenant_id=${encodeURIComponent(t)}`;
}

// 테넌트 미디어 목록 — 해당 테넌트 dir의 파일만 반환. 유효하지 않은 테넌트면 빈 배열.
export function listMedia(tenantId: string, exts: Set<string>): Array<{ filename: string; size: number; mtimeMs: number }> {
  const t = safeTenantId(tenantId);
  if (!t) return [];
  const dir = path.join(MEDIA_ROOT, t);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs.readdirSync(dir)
    .filter((f) => exts.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { filename: f, size: st.size, mtimeMs: st.mtimeMs };
    });
}

/**
 * 만들어진 파일 하나를 이름으로 찾아 서버 경로를 돌려준다. 못 찾으면 null.
 *
 * 파일이 두 뿌리에 흩어져 산다. 옛 공용 폴더(data/videos)와 작업 공간별 폴더다.
 * 한쪽만 보면 멀쩡히 있는 파일을 못 찾는다.
 *
 * 2026-09-08: 같은 탐색이 배달 라우트, 영상 발행 라우트, 재서명 라우트에 각각 복사돼
 * 있었다. 영상 생성 라우트만 이 탐색 없이 서버 내부 경로를 그대로 요구했고, 그래서
 * 승인함이나 달력에서 가져온 작업물로는 영상을 만들 수 없었다(코드 감사 F-05).
 * 복사본이 넷이면 넷이 서로 다르게 낡는다. 한 곳으로 모은다.
 */
export function resolveGeneratedFile(tenantId: string, filename: string): string | null {
  if (!filename) return null;
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..") || filename.includes("\0")) return null;
  const dirs: string[] = [dataPath("videos")];
  try {
    // 작업 공간 식별자가 비었거나 형식이 틀리면 tenantMediaDir 이 예외를 던진다. 탐색이
    // 그것 때문에 죽으면 옛 폴더에 있는 파일까지 못 찾는다. 한 곳이라도 볼 수 있으면 본다.
    if (tenantId) dirs.push(tenantMediaDir(tenantId));
  } catch { /* 작업 공간 폴더는 건너뛴다 */ }
  for (const dir of dirs) {
    const fp = path.join(dir, filename);
    try {
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) return fp;
    } catch { /* 읽을 수 없으면 없는 것으로 본다 */ }
  }
  return null;
}
