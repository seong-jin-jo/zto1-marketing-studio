// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioPage from "@/app/studio/page";

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  fetcher: vi.fn(),
  routerPush: vi.fn(),
  showToast: vi.fn(),
  trackEvent: vi.fn(),
  swr: vi.fn(),
  swrKeys: [] as Array<string | null>,
  isOperator: true,
  workspace: { id: "tenant-a", name: "작업 공간 A" },
  drafts: [] as Array<Record<string, unknown>>,
  currentWork: null as Record<string, unknown> | null,
  returnPosts: [] as Array<Record<string, unknown>>,
  setStudioRoom: vi.fn(),
}));

vi.mock("swr", () => ({
  default: (...args: unknown[]) => mocks.swr(...args),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: mocks.routerPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  fetcher: mocks.fetcher,
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
  isExternalPublishPersistenceError: (error: unknown) => Boolean((error as { externalPersistence?: boolean })?.externalPersistence),
  ApiResponseError: class ApiResponseError extends Error {
    payload: unknown = null;
  },
}));

vi.mock("@/components/layout/Toast", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({
    activeWorkspace: mocks.workspace,
    studioRoom: "publish",
    setStudioRoom: mocks.setStudioRoom,
  }),
}));

vi.mock("@/components/studio/PlatformPreview", () => ({
  PREVIEW_PLATFORMS: [
    "threads",
    "x",
    "facebook",
    "instagram",
    "shorts",
    "reels",
    "tiktok",
  ].map((key) => ({ key, label: key })),
  PlatformPreview: ({ platform, headerRight, editor }: { platform: string; headerRight?: React.ReactNode; editor?: {
    account: { status: string; displayName?: string; username?: string };
    title: string;
    caption: string;
    hashtags: string;
    topicTag: string;
    firstCommentSupported: boolean;
    firstCommentReason?: string;
    firstComment: string;
    onTitleChange: (value: string) => void;
    onCaptionChange: (value: string) => void;
    onHashtagsChange: (value: string) => void;
    onTopicTagChange: (value: string) => void;
    onFirstCommentChange: (value: string) => void;
  } }) => (
    <div data-testid={`preview-${platform}`}>
      {headerRight}
      <span data-testid={`account-state-${platform}`}>{editor?.account.status}</span>
      {editor?.account.displayName ? <span>{editor.account.displayName}</span> : null}
      {editor?.account.username ? <span>@{editor.account.username}</span> : null}
      <input aria-label={`${platform} 제목`} value={editor?.title ?? ""} onChange={(event) => editor?.onTitleChange(event.target.value)} />
      <textarea aria-label={`${platform} 캡션`} value={editor?.caption ?? ""} onChange={(event) => editor?.onCaptionChange(event.target.value)} />
      <input aria-label={`${platform} 해시태그`} value={editor?.hashtags ?? ""} onChange={(event) => editor?.onHashtagsChange(event.target.value)} />
      <input aria-label={`${platform} 주제 태그`} value={editor?.topicTag ?? ""} onChange={(event) => editor?.onTopicTagChange(event.target.value)} />
      {editor?.firstCommentSupported ? <textarea aria-label={`${platform} 첫 댓글`} value={editor.firstComment} onChange={(event) => editor.onFirstCommentChange(event.target.value)} /> : <span>{editor?.firstCommentReason}</span>}
    </div>
  ),
}));

vi.mock("@/components/shared/BrandSetupWizard", () => ({
  BrandSetupWizard: () => null,
}));

vi.mock("@/components/studio/RepoConnect", () => ({
  RepoConnect: () => null,
}));

vi.mock("@/components/studio/SchedulePanel", () => ({
  SchedulePanel: () => null,
}));

vi.mock("@/lib/analytics/events", () => ({
  trackEvent: mocks.trackEvent,
}));

vi.mock("@/lib/auth", () => ({
  authHeaders: () => ({}),
}));

function restoreStudio(platforms: string[]) {
  localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
    idea: "부분 성공 테스트",
    text: {
      threads: "Threads 본문",
      x: "X 본문",
      instagram: { caption: "Instagram 본문" },
      shorts: { hook: "hook", body: "body", cta: "cta" },
    },
    includes: Object.fromEntries(
      ["threads", "x", "facebook", "instagram", "shorts", "reels", "tiktok"]
        .map((platform) => [platform, platforms.includes(platform)]),
    ),
  }));
}

function draftSaveStatuses() {
  return mocks.apiPost.mock.calls
    .filter(([path]) => path === "/api/studio/drafts")
    .map(([, body]) => (body as { status: string }).status);
}

