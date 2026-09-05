// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage, { PerformanceDashboard } from "@/app/page";

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  showToast: vi.fn(),
  fetcher: vi.fn(),
  mutateMetrics: vi.fn(),
  posts: [] as Array<Record<string, unknown>>,
  cronJobs: [] as Array<Record<string, unknown>>,
  channelSettings: {} as Record<string, unknown>,
  learnedRules: [] as Array<Record<string, unknown>>,
}));

vi.mock("swr", () => ({
  default: (key: string | null) => {
    if (typeof key === "string" && key.startsWith("/api/cron-status")) {
      return { data: { jobs: mocks.cronJobs }, mutate: vi.fn() };
    }
    if (typeof key === "string" && key.startsWith("/api/channel-settings/")) {
      return { data: mocks.channelSettings, mutate: vi.fn() };
    }
    if (typeof key === "string" && key.startsWith("/api/performance/learned-rules")) {
      return { data: { rules: mocks.learnedRules }, mutate: vi.fn() };
    }
    return { data: { posts: mocks.posts }, mutate: mocks.mutateMetrics };
  },
}));

vi.mock("@/lib/api", () => ({
  fetcher: (...args: unknown[]) => mocks.fetcher(...args),
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
  ApiResponseError: class ApiResponseError extends Error {},
}));

vi.mock("@/components/layout/Toast", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock("@/components/studio/PlatformPreview", () => ({
  Logo: () => <span aria-hidden>◎</span>,
  PREVIEW_PLATFORMS: [{ key: "threads", label: "Threads" }],
}));

vi.mock("@/hooks/useOverview", () => ({
  useOverview: () => ({ data: { statusCounts: {}, channelCounts: {}, followers: 0, viralPosts: [] } }),
  useActivity: () => ({ data: { events: [] } }),
  useAlerts: () => ({ data: { alerts: [] } }),
  useWeeklySummary: () => ({ data: undefined }),
  useAgentLogs: () => ({ data: { logs: [] } }),
  useUsage: () => ({ data: undefined }),
  useErrors: () => ({ data: { last24h: 0 } }),
}));

vi.mock("@/hooks/useChannelConfig", () => ({ useChannelConfig: () => ({ data: {} }) }));
vi.mock("@/hooks/useOnboarding", () => ({ useOnboardingStatus: () => ({ data: { completed: true }, mutate: vi.fn() }) }));
vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({
    dismissedOnboarding: true,
    dismissOnboarding: vi.fn(),
    activeWorkspace: { id: "tenant-a", name: "Tenant A" },
  }),
}));
vi.mock("@/components/shared/OnboardingWizard", () => ({ OnboardingWizard: () => null }));
vi.mock("@/components/shared/ChannelConnectBanner", () => ({ ChannelConnectBanner: () => null }));
vi.mock("@/components/shared/OnboardingChecklist", () => ({ OnboardingChecklist: () => null }));
vi.mock("@/components/home/PipelineTimeline", () => ({ PipelineTimeline: () => null }));
vi.mock("@/lib/analytics/events", () => ({ trackEvent: vi.fn() }));

