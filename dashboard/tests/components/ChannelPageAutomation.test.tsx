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
  ApiResponseError: class ApiResponseError extends Error {
    constructor(_status: number, _payload: unknown, message: string) { super(message); }
  },
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
  CredentialForm: ({ title, submitLabel, onSave }: { title?: string; submitLabel?: string; onSave?: (keys: Record<string, string>) => Promise<void> }) =>
    <section>{title}<span>{submitLabel}</span><button onClick={() => { void onSave?.({ webhookUrl: "fixture" }).catch(() => {}); }}>fixture save</button></section>,
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

  it("CHANNEL-09 실제 메시징 페이지는 슬랙 Webhook 입력을 바로 보여주고 OAuth 연결을 제시하지 않는다", () => {
    mocks.channelConfigData = { slack: { connected: false, reconnectRequired: true, connectionError: "slack_webhook_required" } };
    render(<MessagingPage channel="slack" />);
    expect(screen.getByText("Incoming Webhook 연결")).toBeInTheDocument();
    expect(screen.getByText(/기존 Slack 연결은 발행에 사용할 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByText(/버튼을 누를 때마다 입력한 Slack 채널에 테스트 메시지 1건이 게시됩니다/)).toBeInTheDocument();
    expect(screen.getByText(/마스킹된 저장값 대신 Incoming Webhook URL 원문을 입력해 주세요/)).toBeInTheDocument();
    expect(screen.getByText("테스트 메시지 보내고 연결")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Slack 연결" })).not.toBeInTheDocument();
  });

  it("CHANNEL-13 텔레그램 Chat ID 누락은 실제 메시징 페이지에 조치 문구를 보인다", () => {
    mocks.channelConfigData = { telegram: { connected: false, connectionError: "telegram_chat_required" } };
    render(<MessagingPage channel="telegram" />);
    expect(screen.getByText(/Telegram 발행 대상 Chat ID가 없습니다/)).toBeInTheDocument();
  });

  it("CHANNEL-25 Discord 발행 불가 기본 계정에는 Webhook 재연결 조치를 보인다", () => {
    mocks.channelConfigData = { discord: { connected: false, connectionError: "discord_webhook_required" } };
    render(<MessagingPage channel="discord" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Discord Incoming Webhook URL");
  });

  it("CHANNEL-39 부분 저장 503은 서버의 재조회·재시도 안내를 실제 화면 알림으로 보인다", async () => {
    mocks.channelConfigData = { slack: { connected: false } };
    const message = "연결 저장이 완료되지 않았습니다. 새로고침해 연결 상태를 확인한 뒤 다시 저장해 주세요.";
    const { ApiResponseError } = await import("@/lib/api");
    mocks.apiPost.mockRejectedValueOnce(new ApiResponseError(503, {}, message));
    render(<MessagingPage channel="slack" />);
    fireEvent.click(screen.getByRole("button", { name: "fixture save" }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(message, "error"));
    expect(mocks.mutateConfig).toHaveBeenCalled();
  });

  it("CHANNEL-10 Bluesky는 계정 관리의 앱 비밀번호 연결만 보여주고 중복 자격증명 폼을 숨긴다", () => {
    render(<ChannelPage channel="bluesky" />);
    expect(screen.queryByText("연결 정보")).not.toBeInTheDocument();
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
