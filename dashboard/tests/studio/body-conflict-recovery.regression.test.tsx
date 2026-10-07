// @vitest-environment jsdom
/**
 * PR87-R5-MAJOR-01. 탭 A가 먼저 본문 기준판을 올린 뒤 탭 B의 영상 자동저장이
 * BODY_STALE_REVISION을 받는 실제 StudioPage 경로를 고정한다. 탭 B 입력은 보관되고,
 * 최신본 확인 뒤 명시적으로 다시 적용할 때만 최신 기준판으로 재저장돼야 한다.
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioPage from "@/app/studio/page";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
  showToast: vi.fn(),
  setStudioRoom: vi.fn(),
  workspace: { id: "tenant-body-conflict", name: "본문 충돌 테스트" },
}));

vi.mock("swr", () => ({ default: (...args: unknown[]) => mocks.swr(...args) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/layout/Toast", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({ activeWorkspace: mocks.workspace, studioRoom: "edit", setStudioRoom: mocks.setStudioRoom }),
}));
vi.mock("@/components/studio/PlatformPreview", () => ({
  PREVIEW_PLATFORMS: ["threads", "x", "facebook", "instagram", "shorts", "reels", "tiktok"].map((key) => ({ key, label: key })),
  PlatformPreview: ({ platform }: { platform: string }) => <div>{platform}</div>,
}));
vi.mock("@/components/shared/BrandSetupWizard", () => ({ BrandSetupWizard: () => null }));
vi.mock("@/components/studio/RepoConnect", () => ({ RepoConnect: () => null }));
vi.mock("@/components/studio/SchedulePanel", () => ({ SchedulePanel: () => null }));
vi.mock("@/lib/analytics/events", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authHeaders: () => ({}), getAuthToken: () => "customer-token" }));

const initialVideoEdit = {
  contract_version: "1.0",
  overlays: [], comments: [], voice: null, revision: 3,
  subtitles: [{ id: "sub-1", order: 0, text: "공통 원문", startSec: 0, endSec: 3, cut: false }],
};
const initialDraft = {
  id: "draft-body-two-tabs",
  idea: "동시 편집",
  editKind: "video",
  editLines: ["공통 원문"],
  text: { shorts: { hook: "공통 원문", body: "", cta: "" } },
  bodyRevision: 5,
  videoEdit: initialVideoEdit,
  vid: { url: "/api/media/test", file: "/api/media/test", model: "test" },
  status: "draft",
  savedAt: "2026-09-28T00:00:00.000Z",
};

function installSWR() {
  mocks.swr.mockImplementation((key: string | null) => {
    if (key === "/api/me") return { data: { isOperator: false }, mutate: vi.fn() };
    if (key?.startsWith("/api/studio/drafts?tenant_id=")) return { data: { drafts: [initialDraft], currentWork: null }, mutate: vi.fn() };
    if (key?.startsWith("/api/studio/brand-setup")) return { data: { guide: null }, mutate: vi.fn() };
    if (key === "/api/publish/first-comment-capabilities") return { data: { capabilities: [] }, mutate: vi.fn() };
    return { data: undefined, mutate: vi.fn() };
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  mocks.swr.mockReset();
  mocks.showToast.mockReset();
  installSWR();
  localStorage.setItem("studio_work:tenant-body-conflict", JSON.stringify({
    idea: initialDraft.idea,
    draftId: initialDraft.id,
    editKind: "video",
    editLines: initialDraft.editLines,
    text: initialDraft.text,
    bodyRevision: initialDraft.bodyRevision,
    videoEdit: initialVideoEdit,
    vid: initialDraft.vid,
  }));
  window.history.replaceState(null, "", "/studio?room=edit&draft_id=draft-body-two-tabs");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe("PR87-R5-MAJOR-01 두 탭 본문 충돌 복구", () => {
  it("탭 B 입력을 보관하고 최신본 확인 뒤 revision 6 위에 명시적으로 다시 적용한다", async () => {
    const posts: Array<Record<string, unknown>> = [];
    let attempt = 0;
    let releaseRetry!: () => void;
    const retryGate = new Promise<void>((resolve) => { releaseRetry = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        posts.push(body);
        attempt += 1;
        if (attempt === 1) {
          return new Response(JSON.stringify({
            ok: false,
            code: "BODY_STALE_REVISION",
            error: "다른 곳에서 먼저 본문을 수정했습니다.",
            serverRevision: 6,
            clientBaseRevision: 5,
            latestBody: {
              text: { shorts: { hook: "탭 A 최신본", body: "", cta: "" } },
              editLines: ["탭 A 최신본"],
              bodyRevision: 6,
            },
          }), { status: 409, headers: { "content-type": "application/json" } });
        }
        await retryGate;
        return new Response(JSON.stringify({ ok: true, id: initialDraft.id, bodyRevision: 7, videoEditServerRevision: 4 }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (typeof url === "string" && url.includes("elevenlabs-voices")) return new Response(JSON.stringify({ code: "ELEVENLABS_NOT_CONFIGURED" }), { status: 503 });
      return new Response(JSON.stringify({ accounts: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    render(<StudioPage />);
    const subtitle = await waitFor(() => document.querySelector("[data-video-subtitle-text]") as HTMLInputElement | null);
    expect(subtitle).toBeTruthy();
    fireEvent.change(subtitle!, { target: { value: "탭 B 내 변경" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    await waitFor(() => expect(document.querySelector("[data-body-edit-conflict]")).toBeTruthy());
    expect(posts).toHaveLength(1);
    expect(posts[0].bodyBaseRevision).toBe(5);
    expect((posts[0].videoEdit as typeof initialVideoEdit).subtitles[0].text).toBe("탭 B 내 변경");
    expect(document.body.textContent).toContain("다른 곳에서 먼저 수정됐어요");
    expect((document.querySelector("[data-edit-workspace]") as HTMLElement).hasAttribute("inert")).toBe(true);
    expect((document.querySelector("[data-video-subtitle-text]") as HTMLInputElement).value).toBe("탭 B 내 변경");

    fireEvent.click(document.querySelector("[data-body-conflict-load-latest]") as HTMLButtonElement);
    await waitFor(() => expect((document.querySelector("[data-video-subtitle-text]") as HTMLInputElement).value).toBe("탭 A 최신본"));
    expect(document.body.textContent).toContain("작성 중이던 내 변경은 보관되어 있으며 다시 적용할 수 있습니다");

    fireEvent.click(document.querySelector("[data-body-conflict-reapply]") as HTMLButtonElement);
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].bodyBaseRevision).toBe(6);
    expect(posts[1].editLines).toEqual(["탭 B 내 변경"]);
    expect(document.querySelector("[data-body-edit-conflict]")).toBeTruthy();
    expect((document.querySelector("[data-edit-workspace]") as HTMLElement).hasAttribute("inert")).toBe(true);
    expect(document.body.textContent).toContain("다시 적용 중");
    await act(async () => { releaseRetry(); await retryGate; });
    await waitFor(() => expect(document.querySelector("[data-body-edit-conflict]")).toBeNull());
    expect((document.querySelector("[data-video-subtitle-text]") as HTMLInputElement).value).toBe("탭 B 내 변경");
    expect(document.body.textContent).not.toContain("다른 곳에서 먼저 본문을 수정했습니다.");
    expect(document.querySelector("[data-edit-workspace]")?.hasAttribute("inert")).toBe(false);
  }, 20_000);

  it("본문과 영상 revision이 함께 stale이면 영상 복구를 열고 본문은 영상 없이 다시 적용한다", async () => {
    const posts: Array<Record<string, unknown>> = [];
    let attempt = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        posts.push(body);
        attempt += 1;
        if (attempt === 1) {
          return new Response(JSON.stringify({
            ok: false,
            code: "BODY_STALE_REVISION",
            serverRevision: 6,
            latestBody: {
              text: { shorts: { hook: "탭 A 최신본", body: "", cta: "" } },
              editLines: ["탭 A 최신본"],
              bodyRevision: 6,
            },
          }), { status: 409, headers: { "content-type": "application/json" } });
        }
        if (attempt === 2) {
          return new Response(JSON.stringify({
            ok: false,
            code: "VIDEO_EDIT_STALE_REVISION",
            error: "다른 곳에서 더 최신으로 저장된 영상 편집이 있습니다.",
          }), { status: 409, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({ ok: true, id: initialDraft.id, bodyRevision: 7 }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (typeof url === "string" && url.includes("elevenlabs-voices")) return new Response(JSON.stringify({ code: "ELEVENLABS_NOT_CONFIGURED" }), { status: 503 });
      return new Response(JSON.stringify({ accounts: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    render(<StudioPage />);
    const subtitle = await waitFor(() => document.querySelector("[data-video-subtitle-text]") as HTMLInputElement | null);
    fireEvent.change(subtitle!, { target: { value: "탭 B 영상 변경" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    await waitFor(() => expect(document.querySelector("[data-body-edit-conflict]")).toBeTruthy());

    fireEvent.click(document.querySelector("[data-body-conflict-reapply]") as HTMLButtonElement);
    await waitFor(() => expect(posts).toHaveLength(2));
    await waitFor(() => expect(document.querySelector("[data-video-edit-reload]")).toBeTruthy());
    expect(document.querySelector("[data-body-edit-conflict]")).toBeTruthy();
    expect((posts[1].videoEdit as typeof initialVideoEdit).subtitles[0].text).toBe("탭 B 영상 변경");

    fireEvent.click(document.querySelector("[data-body-conflict-reapply]") as HTMLButtonElement);
    await waitFor(() => expect(posts).toHaveLength(3));
    expect(posts[2].bodyBaseRevision).toBe(6);
    expect(posts[2].videoEdit).toBeNull();
    await waitFor(() => expect(document.querySelector("[data-body-edit-conflict]")).toBeNull());
    expect(document.querySelector("[data-video-edit-reload]")).toBeTruthy();
  }, 20_000);

  it("PR87-R6-RECOVERY-01 연속 409에서도 최초 로컬 본문을 보존해 최신 revision 위에 다시 적용한다", async () => {
    const posts: Array<Record<string, unknown>> = [];
    let attempt = 0;
    let releaseSecondConflict!: () => void;
    const secondConflictGate = new Promise<void>((resolve) => { releaseSecondConflict = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/video/subtitle")) {
        return new Response(JSON.stringify({ ok: true, file: "/api/media/subtitled.mp4" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        posts.push(body);
        attempt += 1;
        if (attempt <= 3) {
          if (attempt === 2) await secondConflictGate;
          const latestRevision = attempt === 3 ? 7 : 6;
          const latestLine = attempt === 3 ? "탭 A 두 번째 최신본" : "탭 A 최신본";
          return new Response(JSON.stringify({
            ok: false,
            code: "BODY_STALE_REVISION",
            serverRevision: latestRevision,
            latestBody: {
              text: { shorts: { hook: latestLine, body: "", cta: "" } },
              editLines: [latestLine],
              bodyRevision: latestRevision,
            },
          }), { status: 409, headers: { "content-type": "application/json" } });
        }
        const bodyRevision = attempt === 4 ? 8 : 9;
        return new Response(JSON.stringify({ ok: true, id: initialDraft.id, bodyRevision, videoEditServerRevision: attempt === 4 ? 4 : 5 }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (typeof url === "string" && url.includes("elevenlabs-voices")) return new Response(JSON.stringify({ code: "ELEVENLABS_NOT_CONFIGURED" }), { status: 503 });
      return new Response(JSON.stringify({ accounts: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }));

    render(<StudioPage />);
    const subtitle = await waitFor(() => document.querySelector("[data-video-subtitle-text]") as HTMLInputElement | null);
    fireEvent.change(subtitle!, { target: { value: "탭 B 마지막 영상 변경" } });
    const publishButton = Array.from(document.querySelectorAll("section[data-room='edit'] button"))
      .find((button) => button.textContent === "내보내기") as HTMLButtonElement;
    fireEvent.click(publishButton);
    await waitFor(() => expect(document.querySelector("[data-body-edit-conflict]")).toBeTruthy());

    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    await waitFor(() => expect(posts).toHaveLength(2));
    fireEvent.click(document.querySelector("[data-body-conflict-load-latest]") as HTMLButtonElement);
    await waitFor(() => expect((document.querySelector("[data-video-subtitle-text]") as HTMLInputElement).value).toBe("탭 A 최신본"));
    await act(async () => { releaseSecondConflict(); await secondConflictGate; });
    await waitFor(() => expect((document.querySelector("[data-body-conflict-load-latest]") as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(document.querySelector("[data-body-conflict-reapply]") as HTMLButtonElement);
    await waitFor(() => expect(document.body.textContent).toContain("다시 적용 중"));
    await waitFor(() => expect(posts).toHaveLength(3));
    expect(posts[2].bodyBaseRevision).toBe(6);
    expect(posts[2].editLines).toEqual(["탭 B 마지막 영상 변경"]);
    expect(document.querySelector("[data-body-edit-conflict]")).toBeTruthy();

    fireEvent.click(document.querySelector("[data-body-conflict-reapply]") as HTMLButtonElement);
    await waitFor(() => expect(posts).toHaveLength(5));
    expect(posts[3].bodyBaseRevision).toBe(7);
    expect(posts[3].editLines).toEqual(["탭 B 마지막 영상 변경"]);
    expect((posts[3].vid as { file?: string }).file).toBe((posts[0].vid as { file?: string }).file);
    expect(posts[4].bodyBaseRevision).toBe(8);
    expect((posts[4].vid as { file?: string }).file).toBe((posts[1].vid as { file?: string }).file);
    expect((posts[4].videoEdit as typeof initialVideoEdit).subtitles[0].text).toBe("탭 B 마지막 영상 변경");
    await waitFor(() => expect(document.querySelector("[data-body-edit-conflict]")).toBeNull());
  }, 20_000);
});
