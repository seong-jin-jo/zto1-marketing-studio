import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 2026-10-02 운영 실측(세션맥락): 결과 회수가 화면 GET 폴링에만 묶여 있으면, 백그라운드
// 탭에서 브라우저가 타이머를 묶어 두거나 탭을 완전히 닫으면 완료 처리 자체가 일어나지
// 않는다(22분 소실 실측). 이 테스트는 "화면이 한 번도 GET하지 않아도" 작업이 서버
// 백그라운드 루프만으로 completed까지 확정되는지를 확인한다.
const FIXTURE_DIR = path.join(__dirname, "fixtures", "higgsfield");
function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8");
}

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const H = vi.hoisted(() => ({
  getStdout: "",
  hfRunCalls: [] as Array<{ args: string[] }>,
  hfRunDelayMs: 0,
}));

vi.mock("@/lib/tenant-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tenant-context")>("@/lib/tenant-context");
  return { ...actual, runWithTenant: vi.fn((_t: string | null, cb: () => unknown) => cb()) };
});
vi.mock("@/lib/media-token", () => ({
  signMediaToken: vi.fn(() => "signed-token"),
  isSafeMediaFilename: vi.fn(() => true),
}));
vi.mock("@/lib/higgsfield", async () => {
  const actual = await vi.importActual<typeof import("@/lib/higgsfield")>("@/lib/higgsfield");
  return {
    ...actual,
    assertHiggsfieldReady: vi.fn(async () => {}),
    downloadTo: vi.fn(async () => 1),
    logGen: vi.fn(),
    recordMediaGenerationEvent: vi.fn(async () => {}),
    hfRun: vi.fn(async (args: string[]) => {
      H.hfRunCalls.push({ args });
      if (H.hfRunDelayMs > 0) await new Promise((r) => setTimeout(r, H.hfRunDelayMs));
      return { stdout: H.getStdout, stderr: "" };
    }),
  };
});

let root: string;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hf-bg-"));
  process.env.DATA_DIR = root;
  H.getStdout = fixture("get-image-pending.json");
  H.hfRunCalls = [];
  H.hfRunDelayMs = 0;
  vi.resetModules();
  const { __resetHiggsfieldBackgroundPollForTest } = await import("@/lib/higgsfield-background-poll");
  __resetHiggsfieldBackgroundPollForTest();
  const { __resetHiggsfieldFinalizeForTest } = await import("@/lib/higgsfield-finalize");
  __resetHiggsfieldFinalizeForTest();
  const { __resetHiggsfieldConcurrencyForTest } = await import("@/lib/higgsfield-concurrency");
  __resetHiggsfieldConcurrencyForTest();
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// 테스트용 즉시-스케줄러 — 실제 setTimeout 대신 큐에 쌓아 drain()으로 한 번에 실행한다.
function makeManualScheduler() {
  const queue: Array<() => void> = [];
  const scheduleImpl = (fn: () => void, _ms: number) => { queue.push(fn); };
  async function drain(maxTicks = 20) {
    let ticks = 0;
    while (queue.length > 0 && ticks < maxTicks) {
      const fn = queue.shift()!;
      await fn();
      ticks += 1;
    }
  }
  return { scheduleImpl, drain };
}

