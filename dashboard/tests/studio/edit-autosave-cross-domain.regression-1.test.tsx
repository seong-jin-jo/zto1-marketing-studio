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
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioPage from "@/app/studio/page";
import { createPlainCardDeckV3 } from "@/lib/studio/card-element-commands";
import { applyCardDeckTemplate } from "@/lib/studio/card-templates";
import deckD100 from "./fixtures/deck-d100.v2.json";

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED = "1";
  return {
    swr: vi.fn(),
    showToast: vi.fn(),
    setStudioRoom: vi.fn(),
    workspace: { id: "tenant-cross-domain", name: "교차 도메인 검증" },
  };
});

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

const v3DeckBeforeTemplate = createPlainCardDeckV3(
  ["템플릿 저장 짝 검증", "덱과 상태는 함께 저장돼야 합니다"],
  "deck_template_pair",
);
const v3DeckAfterTemplate = applyCardDeckTemplate(v3DeckBeforeTemplate, "headline_cover", { kind: "all" });
const v3TemplateState = {
  activeTemplateId: "headline_cover" as const,
  previousTemplate: { id: "text_only" as const, deck: v3DeckBeforeTemplate },
};
const draftWithCardDeckV3 = {
  id: "draft-cross-v3",
  idea: "템플릿 저장 짝 검증",
  editKind: "card",
  editFormat: "card",
  editLines: ["템플릿 저장 짝 검증", "덱과 상태는 함께 저장돼야 합니다"],
  cardDeck: null,
  cardDeckV3: v3DeckAfterTemplate,
  cardTemplateState: v3TemplateState,
  hasCardDeckV3: true,
  videoEdit: null,
  status: "draft",
  savedAt: new Date().toISOString(),
};

const drafts = [draftWithBoth, draftVideoWithBrokenDeck, draftWithCardDeckV3];

