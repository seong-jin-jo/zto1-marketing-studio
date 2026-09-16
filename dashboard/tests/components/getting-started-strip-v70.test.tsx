// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GettingStartedStrip } from "@/components/shared/GettingStartedStrip";

const mocks = vi.hoisted(() => ({
  channels: {} as Record<string, Record<string, unknown>> | undefined,
  checklist: { created: true, wiki: false, channel: false, published: false, analytics: false },
}));

vi.mock("@/hooks/useChannelConfig", () => ({ useChannelConfig: () => ({ data: mocks.channels }) }));
vi.mock("@/hooks/useOnboarding", () => ({ useOnboardingStatus: () => ({ data: { checklist: mocks.checklist } }) }));

afterEach(() => {
  cleanup();
  mocks.channels = {};
  // 2026-09-16: V70-START-04 가 checklist 를 전부 true 로 바꿔 두고 되돌리지 않아, 그 뒤에
  // 추가된 테스트가 "다섯 칸을 다 채웠다"는 leftover 상태를 물려받아 컴포넌트가 조용히
  // null 을 반환했다(빈 <div/>). 매 테스트가 독립적이도록 기본값으로 되돌린다.
  mocks.checklist = { created: true, wiki: false, channel: false, published: false, analytics: false };
});

describe("V70-START 시작 스트립 계약", () => {
  it("V70-START-01 정상: 중복 배너 대신 진행도와 채널 연결 수를 한 줄에서 안내한다", () => {
    render(<GettingStartedStrip />);

    expect(screen.getByText("시작 1/5")).toBeInTheDocument();
    expect(screen.getByText(/채널 연결 0\/15/)).toBeInTheDocument();
    // 2026-09-08 코드 감사 F-02: 종전에는 연결된 채널이 없으면 남은 칸과 무관하게 채널
    // 연결로 데려갔다. 그래서 글은 "다음 할 일: 브랜드 문서 연결" 인데 단추는 "채널 연결하기"
    // 라 서로 다른 곳을 가리켰다. 사업계획과 네 방 설계는 둘 다 "먼저 만들고 채널은 발행
    // 직전" 으로 확정돼 있다. 글과 단추가 같은 칸을 가리켜야 한다.
    expect(screen.getByText(/다음 할 일: 브랜드 문서 연결/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "브랜드 문서 연결" })).toHaveAttribute("href", "/studio?setup=brand");
  });

  it("V70-START-01b 정상: 채널이 하나도 없어도 글과 단추가 같은 칸을 가리킨다", () => {
    mocks.checklist = { created: false, wiki: false, channel: false, published: false, analytics: false };
    render(<GettingStartedStrip />);

    expect(screen.getByText(/다음 할 일: 첫 콘텐츠 만들기/)).toBeInTheDocument();
    expect(screen.getByTestId("getting-started-next")).toHaveAttribute("href", "/studio?room=create");
    mocks.checklist = { created: true, wiki: false, channel: false, published: false, analytics: false };
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

  it("V70-START-05 학습 정보가 비어 있으면 생성 전에 채우는 길을 먼저 보여 준다", () => {
    const onOpenLearning = vi.fn();
    render(<GettingStartedStrip learningFilled={2} learningTotal={7} onOpenLearning={onOpenLearning} />);

    expect(screen.getByText(/AI가 내 일을 이해하도록 학습 정보 2\/7칸 채우기/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("getting-started-learning"));
    expect(onOpenLearning).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("getting-started-next")).not.toBeInTheDocument();
  });

  // 2026-09-16 실측(j.the.great.investor): "채널 연결 0/15" 가 같은 세션의 다른 화면에서는
  // "3/15" 로 떴다. channelConfig 조회가 아직 안 끝난 동안(undefined) 이 줄이 "연결 0"으로
  // 단정해 그렸기 때문이다. 로딩 중에는 0 을 찍지 말고 로딩 중임을 말해야 한다.
  it("V70-START-06 개정: channel-config 조회가 아직 안 끝났으면 0으로 단정하지 않고 확인 중이라고 말한다", () => {
    mocks.channels = undefined;
    render(<GettingStartedStrip />);

    expect(screen.getByText(/채널 연결 확인 중/)).toBeInTheDocument();
    expect(screen.queryByText(/채널 연결 0\/15/)).not.toBeInTheDocument();
    mocks.channels = {};
  });

  it("V70-START-07 개정: 호출부가 명시적으로 connectedCount 를 넘기면 로딩 중이어도 그 값을 따른다", () => {
    mocks.channels = undefined;
    render(<GettingStartedStrip connectedCount={0} />);

    expect(screen.getByText(/채널 연결 0\/15/)).toBeInTheDocument();
    mocks.channels = {};
  });
});
