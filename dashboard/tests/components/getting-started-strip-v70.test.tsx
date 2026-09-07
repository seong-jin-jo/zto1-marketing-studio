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

  // 2026-09-08 개정. 종전 V70-START-03 은 "연결된 채널이 있으면 스트립을 감춘다" 였다.
  // 취지는 중복 배너 제거였는데, 확인해 보니 연결 뒤 그 자리를 대신하는 안내가 하나도 없었다
  // (OnboardingChecklist 는 어디에도 렌더되지 않는다). 다섯 칸 중 채널 연결은 세 번째라,
  // 첫 발행도 성과 확인도 안 한 사람이 채널 하나 붙였다는 이유로 길잡이를 잃고 있었다.
  // 처음 온 사람이 첫 발행까지 가는 것이 이 제품의 첫 관문이므로 그 관문을 다 지날 때까지
  // 남긴다. 중복 걱정은 대체 배너가 없다는 사실로 해소된다.
  it("V70-START-03 개정: 채널을 연결해도 남은 칸이 있으면 계속 안내한다", () => {
    mocks.channels = { threads: { connected: true } };
    mocks.checklist = { created: true, wiki: true, channel: true, published: false, analytics: false };

    render(<GettingStartedStrip />);

    expect(document.querySelector("[data-start-strip]")).toBeInTheDocument();
  });

  it("V70-START-04 정상: 다섯 칸을 다 채우면 접는다", () => {
    mocks.channels = { threads: { connected: true } };
    mocks.checklist = { created: true, wiki: true, channel: true, published: true, analytics: true };

    render(<GettingStartedStrip />);

    expect(document.querySelector("[data-start-strip]")).not.toBeInTheDocument();
  });
});
