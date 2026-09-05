// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateRoom } from "@/components/studio/StudioRooms";

const props = {
  workspaceId: "workspace-v68",
  workspaceName: "작업 공간",
  guide: "",
  topic: "",
  onTopicChange: vi.fn(),
  onOpenLearning: vi.fn(),
  onCandidateSelect: vi.fn(),
};

const candidates = (["A", "B", "C"] as const).map((label, index) => ({
  candidate_id: `candidate-${label}`,
  ordinal: (index + 1) as 1 | 2 | 3,
  label,
  angle: (["problem_first", "proof_first", "process_first"] as const)[index],
  title: `${label} 구조`,
  rationale: `${label} 설명`,
  format: { content_branch: "video" as const, preview_kind: "structured_storyboard" as const, quality: "draft" as const, outline: [`${label} 첫 장면`] },
}));

function answerCreateQuestions() {
  fireEvent.click(screen.getByRole("button", { name: "영상" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "문의 늘리기" }));
  fireEvent.click(screen.getByRole("button", { name: "혼자 일하는 사장" }));
  fireEvent.click(document.querySelector("[data-create-topic-picker] button") as HTMLElement);
  fireEvent.click(screen.getByLabelText("위 조건을 확인했습니다."));
  fireEvent.click(screen.getByRole("button", { name: "입력 내용 확인" }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("dashboard_auth_token", "customer-token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { job_id: "job-v68", candidates } }, { status: 201 })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("V68 생성실 계약", () => {
  it("V68-CREATE-01 정상: 형식, 학습 정보, 구조 초안 세 축과 A/B/C를 함께 보여준다", () => {
    render(<CreateRoom {...props} />);

    expect(screen.getByRole("heading", { level: 1, name: "생성실" })).toBeInTheDocument();
    expect(screen.getByLabelText("생성실 요약")).toHaveTextContent("선택한 형식");
    expect(screen.getByLabelText("생성실 요약")).toHaveTextContent("반영한 학습 정보");
    expect(screen.getByLabelText("생성실 요약")).toHaveTextContent("구조 초안");
    expect(document.querySelectorAll("[data-create-candidate]")).toHaveLength(3);
    expect(screen.getByText("이번에 반영한 학습 정보")).toBeInTheDocument();
    expect(screen.getByLabelText("생성 담당 대화창")).toBeInTheDocument();
  });

  it("V68-CREATE-02 거절: 형식을 고르기 전에는 다음 질문으로 진행하지 않는다", () => {
    render(<CreateRoom {...props} />);

    const next = screen.getByRole("button", { name: "다음" });
    expect(next).toBeDisabled();
    fireEvent.click(next);
    expect(document.querySelector('[data-create-question="kind"]')).toBeInTheDocument();
    expect(document.querySelector("[data-create-purpose-picker]")).toBeNull();
  });

  it("V77-CREATE-ROLE-01 정상: 본문 직접 생성과 생성 담당의 A 선택이 모두 형식별 후보 생성을 호출한다", async () => {
    const onQuickDraftGenerate = vi.fn().mockResolvedValue(undefined);
    const { container, rerender } = render(<CreateRoom {...props} topic="고객이 자주 묻는 질문" onQuickDraftGenerate={onQuickDraftGenerate} />);
    const workspace = container.querySelector("[data-create-workspace]") as HTMLElement;
    const directGenerate = within(workspace).getByRole("button", { name: "초안 만들기" });
    fireEvent.click(within(workspace).getByRole("button", { name: "A 구조 사용" }));
    expect(directGenerate).toBeEnabled();
    fireEvent.click(directGenerate);
    expect(onQuickDraftGenerate).toHaveBeenCalledWith(expect.objectContaining({ label: "A", title: "문제 제시형", outline: expect.any(Array) }));

    answerCreateQuestions();
    fireEvent.click(screen.getByRole("button", { name: "구조 초안 3개 보기" }));
    const structureButton = await screen.findByRole("button", { name: "A 구조 초안 선택" });
    const before = document.body.textContent?.length ?? 0;

    fireEvent.click(structureButton);

    await waitFor(() => expect(document.body.textContent?.length ?? 0).not.toBe(before));
    expect(onQuickDraftGenerate).toHaveBeenCalledWith(expect.objectContaining({ label: "A", title: "A 구조", outline: ["A 첫 장면"] }));
    expect(onQuickDraftGenerate).toHaveBeenCalledTimes(2);

    rerender(<CreateRoom {...props} topic="고객이 자주 묻는 질문" onQuickDraftGenerate={onQuickDraftGenerate} quickDraft={{ shorts: { hook: "실제로 생성된 영상 후보입니다." } }} />);
    expect(document.querySelector("[data-quick-draft-result]")).toHaveTextContent("실제로 생성된 영상 후보");
  });

  it("V77-CREATE-ROLE-02 거절: 주제와 구조가 없으면 본문 직접 생성을 시작하지 않는다", () => {
    const onQuickDraftGenerate = vi.fn();
    const { container } = render(<CreateRoom {...props} topic="" onQuickDraftGenerate={onQuickDraftGenerate} />);

    const workspace = container.querySelector("[data-create-workspace]") as HTMLElement;
    // 2026-09-05 계약 변경: 못 만드는 상태에서도 단추는 눌린다. 조용히 비활성이면
    // 회장 실사용처럼 "눌러도 아무 일이 없다"로 읽힌다. 대신 무엇이 없는지 말하고
    // 생성은 시작하지 않는다.
    const directGenerate = within(workspace).getByRole("button", { name: "초안 만들기" });
    expect(directGenerate).toBeEnabled();
    fireEvent.click(directGenerate);
    expect(screen.getByRole("alert")).toHaveTextContent("초안 주제를 먼저 적어 주세요");
    expect(screen.queryByRole("button", { name: /구조 초안 선택/ })).toBeNull();
    expect(onQuickDraftGenerate).not.toHaveBeenCalled();
  });

  it("V77-CREATE-FORMAT-01 정상: 고른 영상, 카드뉴스, 글 후보를 생성 결과에 모두 보여준다", () => {
    const { rerender } = render(<CreateRoom {...props} topic="고객 질문" />);
    fireEvent.click(screen.getByRole("button", { name: "영상" }));
    fireEvent.click(screen.getByRole("button", { name: "카드뉴스" }));
    fireEvent.click(screen.getByRole("button", { name: "글" }));

    rerender(<CreateRoom
      {...props}
      topic="고객 질문"
      quickDraft={{
        shorts: { hook: "영상 첫 문장", body: "영상 본문", cta: "영상 마무리" },
        instagram: { slides: ["첫 카드", "둘째 카드"], caption: "카드 설명" },
        threads: "글 본문",
      }}
    />);

    expect(document.querySelector('[data-quick-draft-format="video"]')).toHaveTextContent("영상 첫 문장");
    expect(document.querySelector('[data-quick-draft-format="card"]')).toHaveTextContent("첫 카드");
    expect(document.querySelector('[data-quick-draft-format="text"]')).toHaveTextContent("글 본문");
  });

  it("V77-CREATE-FORMAT-02 거절: 고르지 않은 형식 후보는 결과에 섞지 않는다", () => {
    const { rerender } = render(<CreateRoom {...props} topic="고객 질문" />);
    fireEvent.click(screen.getByRole("button", { name: "영상" }));

    rerender(<CreateRoom
      {...props}
      topic="고객 질문"
      quickDraft={{ shorts: { hook: "영상 후보" }, threads: "고르지 않은 글" }}
    />);

    expect(document.querySelector('[data-quick-draft-format="video"]')).toHaveTextContent("영상 후보");
    expect(document.querySelector('[data-quick-draft-format="text"]')).toBeNull();
    expect(screen.queryByText("고르지 않은 글")).toBeNull();
  });
});
