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
  // Response 본문은 한 번만 읽힌다. mockResolvedValue 로 **같은 Response 객체**를 계속
// 돌려주면 두 번째 호출부터 빈 본문이 온다. 화면이 통신을 하나만 하던 시절에는 안 드러났고,
// 성과 규칙을 읽기 시작하자 그 자리에서 터졌다(2026-09-10). 호출마다 새로 만든다.
vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json({ data: { job_id: "job-v68", candidates } }, { status: 201 }))));
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

  it("S7-AC1-RESTORE 정상: 저장된 글 후보 3개가 있으면 구조 초안 복원이 선택 결과를 덮지 않는다", async () => {
    const onCandidateSelect = vi.fn();
    localStorage.setItem("studio_create_state:workspace-v68", JSON.stringify({
      primaryKind: "text",
      alsoKinds: [],
      questionIndex: 0,
      purpose: "공부 계획 안내",
      audience: "수험생",
      rightsConfirmed: true,
      topicOpen: false,
      candidates,
      selected: "A",
      quickStructure: { label: "A", title: "A 구조", outline: ["A 첫 장면"] },
      topic: "수능 100일 공부 계획",
    }));
    const textCandidates = (["question", "number", "pain"] as const).map((id, index) => ({
      id,
      label: ["질문형", "숫자형", "고통 인식형"][index],
      recommended: index === 0,
      recommendation_reason: "A 구조와 잘 맞습니다",
      warnings: [],
      content: {
        threads: `${id} Threads 후보`,
        facebook: `${id} Facebook 후보`,
        x: `${id} X 후보`,
        instagram: { caption: `${id} Instagram 후보`, hashtags: [], slides: [] },
        shorts: { hook: `${id} 훅`, body: `${id} 본문`, cta: `${id} CTA` },
        image_prompt: `Editorial image for ${id}`,
      },
    }));

    render(<CreateRoom
      {...props}
      onCandidateSelect={onCandidateSelect}
      quickDraft={{ text_candidates: textCandidates, recommended_text_candidate_id: "question" }}
    />);

    await waitFor(() => expect(document.querySelector("[data-text-candidate-picker]")).toBeInTheDocument());
    expect(document.querySelectorAll("[data-text-candidate-tab]")).toHaveLength(3);
    expect(onCandidateSelect).not.toHaveBeenCalled();
  });

  it("S7-R1-B1 정상: 카드 템플릿 선택을 생성 콜백에 전달하고 카톡은 기존 생성 경로 이유와 함께 잠근다", () => {
    const onQuickDraftGenerate = vi.fn();
    const { container } = render(<CreateRoom {...props} topic="고객 질문" onQuickDraftGenerate={onQuickDraftGenerate} />);
    const workspace = container.querySelector("[data-create-workspace]") as HTMLElement;
    fireEvent.click(screen.getByRole("button", { name: "카드뉴스" }));
    fireEvent.click(within(workspace).getByRole("button", { name: "A 구조 사용" }));
    const chat = screen.getByRole("button", { name: /카톡 대화/ });
    expect(chat).toBeDisabled();
    expect(chat).toHaveTextContent("기존 카톡 말풍선 덱 만들기");
    fireEvent.click(screen.getByRole("button", { name: /번호 목록형/ }));
    fireEvent.click(within(workspace).getByRole("button", { name: "초안 만들기" }));
    expect(onQuickDraftGenerate).toHaveBeenCalledWith(expect.objectContaining({ label: "A" }), "number_list");
  });

  it("시험 18 정상: 글자 카드를 자산 저장소에 올린 뒤 편집과 발행 인계 콜백에 전달한다", async () => {
    const onTextCardsCreated = vi.fn();
    vi.stubGlobal("File", class {
      constructor(public parts: unknown[], public name: string, public options: unknown) {}
    });
    vi.stubGlobal("FormData", class {
      append() {}
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillStyle: "",
      font: "",
      textAlign: "left",
      textBaseline: "top",
      fillRect: vi.fn(),
      fillText: vi.fn(),
      measureText: (value: string) => ({ width: value.length * 10 }),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,dGVzdA==");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("data:image/png")) return { blob: async () => ({ type: "image/png" }) } as Response;
      if (String(input) === "/api/images/upload") {
        return Response.json({ url: "http://localhost/api/images/deliver/signed-card" });
      }
      return Response.json({ rules: [], decisions: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    // 2026-10-03 CI 회귀 조사(PR #101, 리뷰 MAJOR-8/MINOR-f 반영): "A 구조 사용"은
    // CREATE_EXAMPLES의 고정 라벨("고객이 겪는 문제" 등)만 고른다 — 실제 생성된 본문이
    // 전혀 없다. 이 테스트는 원래 그 라벨을 "아무 글자나 있으면 되는 더미 콘텐츠"로
    // 빌려 썼는데, 바로 그 모양(라벨만 있고 생성 본문 없음)이 2026-10-02 운영 사고의
    // 재현 조건 그 자체다. 이제 resolveTextCardLines()는 그 경우를 isPlaceholder로
    // 막아 카드를 만들지 않는다(맞는 동작 — 라벨이 그대로 카드에 찍혀 나가던 사고를
    // 막는 것이 이번 라운드의 목적이었다). 이 테스트의 실제 검증 대상은 라벨 내용이
    // 아니라 "만들어진 카드가 자산 저장소에 올라가고 그 결과가 onTextCardsCreated로
    // 전달되는가"(업로드 배선)이므로, 실제 생성 본문 모양(quickDraft.instagram.slides)을
    // 줘서 그 배선을 계속 검증한다. 낡은 가정(라벨=콘텐츠)을 고치는 것이지 업로드
    // 배선 검증 자체를 약화하는 것이 아니다.
    const { container } = render(<CreateRoom
      {...props}
      topic="고객 질문"
      onTextCardsCreated={onTextCardsCreated}
      quickDraft={{
        instagram: {
          slides: ["초반 3초에 매출이 멈춘 이유", "재고 회전율 공식을 한 줄로", "오늘 바로 적용하는 체크리스트"],
        },
      }}
    />);
    fireEvent.click(within(container.querySelector("[data-create-workspace]") as HTMLElement).getByRole("button", { name: "A 구조 사용" }));
    fireEvent.click(screen.getByTestId("create-text-card"));

    await waitFor(() => {
      const error = document.querySelector("[data-text-card-error]")?.textContent;
      if (error) throw new Error(error);
      // 2026-09-14: 그림 주소만 넘기면 편집실은 카드가 몇 장인지 모른다(실측: 3장이 `1 / 1`).
      // 카드에 적힌 글자를 두 번째 인자로 함께 넘긴다.
      expect(onTextCardsCreated).toHaveBeenCalledWith(
        [
          "http://localhost/api/images/deliver/signed-card",
          "http://localhost/api/images/deliver/signed-card",
          "http://localhost/api/images/deliver/signed-card",
        ],
        expect.arrayContaining([expect.any(String)]),
      );
      expect(onTextCardsCreated.mock.calls[0][1]).toHaveLength(3);
    });
    expect(fetchMock.mock.calls.filter(([input]) => String(input) === "/api/images/upload")).toHaveLength(3);
    expect(document.querySelector("[data-text-card-result]" )).toHaveAttribute("data-text-card-result", "3");
  });
});
