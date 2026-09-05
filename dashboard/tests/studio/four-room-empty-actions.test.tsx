// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StudioPage from "@/app/studio/page";
import { CreateRoom } from "@/components/studio/StudioRooms";

const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
  apiPost: vi.fn(),
  showToast: vi.fn(),
  room: "publish",
  workspace: { id: "tenant-empty", name: "빈 작업 공간" },
}));

vi.mock("swr", () => ({ default: (...args: unknown[]) => mocks.swr(...args) }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  fetcher: vi.fn(),
  apiPost: (...args: unknown[]) => mocks.apiPost(...args),
  isExternalPublishPersistenceError: () => false,
  ApiResponseError: class ApiResponseError extends Error { payload: unknown = null; },
}));
vi.mock("@/components/layout/Toast", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("@/store/ui-store", () => ({
  useUIStore: () => ({ activeWorkspace: mocks.workspace, studioRoom: mocks.room, setStudioRoom: vi.fn() }),
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

const generationCandidates = (["A", "B", "C"] as const).map((label, index) => ({
  candidate_id: `candidate-${label}`,
  ordinal: (index + 1) as 1 | 2 | 3,
  label,
  angle: (["problem_first", "proof_first", "process_first"] as const)[index],
  title: `${label} 구조`,
  rationale: `${label} 설명`,
  format: { content_branch: "video" as const, preview_kind: "structured_storyboard" as const, quality: "draft" as const, outline: [`${label} 첫 장면`] },
}));

async function answerStudioQuestionnaire(topic: string) {
  fireEvent.click(await screen.findByRole("button", { name: "영상" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "문의 늘리기" }));
  fireEvent.click(screen.getByRole("button", { name: "혼자 일하는 사장" }));
  fireEvent.click(screen.getByRole("button", { name: "직접 입력" }));
  fireEvent.change(screen.getByLabelText("직접 입력한 주제"), { target: { value: topic } });
  fireEvent.click(screen.getByRole("button", { name: "이 주제로 계속" }));
  fireEvent.click(screen.getByLabelText("위 조건을 확인했습니다."));
  fireEvent.click(screen.getByRole("button", { name: "입력 내용 확인" }));
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/studio");
  mocks.room = "publish";
  mocks.apiPost.mockReset();
  mocks.swr.mockReset();
  mocks.swr.mockImplementation((key: string | null) => {
    if (key === "/api/me") return { data: { isOperator: false }, mutate: vi.fn() };
    if (key === "/api/studio/drafts?tenant_id=tenant-empty") return { data: { drafts: [] }, mutate: vi.fn() };
    if (key === "/api/studio/brand-setup?tenant_id=tenant-empty") return { data: { guide: null }, mutate: vi.fn() };
    if (key === "/api/publish/first-comment-capabilities") return { data: { capabilities: [] }, mutate: vi.fn() };
    return { data: undefined, mutate: vi.fn() };
  });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/studio/v1/generations")) {
      return Response.json({ data: { job_id: "job-v77", candidates: generationCandidates } }, { status: 201 });
    }
    return Response.json({ accounts: [] });
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OSMU-FLOW-UI-02 발행실 빈 상태 계약", () => {
  it("OSMU-FLOW-UI-02 정상 경로: 작업물이 없으면 다음 행동 한 줄과 생성실 단추를 보인다", async () => {
    render(<StudioPage />);

    expect(document.querySelector('[data-empty-next="publish"]')).toHaveTextContent("발행할 작업물을 먼저 가져와 주세요.");
    expect(screen.getByRole("button", { name: "생성실 열기" })).toBeInTheDocument();
  });

  it("OSMU-FLOW-UI-02 거절 조건: 빈 상태 단추는 죽은 단추가 아니라 생성실 경로를 연다", async () => {
    render(<StudioPage />);

    fireEvent.click(screen.getByRole("button", { name: "생성실 열기" }));
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/studio?room=create"));
  });
});

describe("OSMU-FLOW-UI-03 생성실 첫 행동 계약", () => {
  it("OSMU-FLOW-UI-03 정상 경로: 첫 화면에 적을 칸이 아니라 고를 카드를 보인다", () => {
    render(<CreateRoom workspaceId="tenant-empty" workspaceName="빈 작업 공간" guide="" topic="" onTopicChange={vi.fn()} onOpenLearning={vi.fn()} onCandidateSelect={vi.fn()} />);

    expect(document.querySelector('[data-empty-next="create"]')).toHaveTextContent("한 번에 하나씩 묻겠습니다. 선택한 답은 다음 질문에 반영됩니다.");
    // 회장 지적("주관식이면 나라도 뭘 입력해야할 지를 모르겠는데")의 계약.
    // 기본 경로에는 자유 입력 칸이 한 칸도 없다.
    expect(document.querySelectorAll('[data-create-topic-picker] input')).toHaveLength(0);
    expect(screen.getByRole("button", { name: "영상" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "카드뉴스" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "글" })).toBeInTheDocument();
  });

  it("OSMU-FLOW-UI-03 거절 조건: 카드에 없는 주제는 직접 적는 칸으로 빠져나갈 수 있다", () => {
    render(<CreateRoom workspaceId="tenant-empty" workspaceName="빈 작업 공간" guide="" topic="" onTopicChange={vi.fn()} onOpenLearning={vi.fn()} onCandidateSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "영상" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "브랜드 알리기" }));
    fireEvent.click(screen.getByRole("button", { name: "처음 해 보는 사람" }));
    fireEvent.click(screen.getByRole("button", { name: "직접 입력" }));
    expect(screen.getByLabelText("직접 입력한 주제")).toBeInTheDocument();
  });
});

