import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchMetaPostMetrics } from "@/lib/publish";

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
});
