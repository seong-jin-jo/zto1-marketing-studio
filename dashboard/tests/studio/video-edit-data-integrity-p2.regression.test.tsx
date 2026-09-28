// @vitest-environment jsdom
/**
 * 교차 리뷰(Claude Opus 5.5) 재리뷰 BLOCK 판정 P1·P2·P3·P4 회귀.
 *
 * 리뷰어가 직접 만든 탐침(scratchpad probe-review.test.tsx)을 레포 회귀로 옮긴 것이다.
 * 탐침은 console.log로 관찰만 했다 — 여기서는 실제 단언으로 바꿨다.
 *
 * P1(BLOCKER 1 — B1이 절반만 닫힘): localStorage에 videoEdit이 없는 이전 사용자가
 * 첫 조작(자막 한 글자 수정)만 해도, 서버가 이미 갖고 있던 오버레이·댓글·목소리가
 * 빈 값으로 덮였다.
 * P2(BLOCKER 2, 보안): 워크스페이스 전환 시 setCardDeck(null)은 있는데
 * setVideoEdit(null)이 없어, tenant-A의 오버레이가 tenant-B 초안 저장에 섞여 나갔다.
 * P3(MAJOR): 타임라인 자막 레인이 재구성된 대본(displaySubtitles)이 아니라 서버 원본
 * (edit.subtitles)을 그려 대본 패널과 타임라인이 서로 다른 자막을 보여줬다.
 * P4(MAJOR): 위치(index) 기반 재구성이 대사 줄 수가 바뀐 사이 컷·타이밍을 엉뚱한
 * 줄에 붙였다.
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioPage from "@/app/studio/page";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
  showToast: vi.fn(),
  setStudioRoom: vi.fn(),
  workspace: { id: "tenant-video-integrity", name: "영상 편집 데이터 무결성 2" } as { id: string; name: string },
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
    get activeWorkspace() { return mocks.workspace; },
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
const VID = { url: "/api/media/test-video", file: "/api/media/test-video", model: "x" };

function setupFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      fetchCalls.push({ url, body });
      return new Response(JSON.stringify({ ok: true, id: (body.id as string) || "draft-integrity-2" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (typeof url === "string" && url.includes("elevenlabs-voices")) {
      return new Response(JSON.stringify({ code: "ELEVENLABS_NOT_CONFIGURED" }), { status: 503 });
    }
    return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
  }));
}

function swrFor(drafts: unknown[]) {
  mocks.swr.mockImplementation((key: string | null) => {
    if (key === "/api/me") return { data: { isOperator: false }, mutate: vi.fn() };
    if (key && key.startsWith("/api/studio/drafts?tenant_id=")) return { data: { drafts, currentWork: null }, mutate: vi.fn() };
    if (key && key.startsWith("/api/studio/brand-setup")) return { data: { guide: null }, mutate: vi.fn() };
    if (key === "/api/publish/first-comment-capabilities") return { data: { capabilities: [] }, mutate: vi.fn() };
    return { data: undefined, mutate: vi.fn() };
  });
}
async function list() {
  return waitFor(() => { const el = document.querySelector("[data-video-subtitle-list]"); if (!el) throw new Error("no list"); return el as HTMLElement; });
}

beforeEach(() => {
  fetchCalls.length = 0;
  mocks.setStudioRoom.mockReset();
  mocks.showToast.mockReset();
  mocks.swr.mockReset();
  mocks.workspace = { id: "tenant-video-integrity", name: "영상 편집 데이터 무결성 2" };
  localStorage.clear();
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("P1: localStorage에 videoEdit이 없던 이전 사용자도 첫 조작이 서버 값을 안 지운다", () => {
  it("서버 초안에 오버레이가 있으면 첫 자막 수정 뒤에도 그 오버레이가 그대로 저장된다", async () => {
    const serverDraft = {
      id: "draft-server-has-overlays",
      idea: "i",
      editKind: "video",
      editLines: ["첫 장면"],
      vid: VID,
      status: "draft",
      savedAt: new Date().toISOString(),
      videoEdit: {
        contract_version: "1.0",
        overlays: [{ id: "ov-server", order: 0, kind: "hook", text: "서버 오버레이", startSec: 0, endSec: 3 }],
        comments: [],
        subtitles: [],
        voice: { voiceId: "v1", voiceName: "서버 목소리" },
        revision: 7,
      },
    };
    swrFor([serverDraft]);
    setupFetch();
    // P1의 핵심 조건: localStorage에 videoEdit 키가 아예 없다(이전 사용자 전부 이 상태).
    localStorage.setItem(storageKey("tenant-video-integrity"), JSON.stringify({
      idea: "i", vid: VID, draftId: "draft-server-has-overlays", editLines: ["첫 장면"], editKind: "video",
    }));
    window.history.replaceState(null, "", "/studio?room=edit");
    render(<StudioPage />);

    const l = await list();
    fireEvent.change(l.querySelector("[data-video-subtitle-text]") as HTMLInputElement, { target: { value: "고침" } });
    await new Promise((r) => setTimeout(r, 1200));

    const posts = fetchCalls.filter((c) => c.body.videoEdit);
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      const ve = post.body.videoEdit as { overlays: Array<{ text: string }>; voice: unknown };
      expect(ve.overlays.some((o) => o.text === "서버 오버레이")).toBe(true);
      expect(ve.voice).not.toBeNull();
    }
  }, 20000);
});

describe("P2: 워크스페이스를 바꾸면 이전 워크스페이스의 videoEdit이 새 워크스페이스로 새지 않는다", () => {
  it("tenant-A의 오버레이가 tenant-B 저장에 섞이지 않는다", async () => {
    localStorage.setItem("studio_work:tenant-A", JSON.stringify({
      idea: "A", vid: VID, draftId: "draft-A", editLines: ["A 대사"], editKind: "video",
      videoEdit: { contract_version: "1.0", overlays: [{ id: "ov-A", order: 0, kind: "hook", text: "A테넌트 오버레이", startSec: 0, endSec: 3 }], comments: [], subtitles: [], voice: null, revision: 2 },
    }));
    localStorage.setItem("studio_work:tenant-B", JSON.stringify({ idea: "B", vid: VID, draftId: "draft-B", editLines: ["B 대사"], editKind: "video" }));
    swrFor([]);
    setupFetch();
    mocks.workspace = { id: "tenant-A", name: "A" };
    window.history.replaceState(null, "", "/studio?room=edit");
    const r = render(<StudioPage />);
    const listA = await list();
    expect((listA.querySelector("[data-video-subtitle-text]") as HTMLInputElement).value).toBe("A 대사");

    mocks.workspace = { id: "tenant-B", name: "B" };
    r.rerender(<StudioPage />);
    const listB = await waitFor(() => {
      const el = document.querySelector("[data-video-subtitle-list]") as HTMLElement | null;
      const input = el?.querySelector("[data-video-subtitle-text]") as HTMLInputElement | null;
      if (!el || !input || input.value !== "B 대사") throw new Error("아직 B로 안 바뀜");
      return el;
    });
    // 화면에도, localStorage에도, 어떤 저장 요청에도 A의 오버레이가 없어야 한다.
    expect(listB.textContent).not.toContain("A테넌트 오버레이");
    const lsB = JSON.parse(localStorage.getItem("studio_work:tenant-B") || "{}");
    expect(JSON.stringify(lsB.videoEdit ?? {})).not.toContain("A테넌트 오버레이");

    fireEvent.change(listB.querySelector("[data-video-subtitle-text]") as HTMLInputElement, { target: { value: "B 고침" } });
    await new Promise((res) => setTimeout(res, 1200));
    const leaked = fetchCalls.some((c) => JSON.stringify(c.body.videoEdit ?? {}).includes("A테넌트 오버레이"));
    expect(leaked).toBe(false);
  }, 20000);
});

describe("P3: 타임라인 자막 레인은 재구성된 대본을 그린다(대본 패널과 같은 값)", () => {
  it("장면 대사 순서로 재구성된 문구가 타임라인 블록에도 그대로 보인다", async () => {
    swrFor([{
      id: "d3", idea: "i", editKind: "video", editLines: ["둘째", "셋째"], vid: VID, status: "draft", savedAt: new Date().toISOString(),
      videoEdit: {
        contract_version: "1.0", overlays: [], comments: [], voice: null, revision: 4,
        subtitles: [
          { id: "s1", order: 0, text: "첫째", startSec: 0, endSec: 2, cut: false },
          { id: "s2", order: 1, text: "둘째", startSec: 2, endSec: 4, cut: false },
        ],
      },
    }]);
    setupFetch();
    window.history.replaceState(null, "", "/studio?room=edit&draft_id=d3");
    render(<StudioPage />);
    await list();

    const scriptTexts = Array.from(document.querySelectorAll("[data-video-subtitle-text]")).map((el) => (el as HTMLInputElement).value);
    const timelineTexts = Array.from(document.querySelectorAll('[data-video-timeline-block="subtitle"]')).map((b) => b.textContent);
    expect(scriptTexts).toEqual(["둘째", "셋째"]);
    // 타임라인이 서버 원본(subtitles: 첫째/둘째)을 그렸다면 여기서 "첫째"가 남는다.
    expect(timelineTexts.some((t) => t?.includes("첫째"))).toBe(false);
    expect(timelineTexts).toEqual(scriptTexts);
  }, 20000);
});

describe("P4: 대사 줄 수가 바뀌면 컷·타이밍이 엉뚱한 줄에 붙지 않는다", () => {
  it("서버 자막 3줄 중 1줄이 빠지면 남은 줄에 옛 컷 상태를 잘못 이어 붙이지 않는다", async () => {
    swrFor([{
      id: "d4", idea: "i", editKind: "video", editLines: ["둘째", "셋째"], vid: VID, status: "draft", savedAt: new Date().toISOString(),
      videoEdit: {
        contract_version: "1.0", overlays: [], comments: [], voice: null, revision: 4,
        subtitles: [
          { id: "s1", order: 0, text: "첫째", startSec: 0, endSec: 2, cut: false },
          { id: "s2", order: 1, text: "둘째", startSec: 2, endSec: 4, cut: true },
          { id: "s3", order: 2, text: "셋째", startSec: 4, endSec: 6, cut: false },
        ],
      },
    }]);
    setupFetch();
    window.history.replaceState(null, "", "/studio?room=edit&draft_id=d4");
    render(<StudioPage />);
    const l = await list();
    const rows = Array.from(l.querySelectorAll("[data-video-subtitle-id]")).map((li) => ({
      text: (li.querySelector("[data-video-subtitle-text]") as HTMLInputElement).value,
      cut: li.getAttribute("data-video-subtitle-cut"),
    }));
    expect(rows).toEqual([
      { text: "둘째", cut: "false" },
      { text: "셋째", cut: "false" },
    ]);
  }, 20000);
});
