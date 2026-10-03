// Higgsfield 비동기 작업 서버측 백그라운드 완료 루프.
//
// 왜(세션맥락 2026-10-02 운영 실측): 결과 회수가 화면 GET 폴링에만 묶여 있으면, 백그라운드
// 탭에서 브라우저가 타이머를 묶어 두거나(실측: 다음 폴링이 2.5초가 아니라 22분 뒤) 탭이
// 완전히 닫히면 접수된 작업(크레딧은 이미 씀)의 결과를 영영 못 받는다. POST가 작업을 접수한
// 직후, 서버 프로세스 안에서 스스로 그 작업을 확인·완료 처리하는 루프를 돈다 — 화면이 한
// 번도 GET하지 않아도 작업은 completed/failed로 확정된다.
//
// finalizeHiggsfieldJob(higgsfield-finalize.ts)을 GET 라우트와 공유해 processing 락·멱등
// 로직을 그대로 재사용한다. 서버 재시작으로 이 루프가 죽어도, 화면 GET이 기존 락 TTL
// 로직으로 이어받는다(파일에 저장된 상태만 보고 판단하므로 재시작에 영향받지 않는다).
import { readHiggsfieldJob } from "@/lib/higgsfield-jobs";
import { finalizeHiggsfieldJob } from "@/lib/higgsfield-finalize";

// 생성기 대기열 실측(최대 20분)에 여유를 둔 상한 — 클라이언트 폴링 상한(higgsfield-poll.ts
// HIGGSFIELD_POLL_TIMEOUT_MS)과 맞춘다. 이 시간을 넘기면 루프는 멈추지만 작업 기록은
// queued/processing으로 남아, 사용자가 나중에 화면을 열면 GET이 다시 시도한다.
export const HIGGSFIELD_BG_TIMEOUT_MS = 30 * 60 * 1000;
export const HIGGSFIELD_BG_INTERVAL_MS = Number(process.env.HIGGSFIELD_BG_INTERVAL_MS || 7000);

// 같은 작업에 대해 두 번째 루프를 중복으로 켜지 않는다(예: POST 재시도·핫리로드).
const runningKeys = new Set<string>();

export interface ScheduleHiggsfieldBackgroundPollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  // 테스트에서 setTimeout 없이 즉시 다음 tick을 실행하기 위한 주입점.
  scheduleImpl?: (fn: () => void, ms: number) => unknown;
}

export function scheduleHiggsfieldBackgroundPoll(
  tenantId: string,
  jobId: string,
  options: ScheduleHiggsfieldBackgroundPollOptions = {},
): void {
  const key = `${tenantId}:${jobId}`;
  if (runningKeys.has(key)) return;
  runningKeys.add(key);

  const interval = options.intervalMs ?? HIGGSFIELD_BG_INTERVAL_MS;
  const timeout = options.timeoutMs ?? HIGGSFIELD_BG_TIMEOUT_MS;
  const schedule = options.scheduleImpl ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const startedAt = Date.now();

  const stop = () => { runningKeys.delete(key); };

  const tick = async () => {
    // 작업 자체가 사라졌으면(존재한 적 없거나 손상) 더 돌 이유가 없다.
    const before = readHiggsfieldJob(tenantId, jobId);
    if (!before) { stop(); return; }
    if (before.status === "completed" || before.status === "failed") { stop(); return; }

    try {
      await finalizeHiggsfieldJob(tenantId, jobId);
    } catch (e) {
      // finalizeHiggsfieldJob은 내부에서 이미 오류를 queued로 되돌리며 삼킨다 — 여기 걸리면
      // 그 바깥의 예기치 못한 오류다. 작업 자체는 건드리지 않고 다음 tick이 다시 시도한다.
      console.error(JSON.stringify({
        kind: "hf_bg_poll_unexpected_error", jobId, tenantId,
        reason: e instanceof Error ? e.message : String(e),
      }));
    }

    const after = readHiggsfieldJob(tenantId, jobId);
    if (!after || after.status === "completed" || after.status === "failed") { stop(); return; }
    if (Date.now() - startedAt > timeout) {
      console.log(JSON.stringify({ kind: "hf_bg_poll_timeout", jobId, tenantId, status: after.status }));
      stop();
      return;
    }
    schedule(tick, interval);
  };

  schedule(tick, interval);
}

/** 테스트 전용 — 모듈 전역 상태를 초기화한다. */
export function __resetHiggsfieldBackgroundPollForTest(): void {
  runningKeys.clear();
}
