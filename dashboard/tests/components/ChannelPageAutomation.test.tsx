// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelPage } from "@/components/channel/ChannelPage";
import { InstagramPage } from "@/components/channel/InstagramPage";
import { MessagingPage } from "@/components/channel/MessagingPage";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
  apiPost: vi.fn(),
  mutateConfig: vi.fn(),
  setSubTab: vi.fn(),
  setExpandedFeature: vi.fn(),
  setExpandedPopular: vi.fn(),
  subTab: "settings",
  channelConfigData: {} as Record<string, unknown>,
  showToast: vi.fn(),
}));

vi.mock("swr", () => ({
  default: (...args: unknown[]) => mocks.swr(...args),
}));

vi.mock("@/hooks/useChannelConfig", () => ({
  useChannelConfig: () => ({
    data: mocks.channelConfigData,
    mutate: mocks.mutateConfig,
  }),
  useDesignTools: () => mocks.swr("/api/design-tools"),
}));

vi.mock("@/lib/api", () => ({
  fetcher: vi.fn(),
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
  handleUnauthorizedResponse: vi.fn(),
}));

vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({
    subTab: mocks.subTab,
    setSubTab: mocks.setSubTab,
    expandedFeature: null,
    setExpandedFeature: mocks.setExpandedFeature,
    expandedPopular: null,
    setExpandedPopular: mocks.setExpandedPopular,
  }),
}));

