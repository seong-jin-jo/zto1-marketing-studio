// 테넌트별 미디어 격리 — 생성된 이미지/영상을 테넌트 디렉토리 + UUID 파일명으로 분리.
// 목적: 한 워크스페이스(테넌트)의 산출물이 다른 테넌트 경로에서 조회/열거되지 않도록 한다.
// 격리 모델: data/studio/{tenantId}/{uuid}.{ext}  (테넌트별 하위 디렉토리)
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { DATA_DIR, dataPath } from "@/lib/file-io";

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

/**
 * 고객 요청에서 쓸 엄격한 미디어 조회. 지정된 테넌트 폴더만 보고 공용 legacy 폴더로
 * 폴백하지 않는다. 공용 파일 이전은 소유권을 확인할 수 있는 운영자 작업이어야 한다.
 */
export function resolveTenantGeneratedFile(tenantId: string, filename: string): string | null {
  const resolved = resolveMediaPath(tenantId, filename);
  if (!resolved) return null;
  try {
    return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
  } catch {
    return null;
  }
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

// 옛 공용 영상 폴더 — 인자 tenantId만으로 고정한다(코드리뷰 MAJOR-0a, ADR-007).
// dataPath("videos")는 "호출 시점의 테넌트 컨텍스트(AsyncLocalStorage)"로 경로를 고르므로,
// runWithTenant(...)로 감싸지 않은 채(media/resign, higgsfield/video 라우트가 그랬다) 이
// 함수를 부르면 인자 tenantId와 무관하게 그 순간의 요청 컨텍스트가, 컨텍스트가 없으면
// 운영자 공유 루트가 선택된다. 테넌트 A로 불러도 운영자의 data/videos가 뒤진 이유가
// 이것이다(리뷰어 탐침 P1 실측, 2026-09-25). 인자만으로 계산하면 호출부의 컨텍스트
// 유무와 무관하게 항상 같은 값이 나온다.
function tenantScopedVideosDir(tenantId: string | null | undefined): string {
  const t = safeTenantId(tenantId);
  return t ? path.join(DATA_DIR, "tenants", t, "videos") : path.join(DATA_DIR, "videos");
}

/**
 * 만들어진 영상이 놓일 수 있는 폴더 목록. 인자 tenantId로 고정한 data/tenants/{id}/videos
 * (tenantId가 없으면 운영자 공유 data/videos)를 먼저 보고, 유효한 작업 공간이면
 * data/studio/{tenantId}도 본다.
 *
 * 목록과 단건 해석이 이 함수를 함께 써야 새 저장 위치가 추가될 때 한쪽만 낡지 않는다.
 */
export function generatedMediaDirs(tenantId: string | null | undefined): string[] {
  const dirs = [tenantScopedVideosDir(tenantId)];
  try {
    // 작업 공간 식별자가 비었거나 형식이 틀리면 tenantMediaDir 이 예외를 던진다. 탐색이
    // 그것 때문에 죽으면 옛 폴더에 있는 파일까지 못 찾는다. 한 곳이라도 볼 수 있으면 본다.
    if (tenantId) dirs.push(tenantMediaDir(tenantId));
  } catch (e) {
    // ADR-007: 조용히 삼키지 않는다 — 무엇을 왜 건너뛰는지 남긴다(파일 내용은 남기지 않음).
    console.warn(`[storage.generatedMediaDirs] tenantMediaDir 건너뜀: invalid tenantId, reason=${e instanceof Error ? e.message : String(e)}`);
  }
  return dirs;
}

/**
 * 생성 미디어 폴더가 DATA_DIR 아래의 논리 경로 그대로인지 확인한다.
 * DATA_DIR 자체가 운영상 심볼릭 링크인 것은 허용하지만, 그 아래 tenants/studio 경로가
 * 다른 작업 공간으로 연결된 경우는 목록·배달·삭제 모두에서 거부한다.
 */
export function isGeneratedMediaDirSafe(dir: string): boolean {
  try {
    const logicalRoot = path.resolve(DATA_DIR);
    const logicalDir = path.resolve(dir);
    const relative = path.relative(logicalRoot, logicalDir);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return false;
    const dirStat = fs.lstatSync(logicalDir);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) return false;
    const canonicalRoot = fs.realpathSync(logicalRoot);
    const canonicalDir = fs.realpathSync(logicalDir);
    return canonicalDir === path.join(canonicalRoot, relative);
  } catch {
    return false;
  }
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
  const matches: string[] = [];
  for (const dir of generatedMediaDirs(tenantId)) {
    if (!isGeneratedMediaDirSafe(dir)) {
      // ADR-007: 폴더 하나를 통째로 건너뛰는 결정이다 — 왜인지 남긴다(파일명 내용은 남기지 않음).
      console.warn(`[storage.resolveGeneratedFile] 안전하지 않은 폴더 건너뜀: dir=${dir}`);
      continue;
    }
    const fp = path.join(dir, filename);
    try {
      // lstat 으로 마지막 경로 요소의 심볼릭 링크를 거부한다. realpath containment 는
      // 중간 경로가 링크로 바뀐 경우에도 정본 폴더 밖 파일을 선택하지 않게 한다.
      const stat = fs.lstatSync(fp);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      const canonicalDir = fs.realpathSync(dir);
      const canonicalFile = fs.realpathSync(fp);
      if (!canonicalFile.startsWith(canonicalDir + path.sep)) continue;
      matches.push(fp);
    } catch { /* ENOENT 등 정상적인 "없음" — 폴더 자체는 안전이 확인됐으므로 조용해도 된다 */ }
  }
  // 같은 파일명이 두 저장소에 겹치면 어느 파일인지 이름만으로 안정적으로 식별할 수 없다.
  // 임의 우선순위로 다른 바이트를 배달하지 않고 충돌을 해소할 때까지 닫는다.
  return matches.length === 1 ? matches[0] : null;
}
