// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditRoom } from "@/components/studio/StudioRooms";

afterEach(() => cleanup());

describe("편집실 v65 화면 계약", () => {
  it("V65-EDIT-01 정상: 형식과 채널을 분리하고 발행실 이동만 다음 단계로 둔다", () => {
    const onOpenPublish = vi.fn();
    render(<EditRoom lines={["첫 문단", "둘째 문단"]} onLinesChange={vi.fn()} kind="text" onOpenPublish={onOpenPublish} />);

    expect(screen.getByRole("heading", { name: "내용과 화면을 직접 다듬습니다" })).toBeInTheDocument();
    const formatGroup = screen.getByRole("group", { name: "만들 콘텐츠 형식" });
    for (const label of ["글", "카드뉴스", "영상", "음악"]) {
      expect(formatGroup.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
    }
    expect(screen.getByText("형식과 채널은 다릅니다.")).toBeInTheDocument();
    expect(screen.queryByText("여기서만 한 번에 되는 일")).not.toBeInTheDocument();
    expect(document.querySelectorAll("button.bg-accent")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "발행실로 이동" }));
    expect(onOpenPublish).toHaveBeenCalledTimes(1);
  });

  it("V65-EDIT-02 정상: 글은 문단별 입력칸이 아닌 연속 문서에서 직접 고친다", () => {
    const onLinesChange = vi.fn();
    render(<EditRoom lines={["첫 문단", "둘째 문단"]} onLinesChange={onLinesChange} kind="text" />);

    const editor = screen.getByRole("textbox", { name: "글 전체" });
    expect(editor).toHaveValue("첫 문단\n\n둘째 문단");
    fireEvent.change(editor, { target: { value: "고친 첫 문단\n\n고친 둘째 문단" } });
    expect(onLinesChange).toHaveBeenLastCalledWith(["고친 첫 문단", "고친 둘째 문단"]);
    expect(screen.queryByRole("textbox", { name: "문단 1" })).not.toBeInTheDocument();
  });

  it("V65-EDIT-03 정상: 카드 글자를 이미지 안에서 고치고 상단·중앙·하단으로 옮긴다", () => {
    const onLinesChange = vi.fn();
    const onCardTextPositionsChange = vi.fn();
    render(
      <EditRoom
        lines={["카드 첫 문장"]}
        onLinesChange={onLinesChange}
        kind="card"
        cardTextPositions={["center"]}
        onCardTextPositionsChange={onCardTextPositionsChange}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "카드 1 글자" }), { target: { value: "카드 안에서 고침" } });
    expect(onLinesChange).toHaveBeenCalledWith(["카드 안에서 고침"]);
    fireEvent.click(screen.getByRole("button", { name: "상단" }));
    expect(onCardTextPositionsChange).toHaveBeenCalledWith(["top-center"]);
    expect(screen.getByRole("button", { name: "카드 비율 도구" })).toHaveTextContent("4:5 · 1080 × 1350픽셀");
    expect(screen.getByText("4:5 · 1080 × 1350픽셀")).toBeInTheDocument();
    expect(screen.getByText(/카드 글자 크기: 기본 28픽셀/)).toBeInTheDocument();
    expect(screen.getByText(/배경 이미지: 책상 위 제품 사진/)).toBeInTheDocument();
  });

  it("V65-EDIT-04 정상: 전체 적용은 세 가지 동작만 제공하고 실제 편집값을 바꾼다", () => {
    const onLinesChange = vi.fn();
    render(<EditRoom lines={["아주 긴 문장을 스물네 글자보다 길게 작성해서 줄이는 동작을 확인한다", ""]} onLinesChange={onLinesChange} kind="text" />);

    const helper = screen.getByRole("complementary", { name: "편집 담당 대화창" });
    expect(helper.querySelectorAll("button")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "빈 줄 걷어내기" }));
    expect(onLinesChange).toHaveBeenCalledWith(["아주 긴 문장을 스물네 글자보다 길게 작성해서 줄이는 동작을 확인한다"]);
  });

  it("V65-EDIT-05 거절: 빈 작업물과 저장 실패는 0으로 꾸미지 않고 다음 행동을 밝힌다", () => {
    const onOpenCreate = vi.fn();
    const view = render(<EditRoom lines={[]} onLinesChange={vi.fn()} onOpenCreate={onOpenCreate} />);

    expect(screen.getByText("아직 편집할 작업물이 없습니다")).toBeInTheDocument();
    expect(screen.queryByText(/^0/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "생성실에서 작업물 고르기" }));
    expect(onOpenCreate).toHaveBeenCalledTimes(1);

    view.rerender(<EditRoom lines={["본문"]} onLinesChange={vi.fn()} kind="text" autosaveError="자동 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요." />);
    expect(screen.getByText("자동 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "발행실로 이동" })).toBeDisabled();
  });

  it("V65-EDIT-06 거절: 음악 파일을 만들 수 없으면 제공하지 않는다고 정확히 표시한다", () => {
    render(<EditRoom lines={["나레이션 대사"]} onLinesChange={vi.fn()} kind="audio" />);

    expect(screen.getByText("음악 파일 생성은 아직 제공하지 않습니다. 지금은 나레이션 대사만 편집할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/음악 파일 생성 완료/)).not.toBeInTheDocument();
  });
});
