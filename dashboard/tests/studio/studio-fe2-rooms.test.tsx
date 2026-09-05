// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateRoom, EditRoom } from "@/components/studio/StudioRooms";
import {
  buildStudioGenerationRequest,
  requestStudioCandidates,
  STUDIO_GENERATION_SKILL_VERSION_ID,
  type StudioLearningInput,
} from "@/lib/studio/generation/client";

const VALID_INPUT: StudioLearningInput = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  topic: "작은 팀의 콘텐츠 운영",
  purpose: "운영 시간을 줄인다",
  audience: "1인 사업가",
  workspaceFacts: ["매주 세 편을 발행한다"],
  forbiddenPhrases: [],
  materialRightsConfirmed: true,
  contentBranch: "text_image",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});


// 회장 확정("주관식 칸 0개")대로 생성실 기본 경로에는 입력창이 없다.
// 목적과 대상은 카드를 눌러 고르고, 소재 권리만 확인 표시를 누른다.
function chooseCards() {
  fireEvent.click(screen.getByRole("button", { name: "영상" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "문의 늘리기" }));
  fireEvent.click(screen.getByRole("button", { name: "혼자 일하는 사장" }));
  fireEvent.click(document.querySelector("[data-create-topic-picker] button") as HTMLElement);
  fireEvent.click(screen.getByLabelText("위 조건을 확인했습니다."));
  fireEvent.click(screen.getByRole("button", { name: "입력 내용 확인" }));
}

