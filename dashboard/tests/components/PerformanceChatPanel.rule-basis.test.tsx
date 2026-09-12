// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerformanceChatPanel } from "@/components/home/PerformanceChatPanel";
import type { PerformancePost } from "@/components/home/PerformanceRoom";

// 2026-09-12 감사 MAJOR 두 건의 재현 절차.
//  - 결정 전 근거 미표시: 버튼을 누르기 전 표본·관찰 기간·적용 범위·한계를 볼 수 없었다.
//  - 학습 상세 소유권 역전: 최근 판단 상세가 성과실 패널에 상주했다(DESIGN.md:159·160 위반).

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  mutate: vi.fn(),
  decisions: [] as Array<Record<string, unknown>>,
}));

vi.mock("swr", () => ({
  default: () => ({ data: { rules: [], decisions: mocks.decisions }, mutate: mocks.mutate }),
}));

vi.mock("@/lib/api", () => ({
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
  apiDelete: (...args: unknown[]) => mocks.apiDelete(...args),
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

const DECISION = {
  id: "decision-1",
  decision: "accepted" as const,
  text: "짧은 글이 긴 글보다 잘 갑니다.",
  sourceLabel: "조회 6편을 비교해 상위 3편에서 뽑음",
  sampleCount: 6,
  observedFrom: "2026-08-01T10:00:00.000Z",
  observedTo: "2026-08-06T10:00:00.000Z",
  decidedAt: "2026-09-12T10:00:00.000Z",
};

describe("FE-L5-BASIS 결정 전 근거 표시와 학습 상세 소유권", () => {
  beforeEach(() => {
    mocks.apiPost.mockReset().mockResolvedValue({ ok: true });
    mocks.apiDelete.mockReset().mockResolvedValue({ ok: true });
    mocks.mutate.mockReset().mockResolvedValue(undefined);
    mocks.decisions = [];
  });

  afterEach(cleanup);

  it("FE-L5-BASIS-01 정상 경로: 배우기를 누르기 전에 표본·관찰 기간·적용 범위·한계가 같이 보인다", async () => {
    render(<PerformanceChatPanel workspaceId="workspace-1" posts={POSTS} focus="all" expandedByDefault />);
    fireEvent.click(screen.getByRole("button", { name: "이거 왜 잘 됐어" }));

    const basis = await screen.findByText(/^근거: 표본 /);
    expect(basis).toBeInTheDocument();
    expect(basis.textContent).toContain("표본 6건 중 상위 3편");
    expect(basis.textContent).toContain("8월 1일부터 8월 6일까지");
    expect(basis.textContent).toContain("적용 범위 이 작업 공간의 다음 생성");
    expect(screen.getByRole("button", { name: "배우기" })).toBeInTheDocument();
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it("FE-L5-BASIS-02 경계: 표본이 기준에 못 미치면 근거가 약하다고 먼저 밝힌다", async () => {
    render(<PerformanceChatPanel workspaceId="workspace-1" posts={POSTS} focus="all" expandedByDefault />);
    fireEvent.click(screen.getByRole("button", { name: "이거 왜 잘 됐어" }));

    const basis = await screen.findByText(/^근거: 표본 /);
    expect(basis.textContent).toContain("한계: 표본이 10건에 못 미쳐 근거가 약합니다");
  });

  it("FE-L5-BASIS-03 실패 경로: 판단 저장이 실패하면 실패를 말하고 되돌리기 안내를 준다", async () => {
    // Codex 교차 리뷰 MAJOR 3 과 감사 MINOR. 409·500·네트워크 실패를 삼키지 않는다.
    mocks.apiPost.mockRejectedValue(new Error("conflict"));
    render(<PerformanceChatPanel workspaceId="workspace-1" posts={POSTS} focus="all" expandedByDefault />);
    fireEvent.click(screen.getByRole("button", { name: "이거 왜 잘 됐어" }));
    fireEvent.click(await screen.findByRole("button", { name: "배우기" }));

    expect(await screen.findByText(/지금은 판단을 저장하지 못했습니다/)).toBeInTheDocument();
  });

  it("FE-L5-OWN-01 성과실 본문에는 판단 상세가 상주하지 않고 진입만 남는다", () => {
    mocks.decisions = [DECISION];
    render(<PerformanceChatPanel workspaceId="workspace-1" posts={POSTS} focus="all" expandedByDefault />);

    expect(screen.getByText("최근 판단 1건을 학습 정보에 남겼습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "학습 정보에서 보기" })).toBeInTheDocument();
    expect(screen.queryByText(/반영: 짧은 글이 긴 글보다 잘 갑니다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/표본 6건 · 8월 1일부터/)).not.toBeInTheDocument();
  });

  it("FE-L5-OWN-02 학습 정보 별도 창이 상세를 소유하고 되돌리기를 제공한다", async () => {
    mocks.decisions = [DECISION];
    render(<PerformanceChatPanel workspaceId="workspace-1" posts={POSTS} focus="all" expandedByDefault />);
    fireEvent.click(screen.getByRole("button", { name: "학습 정보에서 보기" }));

    const dialog = screen.getByRole("dialog", { name: "학습 정보 상세" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/반영: 짧은 글이 긴 글보다 잘 갑니다/)).toBeInTheDocument();
    expect(screen.getByText(/표본 6건 · 8월 1일부터 8월 6일까지 · 작업 공간의 다음 생성/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith(
      "/api/performance/learned-rules?tenant_id=workspace-1&decisionId=decision-1",
    ));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
  });

  it("FE-L5-OWN-03 되돌리기가 실패하면 실패를 말하고 상세는 남는다", async () => {
    mocks.decisions = [DECISION];
    mocks.apiDelete.mockRejectedValue(new Error("network"));
    render(<PerformanceChatPanel workspaceId="workspace-1" posts={POSTS} focus="all" expandedByDefault />);
    fireEvent.click(screen.getByRole("button", { name: "학습 정보에서 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("되돌리지 못했습니다");
    expect(screen.getByText(/반영: 짧은 글이 긴 글보다 잘 갑니다/)).toBeInTheDocument();
  });
});
