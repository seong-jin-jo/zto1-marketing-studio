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
  // MAJOR-2(2026-10-02 독립 리뷰): 고정 객체를 주면 폴링 시작 시점의 헤더(토큰)가 15분
  // 내내 굳는다 — 토큰이 그 사이 돌면 이후 요청이 전부 401로 떨어진다. 함수를 주면 매
  // 요청 직전에 새로 만든다. 기존 호출부(고정 객체)와의 하위호환을 위해 둘 다 받는다.
  headers?: Record<string, string> | (() => Record<string, string>);
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
 *
 * MAJOR-2(2026-10-02 독립 리뷰): 401/403/429(토큰 만료·레이트리밋)와 몸통 없는(JSON 파싱
 * 실패) 응답은 전부 재시도한다 — 서버가 실제로는 계속 작업 중인데 화면이 먼저 포기해
 * 사용자가 재발행을 눌러 중복 게시로 이어지는 걸 막는다. 404(작업이 아예 없음)는 즉시
 * 종결한다. 그 외(2xx든 5xx든) 유효한 JSON 몸통이 있으면 "서버가 결정했다"로 보고 종결한다
 * — 이 레포는 결정된 실패를 200으로 돌려주는 house convention과, 일부 레거시 경로가 그대로
 * 500/503으로 돌려주는 혼용이 같이 있다(BLOCK-1 videoPersistenceFailure 등). 몸통이 있는
 * 500은 "서버가 응답은 했다"는 뜻이라 재시도 대상이 아니다.
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
  const buildHeaders = (): Record<string, string> | undefined =>
    typeof options.headers === "function" ? options.headers() : options.headers;

  for (;;) {
    if (options.signal?.aborted) return { ok: false, aborted: true };
    if (Date.now() - start > timeout) return { ok: false, timedOut: true };

    let res: Response;
    try {
      res = await f(url, { headers: buildHeaders(), signal: options.signal });
    } catch {
      if (options.signal?.aborted) return { ok: false, aborted: true };
      await sleep(interval, options.signal);
      continue;
    }

    if (res.status === 404) return { ok: false, notFound: true };

    // 401/403/429는 무조건 재시도한다 — 토큰 만료·레이트리밋은 몸통과 무관하게 일시적이고,
    // 서버 작업 자체는 계속 진행 중일 수 있다(세션맥락: BLOCK-1 — 524/일시 장애를 최종
    // 실패로 읽어 pending을 지우면 사용자가 재발행해 중복 게시로 이어진다).
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      await sleep(interval, options.signal);
      continue;
    }

    const data = await res.json().catch(() => null) as T | null;
    if (!data) {
      // JSON이 아닌 응답(예: Cloudflare가 502/524를 HTML 오류 페이지로 바꿔치기) — 중간
      // 장애로 보고 재시도한다. 2xx든 5xx든 몸통이 없으면 판단할 근거가 없다.
      await sleep(interval, options.signal);
      continue;
    }
    // 여기부터는 유효한 JSON 몸통이 있다. 이 레포의 house convention(GENERATOR_REFUSED/
    // PROVIDER_FAILED = 200)은 결정된 결과(성공/실패 모두)를 200으로 돌려주지만, 일부
    // 경로(videoPersistenceFailure 등)는 여전히 500/503으로 결정된 결과를 돌려준다 —
    // 그 몸통이 유효한 JSON이면("서버가 실제로 응답했다") 2xx가 아니어도 최종으로 본다.
    // 몸통 없는 진짜 전송 장애(위에서 이미 재시도 처리)와 구분된다.
    if (data.status === "processing") {
      options.onStatus?.("processing");
      await sleep(interval, options.signal);
      continue;
    }
    return { ok: true, httpStatus: res.status, data };
  }
}