describe("화면 2차 생성실 계약", () => {
  it("FE2-CREATE-01 정상: 일곱 층 요청을 보내고 Studio 후보 세 장을 받는다", async () => {
    const candidates = ["A", "B", "C"].map((label, index) => ({
      candidate_id: `candidate-${label}`,
      ordinal: index + 1,
      label,
      angle: "problem_first",
      title: `${label} 제목`,
      rationale: `${label} 근거`,
      format: { content_branch: "text_image", preview_kind: "structured_storyboard", quality: "draft", outline: ["첫 장면"] },
    }));
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { job_id: "job-1", candidates } }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestStudioCandidates(VALID_INPUT, "studio-token");

    expect(result.map((candidate) => candidate.label)).toEqual(["A", "B", "C"]);
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(Object.keys(body.learning_context)).toEqual(["s0", "s1", "u2", "u3", "x4", "l5", "r6"]);
    expect(body.learning_context.x4.skill_version_id).toBe(STUDIO_GENERATION_SKILL_VERSION_ID);
    expect(request.headers).toMatchObject({ Authorization: "Bearer studio-token" });
  });

  it("FE3-CREATE-01 정상: 생성실은 상단 한 줄과 대화창을 함께 노출한다", () => {
    render(<CreateRoom workspaceId="workspace" workspaceName="작업 공간" guide="브랜드 사실" topic="주제" onTopicChange={vi.fn()} onOpenLearning={vi.fn()} onCandidateSelect={vi.fn()} />);
    expect(document.querySelector('[data-room-top="create"]')).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "생성 담당 대화창" })).toBeInTheDocument();
  });

  it("V75-CREATE-01 정상: 본문에 직접 생성 동선을 추가하고 기존 대화창을 유지한다", () => {
    render(<CreateRoom workspaceId="workspace" workspaceName="작업 공간" guide="브랜드 사실" topic="주제" onTopicChange={vi.fn()} onOpenLearning={vi.fn()} onCandidateSelect={vi.fn()} />);

    const workspace = document.querySelector("[data-create-workspace]");
    expect(workspace).toBeInTheDocument();
    expect(within(workspace as HTMLElement).getByLabelText("초안 주제")).toBeInTheDocument();
    expect(within(workspace as HTMLElement).getByRole("button", { name: "초안 만들기" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "생성 담당 대화창" })).toHaveTextContent("무엇을 만들까요?");
  });

  it("FE6-CREATE-02 정상: 영상 선택은 대화창에서 생성 계약으로 전달한다", async () => {
    localStorage.setItem("dashboard_auth_token", "customer-jwt");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { job_id: "job-1", candidates: [] } }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const onBranchChange = vi.fn();
    render(<CreateRoom workspaceId="workspace" workspaceName="작업 공간" guide="브랜드 사실" topic="주제" contentBranch="video" onContentBranchChange={onBranchChange} onTopicChange={vi.fn()} onOpenLearning={vi.fn()} onCandidateSelect={vi.fn()} />);

    chooseCards();
    fireEvent.click(screen.getByRole("button", { name: "구조 초안 3개 보기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body)).learning_context.u3.content_branch).toBe("video");
    expect(request.headers).toMatchObject({ Authorization: "Bearer customer-jwt" });
  });

  it("FE2-CREATE-02 거절: 소재 권리 미확인 입력은 네트워크 호출 전에 막는다", () => {
    expect(() => buildStudioGenerationRequest({ ...VALID_INPUT, materialRightsConfirmed: false })).toThrow("소재 권리 확인이 필요합니다");
  });

  it("FE2-CREATE-03 인증 경계: 고객 JWT와 화면의 active tenant로 생성한다", async () => {
    localStorage.setItem("dashboard_auth_token", "customer-jwt");
    const candidates = ["A", "B", "C"].map((label, index) => ({
      candidate_id: `candidate-${label}`,
      ordinal: index + 1,
      label,
      angle: "problem_first",
      title: `${label} 제목`,
      rationale: `${label} 근거`,
      format: { content_branch: "text_image", preview_kind: "structured_storyboard", quality: "draft", outline: ["첫 장면"] },
    }));
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { job_id: "job-1", candidates } }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateRoom
      workspaceId="11111111-1111-4111-8111-111111111111"
      workspaceName="대시보드 작업 공간"
      guide="브랜드 사실"
      topic="작은 팀의 콘텐츠 운영"
      onTopicChange={vi.fn()}
      onOpenLearning={vi.fn()}
      onCandidateSelect={vi.fn()}
    />);
    chooseCards();
    fireEvent.click(screen.getByRole("button", { name: "구조 초안 3개 보기" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body)).workspace_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(request.headers).toMatchObject({ Authorization: "Bearer customer-jwt" });
  });

  it("V77-CREATE-PERSIST-03 정상: 생성실 문답과 학습 정보가 함께 되살아난다", async () => {
    const props = {
      workspaceId: "workspace-a",
      workspaceName: "작업 공간 A",
      guide: "브랜드 사실",
      topic: "주제",
      onTopicChange: vi.fn(),
      onOpenLearning: vi.fn(),
      onCandidateSelect: vi.fn(),
    };
    const first = render(<CreateRoom {...props} />);
    chooseCards();
    await waitFor(() => expect(localStorage.getItem("studio_learning:workspace-a")).toContain("사람 더 못 뽑는 상황에서"));

    first.unmount();
    render(<CreateRoom {...props} />);

    expect(document.querySelector('[data-create-question="review"]')).toBeInTheDocument();
    expect(document.querySelector("[data-create-review]")).toHaveTextContent("영상");
    expect(document.querySelector("[data-create-review]")).toHaveTextContent("상담이나 문의를 시작");
    expect(document.querySelector("[data-create-review]")).toHaveTextContent("사람 더 못 뽑는 상황");
    expect(document.querySelector("[data-create-review]")).toHaveTextContent("확인됨");
  });

  it("QA-CREATE-05 경합: 후보 생성 연타는 클라이언트에서 단일 POST로 합친다", async () => {
    localStorage.setItem("dashboard_auth_token", "customer-jwt");
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateRoom workspaceId="workspace" workspaceName="작업 공간" guide="브랜드 사실" topic="주제" onTopicChange={vi.fn()} onOpenLearning={vi.fn()} onCandidateSelect={vi.fn()} />);
    chooseCards();
    const button = screen.getByRole("button", { name: "구조 초안 3개 보기" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    resolveRequest(Response.json({ data: { job_id: "job-1", candidates: [] } }, { status: 201 }));
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it("QA-CREATE-06 정상: 후보 모두 거절은 기존 무료 재생성 API로 대체 후보를 받는다", async () => {
    localStorage.setItem("dashboard_auth_token", "customer-jwt");
    const candidates = (prefix: string) => ["A", "B", "C"].map((label, index) => ({
      candidate_id: `${prefix}-${label}`,
      ordinal: index + 1,
      label,
      angle: "problem_first",
      title: `${prefix} ${label} 제목`,
      rationale: `${prefix} ${label} 근거`,
      format: { content_branch: "text_image", preview_kind: "structured_storyboard", quality: "draft", outline: ["첫 장면"] },
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { job_id: "job-1", candidates: candidates("원본") } }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ data: { replacement: { job_id: "job-2", candidates: candidates("대체") } } }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateRoom workspaceId="workspace" workspaceName="작업 공간" guide="브랜드 사실" topic="주제" onTopicChange={vi.fn()} onOpenLearning={vi.fn()} onCandidateSelect={vi.fn()} />);
    chooseCards();
    fireEvent.click(screen.getByRole("button", { name: "구조 초안 3개 보기" }));
    await screen.findByText("원본 A 제목");

    fireEvent.click(screen.getByRole("button", { name: "3개 모두 바꾸기" }));

    expect(await screen.findByText("대체 A 제목")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/studio/v1/regenerations/job-1", expect.objectContaining({ method: "POST" }));
  });
});

describe("화면 2차 편집실 계약", () => {
  it("FE2-EDIT-01 정상: 목차에서 고른 대사 줄만 수정한다", async () => {
    const onLinesChange = vi.fn();
    render(<EditRoom lines={["첫 줄", "둘째 줄", "셋째 줄"]} onLinesChange={onLinesChange} />);

    fireEvent.click(screen.getByRole("button", { name: "2. 둘째 줄" }));
    fireEvent.change(screen.getByRole("textbox", { name: "대사 2" }), { target: { value: "고친 둘째 줄" } });

    await waitFor(() => expect(onLinesChange).toHaveBeenCalledWith(["첫 줄", "고친 둘째 줄", "셋째 줄"]));
  });

  it("FE2-EDIT-02 거절: 선택하지 않은 대사 줄은 변경하지 않는다", () => {
    const onLinesChange = vi.fn();
    render(<EditRoom lines={["첫 줄", "둘째 줄"]} onLinesChange={onLinesChange} />);

    fireEvent.change(screen.getByRole("textbox", { name: "대사 1" }), { target: { value: "고친 첫 줄" } });

    expect(onLinesChange).toHaveBeenCalledWith(["고친 첫 줄", "둘째 줄"]);
  });

  it("FE3-EDIT-03 정상: 편집실 상단은 지금 무엇을 바꾸는지 설명한다", () => {
    render(<EditRoom lines={["첫 줄", "둘째 줄"]} onLinesChange={vi.fn()} />);
    const top = document.querySelector('[data-room-top="edit"]');
    expect(top).toHaveTextContent("내용과 화면을 직접 다듬습니다");
    expect(top).toHaveTextContent("올릴 채널과 채널별 문구는 발행실에서 정합니다");
  });

  it("FE6-EDIT-01 정상: 영상 장면과 아이콘 도구 뒤에 대사를 항상 배치한다", () => {
    render(<EditRoom lines={["첫 줄", "둘째 줄"]} onLinesChange={vi.fn()} kind="video" />);
    const outline = document.querySelector("[data-edit-outline]");
    const stage = document.querySelector("[data-edit-stage]");
    const tools = document.querySelector("[data-edit-tools]");
    const script = document.querySelector("[data-edit-script]");

    expect(outline).toHaveAttribute("aria-label", "영상 장면");
    expect(screen.getAllByRole("button", { name: /도구$/ })).toHaveLength(4);
    expect(stage!.compareDocumentPosition(script as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tools!.compareDocumentPosition(script as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("FE6-EDIT-02 정상: 대사를 빼거나 되살리면 장면 수와 길이가 함께 바뀐다", () => {
    render(<EditRoom lines={["첫 줄", "둘째 줄", "셋째 줄"]} onLinesChange={vi.fn()} kind="video" />);
    expect(document.querySelector("[data-edit-duration]")).toHaveTextContent("12초");

    fireEvent.click(screen.getAllByRole("button", { name: "빼기" })[0]);
    expect(document.querySelector("[data-edit-duration]")).toHaveTextContent("2개 장면");
    expect(document.querySelector("[data-edit-duration]")).toHaveTextContent("8초");

    fireEvent.click(screen.getByRole("button", { name: "되살리기" }));
    expect(document.querySelector("[data-edit-duration]")).toHaveTextContent("3개 장면");
  });

  it("FE6-EDIT-03 정상: 무음 표식이 있는 줄만 한 번에 줄인다", () => {
    render(<EditRoom lines={["첫 줄", "...", "둘째 줄"]} onLinesChange={vi.fn()} kind="video" />);
    fireEvent.click(screen.getByRole("button", { name: "무음 구간 1개 줄이기" }));
    expect(document.querySelector("[data-edit-duration]")).toHaveTextContent("2개 장면");
    expect(document.querySelector("[data-edit-duration]")).toHaveTextContent("8초");
  });

  it("FE6-EDIT-04 거절: 무음 표식이 없으면 무음 줄이기 조작을 비활성화한다", () => {
    render(<EditRoom lines={["첫 줄", "둘째 줄"]} onLinesChange={vi.fn()} kind="video" />);
    expect(screen.getByRole("button", { name: "무음 구간 0개 줄이기" })).toBeDisabled();
  });

  it("FMT-UI-01 정상: 승인 시안의 재생 속도를 고르면 발행용 형식값으로 전달한다", async () => {
    const onFormatChange = vi.fn();
    render(<EditRoom lines={["첫 줄", "둘째 줄"]} onLinesChange={vi.fn()} kind="video" onFormatChange={onFormatChange} />);

    fireEvent.click(screen.getByRole("button", { name: "영상 재생 속도 도구" }));
    fireEvent.click(screen.getByRole("button", { name: "1.5배" }));

    await waitFor(() => expect(onFormatChange).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: "video",
      aspectRatio: "9:16",
      playbackSpeed: 1.5,
    })));
  });

  it("FE6-EDIT-05 거절: 음악 백엔드가 없을 때 파일이나 파형을 완성된 것처럼 표시하지 않는다", () => {
    render(<EditRoom lines={["나레이션"]} onLinesChange={vi.fn()} kind="audio" />);
    expect(screen.getByText("음악 파일 생성은 아직 제공하지 않습니다. 지금은 나레이션 대사만 편집할 수 있습니다.")).toBeInTheDocument();
    expect(document.querySelector("[data-edit-stage]")).not.toBeInTheDocument();
    expect(document.querySelector("[data-edit-tools]")).not.toBeInTheDocument();
  });

  it("QA-EDIT-06 정상: 글 형식은 카드뉴스가 아니라 글 문단과 연속 문서 편집기로 전환된다", () => {
    render(<EditRoom lines={["첫 문단", "둘째 문단"]} onLinesChange={vi.fn()} kind="text" />);

    expect(document.querySelector('[data-edit-kind="text"]')).toBeInTheDocument();
    expect(document.querySelector("[data-edit-outline]")).toHaveAttribute("aria-label", "글 문단");
    expect(screen.getByRole("textbox", { name: "글 전체" })).toHaveValue("첫 문단\n\n둘째 문단");
    expect(screen.queryByRole("textbox", { name: "문단 1" })).not.toBeInTheDocument();
    expect(screen.getByText("공백 포함 11자 · 문단 2개")).toBeInTheDocument();
  });
});
