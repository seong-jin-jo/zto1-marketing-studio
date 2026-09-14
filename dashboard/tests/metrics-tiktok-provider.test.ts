import { describe, expect, it, vi } from "vitest";

import { fetchTikTokVideoMetrics } from "@/lib/tiktok";

describe("TikTok Display API 성과 수집 계약", () => {
  it("METRICS-TIKTOK-PROVIDER-01 정상·경계: 21개 영상은 20개씩 나눠 네 성과 축으로 변환한다", async () => {
    const ids = Array.from({ length: 21 }, (_, index) => `video-${index + 1}`);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { filters: { video_ids: string[] } };
      return new Response(JSON.stringify({
        data: {
          videos: body.filters.video_ids.map((id, index) => ({
            id,
            view_count: index + 100,
            like_count: index + 10,
            comment_count: index + 2,
            share_count: index + 1,
          })),
        },
        error: { code: "ok" },
      }), { status: 200 });
    });

    const result = await fetchTikTokVideoMetrics("test-token", ids, fetchMock);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.metrics["video-1"]).toEqual({ views: 100, likes: 10, replies: 2, reposts: 1 });
    expect(result.metrics["video-21"]).toEqual({ views: 100, likes: 10, replies: 2, reposts: 1 });
    const firstRequest = fetchMock.mock.calls[0]?.[1];
    expect(firstRequest?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer test-token" }));
  });

  it("METRICS-TIKTOK-PROVIDER-02 거절: 연결 토큰이 없으면 제공자를 호출하지 않는다", async () => {
    const fetchMock = vi.fn();

    const result = await fetchTikTokVideoMetrics("", ["video-1"], fetchMock);

    expect(result).toEqual(expect.objectContaining({ ok: false, error: "TikTok 연결이 없습니다." }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
