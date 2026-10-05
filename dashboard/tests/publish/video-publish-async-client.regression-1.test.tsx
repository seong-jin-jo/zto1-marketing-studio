// @vitest-environment jsdom
// 2026-10-02 컨트롤러 감사 반려: video/publish가 예산을 넘기면 202 + {status:"processing",
// jobId}를 주는데, 발행실이 그 응답을 몰라 `vr?.ok && !vr.partial`만 보고 바로 "완료"로
// 표시했다 — 거짓-성공. /api/publish도 같은 계열(202 + {processing:true, draftId}).
// 이 테스트는 그 배선이 실제로 걸려 있는지 "완전 마운트"로 확인한다(이 레포가 이미 쓰는
// studio-publish-ui.test.tsx 패턴을 그대로 따름).
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioPage from "@/app/studio/page";
import { savePendingVideoPublishJob } from "@/lib/publish-job-store";
import { ApiResponseError } from "@/lib/api";

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
vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    // M-A(2026-10-02 재재검토): isExternalPublishPersistenceError/isUnresolvedPublishError/
    // ApiResponseError는 실제 구현을 그대로 쓴다(스텁으로 덮으면 이 파일이 검증하려는
    // 바로 그 판정 로직을 테스트가 안 거치게 된다).
    ...actual,
    fetcher: mocks.fetcher,
    apiPost: (...args: unknown[]) => mocks.apiPost(...args),
  };
});
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

function seedReelsStudioWork(draftId?: string) {
  localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
    idea: "비동기 발행 테스트",
    editLines: ["가장 최신 문단"],
    text: { threads: "Threads 본문" },
    vid: { file: `/api/media/${b64url({ f: "clip.mp4" })}.sig`, url: "" },
    includes: Object.fromEntries(
      ["threads", "x", "facebook", "instagram", "shorts", "reels", "tiktok"].map((p) => [p, p === "reels"]),
    ),
    ...(draftId ? { draftId } : {}),
  }));
}

function seedTikTokStudioWork() {
  localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
    idea: "비동기 발행 테스트",
    editLines: ["가장 최신 문단"],
    text: { threads: "Threads 본문" },
    vid: { file: `/api/media/${b64url({ f: "clip.mp4" })}.sig`, url: "" },
    includes: Object.fromEntries(
      ["threads", "x", "facebook", "instagram", "shorts", "reels", "tiktok"].map((p) => [p, p === "tiktok"]),
    ),
  }));
}

function seedThreadsStudioWork(draftId?: string) {
  localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
    idea: "비동기 소셜 발행 테스트",
    editLines: ["가장 최신 문단"],
    text: { threads: "Threads 본문" },
    includes: Object.fromEntries(
      ["threads", "x", "facebook", "instagram", "shorts", "reels", "tiktok"].map((p) => [p, p === "threads"]),
    ),
    ...(draftId ? { draftId } : {}),
  }));
}

const TIKTOK_CREATOR = {
  connected: true,
  ready: true,
  creator: {
    username: "tiktoker",
    privacyLevels: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS"],
    commentDisabled: false,
    duetDisabled: false,
    stitchDisabled: false,
  },
};

