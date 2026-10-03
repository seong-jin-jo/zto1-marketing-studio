// 발행(비디오/소셜) 비동기 작업의 localStorage 영속 — 새로고침·탭 재방문 뒤에도 폴링을
// 이어갈 수 있게 한다. higgsfield-poll.ts의 savePendingJob/readPendingJob/clearPendingJob과
// 같은 관례를 video/publish(jobId 기반)와 /api/publish(draftId 기반)에 맞춰 일반화한다.
//
// 왜 필요한가(세션맥락 2026-10-02): 202 응답을 받은 뒤 사용자가 새로고침하거나 탭을 닫았다
// 다시 열면, 서버는 백그라운드로 계속 작업 중인데 화면은 그 사실을 모른다 — 접수된 작업
// (크레딧/외부 게시가 이미 진행 중일 수 있음)의 결과를 영영 못 받는다.

export type PendingPublishKind = "video" | "social";

export interface PendingVideoPublishJob {
  kind: "video";
  jobId: string;
  filename: string;
  platform: string;
  startedAt: number;
}

export interface PendingSocialPublishJob {
  kind: "social";
  draftId: string;
  platform: string;
  startedAt: number;
}

export type PendingPublishJob = PendingVideoPublishJob | PendingSocialPublishJob;

const PREFIX = "osmu_pending_publish";

function storageKey(workspaceId: string, kind: PendingPublishKind, scopeId: string, platform: string): string {
  return `${PREFIX}:${kind}:${workspaceId}:${scopeId}:${platform}`;
}

function indexKey(workspaceId: string, kind: PendingPublishKind): string {
  return `${PREFIX}_index:${kind}:${workspaceId}`;
}

function addToIndex(workspaceId: string, kind: PendingPublishKind, scopeId: string, platform: string): void {
  try {
    const raw = localStorage.getItem(indexKey(workspaceId, kind));
    const list: Array<{ scopeId: string; platform: string }> = raw ? JSON.parse(raw) : [];
    if (!list.some((e) => e.scopeId === scopeId && e.platform === platform)) {
      list.push({ scopeId, platform });
      localStorage.setItem(indexKey(workspaceId, kind), JSON.stringify(list));
    }
  } catch { /* noop */ }
}

function removeFromIndex(workspaceId: string, kind: PendingPublishKind, scopeId: string, platform: string): void {
  try {
    const raw = localStorage.getItem(indexKey(workspaceId, kind));
    if (!raw) return;
    const list: Array<{ scopeId: string; platform: string }> = JSON.parse(raw);
    const next = list.filter((e) => !(e.scopeId === scopeId && e.platform === platform));
    localStorage.setItem(indexKey(workspaceId, kind), JSON.stringify(next));
  } catch { /* noop */ }
}

/**
 * 어떤 (scopeId, platform) 조합이 보류 중인지 미리 알 수 없는 화면(예: videos/page.tsx —
 * 어떤 영상/플랫폼으로 발행했는지 페이지 로드 시점엔 모른다)을 위한 전수 색인.
 * studio/page.tsx처럼 draftId/filename을 이미 아는 화면은 listPendingVideoPublishJobs 등을
 * 쓰면 되고 이 색인이 필요 없다.
 */
export function listAllPendingVideoPublishJobs(workspaceId: string): PendingVideoPublishJob[] {
  try {
    const raw = localStorage.getItem(indexKey(workspaceId, "video"));
    if (!raw) return [];
    const list: Array<{ scopeId: string; platform: string }> = JSON.parse(raw);
    return list
      .map((e) => readPendingVideoPublishJob(workspaceId, e.scopeId, e.platform))
      .filter((v): v is PendingVideoPublishJob => Boolean(v));
  } catch {
    return [];
  }
}

export function savePendingVideoPublishJob(
  workspaceId: string, filename: string, platform: string, jobId: string,
): void {
  try {
    const job: PendingVideoPublishJob = { kind: "video", jobId, filename, platform, startedAt: Date.now() };
    localStorage.setItem(storageKey(workspaceId, "video", filename, platform), JSON.stringify(job));
    addToIndex(workspaceId, "video", filename, platform);
  } catch { /* 저장 실패는 복구 기능만 못 쓰게 할 뿐, 진행 중인 작업 자체엔 영향 없다 */ }
}

export function readPendingVideoPublishJob(
  workspaceId: string, filename: string, platform: string,
): PendingVideoPublishJob | null {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId, "video", filename, platform));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingVideoPublishJob;
    return parsed?.kind === "video" && typeof parsed.jobId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingVideoPublishJob(workspaceId: string, filename: string, platform: string): void {
  try { localStorage.removeItem(storageKey(workspaceId, "video", filename, platform)); } catch { /* noop */ }
  removeFromIndex(workspaceId, "video", filename, platform);
}

export function savePendingSocialPublishJob(
  workspaceId: string, draftId: string, platform: string,
): void {
  try {
    const job: PendingSocialPublishJob = { kind: "social", draftId, platform, startedAt: Date.now() };
    localStorage.setItem(storageKey(workspaceId, "social", draftId, platform), JSON.stringify(job));
  } catch { /* noop */ }
}

export function readPendingSocialPublishJob(
  workspaceId: string, draftId: string, platform: string,
): PendingSocialPublishJob | null {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId, "social", draftId, platform));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSocialPublishJob;
    return parsed?.kind === "social" && typeof parsed.draftId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingSocialPublishJob(workspaceId: string, draftId: string, platform: string): void {
  try { localStorage.removeItem(storageKey(workspaceId, "social", draftId, platform)); } catch { /* noop */ }
}

/**
 * 주어진 플랫폼 후보 목록 중 지금 workspace+scope에 걸려 있는 보류 작업을 전부 찾는다.
 * 새로고침 뒤 "무엇을 다시 폴링해야 하는지" 알아낼 때 쓴다.
 */
export function listPendingVideoPublishJobs(
  workspaceId: string, filename: string, platforms: readonly string[],
): Array<PendingVideoPublishJob> {
  return platforms
    .map((p) => readPendingVideoPublishJob(workspaceId, filename, p))
    .filter((v): v is PendingVideoPublishJob => Boolean(v));
}

export function listPendingSocialPublishJobs(
  workspaceId: string, draftId: string, platforms: readonly string[],
): Array<PendingSocialPublishJob> {
  return platforms
    .map((p) => readPendingSocialPublishJob(workspaceId, draftId, p))
    .filter((v): v is PendingSocialPublishJob => Boolean(v));
}
