// @vitest-environment jsdom
// 이 파일 하단의 savePendingJob/readPendingJob 테스트가 localStorage를 쓴다(기본 vitest
// environment는 node라 localStorage가 없다).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { pollHiggsfieldJob, savePendingJob, readPendingJob, clearPendingJob } from "@/lib/higgsfield-poll";

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

// 2026-10-02 독립 리뷰 MAJOR 5a: 새로고침 복구가 비율을 "9:16"으로 못박았다 — 1:1
// 카드뉴스를 만들던 중 새로고침하면 복구된 이미지가 세로 비율로 오판됐다(2026-09-16
// 사고의 재발 형태). 접수 시점의 비율·주제를 함께 저장/복원하는 정본 함수를 검증한다.
describe("savePendingJob/readPendingJob — 비율·주제 보존", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("저장한 aspectRatio와 idea가 그대로 복원된다(1:1 카드뉴스도 9:16으로 뭉개지지 않는다)", () => {
    savePendingJob("ws-1", "image", { jobId: "job-x", aspectRatio: "1:1", idea: "가을 신메뉴 카드뉴스" });
    const restored = readPendingJob("ws-1", "image");
    expect(restored).toEqual({ jobId: "job-x", aspectRatio: "1:1", idea: "가을 신메뉴 카드뉴스" });
  });

  it("9:16 숏폼 바탕 이미지도 그대로 보존된다", () => {
    savePendingJob("ws-1", "image", { jobId: "job-y", aspectRatio: "9:16", idea: "숏폼 주제" });
    expect(readPendingJob("ws-1", "image")?.aspectRatio).toBe("9:16");
  });

  it("구버전(문자열만 저장된) 기록도 jobId로는 읽히되 비율은 알 수 없다(마이그레이션 안전망)", () => {
    localStorage.setItem("hf_pending_job:ws-1:image", "legacy-job-id");
    const restored = readPendingJob("ws-1", "image");
    expect(restored?.jobId).toBe("legacy-job-id");
    expect(restored?.aspectRatio).toBeUndefined();
  });

  it("clearPendingJob 이후에는 복원되지 않는다", () => {
    savePendingJob("ws-1", "video", { jobId: "job-z" });
    clearPendingJob("ws-1", "video");
    expect(readPendingJob("ws-1", "video")).toBeNull();
  });

  it("돌연변이 검증: aspectRatio를 저장하지 않으면(jobId 문자열만 저장) 이 보존 계약이 깨진다", () => {
    // savePendingJob이 다시 "jobId 문자열만 저장"하는 구버전으로 되돌아가면, 아래는
    // undefined가 아니라 "1:1"을 기대하므로 실패한다.
    savePendingJob("ws-2", "image", { jobId: "job-w", aspectRatio: "1:1" });
    expect(readPendingJob("ws-2", "image")?.aspectRatio).toBe("1:1");
  });
});