async function chooseTikTokPrivacy() {
  const select = await screen.findByRole("combobox", { name: "TikTok 공개 범위" });
  fireEvent.change(select, { target: { value: "PUBLIC_TO_EVERYONE" } });
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
      // TikTok 발행은 공개 범위(privacy_level)를 사람이 골라야 열린다(PR #101). 공개 범위
      // 목록을 주는 creator-info 응답을 고정한다.
      if (typeof key === "string" && key.startsWith("/api/tiktok/creator-info")) {
        return { data: TIKTOK_CREATOR, mutate: vi.fn() };
      }
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

  // BLOCK-1(2026-10-02 독립 리뷰): 외부에는 이미 올라갔는데(또는 올라갔는지 모르는데)
  // 우리 기록만 못 남긴 신호(videoPersistenceFailure류: externalPublished:true,
  // retryPublish:false)를 평범한 "실패"로 보여주면, 사용자가 재발행 버튼을 다시 눌러
  // 같은 영상을 두 번 올린다. 이 상태는 "실패"도 "완료"도 아닌 "결과 확인 중"(재발행 버튼
  // 대상에서 제외)으로 떠야 한다.
  it("외부 게시는 확인됐지만 기록 저장에 실패한 신호는 '실패'가 아니라 '결과 확인 중'으로 떠서 재발행을 막는다", async () => {
    seedReelsStudioWork();
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-async-3" };
      if (path === "/api/video/publish") return { ok: true, status: "processing", jobId: "job-persist-fail" };
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
      if (url.includes("/api/video/publish/job/job-persist-fail")) {
        return Response.json({
          ok: false,
          externalPublished: true,
          externalId: "media-already-up",
          permalink: "https://www.instagram.com/reel/already-up/",
          error: "외부 게시에는 성공했지만 발행 기록 저장에 실패했습니다. 같은 영상을 다시 게시하지 마세요.",
          persistence: {
            ok: false, stage: "publication_record", publicationRecorded: false, queueRecorded: true,
            error: { code: "PUBLICATION_RECORD_FAILED", message: "저장 실패" },
            reconciliation: { required: true, action: "repair_persistence_only", retryPublish: false, platform: "instagram_reels" },
          },
        }, { status: 500 });
      }
      throw new Error(`unmocked fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StudioPage />);
    const button = await findEnabledButton("선택한 1곳에 지금 발행");
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/결과 확인 중/)).toBeInTheDocument(), { timeout: 8000 });
    // "실패"로 읽혔다면 재발행 버튼 라벨이 "실패한 곳만 다시 발행"으로 바뀐다 — 그러면
    // 안 된다(재발행 유도 금지).
    expect(screen.queryByRole("button", { name: "실패한 곳만 다시 발행" })).not.toBeInTheDocument();
    expect(screen.queryByText(/영상 발행에 실패했습니다/)).not.toBeInTheDocument();
  }, 15000);

  // MAJOR-3(2026-10-02 독립 리뷰): TikTok은 video/publish와 다른 자체 비동기 계약
  // ({ok:true, processing:true, publishId}, jobId도 status:"processing"도 없음)을 쓴다.
  // 이 모양을 못 잡으면 `vr?.ok && !vr.partial`로 떨어져 "완료"(링크 없는 성공)로 잘못
  // 표시된다. 실제로 끝날 때까지 /api/tiktok/publish-status를 기다려야 한다.
  it("TikTok의 202(processing+publishId)는 즉시 완료로 보여주지 않고, 상태 조회가 끝난 뒤 실제 permalink로 완료 표시한다", async () => {
    seedTikTokStudioWork();
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-tiktok-1" };
      if (path === "/api/video/publish") return { ok: true, processing: true, publishId: "tt-publish-1" };
      throw new Error(`unexpected apiPost path: ${path}`);
    });
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const accountsPlatform = /\/api\/channels\/([^/]+)\/accounts/.exec(url)?.[1];
      if (accountsPlatform) {
        const connected = accountsPlatform === "tiktok"
          ? [{ id: "tt-account", display_name: "TikTok 계정", username: "tt", is_default: true }]
          : [];
        return Response.json({ accounts: connected });
      }
      if (url.includes("/api/tiktok/publish-status")) {
        pollCount += 1;
        if (pollCount === 1) return Response.json({ ok: true, status: "processing", publishId: "tt-publish-1", error: "TikTok 계정을 다시 연결해 주세요." }, { status: 202 });
        if (pollCount < 3) return Response.json({ ok: true, status: "processing", publishId: "tt-publish-1" }, { status: 202 });
        return Response.json({ ok: true, status: "published", publishId: "tt-publish-1", url: "https://www.tiktok.com/@creator/video/real-one" });
      }
      throw new Error(`unmocked fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StudioPage />);
    await chooseTikTokPrivacy();
    const button = await findEnabledButton("선택한 1곳에 지금 발행");
    fireEvent.click(button);

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith("/api/video/publish", expect.anything(), expect.anything()));
    expect(screen.queryByRole("link", { name: /새 창/ })).not.toBeInTheDocument();

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /새 창/ });
      expect(link).toHaveAttribute("href", "https://www.tiktok.com/@creator/video/real-one");
    }, { timeout: 8000 });
    expect(pollCount).toBeGreaterThanOrEqual(3);
    expect(mocks.showToast).toHaveBeenCalledWith("TikTok 계정을 다시 연결해 주세요.", "error");
  }, 15000);

  it("TikTok 상태 조회의 409 JSON 오류를 완료로 오인하지 않고 결과 확인 중으로 남긴다", async () => {
    seedTikTokStudioWork();
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-tiktok-unknown-1" };
      if (path === "/api/video/publish") return { ok: true, processing: true, publishId: "tt-publish-unknown-1" };
      throw new Error(`unexpected apiPost path: ${path}`);
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const accountsPlatform = /\/api\/channels\/([^/]+)\/accounts/.exec(url)?.[1];
      if (accountsPlatform) {
        return Response.json({ accounts: accountsPlatform === "tiktok"
          ? [{ id: "tt-account", display_name: "TikTok 계정", username: "tt", is_default: true }]
          : [] });
      }
      if (url.includes("/api/tiktok/publish-status")) {
        return Response.json({ error: "TikTok 발행 계정을 찾을 수 없습니다. 계정 연결 상태를 확인해주세요." }, { status: 409 });
      }
      throw new Error(`unmocked fetch: ${url}`);
    }));

    render(<StudioPage />);
    await chooseTikTokPrivacy();
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));

    await waitFor(() => expect(screen.getByText(/TikTok 발행 계정을 찾을 수 없습니다/)).toBeInTheDocument(), { timeout: 8000 });
    expect(screen.queryByRole("link", { name: /새 창/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "실패한 곳만 다시 발행" })).not.toBeInTheDocument();
  }, 15000);

  // MAJOR-3 구멍(2026-10-02 재재검토): TikTok init 자체가(드물지만) 서버의 바깥 예산
  // (8초)을 넘기면, POST가 TikTok 전용 봉투({processing:true,publishId}) 대신 바깥
  // job 경로({status:"processing", jobId})를 돌려준다. 그 job이 "완료"되면 그 결과는
  // TikTok의 비동기 봉투 그대로다 — awaitAsyncVideoPublish가 이걸 ok:true로 읽어 url
  // 없는 "완료"를 내버리면 TikTok이 실제로는 아직 처리 중인데 화면은 끝났다고 말한다.
  it("TikTok init이 바깥 job 경로로 떨어져도(이중 비동기) 가짜 완료를 내지 않고 TikTok 상태 조회로 넘어간다", async () => {
    seedTikTokStudioWork();
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-tiktok-2" };
      // 바깥 예산을 넘긴 경우 — 서버가 TikTok 전용 봉투 대신 일반 job 봉투를 준다.
      if (path === "/api/video/publish") return { ok: true, status: "processing", jobId: "job-tiktok-nested" };
      throw new Error(`unexpected apiPost path: ${path}`);
    });
    let tiktokPollCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const accountsPlatform = /\/api\/channels\/([^/]+)\/accounts/.exec(url)?.[1];
      if (accountsPlatform) {
        const connected = accountsPlatform === "tiktok"
          ? [{ id: "tt-account", display_name: "TikTok 계정", username: "tt", is_default: true }]
          : [];
        return Response.json({ accounts: connected });
      }
      if (url.includes("/api/video/publish/job/job-tiktok-nested")) {
        // 바깥 job이 완료됐다 — 그 "완료된 결과"가 TikTok 자체의 비동기 봉투다.
        return Response.json({ ok: true, processing: true, publishId: "tt-publish-nested-1" });
      }
      if (url.includes("/api/tiktok/publish-status")) {
        tiktokPollCount += 1;
        if (tiktokPollCount < 2) return Response.json({ ok: true, status: "processing", publishId: "tt-publish-nested-1" }, { status: 202 });
        return Response.json({ ok: true, status: "published", publishId: "tt-publish-nested-1", url: "https://www.tiktok.com/@creator/video/nested-real" });
      }
      throw new Error(`unmocked fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StudioPage />);
    await chooseTikTokPrivacy();
    const button = await findEnabledButton("선택한 1곳에 지금 발행");
    fireEvent.click(button);

    // 핵심 단언: job이 "완료"됐다고 즉시 url 없는 "완료"로 떨어지면 안 된다 — TikTok
    // 상태 조회로 이어져 실제 permalink가 나올 때까지 기다려야 한다.
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /새 창/ });
      expect(link).toHaveAttribute("href", "https://www.tiktok.com/@creator/video/nested-real");
    }, { timeout: 8000 });
    expect(tiktokPollCount).toBeGreaterThanOrEqual(2);
  }, 15000);

  // MAJOR-6(2026-10-02 독립 리뷰): 복구 effect가 [activeWorkspace?.id, draftId]에만
  // 의존해 publishTargets(렌더 시점의 usableAccounts 결과)를 캡처한다. 새로고침 직후
  // 계정 목록이 아직 fetch 중이면 그 순간 publishTargets가 비어 있어 복구가 아무 일도
  // 하지 않는다 — 계정이 늦게 로드돼도 재시도가 없으면 복구는 "조용히 실패"한다.
  it("새로고침 직후 계정 목록이 늦게 로드돼도 보류 중인 작업을 복구한다", async () => {
    seedReelsStudioWork("draft-resume-1");
    // 새로고침 전에 이미 접수돼 있던 작업(202로 받은 jobId)을 미리 저장해 둔다 —
    // 복구 effect가 이걸 찾아 이어서 확인해야 한다.
    savePendingVideoPublishJob(mocks.workspace.id, "clip.mp4", "reels", "job-resume-1");

    let resolveReelsAccounts!: (accounts: unknown[]) => void;
    const reelsAccountsPromise = new Promise<unknown[]>((resolve) => { resolveReelsAccounts = resolve; });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const accountsPlatform = /\/api\/channels\/([^/]+)\/accounts/.exec(url)?.[1];
      if (accountsPlatform === "instagram") {
        // 계정 목록 로딩이 느린 상황을 흉내 — 이 프라미스가 풀리기 전엔 accountsLoaded가
        // false다(즉 publishTargets가 비어 있다).
        const accounts = await reelsAccountsPromise;
        return Response.json({ accounts });
      }
      if (accountsPlatform) return Response.json({ accounts: [] });
      if (url.includes("/api/video/publish/job/job-resume-1")) {
        return Response.json({ ok: true, platform: "instagram_reels", url: "https://www.instagram.com/reel/resumed/" });
      }
      throw new Error(`unmocked fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StudioPage />);

    // 계정이 아직 로딩 중인 동안에는(publishTargets가 비어 있는 동안) job을 조회하지
    // 않는다 — 이 자체는 버그가 아니다(아직 재시도 타이밍이 아닐 뿐).
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/video/publish/job/job-resume-1"))).toBe(false);

    // 계정 목록이 이제 로드된다 — accountsLoaded가 true로 바뀌는 시점에 복구 effect가
    // 다시 돌아 publishTargets(이제 reels 포함)로 job을 이어서 확인해야 한다.
    resolveReelsAccounts([{ id: "ig-account", display_name: "인스타 계정", username: "ig", is_default: true }]);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /새 창/ });
      expect(link).toHaveAttribute("href", "https://www.instagram.com/reel/resumed/");
    }, { timeout: 8000 });
  }, 15000);

  // MAJOR-5(2026-10-02 독립 리뷰): /api/publish 느린 경로는 백그라운드 Response를
  // 버리고 202만 준다. 본문 성공 + 첫 댓글 실패(partial:true)는 그 Response에만 있던
  // 정보가 아니라 published_posts.first_comment_status에도 동기 경로와 똑같이 기록되므로
  // (백그라운드도 같은 코드를 탄다) GET 상태 조회가 그걸 읽어 복원해야 한다. 못 읽으면
  // 첫 댓글이 실패했는데 "완전 성공"으로 보여준다.
  it("느린 소셜 발행에서 본문 성공 + 첫 댓글 실패는 완전 성공으로 보여주지 않는다", async () => {
    seedThreadsStudioWork("draft-firstcomment-1");
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-firstcomment-1" };
      if (path === "/api/publish") return { ok: true, processing: true, draftId: "draft-firstcomment-1", platform: "threads" };
      throw new Error(`unexpected apiPost path: ${path}`);
    });
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const accountsPlatform = /\/api\/channels\/([^/]+)\/accounts/.exec(url)?.[1];
      if (accountsPlatform) {
        const connected = accountsPlatform === "threads"
          ? [{ id: "threads-account", display_name: "Threads 계정", username: "th", is_default: true }]
          : [];
        return Response.json({ accounts: connected });
      }
      if (url.includes("/api/publish?draft_id=draft-firstcomment-1")) {
        pollCount += 1;
        if (pollCount < 2) {
          return Response.json({
            draftId: "draft-firstcomment-1", overall: "in_progress",
            targets: [{ platform: "threads", status: "processing", permalink: null, error: null, updatedAt: null, firstComment: { status: null, error: null } }],
          });
        }
        return Response.json({
          draftId: "draft-firstcomment-1", overall: "published",
          targets: [{
            platform: "threads", status: "published",
            permalink: "https://www.threads.net/@u/post/with-failed-comment",
            error: null, updatedAt: new Date().toISOString(),
            firstComment: { status: "failed", error: "첫 댓글 API 거절" },
          }],
        });
      }
      throw new Error(`unmocked fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StudioPage />);
    const button = await findEnabledButton("선택한 1곳에 지금 발행");
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/첫 댓글 발행에 실패했습니다|첫 댓글 API 거절/)).toBeInTheDocument(), { timeout: 8000 });
    // 완전 성공으로 집계되면 안 된다 — "새 창"(완료) 링크가 떠서는 안 된다.
    expect(screen.queryByRole("link", { name: /새 창/ })).not.toBeInTheDocument();
  }, 15000);

  // M-A(2026-10-02 재재검토 — 회귀): 동기(즉시 응답) /api/publish가 바로 409
  // PUBLISH_STATE_UNCERTAIN을 던지는 경우(persistence 필드 없음, code만 있음). 종전엔
  // isExternalPublishPersistenceError가 이 모양도 true로 판정해 catch 블록이
  // `e.payload.persistence.reconciliation`에서 TypeError를 내고, 그 턴의 setPub이
  // 영영 안 돌아 화면이 "발행 중"에 멈췄다.
  it("동기 409 PUBLISH_STATE_UNCERTAIN(persistence 없음)을 받아도 멈추지 않고 '결과 확인 중'으로 닫는다", async () => {
    seedThreadsStudioWork("draft-uncertain-sync-1");
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-uncertain-sync-1" };
      if (path === "/api/publish") {
        throw new ApiResponseError(
          409,
          {
            ok: false,
            code: "PUBLISH_STATE_UNCERTAIN",
            error: "직전 발행의 외부 결과를 확인하지 못했습니다. 중복 게시를 막기 위해 다시 보내지 않았습니다.",
            reconciliation: { required: true, action: "verify_with_provider", retryPublish: false, platform: "threads" },
          },
          "Request failed: 409",
        );
      }
      throw new Error(`unexpected apiPost path: ${path}`);
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const accountsPlatform = /\/api\/channels\/([^/]+)\/accounts/.exec(url)?.[1];
      if (accountsPlatform) {
        const connected = accountsPlatform === "threads"
          ? [{ id: "threads-account", display_name: "Threads 계정", username: "th", is_default: true }]
          : [];
        return Response.json({ accounts: connected });
      }
      throw new Error(`unmocked fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StudioPage />);
    const button = await findEnabledButton("선택한 1곳에 지금 발행");
    fireEvent.click(button);

    // 핵심 단언: TypeError로 멈추지 않고 턴이 끝까지 돌아 "발행 중"이 풀린다. 재발행을
    // 유도하는 "실패"가 아니라 "결과 확인 중"으로 닫혀야 한다.
    await waitFor(() => expect(screen.getByText(/결과 확인 중|외부 게시 여부를 확인하지 못했습니다/)).toBeInTheDocument(), { timeout: 8000 });
    expect(screen.queryByRole("button", { name: "실패한 곳만 다시 발행" })).not.toBeInTheDocument();
  }, 15000);

  // MINOR(2026-10-02 재재검토): effect cleanup(언마운트)이 cancelled 플래그만 세우고
  // 폴링 자체(fetch 루프)는 못 멈추면, 사용자가 화면을 떠난 뒤에도 네트워크 요청이
  // 백그라운드에서 계속 나간다. 언마운트 뒤 호출 수가 더는 늘지 않아야 한다.
  it("복구 폴링 중 언마운트하면 그 폴링(fetch)이 즉시 멈춘다", async () => {
    seedReelsStudioWork("draft-cleanup-1");
    savePendingVideoPublishJob(mocks.workspace.id, "clip.mp4", "reels", "job-cleanup-1");
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const accountsPlatform = /\/api\/channels\/([^/]+)\/accounts/.exec(url)?.[1];
      if (accountsPlatform) {
        const connected = accountsPlatform === "instagram"
          ? [{ id: "ig-account", display_name: "인스타 계정", username: "ig", is_default: true }]
          : [];
        return Response.json({ accounts: connected });
      }
      if (url.includes("/api/video/publish/job/job-cleanup-1")) {
        pollCount += 1;
        // 영원히 처리 중 — abort되지 않으면 계속 폴링된다.
        return Response.json({ ok: true, status: "processing", jobId: "job-cleanup-1" });
      }
      throw new Error(`unmocked fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<StudioPage />);
    await waitFor(() => expect(pollCount).toBeGreaterThanOrEqual(1), { timeout: 8000 });

    await act(async () => { unmount(); });
    const countAtUnmount = pollCount;

    // 기본 폴링 간격(2.5초)보다 넉넉히 기다린다 — abort가 안 됐다면 이 사이에 더 호출된다.
    await new Promise((r) => setTimeout(r, 4000));
    expect(pollCount).toBe(countAtUnmount);
  }, 15000);
});