vi.mock("@/components/layout/Toast", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock("@/components/shared/CredentialForm", () => ({
  CredentialForm: ({ title }: { title?: string }) => <section>{title}</section>,
}));
vi.mock("@/components/channel/SocialConnectButton", () => ({
  SocialConnectButton: ({ label }: { label: string }) => <button>{label} 연결</button>,
}));
vi.mock("@/components/channel/AccountManager", () => ({ AccountManager: () => null }));
vi.mock("@/components/shared/SetupGuide", () => ({ SetupGuide: () => null }));
vi.mock("@/components/channel/ContentGuide", () => ({ ContentGuide: () => null }));
vi.mock("@/components/channel/KeywordsEditor", () => ({ KeywordsEditor: () => null }));
vi.mock("@/components/queue/QueueList", () => ({ QueueList: () => null }));
vi.mock("@/components/shared/BackButton", () => ({ BackButton: () => null }));

describe("ChannelPage customer/operator API boundary", () => {
  beforeEach(() => {
    mocks.swr.mockReset();
    mocks.swr.mockImplementation((key: string | null) => ({
      data: key?.startsWith("/api/channel-settings/")
        ? { content_generation: true, auto_publish: true }
        : undefined,
      mutate: vi.fn(),
    }));
    mocks.apiPost.mockReset();
    mocks.apiPost.mockResolvedValue({ ok: true });
    mocks.subTab = "settings";
    mocks.channelConfigData = {};
    mocks.showToast.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it.each(["youtube", "tiktok"])(
    "does not request operator-only cron data on the %s customer channel",
    (channel) => {
      render(<ChannelPage channel={channel} variant="video" />);

      const keys = mocks.swr.mock.calls.map(([key]) => key);
      expect(keys).toContain(`/api/channel-settings/${channel}`);
      expect(keys).not.toContain("/api/cron-status");
      expect(keys).not.toContain("/api/cron-runs");
    },
  );

  it.each([
    ["threads", "/api/growth", "/api/threads-username"],
    ["instagram", null, null],
  ])(
    "keeps tenant-safe %s data without requesting operator-only cron APIs",
    (channel, growthKey, usernameKey) => {
      render(<ChannelPage channel={channel} />);

      const keys = mocks.swr.mock.calls.map(([key]) => key);
      expect(keys).toContain(growthKey);
      expect(keys).toContain(usernameKey);
      expect(keys).toContain(`/api/channel-settings/${channel}`);
      expect(keys).not.toContain("/api/cron-status");
      expect(keys).not.toContain("/api/cron-runs");
      if (channel === "threads") expect(keys).toContain("/api/settings");
    },
  );

  it("updates the tenant channel setting without requesting global cron data", async () => {
    render(<ChannelPage channel="youtube" variant="video" />);

    fireEvent.click(screen.getByRole("checkbox", { name: "자동 발행" }));

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        "/api/channel-settings/youtube",
        { auto_publish: false },
      );
    });
    const keys = mocks.swr.mock.calls.map(([key]) => key);
    expect(keys).not.toContain("/api/cron-status");
    expect(keys).not.toContain("/api/cron-runs");
  });

  it("keeps the connected Instagram editor without requesting global design tools", () => {
    mocks.subTab = "editor";
    mocks.channelConfigData = { instagram: { connected: true } };

    render(<InstagramPage />);

    const keys = mocks.swr.mock.calls.map(([key]) => key);
    expect(keys).toContain("/api/queue");
    expect(keys).not.toContain("/api/design-tools");
  });

  it("keeps migrated channel tabs wired to shared UI state", () => {
    render(<ChannelPage channel="threads" />);

    fireEvent.click(screen.getByRole("tab", { name: "성과 분석" }));

    expect(mocks.setSubTab).toHaveBeenCalledWith("analytics");
  });

  it("keeps unimplemented generic tabs visible and announces that integration is planned", () => {
    render(<ChannelPage channel="x" />);

    const growth = screen.getByTestId("channel-tab-x-growth");
    expect(growth).toHaveAttribute("aria-disabled", "true");
    expect(growth).toHaveTextContent("연동 예정");

    fireEvent.click(growth);

    expect(mocks.setSubTab).not.toHaveBeenCalledWith("growth");
    expect(mocks.showToast).toHaveBeenCalledWith("연동 예정입니다", "warning");
  });

  it("preserves Instagram Editor while adding the common Analytics tab", () => {
    render(<InstagramPage />);

    expect(screen.getByTestId("channel-tab-instagram-editor")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("channel-tab-instagram-analytics"));

    expect(mocks.setSubTab).toHaveBeenCalledWith("analytics");
  });

  it("keeps structurally impossible messaging tabs removed", () => {
    render(<MessagingPage channel="telegram" />);

    expect(screen.getByTestId("channel-tab-telegram-settings")).toBeInTheDocument();
    expect(screen.queryByTestId("channel-tab-telegram-queue")).not.toBeInTheDocument();
    expect(screen.queryByTestId("channel-tab-telegram-analytics")).not.toBeInTheDocument();
  });

  it("keeps the migrated popular-post action wired to its API", async () => {
    mocks.subTab = "popular";
    mocks.swr.mockImplementation((key: string | null) => ({
      data: key === "/api/popular" ? { posts: [] } : undefined,
      mutate: vi.fn(),
    }));
    render(<ChannelPage channel="threads" />);

    fireEvent.change(screen.getByPlaceholderText("인기글 텍스트를 붙여넣기"), {
      target: { value: "검증할 인기글" },
    });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        "/api/popular/add",
        { text: "검증할 인기글", url: "", topic: "general" },
      );
    });
  });

  it("restores Instagram tenant automation settings without global cron requests", async () => {
    mocks.channelConfigData = { instagram: { connected: true } };

    render(<InstagramPage />);

    expect(mocks.swr.mock.calls.map(([key]) => key)).toContain("/api/channel-settings/instagram");
    fireEvent.click(screen.getByRole("checkbox", { name: "자동 발행" }));
    await vi.waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        "/api/channel-settings/instagram",
        { auto_publish: false },
      );
    });
    const keys = mocks.swr.mock.calls.map(([key]) => key);
    expect(keys).not.toContain("/api/cron-status");
    expect(keys).not.toContain("/api/cron-runs");
  });

  it("V69-COPY-03 정상: 채널 탭과 설정 라벨을 한국어 표준 용어로 표시한다", () => {
    render(<ChannelPage channel="threads" />);

    ["대기열", "성과 분석", "성장", "인기글", "설정"].forEach((name) => {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "채널 정보" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "자동화" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "세부 설정" })).toBeInTheDocument();
  });

  it("V69-COPY-03 거절: 고객 채널 화면에 기존 영어 탭과 설정 라벨을 노출하지 않는다", () => {
    render(<ChannelPage channel="threads" />);

    ["Queue", "Analytics", "Growth", "Popular", "Settings", "Channel Info", "Automation", "Parameters"].forEach((label) => {
      expect(screen.queryByText(label, { exact: true })).not.toBeInTheDocument();
    });
  });

  it("V69-COPY-05 정상: 공식 연결 단추는 항상 활성 상태로 먼저 보인다", () => {
    render(<ChannelPage channel="threads" />);

    expect(screen.getByRole("button", { name: "Threads 연결" })).toBeEnabled();
    expect(screen.queryByText("Threads 고급 연결 정보")).not.toBeInTheDocument();
  });

  it("V69-COPY-05 거절: 고급 연결 정보는 고객이 직접 펼치기 전에는 노출하지 않는다", () => {
    render(<ChannelPage channel="threads" />);

    fireEvent.click(screen.getByRole("button", { name: "고급 연결 정보 열기" }));
    expect(screen.getByText("Threads 고급 연결 정보")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Threads 연결" })).toBeEnabled();
  });

  it("V69-COPY-05 Instagram: 공식 연결을 유지하고 고급 연결 정보는 접어 둔다", () => {
    render(<InstagramPage />);

    expect(screen.getByRole("button", { name: "Instagram 연결" })).toBeEnabled();
    expect(screen.queryByText("Instagram 고급 연결 정보")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "고급 연결 정보 열기" }));
    expect(screen.getByText("Instagram 고급 연결 정보")).toBeInTheDocument();
  });
});
