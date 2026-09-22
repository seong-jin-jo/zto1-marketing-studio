// @vitest-environment jsdom
/**
 * A·B 회귀(2026-09-22 코드리뷰 4차). save()의 위치 인자 기본값이 "안 넘기면 state를
 * 대신 넣는다"라서, 카드덱만 바꾼 자동저장이 videoEdit state를(반대도 마찬가지) 검증
 * 없이 같이 실어 보냈다. 이전 회귀 테스트(edit-autosave-merge.regression-1.test.tsx)는
 * onCardDeckChange/onVideoEditChange를 자체 Harness로 재구현해 불렀기 때문에 이 결함을
 * 가렸다 — 그 복사본은 카드덱만 보내도록 "제대로" 짜여 있어 진짜 page.tsx의 결함을 못
 * 잡았다. 이번엔 `StudioPage` 자체를 마운트하고 실제로 나간 fetch payload의 키 집합을
 * 검사한다.
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioPage from "@/app/studio/page";
import deckD100 from "./fixtures/deck-d100.v2.json";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
  showToast: vi.fn(),
  setStudioRoom: vi.fn(),
  workspace: { id: "tenant-cross-domain", name: "교차 도메인 검증" },
}));

// videoEdit에 미완성(빈 문구) 오버레이를 하나 심어 둔다 — A 회귀의 핵심 조건: 카드덱만
// 바꾸는 자동저장이 이 미완성 videoEdit까지 같이 보내면 실제 서버라면 400을 냈을 값이다.
const draftWithBoth = {
  id: "draft-cross-1",
  idea: "교차 도메인",
  editKind: "card",
  cardDeck: deckD100,
  videoEdit: {
    contract_version: "1.0",
    overlays: [{ id: "ov-incomplete", order: 0, kind: "hook", text: "", startSec: 0, endSec: 3 }],
    comments: [],
    subtitles: [],
    voice: null,
    revision: 1,
  },
  vid: { url: "/api/media/test-video", file: "/api/media/test-video", localPath: "/api/media/test-video" },
  status: "draft",
  savedAt: new Date().toISOString(),
};

// B 회귀용: editKind="video"로 시작해 VideoEditor가 뜨고, cardDeck에는 일부러 빈
// 말풍선 장을 심어 둔다 — 영상만 바꾸는 자동저장이 이 손상된 cardDeck까지 같이 보내면
// 실제 서버라면 emptyBubbleSlideNumber에 걸릴 값이다.
const brokenDeck = { ...deckD100, slides: deckD100.slides.map((s: Record<string, unknown>, i: number) => (i === 1 ? { ...s, bubbles: [] } : s)) };
const draftVideoWithBrokenDeck = {
  id: "draft-cross-2",
  idea: "교차 도메인 영상",
  editKind: "video",
  editLines: ["첫 장면", "둘째 장면", "셋째 장면"],
  cardDeck: brokenDeck,
  videoEdit: { contract_version: "1.0", overlays: [], comments: [], subtitles: [], voice: null, revision: 0 },
  vid: { url: "/api/media/test-video", file: "/api/media/test-video", localPath: "/api/media/test-video" },
  status: "draft",
  savedAt: new Date().toISOString(),
};

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

beforeEach(() => {
  // waitFor는 내부적으로 real timer로 폴링한다 — fake timer와 같이 쓰면 waitFor가
  // 영원히 안 풀린다. 800ms 디바운스는 실제로 기다린다(느리지만 정확하다).
  fetchCalls.length = 0;
  mocks.setStudioRoom.mockReset();
  mocks.showToast.mockReset();
  mocks.swr.mockReset();
  mocks.swr.mockImplementation((key: string | null) => {
    if (key === "/api/me") return { data: { isOperator: false }, mutate: vi.fn() };
    if (key === "/api/studio/drafts?tenant_id=tenant-cross-domain") return { data: { drafts: [draftWithBoth, draftVideoWithBrokenDeck], currentWork: null }, mutate: vi.fn() };
    if (key === "/api/studio/brand-setup?tenant_id=tenant-cross-domain") return { data: { guide: null }, mutate: vi.fn() };
    if (key === "/api/publish/first-comment-capabilities") return { data: { capabilities: [] }, mutate: vi.fn() };
    return { data: undefined, mutate: vi.fn() };
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      fetchCalls.push({ url, body });
      return new Response(JSON.stringify({ ok: true, id: "draft-cross-1" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (typeof url === "string" && url.includes("elevenlabs-voices")) {
      return new Response(JSON.stringify({ code: "ELEVENLABS_NOT_CONFIGURED" }), { status: 503 });
    }
    return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
  }));
  window.history.replaceState(null, "", "/studio?room=edit&draft_id=draft-cross-1");
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("A·B 회귀: 실제 StudioPage에서 자동저장이 자기 도메인만 보낸다", () => {
  it("A: 카드덱만 바꾼 자동저장은 videoEdit 키를 payload에서 뺀다(state에 미완성 videoEdit가 있어도)", async () => {
    render(<StudioPage />);

    const cardDeckPanel = await waitFor(() => {
      const el = document.querySelector("[data-card-deck-panel]");
      if (!el) throw new Error("카드덱 패널이 아직 안 떴다");
      return el as HTMLElement;
    });

    fireEvent.click(within(cardDeckPanel).getByText("이거 순서가 틀렸다면?"));
    await new Promise((resolve) => setTimeout(resolve, 900));

    const cardDeckPosts = fetchCalls.filter((c) => Object.prototype.hasOwnProperty.call(c.body, "cardDeck"));
    expect(cardDeckPosts.length).toBeGreaterThan(0);
    const last = cardDeckPosts[cardDeckPosts.length - 1];
    // 옛 결함(A)이라면 여기 videoEdit 키가 있고, 그 값은 미완성(overlays[0].text==="")이라
    // 실제 서버라면 400을 냈을 것이다. 고친 코드는 이 배치에서 videoEdit 키 자체가 없어야
    // 한다(서버가 기존 값을 그대로 보존한다).
    expect(Object.prototype.hasOwnProperty.call(last.body, "videoEdit")).toBe(false);
  }, 20000);

  it("B: 영상만 바꾼 자동저장은 cardDeck 키를 payload에서 뺀다(state에 빈 말풍선 장이 있어도)", async () => {
    window.history.replaceState(null, "", "/studio?room=edit&draft_id=draft-cross-2");
    render(<StudioPage />);

    const overlayEditor = await waitFor(() => {
      const el = document.querySelector("[data-video-overlay-editor]");
      if (!el) throw new Error("영상 오버레이 편집 패널이 아직 안 떴다");
      return el as HTMLElement;
    });

    fireEvent.click(within(overlayEditor).getByText("후킹"));
    fireEvent.click(within(overlayEditor).getByText("3초 만에 원인 하나"));
    fireEvent.click(within(overlayEditor).getByText(/구간에 추가/));
    await new Promise((resolve) => setTimeout(resolve, 900));

    const videoEditPosts = fetchCalls.filter((c) => Object.prototype.hasOwnProperty.call(c.body, "videoEdit"));
    expect(videoEditPosts.length).toBeGreaterThan(0);
    const last = videoEditPosts[videoEditPosts.length - 1];
    // 옛 결함(B)이라면 cardDeck 키가 있고 그 값은 1번 장 bubbles:[]인 손상된 덱이다.
    // 고친 코드는 이 배치에서 cardDeck 키 자체가 없어야 한다.
    expect(Object.prototype.hasOwnProperty.call(last.body, "cardDeck")).toBe(false);
  }, 20000);
});
