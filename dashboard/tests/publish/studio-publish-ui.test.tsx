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
  // 2026-10-03 운영 사고(9444 회원 계정) 재현용: TikTok 발행 패널(creator-info) 테스트가
  // 쓴다. 기본은 "TikTok 미연결"(다른 테스트 전부가 가정하는 상태)과 같다.
  connectedPlatforms: ["threads", "x", "instagram"] as string[],
  tiktokCreator: undefined as Record<string, unknown> | undefined,
  // 2026-10-03 독립 리뷰 m2: creator-info 404/502 재현용.
  tiktokCreatorError: undefined as Error | undefined,
  bakeLineage: undefined as Record<string, unknown> | undefined,
}));

vi.mock("swr", () => ({
  default: (...args: unknown[]) => mocks.swr(...args),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: mocks.routerPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetcher: mocks.fetcher,
    apiPost: (...args: unknown[]) => mocks.apiPost(...args),
    isExternalPublishPersistenceError: (error: unknown) => Boolean((error as { externalPersistence?: boolean })?.externalPersistence),
    ApiResponseError: class ApiResponseError extends Error {
      payload: unknown = null;
    },
  };
});

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

/**
 * page.tsx의 videoFilename()은 `/api/media/<base64url(JSON).시그니처>`에서 JSON의 `.f`
 * (파일명)만 **서버 서명 검증 없이** 읽는다(클라이언트는 표시용으로 꺼낼 뿐, 실제 서명
 * 검증은 서버가 한다). 그래서 "returned-video.mp4" 같은 맨 문자열을 videoUrl로 주면
 * videoFilename()이 빈 문자열을 돌려줘 "올릴 영상이 없습니다"로 막혀 /api/video/publish
 * 자체가 안 불린다 — TikTok 요청 바디를 검증하려는 테스트에서는 이 모양을 맞춰야 한다.
 */
