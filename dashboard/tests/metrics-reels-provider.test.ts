import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchMetaPostMetrics, fetchXPublicMetrics, fetchYouTubeMetrics } from "@/lib/publish";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Instagram Reels Media Insights provider 계약", () => {
  it("METRICS-REELS-PROVIDER-01 정상: Reels Media ID에 views 지표를 요청하고 화면 공통 수치로 변환한다", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({
      data: [
        { name: "views", values: [{ value: 120 }] },
        { name: "likes", values: [{ value: 14 }] },
        { name: "comments", values: [{ value: 3 }] },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMetaPostMetrics(
      { token: "test-token", userId: "ig-user" },
      "instagram_reels",
      ["ig-media-1"],
    );

    expect(result).toEqual({
      ok: true,
      metrics: { "ig-media-1": { views: 120, likes: 14, replies: 3 } },
      attemptedIds: ["ig-media-1"],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/ig-media-1/insights?metric=views,likes,comments",
    );
  });

  it("METRICS-REELS-PROVIDER-02 거절: Instagram 토큰이 없으면 provider를 호출하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMetaPostMetrics(
      { token: "", userId: "ig-user" },
      "instagram_reels",
      ["ig-media-1"],
    );

    expect(result).toEqual(expect.objectContaining({ ok: false }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("항목 16 정상: X 101건과 YouTube 51건을 자르지 않고 전부 분할 조회한다", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes("youtube")
        ? new Response(JSON.stringify({ items: [] }), { status: 200 })
        : new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const xIds = Array.from({ length: 101 }, (_, index) => `x-${index}`);
    const youtubeIds = Array.from({ length: 51 }, (_, index) => `yt-${index}`);
    const x = await fetchXPublicMetrics({ token: "x-token" }, xIds);
    const youtube = await fetchYouTubeMetrics({ token: "yt-token" }, youtubeIds);

    expect(x.ok && x.attemptedIds).toHaveLength(101);
    expect(youtube.ok && youtube.attemptedIds).toHaveLength(51);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("항목 17 정상: Facebook 반응 유형 객체를 합산한 숫자로 반환한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [
        { name: "post_impressions", values: [{ value: 20 }] },
        { name: "post_reactions_by_type_total", values: [{ value: { like: 2, love: 1 } }] },
      ],
    }), { status: 200 })));

    const result = await fetchMetaPostMetrics(
      { token: "fb-token", userId: "page" },
      "facebook",
      ["post-1"],
    );

    expect(result.ok && result.metrics["post-1"].likes).toBe(3);
  });
});
