// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GettingStartedStrip } from "@/components/shared/GettingStartedStrip";

const mocks = vi.hoisted(() => ({
  channels: {} as Record<string, Record<string, unknown>>,
  checklist: { created: true, wiki: false, channel: false, published: false, analytics: false },
}));

vi.mock("@/hooks/useChannelConfig", () => ({ useChannelConfig: () => ({ data: mocks.channels }) }));
vi.mock("@/hooks/useOnboarding", () => ({ useOnboardingStatus: () => ({ data: { checklist: mocks.checklist } }) }));

afterEach(() => {
  cleanup();
  mocks.channels = {};
});

describe("V70-START 시작 스트립 계약", () => {
  it("V70-START-01 정상: 중복 배너 대신 진행도와 채널 연결 수를 한 줄에서 안내한다", () => {
    render(<GettingStartedStrip />);

    expect(screen.getByText("시작 1/5")).toBeInTheDocument();
    expect(screen.getByText(/채널 연결 0\/15/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "채널 연결하기" })).toHaveAttribute("href", "/settings?tab=channels");
  });

  it("V70-START-02 정상: 전체 보기는 기존 다섯 단계 기능을 펼쳐 보존한다", () => {
    render(<GettingStartedStrip />);

    fireEvent.click(screen.getByRole("button", { name: "전체 보기" }));
    expect(screen.getByText("완료 · 첫 콘텐츠 만들기")).toBeInTheDocument();
    expect(screen.getByText("할 일 · 성과 확인")).toBeInTheDocument();
  });

  it("V70-START-03 거절: 연결된 채널이 있으면 시작 전용 스트립을 계속 노출하지 않는다", () => {
    mocks.channels = { threads: { connected: true } };

    render(<GettingStartedStrip />);

    expect(document.querySelector("[data-start-strip]")).not.toBeInTheDocument();
  });
});
