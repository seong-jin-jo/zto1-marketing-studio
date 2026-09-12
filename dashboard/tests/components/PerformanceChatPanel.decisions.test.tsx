// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerformanceChatPanel } from "@/components/home/PerformanceChatPanel";
import type { PerformancePost } from "@/components/home/PerformanceRoom";

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  mutate: vi.fn(),
  decisions: [] as Array<Record<string, unknown>>,
}));

vi.mock("swr", () => ({
  default: () => ({ data: { rules: [], decisions: mocks.decisions }, mutate: mocks.mutate }),
}));

vi.mock("@/lib/api", () => ({
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
  apiDelete: vi.fn(async () => ({ ok: true })),
  fetcher: vi.fn(),
}));

const POSTS: PerformancePost[] = [1500, 1200, 1000, 200, 150, 100].map((views, index) => ({
  id: `post-${index}`,
  platform: "threads",
  text: index < 3 ? `왜 잘 됐을까요 ${index}?` : `평범한 글 ${index}`,
  status: "published",
  published_at: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
  views,
}));

describe("FE-L5-HISTORY 학습 후보 판단 연결", () => {
  beforeEach(() => {
    mocks.apiPost.mockReset().mockResolvedValue({ ok: true });
    mocks.mutate.mockReset().mockResolvedValue(undefined);
    mocks.decisions = [];
  });

  afterEach(cleanup);

  it("FE-L5-HISTORY-01 정상 경로: 배우기는 표본과 기간을 포함한 수락 판단을 API에 보낸다", async () => {
    render(<PerformanceChatPanel workspaceId="workspace-1" posts={POSTS} focus="all" expandedByDefault />);

    fireEvent.click(screen.getByRole("button", { name: "이거 왜 잘 됐어" }));
    fireEvent.click(await screen.findByRole("button", { name: "배우기" }));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/performance/learned-rules",
      expect.objectContaining({
        tenant_id: "workspace-1",
        decision: "accepted",
        sampleCount: 6,
        observedFrom: "2026-08-01T10:00:00.000Z",
        observedTo: "2026-08-06T10:00:00.000Z",
      }),
    ));
    expect(await screen.findByText("배웠습니다. 다음 생성부터 이 규칙을 참고합니다.")).toBeInTheDocument();
  });

  it("FE-L5-HISTORY-02 거절 경로: 배우지 않기는 후보를 버리지 않고 거절 판단으로 저장한다", async () => {
    mocks.decisions = [{
      id: "decision-old",
      decision: "rejected",
      text: "짧은 글이 긴 글보다 잘 갑니다.",
      sourceLabel: "조회 6편을 비교해 상위 3편에서 뽑음",
      sampleCount: 6,
      observedFrom: "2026-08-01T10:00:00.000Z",
      observedTo: "2026-08-06T10:00:00.000Z",
      decidedAt: "2026-09-12T10:00:00.000Z",
    }];
    render(<PerformanceChatPanel workspaceId="workspace-1" posts={POSTS} focus="all" expandedByDefault />);

    // 상세는 별도 창이 소유한다(DESIGN.md:159·160). 본문에는 진입만 남는다.
    expect(screen.getByRole("button", { name: "학습 정보에서 보기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "학습 정보에서 보기" }));
    expect(screen.getByText(/안 함: 짧은 글이 긴 글보다 잘 갑니다/)).toBeInTheDocument();
    expect(screen.getByText(/표본 6건/)).toBeInTheDocument();
    expect(screen.getByText(/작업 공간의 다음 생성/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    fireEvent.click(screen.getByRole("button", { name: "이거 왜 잘 됐어" }));
    fireEvent.click(await screen.findByRole("button", { name: "배우지 않기" }));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/performance/learned-rules",
      expect.objectContaining({ decision: "rejected", candidateId: expect.stringMatching(/^candidate_/) }),
    ));
    expect(await screen.findByText("배우지 않기로 남겼습니다. 다음 생성에는 쓰지 않습니다.")).toBeInTheDocument();
  });
});
