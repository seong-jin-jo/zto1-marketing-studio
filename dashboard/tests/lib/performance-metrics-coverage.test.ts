import { describe, expect, it } from "vitest";

import { buildPerformanceMetricsCoverage } from "@/lib/performance-metrics-coverage";

describe("플랫폼별 성과 수집 범위 계약", () => {
  it("METRICS-COVERAGE-UNIT-01 정상: 일곱 발행 대상의 실제 수집 범위와 결측 이유를 한 계약으로 만든다", () => {
    const coverage = buildPerformanceMetricsCoverage([
      {
        platform: "threads",
        published_count: 3,
        collected_count: 2,
        last_collected_at: "2026-08-29T01:00:00.000Z",
      },
      {
        platform: "instagram_reels",
        published_count: 1,
        collected_count: 0,
        last_collected_at: null,
      },
    ]);

    expect(coverage.version).toBe("v1");
    expect(coverage.platforms).toHaveLength(7);
    expect(coverage.platforms.find((item) => item.platform === "threads")).toEqual(expect.objectContaining({
      collectionSupported: true,
      publishedCount: 3,
      collectedCount: 2,
      missingCount: 1,
      missingReason: expect.objectContaining({ code: "PARTIAL_COLLECTION" }),
    }));
    expect(coverage.platforms.find((item) => item.platform === "reels")).toEqual(expect.objectContaining({
      collectionSupported: true,
      collector: "instagram_media_insights",
      metrics: ["views", "likes", "replies"],
      publishedCount: 1,
      missingReason: expect.objectContaining({ code: "NOT_COLLECTED_YET" }),
    }));
  });

  it("METRICS-COVERAGE-UNIT-02 거절: 수집 건수가 발행 건수보다 큰 모순된 집계를 거절한다", () => {
    expect(() => buildPerformanceMetricsCoverage([{
      platform: "threads",
      published_count: 1,
      collected_count: 2,
      last_collected_at: null,
    }])).toThrow(/collected_count/);
  });
});
