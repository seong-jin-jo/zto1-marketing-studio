import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMetaPostMetrics, fetchXPublicMetrics, fetchYouTubeMetrics } from "@/lib/publish";

afterEach(() => vi.unstubAllGlobals());

describe("OSMU 성과 공급자 부분 실패 회귀", () => {
  it("OSMU-016 정상 경로: X 101건 중 뒤 묶음이 429여도 앞 100건의 성과를 보존한다", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 2) return new Response("한도", { status: 429 });
      return new Response(JSON.stringify({
        data: [{ id: "x-0", public_metrics: { impression_count: 10, like_count: 2, reply_count: 1, retweet_count: 3 } }],
      }), { status: 200 });
    }));
    const ids = Array.from({ length: 101 }, (_, index) => `x-${index}`);

    const result = await fetchXPublicMetrics({ token: "x-token" }, ids);

    expect(result.ok).toBe(true);
    expect(result.metrics?.["x-0"]).toEqual({ views: 10, likes: 2, replies: 1, reposts: 3 });
    expect(result.attemptedIds).toHaveLength(100);
    expect(result.failedIds).toEqual(["x-100"]);
    expect(result.failures).toContainEqual({ ids: ["x-100"], status: 429, code: "x_429" });
  });

  it("OSMU-016 거절 경로: YouTube 51건 중 뒤 묶음이 503이어도 앞 50건의 성과를 보존한다", async () => {
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 2) return new Response("장애", { status: 503 });
      return new Response(JSON.stringify({ items: [{ id: "yt-0", statistics: { viewCount: "8", likeCount: "3", commentCount: "1" } }] }), { status: 200 });
    }));
    const ids = Array.from({ length: 51 }, (_, index) => `yt-${index}`);

    const result = await fetchYouTubeMetrics({ token: "yt-token" }, ids);

    expect(result.ok).toBe(true);
    expect(result.metrics?.["yt-0"]).toEqual({ views: 8, likes: 3, replies: 1 });
    expect(result.attemptedIds).toHaveLength(50);
    expect(result.failedIds).toEqual(["yt-50"]);
    expect(result.failures).toContainEqual({ ids: ["yt-50"], status: 503, code: "youtube_503" });
  });

  it("OSMU-017 경계값: Meta의 429와 예외를 권한 부족으로 바꾸지 않고 게시물별로 보존한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("post-ok")) return new Response(JSON.stringify({ data: [{ name: "impressions", values: [{ value: 12 }] }] }), { status: 200 });
      if (url.includes("post-limit")) return new Response("한도", { status: 429 });
      throw new Error("연결 끊김");
    }));

    const result = await fetchMetaPostMetrics(
      { token: "ig-token" },
      "instagram",
      ["post-ok", "post-limit", "post-timeout"],
    );

    expect(result.ok).toBe(true);
    expect(result.metrics?.["post-ok"]?.views).toBe(12);
    expect(result.failedIds).toEqual(["post-limit", "post-timeout"]);
    expect(result.failures).toEqual([
      { id: "post-limit", status: 429, code: "provider_429" },
      { id: "post-timeout", code: "exception" },
    ]);
  });

  it("OSMU-017 거절 경로: Meta 전건 503은 성공으로 보고하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("장애", { status: 503 })));

    const result = await fetchMetaPostMetrics({ token: "ig-token" }, "instagram", ["post-1", "post-2"]);

    expect(result.ok).toBe(false);
    expect(result.failedIds).toEqual(["post-1", "post-2"]);
    expect(result.failures?.every((failure) => failure.code === "provider_503")).toBe(true);
  });
});
