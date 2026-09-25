// @vitest-environment jsdom
/**
 * 6차 재리뷰(코디네이터 relay) BLOCK 판정 B-6·B-7 회귀.
 *
 * 리뷰어가 쓴 탐침(scratchpad/p6/dashboard/tests/studio/probe-review.test.tsx)의 P14·
 * P17을 레포 회귀로 옮겼다. 탐침은 console.log 관찰이었고, 여기서는 실제 단언으로
 * 바꿨다.
 *
 * P14(B-6, 5차에서 생긴 회귀): 목록 조회(SWR)가 500으로 실패하면
 * reconcileVideoEditFromServer가 `!hist?.drafts`에 걸려 절대 안 불린다 — 영상 편집이
 * 영구히 잠겼다. 목록 error가 나면 단건 GET으로 넘어가게 해서 최소한 10초 타임아웃
 * 안에 풀리게 한다.
 * P17(B-7, 보안): 맞춤(reconcile) 중에 워크스페이스를 바꾸면 A 테넌트의 videoEdit이
 * B 테넌트 화면·localStorage·저장 요청에 새면 안 된다. "비동기 맞춤 결과는 발급
 * 세대가 현재 세대와 같을 때만 반영한다"는 단일 원칙(reconcileGenerationRef)으로
 * 막는다. 실측 중 이 원칙 자체가 만든 2차 결함(유령 재조회가 B를 영구 잠금 상태로
 * 남기는 것)도 함께 잡아 회귀에 포함했다 — hist?.drafts 참조 변화가 아니라 "목록
 * 도착 여부(불리언)"에만 감시 효과가 반응하도록 고쳤다.
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
  workspace: { id: "tenant-video-integrity-p6-a", name: "A" } as { id: string; name: string },
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

beforeEach(() => {
  fetchCalls.length = 0;
  mocks.setStudioRoom.mockReset();
  mocks.showToast.mockReset();
  mocks.swr.mockReset();
  localStorage.clear();
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

async function list() {
  return waitFor(() => { const el = document.querySelector("[data-video-subtitle-list]"); if (!el) throw new Error("no list"); return el as HTMLElement; });
}
const VID = { url: "/api/media/test-video", file: "/api/media/test-video", model: "x" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Draft = Record<string, unknown> & { id: string; videoEdit?: Record<string, unknown> | null };
const store = new Map<string, Draft>();
const gets: string[] = [];

function fakeServer(opts: { getDelay?: number } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      fetchCalls.push({ url, body });
      return new Response(JSON.stringify({ ok: true, id: "new-1", videoEditServerRevision: body.videoEdit ? (body.videoEdit.revision ?? 0) : null }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (typeof url === "string" && url.includes("/api/studio/drafts") && url.includes("&id=")) {
      const id = decodeURIComponent(url.split("&id=")[1]);
      gets.push(id);
      if (opts.getDelay) await sleep(opts.getDelay);
      const d = store.get(id);
      return new Response(JSON.stringify({ draft: d ? JSON.parse(JSON.stringify(d)) : null }), { status: d ? 200 : 404, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
  }));
}
const ve = (overlayText: string, rev: number) => ({ contract_version: "1.0", overlays: [{ id: `ov-${overlayText}`, order: 0, kind: "hook", text: overlayText, startSec: 0, endSec: 3 }], comments: [], subtitles: [], voice: null, revision: rev });

function swrByTenant(map: Record<string, unknown[] | "fail">) {
  mocks.swr.mockImplementation((key: string | null) => {
    if (key === "/api/me") return { data: { isOperator: false }, mutate: vi.fn() };
    if (key && key.startsWith("/api/studio/drafts?tenant_id=")) {
      const t = key.split("tenant_id=")[1];
      const v = map[t] ?? [];
      if (v === "fail") return { data: undefined, error: new Error("API error: 500"), mutate: vi.fn() };
      return { data: { drafts: v, currentWork: null }, mutate: vi.fn() };
    }
    if (key && key.startsWith("/api/studio/brand-setup")) return { data: { guide: null }, mutate: vi.fn() };
    if (key === "/api/publish/first-comment-capabilities") return { data: { capabilities: [] }, mutate: vi.fn() };
    return { data: undefined, mutate: vi.fn() };
  });
}
const syncingNow = () => Boolean(document.querySelector("[data-video-syncing-note]"));
const inputDisabled = () => (document.querySelector("[data-video-subtitle-text]") as HTMLInputElement | null)?.disabled;

describe("PROBE6 회귀 — B-6·B-7", () => {
  beforeEach(() => { store.clear(); gets.length = 0; mocks.workspace = { id: "tenant-video-integrity-p6-a", name: "A" }; });
  afterEach(() => { mocks.workspace = { id: "tenant-video-integrity-p6-a", name: "A" }; });

  it("P14(B-6): 목록 조회가 500으로 실패해도 영상 편집이 영구히 잠기지 않는다", async () => {
    store.set("F", { id: "F", editKind: "video", editLines: ["첫 장면"], vid: VID, videoEdit: ve("서버최신", 5) });
    swrByTenant({ "tenant-video-integrity-p6-a": "fail" });
    fakeServer();
    localStorage.setItem(storageKey("tenant-video-integrity-p6-a"), JSON.stringify({ idea: "i", vid: VID, draftId: "F", editLines: ["첫 장면"], editKind: "video", videoEdit: ve("로컬", 5) }));
    window.history.replaceState(null, "", "/studio?room=edit");
    render(<StudioPage />);
    await list();
    // B-6 이전에는 !hist?.drafts에 영원히 걸려 아래가 계속 true였다. 목록 error를
    // 받으면 단건 GET(force)으로 넘어가므로, 10초 내부 타임아웃보다 한참 짧은 시간
    // 안에 실제 GET(store에 F가 있으므로 성공)으로 풀려야 한다.
    await waitFor(() => { if (syncingNow()) throw new Error("still syncing"); }, { timeout: 5000, interval: 100 });
    expect(inputDisabled(), "목록 실패 뒤에도 편집 입력이 막혀 있으면 안 된다").toBe(false);
    expect(gets, "목록을 포기하고 단건 GET으로 넘어가야 한다").toContain("F");
  }, 20000);

  it("P17(B-7): 맞춤 중 워크스페이스를 바꾸면 옛 테넌트 값이 새 테넌트 화면·저장에 안 샌다", async () => {
    store.set("XA", { id: "XA", editKind: "video", editLines: ["A 대사"], vid: VID, videoEdit: ve("A테넌트오버레이", 5) });
    swrByTenant({ "tenant-video-integrity-p6-a": [], "tenant-video-integrity-p6-b": [] });
    fakeServer({ getDelay: 1500 });
    localStorage.setItem(storageKey("tenant-video-integrity-p6-a"), JSON.stringify({ idea: "A", vid: VID, draftId: "XA", editLines: ["A 대사"], editKind: "video" }));
    localStorage.setItem(storageKey("tenant-video-integrity-p6-b"), JSON.stringify({ idea: "B", vid: VID, editLines: ["B 대사"], editKind: "video" }));
    mocks.workspace = { id: "tenant-video-integrity-p6-a", name: "A" };
    window.history.replaceState(null, "", "/studio?room=edit");
    const r = render(<StudioPage />);
    await list();
    await sleep(200); // A의 단건 GET(1.5초 지연)이 아직 진행 중인 창
    mocks.workspace = { id: "tenant-video-integrity-p6-b", name: "B" };
    r.rerender(<StudioPage />);
    await sleep(2500); // A의 GET이 끝났을 시간을 포함해서 기다린다

    // 핵심 단언 1: B 화면에 A의 오버레이("A테넌트오버레이")가 보이면 안 된다.
    const overlayHtml = (document.querySelector("[data-video-overlay-editor]") as HTMLElement | null)?.innerHTML ?? "";
    expect(overlayHtml, "B 화면에 A 테넌트의 오버레이가 새면 안 된다").not.toContain("A테넌트오버레이");
    // 핵심 단언 2: B의 localStorage에도 A의 videoEdit이 스며들면 안 된다.
    const lsB = JSON.parse(localStorage.getItem(storageKey("tenant-video-integrity-p6-b")) || "{}");
    expect(lsB.videoEdit?.overlays ?? null, "B의 localStorage에 A 오버레이가 저장되면 안 된다").not.toEqual(
      expect.arrayContaining([expect.objectContaining({ text: "A테넌트오버레이" })]),
    );
    // 핵심 단언 3(2차 발견 결함): B가 영구히 "맞추는 중"으로 잠기면 안 된다 — 세대
    // 판정으로 A의 결과는 버려지지만, 그 판정만으로는 B의 syncing을 꺼주지 않는
    // 경로가 있었다(감시 효과가 옛 draftId 클로저로 유령 재조회를 새로 시작).
    expect(syncingNow(), "B가 A의 유령 재조회 때문에 영구히 잠기면 안 된다").toBe(false);
    expect(inputDisabled(), "B의 편집 입력이 막혀 있으면 안 된다").toBe(false);

    // 핵심 단언 4: 이제 B에서 저장하면, 그 저장 요청에 A의 오버레이가 실리면 안 된다.
    const l = await list();
    fireEvent.change(l.querySelector("[data-video-subtitle-text]") as HTMLInputElement, { target: { value: "B 고침" } });
    await sleep(1500);
    const videoEditPosts = fetchCalls.filter((c) => c.body.tenant_id === "tenant-video-integrity-p6-b");
    for (const post of videoEditPosts) {
      const overlays = ((post.body.videoEdit as { overlays?: Array<{ text: string }> } | null)?.overlays ?? []).map((o) => o.text);
      expect(overlays, "B의 저장 요청에 A 오버레이가 실리면 안 된다").not.toContain("A테넌트오버레이");
    }
  }, 30000);
});