describe("Home design-system migration interactions", () => {
  beforeEach(() => {
    mocks.apiPost.mockReset();
    mocks.fetcher.mockReset();
    mocks.mutateMetrics.mockReset();
    mocks.posts = [];
    mocks.cronJobs = [{ id: "threads-collect-insights", name: "반응 수집", enabled: true, lastRunAt: null, lastStatus: "unknown" }];
    mocks.channelSettings = { auto_like_replies: false };
    mocks.learnedRules = [];
    mocks.fetcher.mockImplementation(() => new Promise(() => {}));
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/suggestions") {
        return {
          suggestions: [{
            id: "hyp-1",
            text: "문제와 해결 전후를 비교하는 콘텐츠",
            basis: "hypothesis",
            label: "가설 · 우리 검증 기록 아님",
            verified: false,
            evidence: {
              postIds: [], signalIds: [], sampleCount: 0, sampleThreshold: 5,
              sampleThresholdMet: false, brandContextAvailable: true, marketTrendAvailable: false,
            },
          }],
          sampleAssessment: { count: 0, threshold: 5, thresholdMet: false },
        };
      }
      if (path === "/api/suggestions/enqueue") return { ok: true, reused: false };
      return { ok: true };
    });
  });

  afterEach(cleanup);

  it("FE-V63-01 정상 경로: 표본 0건은 안내 한 번과 예시 지표로 다음 모습을 표시한다", async () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "아직 판정할 표본이 없습니다" })).toBeInTheDocument();
    expect(screen.getByText("아직 성과를 수집할 채널이 없습니다")).toBeInTheDocument();
    expect(document.querySelector('[data-perf-tier="core"]')).toHaveTextContent("18,420");
    expect(document.querySelector('[data-perf-tier="core"]')).not.toHaveTextContent("미수집");
    expect(document.querySelector('[data-perf-tier="rest"]')).not.toBeInTheDocument();
    expect(screen.queryByText("미수집")).not.toBeInTheDocument();
    expect(screen.getByText("예시 데이터")).toBeInTheDocument();
    expect(screen.getByText("성과 표본 0건입니다. 5건부터 판정합니다.")).toBeInTheDocument();
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/suggestions",
      { tenant_id: "tenant-a" },
    ));
    expect(await screen.findByText("가설 · 우리 검증 기록 아님")).toBeInTheDocument();
  });

  it("FE-V63-02 정상 경로: 제안 카드를 생성 큐 API로 인계한다", async () => {
    render(<HomePage />);

    const queueButton = await screen.findByRole("button", { name: "이 제안으로 새 콘텐츠 만들기" });
    fireEvent.click(queueButton);
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/suggestions/enqueue",
      expect.objectContaining({
        tenant_id: "tenant-a",
        suggestion: expect.objectContaining({ id: "hyp-1", label: "가설 · 우리 검증 기록 아님" }),
      }),
    ));
    expect(await screen.findByRole("button", { name: "생성실 대기 목록에 넣었어요" })).toBeDisabled();
  });

  it("FE-V63-02 거절 경로: 큐 인계 실패는 다음 행동과 재시도를 남긴다", async () => {
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/suggestions") {
        return {
          suggestions: [{
            id: "hyp-reject",
            text: "거절 경로 제안",
            basis: "hypothesis",
            label: "가설 · 우리 검증 기록 아님",
            verified: false,
            evidence: {
              postIds: [], signalIds: [], sampleCount: 0, sampleThreshold: 5,
              sampleThresholdMet: false, brandContextAvailable: false, marketTrendAvailable: false,
            },
          }],
          sampleAssessment: { count: 0, threshold: 5, thresholdMet: false },
        };
      }
      if (path === "/api/suggestions/enqueue") throw new Error("rejected");
      return { ok: true };
    });
    render(<HomePage />);

    fireEvent.click(await screen.findByRole("button", { name: "이 제안으로 새 콘텐츠 만들기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("준비하지 못했어요. 잠시 후 다시 눌러 주세요.");
    expect(screen.getByRole("button", { name: "이 제안으로 새 콘텐츠 만들기" })).toBeEnabled();
  });

  it("FE-V63-03 경계값: 성과 표본 5건이면 실제 조회값으로 판정 막대를 만든다", async () => {
    mocks.posts = [1000, 800, 300, 200, 100].map((views, index) => ({
      id: `post-${index}`,
      platform: "threads",
      text: `성과 글 ${index + 1}`,
      status: "published",
      published_at: "2026-08-27T10:00:00.000Z",
      views,
      likes: index,
      replies: index,
    }));
    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "조회 상위 2편이 나머지보다 4.5배 멀리 갔습니다" })).toBeInTheDocument();
    expect(screen.getByLabelText("조회 상위 2편 평균 900")).toHaveAttribute("value", "900");
    expect(screen.getByText("성과 표본 5건입니다. 5건부터 판정합니다.")).toBeInTheDocument();
  });

  it("FE-V63-04 정상 경로: 플랫폼 집중과 성과 재수집 버튼이 실제 API에 연결된다", async () => {
    render(<HomePage />);

    const threads = screen.getByRole("button", { name: "Threads" });
    fireEvent.click(threads);
    expect(threads).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByText("올린 글별 성적"));
    fireEvent.click(screen.getByRole("button", { name: "성과 다시 수집하기" }));
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/metrics",
      { tenant_id: "tenant-a" },
    ));
    expect(mocks.mutateMetrics).toHaveBeenCalled();
  });

  it("FE5-PERF-01 정상 경로: 통한 글에서 성과 제안을 실제 API로 불러온다", async () => {
    mocks.posts = [1200, 900, 500, 300, 100].map((views, index) => ({
      id: `post-${index}`,
      platform: "threads",
      text: `성과 글 ${index + 1}`,
      status: "published",
      published_at: "2026-08-27T10:00:00.000Z",
      views,
      likes: index,
      replies: index,
    }));
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "이 결로 한 편 더" }));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/suggestions",
      { tenant_id: "tenant-a" },
    ));
    expect(await screen.findByText("문제와 해결 전후를 비교하는 콘텐츠")).toBeInTheDocument();
  });

  it("FE5-PERF-02 거절 경로: 성과 제안 호출 실패는 오류와 재시도 동작을 남긴다", async () => {
    mocks.posts = [1200, 900, 500, 300, 100].map((views, index) => ({
      id: `post-${index}`,
      platform: "threads",
      text: `성과 글 ${index + 1}`,
      status: "published",
      published_at: "2026-08-27T10:00:00.000Z",
      views,
      likes: index,
      replies: index,
    }));
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/suggestions") throw new Error("suggestions unavailable");
      return { ok: true };
    });
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "이 결로 한 편 더" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("제안을 불러오지 못했어요. 잠시 후 다시 받아 주세요.");
    expect(screen.getByRole("button", { name: "이 결로 한 편 더" })).toBeEnabled();
  });

  it("FE5-PERF-03 정상 경로: 댓글 본문과 원문 링크를 보여 주고 답글 행동을 연다", async () => {
    mocks.posts = [{
      id: "post-with-replies",
      platform: "threads",
      text: "반응이 달린 글",
      status: "published",
      published_at: "2026-08-27T10:00:00.000Z",
      views: 100,
      likes: 12,
      replies: 3,
      permalink: "https://example.com/posts/1",
    }];
    mocks.fetcher.mockResolvedValue({
      postId: "post-with-replies", platform: "threads",
      capability: {
        read: { supported: true, reason: null }, reply: { supported: true, reason: null },
        like: { supported: true, reason: null }, defer: { supported: true, reason: null },
        editorHandoff: { supported: true, reason: null },
      },
      items: [{
        id: "comment-1", parentId: "post-with-replies", author: "@maker", body: "읽을 댓글 본문",
        createdAt: "2026-08-27T11:00:00.000Z", likeCount: 2, permalink: null, state: "unread",
        repliedAt: null, replyText: null, likedAt: null, deferredAt: null, editorHandoffAt: null, editorDraftId: null,
      }],
    });
    render(<HomePage />);

    expect(await screen.findByText("읽을 댓글 본문")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "게시물에서 확인하기" })).toHaveAttribute("href", "https://example.com/posts/1");
    expect(screen.getByRole("textbox", { name: "@maker 답글" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 답글 보내기" })).toBeDisabled();
  }, 20_000);

  it("FE5-PERF-04 거절 경로: 원문 링크와 댓글 계약이 없으면 이유만 표시한다", async () => {
    mocks.posts = [{
      id: "post-without-link",
      platform: "tiktok",
      text: "원문 링크가 없는 글",
      status: "published",
      published_at: "2026-08-27T10:00:00.000Z",
      views: 100,
      likes: 12,
      replies: 3,
    }];
    const unsupportedReason = "TikTok Content Posting API는 댓글 관리 계약을 제공하지 않습니다.";
    const unsupported = { supported: false, reason: unsupportedReason };
    mocks.fetcher.mockResolvedValue({
      postId: "post-without-link", platform: "tiktok", items: [], unavailableReason: unsupportedReason,
      capability: { read: unsupported, reply: unsupported, like: unsupported, defer: unsupported, editorHandoff: unsupported },
    });
    render(<HomePage />);

    expect(await screen.findByText(/TikTok Content Posting API는 댓글 관리 계약을 제공하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText("원문 연동 준비 중")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "게시물에서 확인하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /답글/ })).not.toBeInTheDocument();
  }, 20_000);

  it("OSMU-PERF-AUTO-01 정상 경로: 자동 좋아요 토글이 channel-settings API를 실제 호출한다", async () => {
    render(<HomePage />);

    const toggle = await screen.findByRole("button", { name: "꺼짐" });
    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      expect.stringContaining("/api/channel-settings/threads"),
      { auto_like_replies: true },
    ));
  });

  it("OSMU-PERF-CHAT-01 정상 경로: '이거 왜 잘 됐어'가 규칙 후보를 내고 배우기가 learned-rules API를 호출한다", async () => {
    mocks.posts = [1500, 1200, 1000, 200, 150, 100].map((views, index) => ({
      id: `post-${index}`,
      platform: "threads",
      text: index < 3 ? `왜 잘 됐을까요 ${index}?` : `평범한 글 ${index}`,
      status: "published",
      published_at: "2026-08-27T10:00:00.000Z",
      views,
      likes: index,
      replies: index,
    }));
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "대화 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "이거 왜 잘 됐어" }));

    expect(await screen.findByText(/이 규칙을 배울까요\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "배우기" }));
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/performance/learned-rules",
      expect.objectContaining({ tenant_id: "tenant-a" }),
    ));
  });

  it("V68-PERF-01 정상: 전용 성과실은 04 단계를 표시하고 담당 대화를 처음부터 연다", async () => {
    render(<PerformanceDashboard dedicatedRoom />);

    expect(document.querySelector('[data-performance-layout="dedicated"]')).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "성과실" })).toBeInTheDocument();
    expect(document.querySelector('[data-room-flow="performance"] [aria-current="step"]')).toHaveAttribute("href", "/performance");
    expect(screen.getByRole("button", { name: "접기" })).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith("/api/suggestions", { tenant_id: "tenant-a" }));
  });

  it("V68-PERF-02 거절: 낮은 반응 콘텐츠는 후보만 제시하고 자동 삭제 호출을 만들지 않는다", async () => {
    mocks.posts = [1000, 900, 800, 10, 5].map((views, index) => ({
      id: `cleanup-${index}`,
      platform: "threads",
      text: `성과 확인 글 ${index + 1}`,
      status: "published",
      published_at: "2026-08-27T10:00:00.000Z",
      views,
      likes: 0,
      replies: 0,
    }));
    render(<PerformanceDashboard dedicatedRoom />);

    fireEvent.click(screen.getByRole("button", { name: "안 터진 글 정리해줘" }));
    expect(await screen.findByText(/자동 삭제는 아직 없습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /삭제/ })).not.toBeInTheDocument();
    expect(mocks.apiPost.mock.calls.some(([path]) => String(path).includes("delete"))).toBe(false);
  });

  // 2026-09-05: 성과 다시 수집이 실패해도 아무 말이 없었다. catch 가 없어 예외가 그대로
  // 새고 화면은 원래대로 돌아갈 뿐이라 눌러도 아무 일이 없는 것으로 읽혔다.
  it("V68-PERF-03 거절: 성과 재수집이 실패하면 조용히 넘기지 않고 사용자에게 알린다", async () => {
    mocks.showToast.mockClear();
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (String(path).includes("/api/metrics")) throw new Error("수집 실패");
      return {};
    });
    render(<PerformanceDashboard dedicatedRoom />);

    fireEvent.click(screen.getByRole("button", { name: "성과 다시 수집하기" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      expect.stringContaining("성과를 다시 수집하지 못했습니다"),
      "error",
    ));
  });

  // 2026-09-05 회장 계정 실측 회귀: 수집 대상 1건인데 갱신 0건으로 끝나고 화면은 아무 말이
  // 없었다. 눌렀는데 숫자가 그대로인 이유를 사용자가 알 수 없다.
  it("V68-PERF-04 거절: 모을 대상이 있는데 하나도 못 모으면 이유를 알린다", async () => {
    mocks.showToast.mockClear();
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (String(path).includes("/api/metrics")) {
        return { ok: true, updated: 0, total: 1, collectionBlocked: true, reason: "채널이 성과 조회를 거절했습니다(응답 403). 채널을 다시 연결한 뒤 시도해 주세요." };
      }
      return {};
    });
    render(<PerformanceDashboard dedicatedRoom />);

    fireEvent.click(screen.getByRole("button", { name: "성과 다시 수집하기" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      expect.stringContaining("성과 조회를 거절"),
      "error",
    ));
  });
});
