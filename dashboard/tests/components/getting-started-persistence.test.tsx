// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GettingStartedStrip } from "@/components/shared/GettingStartedStrip";

// 2026-09-08 감사 후속.
// 종전에는 채널이 하나라도 연결되면 시작 안내가 통째로 사라졌다. 그런데 다섯 칸 중 채널
// 연결은 세 번째다. 첫 발행도 성과 확인도 아직인 사람이 채널 하나 붙였다는 이유로 길잡이를
// 잃었다. 처음 온 사람이 첫 발행까지 가는 것이 이 제품의 첫 관문인데, 그 한복판에서
// 안내가 사라지는 셈이다.
// 계약: 다섯 칸을 다 채웠을 때만 접는다. 그리고 단추는 지금 남은 칸으로 데려간다.
const state: { checklist: Record<string, boolean>; config: unknown } = { checklist: {}, config: { threads: { connected: true } } };

vi.mock("@/hooks/useChannelConfig", () => ({
  useChannelConfig: () => ({ data: state.config }),
}));
vi.mock("@/hooks/useOnboarding", () => ({
  useOnboardingStatus: () => ({ data: { checklist: state.checklist, channelConnected: true } }),
}));

beforeEach(() => { state.checklist = {}; state.config = { threads: { connected: true } }; });
afterEach(() => cleanup());

describe("시작 안내 유지 계약", () => {
  it("채널을 연결해도 첫 발행 전이면 안내가 남는다", () => {
    state.checklist = { created: true, wiki: true, channel: true };
    render(<GettingStartedStrip />);
    expect(screen.getByLabelText("시작 안내")).toBeTruthy();
  });

  it("단추가 남은 칸으로 데려간다(늘 채널 연결이 아니다)", () => {
    state.checklist = { created: true, wiki: true, channel: true };
    render(<GettingStartedStrip />);
    const cta = screen.getByTestId("getting-started-next");
    expect(cta.getAttribute("href")).toBe("/studio?room=publish");
    expect(cta.textContent).toContain("첫 콘텐츠 발행");
  });

  it("채널 설정 조회가 막혀도(고객은 403) 안내가 뜬다", () => {
    // 이 조회는 운영자 전용이라 고객에게는 undefined 로 온다. 종전에는 그때 안내가 통째로
    // 사라져, 정작 처음 온 고객에게만 길잡이가 안 보였다.
    state.config = undefined;
    state.checklist = { created: true, wiki: true, channel: true };
    render(<GettingStartedStrip />);
    expect(screen.getByLabelText("시작 안내")).toBeTruthy();
  });

  it("다섯 칸을 다 채우면 접는다", () => {
    state.checklist = { created: true, wiki: true, channel: true, published: true, analytics: true };
    const { container } = render(<GettingStartedStrip />);
    expect(container.querySelector("[data-start-strip]")).toBeNull();
  });
});
