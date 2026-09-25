// @vitest-environment jsdom
/**
 * 교차 리뷰(Claude Opus 5.5) BLOCK 판정 B1·B2·B3 회귀.
 *
 * B1: 새로고침(draft_id 없이 localStorage만 있는 경로)하면 서버의 영상 편집 데이터가
 * 사라졌다 — localStorage 복원에 videoEdit이 없어 편집기가 빈 편집을 받고, 자막
 * 시딩이 그 자리에서 곧장 서버에 저장됐다(video-edit-contract.ts의 부분 병합 아님
 * 규칙과 만나 오버레이·댓글·목소리가 지워졌다).
 * B2: 이전 형식 데이터를 열면(장면 대사와 자막 목록이 서로 다르면) 장면 대사가 자막
 * 목록으로 덮여 사라졌다.
 * B3: 자막 문구를 고친 직후 자동저장 타이머가 그 수정 이전의 `editLines`를 닫힌 채로
 * 예약해 최신 대사가 한 박자 늦게(또는 못) 저장됐다.
 *
 * 세 회귀 모두 로직 복사본이 아니라 실제 StudioPage를 마운트하고 나간 fetch payload를
 * 단언한다(edit-autosave-cross-domain.regression-1.test.tsx와 같은 방식).
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioPage from "@/app/studio/page";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
  showToast: vi.fn(),
  setStudioRoom: vi.fn(),
  workspace: { id: "tenant-video-integrity", name: "영상 편집 데이터 무결성" },
}));

const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];

vi.mock("swr", () => ({ default: (...args: unknown[]) => mocks.swr(...args) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/layout/Toast", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({
    activeWorkspace: mocks.workspace,
    studioRoom: "edit",
    setStudioRoom: mocks.setStudioRoom,
  }),
}));
vi.mock("@/components/studio/PlatformPreview", () => ({
  PREVIEW_PLATFORMS: ["threads", "x", "facebook", "instagram", "shorts", "reels", "tiktok"].map((key) => ({ key, label: key })),
  PlatformPreview: ({ platform }: { platform: string }) => <div data-room-preview={platform}>{platform}</div>,
}));
vi.mock("@/components/shared/BrandSetupWizard", () => ({ BrandSetupWizard: () => null }));
vi.mock("@/components/studio/RepoConnect", () => ({ RepoConnect: () => null }));
vi.mock("@/components/studio/SchedulePanel", () => ({ SchedulePanel: () => null }));
vi.mock("@/lib/analytics/events", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authHeaders: () => ({}), getAuthToken: () => "customer-token" }));

function storageKey(workspaceId: string) {
  return `studio_work:${workspaceId}`;
}

function setupFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      fetchCalls.push({ url, body });
      return new Response(JSON.stringify({ ok: true, id: "draft-integrity-1" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (typeof url === "string" && url.includes("elevenlabs-voices")) {
      return new Response(JSON.stringify({ code: "ELEVENLABS_NOT_CONFIGURED" }), { status: 503 });
    }
    return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
  }));
}

beforeEach(() => {
  fetchCalls.length = 0;
  mocks.setStudioRoom.mockReset();
  mocks.showToast.mockReset();
  mocks.swr.mockReset();
  localStorage.clear();
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("B1: 새로고침(localStorage 복원)이 서버 videoEdit을 지우지 않는다", () => {
  it("draft_id 없이 localStorage만으로 복원해도 기존 오버레이가 빈 값으로 저장되지 않는다", async () => {
    // 이전 세션이 이미 저장해 둔 영상 편집(오버레이 1개 포함)을 localStorage에 심는다.
    // B1 이전 코드는 이 videoEdit을 복원 블록에서 읽지 않아 VideoEditor가 EMPTY_VIDEO_EDIT을
    // 받았다.
    const seededVideoEdit = {
      contract_version: "1.0",
      overlays: [{ id: "ov-seed", order: 0, kind: "hook", text: "기존 오버레이", startSec: 0, endSec: 3 }],
      comments: [],
      subtitles: [{ id: "sub-seed", order: 0, text: "첫 장면", startSec: 0, endSec: 3, cut: false }],
      voice: null,
      revision: 3,
    };
    // 3차 재리뷰 BLOCKER(a): localStorage 값은 잠정치일 뿐이다 — 서버 재동기화 효과가
    // hist.drafts에서 이 draftId를 찾아 서버 값으로 다시 맞춘다. 그 재동기화가 이
    // localStorage와 같은 오버레이를 가진 서버 초안을 찾도록 목록에 심어 둔다(이게
    // 바로 "서버가 이미 갖고 있던 값"이라는 이 테스트의 전제다).
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") return { data: { isOperator: false }, mutate: vi.fn() };
      if (key === "/api/studio/drafts?tenant_id=tenant-video-integrity") {
        return {
          data: {
            drafts: [{
              id: "draft-integrity-1", idea: "새로고침 복원 검증", editKind: "video", editLines: ["첫 장면"],
              vid: { url: "/api/media/test-video", file: "/api/media/test-video", model: "기존 작업물" },
              status: "draft", savedAt: new Date().toISOString(), videoEdit: seededVideoEdit,
            }],
            currentWork: null,
          },
          mutate: vi.fn(),
        };
      }
      if (key === "/api/studio/brand-setup?tenant_id=tenant-video-integrity") return { data: { guide: null }, mutate: vi.fn() };
      if (key === "/api/publish/first-comment-capabilities") return { data: { capabilities: [] }, mutate: vi.fn() };
      return { data: undefined, mutate: vi.fn() };
    });
    setupFetch();

    localStorage.setItem(storageKey("tenant-video-integrity"), JSON.stringify({
      idea: "새로고침 복원 검증",
      vid: { url: "/api/media/test-video", file: "/api/media/test-video", model: "기존 작업물" },
      draftId: "draft-integrity-1",
      editLines: ["첫 장면"],
      editKind: "video",
      editFormat: { kind: "video", aspectRatio: "9:16", subtitleSize: "보통", playbackSpeed: 1, voice: "차분한 남성" },
      videoEdit: seededVideoEdit,
    }));
    window.history.replaceState(null, "", "/studio?room=edit");

    render(<StudioPage />);

    await waitFor(() => {
      const el = document.querySelector("[data-video-overlay-editor]");
      if (!el) throw new Error("영상 오버레이 편집 패널이 아직 안 떴다");
      return el as HTMLElement;
    });

    // 시딩·복원 자체는 아무것도 저장하지 않는다(B1) — 사용자가 손대지 않은 채 800ms+를
    // 흘려도 서버로 나간 videoEdit이 있다면 그 오버레이는 절대 비어 있으면 안 된다.
    await new Promise((resolve) => setTimeout(resolve, 900));
    const videoEditPosts = fetchCalls.filter((c) => Object.prototype.hasOwnProperty.call(c.body, "videoEdit") && c.body.videoEdit);
    for (const post of videoEditPosts) {
      const overlays = (post.body.videoEdit as { overlays?: unknown[] }).overlays ?? [];
      expect(overlays.length).toBeGreaterThan(0);
    }

    // 화면에도 복원된 오버레이가 실제로 보인다(빈 편집을 받지 않았다는 직접 증거).
    const overlayEditor = document.querySelector("[data-video-overlay-editor]") as HTMLElement;
    expect(within(overlayEditor).getByDisplayValue("기존 오버레이")).toBeInTheDocument();
  }, 20000);
});

describe("B2: 이전 형식 데이터를 열어도 장면 대사가 사라지지 않는다", () => {
  it("자막 목록이 장면 대사와 다른 초안을 열면 화면은 장면 대사(lines)를 기준으로 맞춘다", async () => {
    const mismatchedDraft = {
      id: "draft-integrity-2",
      idea: "이전 형식 데이터",
      editKind: "video",
      editLines: ["새 대사 A", "새 대사 B"],
      // 자막 목록은 완전히 다른 옛 대본을 갖고 있다(다른 형식/다른 세션에서 저장된 값).
      videoEdit: {
        contract_version: "1.0",
        overlays: [],
        comments: [],
        subtitles: [{ id: "sub-old", order: 0, text: "옛날 대사", startSec: 0, endSec: 3, cut: false }],
        voice: null,
        revision: 5,
      },
      vid: { url: "/api/media/test-video", file: "/api/media/test-video", localPath: "/api/media/test-video" },
      status: "draft",
      savedAt: new Date().toISOString(),
    };
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") return { data: { isOperator: false }, mutate: vi.fn() };
      if (key === "/api/studio/drafts?tenant_id=tenant-video-integrity") return { data: { drafts: [mismatchedDraft], currentWork: null }, mutate: vi.fn() };
      if (key === "/api/studio/brand-setup?tenant_id=tenant-video-integrity") return { data: { guide: null }, mutate: vi.fn() };
      if (key === "/api/publish/first-comment-capabilities") return { data: { capabilities: [] }, mutate: vi.fn() };
      return { data: undefined, mutate: vi.fn() };
    });
    setupFetch();
    window.history.replaceState(null, "", "/studio?room=edit&draft_id=draft-integrity-2");

    render(<StudioPage />);

    const list = await waitFor(() => {
      const el = document.querySelector("[data-video-subtitle-list]");
      if (!el) throw new Error("자막 대본이 아직 안 떴다");
      return el as HTMLElement;
    });

    const texts = Array.from(list.querySelectorAll("[data-video-subtitle-text]")).map((el) => (el as HTMLInputElement).value);
    // B2 이전이라면 여기 "옛날 대사" 한 줄만 보이고 "새 대사 A/B"는 사라져 있었다.
    expect(texts).toEqual(["새 대사 A", "새 대사 B"]);
    expect(list.textContent).not.toContain("옛날 대사");
  }, 20000);
});

describe("B3: 자막 문구 수정이 서버 대사에 한 박자 늦지 않는다", () => {
  it("자막 문구를 고친 직후 자동저장이 그 최신 문구를 그대로 서버에 보낸다", async () => {
    const draft = {
      id: "draft-integrity-3",
      idea: "저장 시점 검증",
      editKind: "video",
      editLines: ["첫 장면", "둘째 장면"],
      videoEdit: { contract_version: "1.0", overlays: [], comments: [], subtitles: [], voice: null, revision: 0 },
      vid: { url: "/api/media/test-video", file: "/api/media/test-video", localPath: "/api/media/test-video" },
      status: "draft",
      savedAt: new Date().toISOString(),
    };
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") return { data: { isOperator: false }, mutate: vi.fn() };
      if (key === "/api/studio/drafts?tenant_id=tenant-video-integrity") return { data: { drafts: [draft], currentWork: null }, mutate: vi.fn() };
      if (key === "/api/studio/brand-setup?tenant_id=tenant-video-integrity") return { data: { guide: null }, mutate: vi.fn() };
      if (key === "/api/publish/first-comment-capabilities") return { data: { capabilities: [] }, mutate: vi.fn() };
      return { data: undefined, mutate: vi.fn() };
    });
    setupFetch();
    window.history.replaceState(null, "", "/studio?room=edit&draft_id=draft-integrity-3");

    render(<StudioPage />);

    const list = await waitFor(() => {
      const el = document.querySelector("[data-video-subtitle-list]");
      if (!el) throw new Error("자막 대본이 아직 안 떴다");
      return el as HTMLElement;
    });
    const firstInput = list.querySelector("[data-video-subtitle-text]") as HTMLInputElement;
    fireEvent.change(firstInput, { target: { value: "고친 첫 장면" } });

    await new Promise((resolve) => setTimeout(resolve, 900));

    const videoEditPosts = fetchCalls.filter((c) => Object.prototype.hasOwnProperty.call(c.body, "editLines") && Array.isArray(c.body.editLines) && (c.body.editLines as string[]).length > 0);
    expect(videoEditPosts.length).toBeGreaterThan(0);
    const last = videoEditPosts[videoEditPosts.length - 1];
    // B3 이전이라면 여기 editLines가 이 수정 이전 값("첫 장면")으로 닫힌 클로저였다.
    expect(last.body.editLines).toEqual(["고친 첫 장면", "둘째 장면"]);
  }, 20000);
});
