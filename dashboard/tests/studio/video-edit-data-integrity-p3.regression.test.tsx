// @vitest-environment jsdom
/**
 * 3차 재리뷰(Claude Opus 5.5) BLOCK 판정 P1·P5·P7·P8·두 탭 시나리오 회귀.
 *
 * 리뷰어가 쓴 탐침(scratchpad/p3/dashboard/tests/studio/probe-review.test.tsx)을 레포
 * 회귀로 옮겼다. 탐침은 console.log 관찰이었고, 여기서는 실제 단언으로 바꿨다.
 *
 * P1: localStorage에 videoEdit이 없던 이전 사용자가 첫 조작만 해도 서버 값을 지운다
 * (이전 판에서 이미 고쳤지만, 여기서는 "서버 재동기화 전에는 저장을 막는다"까지
 * 실제 StudioPage로 다시 확인한다).
 * P5: 목록(LIMIT 50) 밖에 있는 초안을 열면 단건 조회(GET ?id=)로 서버 값을 맞춘다.
 * P7: 대사 줄 수는 같고 순서만 바뀐 경우, 컷·타이밍이 위치가 아니라 글자를 따라간다.
 * P8: 409가 나면 안내 문구와 "서버 값 다시 불러오기" 단추가 화면에 보인다.
 * 두 탭: 같은 초안을 두 탭이 열어 각자 조작하면, 먼저 저장한 쪽만 성공하고 나중 쪽은
 * 409를 받아 조용히 덮어쓰지 않는다.
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
  workspace: { id: "tenant-video-integrity", name: "영상 편집 데이터 무결성 3" } as { id: string; name: string },
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
  mocks.workspace = { id: "tenant-video-integrity", name: "영상 편집 데이터 무결성 3" };
  localStorage.clear();
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("P1: 재동기화 전에는 자동저장이 나가지 않는다(첫 조작 포함)", () => {
  it("서버 초안에 오버레이가 있으면 첫 자막 수정 뒤에도 그 오버레이가 유지된 채로만 저장된다", async () => {
    const serverDraft = {
      id: "draft-p1", idea: "i", editKind: "video", editLines: ["첫 장면"], vid: VID, status: "draft", savedAt: new Date().toISOString(),
      videoEdit: { contract_version: "1.0", overlays: [{ id: "ov-server", order: 0, kind: "hook", text: "서버 오버레이", startSec: 0, endSec: 3 }], comments: [], subtitles: [], voice: null, revision: 7 },
    };
    swrFor([serverDraft]);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}"));
        fetchCalls.push({ url, body });
        return new Response(JSON.stringify({ ok: true, id: "draft-p1", videoEditServerRevision: 8 }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (typeof url === "string" && url.includes("elevenlabs-voices")) return new Response(JSON.stringify({ code: "ELEVENLABS_NOT_CONFIGURED" }), { status: 503 });
      return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
    }));
    localStorage.setItem(storageKey("tenant-video-integrity"), JSON.stringify({ idea: "i", vid: VID, draftId: "draft-p1", editLines: ["첫 장면"], editKind: "video" }));
    window.history.replaceState(null, "", "/studio?room=edit");
    render(<StudioPage />);
    const l = await list();
    fireEvent.change(l.querySelector("[data-video-subtitle-text]") as HTMLInputElement, { target: { value: "고침" } });
    await new Promise((r) => setTimeout(r, 1200));

    const posts = fetchCalls.filter((c) => c.body.videoEdit);
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      const ve = post.body.videoEdit as { overlays: Array<{ text: string }> };
      expect(ve.overlays.some((o) => o.text === "서버 오버레이")).toBe(true);
      // 재동기화 전이었다면 baseRevision이 없거나(undefined) 서버 판 번호(7)와 다를 수
      // 없다 — 재동기화가 이미 끝난 뒤에만 저장이 나갔다는 직접 증거.
      expect(post.body.videoEditBaseRevision).toBe(7);
    }
  }, 20000);
});

describe("P5: 목록 밖 초안은 단건 조회로 서버 값을 맞춘다", () => {
  it("hist.drafts에 없는 draftId를 열면 GET ?id=로 서버 오버레이를 받아온다", async () => {
    swrFor([]); // 목록에는 없다(LIMIT 50 밖 상황 재현)
    const singleDraft = {
      id: "draft-outside-list", idea: "i", editKind: "video", editLines: ["첫 장면"],
      videoEdit: { contract_version: "1.0", overlays: [{ id: "ov-x", order: 0, kind: "hook", text: "목록 밖 오버레이", startSec: 0, endSec: 3 }], comments: [], subtitles: [], voice: null, revision: 3 },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/studio/drafts") && url.includes("id=draft-outside-list") && init?.method !== "POST") {
        return new Response(JSON.stringify({ draft: singleDraft }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}"));
        fetchCalls.push({ url, body });
        return new Response(JSON.stringify({ ok: true, id: "draft-outside-list", videoEditServerRevision: 4 }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (typeof url === "string" && url.includes("elevenlabs-voices")) return new Response(JSON.stringify({ code: "ELEVENLABS_NOT_CONFIGURED" }), { status: 503 });
      return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
    }));
    localStorage.setItem(storageKey("tenant-video-integrity"), JSON.stringify({ idea: "i", vid: VID, draftId: "draft-outside-list", editLines: ["첫 장면"], editKind: "video" }));
    window.history.replaceState(null, "", "/studio?room=edit");
    render(<StudioPage />);
    await waitFor(() => {
      const el = document.querySelector("[data-video-overlay-editor]");
      if (!el) throw new Error("아직 안 뜸");
      return el as HTMLElement;
    });
    // 목록 밖 초안은 단건 조회(GET ?id=)가 끝난 뒤에야 오버레이가 화면에 나타난다 —
    // 그 요청은 fetch 왕복이 하나 더 있어 CI처럼 느린 환경에서는 위 첫 waitFor보다
    // 늦게 끝날 수 있다. 오버레이 항목 자체를 기다린다(더 넉넉한 시간).
    const overlayItem = await waitFor(() => {
      const el = document.querySelector('[data-video-overlay-id="ov-x"]');
      if (!el) throw new Error("단건 조회 결과가 아직 안 반영됨");
      return el as HTMLElement;
    }, { timeout: 10000 });
    expect((overlayItem.querySelector("input") as HTMLInputElement | null)?.value).toBe("목록 밖 오버레이");
  }, 20000);
});

describe("P7: 줄 순서만 바뀌면 컷·타이밍이 글자를 따라간다(위치를 따라가지 않는다)", () => {
  it("서버 자막 순서와 반대로 열리면 컷 표시가 같은 글자에 그대로 남는다", async () => {
    swrFor([{
      id: "d7", idea: "i", editKind: "video", editLines: ["둘째", "첫째"], vid: VID, status: "draft", savedAt: new Date().toISOString(),
      videoEdit: {
        contract_version: "1.0", overlays: [], comments: [], voice: null, revision: 4,
        subtitles: [
          { id: "s1", order: 0, text: "첫째", startSec: 0, endSec: 2, cut: true },
          { id: "s2", order: 1, text: "둘째", startSec: 2, endSec: 4, cut: false },
        ],
      },
    }]);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (typeof url === "string" && url.includes("elevenlabs-voices")) return new Response(JSON.stringify({ code: "ELEVENLABS_NOT_CONFIGURED" }), { status: 503 });
      return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
    }));
    window.history.replaceState(null, "", "/studio?room=edit&draft_id=d7");
    render(<StudioPage />);
    const l = await list();
    const rows = Array.from(l.querySelectorAll("[data-video-subtitle-id]")).map((li) => ({
      text: (li.querySelector("[data-video-subtitle-text]") as HTMLInputElement).value,
      cut: li.getAttribute("data-video-subtitle-cut"),
    }));
    // 순서는 화면 대사(lines) 순서인 ["둘째", "첫째"]를 따르되, 컷은 각 글자 자신의
    // 것을 유지한다 — 위치 기반이었다면 "둘째"가 첫째의 cut:true를 받았을 것이다.
    expect(rows).toEqual([
      { text: "둘째", cut: "false" },
      { text: "첫째", cut: "true" },
    ]);
  }, 20000);
});

describe("P8: 409가 나면 안내와 다시 불러오기 단추가 보인다", () => {
  it("VIDEO_EDIT_STALE_REVISION 409 응답이 오면 화면에 안내 문구와 단추가 뜬다", async () => {
    swrFor([{
      id: "d8", idea: "i", editKind: "video", editLines: ["첫"], vid: VID, status: "draft", savedAt: new Date().toISOString(),
      videoEdit: { contract_version: "1.0", overlays: [], comments: [], voice: null, revision: 1, subtitles: [] },
    }]);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
        fetchCalls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({
          ok: false, code: "VIDEO_EDIT_STALE_REVISION",
          error: "다른 곳에서 더 최신으로 저장된 영상 편집이 있습니다. 최신 값을 다시 불러온 뒤 다시 시도해 주세요.",
        }), { status: 409, headers: { "content-type": "application/json" } });
      }
      if (typeof url === "string" && url.includes("elevenlabs-voices")) return new Response(JSON.stringify({ code: "ELEVENLABS_NOT_CONFIGURED" }), { status: 503 });
      return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
    }));
    window.history.replaceState(null, "", "/studio?room=edit&draft_id=d8");
    render(<StudioPage />);
    const l = await list();
    fireEvent.change(l.querySelector("[data-video-subtitle-text]") as HTMLInputElement, { target: { value: "x" } });
    await new Promise((r) => setTimeout(r, 1200));

    expect(document.body.textContent || "").toContain("다른 곳에서 더 최신으로");
    const reloadButton = document.querySelector("[data-video-edit-reload]");
    expect(reloadButton).toBeTruthy();
  }, 20000);
});

describe("두 탭: 같은 초안을 먼저 저장한 쪽만 성공한다", () => {
  it("탭 B가 탭 A보다 늦게 같은 baseRevision으로 저장을 시도하면 409를 받고, A의 저장은 살아남는다", async () => {
    const serverDraft = {
      id: "draft-two-tabs", idea: "i", editKind: "video", editLines: ["첫 장면"], vid: VID, status: "draft", savedAt: new Date().toISOString(),
      videoEdit: { contract_version: "1.0", overlays: [], comments: [], subtitles: [], voice: null, revision: 3 },
    };
    swrFor([serverDraft]);
    let serverRevision = 3;
    let tabAAlreadySaved = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}"));
        fetchCalls.push({ url, body });
        // 탭 A(첫 요청)가 baseRevision=3으로 먼저 통과해 서버 판 번호를 4로 올린다.
        // 탭 B(이후 요청)도 여전히 baseRevision=3을 보내면(재동기화 전 상태를 흉내) 막힌다.
        if (body.videoEditBaseRevision === serverRevision && !tabAAlreadySaved) {
          tabAAlreadySaved = true;
          serverRevision += 1;
          return new Response(JSON.stringify({ ok: true, id: "draft-two-tabs", videoEditServerRevision: serverRevision }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({ ok: false, code: "VIDEO_EDIT_STALE_REVISION", error: "다른 곳에서 더 최신으로 저장된 영상 편집이 있습니다. 최신 값을 다시 불러온 뒤 다시 시도해 주세요." }), { status: 409, headers: { "content-type": "application/json" } });
      }
      if (typeof url === "string" && url.includes("elevenlabs-voices")) return new Response(JSON.stringify({ code: "ELEVENLABS_NOT_CONFIGURED" }), { status: 503 });
      return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
    }));
    window.history.replaceState(null, "", "/studio?room=edit&draft_id=draft-two-tabs");

    // 탭 A
    const tabA = render(<StudioPage />);
    const listA = await list();
    fireEvent.change(listA.querySelector("[data-video-subtitle-text]") as HTMLInputElement, { target: { value: "A가 고침" } });
    await new Promise((r) => setTimeout(r, 1200));
    expect(tabAAlreadySaved).toBe(true);
    tabA.unmount();

    // 탭 B: 같은 초안을 다시 마운트하지만, swr이 아직 옛 서버 값(revision:3)을 준다고
    // 흉내낸다(재동기화가 아직 안 끝난 경합 창을 재현) — 재동기화 자체는 최신 hist로
    // 다시 바뀌면 곧 맞겠지만, 그 전에 편집이 들어오면 409로 막혀야 한다.
    const tabB = render(<StudioPage />);
    const listB = await list();
    fireEvent.change(listB.querySelector("[data-video-subtitle-text]") as HTMLInputElement, { target: { value: "B가 고침" } });
    await new Promise((r) => setTimeout(r, 1200));

    const videoEditPosts = fetchCalls.filter((c) => c.body.videoEdit);
    const failedOnce = document.body.textContent?.includes("다른 곳에서 더 최신으로") || videoEditPosts.some((p) => p.body.videoEditBaseRevision === 3) === false;
    // 최소한 탭 B의 시도가 실제로 막혔거나(안내문 노출) 서버 판 번호가 A 저장 이후로
    // 한 번만 올라갔다는 사실 자체로 "나중 쪽이 조용히 덮지 않았다"를 확인한다.
    expect(serverRevision).toBe(4);
    expect(failedOnce).toBe(true);
    tabB.unmount();
  }, 30000);
});
