import { describe, expect, it, vi } from "vitest";
import { pollHiggsfieldJob } from "@/lib/higgsfield-poll";

// 클라이언트 폴링 계약 — studio/page.tsx genImage/genVideo가 이 함수로 jobId를 완료까지 지켜본다.
// setTimeout을 실제로 기다리지 않도록 sleepImpl을 즉시 resolve로 주입한다(테스트 속도).
const instantSleep = async () => {};

function fetchSequence(responses: Array<{ status?: number; body: unknown }>) {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return {
      status: r.status ?? 200,
      json: async () => r.body,
    } as unknown as Response;
  });
}

describe("pollHiggsfieldJob", () => {
  it("queued → processing → completed 순서로 진행 상태를 콜백하고 완료 결과를 돌려준다", async () => {
    const statuses: string[] = [];
    const fetchImpl = fetchSequence([
      { body: { status: "queued" } },
      { body: { status: "processing" } },
      { body: { ok: true, url: "https://cdn.example/img.webp", file: "/api/media/x" } },
    ]);
    const result = await pollHiggsfieldJob<{ status?: string; ok?: boolean; url?: string; file?: string }>(
      "job-1", "tenant-1",
      { fetchImpl, sleepImpl: instantSleep, onStatus: (s) => statuses.push(s) },
    );
    expect(statuses).toEqual(["queued", "processing"]);
    expect(result.ok).toBe(true);
    expect(result.data?.url).toBe("https://cdn.example/img.webp");
  });

  it("실패 결과(ok:false)를 그대로 전달한다", async () => {
    const fetchImpl = fetchSequence([
      { body: { ok: false, error: "생성기가 거절했습니다", nsfw: true } },
    ]);
    const result = await pollHiggsfieldJob("job-2", "tenant-1", { fetchImpl, sleepImpl: instantSleep });
    expect(result.ok).toBe(false);
    expect(result.data?.error).toBe("생성기가 거절했습니다");
  });

  it("상한 시간을 넘기면 타임아웃으로 멈춘다", async () => {
    // 항상 queued를 돌려주는 가짜 fetch + 즉시 진행되는 sleep으로, 실제 경과시간(수십ms)이
    // 아주 짧은 timeoutMs(30ms)를 넘을 때까지 루프를 돌린다.
    const fetchImpl = fetchSequence([{ body: { status: "queued" } }]);
    const result = await pollHiggsfieldJob("job-3", "tenant-1", {
      fetchImpl, sleepImpl: instantSleep, timeoutMs: 30,
    });
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("abort 신호를 받으면 즉시 멈춘다", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = fetchSequence([{ body: { status: "queued" } }]);
    const result = await pollHiggsfieldJob("job-4", "tenant-1", {
      fetchImpl, sleepImpl: instantSleep, signal: controller.signal,
    });
    expect(result.aborted).toBe(true);
  });

  it("404면 작업을 찾을 수 없다고 답한다", async () => {
    const fetchImpl = fetchSequence([{ status: 404, body: { error: "not found" } }]);
    const result = await pollHiggsfieldJob("job-5", "tenant-1", { fetchImpl, sleepImpl: instantSleep });
    expect(result.notFound).toBe(true);
    expect(result.ok).toBe(false);
  });
});