async function findEnabledButton(name: string) {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe("Studio publish result integrity", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.apiPost.mockReset();
    mocks.fetcher.mockReset();
    mocks.showToast.mockReset();
    mocks.trackEvent.mockReset();
    mocks.swr.mockReset();
    mocks.swrKeys.length = 0;
    mocks.workspace.id = "tenant-a";
    mocks.workspace.name = "작업 공간 A";
    mocks.isOperator = true;
    mocks.drafts = [];
    mocks.currentWork = null;
    mocks.returnPosts = [];
    mocks.setStudioRoom.mockReset();
    mocks.swr.mockImplementation((key: string | null) => {
      mocks.swrKeys.push(key);
      if (key === "/api/me") {
        return { data: { isOperator: mocks.isOperator }, mutate: vi.fn() };
      }
      if (key === "/api/studio/drafts?tenant_id=tenant-a") {
        return { data: { drafts: mocks.drafts, currentWork: mocks.currentWork }, mutate: vi.fn() };
      }
      if (key?.startsWith("/api/queue?status=all&returnTo=")) {
        return { data: { posts: mocks.returnPosts }, mutate: vi.fn() };
      }
      if (key === "/api/studio/brand-setup?tenant_id=tenant-a") {
        return { data: { guide: null }, mutate: vi.fn() };
      }
      if (key === "/api/publish/first-comment-capabilities") {
        return { data: { capabilities: [
          { platform: "threads", supported: true, reason: null },
          { platform: "x", supported: true, reason: null },
          { platform: "instagram", supported: true, reason: null },
          { platform: "facebook", supported: true, reason: null },
          { platform: "shorts", supported: false, reason: "YouTube 영상 발행 route에 첫 댓글 후속 호출이 아직 연결되지 않았습니다." },
          { platform: "reels", supported: false, reason: "Reels 영상 발행 route에 첫 댓글 후속 호출이 아직 연결되지 않았습니다." },
          { platform: "tiktok", supported: false, reason: "현재 TikTok provider adapter는 댓글 생성 계약을 제공하지 않습니다." },
        ] }, mutate: vi.fn() };
      }
      return { data: undefined, mutate: vi.fn() };
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const platform = /\/api\/channels\/([^/]+)\/accounts/.exec(String(input))?.[1];
      const connected = platform && ["threads", "x", "instagram"].includes(platform)
        ? [{ id: `${platform}-account`, display_name: `${platform} 계정`, username: platform, is_default: true }]
        : [];
      return Response.json({ accounts: connected });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("FE-V63-RETURN-01 정상: 인박스 큐 작업물을 발행실 상태로 복원한다", async () => {
    window.history.replaceState(null, "", "/studio?room=publish&queue_id=queue-return&from=inbox");
    mocks.returnPosts = [{
      id: "queue-return",
      text: "인박스에서 되돌린 본문",
      topic: "복귀 작업물",
      hashtags: ["복귀"],
      channels: { threads: { status: "pending" } },
      publishContext: { sourceRoute: "inbox", queuePostId: "queue-return", draftId: null },
    }];

    render(<StudioPage />);

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("검토 대기 작업물을 불러왔습니다", "success"));
    await waitFor(() => expect(screen.getByRole("button", { name: "선택한 1곳에 지금 발행" })).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Threads 발행" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "X 발행" })).not.toBeChecked();
  });

  it("FE-V63-RETURN-04 경계: 본문 없는 편집 인계 초안은 큐 본문과 초안 메타데이터를 함께 복원한다", async () => {
    window.history.replaceState(null, "", "/studio?room=publish&queue_id=queue-handoff&from=calendar&draft_id=draft-handoff");
    mocks.drafts = [{
      id: "draft-handoff",
      idea: "편집 인계 주제",
      text: null,
      editorHandoff: { kind: "video", revision: 4 },
    }];
    mocks.returnPosts = [{
      id: "queue-handoff",
      text: "편집을 마친 영상 요약",
      topic: "studio-handoff",
      videoUrl: "https://example.invalid/video.mp4",
      publishContext: { sourceRoute: "calendar", queuePostId: "queue-handoff", draftId: "draft-handoff" },
    }];

    render(<StudioPage />);

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("발행 일정 작업물을 불러왔습니다", "success"));
    expect(screen.getByText("편집 인계 주제", { exact: true })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Threads 발행" })).toBeEnabled();
      expect(screen.getByRole("checkbox", { name: "X 발행" })).toBeEnabled();
      expect(screen.getByRole("checkbox", { name: "Instagram 발행" })).toBeEnabled();
    });
    expect(screen.getByRole("button", { name: "선택한 3곳에 지금 발행" })).toBeInTheDocument();
  });

  it("FE-V63-RETURN-02 거절: URL의 큐 작업물이 없으면 빈 작업물을 발행 가능 상태로 만들지 않는다", async () => {
    window.history.replaceState(null, "", "/studio?room=publish&queue_id=missing&from=calendar");
    mocks.returnPosts = [];

    render(<StudioPage />);

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("돌아갈 작업물을 찾지 못했습니다", "error"));
    expect(screen.queryByRole("button", { name: /곳에 지금 발행/ })).not.toBeInTheDocument();
  });

  it("does not report 100% or completed, and never stores published, when every channel returns ok:false", async () => {
    restoreStudio(["threads", "x"]);
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-1" };
      if (path === "/api/publish") return { ok: false, error: "채널 미연결" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 2곳에 지금 발행"));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(4));
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.queryByText("발행 완료")).not.toBeInTheDocument();
    expect(draftSaveStatuses()).toEqual(["draft", "partial"]);
  });

  it("stores partial and counts only successful channels when results are mixed", async () => {
    restoreStudio(["threads", "x"]);
    mocks.apiPost.mockImplementation(async (path: string, body: { platform?: string }) => {
      if (path === "/api/studio/drafts") return { id: "draft-1" };
      if (path === "/api/publish" && body.platform === "threads") {
        return { ok: true, permalink: "https://www.threads.net/@example/post/1" };
      }
      if (path === "/api/publish" && body.platform === "x") {
        return { ok: false, error: "X 계정 미연결" };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 2곳에 지금 발행"));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(4));
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("일부 발행 실패")).toBeInTheDocument();
    expect(screen.getByText("X 계정 미연결")).toBeInTheDocument();
    expect(draftSaveStatuses()).toEqual(["draft", "partial"]);
  });

  it("발행-부분-03 거절: 본문 성공 뒤 첫 댓글 실패를 전체 성공과 publish_success로 세지 않는다", async () => {
    restoreStudio(["x"]);
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-first-comment" };
      if (path === "/api/publish") return {
        ok: true,
        partial: true,
        permalink: "https://x.com/example/status/1",
        firstComment: { ok: false, error: "첫 댓글 공급자 거절" },
      };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));

    await waitFor(() => expect(screen.getByText("0%")).toBeInTheDocument());
    expect(screen.getByText("첫 댓글 공급자 거절")).toBeInTheDocument();
    expect(draftSaveStatuses()).toEqual(["draft", "partial"]);
    expect(mocks.trackEvent.mock.calls.filter(([event]) => event.name === "publish_success")).toHaveLength(0);
  });

  it("발행-병렬-04 경합: 느린 첫 채널이 끝나기 전에 둘째 채널 요청을 시작한다", async () => {
    restoreStudio(["threads", "x"]);
    let releaseThreads: () => void = () => {};
    const threadsPending = new Promise<void>((resolve) => { releaseThreads = resolve; });
    mocks.apiPost.mockImplementation(async (path: string, body: { platform?: string }) => {
      if (path === "/api/studio/drafts") return { id: "draft-parallel" };
      if (path === "/api/publish" && body.platform === "threads") {
        await threadsPending;
        return { ok: true, permalink: "https://threads.net/p/1" };
      }
      if (path === "/api/publish" && body.platform === "x") return { ok: true, permalink: "https://x.com/p/2" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 2곳에 지금 발행"));

    await waitFor(() => expect(mocks.apiPost.mock.calls.some(([, body]) => (body as { platform?: string })?.platform === "x")).toBe(true));
    expect(mocks.apiPost.mock.calls.some(([, body]) => (body as { platform?: string })?.platform === "threads")).toBe(true);
    releaseThreads();
    await waitFor(() => expect(screen.getByText("100%")).toBeInTheDocument());
  });

  it("defaults publish targets to supported channels and labels generation-only video channels", async () => {
    localStorage.setItem("studio_work:tenant-a", JSON.stringify({
      idea: "기본 발행 대상 테스트",
      text: {
        threads: "Threads 본문",
        x: "X 본문",
        instagram: { caption: "Instagram 본문" },
        shorts: { hook: "hook", body: "body", cta: "cta" },
      },
    }));
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-defaults" };
      if (path === "/api/publish") return { ok: false, error: "테스트 중단" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    const publishButton = await findEnabledButton("선택한 3곳에 지금 발행");
    for (const [platform, label] of [["shorts", "Shorts"], ["reels", "Reels"], ["tiktok", "TikTok"]]) {
      expect(within(screen.getByTestId(`preview-${platform}`)).getByRole(
        "checkbox",
        { name: `${label} 발행 미지원` },
      )).toBeDisabled();
    }

    fireEvent.click(publishButton);
    await waitFor(() => {
      expect(mocks.apiPost.mock.calls.filter(([path]) => path === "/api/publish")).toHaveLength(3);
    });
    expect(mocks.apiPost.mock.calls
      .filter(([path]) => path === "/api/publish")
      .map(([, body]) => (body as { platform: string }).platform))
      .toEqual(["threads", "x", "instagram"]);
    expect(mocks.apiPost.mock.calls
      .filter(([path]) => path === "/api/publish")
      .every(([, body]) => JSON.stringify((body as { edit_format?: unknown }).edit_format) === JSON.stringify({
        kind: "video",
        aspectRatio: "9:16",
        subtitleSize: "보통",
        playbackSpeed: 1,
        voice: "차분한 남성",
      }))).toBe(true);
  });

  it("QA-PUBLISH-06 거절: 연결 계정이 0개면 모든 발행 선택과 실행을 잠그고 설정 연결을 안내한다", async () => {
    restoreStudio(["threads", "x", "instagram"]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ accounts: [] })));

    render(<StudioPage />);

    expect(await screen.findByText(/채널 연결 0\/15/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "채널 연결하기" })).toHaveAttribute("href", "/settings?tab=channels");
    expect(screen.getByTestId("publish-connect-link-x")).toHaveAttribute("href", "/channels/x");
    for (const label of ["Threads 발행", "X 발행", "Instagram 발행"]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeDisabled();
      expect(screen.getByRole("checkbox", { name: label })).not.toBeChecked();
    }
    expect(screen.getByRole("button", { name: "선택한 0곳에 지금 발행" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "지금 발행하기" })).toBeDisabled();
    // 연결된 곳이 0이면 전체 고르기도 눌러도 되는 단추가 아니다(죽은 단추 금지).
    expect(screen.getByTestId("publish-select-all")).toBeDisabled();
    expect(screen.getByTestId("publish-bulk-select-all")).toBeDisabled();
    expect(mocks.apiPost).not.toHaveBeenCalledWith("/api/publish", expect.anything());
  });

  it("FE3-PUBLISH-03 거절: 발행 이력은 발행실에 다시 노출하지 않는다", async () => {
    mocks.drafts = [{
      id: "draft-history",
      idea: "불러올 초안",
      text: { threads: "불러온 Threads 본문" },
      includes: { threads: true, x: false, facebook: false, instagram: false },
      status: "draft",
      savedAt: "2026-08-12T00:00:00Z",
    }];

    render(<StudioPage />);
    expect(screen.queryByText("발행 이력")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "불러오기" })).not.toBeInTheDocument();
  });

  it("FE-CURRENT-01 정상: 작업물 전체에서 서버가 판정한 현재 작업을 편집실로 이어간다", async () => {
    mocks.drafts = [{
      id: "draft-current",
      idea: "고객 사례 카드뉴스",
      text: { threads: "서버에 저장된 현재 본문" },
      includes: { threads: true },
      status: "draft",
      savedAt: "2026-08-29T08:10:00.000Z",
    }];
    mocks.currentWork = {
      draftId: "draft-current",
      idea: "고객 사례 카드뉴스",
      stage: "edit",
      stageLabel: "편집실",
      status: "draft",
      savedAt: "2026-08-29T08:10:00.000Z",
    };

    render(<StudioPage />);
    fireEvent.click(screen.getByRole("button", { name: /작업물 전체/ }));

    expect(screen.getByText("고객 사례 카드뉴스", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이어 편집하기" }));

    expect(mocks.setStudioRoom).toHaveBeenCalledWith("edit");
    expect(mocks.showToast).toHaveBeenCalledWith("불러옴. 수정 후 재발행 가능", "success");
  });

  it("FE-CURRENT-02 거절: 현재 작업이 다른 초안 ID를 가리키면 이어하기를 노출하지 않는다", () => {
    mocks.drafts = [{ id: "draft-owned", idea: "내 작업", text: { threads: "본문" } }];
    mocks.currentWork = {
      draftId: "draft-missing",
      idea: "잘못 연결된 작업",
      stage: "edit",
      stageLabel: "편집실",
      status: "draft",
      savedAt: "2026-08-29T08:10:00.000Z",
    };

    render(<StudioPage />);
    fireEvent.click(screen.getByRole("button", { name: /작업물 전체/ }));

    expect(screen.queryByRole("button", { name: "이어 편집하기" })).not.toBeInTheDocument();
    expect(screen.queryByText("잘못 연결된 작업", { exact: true })).not.toBeInTheDocument();
  });

  it("FE3-PUBLISH-04 거절: 본문이 없으면 실행 단추를 노출하지 않는다", async () => {
    mocks.drafts = [{ id: "draft-empty", idea: "빈 초안", text: null, status: "draft", savedAt: "2026-08-12T00:00:00Z" }];
    render(<StudioPage />);
    expect(screen.queryByText("본문 없음 · 재생성 필요")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish/ })).not.toBeInTheDocument();
  });

  it("FE3-PUBLISH-05 거절: 발행실은 생성 명령과 설정 단추 목록을 노출하지 않는다", async () => {
    render(<StudioPage />);
    expect(screen.queryByPlaceholderText("글감 / 콘텐츠 주제 입력")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "OSMU 생성" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /AI 자동초안/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /브랜드 설정/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /위키/ })).not.toBeInTheDocument();
  });

  it("TC-F2: 발행 성공은 permalink 링크와 published 저장으로 닫힌다", async () => {
    restoreStudio(["threads"]);
    mocks.apiPost.mockImplementation(async (path: string, body: { status?: string }) => {
      if (path === "/api/studio/drafts") return { id: "draft-1", status: body.status };
      if (path === "/api/publish") return { ok: true, permalink: "https://www.threads.net/@example/post/ok" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));

    const link = await screen.findByTitle("게시물 보기");
    expect(link).toHaveAttribute("href", "https://www.threads.net/@example/post/ok");
    expect(screen.getByRole("link", { name: "성과실에서 결과 보기" })).toHaveAttribute("href", "/performance");
    expect(draftSaveStatuses()).toEqual(["draft", "published"]);
    expect(mocks.showToast).toHaveBeenCalledWith("발행 완료", "success");
  });

  it("V68-PUBLISH-01 거절: 발행 성공 전에는 성과실 결과 링크를 노출하지 않는다", async () => {
    restoreStudio(["threads"]);
    render(<StudioPage />);

    expect(await screen.findByRole("button", { name: "선택한 1곳에 지금 발행" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "성과실에서 결과 보기" })).not.toBeInTheDocument();
  });

  it("FE2-PUB-01 정상: 지원 채널 첫 댓글은 미리보기에서 편집되고 발행 API에 전달된다", async () => {
    restoreStudio(["threads"]);
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-first-comment" };
      if (path === "/api/publish") return { ok: true, permalink: "https://www.threads.net/@example/post/comment" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.change(await screen.findByLabelText("threads 첫 댓글"), { target: { value: "첫 댓글 본문" } });
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));

    await waitFor(() => expect(mocks.apiPost.mock.calls.some(([path, body]) => path === "/api/publish" && (body as { first_comment?: string }).first_comment === "첫 댓글 본문")).toBe(true));
  });

  it("FE2-PUB-02 거절: 미지원 채널은 첫 댓글 입력 대신 백엔드 사유를 표시한다", async () => {
    render(<StudioPage />);
    expect(await within(screen.getByTestId("preview-tiktok")).findByText("현재 TikTok provider adapter는 댓글 생성 계약을 제공하지 않습니다.")).toBeInTheDocument();
    expect(within(screen.getByTestId("preview-tiktok")).queryByRole("textbox", { name: "tiktok 첫 댓글" })).not.toBeInTheDocument();
  });

  it("FE3-PUBLISH-01 정상: 발행 체크와 계정 선택은 각 미리보기 칸 머리에 있다", async () => {
    render(<StudioPage />);
    const threads = within(await screen.findByTestId("preview-threads"));
    expect(threads.getByRole("checkbox", { name: "Threads 발행" })).toBeChecked();
    expect(screen.queryByText("발행 채널")).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "발행 담당 대화창" })).toBeInTheDocument();
  });

  it("PUB-DRAFT-UI-01 정상: 플랫폼 필드와 선택 계정을 임시 저장하고 같은 초안에서 복원한다", async () => {
    restoreStudio(["threads", "instagram"]);
    mocks.apiPost.mockResolvedValue({ id: "draft-v67" });

    render(<StudioPage />);
    fireEvent.change(await screen.findByLabelText("shorts 제목"), { target: { value: "쇼츠 제목" } });
    fireEvent.change(screen.getByLabelText("instagram 캡션"), { target: { value: "채널별 캡션" } });
    fireEvent.change(screen.getByLabelText("instagram 해시태그"), { target: { value: "#하나 #둘" } });
    fireEvent.change(screen.getByLabelText("threads 주제 태그"), { target: { value: "운영팁" } });
    fireEvent.change(screen.getByTestId("publish-account-select-instagram"), { target: { value: "instagram-account" } });
    fireEvent.click(screen.getAllByRole("button", { name: "임시 저장하기" })[0]);

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith("/api/studio/drafts", expect.objectContaining({
      titles: expect.objectContaining({ shorts: "쇼츠 제목" }),
      captions: expect.objectContaining({ instagram: "채널별 캡션" }),
      hashtags: expect.objectContaining({ instagram: "#하나 #둘" }),
      topicTags: expect.objectContaining({ threads: "운영팁" }),
      selectedAccounts: expect.objectContaining({ instagram: "instagram-account" }),
    })));
  });

  it("PUB-DRAFT-UI-02 거절: 임시 저장 오류를 사용자에게 알리고 성공으로 표시하지 않는다", async () => {
    restoreStudio(["threads"]);
    mocks.apiPost.mockRejectedValue(new Error("초안 저장 요청에 실패했습니다"));

    render(<StudioPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "임시 저장하기" })[0]);

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "초안 저장 요청에 실패했습니다",
      "error",
    ));
    expect(mocks.showToast).not.toHaveBeenCalledWith("임시 저장했습니다", "success");
  });

  it("FE3-PUBLISH-02 거절: 미지원 영상 채널은 미리보기 안에서 발행 체크를 잠근다", async () => {
    render(<StudioPage />);
    const tiktok = within(await screen.findByTestId("preview-tiktok"));
    expect(tiktok.getByRole("checkbox", { name: "TikTok 발행 미지원" })).toBeDisabled();
  });

  it("FE3-REVIEW-01 정상: 검토 요청은 큐 생성 뒤 기존 검토 API를 호출한다", async () => {
    restoreStudio(["threads"]);
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-review" };
      if (path === "/api/queue/add") return { post: { id: "queue-review" } };
      if (path === "/api/queue/queue-review/request-review") return { reused: false };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await screen.findByRole("button", { name: "검토 요청하기" }));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/queue/queue-review/request-review",
      expect.objectContaining({ tenant_id: "tenant-a" }),
    ));
    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/queue/add",
      expect.objectContaining({ draftId: "draft-review" }),
    );
    expect(mocks.showToast).toHaveBeenCalledWith("검토 요청을 보냈습니다", "success");
  });

  it("FE3-REVIEW-02 거절: 초안 저장 실패 시 큐와 검토 API를 호출하지 않는다", async () => {
    restoreStudio(["threads"]);
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") throw new Error("초안 저장 실패");
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await screen.findByRole("button", { name: "검토 요청하기" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("초안 저장 실패", "error"));
    expect(mocks.apiPost.mock.calls.some(([path]) => path === "/api/queue/add")).toBe(false);
    expect(mocks.apiPost.mock.calls.some(([path]) => String(path).includes("request-review"))).toBe(false);
  });

  it("M3-STUDIO-01 정상: 작업 공간을 바꾸면 각 공간의 저장 상태만 복원한다", async () => {
    localStorage.setItem("studio_work:tenant-a", JSON.stringify({
      idea: "A 작업물",
      text: { threads: "A 작업 공간 본문" },
      includes: { threads: true },
    }));
    localStorage.setItem("studio_work:tenant-b", JSON.stringify({
      idea: "B 작업물",
      text: { threads: "B 작업 공간 본문" },
      includes: { threads: true },
    }));
    const view = render(<StudioPage />);

    expect(await screen.findByText("A 작업물", { exact: true })).toBeInTheDocument();
    mocks.workspace.id = "tenant-b";
    mocks.workspace.name = "작업 공간 B";
    view.rerender(<StudioPage />);

    expect(await screen.findByText("B 작업물", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("A 작업물", { exact: true })).not.toBeInTheDocument();
  });

  it("M3-STUDIO-02 거절: 작업 공간 없는 옛 공용 저장 키는 복원하지 않는다", async () => {
    localStorage.setItem("studio_work", JSON.stringify({
      idea: "다른 작업 공간에서 남은 작업물",
      text: { threads: "누수 본문" },
    }));

    render(<StudioPage />);

    await waitFor(() => expect(localStorage.getItem("studio_work")).toBeNull());
    expect(screen.queryByText("다른 작업 공간에서 남은 작업물", { exact: true })).not.toBeInTheDocument();
  });

  it("M4-STUDIO-01 거절: 큐에 연결된 초안과 URL 초안이 다르면 둘 다 불러오지 않는다", async () => {
    window.history.replaceState(null, "", "/studio?room=publish&queue_id=queue-a&from=inbox&draft_id=draft-b");
    mocks.drafts = [{ id: "draft-b", idea: "주입된 B 초안", text: { threads: "B 본문" } }];
    mocks.returnPosts = [{
      id: "queue-a",
      text: "A 큐 본문",
      publishContext: { sourceRoute: "inbox", queuePostId: "queue-a", draftId: "draft-a" },
    }];

    render(<StudioPage />);

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "주소의 초안과 작업물 연결 정보가 달라 불러오지 않았습니다",
      "error",
    ));
    expect(screen.queryByText("주입된 B 초안", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /곳에 지금 발행/ })).not.toBeInTheDocument();
  });

  it("M5-STUDIO-01 경합: 플랫폼 둘의 외부 성공 뒤 기록 실패를 모두 복구 지도에 보존한다", async () => {
    restoreStudio(["threads", "x"]);
    mocks.apiPost.mockImplementation(async (path: string, body: { platform?: string; publishReconciliations?: Record<string, unknown> }) => {
      if (path === "/api/studio/drafts" && body.publishReconciliations) return { id: "draft-reconcile" };
      if (path === "/api/studio/drafts") return { id: "draft-reconcile" };
      if (path === "/api/publish" && body.platform) {
        const platform = body.platform;
        throw Object.assign(new Error(`${platform} 기록 실패`), {
          externalPersistence: true,
          payload: {
            permalink: `https://example.test/${platform}`,
            persistence: {
              reconciliation: {
                required: true,
                action: "repair_persistence_only",
                retryPublish: false,
                draftId: "draft-reconcile",
                platform,
                accountId: null,
                externalId: `external-${platform}`,
                permalink: `https://example.test/${platform}`,
              },
            },
          },
        });
      }
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 2곳에 지금 발행"));

    await waitFor(() => expect(mocks.apiPost.mock.calls.some(([path, body]) => {
      if (path !== "/api/studio/drafts") return false;
      const draft = body as { id?: string; publishReconciliations?: Record<string, unknown> };
      const keys = Object.keys(draft.publishReconciliations ?? {});
      return draft.id === "draft-reconcile" && keys.includes("threads") && keys.includes("x");
    })).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "선택한 2곳에 지금 발행" }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "외부 게시가 이미 완료된 항목입니다. 재발행하지 말고 내부 기록을 먼저 복구하세요.",
      "error",
    ));
    expect(mocks.apiPost.mock.calls.filter(([path]) => path === "/api/publish")).toHaveLength(2);
  });

  it("M5-STUDIO-02 거절: 발행 전 초안 ID를 확보하지 못하면 외부 발행을 시작하지 않는다", async () => {
    restoreStudio(["threads"]);
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return null;
      if (path === "/api/publish") throw new Error("외부 발행이 호출되면 안 됩니다");
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "발행할 초안을 저장하지 못했습니다",
      "error",
    ));
    expect(mocks.apiPost.mock.calls.filter(([path]) => path === "/api/publish")).toHaveLength(0);
  });

  it("M5-STUDIO-03 거절: 발행 전 초안 저장이 오류를 올려도 알림 뒤 외부 발행을 막는다", async () => {
    restoreStudio(["threads"]);
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") throw new Error("초안 저장 실패");
      if (path === "/api/publish") throw new Error("외부 발행이 호출되면 안 됩니다");
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "발행할 초안을 저장하지 못했습니다",
      "error",
    ));
    expect(mocks.apiPost.mock.calls.filter(([path]) => path === "/api/publish")).toHaveLength(0);
  });

  it("M5-STUDIO-04 거절: 외부 발행 뒤 결과 저장 실패를 사용자에게 알린다", async () => {
    restoreStudio(["threads"]);
    let draftSaveCount = 0;
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") {
        draftSaveCount += 1;
        if (draftSaveCount === 1) return { id: "draft-result-save" };
        throw new Error("발행 결과 저장 실패");
      }
      if (path === "/api/publish") return { ok: true, permalink: "https://example.test/published" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));

    // 2026-09-05: 일부만 실패했을 때 성공한 채널을 같이 알린다. 종전 문구는 실패만 보여
    // 전부 실패한 것처럼 읽혔다(회장 실사용에서 threads 는 올라갔는데 전체 오류로 보임).
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      expect.stringContaining("발행 결과를 저장하지 못했습니다"),
      "error",
    ));
    const [[resultMessage]] = mocks.showToast.mock.calls.slice(-1);
    expect(resultMessage).toContain("발행됨");
    expect(mocks.apiPost.mock.calls.filter(([path]) => path === "/api/publish")).toHaveLength(1);
  });

  // 2026-09-05 회장 실사용 회귀: 외부에는 올라갔는데 내부 기록이 없으면 발행이 막히는데,
  // 정작 그 상태를 푸는 방법이 화면에 없어 막다른 길이었다. 한 번 눌러 닫을 수 있어야 한다.
  it("발행-복구-01 정상: 외부 게시 완료 상태를 한 번 눌러 기록으로 닫는다", async () => {
    restoreStudio(["threads"]);
    let draftSaves = 0;
    mocks.apiPost.mockImplementation(async (path: string, body: { status?: string }) => {
      if (path === "/api/studio/drafts") { draftSaves += 1; return { id: "draft-reconcile", status: body.status }; }
      if (path === "/api/publish") {
        const error = new Error("외부 게시 완료") as Error & { payload?: unknown; externalPersistence?: boolean };
        error.externalPersistence = true;
        error.payload = {
          permalink: "https://www.threads.net/@example/post/kept",
          persistence: { reconciliation: { required: true, action: "verify_with_provider", retryPublish: false, platform: "threads" } },
        };
        throw error;
      }
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));

    const resolve = await screen.findByTestId("publish-reconciliation-resolve");
    const savesBefore = draftSaves;
    fireEvent.click(resolve);

    await waitFor(() => expect(screen.queryByTestId("publish-reconciliation-resolve")).toBeNull());
    expect(draftSaves).toBeGreaterThan(savesBefore);
    expect(mocks.apiPost.mock.calls.filter(([path]) => path === "/api/publish")).toHaveLength(1);
  });

  // 2026-09-05 회장 실사용 회귀: 발행 뒤에도 발행 버튼이 그대로 남아 다시 누르면 이미 올라간
  // 채널까지 재발행 대상이 됐다. 성공한 채널은 두 번째 클릭에서 제외돼야 한다.
  it("발행-중복-01 거절: 이미 성공한 채널은 다시 눌러도 재발행하지 않는다", async () => {
    restoreStudio(["threads"]);
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-no-republish" };
      if (path === "/api/publish") return { ok: true, permalink: "https://example.test/published" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));
    await waitFor(() => expect(
      mocks.apiPost.mock.calls.filter(([path]) => path === "/api/publish"),
    ).toHaveLength(1));

    // 발행 뒤에도 대화 패널의 발행 단추는 남는다. 회장이 다시 누른 자리가 여기다.
    fireEvent.click(await findEnabledButton("지금 발행하기"));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      expect.stringContaining("이미 발행됐습니다"),
      "success",
    ));
    expect(mocks.apiPost.mock.calls.filter(([path]) => path === "/api/publish")).toHaveLength(1);
  });

  it("V74-PUBLISH-READY-01 경합: 계정 조회가 늦어도 활성화된 뒤 발행을 시작한다", async () => {
    restoreStudio(["threads"]);
    let releaseAccounts: () => void = () => {};
    const accountsPending = new Promise<void>((resolve) => { releaseAccounts = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      await accountsPending;
      const platform = /\/api\/channels\/([^/]+)\/accounts/.exec(String(input))?.[1];
      const accounts = platform === "threads"
        ? [{ id: "threads-account", display_name: "Threads 계정", username: "threads", is_default: true }]
        : [];
      return Response.json({ accounts });
    }));
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-slow-accounts" };
      if (path === "/api/publish") return { ok: false, error: "테스트 발행 거절" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    const publishButton = await screen.findByRole("button", { name: "선택한 1곳에 지금 발행" });
    expect(publishButton).toBeDisabled();
    expect(mocks.apiPost).not.toHaveBeenCalled();

    releaseAccounts();
    await waitFor(() => expect(publishButton).toBeEnabled());
    fireEvent.click(publishButton);

    await waitFor(() => expect(mocks.apiPost.mock.calls.filter(([path]) => path === "/api/publish")).toHaveLength(1));
  });

  it("V65-PAGE-01 정상: 글을 직접 고친 뒤 저장 API를 호출하고 발행실로 이동한다", async () => {
    window.history.replaceState(null, "", "/studio?room=edit");
    localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
      idea: "편집실 이동 테스트",
      text: {
        threads: "고치기 전 본문",
        x: "고치기 전 본문",
        facebook: "고치기 전 본문",
        instagram: { caption: "고치기 전 본문", slides: ["고치기 전 본문"] },
      },
      editLines: ["고치기 전 본문"],
      editKind: "text",
      editFormat: { kind: "text" },
    }));
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-v65" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    const editor = await screen.findByRole("textbox", { name: "글 전체" });
    fireEvent.change(editor, { target: { value: "발행실로 넘길 본문" } });
    fireEvent.click(screen.getByRole("button", { name: "발행실로 이동" }));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith("/api/studio/drafts", expect.objectContaining({
      id: null,
      editKind: "text",
      editFormat: { kind: "text" },
      editLines: ["발행실로 넘길 본문"],
      text: expect.objectContaining({
        threads: "발행실로 넘길 본문",
        x: "발행실로 넘길 본문",
        facebook: "발행실로 넘길 본문",
      }),
    })));
    expect(mocks.setStudioRoom).toHaveBeenCalledWith("publish");
    expect(window.location.pathname + window.location.search).toBe("/studio?room=publish");
  });
});

