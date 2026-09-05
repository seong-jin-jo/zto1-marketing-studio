// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateRoom, EditRoom } from "@/components/studio/StudioRooms";
import { LearningStatus } from "@/components/studio/LearningStatus";
import { LearningCardWizard } from "@/components/studio/LearningCardWizard";
import { EditPreview } from "@/components/studio/EditPreview";
import { LEARNING_SLOT_TOTAL, countFilledLearningSlots, readLearningInfo } from "@/components/studio/learning-info";

// 회장 4실 실사용 피드백(docs/requests/2026-08-29-회장-4실-실사용-피드백.md) 중
// 생성실과 편집실 항목의 계약. 대조표에서 미해결로 판정된 자리만 여기서 못 박는다.

const noop = () => {};

afterEach(() => cleanup());

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
});

describe("헤더 학습 정보 (회장: 왜 헤더에 학습 정보가 사라짐?)", () => {
  it("CHAIR-LEARN-01 정상: 헤더에 학습 정보가 진행 상태와 함께 항상 보인다", () => {
    render(<LearningStatus filled={3} onOpen={noop} />);

    const status = screen.getByRole("button", { name: `학습 정보 3 / ${LEARNING_SLOT_TOTAL}칸 채움. 남은 5칸 이어 채우기` });
    expect(status).toHaveTextContent("학습 정보");
    expect(status).toHaveTextContent(`3 / ${LEARNING_SLOT_TOTAL}`);
    expect(status).toHaveTextContent("남은 5칸 이어 채우기");
    expect(status.querySelector("progress")).toHaveAttribute("value", "3");
  });

  it("CHAIR-LEARN-02 거절 조건: 눌러도 아무 일 없는 죽은 표시가 아니라 문답을 연다", () => {
    const onOpen = vi.fn();
    render(<LearningStatus filled={0} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: /학습 정보/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("CHAIR-LEARN-03 정상: 덜 채우고 닫으면 헤더가 한 번 깜빡인다", async () => {
    const view = render(<LearningStatus filled={1} onOpen={noop} flashToken={0} />);
    expect(document.querySelector("[data-learning-flash]")).toBeNull();

    view.rerender(<LearningStatus filled={1} onOpen={noop} flashToken={1} />);
    await waitFor(() => expect(document.querySelector('[data-learning-flash="on"]')).not.toBeNull());
  });
});

describe("학습 정보 일곱 걸음 카드 문답", () => {
  it("CHAIR-CARD-01 정상: 걸음마다 입력창 없이 카드만 보인다", () => {
    render(<LearningCardWizard workspaceId="tenant-1" workspaceName="작업 공간" onSaved={noop} onClose={noop} />);

    expect(screen.getByText("어떤 업종에서 일하시나요?")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-learning-card]").length).toBeGreaterThan(6);
    expect(document.querySelectorAll("[data-learning-wizard] input")).toHaveLength(0);
  });

  it("CHAIR-CARD-02 정상: 카드를 고르면 다음 걸음으로 가고 저장된다", async () => {
    render(<LearningCardWizard workspaceId="tenant-1" onSaved={noop} onClose={noop} />);

    fireEvent.click(screen.getByRole("button", { name: /교육·강의/ }));

    await waitFor(() => expect(screen.getByText("주로 어떤 고객에게 콘텐츠를 보여주나요?")).toBeInTheDocument());
    expect(readLearningInfo("tenant-1").industry).toContain("강의");
  });

  it("CHAIR-CARD-03 탈출구: 모르겠다고 하면 담당이 골라 넣고 다음으로 간다", async () => {
    render(<LearningCardWizard workspaceId="tenant-1" onSaved={noop} onClose={noop} />);

    fireEvent.click(screen.getByRole("button", { name: "추천받기" }));

    await waitFor(() => expect(screen.getByText("주로 어떤 고객에게 콘텐츠를 보여주나요?")).toBeInTheDocument());
    expect(readLearningInfo("tenant-1").industry).toBeTruthy();
  });

  it("CHAIR-CARD-04 거절 조건: 덜 채우고 닫으면 완료로 보고하지 않는다", () => {
    const onSaved = vi.fn();
    render(<LearningCardWizard workspaceId="tenant-1" onSaved={onSaved} onClose={noop} />);

    fireEvent.click(screen.getByRole("button", { name: /나중에 하기/ }));
    expect(onSaved).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("CHAIR-CARD-05 정상: 카드에 없으면 대화 한 줄로 빠져나간다", async () => {
    render(<LearningCardWizard workspaceId="tenant-1" onSaved={noop} onClose={noop} />);

    fireEvent.click(screen.getByRole("button", { name: "직접 입력" }));
    fireEvent.change(screen.getByLabelText("학습 정보 직접 입력"), { target: { value: "수제 가죽 공방" } });
    fireEvent.click(screen.getByRole("button", { name: "입력하고 다음" }));

    await waitFor(() => expect(readLearningInfo("tenant-1").industry).toBe("수제 가죽 공방"));
  });
});

describe("생성실 (회장: 오늘 만들 수 있는 것이 뭐하는 예시이지 / 중복 선택)", () => {
  const props = {
    workspaceId: "tenant-1",
    workspaceName: "작업 공간",
    guide: "",
    topic: "",
    onTopicChange: vi.fn(),
    onOpenLearning: vi.fn(),
    onCandidateSelect: vi.fn(),
  };

  it("CHAIR-CREATE-01 정상: 만들 수 있는 종류가 셋뿐인 것처럼 읽히는 이름을 쓰지 않는다", () => {
    render(<CreateRoom {...props} />);

    expect(screen.queryByText("오늘 만들 수 있는 것")).toBeNull();
    expect(screen.getByText("콘텐츠 구성 초안 예시")).toBeInTheDocument();
    expect(screen.getByText("영상 렌더링, 카드뉴스 이미지 생성")).toBeInTheDocument();
  });

  it("CHAIR-CREATE-02 정상: 만들 형식을 한 질문에서 중복 없이 여러 개 고른다", () => {
    const onAlsoKindsChange = vi.fn();
    render(<CreateRoom {...props} onAlsoKindsChange={onAlsoKindsChange} />);

    fireEvent.click(screen.getByRole("button", { name: "영상" }));
    fireEvent.click(screen.getByRole("button", { name: "카드뉴스" }));

    expect(onAlsoKindsChange).toHaveBeenCalledWith(["card"]);
    expect(screen.getByText(/영상 구조를 먼저 확인합니다. 추가 선택: 카드뉴스/)).toBeInTheDocument();
    expect(screen.queryByText("이 주제로 같이 만들 것")).toBeNull();
  });

  it("CHAIR-CREATE-03 정상: 만들 종류 세 갈래가 모두 고를 수 있게 열려 있다", () => {
    render(<CreateRoom {...props} />);

    for (const label of ["영상", "카드뉴스", "글"]) {
      expect(screen.getByRole("button", { name: label })).toBeEnabled();
    }
  });

  it("CHAIR-CREATE-04 정상: 만들던 것이 있으면 이어서 하기 한 줄이 뜬다", () => {
    const onResume = vi.fn();
    render(<CreateRoom {...props} resumeCount={2} onResume={onResume} />);

    expect(document.querySelector('[data-create-resume="2"]')).toHaveTextContent("저장된 작업물 2건이 있습니다");
    fireEvent.click(screen.getByRole("button", { name: "이어서 하기" }));
    expect(onResume).toHaveBeenCalled();
  });

  it("CHAIR-CREATE-05 거절 조건: 만들던 것이 없으면 그 줄은 아예 안 뜬다", () => {
    render(<CreateRoom {...props} resumeCount={0} />);
    expect(document.querySelector("[data-create-resume]")).toBeNull();
  });

  it("CHAIR-CREATE-06 정상: 학습 정보 진행은 여덟 칸 기준으로 센다", () => {
    expect(countFilledLearningSlots({ industry: "교육", voice: "차분" })).toBe(2);
    expect(countFilledLearningSlots({}, { guide: "이미 증류된 가이드" })).toBe(1);
    expect(countFilledLearningSlots({})).toBe(0);
  });
});

describe("편집실 미리보기 (회장: 컨텐츠가 미리볼 수 있는게 없는데 내가 어떻게 확인하냐)", () => {
  it("CHAIR-EDIT-01 정상: 편집실은 발행 채널이 아니라 콘텐츠 크기를 골라 미리본다", () => {
    render(<EditPreview kind="video" lines={["첫 장면", "둘째 장면"]} activeLine={0} onActiveLine={noop} />);

    expect(screen.getByRole("button", { name: "세로형 9:16" })).toBeInTheDocument();
    expect(document.querySelector('[data-edit-preview-frame="9 / 16"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Threads" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "X" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Facebook" })).not.toBeInTheDocument();
  });

  it("CHAIR-EDIT-02 거절 조건: 렌더 전이라도 빈 상자를 두지 않고 장면과 자막을 그린다", () => {
    render(<EditPreview kind="video" lines={["문제부터 말합니다"]} activeLine={0} onActiveLine={noop} renderReady={false} />);

    expect(screen.getAllByText("문제부터 말합니다").length).toBeGreaterThan(0);
    expect(screen.getByText(/장면과 자막 배치만 보여 드립니다/)).toBeInTheDocument();
  });

  it("CHAIR-EDIT-03 정상: 자막이 플랫폼 UI에 가리면 그 사실을 말한다", () => {
    render(<EditPreview kind="video" lines={["아주 길게 이어지는 자막 문장을 넣어 아래 버튼줄과 겹치게 만든다"]} activeLine={0} onActiveLine={noop} />);

    fireEvent.click(screen.getByRole("button", { name: "세로형 9:16" }));
    expect(document.querySelector('[data-edit-preview-subtitle="가림"]')).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("아래 버튼줄에 가립니다");
  });

  it("CHAIR-EDIT-04 정상: 편집실 본 화면에도 준비 중 자리표시자가 아니라 미리보기가 붙는다", () => {
    render(<EditRoom lines={["첫 장면", "둘째 장면"]} onLinesChange={noop} kind="video" />);

    expect(screen.queryByText("실제 영상 렌더는 준비 중입니다.")).toBeNull();
    expect(document.querySelector("[data-edit-preview]")).not.toBeNull();
  });

  it("R-S10-37 정상: 글은 초 단위 대사 줄이 아니라 하나의 문단 편집기로 고친다", () => {
    const onLinesChange = vi.fn();
    render(<EditRoom lines={["첫 문단", "둘째 문단"]} onLinesChange={onLinesChange} kind="text" />);

    const editor = screen.getByRole("textbox", { name: "글 전체" });
    expect(editor).toHaveValue("첫 문단\n\n둘째 문단");
    expect(screen.queryByText(/초부터/)).not.toBeInTheDocument();
    expect(screen.queryByText("대사")).not.toBeInTheDocument();

    fireEvent.change(editor, { target: { value: "고친 첫 문단\n\n고친 둘째 문단" } });
    expect(onLinesChange).toHaveBeenLastCalledWith(["고친 첫 문단", "고친 둘째 문단"]);
  });

  it("R-S10-32 정상: 만들 콘텐츠 형식은 글·카드뉴스·영상·음악을 모두 한곳에 보여 준다", () => {
    const onKindChange = vi.fn();
    render(<EditRoom lines={["본문"]} onLinesChange={noop} kind="text" onKindChange={onKindChange} />);

    const group = screen.getByRole("group", { name: "만들 콘텐츠 형식" });
    for (const label of ["글", "카드뉴스", "영상", "음악"]) {
      expect(group.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
    }
    fireEvent.click(screen.getByRole("button", { name: "영상" }));
    expect(onKindChange).toHaveBeenCalledWith("video");
  });

  it("R-S10-33 정상: 카드뉴스 글자를 이미지 안에서 고치고 끌어 옮긴다", () => {
    const onLinesChange = vi.fn();
    const onPositionsChange = vi.fn();
    render(<EditPreview
      kind="card"
      lines={["카드 첫 문장"]}
      activeLine={0}
      onActiveLine={noop}
      onLinesChange={onLinesChange}
      cardTextPositions={["center"]}
      onCardTextPositionsChange={onPositionsChange}
    />);

    const textEditor = screen.getByRole("textbox", { name: "카드 1 글자" });
    fireEvent.change(textEditor, { target: { value: "카드 안에서 고친 문장" } });
    expect(onLinesChange).toHaveBeenCalledWith(["카드 안에서 고친 문장"]);

    const canvas = document.querySelector("[data-card-canvas]") as HTMLElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 400, width: 300, height: 400, toJSON: () => ({}),
    });
    fireEvent.pointerDown(screen.getByRole("button", { name: "카드 글자 끌어 옮기기" }), { pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 280, clientY: 40 });
    expect(onPositionsChange).toHaveBeenCalledWith(["top-center"]);
  });
});
