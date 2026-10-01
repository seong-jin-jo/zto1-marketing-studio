// Higgsfield 비동기 생성 작업 폴링 — 클라이언트 전용. genImage/genVideo(studio/page.tsx)와
// 새로고침 뒤 작업 복구가 함께 쓰는 정본 함수. 순수 함수로 분리해 테스트에서 fetch를 mock.
//
// 2026-10-01 추가 실측(cb35f3fd, 세션맥락): 이미지 생성이 실제로 15~20분 걸려 완료됐다.
// 상한을 두 매체 모두 30분으로 맞춘다("이미지는 3분"류의 짧은 상한은 이 실측과 안 맞는다).

export interface HiggsfieldPollOptions<T> {
  signal?: AbortSignal;
  intervalMs?: number;
  timeoutMs?: number;
  onStatus?: (status: "queued" | "processing") => void;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  /** 테스트에서 setTimeout 없이 즉시 진행시키기 위한 주입점. */
  sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface HiggsfieldPollOutcome<T> {
  ok: boolean;
  data?: T;
  error?: string;
  timedOut?: boolean;
  aborted?: boolean;
  notFound?: boolean;
}

export const HIGGSFIELD_POLL_INTERVAL_MS = 2500;
// 이미지·영상 모두 30분 — 생성기 대기열 실측(최대 20분)에 여유를 둔 상한.
export const HIGGSFIELD_POLL_TIMEOUT_MS = 30 * 60 * 1000;

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

interface JobStatusPayload {
  status?: string;
  ok?: boolean;
  jobId?: string;
  error?: string;
}

/**
 * jobId 하나를 완료/실패/타임아웃/취소까지 폴링한다. 완료·실패 응답은
 * GET /api/higgsfield/job/[id]가 멱등으로 반환하므로 여기서 추가 상태 전이는 없다.
 */
export async function pollHiggsfieldJob<T extends JobStatusPayload = JobStatusPayload>(
  jobId: string,
  tenantId: string,
  options: HiggsfieldPollOptions<T> = {},
): Promise<HiggsfieldPollOutcome<T>> {
  const interval = options.intervalMs ?? HIGGSFIELD_POLL_INTERVAL_MS;
  const timeout = options.timeoutMs ?? HIGGSFIELD_POLL_TIMEOUT_MS;
  const f = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;
  const start = Date.now();

  for (;;) {
    if (options.signal?.aborted) return { ok: false, aborted: true };
    if (Date.now() - start > timeout) {
      return { ok: false, timedOut: true, error: "생성이 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요." };
    }

    let res: Response;
    try {
      res = await f(
        `/api/higgsfield/job/${encodeURIComponent(jobId)}?tenant_id=${encodeURIComponent(tenantId)}`,
        { headers: options.headers, signal: options.signal },
      );
    } catch {
      if (options.signal?.aborted) return { ok: false, aborted: true };
      await sleep(interval, options.signal);
      continue;
    }

    if (res.status === 404) return { ok: false, notFound: true, error: "작업을 찾을 수 없습니다." };

    const data = await res.json().catch(() => null) as T | null;
    if (!data) {
      await sleep(interval, options.signal);
      continue;
    }
    if (data.status === "queued") {
      options.onStatus?.("queued");
      await sleep(interval, options.signal);
      continue;
    }
    if (data.status === "processing") {
      options.onStatus?.("processing");
      await sleep(interval, options.signal);
      continue;
    }
    // 종결 상태(completed/failed) — job route가 멱등으로 돌려준 결과 그대로.
    return { ok: Boolean(data.ok), data };
  }
}

const JOB_STORAGE_PREFIX = "hf_pending_job";

export function pendingJobStorageKey(workspaceId: string, kind: "image" | "video"): string {
  return `${JOB_STORAGE_PREFIX}:${workspaceId}:${kind}`;
}

/**
 * 2026-10-02 리뷰 MAJOR 5a: 종전엔 jobId 문자열만 저장해, 새로고침 복구가 이미지 비율을
 * "9:16"으로 못박았다 — 카드뉴스(1:1)를 만들던 중 새로고침하면 복구된 이미지가 영상
 * 바탕 재사용 판정(work-media.ts isReusableVideoBaseImage)에서 세로 비율로 오판된다
 * (2026-09-16 사고의 재발 형태). 접수 시점의 비율·주제도 함께 저장해 복구 시 그대로
 * 되살린다.
 */
export interface PendingHiggsfieldJob {
  jobId: string;
  aspectRatio?: "1:1" | "9:16";
  idea?: string;
}

export function savePendingJob(workspaceId: string, kind: "image" | "video", job: PendingHiggsfieldJob): void {
  try { localStorage.setItem(pendingJobStorageKey(workspaceId, kind), JSON.stringify(job)); } catch { /* 저장 실패는 복구 기능만 못 쓰게 할 뿐, 생성 자체는 진행한다 */ }
}

export function readPendingJob(workspaceId: string, kind: "image" | "video"): PendingHiggsfieldJob | null {
  try {
    const raw = localStorage.getItem(pendingJobStorageKey(workspaceId, kind));
    if (!raw) return null;
    // 구버전 호환: 과거엔 jobId 문자열을 그대로 저장했다. JSON 파싱이 실패하거나
    // 문자열이 그대로 나오면 jobId만 있는 레코드로 취급한다.
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && typeof (parsed as { jobId?: unknown }).jobId === "string") {
        return parsed as PendingHiggsfieldJob;
      }
    } catch { /* fallthrough to legacy string */ }
    return { jobId: raw };
  } catch {
    return null;
  }
}

export function clearPendingJob(workspaceId: string, kind: "image" | "video"): void {
  try { localStorage.removeItem(pendingJobStorageKey(workspaceId, kind)); } catch { /* noop */ }
}
