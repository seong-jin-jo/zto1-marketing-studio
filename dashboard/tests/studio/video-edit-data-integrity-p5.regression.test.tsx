// @vitest-environment jsdom
/**
 * 5차 재리뷰(코디네이터 relay) BLOCK 판정 B-5 회귀.
 *
 * 리뷰어가 쓴 탐침(scratchpad/p5/dashboard/tests/studio/probe-review.test.tsx)의 P11을
 * 레포 회귀로 옮겼다. 탐침은 console.log 관찰이었고, 여기서는 실제 단언으로 바꿨다.
 *
 * B-5: localStorage에서 draftId를 복원할 때 videoEditReconciledRef(내부 ref)만
 * false로 두고, 화면이 실제로 보는 syncing(videoEditReconciling state)은 그대로
 * false였다 — hist 목록(SWR)이 아직 도착하기 전 그 창에서 +훅 등 컨트롤이 계속
 * 열려 있었고, 그 창에서 만든 편집이 목록 도착 후 재동기화(reconcileVideoEditFromServer)
 * 에 조용히 덮여 사라졌다. "재조정이 끝나기 전에는 편집 불가"를 하나의 신호로 묶어
 * (복원 시점부터 videoEditReconciling을 true로 켠다), 목록이 늦게 오는 창에서도
 * 컨트롤이 처음부터 막혀 있어야 한다.
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
  workspace: { id: "tenant-video-integrity-p5", name: "영상 편집 데이터 무결성 5" } as { id: string; name: string },
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

const VID = { url: "/api/media/test-video", file: "/api/media/test-video", model: "x" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Draft = Record<string, unknown> & { id: string; videoEdit?: Record<string, unknown> | null };
const store = new Map<string, Draft>();

function fakeServer() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      fetchCalls.push({ url, body });
      const cur = body.id ? store.get(body.id) : undefined;
      if (cur) {
        if (body.videoEdit) {
          const rev = (cur.videoEdit as { revision?: number } | null | undefined)?.revision ?? null;
          const base = typeof body.videoEditBaseRevision === "number" ? body.videoEditBaseRevision : null;
          if (rev !== base) return new Response(JSON.stringify({ ok: false, code: "VIDEO_EDIT_STALE_REVISION", error: "다른 곳에서 더 최신으로 저장된 영상 편집이 있습니다. 최신 값을 다시 불러온 뒤 다시 시도해 주세요." }), { status: 409, headers: { "content-type": "application/json" } });
          cur.videoEdit = { ...body.videoEdit, revision: (rev ?? -1) + 1 };
        }
        return new Response(JSON.stringify({ ok: true, id: cur.id, videoEditServerRevision: body.videoEdit ? (cur.videoEdit as { revision: number }).revision : null }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true, id: "new-1", videoEditServerRevision: body.videoEdit ? (body.videoEdit.revision ?? 0) : null }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (typeof url === "string" && url.includes("/api/studio/drafts") && url.includes("&id=")) {
      const id = decodeURIComponent(url.split("&id=")[1]);
      const d = store.get(id);
      return new Response(JSON.stringify({ draft: d ? JSON.parse(JSON.stringify(d)) : null }), { status: d ? 200 : 404, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
  }));
}
const ve = (overlayText: string, rev: number) => ({ contract_version: "1.0", overlays: [{ id: `ov-${overlayText}`, order: 0, kind: "hook", text: overlayText, startSec: 0, endSec: 3 }], comments: [], subtitles: [], voice: null, revision: rev });
const ovs = (id: string) => ((store.get(id)?.videoEdit as { overlays?: Array<{ text: string }> } | null)?.overlays ?? []).map((o) => o.text);

describe("PROBE5 회귀 — B-5", () => {
  beforeEach(() => { store.clear(); });

  it("P11: SWR 목록이 늦게 도착해도 복원 시점부터 +훅 버튼이 비활성화돼 있어야 한다", async () => {
    const serverD = { id: "W", idea: "i", editKind: "video", editLines: ["첫 장면"], vid: VID, status: "draft", savedAt: new Date().toISOString(), videoEdit: ve("서버최신", 5) };
    store.set("W", JSON.parse(JSON.stringify(serverD)));
    let ready = false;
    mocks.swr.mockImplementation((key: string | null) => {
      if (key === "/api/me") return { data: { isOperator: false }, mutate: vi.fn() };
      // B-5 재현 핵심: hist 목록(SWR)이 처음엔 undefined(로딩 중)다가 나중에 채워진다.
      if (key && key.startsWith("/api/studio/drafts?tenant_id=")) return { data: ready ? { drafts: [serverD], currentWork: null } : undefined, mutate: vi.fn() };
      if (key && key.startsWith("/api/studio/brand-setup")) return { data: { guide: null }, mutate: vi.fn() };
      if (key === "/api/publish/first-comment-capabilities") return { data: { capabilities: [] }, mutate: vi.fn() };
      return { data: undefined, mutate: vi.fn() };
    });
    fakeServer();
    localStorage.setItem(storageKey("tenant-video-integrity-p5"), JSON.stringify({ idea: "i", vid: VID, draftId: "W", editLines: ["첫 장면"], editKind: "video", videoEdit: ve("로컬값", 5) }));
    window.history.replaceState(null, "", "/studio?room=edit");
    const r = render(<StudioPage />);
    await waitFor(() => { if (!document.querySelector("[data-video-editor]")) throw new Error("no editor yet"); });

    // 핵심 단언: hist 목록이 아직 undefined인 이 순간에도 draftId가 복원됐으므로
    // syncing이 즉시 켜져 있어야 한다(구 버그는 여기서 false였다).
    expect(document.querySelector("[data-video-syncing-note]"), "목록 도착 전에도 맞추는 중 안내가 보여야 한다").toBeTruthy();
    const hook = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "＋훅") as HTMLButtonElement;
    expect(hook?.disabled, "목록 도착 전에도 +훅 버튼이 비활성화돼야 한다").toBe(true);

    const before = document.querySelectorAll("[data-video-overlay-list] [data-video-overlay-id]").length;
    fireEvent.click(hook); // disabled라 무시돼야 한다
    await sleep(50);
    const afterClick = document.querySelectorAll("[data-video-overlay-list] [data-video-overlay-id]").length;
    expect(afterClick, "비활성 상태에서 클릭해도 로컬 오버레이 개수가 늘면 안 된다").toBe(before);

    // 목록이 이제 도착한다 — 재동기화가 서버 값으로 맞춘다.
    ready = true;
    r.rerender(<StudioPage />);
    await sleep(9500);

    // 서버 오버레이만 남아야 한다("로컬값"이 조용히 살아남거나 섞이면 안 된다).
    expect(ovs("W"), "재동기화 뒤 서버 값에는 서버 오버레이만 있어야 한다").toEqual(["서버최신"]);
    const finalInputs = Array.from(document.querySelectorAll("[data-video-overlay-list] input")).map((i) => (i as HTMLInputElement).value);
    expect(finalInputs, "화면도 서버 값(서버최신)으로 맞춰져야 한다").toEqual(["서버최신"]);
  }, 20000);
});
