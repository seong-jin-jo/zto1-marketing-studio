// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerformanceRoom } from "@/components/home/PerformanceRoom";

// Regression: FLOW-UI-METRICS-V14. 1024 전용 성과실에서 4열 지표 숫자가 한 자리씩 줄바꿈됨
// Found by /qa on 2026-09-15
// Report: docs/qa/qa-tracker.md

vi.mock("@/lib/api", () => ({
  fetcher: vi.fn(() => new Promise(() => {})),
  apiPost: vi.fn(() => new Promise(() => {})),
  ApiResponseError: class ApiResponseError extends Error {},
}));

const props = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  workspaceName: "검증 작업 공간",
  metricsLoaded: true,
  posts: [],
  publishedCount: 0,
  followers: "0",
  engagementRate: 0,
  queuedCount: 0,
  viralCount: 0,
  collecting: false,
  onCollectMetrics: vi.fn(async () => undefined),
};

describe("FLOW-UI-METRICS-V14 성과실 지표 반응형 회귀", () => {
  afterEach(() => cleanup());

  it("전용 성과실은 1024 구간을 2열로 유지하고 넓은 화면에서만 4열이 된다", () => {
    const { container } = render(<PerformanceRoom {...props} dedicated />);
    const metrics = container.querySelector('[data-perf-tier="core"]');

    expect(metrics).toHaveClass("grid-cols-2", "xl:grid-cols-4");
    expect(metrics).not.toHaveClass("lg:grid-cols-4");
  });

  it("담당 패널이 없는 임베디드 성과판은 기존 1024 4열을 유지한다", () => {
    const { container } = render(<PerformanceRoom {...props} />);
    const metrics = container.querySelector('[data-perf-tier="core"]');

    expect(metrics).toHaveClass("grid-cols-2", "lg:grid-cols-4");
    expect(metrics).not.toHaveClass("xl:grid-cols-4");
  });
});
