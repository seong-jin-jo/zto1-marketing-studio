// @vitest-environment jsdom
// 2026-10-02 컨트롤러 감사 반려: video/publish가 예산을 넘기면 202 + {status:"processing",
// jobId}를 주는데, 발행실이 그 응답을 몰라 `vr?.ok && !vr.partial`만 보고 바로 "완료"로
// 표시했다 — 거짓-성공. /api/publish도 같은 계열(202 + {processing:true, draftId}).
// 이 테스트는 그 배선이 실제로 걸려 있는지 "완전 마운트"로 확인한다(이 레포가 이미 쓰는
// studio-publish-ui.test.tsx 패턴을 그대로 따름).
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioPage from "@/app/studio/page";

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  fetcher: vi.fn(),
  showToast: vi.fn(),
  trackEvent: vi.fn(),
  swr: vi.fn(),
  workspace: { id: "tenant-a", name: "작업 공간 A" },
}));

vi.mock("swr", () => ({ default: (...args: unknown[]) => mocks.swr(...args) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  fetcher: mocks.fetcher,
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
  isExternalPublishPersistenceError: () => false,
  ApiResponseError: class ApiResponseError extends Error { payload: unknown = null; },
}));
vi.mock("@/components/layout/Toast", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({ activeWorkspace: mocks.workspace, studioRoom: "publish", setStudioRoom: vi.fn() }),
}));
vi.mock("@/components/studio/PlatformPreview", () => ({
  PREVIEW_PLATFORMS: ["threads", "x", "facebook", "instagram", "shorts", "reels", "tiktok"].map((key) => ({ key, label: key })),
  PlatformPreview: ({ platform, headerRight }: { platform: string; headerRight?: React.ReactNode }) => (
    <div data-testid={`preview-${platform}`}>{headerRight}</div>
  ),
}));
vi.mock("@/components/shared/BrandSetupWizard", () => ({ BrandSetupWizard: () => null }));
vi.mock("@/components/studio/RepoConnect", () => ({ RepoConnect: () => null }));
vi.mock("@/components/studio/SchedulePanel", () => ({ SchedulePanel: () => null }));
vi.mock("@/lib/analytics/events", () => ({ trackEvent: mocks.trackEvent }));
vi.mock("@/lib/auth", () => ({ authHeaders: () => ({}) }));

function b64url(obj: unknown): string {
  const json = JSON.stringify(obj);
  return btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function seedReelsStudioWork() {
  localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
    idea: "비동기 발행 테스트",
    editLines: ["가장 최신 문단"],
    text: { threads: "Threads 본문" },
    vid: { file: `/api/media/${b64url({ f: "clip.mp4" })}.sig`, url: "" },
    includes: Object.fromEntries(
      ["threads", "x", "facebook", "instagram", "shorts", "reels", "tiktok"].map((p) => [p, p === "reels"]),
    ),
  }));
}

