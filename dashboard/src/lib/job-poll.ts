// 발행류 비동기 작업(video/publish job, /api/publish draft 상태) 공용 폴러.
//
// 계약: 진행 중이면 본문에 `status: "processing"`을 담아 200으로 응답하고, 끝나면(성공이든
// 실패든) 그 최종 결과를 그대로 돌려준다 — Higgsfield 생성 폴링(queued/retrying 같은 중간
// 상태가 있는)보다 단순하다. 2.5초 기본 간격과 백그라운드 탭 깨우기는
// higgsfield-poll.ts와 같은 정본(wakeable-sleep.ts)을 공유한다.
import { wakeableSleep } from "@/lib/wakeable-sleep";

export interface JobPollOptions {
  signal?: AbortSignal;
  intervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  onStatus?: (status: "processing") => void;
  /** 테스트에서 setTimeout 없이 즉시 진행시키기 위한 주입점. */
  sleepImpl?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface JobPollOutcome<T> {
  ok: boolean;
  httpStatus?: number;
  data?: T;
  timedOut?: boolean;
  aborted?: boolean;
  notFound?: boolean;
}

export const JOB_POLL_INTERVAL_MS = 2500;

interface JobStatusPayload {
  status?: string;
}

/**
 * url을 계속 조회해 `status: "processing"`이 아닌 최종 응답을 받을 때까지 기다린다.
 * 404는 "작업을 찾을 수 없음"으로, 상한 초과는 timedOut으로 구분해 호출부가 "실패"와
 * "아직 결과를 모름"을 섞지 않게 한다 — 상한 초과는 재발행을 유도하지 않는 것이 핵심이다
 * (세션맥락: 524 오판으로 인한 재발행이 중복 게시를 부른다).
 */
export async function pollJobUntilDone<T extends JobStatusPayload = JobStatusPayload>(
  url: string,
  options: JobPollOptions = {},
): Promise<JobPollOutcome<T>> {
  const interval = options.intervalMs ?? JOB_POLL_INTERVAL_MS;
  const timeout = options.timeoutMs ?? 15 * 60 * 1000;
  const f = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? wakeableSleep;
  const start = Date.now();

  for (;;) {
    if (options.signal?.aborted) return { ok: false, aborted: true };
    if (Date.now() - start > timeout) return { ok: false, timedOut: true };

    let res: Response;
    try {
      res = await f(url, { headers: options.headers, signal: options.signal });
    } catch {
      if (options.signal?.aborted) return { ok: false, aborted: true };
      await sleep(interval, options.signal);
      continue;
    }

    if (res.status === 404) return { ok: false, notFound: true };

    const data = await res.json().catch(() => null) as T | null;
    if (!data) {
      await sleep(interval, options.signal);
      continue;
    }
    if (data.status === "processing") {
      options.onStatus?.("processing");
      await sleep(interval, options.signal);
      continue;
    }
    return { ok: true, httpStatus: res.status, data };
  }
}
