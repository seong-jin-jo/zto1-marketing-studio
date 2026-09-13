// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiPost: vi.fn(), showToast: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiPost: mocks.apiPost }));
vi.mock("@/components/layout/Toast", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("@/components/shared/ConfirmHost", () => ({ confirmAction: vi.fn(async () => true) }));
vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({
    editingPost: null,
    setEditingPost: vi.fn(),
    selectedIds: new Set<string>(),
    toggleSelect: vi.fn(),
    activeWorkspace: { id: "tenant-a" },
  }),
}));

import { UnifiedPostCard } from "@/components/queue/UnifiedPostCard";

const post = {
  id: "post-1",
  text: "예약 글",
  status: "approved",
  createdAt: new Date().toISOString(),
  channels: { threads: { status: "pending", publishedAt: null, error: null } },
} as const;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("취소 응답 표시 검수 회귀", () => {
  it("항목 9 정상: DB 동기화 지연을 완전 중지 성공으로 표시하지 않는다", async () => {
    mocks.apiPost.mockResolvedValue({ persistence: { db: "deferred" } });
    render(<UnifiedPostCard post={post as never} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "발행 중지" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      expect.stringContaining("저장소 동기화를 기다리고"),
      "error",
    ));
    expect(mocks.showToast).not.toHaveBeenCalledWith("발행 중지됨", "success");
  });

  it("항목 9 정상: 부분 발행 채널을 사용자에게 그대로 알린다", async () => {
    mocks.apiPost.mockResolvedValue({
      persistence: { db: "ok" },
      partiallyPublished: true,
      alreadyPublishedChannels: ["threads"],
    });
    render(<UnifiedPostCard post={post as never} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "발행 중지" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      expect.stringContaining("이미 올라간 채널: threads"),
      "error",
    ));
  });
});
