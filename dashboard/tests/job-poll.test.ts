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

  it("processing 응답의 사용자 조치 문구를 onStatus 호출자에게 전달한다", async () => {
    const onStatus = vi.fn();
    const fetchImpl = fetchSequence([
      { body: { status: "processing", error: "TikTok 계정을 다시 연결해 주세요." } },
      { body: { ok: true, status: "published" } },
    ]);

    await pollJobUntilDone("/job/tiktok-guidance", { fetchImpl, sleepImpl: instantSleep, onStatus });

    expect(onStatus).toHaveBeenCalledWith("processing", {
      status: "processing",
      error: "TikTok 계정을 다시 연결해 주세요.",
    });
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

  // MAJOR-2(2026-10-02 독립 리뷰): 401/403/429는 최종 실패가 아니라 재시도 대상이다 —
  // 토큰 만료·레이트리밋을 "실패"로 읽으면 사용자가 재발행을 눌러 중복 게시로 이어진다.
  it.each([401, 403, 429])("HTTP %i는 최종이 아니라 재시도한다", async (status) => {
    const fetchImpl = fetchSequence([
      { status, body: { error: "unauthorized" } },
      { body: { ok: true, url: "https://example.com/post/retry-ok" } },
    ]);
    const result = await pollJobUntilDone("/job/retry", { fetchImpl, sleepImpl: instantSleep });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ ok: true, url: "https://example.com/post/retry-ok" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("몸통이 없는(JSON 파싱 실패) 5xx는 재시도한다 — 프록시가 바꿔치기한 HTML 오류 페이지를 흉내", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ status: 502, json: async () => { throw new Error("not json"); } } as unknown as Response)
      .mockResolvedValueOnce({ status: 200, json: async () => ({ ok: true, url: "https://example.com/recovered" }) } as unknown as Response);
    const result = await pollJobUntilDone("/job/html-error", { fetchImpl, sleepImpl: instantSleep });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("몸통이 있는 500(레거시 persistence-failure 경로)은 재시도하지 않고 그대로 종결한다", async () => {
    const fetchImpl = fetchSequence([
      { status: 500, body: { ok: false, externalPublished: true, retryPublish: false, error: "외부 게시는 됐지만 기록 저장 실패" } },
    ]);
    const result = await pollJobUntilDone("/job/persistence-fail", { fetchImpl, sleepImpl: instantSleep });
    expect(result.ok).toBe(true); // 폴링 자체는 "응답을 받았다"는 뜻으로 성공
    expect(result.httpStatus).toBe(500);
    expect(result.data).toMatchObject({ externalPublished: true, retryPublish: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 재시도 없음 — 즉시 종결
  });

  it("headers가 함수면 매 요청마다 새로 호출한다(고정 토큰이 15분 내내 굳지 않게)", async () => {
    let callCount = 0;
    const headersFactory = vi.fn(() => ({ Authorization: `Bearer token-${++callCount}` }));
    const calls: Array<Record<string, string> | undefined> = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init?.headers as Record<string, string> | undefined);
      if (calls.length < 3) return { status: 200, json: async () => ({ status: "processing" }) } as unknown as Response;
      return { status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    });
    await pollJobUntilDone("/job/headers", { fetchImpl: fetchImpl as unknown as typeof fetch, sleepImpl: instantSleep, headers: headersFactory });
    expect(headersFactory.mock.calls.length).toBe(3);
    expect(calls.map((h) => h?.Authorization)).toEqual(["Bearer token-1", "Bearer token-2", "Bearer token-3"]);
  });

  it("headers가 고정 객체면 기존처럼 그대로 쓴다(하위호환)", async () => {
    const fetchImpl = fetchSequence([{ body: { ok: true } }]);
    await pollJobUntilDone("/job/headers-static", { fetchImpl, sleepImpl: instantSleep, headers: { Authorization: "Bearer fixed" } });
    expect(fetchImpl).toHaveBeenCalledWith("/job/headers-static", expect.objectContaining({ headers: { Authorization: "Bearer fixed" } }));
  });
});
