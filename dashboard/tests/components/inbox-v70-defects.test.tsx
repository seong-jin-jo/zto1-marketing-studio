// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InboxPage from "@/app/inbox/page";

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

function queue(posts: Array<{
  id: string;
  title?: string | null;
  text?: string | null;
  topic?: string;
  hashtags?: string[];
  channels?: Record<string, unknown>;
}>) {
  mocks.swr.mockImplementation((key: string) => key === "/api/queue?status=draft&returnTo=inbox"
    ? { data: { posts }, mutate: vi.fn(), isLoading: false }
    : { data: undefined, mutate: vi.fn(), isLoading: false });
}

describe("V70-INBOX 승인 인박스 안전 계약", () => {
  beforeEach(() => {
    mocks.swr.mockReset();
    mocks.apiPost.mockReset();
    mocks.showToast.mockReset();
  });

  afterEach(cleanup);

  it("V73-INBOX-01 정상: title 없이 text만 오면 본문 영역에 표시하고 빈 제목 자리를 만들지 않는다", () => {
    queue([{ id: "draft-1", text: "QA 운영 브라우저 재검증: 다음 주 콘텐츠 계획", topic: "일반 콘텐츠" }]);

    const { container } = render(<InboxPage />);

    const body = container.querySelector("[data-review-body]");
    expect(body).toHaveTextContent("QA 운영 브라우저 재검증: 다음 주 콘텐츠 계획");
    expect(body).toHaveClass("min-h-control-touch");
    expect(container.querySelector("[data-review-title]")).not.toBeInTheDocument();
    expect(container.querySelector("[data-review-content] h3:empty")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "승인" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "거절" })).toBeEnabled();
  });

  it("V73-INBOX-02 거절: 공백 본문은 승인과 거절 단추 및 A·R 단축키 요청을 모두 막는다", () => {
    queue([{ id: "draft-empty", text: "  \n\t  ", topic: "studio-handoff" }]);

    render(<InboxPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("본문을 불러오지 못했습니다");
    expect(screen.getByRole("button", { name: "승인" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "거절" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "A" });
    fireEvent.keyDown(window, { key: "R" });
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it("V70-INBOX-03 거절: 제목 필드가 있으면 공백 제목을 승인하지 않는다", () => {
    queue([{ id: "draft-title-empty", title: " \n ", text: "검토할 본문" }]);

    render(<InboxPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("제목을 불러오지 못했습니다");
    expect(screen.getByText("검토할 본문")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "승인" })).toBeDisabled();
  });

  it("V70-INBOX-04 정상: 제목과 본문을 공백 정리 뒤 표시하고 승인할 수 있다", () => {
    queue([{ id: "draft-title", title: "  검토 제목  ", text: "  검토 본문  " }]);

    render(<InboxPage />);

    expect(screen.getByRole("heading", { name: "검토 제목" })).toBeInTheDocument();
    expect(screen.getByText("검토 본문")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "승인" })).toBeEnabled();
  });

  it("V70-INBOX-05 정상: 내부 식별자와 중복 단축키를 고객 화면에 노출하지 않는다", () => {
    queue([{ id: "draft-2", text: "검토 본문", topic: "studio-handoff" }]);

    render(<InboxPage />);

    expect(screen.getByText("콘텐츠 작업실에서 보냄")).toBeInTheDocument();
    expect(screen.queryByText("studio-handoff")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "승인" })).toHaveTextContent(/^승인$/);
    expect(screen.getByText(/단축키: A 승인/)).toBeInTheDocument();
  });

  it("V70-INBOX-06 정상: 제품 연결 제목을 고객이 이해할 수 있는 말로 표시한다", () => {
    queue([]);

    render(<InboxPage />);

    expect(screen.getByRole("button", { name: /제품 내용 연결/ })).toBeInTheDocument();
    expect(screen.queryByText(/저장소 기반 생성/)).not.toBeInTheDocument();
  });

  it("V70-INBOX-07 거절: 공백 주제와 해시태그와 채널 이름은 빈 판단값으로 노출하지 않는다", () => {
    queue([{
      id: "draft-metadata-empty",
      text: "검토 본문",
      topic: " \n ",
      hashtags: [" ", "유효태그"],
      channels: { " ": {}, threads: {} },
    }]);

    render(<InboxPage />);

    expect(screen.getByText("일반 콘텐츠")).toBeInTheDocument();
    expect(screen.getByText("#유효태그")).toBeInTheDocument();
    expect(screen.getByText("threads")).toBeInTheDocument();
    expect(screen.queryByText(/^#\s*$/)).not.toBeInTheDocument();
  });

  it("V71-AUTH-01 거절: 목록 조회가 401로 실패하면 안내와 로그인 경로를 보이고 승인과 거절을 막는다", () => {
    const authError = Object.assign(new Error("Authentication required"), { name: "AuthRequiredError" });
    mocks.swr.mockImplementation((key: string) => key === "/api/queue?status=draft&returnTo=inbox"
      ? {
          data: { posts: [{ id: "stale-draft", title: "남아 있던 제목", text: "남아 있던 본문" }] },
          error: authError,
          mutate: vi.fn(),
          isLoading: false,
        }
      : { data: undefined, mutate: vi.fn(), isLoading: false });

    render(<InboxPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("로그인 상태가 만료되었습니다");
    expect(screen.getByRole("link", { name: "로그인 화면으로 이동" })).toHaveAttribute("href", "/login?returnTo=%2Finbox");
    expect(screen.getByRole("button", { name: "승인" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "거절" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "A" });
    fireEvent.keyDown(window, { key: "R" });
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it("V71-AUTH-02 거절: 목록 조회가 일반 오류로 실패해도 빈 목록으로 속이지 않고 행동을 막는다", () => {
    mocks.swr.mockImplementation((key: string) => key === "/api/queue?status=draft&returnTo=inbox"
      ? { data: undefined, error: new Error("API error: 500"), mutate: vi.fn(), isLoading: false }
      : { data: undefined, mutate: vi.fn(), isLoading: false });

    render(<InboxPage />);

    expect(screen.getByRole("alert")).toHaveTextContent("검토할 초안을 불러오지 못했습니다");
    expect(screen.getByRole("button", { name: "다시 불러오기" })).toBeInTheDocument();
    expect(screen.queryByText("검토할 초안이 없습니다")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI로 한 주치 초안 생성" })).not.toBeInTheDocument();
  });
});
