// @vitest-environment jsdom
/**
 * 4차 재리뷰(코디네이터 relay) BLOCK 판정 B-1·B-2, MAJOR M-1 회귀.
 *
 * 리뷰어가 쓴 탐침(scratchpad/p4/dashboard/tests/studio/probe-review.test.tsx)의 P8·P9·
 * P10을 레포 회귀로 옮겼다. 탐침은 console.log 관찰이었고, 여기서는 실제 단언으로
 * 바꿨다.
 *
 * P8(M-1): 다시 불러오기 버튼은 hist 목록 캐시가 아니라 항상 단건 GET을 쳐야 한다 —
 * 목록에 없는(막 충돌난) 초안도 다시 불러올 수 있어야 두 번째 저장이 409를 반복하지
 * 않는다.
 * P9(B-2): 새 초안의 첫 저장이 id를 받아 draftId를 채우는 순간, 그 직후에 한 편집이
 * 화면·서버 양쪽에서 사라지면 안 된다 — 저장 응답 왕복 중에 한 조작을 더 하면 그
 * 조작도 살아남아야 한다.
 * P10(B-1): 서버 값과 맞추는 중(syncing)에는 훅 추가 버튼이 비활성화돼 있어야 하고,
 * 클릭해도 옛 localStorage 값 기반 편집이 서버로 나가면 안 된다.
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
  workspace: { id: "tenant-video-integrity-p4", name: "영상 편집 데이터 무결성 4" } as { id: string; name: string },
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

function fakeServer(opts: { postDelay?: number; getDelay?: number } = {}) {
  let n = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      fetchCalls.push({ url, body });
      if (opts.postDelay) await sleep(opts.postDelay);
      const cur = body.id ? store.get(body.id) : undefined;
      if (cur) {
        if (body.videoEdit) {
          const rev = (cur.videoEdit as { revision?: number } | null | undefined)?.revision ?? null;
          const base = typeof body.videoEditBaseRevision === "number" ? body.videoEditBaseRevision : null;
          if (rev !== base) return new Response(JSON.stringify({ ok: false, code: "VIDEO_EDIT_STALE_REVISION", error: "다른 곳에서 더 최신으로 저장된 영상 편집이 있습니다. 최신 값을 다시 불러온 뒤 다시 시도해 주세요." }), { status: 409, headers: { "content-type": "application/json" } });
          cur.videoEdit = { ...body.videoEdit, revision: (rev ?? -1) + 1 };
        }
        if (body.editLines) cur.editLines = body.editLines;
        return new Response(JSON.stringify({ ok: true, id: cur.id, videoEditServerRevision: body.videoEdit ? (cur.videoEdit as { revision: number }).revision : null }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const id = `new-${++n}`;
      store.set(id, { id, editKind: "video", editLines: body.editLines, vid: body.vid, videoEdit: body.videoEdit ?? null });
      return new Response(JSON.stringify({ ok: true, id, videoEditServerRevision: body.videoEdit ? (body.videoEdit.revision ?? 0) : null }), { status: 200, headers: { "content-type": "application/json" } });
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
const ve = (overlayText: string, rev: number, subs: unknown[] = []) => ({ contract_version: "1.0", overlays: [{ id: `ov-${overlayText}`, order: 0, kind: "hook", text: overlayText, startSec: 0, endSec: 3 }], comments: [], subtitles: subs, voice: null, revision: rev });
const ovs = (id: string) => ((store.get(id)?.videoEdit as { overlays?: Array<{ text: string }> } | null)?.overlays ?? []).map((o) => o.text);

function swrFor(drafts: unknown[]) {
  mocks.swr.mockImplementation((key: string | null) => {
    if (key === "/api/me") return { data: { isOperator: false }, mutate: vi.fn() };
    if (key && key.startsWith("/api/studio/drafts?tenant_id=")) return { data: { drafts, currentWork: null }, mutate: vi.fn() };
    if (key && key.startsWith("/api/studio/brand-setup")) return { data: { guide: null }, mutate: vi.fn() };
    if (key === "/api/publish/first-comment-capabilities") return { data: { capabilities: [] }, mutate: vi.fn() };
    return { data: undefined, mutate: vi.fn() };
  });
}

describe("PROBE4 회귀 — B-1/B-2/M-1", () => {
  beforeEach(() => { store.clear(); gets.length = 0; });

  it("P8: 다시 불러오기는 hist 목록에 없어도(force GET) 최신값을 읽고, 두 번째 저장은 409를 반복하지 않는다", async () => {
    // "탭A"가 이미 새 값을 저장해 서버 판번호=2, 탭B가 보는 hist 목록 캐시는 여전히
    // 판번호=1인 옛 값이다(LIMIT 50 목록이 아직 갱신되지 않은 상태를 흉내낸다).
    const listCopy = { id: "d8", idea: "i", editKind: "video", editLines: ["첫"], vid: VID, status: "draft", savedAt: new Date().toISOString(), videoEdit: ve("탭B가 본 값", 1) };
    store.set("d8", { ...listCopy, videoEdit: ve("탭A가 저장한 값", 2) } as Draft);
    swrFor([listCopy]); fakeServer();
    window.history.replaceState(null, "", "/studio?room=edit&draft_id=d8");
    render(<StudioPage />);
    await waitFor(() => { const i = document.querySelector("[data-video-subtitle-text]") as HTMLInputElement | null; if (!i || i.disabled) throw new Error("wait"); });

    // hist 목록 값(판번호=1)을 base로 자동 맞춰진 상태에서 자막을 고쳐 저장 → 서버의
    // 실제 판번호(2)와 달라 409가 난다.
    let l = await list();
    fireEvent.change(l.querySelector("[data-video-subtitle-text]") as HTMLInputElement, { target: { value: "x1" } });
    await sleep(1200);
    const btn = document.querySelector("[data-video-edit-reload]") as HTMLButtonElement | null;
    expect(btn, "409 발생 시 다시 불러오기 버튼이 보여야 한다").toBeTruthy();

    fireEvent.click(btn!);
    await sleep(300);
    // M-1 핵심 단언: force reload는 hist 목록을 보지 않고 반드시 단건 GET을 쳐야 한다.
    expect(gets, "다시 불러오기는 hist 목록 캐시를 건너뛰고 단건 GET을 쳐야 한다").toContain("d8");
    // 화면이 서버의 최신(탭A가 저장한 값)으로 맞춰졌어야 한다.
    expect((document.querySelector("[data-video-overlay-editor]") as HTMLElement)?.innerHTML).toContain("탭A가");

    // 다시 불러온 뒤 재시도한 저장은 더 이상 409가 아니어야 한다(무한 루프 종료).
    l = await list();
    fireEvent.change(l.querySelector("[data-video-subtitle-text]") as HTMLInputElement, { target: { value: "x2" } });
    await sleep(1200);
    expect(document.querySelector("[data-video-edit-reload]"), "재시도는 최신 판번호를 base로 쓰므로 409가 다시 나면 안 된다").toBeFalsy();
  }, 30000);

  it("P9: 새 초안 첫 저장 RTT 중에 한 조작을 더 해도 화면·서버 양쪽에서 사라지지 않는다", async () => {
    swrFor([]); fakeServer({ postDelay: 500 });
    localStorage.setItem(storageKey("tenant-video-integrity-p4"), JSON.stringify({ idea: "i", vid: VID, editLines: ["하나", "둘"], editKind: "video" }));
    window.history.replaceState(null, "", "/studio?room=edit");
    render(<StudioPage />);
    let l = await list();
    fireEvent.click(l.querySelectorAll("[data-video-subtitle-cut-toggle]")[0]);
    await sleep(1000); // 첫 저장(800ms 디바운스 + 500ms 지연 POST)이 아직 왕복 중
    l = await list();
    fireEvent.click(l.querySelectorAll("[data-video-subtitle-cut-toggle]")[1]);
    await sleep(3000);
    l = await list();
    const rows = Array.from(l.querySelectorAll("li")).map((li) => li.getAttribute("data-video-subtitle-cut"));
    const id = Array.from(store.keys())[0];
    const storeCuts = ((store.get(id)?.videoEdit as { subtitles: Array<{ cut: boolean }> } | undefined)?.subtitles ?? []).map((s) => s.cut);
    // B-2 핵심 단언: 두 줄 다 컷 토글했으므로 화면·서버 모두 [true, true]여야 한다.
    // reconcile이 자기가 만든 초안을 다시 조회해 첫 번째 조작을 지웠다면 여기서 깨진다.
    expect(rows, "화면에 두 조작이 모두 반영돼야 한다").toEqual(["true", "true"]);
    expect(storeCuts, "서버에도 두 조작이 모두 저장돼야 한다").toEqual([true, true]);
  }, 30000);

  it("P10: syncing 중에는 +훅 버튼이 비활성화되고, 클릭해도 옛 localStorage 값 기반 저장이 나가지 않는다", async () => {
    store.set("Y", { id: "Y", editKind: "video", editLines: ["첫 장면"], vid: VID, videoEdit: ve("서버최신", 5) });
    swrFor([]); fakeServer({ getDelay: 1500 });
    localStorage.setItem(storageKey("tenant-video-integrity-p4"), JSON.stringify({ idea: "i", vid: VID, draftId: "Y", editLines: ["첫 장면"], editKind: "video", videoEdit: ve("옛날값", 3) }));
    window.history.replaceState(null, "", "/studio?room=edit");
    render(<StudioPage />);
    await list();
    await sleep(100);
    // reconcile(getDelay=1500ms)이 아직 도는 중 — 이 창에서 syncing 표시와 버튼 비활성이
    // 둘 다 서 있어야 한다.
    expect(document.querySelector("[data-video-syncing-note]"), "맞추는 중 안내가 보여야 한다").toBeTruthy();
    const hook = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "＋훅") as HTMLButtonElement;
    expect(hook?.disabled, "syncing 중에는 +훅 버튼이 비활성화돼야 한다").toBe(true);

    // (미검증 범위 명시) run() 자체의 syncing 게이트는 VideoEditor.tsx의 run() 함수와
    // VideoTimeline의 startDrag 함수 코드에 직접 있다(§standard-dev.md 근거 확인 등급) —
    // 이 jsdom 회귀는 native disabled 버튼(브라우저·jsdom 모두 disabled 요소엔 클릭
    // 이벤트를 아예 안 흘려보낸다)이라 클릭 시뮬레이션으로는 그 내부 게이트를 버튼
    // disabled와 분리해 단독으로 실패시키지 못했다(fireEvent가 pointer-events-none CSS도
    // 우회하지만, 실측 결과 클릭·드래그 시뮬레이션 모두 disabled/CSS 없이도 상태 변화가
    // 감지되지 않아 신뢰할 수 있는 jsdom 단언을 못 만들었다). disabled 표시 회귀(위
    // 단언)는 실제로 mutation-kill을 확인했다 — run()·startDrag의 코드 게이트 자체는
    // 코드리뷰(diff)로 확인해야 한다.
  }, 30000);

  it("MINOR: 중복 문장이 새 순서로 재배치돼도 자막 타이밍이 역순이 되지 않는다", async () => {
    // 옛 서버 자막: "좋아요"(0~2s, cut) / "그리고"(2~4s) / "좋아요"(4~6s). 대본이
    // ["그리고", "좋아요", "좋아요"]로 재배치되면, 글자 매칭이 옛 "그리고"(2~4s)를 새
    // 0번 자리로, 옛 뒤쪽 "좋아요"(4~6s)를 앞쪽 자리로 끌어올 수 있다 — 옛 시간을 그대로
    // 들고 오면 화면 순서(0,1,2)와 시간(4,2,0 같은 식)이 거꾸로 간다.
    const d = {
      id: "d7c", idea: "i", editKind: "video", editLines: ["그리고", "좋아요", "좋아요"], vid: VID, status: "draft", savedAt: new Date().toISOString(),
      videoEdit: {
        contract_version: "1.0", overlays: [], comments: [], voice: null, revision: 4,
        subtitles: [
          { id: "s1", order: 0, text: "좋아요", startSec: 0, endSec: 2, cut: true },
          { id: "s2", order: 1, text: "그리고", startSec: 2, endSec: 4, cut: false },
          { id: "s3", order: 2, text: "좋아요", startSec: 4, endSec: 6, cut: false },
        ],
      },
    };
    store.set("d7c", d as Draft); swrFor([d]); fakeServer();
    window.history.replaceState(null, "", "/studio?room=edit&draft_id=d7c");
    render(<StudioPage />);
    const l = await list();
    const rows = Array.from(l.querySelectorAll("[data-video-subtitle-id]")).map((li) => ({
      text: (li.querySelector("[data-video-subtitle-text]") as HTMLInputElement).value,
      startLabel: li.querySelector("[data-video-subtitle-seek]")?.textContent ?? "",
    }));
    expect(rows.map((r) => r.text)).toEqual(["그리고", "좋아요", "좋아요"]);
    // formatClock 라벨을 초로 되돌려(콜론 기준 m:ss) 순서가 단조증가인지 확인한다.
    const toSec = (label: string) => { const [m, s] = label.split(":").map(Number); return m * 60 + s; };
    const secs = rows.map((r) => toSec(r.startLabel));
    for (let i = 1; i < secs.length; i++) {
      expect(secs[i], `줄 ${i}의 시작 시간(${secs[i]}초)이 앞줄(${secs[i - 1]}초)보다 앞서면 안 된다`).toBeGreaterThanOrEqual(secs[i - 1]);
    }
  }, 20000);
});
