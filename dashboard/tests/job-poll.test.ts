// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { pollJobUntilDone } from "@/lib/job-poll";

const instantSleep = async () => {};

function fetchSequence(responses: Array<{ status?: number; body: unknown }>) {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return { status: r.status ?? 200, json: async () => r.body } as unknown as Response;
  });
}

describe("pollJobUntilDone", () => {
  it("processing이 아닌 응답을 받으면 종료한다", async () => {
    const fetchImpl = fetchSequence([
      { body: { status: "processing" } },
      { body: { status: "processing" } },
      { body: { ok: true, url: "https://example.com/post/1" } },
    ]);
    const result = await pollJobUntilDone("/job/1", { fetchImpl, sleepImpl: instantSleep });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ ok: true, url: "https://example.com/post/1" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("404면 notFound다", async () => {
    const fetchImpl = fetchSequence([{ status: 404, body: { error: "x" } }]);
    const result = await pollJobUntilDone("/job/2", { fetchImpl, sleepImpl: instantSleep });
    expect(result.notFound).toBe(true);
  });

  it("상한을 넘기면 timedOut이지 실패가 아니다", async () => {
    const fetchImpl = fetchSequence([{ body: { status: "processing" } }]);
    const result = await pollJobUntilDone("/job/3", { fetchImpl, sleepImpl: instantSleep, timeoutMs: 10 });
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("abort되면 즉시 멈춘다", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = fetchSequence([{ body: { status: "processing" } }]);
    const result = await pollJobUntilDone("/job/4", { fetchImpl, sleepImpl: instantSleep, signal: controller.signal });
    expect(result.aborted).toBe(true);
  });

  it("visibilitychange(visible)가 오면 긴 interval을 기다리지 않고 바로 다음 조회를 한다(wakeableSleep 공유)", async () => {
    const fetchImpl = fetchSequence([
      { body: { status: "processing" } },
      { body: { ok: true } },
    ]);
    const resultPromise = pollJobUntilDone("/job/5", { fetchImpl, intervalMs: 20 * 60 * 1000 });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    const result = await resultPromise;
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