async function findEnabledButton(name: string) {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe("발행실 — video/publish 202(jobId) 응답을 거짓-성공으로 읽지 않는다", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.apiPost.mockReset();
    mocks.fetcher.mockReset();
    mocks.showToast.mockReset();
    mocks.trackEvent.mockReset();
    mocks.swr.mockReset();
    mocks.workspace.id = "tenant-a";
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") return { data: { isOperator: true }, mutate: vi.fn() };
      if (key === "/api/studio/drafts?tenant_id=tenant-a") return { data: { drafts: [], currentWork: null }, mutate: vi.fn() };
      if (typeof key === "string" && key.startsWith("/api/queue?status=all&returnTo=")) return { data: { posts: [] }, mutate: vi.fn() };
      if (key === "/api/studio/brand-setup?tenant_id=tenant-a") return { data: { guide: null }, mutate: vi.fn() };
      if (key === "/api/publish/first-comment-capabilities") {
        return { data: { capabilities: [{ platform: "reels", supported: false, reason: "미지원" }] }, mutate: vi.fn() };
      }
      if (key === "/api/channel-config") return { data: {}, mutate: vi.fn() };
      if (key === "/api/onboarding") return { data: { checklist: {} }, mutate: vi.fn() };
      return { data: undefined, mutate: vi.fn() };
    });
    // reels는 instagram 계정을 쓴다 — 연결돼 있다고 답해 publishTargets에 들어오게 한다.
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const platform = /\/api\/channels\/([^/]+)\/accounts/.exec(url)?.[1];
      if (platform) {
        const connected = platform === "instagram"
          ? [{ id: "ig-account", display_name: "인스타 계정", username: "ig", is_default: true }]
          : [];
        return Response.json({ accounts: connected });
      }
      throw new Error(`unmocked fetch: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("202 + jobId를 받으면 즉시 완료 표시하지 않고, 폴링이 끝난 뒤 실제 permalink로 완료 표시한다", async () => {
    seedReelsStudioWork();
    let jobPollCount = 0;
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-async-1" };
      if (path === "/api/video/publish") return { ok: true, status: "processing", jobId: "job-xyz" };
      throw new Error(`unexpected apiPost path: ${path}`);
    });
    // job 폴링은 raw fetch를 쓴다 — 기존 accounts stub 위에 job 경로를 추가로 라우팅한다.
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const accountsPlatform = /\/api\/channels\/([^/]+)\/accounts/.exec(url)?.[1];
      if (accountsPlatform) {
        const connected = accountsPlatform === "instagram"
          ? [{ id: "ig-account", display_name: "인스타 계정", username: "ig", is_default: true }]
          : [];
        return Response.json({ accounts: connected });
      }
      if (url.includes("/api/video/publish/job/job-xyz")) {
        jobPollCount += 1;
        if (jobPollCount < 3) return Response.json({ ok: true, status: "processing", jobId: "job-xyz" });
        return Response.json({ ok: true, platform: "instagram_reels", url: "https://www.instagram.com/reel/real-one/" });
      }
      throw new Error(`unmocked fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StudioPage />);
    const button = await findEnabledButton("선택한 1곳에 지금 발행");
    fireEvent.click(button);

    // 핵심 단언: jobId 응답 직후에는 "완료"(새 창 링크)가 아니라 "발행 중"이어야 한다.
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith("/api/video/publish", expect.anything(), expect.anything()));
    expect(screen.queryByRole("link", { name: /새 창/ })).not.toBeInTheDocument();

    // 폴링이 끝나면 실제 permalink로 "완료" 표시가 뜬다.
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /새 창/ });
      expect(link).toHaveAttribute("href", "https://www.instagram.com/reel/real-one/");
    }, { timeout: 8000 });
    expect(jobPollCount).toBeGreaterThanOrEqual(3);
  }, 15000);

  it("백그라운드 발행이 결국 실패하면 '완료'가 아니라 '실패'로 표시한다", async () => {
    seedReelsStudioWork();
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-async-2" };
      if (path === "/api/video/publish") return { ok: true, status: "processing", jobId: "job-fail-1" };
      throw new Error(`unexpected apiPost path: ${path}`);
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const accountsPlatform = /\/api\/channels\/([^/]+)\/accounts/.exec(url)?.[1];
      if (accountsPlatform) {
        const connected = accountsPlatform === "instagram"
          ? [{ id: "ig-account", display_name: "인스타 계정", username: "ig", is_default: true }]
          : [];
        return Response.json({ accounts: connected });
      }
      if (url.includes("/api/video/publish/job/job-fail-1")) {
        return Response.json({ ok: false, error: "이 주제는 생성기가 만들 수 없다고 했습니다." });
      }
      throw new Error(`unmocked fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StudioPage />);
    const button = await findEnabledButton("선택한 1곳에 지금 발행");
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/이 주제는 생성기가 만들 수 없다고 했습니다/)).toBeInTheDocument(), { timeout: 8000 });
    expect(screen.queryByRole("link", { name: /새 창/ })).not.toBeInTheDocument();
  }, 15000);
});