describe("서버측 백그라운드 완료 루프 — 화면 GET 없이도 completed까지 간다", () => {
  it("POST 접수 후 화면이 한 번도 GET하지 않아도 백그라운드 루프가 작업을 completed로 만든다", async () => {
    const { createHiggsfieldJob, readHiggsfieldJob } = await import("@/lib/higgsfield-jobs");
    const { scheduleHiggsfieldBackgroundPoll } = await import("@/lib/higgsfield-background-poll");
    const { downloadTo, recordMediaGenerationEvent } = await import("@/lib/higgsfield");

    const job = createHiggsfieldJob(TENANT_A, "image", "provider-job-1", {
      prompt: "a cat", aspectRatio: "9:16", quality: "1.5k", label: "",
    });

    const { scheduleImpl, drain } = makeManualScheduler();
    // 1번째 tick: 아직 in_progress. 2번째 tick: 완료.
    H.getStdout = fixture("get-image-pending.json");
    scheduleHiggsfieldBackgroundPoll(TENANT_A, job.jobId, { scheduleImpl });
    await drain(1);
    expect(readHiggsfieldJob(TENANT_A, job.jobId)?.status).toBe("queued");
    expect(downloadTo).not.toHaveBeenCalled();

    H.getStdout = fixture("get-image-done.json");
    await drain(1);

    const final = readHiggsfieldJob(TENANT_A, job.jobId);
    expect(final?.status).toBe("completed");
    expect(downloadTo).toHaveBeenCalledTimes(1);
    expect(recordMediaGenerationEvent).toHaveBeenCalledTimes(1);
  });

  it("completed가 되면 루프를 멈춘다(더는 hfRun을 부르지 않는다)", async () => {
    const { createHiggsfieldJob, readHiggsfieldJob } = await import("@/lib/higgsfield-jobs");
    const { scheduleHiggsfieldBackgroundPoll } = await import("@/lib/higgsfield-background-poll");

    const job = createHiggsfieldJob(TENANT_A, "image", "provider-job-2", {
      prompt: "a cat", aspectRatio: "9:16", quality: "1.5k", label: "",
    });
    const { scheduleImpl, drain } = makeManualScheduler();
    H.getStdout = fixture("get-image-done.json");
    scheduleHiggsfieldBackgroundPoll(TENANT_A, job.jobId, { scheduleImpl });
    await drain(10);
    expect(readHiggsfieldJob(TENANT_A, job.jobId)?.status).toBe("completed");
    const callsAfterDone = H.hfRunCalls.length;
    await drain(10); // 더 돌려도 추가 호출이 없어야 한다(스스로 멈췄으므로 큐도 비어 있다).
    expect(H.hfRunCalls.length).toBe(callsAfterDone);
  });

  it("타임아웃(상한)을 넘기면 루프를 멈추지만 작업 기록은 지우지 않는다(나중에 GET이 이어받는다)", async () => {
    const { createHiggsfieldJob, readHiggsfieldJob } = await import("@/lib/higgsfield-jobs");
    const { scheduleHiggsfieldBackgroundPoll } = await import("@/lib/higgsfield-background-poll");

    const job = createHiggsfieldJob(TENANT_A, "image", "provider-job-3", {
      prompt: "a cat", aspectRatio: "9:16", quality: "1.5k", label: "",
    });
    H.getStdout = fixture("get-image-pending.json"); // 계속 대기 중
    const { scheduleImpl, drain } = makeManualScheduler();
    scheduleHiggsfieldBackgroundPoll(TENANT_A, job.jobId, { scheduleImpl, timeoutMs: 1 });
    // 상한(1ms)을 즉시 넘기도록 짧게 설정 — 첫 tick 자체가 이미 시간 초과 조건을 만족한다.
    await new Promise((r) => setTimeout(r, 5));
    await drain(10);
    expect(readHiggsfieldJob(TENANT_A, job.jobId)?.status).not.toBe("completed");
    expect(readHiggsfieldJob(TENANT_A, job.jobId)).not.toBeNull();
  });
});

describe("백그라운드 루프와 GET 동시 진행 — 더블 다운로드·더블 사용량 기록 방지", () => {
  it("루프 tick과 GET이 같은 작업을 동시에 완료 처리해도 다운로드·사용량 기록은 1회다", async () => {
    const { createHiggsfieldJob, readHiggsfieldJob } = await import("@/lib/higgsfield-jobs");
    const { finalizeHiggsfieldJob } = await import("@/lib/higgsfield-finalize");
    const { downloadTo, recordMediaGenerationEvent } = await import("@/lib/higgsfield");

    const job = createHiggsfieldJob(TENANT_A, "image", "provider-job-4", {
      prompt: "a cat", aspectRatio: "9:16", quality: "1.5k", label: "",
    });
    H.getStdout = fixture("get-image-done.json");
    H.hfRunDelayMs = 20; // hfRun이 바로 끝나지 않아 두 호출이 겹칠 시간을 만든다.

    // "GET"과 "백그라운드 tick"을 동시에 흉내낸다 — 둘 다 finalizeHiggsfieldJob을 부른다.
    const [a, b] = await Promise.all([
      finalizeHiggsfieldJob(TENANT_A, job.jobId),
      finalizeHiggsfieldJob(TENANT_A, job.jobId),
    ]);
    expect(a?.body).toEqual(b?.body);
    expect(downloadTo).toHaveBeenCalledTimes(1);
    expect(recordMediaGenerationEvent).toHaveBeenCalledTimes(1);
    expect(readHiggsfieldJob(TENANT_A, job.jobId)?.status).toBe("completed");
  });
});

describe("전체 동시 생성기 호출 상한", () => {
  it("동시 호출이 상한을 넘지 않는다", async () => {
    const { withHiggsfieldConcurrency } = await import("@/lib/higgsfield-concurrency");
    let active = 0;
    let maxActive = 0;
    const run = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active -= 1;
    };
    process.env.HIGGSFIELD_MAX_CONCURRENT_CALLS = "2";
    vi.resetModules();
    const mod = await import("@/lib/higgsfield-concurrency");
    await Promise.all([
      mod.withHiggsfieldConcurrency(run),
      mod.withHiggsfieldConcurrency(run),
      mod.withHiggsfieldConcurrency(run),
      mod.withHiggsfieldConcurrency(run),
    ]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