const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
const draftStatusQueue: number[] = [];
const generatedTextCandidates = ["question", "number", "pain"].map((id, index) => ({
  id,
  label: index === 0 ? "질문형" : index === 1 ? "숫자형" : "고통 인식형",
  recommended: index === 0,
  recommendation_reason: "회귀 테스트 후보",
  content: {
    threads: `${id} 스레드`,
    facebook: `${id} 페이스북`,
    x: `${id} X`,
    instagram: { caption: `${id} 캡션`, hashtags: ["S7"], slides: ["첫 장", "둘째 장", "셋째 장"] },
    shorts: { hook: `${id} 훅`, body: `${id} 본문`, cta: `${id} 행동` },
    image_prompt: `${id} editorial image`,
  },
}));

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
  draftStatusQueue.length = 0;
  mocks.setStudioRoom.mockReset();
  mocks.showToast.mockReset();
  mocks.swr.mockReset();
  mocks.swr.mockImplementation((key: string | null) => {
    if (key === "/api/me") return { data: { isOperator: false }, mutate: vi.fn() };
    if (key === "/api/studio/drafts?tenant_id=tenant-cross-domain") return { data: { drafts, currentWork: null }, mutate: vi.fn() };
    if (key === "/api/studio/brand-setup?tenant_id=tenant-cross-domain") return { data: { guide: null }, mutate: vi.fn() };
    if (key === "/api/publish/first-comment-capabilities") return { data: { capabilities: [] }, mutate: vi.fn() };
    return { data: undefined, mutate: vi.fn() };
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/studio/drafts?") && url.includes("&id=") && !init?.method) {
      const id = new URL(url, "http://localhost").searchParams.get("id");
      return Response.json({ draft: drafts.find((draft) => draft.id === id) ?? null });
    }
    if (typeof url === "string" && url.includes("/api/studio/drafts") && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}"));
      fetchCalls.push({ url, body });
      const status = draftStatusQueue.shift() ?? 200;
      return new Response(JSON.stringify(status >= 400 ? { error: "의도한 저장 실패" } : { ok: true, id: "draft-cross-1" }), { status, headers: { "content-type": "application/json" } });
    }
    if (typeof url === "string" && url.includes("/api/studio/text") && init?.method === "POST") {
      return Response.json({
        ok: true,
        threads: "저장 실패 복구 본문",
        instagram: { caption: "저장 실패 복구 카드", hashtags: ["S7"], slides: ["첫 장", "둘째 장", "셋째 장"] },
        text_candidates: generatedTextCandidates,
        recommended_text_candidate_id: "question",
        card_template_id: "number_list",
      });
    }
    if (typeof url === "string" && url.includes("elevenlabs-voices")) {
      return new Response(JSON.stringify({ code: "ELEVENLABS_NOT_CONFIGURED" }), { status: 503 });
    }
    return new Response(JSON.stringify({ accounts: [] }), { status: 200 });
  }));
  window.history.replaceState(null, "", "/studio?room=edit&draft_id=draft-cross-1");
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("A·B 회귀: 실제 StudioPage에서 자동저장이 반대 도메인에 null을 명시한다", () => {
  it("A: 카드덱만 바꾼 자동저장은 videoEdit:null을 보낸다(state에 미완성 videoEdit가 있어도)", async () => {
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
    // 옛 결함(A)이라면 여기 미완성 videoEdit state가 실려 실제 서버가 400을 냈다.
    // null은 route.ts에서 clear 플래그가 없을 때 기존 값을 보존한다.
    expect(Object.prototype.hasOwnProperty.call(last.body, "videoEdit")).toBe(true);
    expect(last.body.videoEdit).toBeNull();
  }, 20000);

  it("B: 영상만 바꾼 자동저장은 cardDeck:null을 보낸다(state에 빈 말풍선 장이 있어도)", async () => {
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
    // 옛 결함(B)이라면 cardDeck 값은 1번 장 bubbles:[]인 손상된 덱이었다.
    // 명시적 null은 반대 도메인 state를 보내지 않았음을 payload에서 바로 확인하게 한다.
    expect(Object.prototype.hasOwnProperty.call(last.body, "cardDeck")).toBe(true);
    expect(last.body.cardDeck).toBeNull();
  }, 20000);

  it("S7-R2-CLIENT 발행실 수동 저장은 v3 덱과 현재 템플릿 상태를 같은 실제 POST에 보낸다", async () => {
    window.history.replaceState(null, "", "/studio?room=publish&draft_id=draft-cross-v3");
    render(<StudioPage />);

    fireEvent.click(await screen.findByRole("button", { name: "임시 저장하기" }));

    const saved = await waitFor(() => {
      const call = fetchCalls.find((candidate) => {
        const deck = candidate.body.cardDeckV3 as { id?: string } | undefined;
        return deck?.id === "deck_template_pair";
      });
      if (!call) throw new Error("v3 덱을 담은 수동 저장 요청이 아직 안 나갔다");
      return call;
    });
    expect(saved.body.cardTemplateState).toEqual(v3TemplateState);
    expect(saved.body.cardDeckV3).toEqual(v3DeckAfterTemplate);
    expect(saved.body.cardDeckV3).not.toEqual(v3DeckBeforeTemplate);
    expect((saved.body.cardDeckV3 as typeof v3DeckAfterTemplate).slides[0].elements[0]).toMatchObject({
      x: 96,
      width: 888,
    });
  }, 20000);

  it("S7-R2-MINOR-07 생성 덱 첫 저장 실패는 화면 전용 v3를 버리고 기본 카드로 재저장한다", async () => {
    window.history.replaceState(null, "", "/studio?room=create&kind=card");
    draftStatusQueue.push(500, 200);
    render(<StudioPage />);

    fireEvent.change(await screen.findByLabelText("초안 주제"), { target: { value: "저장 실패 복구" } });
    fireEvent.click(screen.getByRole("button", { name: "A 구조 사용" }));
    fireEvent.click(document.querySelector('[data-card-template="number_list"]') as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));

    const [failedTemplateSave, fallbackSave] = await waitFor(() => {
      const calls = fetchCalls.filter((candidate) => Object.prototype.hasOwnProperty.call(candidate.body, "cardDeckV3"));
      if (calls.length < 2) throw new Error(`템플릿 저장 실패 뒤 기본 카드 재저장이 아직 끝나지 않았다. calls=${JSON.stringify(fetchCalls)} toast=${JSON.stringify(mocks.showToast.mock.calls)}`);
      return calls;
    });
    const failedDeck = failedTemplateSave.body.cardDeckV3 as { slides: Array<{ elements: Array<{ x: number }> }> };
    expect(failedDeck.slides[0].elements[0].x).toBe(244);
    expect(failedTemplateSave.body.cardTemplateState).toMatchObject({ activeTemplateId: "number_list" });
    expect(fallbackSave.body).toMatchObject({ cardDeckV3: null, clearCardDeckV3: true, cardTemplateState: null });
    expect(mocks.showToast).toHaveBeenCalledWith("자유 배치 템플릿 저장에 실패해 기본 카드 편집으로 저장했습니다.", "error");
  }, 20000);
});