describe("V77-CREATE-NETWORK 생성 담당 구조 선택 계약", () => {
  it("V77-CREATE-NETWORK-01 정상: 본문 직접 생성 동선을 유지하며 생성 담당에서 고른 주제와 구조를 text API에 보낸다", async () => {
    mocks.room = "create";
    window.history.replaceState(null, "", "/studio?room=create");
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/text") {
        return { ok: true, shorts: { hook: "네트워크 요청으로 생성된 영상 후보입니다.", body: "영상 본문", cta: "영상 마무리" } };
      }
      return { ok: true };
    });

    const { container } = render(<StudioPage />);
    expect(container.querySelector("[data-create-workspace]")).toHaveTextContent("주제로 바로 초안 만들기");
    expect(screen.getByRole("button", { name: "초안 만들기" })).toBeInTheDocument();
    await answerStudioQuestionnaire("고객 질문 답변");
    fireEvent.click(screen.getByRole("button", { name: "구조 초안 3개 보기" }));
    fireEvent.click(await screen.findByRole("button", { name: "A 구조 초안 선택" }));

    // 2026-09-06: 생성 호출에 중단 신호를 넘길 수 있게 되면서 인자가 하나 늘었다.
    // 본문 계약은 그대로이므로 세 번째 인자는 있으면 있는 대로 받는다.
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/studio/text",
      expect.objectContaining({
        idea: "고객 질문 답변",
        tenant_id: "tenant-empty",
        structure: expect.objectContaining({ label: "A", title: "A 구조" }),
      }),
      expect.anything(),
    ));
    await waitFor(() => expect(document.querySelector("[data-quick-draft-result]")).toHaveTextContent("네트워크 요청으로 생성된 영상 후보입니다."));
    expect(screen.getByLabelText("생성 담당 대화창")).toBeInTheDocument();
  });

  // 2026-09-05 회장 계정 실측 회귀: 새 초안을 만들어도 이전 초안 번호를 그대로 들고 가서,
  // 그 번호가 이미 발행된 것이면 발행이 매번 "이미 올라갔습니다"로 닫혔다. 스튜디오에서
  // 두 번째 글을 영영 못 올리는 상태였다. 새로 만든 것은 새 작업물이어야 한다.
  it("V77-CREATE-NETWORK-03 정상: 새 초안을 만들면 이전 초안 번호를 끊는다", async () => {
    mocks.room = "create";
    window.history.replaceState(null, "", "/studio?room=create");
    localStorage.setItem("studio_work:tenant-empty", JSON.stringify({ draftId: "old-draft-id", text: null }));
    mocks.apiPost.mockImplementation(async (path: string) => {
      if (path === "/api/studio/text") {
        return { ok: true, shorts: { hook: "새 초안 본문", body: "본문", cta: "마무리" } };
      }
      return { ok: true };
    });

    render(<StudioPage />);
    await answerStudioQuestionnaire("새 주제");
    fireEvent.click(screen.getByRole("button", { name: "구조 초안 3개 보기" }));
    fireEvent.click(await screen.findByRole("button", { name: "A 구조 초안 선택" }));

    await waitFor(() => expect(document.querySelector("[data-quick-draft-result]")).toBeTruthy());
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("studio_work:tenant-empty") || "{}");
      expect(saved.draftId ?? null).toBeNull();
    });
  });

  it("V77-CREATE-NETWORK-02 거절: 주제가 비어 있으면 구조 선택과 text API 호출로 진행하지 않는다", async () => {
    mocks.room = "create";
    window.history.replaceState(null, "", "/studio?room=create");

    render(<StudioPage />);
    fireEvent.click(await screen.findByRole("button", { name: "영상" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "문의 늘리기" }));
    fireEvent.click(screen.getByRole("button", { name: "혼자 일하는 사장" }));
    fireEvent.click(screen.getByRole("button", { name: "직접 입력" }));
    expect(screen.getByRole("button", { name: "이 주제로 계속" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /구조 초안 선택/ })).toBeNull();
    expect(mocks.apiPost).not.toHaveBeenCalledWith("/api/studio/text", expect.anything());
  });

  // 2026-09-06 회장 스모크 회귀: 세 방 어디에도 지금 작업물을 버리고 새로 시작하는 길이
  // 없었다. 이미 발행한 작업물이 남으면 발행까지 중복으로 막힌다.
  it("V78-RESET-01 정상: 새로 시작을 누르면 확인 뒤 작업물과 초안 번호를 비운다", async () => {
    mocks.room = "create";
    window.history.replaceState(null, "", "/studio?room=create");
    localStorage.setItem("studio_work:tenant-empty", JSON.stringify({ draftId: "keep-me", idea: "옛 주제" }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<StudioPage />);
    fireEvent.click(await screen.findByTestId("studio-discard-work"));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("studio_work:tenant-empty") || "{}");
      expect(saved.draftId ?? null).toBeNull();
    });
    confirmSpy.mockRestore();
  });
});
