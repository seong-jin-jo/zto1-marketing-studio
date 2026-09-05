// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningCardWizard } from "@/components/studio/LearningCardWizard";
import { CreateRoom, generationErrorMessage } from "@/components/studio/StudioRooms";

const createProps = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  workspaceName: "작업 공간",
  guide: "",
  topic: "고객이 자주 묻는 질문",
  onTopicChange: vi.fn(),
  onOpenLearning: vi.fn(),
  onCandidateSelect: vi.fn(),
};

function answerLearningSteps(count: number) {
  for (let index = 0; index < count; index += 1) {
    fireEvent.click(document.querySelector("[data-learning-card]") as HTMLElement);
  }
}

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
  localStorage.setItem("dashboard_auth_token", "customer-jwt");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("회장 2차 실사용 피드백 학습 정보", () => {
  it("항목 2·3·4 정상: 업종, 주요 고객, 말투 예시의 의미를 질문 안에서 설명한다", () => {
    render(<LearningCardWizard workspaceId="workspace" onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("어떤 업종에서 일하시나요?")).toBeInTheDocument();
    fireEvent.click(document.querySelector("[data-learning-card]") as HTMLElement);
    expect(screen.getByText("주로 어떤 고객에게 콘텐츠를 보여주나요?")).toBeInTheDocument();
    expect(screen.getByText(/우리 서비스를 이용하거나 구매할 고객/)).toBeInTheDocument();
    fireEvent.click(document.querySelector("[data-learning-card]") as HTMLElement);
    expect(screen.getByText("콘텐츠에 어떤 말투를 쓸까요?")).toBeInTheDocument();
    expect(screen.getByText(/실제 콘텐츠에 적용된 예시/)).toBeInTheDocument();
  });

  it("항목 5·6 정상: 7개 직접 입력 뒤 자동으로 닫지 않고 8번째 자동 학습과 저장 단계를 설명한다", () => {
    const onSaved = vi.fn();
    render(<LearningCardWizard workspaceId="workspace" onSaved={onSaved} onClose={vi.fn()} />);
    answerLearningSteps(7);
    expect(document.querySelector("[data-learning-review]")).toBeInTheDocument();
    expect(screen.getByText(/7개는 직접 고르고, 성과 학습 1개/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "학습 정보 저장" })).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("항목 7·8 거절: 나중에 하기 설명은 분리하고 모호한 이전 문구는 노출하지 않는다", () => {
    render(<LearningCardWizard workspaceId="workspace" onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "나중에 하기" })).toBeInTheDocument();
    expect(screen.getByText("언제든 헤더의 학습 정보에서 계속할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText("앞 걸음으로")).toBeNull();
    expect(screen.queryByText(/헤더 학습 정보에서 이어 채웁니다/)).toBeNull();
  });
});

describe("회장 2차 실사용 피드백 생성실", () => {
  it("항목 9·10·11·12·13·14 정상: 형식 추측과 중복 질문 없이 한 질문씩 진행한다", () => {
    render(<CreateRoom {...createProps} />);
    expect(screen.getByText("콘텐츠 구성 초안 예시")).toBeInTheDocument();
    expect(document.querySelector('[data-create-question="kind"]')).toBeInTheDocument();
    expect(document.querySelector("[data-create-purpose-picker]")).toBeNull();
    expect(screen.queryByText("이 주제로 같이 만들 것")).toBeNull();
    expect(screen.queryByRole("button", { name: /학습 정보/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "영상" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("이번 콘텐츠로 원하는 결과는 무엇인가요?")).toBeInTheDocument();
    expect(screen.queryByText("말 거는 대상")).toBeNull();
  });

  it("V77-CREATE-PERSIST-01 정상: 생성실을 다시 열면 질문 진행 상태와 선택 형식을 복원한다", async () => {
    const first = render(<CreateRoom {...createProps} />);
    fireEvent.click(screen.getByRole("button", { name: "영상" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(document.querySelector('[data-create-question="purpose"]')).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem("studio_create_state:11111111-1111-4111-8111-111111111111")).toContain('"questionIndex":1'));
    first.unmount();
    render(<CreateRoom {...createProps} />);
    expect(document.querySelector('[data-create-question="purpose"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이전 질문" }));
    expect(screen.getByRole("button", { name: "영상" })).toHaveAttribute("aria-pressed", "true");
  });

  it("V77-CREATE-PERSIST-02 거절: 깨진 생성실 임시 저장값은 복원하지 않고 지운다", () => {
    const key = "studio_create_state:11111111-1111-4111-8111-111111111111";
    localStorage.setItem(key, JSON.stringify({ primaryKind: "모르는 형식", questionIndex: 99 }));

    render(<CreateRoom {...createProps} />);

    expect(document.querySelector('[data-create-question="kind"]')).toBeInTheDocument();
    expect(localStorage.getItem(key)).not.toContain("모르는 형식");
  });

  it("항목 16·17 정상: 규칙 기반 초안과 준비 중 기능을 분리하고 선택 뒤 CTA를 하나만 노출한다", async () => {
    const candidates = ["A", "B", "C"].map((label, index) => ({
      candidate_id: `candidate-${label}`,
      ordinal: index + 1,
      label,
      angle: "problem_first",
      title: `${label} 구조`,
      rationale: `${label} 설명`,
      format: { content_branch: "video", preview_kind: "structured_storyboard", quality: "draft", outline: ["첫 장면"] },
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { job_id: "job-1", candidates } }, { status: 201 })));
    render(<CreateRoom {...createProps} />);
    answerCreateQuestions();
    fireEvent.click(screen.getByRole("button", { name: "구조 초안 3개 보기" }));
    await screen.findByRole("button", { name: "A 구조 초안 선택" });
    fireEvent.click(screen.getByRole("button", { name: "A 구조 초안 선택" }));
    expect(screen.getByText(/영상은 대본과 장면 구성까지만 제공하며 렌더링은 아직 지원하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "편집실에서 다듬기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /확정하고 같이 만들기/ })).toBeNull();
  });

  it("항목 18 거절: 저장소 내부 오류를 사용자 행동이 가능한 문장으로 바꾼다", () => {
    expect(generationErrorMessage(new Error("생성 저장소의 무결성 조건을 확인하지 못했습니다"))).toBe("구조 초안을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  });

  it("항목 19 정상: 소재 권리 확인의 대상과 허가 범위를 바로 설명한다", () => {
    render(<CreateRoom {...createProps} />);
    fireEvent.click(screen.getByRole("button", { name: "영상" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "문의 늘리기" }));
    fireEvent.click(screen.getByRole("button", { name: "혼자 일하는 사장" }));
    fireEvent.click(document.querySelector("[data-create-topic-picker] button") as HTMLElement);
    expect(screen.getByText(/저작권자에게 콘텐츠 제작과 게시 허가를 받은/)).toBeInTheDocument();
    expect(screen.getByLabelText("위 조건을 확인했습니다.")).toBeInTheDocument();
  });
});