describe("Studio Higgsfield operator boundary", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.apiPost.mockReset();
    mocks.fetcher.mockReset();
    mocks.showToast.mockReset();
    mocks.swr.mockReset();
    mocks.swrKeys.length = 0;
    mocks.isOperator = false;
    mocks.swr.mockImplementation((key: string | null) => {
      mocks.swrKeys.push(key);
      if (key === "/api/me") {
        return { data: { isOperator: false }, mutate: vi.fn() };
      }
      if (key === "/api/studio/drafts?tenant_id=tenant-a") {
        return { data: { drafts: [] }, mutate: vi.fn() };
      }
      if (key === "/api/studio/brand-setup?tenant_id=tenant-a") {
        return { data: { guide: null }, mutate: vi.fn() };
      }
      return { data: undefined, mutate: vi.fn() };
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ accounts: [] })));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("FE3-OPERATOR-01 거절: 발행실은 운영자 전용 생성 API와 제어를 노출하지 않는다", async () => {
    render(<StudioPage />);
    expect(mocks.swrKeys.filter((key) => key?.startsWith("/api/higgsfield/"))).toEqual([]);
    expect(mocks.apiPost.mock.calls.map(([path]) => path).filter((path) => (
      String(path).startsWith("/api/higgsfield/")
    ))).toEqual([]);
    expect(screen.queryByRole("button", { name: "OSMU 생성" })).not.toBeInTheDocument();
    expect(screen.queryByTitle("사용 이력 보기")).not.toBeInTheDocument();
  });
});
