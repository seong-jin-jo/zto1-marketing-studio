// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InboxPage from "@/app/inbox/page";
import CalendarPage from "@/app/calendar/page";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
  apiPost: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("swr", () => ({ default: (...args: unknown[]) => mocks.swr(...args) }));
vi.mock("@/lib/api", () => ({
  fetcher: vi.fn(),
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
  isAuthRequiredError: (error: unknown) => error instanceof Error && error.name === "AuthRequiredError",
}));
vi.mock("@/components/layout/Toast", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

const returnContext = (sourceRoute: "inbox" | "calendar") => ({
  sourceRoute,
  queuePostId: "queue-1",
  draftId: "draft-1",
  returnUrl: `/studio?room=publish&queue_id=queue-1&from=${sourceRoute}&draft_id=draft-1`,
});

describe("FE-V63-RETURN-03 인박스와 캘린더 발행실 복귀 링크", () => {
  beforeEach(() => {
    mocks.swr.mockReset();
    mocks.apiPost.mockReset();
    mocks.showToast.mockReset();
  });

  afterEach(() => cleanup());

  it("정상 경로: 인박스 작업물에서 발행실 복귀 URL을 연다", () => {
    mocks.swr.mockImplementation((key: string) => {
      if (key === "/api/queue?status=draft&returnTo=inbox") return {
        data: { posts: [{ id: "queue-1", text: "검토 본문", status: "draft", publishContext: returnContext("inbox") }] },
        mutate: vi.fn(),
        isLoading: false,
      };
      return { data: undefined, mutate: vi.fn(), isLoading: false };
    });

    render(<InboxPage />);

    expect(screen.getByRole("link", { name: "발행실로 돌아가기" })).toHaveAttribute(
      "href",
      "/studio?room=publish&queue_id=queue-1&from=inbox&draft_id=draft-1",
    );
  });

  it("정상 경로: 캘린더의 선택 작업물에서 발행실 복귀 URL을 연다", () => {
    const now = new Date();
    const scheduledAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).toISOString();
    mocks.swr.mockImplementation((key: string) => key === "/api/queue?status=all&returnTo=calendar"
      ? { data: { posts: [{ id: "queue-1", text: "예약 본문", status: "scheduled", scheduledAt, publishContext: returnContext("calendar") }] } }
      : { data: undefined });

    render(<CalendarPage />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${now.getDate()} 예약 본문`) }));

    expect(screen.getByRole("link", { name: "발행실로 돌아가기" })).toHaveAttribute(
      "href",
      "/studio?room=publish&queue_id=queue-1&from=calendar&draft_id=draft-1",
    );
  });

  it("거절 경로: 복귀 컨텍스트가 없는 레거시 작업물에는 거짓 단추를 만들지 않는다", () => {
    mocks.swr.mockImplementation((key: string) => key === "/api/queue?status=draft&returnTo=inbox"
      ? { data: { posts: [{ id: "legacy", text: "레거시 본문", status: "draft" }] }, mutate: vi.fn(), isLoading: false }
      : { data: undefined, mutate: vi.fn(), isLoading: false });

    render(<InboxPage />);

    expect(screen.queryByRole("link", { name: "발행실로 돌아가기" })).not.toBeInTheDocument();
  });
});