function fakeMediaUrl(filename: string): string {
  const payload = JSON.stringify({ v: 1, t: "tenant-a", f: filename, e: Date.now() + 999_999 });
  const body = Buffer.from(payload, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `/api/media/${body}.fakesig`;
}

function restoreStudio(platforms: string[]) {
  localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
    idea: "부분 성공 테스트",
    editLines: ["가장 최신 문단"],
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
    mocks.connectedPlatforms = ["threads", "x", "instagram"];
    mocks.tiktokCreator = undefined;
    mocks.tiktokCreatorError = undefined;
    mocks.bakeLineage = undefined;
    mocks.swr.mockImplementation((key: string | null) => {
      mocks.swrKeys.push(key);
      if (key === "/api/me") {
        return { data: { isOperator: mocks.isOperator }, mutate: vi.fn() };
      }
      if (key === "/api/studio/drafts?tenant_id=tenant-a") {
        return { data: { drafts: mocks.drafts, currentWork: mocks.currentWork }, mutate: vi.fn() };
      }
      if (key?.startsWith("/api/video/subtitle?tenant_id=tenant-a&filename=")) {
        return { data: mocks.bakeLineage, mutate: vi.fn() };
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
      // 2026-09-16: GettingStartedStrip이 자체 조회하는 두 훅. 실제 화면에서는 이 조회가
      // 끝까지 가면(성공하면) 빈 객체로 resolve된다 -- "조회 안 함"과 "조회했더니 0개"는
      // 다르다(회장 실측: 로딩 중을 0으로 잘못 읽어 "0/15" 가 다른 화면의 "3/15" 와
      // 갈렸다). 이 표를 다른 키처럼 영구 undefined 로 두면 그 구분을 이 테스트가
      // 검증할 수 없으므로, 조회가 끝난 상태(빈 채널 설정)로 고정한다.
      if (key === "/api/channel-config") {
        return { data: {}, mutate: vi.fn() };
      }
      if (key === "/api/onboarding") {
        return { data: { checklist: {} }, mutate: vi.fn() };
      }
      if (typeof key === "string" && key.startsWith("/api/tiktok/creator-info")) {
        return { data: mocks.tiktokCreator, error: mocks.tiktokCreatorError, mutate: vi.fn() };
      }
      return { data: undefined, mutate: vi.fn() };
    });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const inputUrl = String(input);
      if (inputUrl.includes("/api/studio/drafts?") && inputUrl.includes("&id=")) {
        const id = new URL(inputUrl, "http://localhost").searchParams.get("id");
        return Response.json({ draft: mocks.drafts.find((draft) => draft.id === id) ?? null });
      }
      const platform = /\/api\/channels\/([^/]+)\/accounts/.exec(String(input))?.[1];
      const connected = platform && mocks.connectedPlatforms.includes(platform)
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

  // 2026-10-03 독립 리뷰 MINOR-g 근본원인 수정: 복원된 선택이 아무 표시 없이 되살아난
  // 것이 운영 사고의 뿌리였다. 복원 직후에는 "지난번 선택 유지" 배지가 보여야 하고,
  // 사용자가 체크박스를 한 번이라도 직접 누르면 그 배지는 사라져야 한다(그 다음부터는
  // "방금 내가 고른 것"이기 때문).
  it("MINOR-g 정상: 인박스 복귀로 되살아난 선택은 '지난번 선택 유지' 배지로 드러나고, 직접 체크하면 사라진다", async () => {
    window.history.replaceState(null, "", "/studio?room=publish&queue_id=queue-restore-notice&from=inbox");
    mocks.returnPosts = [{
      id: "queue-restore-notice",
      text: "인박스에서 되돌린 본문",
      topic: "복귀 작업물",
      hashtags: ["복귀"],
      channels: { threads: { status: "pending" } },
      publishContext: { sourceRoute: "inbox", queuePostId: "queue-restore-notice", draftId: null },
    }];

    render(<StudioPage />);

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Threads 발행" })).toBeChecked());
    expect(screen.getByTestId("publish-restored-selection-notice")).toHaveTextContent("지난번 선택 유지: Threads");

    fireEvent.click(screen.getByRole("checkbox", { name: "Threads 발행" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Threads 발행" }));

    expect(screen.queryByTestId("publish-restored-selection-notice")).not.toBeInTheDocument();
  });

  // 2026-10-03 독립 리뷰 MINOR-h: 상단 배너와 "지금 발행" 버튼 옆 배지가 서로 다른
  // 출처(selectedTargets vs publishTargets)에서 채널 이름을 가져와 서로 다른 이름을
  // 보여줄 수 있었다. 둘은 항상 같은 이름을 보여줘야 한다.
  it("MINOR-h 정상: 상단 배너와 발행 버튼 옆 배지가 같은 채널 이름을 보여준다", async () => {
    window.history.replaceState(null, "", "/studio?room=publish&queue_id=queue-single-source&from=inbox");
    mocks.returnPosts = [{
      id: "queue-single-source",
      text: "인박스에서 되돌린 본문",
      topic: "단일 정본 작업물",
      hashtags: ["복귀"],
      channels: { threads: { status: "pending" } },
      publishContext: { sourceRoute: "inbox", queuePostId: "queue-single-source", draftId: null },
    }];

    render(<StudioPage />);

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Threads 발행" })).toBeChecked());
    await waitFor(() => expect(screen.getByTestId("publish-now-target-names")).toBeInTheDocument());

    expect(screen.getByTestId("publish-availability")).toHaveTextContent("Threads");
    expect(screen.getByTestId("publish-now-target-names")).toHaveTextContent("Threads");
  });

  // 2026-10-03 운영 사고(9444 회원 계정): TikTok 발행이 공개 범위(privacy_level) 없이도
  // /api/video/publish를 불러 매번 400 "TikTok 공개 범위를 직접 선택해주세요"로 실패했다
  // (route.ts:727-729). 발행실에는 그 값을 고르는 자리 자체가 없었다.
  it("TikTok-01 정상: 공개 범위를 고르면 /api/video/publish 요청에 privacy_level이 실린다", async () => {
    mocks.connectedPlatforms = ["threads", "x", "instagram", "tiktok"];
    mocks.tiktokCreator = {
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
    window.history.replaceState(null, "", "/studio?room=publish&from=inbox&queue_id=queue-tiktok-privacy");
    mocks.returnPosts = [{
      id: "queue-tiktok-privacy",
      text: "TikTok용 영상 본문",
      topic: "TikTok 영상 복귀",
      videoUrl: fakeMediaUrl("returned-video.mp4"),
      channels: { tiktok: { status: "pending" } },
    }];
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    mocks.apiPost.mockImplementation(async (path: string, body: Record<string, unknown>) => {
      calls.push({ path, body });
      if (path === "/api/studio/drafts") return { id: "draft-tiktok-1" };
      if (path === "/api/video/publish") return { ok: true, url: "https://www.tiktok.com/@tiktoker/video/1" };
      return {};
    });

    render(<StudioPage />);

    await waitFor(() => expect(screen.getByTestId("tiktok-privacy-panel")).toBeInTheDocument());
    // 절대 기본값을 미리 고르지 않는다 — 고르기 전에는 "선택"뿐이다.
    expect(screen.getByRole("combobox", { name: "TikTok 공개 범위" })).toHaveValue("");
    fireEvent.change(screen.getByRole("combobox", { name: "TikTok 공개 범위" }), { target: { value: "PUBLIC_TO_EVERYONE" } });

    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));

    await waitFor(() => expect(calls.some((call) => call.path === "/api/video/publish")).toBe(true));
    const videoCall = calls.find((call) => call.path === "/api/video/publish");
    expect(videoCall?.body.platform).toBe("tiktok");
    expect(videoCall?.body.privacy_level).toBe("PUBLIC_TO_EVERYONE");
    expect(videoCall?.body.is_ai_generated).toBe(true);
    expect(typeof videoCall?.body.disable_comment).toBe("boolean");
    expect(typeof videoCall?.body.disable_duet).toBe("boolean");
    expect(typeof videoCall?.body.disable_stitch).toBe("boolean");
  });

  it("TikTok-02 거절: 공개 범위를 고르지 않으면 '지금 발행'이 TikTok을 막고 그 이유를 말한다", async () => {
    mocks.connectedPlatforms = ["threads", "x", "instagram", "tiktok"];
    mocks.tiktokCreator = {
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
    window.history.replaceState(null, "", "/studio?room=publish&from=inbox&queue_id=queue-tiktok-blocked");
    mocks.returnPosts = [{
      id: "queue-tiktok-blocked",
      text: "TikTok용 영상 본문",
      topic: "TikTok 영상 복귀",
      videoUrl: fakeMediaUrl("returned-video.mp4"),
      channels: { tiktok: { status: "pending" } },
    }];
    mocks.apiPost.mockImplementation(async (path: string) => {
      // 공개 범위 없이 이 경로가 불리면 그 자체가 결함이다(운영 사고 재현).
      if (path === "/api/video/publish") throw new Error("공개 범위 없이 발행 요청이 나가면 안 된다");
      return {};
    });

    render(<StudioPage />);

    await waitFor(() => expect(screen.getByTestId("tiktok-privacy-panel")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "TikTok 발행" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "TikTok 발행" })).toBeDisabled();
    await within(screen.getByTestId("preview-tiktok")).findByText("TikTok 공개 범위를 먼저 선택해주세요.");

    expect(screen.getByRole("button", { name: "선택한 0곳에 지금 발행" })).toBeDisabled();
    expect(mocks.apiPost).not.toHaveBeenCalledWith("/api/video/publish", expect.anything());
  });

  // 2026-10-03 독립 리뷰 m1: Threads+TikTok을 섞어 고르고 TikTok 공개 범위를 안 고르면
  // 가드에 걸려 빠진 TikTok이 발행 버튼 옆에 이름+이유로 드러나야 한다.
  it("m1 정상: Threads+TikTok을 섞어 고르면 가드에 걸려 빠진 TikTok이 이름+이유로 보인다", async () => {
    mocks.connectedPlatforms = ["threads", "x", "instagram", "tiktok"];
    mocks.tiktokCreator = {
      connected: true,
      ready: true,
      creator: { username: "tiktoker", privacyLevels: ["PUBLIC_TO_EVERYONE"], commentDisabled: false, duetDisabled: false, stitchDisabled: false },
    };
    window.history.replaceState(null, "", "/studio?room=publish&from=inbox&queue_id=queue-mixed-tiktok");
    mocks.returnPosts = [{
      id: "queue-mixed-tiktok",
      text: "Threads+TikTok 혼합 본문",
      topic: "혼합 발행",
      videoUrl: fakeMediaUrl("returned-video.mp4"),
      channels: { threads: { status: "pending" }, tiktok: { status: "pending" } },
    }];

    render(<StudioPage />);

    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Threads 발행" })).toBeChecked());
    // TikTok은 체크는 됐지만(사용자 의도) 공개 범위 미선택으로 실제 발행 대상에서 빠진다.
    expect(screen.getByRole("checkbox", { name: "TikTok 발행" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "선택한 1곳에 지금 발행" })).toBeInTheDocument();
    expect(screen.getByTestId("publish-guard-excluded")).toHaveTextContent("TikTok: TikTok 공개 범위를 먼저 선택해주세요.");
  });

  // 2026-10-03 독립 리뷰 m2: creator-info가 404/502를 주면 고를 칸 없이 "선택해주세요"만
  // 뜨는 막다른 길이 아니라, 오류 문구와 재연결 안내가 보여야 한다.
  it("m2 거절: creator-info가 실패하면 오류 문구와 재연결 안내를 보여준다(막다른 길 금지)", async () => {
    mocks.connectedPlatforms = ["threads", "x", "instagram", "tiktok"];
    mocks.tiktokCreator = undefined; // creator-info 조회 실패 → data 없음
    mocks.tiktokCreatorError = new Error("API error: 502");
    window.history.replaceState(null, "", "/studio?room=publish&from=inbox&queue_id=queue-tiktok-creator-fail");
    mocks.returnPosts = [{
      id: "queue-tiktok-creator-fail",
      text: "TikTok용 영상 본문",
      topic: "TikTok 영상 복귀",
      videoUrl: fakeMediaUrl("returned-video.mp4"),
      channels: { tiktok: { status: "pending" } },
    }];

    render(<StudioPage />);

    await waitFor(() => expect(screen.getByTestId("tiktok-creator-info-error")).toBeInTheDocument());
    // 고를 칸(공개 범위 select)이 없다 — "선택해주세요"만 뜨는 막다른 길이 아니다.
    expect(screen.queryByTestId("tiktok-privacy-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("tiktok-creator-info-error")).toHaveTextContent("계정을 다시 연결해주세요");
    // 헤더(PublishHeaderControls)와 패널 둘 다 재연결 링크를 보여준다 — 중복이지만
    // 패널 자리 자체가 빈 채로 "선택해주세요"만 뜨는 막다른 길은 아니라는 뜻이다.
    expect(within(screen.getByTestId("tiktok-creator-info-error")).getByRole("link", { name: "TikTok 다시 연결하기" })).toHaveAttribute("href", "/channels/tiktok");
    await within(screen.getByTestId("preview-tiktok")).findByText("TikTok 계정 정보를 확인하지 못했습니다. 계정을 다시 연결해주세요.");
  });

  it("MINOR-1 경계: draft_id 없는 인박스 발행 복귀는 진행 중인 영상 맞춤을 취소하고 편집 잠금을 푼다", async () => {
    localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
      idea: "이전 영상 초안",
      draftId: "old-video-draft",
      editKind: "video",
      editLines: ["이전 영상 대사"],
      vid: { url: "/api/media/old-video", file: "/api/media/old-video", model: "test" },
      videoEdit: {
        contract_version: "1.0",
        overlays: [],
        comments: [],
        subtitles: [],
        voice: null,
        revision: 1,
      },
    }));
    window.history.replaceState(null, "", "/studio?room=publish&from=inbox&queue_id=Q1");
    mocks.returnPosts = [{
      id: "Q1",
      text: "인박스에서 되돌린 영상 본문",
      topic: "영상 복귀 작업물",
      videoUrl: "/api/media/returned-video",
      channels: { threads: { status: "pending" } },
      publishContext: { sourceRoute: "inbox", queuePostId: "Q1", draftId: null },
    }];

    const page = render(<StudioPage />);

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("검토 대기 작업물을 불러왔습니다", "success"));

    window.history.replaceState(null, "", "/studio?room=edit");
    page.rerender(<StudioPage />);

    await waitFor(() => expect(document.querySelector("[data-video-subtitle-list]")).toBeTruthy());
    expect(document.querySelector("[data-video-syncing-note]"), "draftId가 없어진 뒤 영상 편집 잠금이 남으면 안 된다").toBeNull();
    expect(document.querySelector("[data-video-subtitle-text]"), "복귀한 영상 대본을 편집할 수 있어야 한다").toBeEnabled();
  });

  it("VIDEO-BAKED-LINEAGE-05 인트로 없는 구운 초안을 복원하면 DOM 자막을 숨기고 원본 없는 재굽기를 막는다", async () => {
    localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
      idea: "구운 영상",
      editKind: "video",
      editLines: ["이미 구운 자막"],
      vid: {
        url: fakeMediaUrl("baked.mp4"),
        file: fakeMediaUrl("baked.mp4"),
        model: "test",
        topicKey: "구운 영상",
        subtitlesBaked: true,
      },
      videoEdit: {
        contract_version: "1.0",
        overlays: [],
        comments: [],
        subtitles: [{ id: "s1", order: 0, text: "이미 구운 자막", startSec: 0, endSec: 3, cut: false }],
        voice: null,
        introOutro: null,
        revision: 1,
      },
    }));
    window.history.replaceState(null, "", "/studio?room=edit&kind=video");

    render(<StudioPage />);
    await waitFor(() => expect(document.querySelector("[data-video-subtitle-list]")).toBeTruthy());
    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 3, configurable: true });
    fireEvent.loadedMetadata(video);
    Object.defineProperty(video, "currentTime", { value: 1, configurable: true, writable: true });
    fireEvent.timeUpdate(video);
    expect(document.querySelector("[data-video-subtitle-active]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "발행실로 이동" }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "자막 없는 원본 영상을 찾지 못해 다시 굽지 않았습니다. 생성실에서 영상을 다시 만들거나 원본을 복원해 주세요.",
      "error",
    ));
    expect(mocks.apiPost.mock.calls.some(([path]) => path === "/api/video/subtitle")).toBe(false);
  });

  it("VIDEO-BAKED-LINEAGE-06 저장된 원본 계보로만 다시 굽고 새 결과에도 계보를 보존한다", async () => {
    const sourceUrl = fakeMediaUrl("source.mp4");
    const oldBakedUrl = fakeMediaUrl("old-baked.mp4");
    const newBakedUrl = fakeMediaUrl("new-baked.mp4");
    localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
      idea: "다시 굽는 영상",
      editKind: "video",
      editLines: ["고친 자막"],
      vid: {
        url: oldBakedUrl,
        file: oldBakedUrl,
        model: "test",
        topicKey: "다시 굽는 영상",
        subtitlesBaked: true,
        editSource: { filename: "source.mp4", url: sourceUrl },
      },
      videoEdit: {
        contract_version: "1.0",
        overlays: [],
        comments: [],
        subtitles: [{ id: "s1", order: 0, text: "고친 자막", startSec: 0, endSec: 3, cut: false }],
        voice: null,
        introOutro: null,
        revision: 1,
      },
    }));
    mocks.apiPost.mockImplementation(async (path: string, body: Record<string, unknown>) => {
      if (path === "/api/video/subtitle") {
        expect(body.filename).toBe("source.mp4");
        return { ok: true, file: newBakedUrl, filename: "new-baked.mp4" };
      }
      if (path === "/api/studio/drafts") return { id: "rebaked-draft", bodyRevision: 1, videoEditServerRevision: 1 };
      return { ok: true };
    });
    window.history.replaceState(null, "", "/studio?room=edit&kind=video");

    render(<StudioPage />);
    await waitFor(() => expect(document.querySelector("[data-video-subtitle-list]")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "발행실로 이동" }));

    await waitFor(() => expect(mocks.apiPost.mock.calls.some(([path]) => path === "/api/video/subtitle")).toBe(true));
    await waitFor(() => {
      const saves = mocks.apiPost.mock.calls.filter(([path]) => path === "/api/studio/drafts");
      expect(saves.at(-1)?.[1]).toEqual(expect.objectContaining({
        vid: expect.objectContaining({
          file: newBakedUrl,
          subtitlesBaked: true,
          editSource: { filename: "source.mp4", url: sourceUrl },
        }),
      }));
    });
  });

  it("VIDEO-BAKED-LINEAGE-07 원본 파일명에 구운 URL이 붙은 기존 오염 계보는 숨기고 재굽지 않는다", async () => {
    const bakedUrl = fakeMediaUrl("baked.mp4");
    localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
      idea: "기존 합성 영상",
      editKind: "video",
      editLines: ["고친 자막"],
      vid: {
        url: bakedUrl,
        file: bakedUrl,
        model: "test",
        topicKey: "기존 합성 영상",
        subtitlesBaked: true,
        editSource: { filename: "composite.mp4", url: bakedUrl },
      },
      videoEdit: {
        contract_version: "1.0",
        overlays: [],
        comments: [],
        subtitles: [{ id: "s1", order: 0, text: "고친 자막", startSec: 0, endSec: 3, cut: false }],
        voice: null,
        introOutro: {
          introCompId: "intro-logo-reveal",
          outroCompId: null,
          compositeFilename: "composite.mp4",
          resultFilename: "baked.mp4",
          deliverUrl: bakedUrl,
          sourceFilename: "source.mp4",
        },
        revision: 1,
      },
    }));
    window.history.replaceState(null, "", "/studio?room=edit&kind=video");

    render(<StudioPage />);
    await waitFor(() => expect(document.querySelector("[data-video-subtitle-list]")).toBeTruthy());
    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    expect(video.getAttribute("src")).toBe(bakedUrl);
    Object.defineProperty(video, "duration", { value: 5, configurable: true });
    fireEvent.loadedMetadata(video);
    Object.defineProperty(video, "currentTime", { value: 2.5, configurable: true, writable: true });
    fireEvent.timeUpdate(video);
    expect(document.querySelector("[data-video-subtitle-active]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "발행실로 이동" }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "자막 없는 원본 영상을 찾지 못해 다시 굽지 않았습니다. 생성실에서 영상을 다시 만들거나 원본을 복원해 주세요.",
      "error",
    ));
    expect(mocks.apiPost.mock.calls.some(([path]) => path === "/api/video/subtitle")).toBe(false);
  });

  it("VIDEO-BAKED-LINEAGE-08 표시 없는 운영 초안도 서버 계보의 원본으로 미리보기와 재굽기를 한다", async () => {
    const bakedUrl = fakeMediaUrl("subtitle-11111111-1111-4111-8111-111111111111.mp4");
    const sourceUrl = fakeMediaUrl("source.mp4");
    mocks.bakeLineage = {
      ok: true,
      state: "baked",
      sourceFilename: "source.mp4",
      sourceFile: sourceUrl,
    };
    localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
      idea: "표시 없는 운영 초안",
      editKind: "video",
      editLines: ["서버 기록으로 복원한 자막"],
      vid: { url: bakedUrl, file: bakedUrl, model: "test", topicKey: "표시 없는 운영 초안" },
      videoEdit: {
        contract_version: "1.0",
        overlays: [],
        comments: [],
        subtitles: [{ id: "s1", order: 0, text: "서버 기록으로 복원한 자막", startSec: 0, endSec: 3, cut: false }],
        voice: null,
        introOutro: null,
        revision: 1,
      },
    }));
    mocks.apiPost.mockImplementation(async (requestPath: string, body: Record<string, unknown>) => {
      if (requestPath === "/api/video/subtitle") {
        expect(body.filename).toBe("source.mp4");
        return { ok: true, file: fakeMediaUrl("subtitle-22222222-2222-4222-8222-222222222222.mp4") };
      }
      if (requestPath === "/api/studio/drafts") return { id: "lineage-draft", bodyRevision: 1, videoEditServerRevision: 1 };
      return { ok: true };
    });
    window.history.replaceState(null, "", "/studio?room=edit&kind=video");

    render(<StudioPage />);
    await waitFor(() => expect((document.querySelector("[data-video-el]") as HTMLVideoElement)?.getAttribute("src")).toBe(sourceUrl));
    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 3, configurable: true });
    fireEvent.loadedMetadata(video);
    Object.defineProperty(video, "currentTime", { value: 1, configurable: true, writable: true });
    fireEvent.timeUpdate(video);
    expect(document.querySelectorAll("[data-video-subtitle-active]")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "발행실로 이동" }));
    await waitFor(() => expect(mocks.apiPost.mock.calls.some(([requestPath]) => requestPath === "/api/video/subtitle")).toBe(true));
  });

  it("VIDEO-BAKED-LINEAGE-09 기존 작업물 열기에서 서버가 구운 파일로 확인하고 원본이 없으면 DOM 자막과 재굽기를 막는다", async () => {
    const bakedUrl = fakeMediaUrl("subtitle-33333333-3333-4333-8333-333333333333.mp4");
    mocks.bakeLineage = { ok: true, state: "baked" };
    mocks.returnPosts = [{
      id: "legacy-baked-work",
      text: "기존 작업물의 자막 문장",
      topic: "기존 구운 작업물",
      videoUrl: bakedUrl,
      channels: { threads: { status: "pending" } },
      publishContext: { sourceRoute: "inbox", queuePostId: "legacy-baked-work", draftId: null },
    }];
    window.history.replaceState(null, "", "/studio?room=publish&from=inbox&queue_id=legacy-baked-work");

    const page = render(<StudioPage />);
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("검토 대기 작업물을 불러왔습니다", "success"));
    window.history.replaceState(null, "", "/studio?room=edit");
    page.rerender(<StudioPage />);

    await waitFor(() => expect(document.querySelector("[data-video-el]")).toBeTruthy());
    const video = document.querySelector("[data-video-el]") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 3, configurable: true });
    fireEvent.loadedMetadata(video);
    Object.defineProperty(video, "currentTime", { value: 1, configurable: true, writable: true });
    fireEvent.timeUpdate(video);
    expect(document.querySelector("[data-video-subtitle-active]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "발행실로 이동" }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "자막 없는 원본 영상을 찾지 못해 다시 굽지 않았습니다. 생성실에서 영상을 다시 만들거나 원본을 복원해 주세요.",
      "error",
    ));
    expect(mocks.apiPost.mock.calls.some(([requestPath]) => requestPath === "/api/video/subtitle")).toBe(false);
  });

  it("PR95-SCOPE-CUT-VIDEO-01 연결 초안 없는 영상의 대표 이미지는 카드 잠금으로 오인하지 않는다", async () => {
    localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
      idea: "이전 카드 작업",
      editKind: "card",
      editLines: ["이전 카드 문구"],
      img: { url: "/api/images/deliver/old-card", file: "/api/images/deliver/old-card" },
    }));
    window.history.replaceState(null, "", "/studio?room=publish&from=inbox&queue_id=queue-video-cover");
    mocks.returnPosts = [{
      id: "queue-video-cover",
      text: "대표 이미지도 있는 영상",
      topic: "영상 복귀 작업물",
      imageUrl: "/api/images/deliver/video-cover",
      imageUrls: ["/api/images/deliver/video-cover"],
      videoUrl: "/api/media/returned-video",
      channels: { threads: { status: "pending" } },
    }];

    const page = render(<StudioPage />);
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("검토 대기 작업물을 불러왔습니다", "success"));
    expect(screen.getByRole("link", { name: "02편집실" })).toHaveAttribute("href", "/studio?room=edit&kind=video");
    window.history.replaceState(null, "", "/studio?room=edit&kind=video");
    page.rerender(<StudioPage />);

    expect(document.querySelector("[data-card-source-lock]")).toBeNull();
    await waitFor(() => expect(document.querySelector("[data-video-subtitle-list]")).toBeTruthy());
  });

  it("PR95-R2-STUDIO-01 연결 초안 없는 2장 글자 카드는 편집실과 저장까지 2장을 유지한다", async () => {
    window.history.replaceState(null, "", "/studio?room=publish&from=inbox&queue_id=queue-two-card");
    mocks.returnPosts = [{
      id: "queue-two-card",
      text: "과거 대기열의 합쳐진 본문",
      topic: "두 장 복귀 작업물",
      imageUrl: "/api/images/deliver/original-1",
      imageUrls: ["/api/images/deliver/original-1", "/api/images/deliver/original-2"],
      channels: { threads: { status: "pending" } },
    }];
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "restored-two-card", bodyRevision: 1 };
      return { ok: true };
    });

    const page = render(<StudioPage />);
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("검토 대기 작업물을 불러왔습니다", "success"));
    expect(screen.getByRole("link", { name: "02편집실" })).toHaveAttribute("href", "/studio?room=edit&kind=card");

    window.history.replaceState(null, "", "/studio?room=edit&kind=card");
    page.rerender(<StudioPage />);

    expect(await screen.findByText(/편집 원본 정보가 없어 문구·위치·순서를 바꿀 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByText(/기존 그림은 그대로 보존됩니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "생성실에서 새 카드 만들기" })).toBeInTheDocument();
    expect(screen.queryByText("문구와 글자 위치를 바꾸면 카드 그림에 바로 반영됩니다.")).not.toBeInTheDocument();
    expect(document.querySelectorAll("[data-script-line]")).toHaveLength(2);
    expect(document.querySelectorAll("[data-plain-card-strip] button")).toHaveLength(2);
    expect(screen.getByLabelText("문구 1")).toBeDisabled();
    expect(screen.getByLabelText("1번째를 아래로")).toBeDisabled();
    expect(screen.getByRole("button", { name: "카드 추가" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "상단" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "발행실로 이동" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "이전 카드 2장의 장별 원본 정보가 없어 다시 그리지 않고 기존 이미지를 유지합니다.",
      "success",
    ));
    await waitFor(() => {
      const saves = mocks.apiPost.mock.calls.filter(([path]) => path === "/api/studio/drafts");
      expect(saves.at(-1)?.[1]).toEqual(expect.objectContaining({
        editKind: "card",
        editFormat: expect.objectContaining({ kind: "card" }),
        img: expect.objectContaining({
          imageUrls: ["/api/images/deliver/original-1", "/api/images/deliver/original-2"],
          textEmbedded: true,
          textSourceRecoverable: false,
        }),
      }));
    });
  });

  it("PR95-R3-STUDIO-01 원본 정보 없는 한 장 글자 카드도 편집을 잠그고 재합성하지 않는다", async () => {
    window.history.replaceState(null, "", "/studio?room=publish&from=inbox&queue_id=queue-one-card");
    mocks.returnPosts = [{
      id: "queue-one-card",
      text: "과거 한 장 카드 본문",
      topic: "한 장 복귀 작업물",
      imageUrl: "/api/images/deliver/original-one",
      imageUrls: ["/api/images/deliver/original-one"],
      channels: { threads: { status: "pending" } },
    }];
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "restored-one-card", bodyRevision: 1 };
      return { ok: true };
    });

    const page = render(<StudioPage />);
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith("검토 대기 작업물을 불러왔습니다", "success"));
    window.history.replaceState(null, "", "/studio?room=edit&kind=card");
    page.rerender(<StudioPage />);

    expect(await screen.findByText(/편집 원본 정보가 없어 문구·위치·순서를 바꿀 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByLabelText("문구 1")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "발행실로 이동" }));

    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      "이전 카드 1장의 장별 원본 정보가 없어 다시 그리지 않고 기존 이미지를 유지합니다.",
      "success",
    ));
    expect(mocks.apiPost.mock.calls.some(([path]) => String(path).includes("recompose"))).toBe(false);
    await waitFor(() => {
      const saves = mocks.apiPost.mock.calls.filter(([path]) => path === "/api/studio/drafts");
      expect(saves.at(-1)?.[1]).toEqual(expect.objectContaining({
        img: expect.objectContaining({
          imageUrls: ["/api/images/deliver/original-one"],
          textEmbedded: true,
          textSourceRecoverable: false,
        }),
      }));
    });
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
      expect(screen.getByRole("checkbox", { name: "Instagram 발행" })).toBeDisabled();
    });
    expect(screen.getByRole("link", { name: "생성실에서 카드 만들기" })).toHaveAttribute(
      "href",
      "/studio?room=create&kind=card",
    );
    expect(screen.getByRole("button", { name: "선택한 2곳에 지금 발행" })).toBeInTheDocument();
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
    const publishButton = await findEnabledButton("선택한 2곳에 지금 발행");
    // 2026-09-08 개정: 영상 채널(쇼츠·릴스·틱톡)은 발행 기능이 이미 있었는데 발행실이
    // 영상 발행 경로를 부르지 않아 "미지원" 으로 닫혀 있었다(회장 "왜 영상쪽은 다 미지원
    // 이라고 뜸"). 이제 발행실이 그 경로를 부르므로 잠기지 않는다.
    for (const [platform, label] of [["shorts", "Shorts"], ["reels", "Reels"], ["tiktok", "TikTok"]]) {
      expect(within(screen.getByTestId(`preview-${platform}`)).queryByRole(
        "checkbox",
        { name: `${label} 발행 미지원` },
      )).toBeNull();
    }

    fireEvent.click(publishButton);
    await waitFor(() => {
      expect(mocks.apiPost.mock.calls.filter(([path]) => path === "/api/publish")).toHaveLength(2);
    });
    expect(mocks.apiPost.mock.calls
      .filter(([path]) => path === "/api/publish")
      .map(([, body]) => (body as { platform: string }).platform))
      .toEqual(["threads", "x"]);
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
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({ accounts: [] }))));

    render(<StudioPage />);

    expect(await screen.findByText(/채널 연결 0\/15/)).toBeInTheDocument();
    // 계정 조회가 끝나기 전에는 이 자리에 "확인하는 중" 이 적힌다. 위 findByText 는
    // 다른 조건으로 걸린 다른 요소라 둘이 같은 틱에 온다는 보장이 없다. 느린 기계에서는
    // 실제로 갈렸다(2026-09-14 CI). 기대 문구는 그대로 두고 기다리기만 한다.
    await waitFor(() => {
      expect(screen.getByTestId("publish-availability")).toHaveTextContent("선택 0곳 · 실제 발행 가능 0곳 · 연결된 채널 0곳");
    });
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

  it("STUDIO-V70-PUBLISH-ACCOUNT-04 거절: 재연결 계정만 있으면 체크와 전체 선택을 잠근다", async () => {
    restoreStudio(["threads"]);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const provider = /\/api\/channels\/([^/]+)\/accounts/.exec(String(input))?.[1];
      const accounts = provider === "threads"
        ? [{ id: "threads-reconnect", display_name: "Threads 운영 계정", username: "threads.paused", is_default: true, connection_state: "reconnect" }]
        : [];
      return Response.json({ accounts });
    }));

    render(<StudioPage />);

    const checkbox = await screen.findByRole("checkbox", { name: "Threads 발행" });
    await waitFor(() => expect(screen.getByTestId("account-state-threads")).toHaveTextContent("missing"));
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByTestId("publish-account-label-threads")).not.toBeInTheDocument();
    expect(screen.getByTestId("publish-reconnect-link-threads")).toHaveAttribute("href", "/channels/threads");
    expect(screen.getByTestId("publish-select-all")).toBeDisabled();
    expect(screen.getByTestId("publish-bulk-select-all")).toBeDisabled();
    expect(screen.getByText("아직 연결된 채널이 없어 발행할 수 없습니다.", { exact: false })).toBeInTheDocument();
  });

  it("PR94-R1-MAJOR-02 거절: 저장된 해제 계정은 선택과 발행 요청에서 제거하고 다시 연결을 안내한다", async () => {
    restoreStudio(["threads"]);
    const storageKey = `studio_work:${mocks.workspace.id}`;
    const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
    localStorage.setItem(storageKey, JSON.stringify({
      ...stored,
      selectedAccounts: { threads: "threads-reconnect" },
    }));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const provider = /\/api\/channels\/([^/]+)\/accounts/.exec(String(input))?.[1];
      const accounts = provider === "threads"
        ? [
            { id: "threads-reconnect", display_name: "예전 계정", username: "threads.expired", is_default: false, connection_state: "reconnect" },
            { id: "threads-connected", display_name: "운영 계정", username: "threads.live", is_default: true, connection_state: "connected" },
          ]
        : [];
      return Response.json({ accounts });
    }));
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-account-reconnect" };
      if (path === "/api/publish") return { ok: false, error: "테스트 발행 거절" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);

    const checkbox = await screen.findByRole("checkbox", { name: "Threads 발행" });
    await waitFor(() => expect(checkbox).not.toBeChecked());
    expect(screen.getByTestId("publish-reconnect-link-threads")).toHaveAttribute("href", "/channels/threads");

    fireEvent.click(checkbox);
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));
    await waitFor(() => expect(mocks.apiPost.mock.calls.filter(([path]) => path === "/api/publish")).toHaveLength(1));
    const publishBody = mocks.apiPost.mock.calls.find(([path]) => path === "/api/publish")?.[1] as { account_id?: string };
    expect(publishBody.account_id).not.toBe("threads-reconnect");
  });

  it("PR94-R3-MAJOR-03 정상: 보이는 기본 계정과 실제 발행 요청 계정이 같다", async () => {
    restoreStudio(["threads"]);
    const storageKey = `studio_work:${mocks.workspace.id}`;
    const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
    localStorage.setItem(storageKey, JSON.stringify({
      ...stored,
      selectedAccounts: { threads: "threads-old-saved" },
    }));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const provider = /\/api\/channels\/([^/]+)\/accounts/.exec(String(input))?.[1];
      const accounts = provider === "threads"
        ? [
            { id: "threads-old-saved", display_name: "예전 계정", username: "old.saved", is_default: false, connection_state: "connected" },
            { id: "threads-current-default", display_name: "현재 기본 계정", username: "current.default", is_default: true, connection_state: "connected" },
          ]
        : [];
      return Response.json({ accounts });
    }));
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-current-default" };
      if (path === "/api/publish") return { ok: false, error: "테스트 발행 거절" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);

    const visibleHandle = await screen.findByTestId("publish-account-label-threads");
    expect(visibleHandle).toHaveTextContent("@current.default");
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));
    await waitFor(() => expect(mocks.apiPost.mock.calls.some(([path]) => path === "/api/publish")).toBe(true));
    const publishBody = mocks.apiPost.mock.calls.find(([path]) => path === "/api/publish")?.[1] as { account_id?: string };
    expect(publishBody.account_id).toBe("threads-current-default");
  });

  it("PR94-R4-MAJOR-02 정상: 재연결 기본 계정을 숨기고 보이는 연결 계정과 실제 POST 계정을 일치시킨다", async () => {
    restoreStudio(["threads"]);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const provider = /\/api\/channels\/([^/]+)\/accounts/.exec(String(input))?.[1];
      const accounts = provider === "threads"
        ? [
            { id: "threads-default-reconnect", display_name: "끊긴 기본", username: "default.reconnect", is_default: true, connection_state: "reconnect" },
            { id: "threads-live-nondefault", display_name: "연결된 비기본", username: "live.nondefault", is_default: false, connection_state: "connected" },
          ]
        : [];
      return Response.json({ accounts });
    }));
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-r4-account" };
      if (path === "/api/publish") return { ok: false, error: "테스트 발행 거절" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);

    const visibleHandle = await screen.findByTestId("publish-account-label-threads");
    expect(visibleHandle).toHaveTextContent("@live.nondefault");
    expect(visibleHandle).not.toHaveTextContent("@default.reconnect");
    expect(screen.getByTestId("publish-reconnect-link-threads")).toHaveAttribute("href", "/channels/threads");
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));
    await waitFor(() => expect(mocks.apiPost.mock.calls.some(([path]) => path === "/api/publish")).toBe(true));
    const publishBody = mocks.apiPost.mock.calls.find(([path]) => path === "/api/publish")?.[1] as { account_id?: string };
    expect(publishBody.account_id).toBe("threads-live-nondefault");
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
      editKind: "card",
      editFormat: { kind: "card", aspectRatio: "4:5", background: "화이트", subtitleSize: "보통" },
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

    window.history.replaceState(null, "", "/studio?room=publish&kind=video");
    render(<StudioPage />);
    fireEvent.click(screen.getByRole("button", { name: /작업물 전체/ }));

    // 2026-09-06: 작업물 전체 판이 목록까지 보여 주게 되면서 같은 제목이 현재 작업과
    // 목록 두 곳에 나온다. 현재 작업 영역으로 좁혀 확인한다.
    const currentWork = document.querySelector("[data-current-work]") as HTMLElement;
    expect(within(currentWork).getByText("고객 사례 카드뉴스", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이어 편집하기" }));

    await waitFor(() => expect(mocks.setStudioRoom).toHaveBeenCalledWith("edit"));
    expect(window.location.pathname + window.location.search).toBe("/studio?room=edit&kind=card");
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

  it("PUB-DRAFT-UI-01 정상: 플랫폼 필드를 임시 저장하고 계정은 한 줄 표시·관리 링크로만 다룬다", async () => {
    restoreStudio(["threads", "instagram"]);
    mocks.apiPost.mockResolvedValue({ id: "draft-v67" });

    render(<StudioPage />);
    fireEvent.change(await screen.findByLabelText("shorts 제목"), { target: { value: "쇼츠 제목" } });
    fireEvent.change(screen.getByLabelText("instagram 캡션"), { target: { value: "채널별 캡션" } });
    fireEvent.change(screen.getByLabelText("instagram 해시태그"), { target: { value: "#하나 #둘" } });
    fireEvent.change(screen.getByLabelText("threads 주제 태그"), { target: { value: "운영팁" } });
    expect(screen.queryByTestId("publish-account-select-instagram")).not.toBeInTheDocument();
    expect(screen.getByTestId("publish-account-label-instagram")).toHaveAttribute("title", expect.stringMatching(/instagram/i));
    expect(screen.getByTestId("publish-account-manage-instagram")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "임시 저장하기" })[0]);

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith("/api/studio/drafts", expect.objectContaining({
      editLines: ["가장 최신 문단"],
      titles: expect.objectContaining({ shorts: "쇼츠 제목" }),
      captions: expect.objectContaining({ instagram: "채널별 캡션" }),
      hashtags: expect.objectContaining({ instagram: "#하나 #둘" }),
      topicTags: expect.objectContaining({ threads: "운영팁" }),
      selectedAccounts: {},
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

  it("FE3-PUBLISH-02 개정: 영상 채널도 발행 대상으로 고를 수 있다", async () => {
    // 발행 기능이 있는데 화면이 잠가 두면 만든 영상을 올릴 데가 없다. 계정이 없으면
    // 종전대로 잠기지만, 그것은 "미지원" 이 아니라 "미연결" 이다.
    render(<StudioPage />);
    const tiktok = within(await screen.findByTestId("preview-tiktok"));
    expect(tiktok.queryByRole("checkbox", { name: "TikTok 발행 미지원" })).toBeNull();
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
    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/studio/drafts",
      expect.objectContaining({ editLines: ["가장 최신 문단"] }),
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

  it("PR87-R2-M2 정상: 기존 초안도 검토 큐를 만들기 전에 최신 본문을 먼저 저장한다", async () => {
    // Regression: PR87-R2-M2 — 기존 draftId의 단축 평가가 최신 편집 저장을 건너뛰었다.
    // Found by reviewer on 2026-09-28.
    // Report: .pr87-review-r2.md
    restoreStudio(["threads"]);
    const key = `studio_work:${mocks.workspace.id}`;
    const restored = JSON.parse(localStorage.getItem(key) || "{}");
    localStorage.setItem(key, JSON.stringify({ ...restored, draftId: "draft-existing-review" }));
    mocks.drafts = [{ id: "draft-existing-review", editLines: ["서버의 이전 문단"], status: "draft" }];
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-existing-review" };
      if (path === "/api/queue/add") return { post: { id: "queue-existing-review" } };
      if (path === "/api/queue/queue-existing-review/request-review") return { reused: false };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await screen.findByRole("button", { name: "검토 요청하기" }));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/queue/queue-existing-review/request-review",
      expect.objectContaining({ tenant_id: "tenant-a" }),
    ));
    const calls = mocks.apiPost.mock.calls.map(([path]) => path);
    expect(calls.indexOf("/api/studio/drafts")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("/api/studio/drafts")).toBeLessThan(calls.indexOf("/api/queue/add"));
    expect(mocks.apiPost).toHaveBeenCalledWith("/api/studio/drafts", expect.objectContaining({
      id: "draft-existing-review",
      editLines: ["가장 최신 문단"],
    }));
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
      if (path === "/api/publish/reconcile") {
        return { ok: true, repaired: [{ platform: "threads", publicationId: "publication-1" }], failed: [] };
      }
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
    expect(mocks.apiPost.mock.calls.filter(([path]) => path === "/api/publish/reconcile")).toHaveLength(1);
  });

  it("REVIEW-20260918-16 혼합: Threads 기록 복구 후에도 X 실패를 초안과 새로고침 상태에 남긴다", async () => {
    restoreStudio(["threads", "x"]);
    mocks.apiPost.mockImplementation(async (path: string, body: { platform?: string; status?: string }) => {
      if (path === "/api/studio/drafts") return { id: "draft-mixed", status: body.status };
      if (path === "/api/publish/reconcile") {
        return { ok: true, repaired: [{ platform: "threads", publicationId: "publication-1" }], failed: [] };
      }
      if (path === "/api/publish" && body.platform === "threads") {
        throw Object.assign(new Error("Threads 기록 실패"), { externalPersistence: true,
          payload: { persistence: { reconciliation: { required: true, action: "repair_persistence_only",
            retryPublish: false, platform: "threads", receipt: "signed", stage: "queue_record" } } } });
      }
      if (path === "/api/publish" && body.platform === "x") throw new Error("X 공급자 거절");
      throw new Error(`unexpected path: ${path}`);
    });
    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 2곳에 지금 발행"));
    fireEvent.click(await screen.findByTestId("publish-reconciliation-resolve"));
    await waitFor(() => expect(screen.queryByTestId("publish-reconciliation-resolve")).toBeNull());
    const drafts = mocks.apiPost.mock.calls.filter(([path]) => path === "/api/studio/drafts")
      .map(([, body]) => body as { status: string; publishProgress?: { status: Record<string, string> } });
    expect(drafts.at(-1)).toMatchObject({ status: "partial", publishProgress: {
      status: { threads: "done", x: "failed" },
    } });
    const saved = JSON.parse(localStorage.getItem(`studio_work:${mocks.workspace.id}`) || "{}");
    expect(saved.publishProgress.status).toMatchObject({ threads: "done", x: "failed" });
    cleanup();
    render(<StudioPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "실패한 곳만 다시 발행" })).toBeInTheDocument());
  });

  it("REVIEW-20260918-13 거절: 오래된 증표 없는 복구는 안내를 보여 주고 외부 게시 잠금을 유지한다", async () => {
    restoreStudio(["threads"]);
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-reconcile" };
      if (path === "/api/publish/reconcile") {
        const { ApiResponseError } = await import("@/lib/api");
        const payload = { failed: [{ error: "복구 증표가 없습니다. 외부 게시 상태를 확인해 주세요." }] };
        const error = new ApiResponseError(409, payload, "recovery rejected");
        (error as unknown as { payload: unknown }).payload = payload;
        throw error;
      }
      if (path === "/api/publish") {
        const error = new Error("외부 게시 완료") as Error & { payload?: unknown; externalPersistence?: boolean };
        error.externalPersistence = true;
        error.payload = { persistence: { reconciliation: { required: true, action: "repair_persistence_only",
          retryPublish: false, platform: "threads" } } };
        throw error;
      }
      throw new Error(`unexpected path: ${path}`);
    });
    render(<StudioPage />);
    fireEvent.click(await findEnabledButton("선택한 1곳에 지금 발행"));
    fireEvent.click(await screen.findByTestId("publish-reconciliation-resolve"));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(
      expect.stringContaining("복구 증표가 없습니다"), "error"));
    expect(screen.getByTestId("publish-reconciliation-resolve")).toBeInTheDocument();
    expect(screen.getByTestId("publish-recovery-support")).toHaveAttribute("href", expect.stringContaining("mailto:code0to1@gmail.com"));
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

  it("CODE-REVIEW-20260915-30 거절: X 계정 조회가 멈춰도 먼저 끝난 Threads 계정을 독립 반영한다", async () => {
    restoreStudio(["threads", "x"]);
    let releaseX: () => void = () => {};
    const xPending = new Promise<void>((resolve) => { releaseX = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const provider = /\/api\/channels\/([^/]+)\/accounts/.exec(String(input))?.[1];
      if (provider === "x") await xPending;
      const accounts = provider === "threads"
        ? [{ id: "threads-account", display_name: "Threads 계정", username: "threads", is_default: true }]
        : [];
      return Response.json({ accounts });
    }));

    render(<StudioPage />);

    await waitFor(() => expect(screen.getByTestId("account-state-threads")).toHaveTextContent("connected"));
    expect(screen.getByRole("checkbox", { name: "Threads 발행" })).toBeEnabled();
    expect(screen.getByTestId("account-state-x")).toHaveTextContent("loading");
    expect(screen.getByText("발행 가능한 계정을 확인하는 중입니다")).toBeInTheDocument();

    releaseX();
    await waitFor(() => expect(screen.getByTestId("account-state-x")).toHaveTextContent("missing"));
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
    editor.textContent = "발행실로 넘길 본문";
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole("button", { name: "발행실로 이동" }));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith("/api/studio/drafts", expect.objectContaining({
      id: null,
      editKind: "text",
      editFormat: expect.objectContaining({
        kind: "text",
        segments: [{ text: "발행실로 넘길 본문", bold: false }],
      }),
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

  it("PR87-R2-M1 정상: 편집줄이 비어도 생성 본문을 최신값 정본으로 승격한 뒤 저장한다", async () => {
    window.history.replaceState(null, "", "/studio?room=edit");
    localStorage.setItem(`studio_work:${mocks.workspace.id}`, JSON.stringify({
      idea: "생성 본문 직행 테스트",
      text: {
        threads: "생성된 스레드 본문",
        x: "생성된 X 본문",
        facebook: "생성된 페이스북 본문",
        instagram: { caption: "생성된 인스타 본문", slides: ["생성된 인스타 본문"] },
        shorts: { hook: "첫 문단", body: "둘째 문단", cta: "셋째 문단" },
      },
      editLines: [],
      editKind: "text",
      editFormat: { kind: "text" },
    }));
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/drafts") return { id: "draft-derived-lines" };
      throw new Error(`unexpected path: ${path}`);
    });

    render(<StudioPage />);
    fireEvent.click(await screen.findByRole("button", { name: "발행실로 이동" }));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith("/api/studio/drafts", expect.objectContaining({
      editLines: ["첫 문단", "둘째 문단", "셋째 문단"],
    })));
    expect(mocks.setStudioRoom).toHaveBeenCalledWith("publish");
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
      // 2026-09-16: GettingStartedStrip이 자체 조회하는 두 훅. 실제 화면에서는 이 조회가
      // 끝까지 가면(성공하면) 빈 객체로 resolve된다 -- "조회 안 함"과 "조회했더니 0개"는
      // 다르다(회장 실측: 로딩 중을 0으로 잘못 읽어 "0/15" 가 다른 화면의 "3/15" 와
      // 갈렸다). 이 표를 다른 키처럼 영구 undefined 로 두면 그 구분을 이 테스트가
      // 검증할 수 없으므로, 조회가 끝난 상태(빈 채널 설정)로 고정한다.
      if (key === "/api/channel-config") {
        return { data: {}, mutate: vi.fn() };
      }
      if (key === "/api/onboarding") {
        return { data: { checklist: {} }, mutate: vi.fn() };
      }
      return { data: undefined, mutate: vi.fn() };
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({ accounts: [] }))));
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
