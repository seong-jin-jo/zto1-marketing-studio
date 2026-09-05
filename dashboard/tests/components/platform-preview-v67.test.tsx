// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlatformPreview, type PreviewInlineEditor } from "@/components/studio/PlatformPreview";

function editor(overrides: Partial<PreviewInlineEditor> = {}): PreviewInlineEditor {
  return {
    account: { status: "connected", displayName: "운영 계정", username: "operator" },
    title: "",
    caption: "정상 본문",
    hashtags: "",
    topicTag: "",
    firstComment: "",
    firstCommentSupported: true,
    onTitleChange: vi.fn(),
    onCaptionChange: vi.fn(),
    onHashtagsChange: vi.fn(),
    onTopicTagChange: vi.fn(),
    onFirstCommentChange: vi.fn(),
    ...overrides,
  };
}

describe("PUB-ACCOUNT-01 연결 계정 읽기 전용 표시", () => {
  it("정상: 연결 계정의 표시 이름과 사용자명을 보여 주되 편집 입력은 만들지 않는다", () => {
    render(<PlatformPreview platform="threads" text={{ threads: "정상 본문" }} media={{}} editor={editor()} />);

    expect(screen.getByTestId("preview-account-threads")).toHaveAttribute("data-account-state", "connected");
    expect(screen.getByText("운영 계정")).toBeInTheDocument();
    expect(screen.getByText("@operator")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "threads 표시 이름" })).not.toBeInTheDocument();
  });

  it("거절: 계정 조회 오류를 가짜 계정 이름으로 대신하지 않는다", () => {
    render(<PlatformPreview platform="threads" text={{ threads: "정상 본문" }} media={{}} editor={editor({ account: { status: "error" } })} />);

    expect(screen.getByTestId("preview-account-threads")).toHaveAttribute("data-account-state", "error");
    expect(screen.getByText("연결 계정을 확인하지 못했습니다")).toBeInTheDocument();
    expect(screen.queryByText("운영 계정")).not.toBeInTheDocument();
  });

  it("경계: 계정 확인 중에는 게시 필드를 잠그고 미연결 상태는 별도로 밝힌다", () => {
    const { rerender } = render(
      <PlatformPreview platform="threads" text={{ threads: "정상 본문" }} media={{}} editor={editor({ account: { status: "loading" } })} />,
    );

    expect(screen.getByTestId("preview-account-threads")).toHaveAttribute("data-account-state", "loading");
    expect(screen.getByText("연결 계정 확인 중")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "threads 캡션" })).toBeDisabled();

    rerender(<PlatformPreview platform="threads" text={{ threads: "정상 본문" }} media={{}} editor={editor({ account: { status: "missing" } })} />);
    expect(screen.getByTestId("preview-account-threads")).toHaveAttribute("data-account-state", "missing");
    expect(screen.getByText("연결된 계정이 없습니다")).toBeInTheDocument();
  });
});

describe("PUB-LIMIT-UI-01 발행 전 하드 한도", () => {
  it("거절: Threads 501자는 미리보기 입력 바로 아래에서 차단 사유를 보여 준다", () => {
    render(<PlatformPreview platform="threads" text={{ threads: "가".repeat(501) }} media={{}} editor={editor({ caption: "가".repeat(501) })} />);

    expect(screen.getByRole("alert")).toHaveTextContent("본문이 500자를 초과했습니다");
  });
});

describe("V70-PREVIEW 채널 이름과 카운터 배치", () => {
  it("V70-PREVIEW-01 정상: Threads 전체 이름을 말줄임 없이 두고 글자 수를 별도 표시한다", () => {
    render(<PlatformPreview platform="threads" text={{ threads: "정상 본문" }} media={{}} editor={editor()} />);

    const label = screen.getByText("Threads");
    expect(label).toHaveClass("whitespace-nowrap");
    expect(label).not.toHaveClass("truncate");
    expect(screen.getByTestId("character-count-threads")).toHaveTextContent("5/500");
  });
});
