// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateRoom } from "@/components/studio/StudioRooms";

const props = {
  workspaceId: "workspace-learning-purpose",
  workspaceName: "작업 공간",
  guide: "",
  topic: "",
  onTopicChange: vi.fn(),
  onOpenLearning: vi.fn(),
  onCandidateSelect: vi.fn(),
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("dashboard_auth_token", "customer-token");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("생성실 목적 학습 정보", () => {
  it("목적 카드를 고르면 작업 공간 학습 정본에 저장한다", async () => {
    const onLearningInfoChange = vi.fn();
    render(<CreateRoom {...props} onLearningInfoChange={onLearningInfoChange} />);

    fireEvent.click(screen.getByRole("button", { name: "영상" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "문의 늘리기" }));

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem("studio_learning:workspace-learning-purpose") || "{}"))
        .toMatchObject({ purpose: "문의 늘리기. 예: 관심 있는 고객이 상담이나 문의를 시작하게 합니다." });
    });
    expect(onLearningInfoChange).toHaveBeenLastCalledWith(expect.objectContaining({
      purpose: "문의 늘리기. 예: 관심 있는 고객이 상담이나 문의를 시작하게 합니다.",
    }));
  });

  it("이미 저장된 목적은 새 생성실에서 다시 선택된 기준으로 복원한다", async () => {
    localStorage.setItem("studio_learning:workspace-learning-purpose", JSON.stringify({
      industry: "동네 가게. 예: 가까운 손님이 걸어와 이용하는 곳",
      purpose: "문의 늘리기. 예: 관심 있는 고객이 상담이나 문의를 시작하게 합니다.",
    }));

    render(<CreateRoom {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "영상" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "문의 늘리기" })).toHaveAttribute("aria-pressed", "true");
    });
  });
});
