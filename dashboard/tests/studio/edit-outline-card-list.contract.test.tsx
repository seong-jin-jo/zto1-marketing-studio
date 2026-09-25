// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditRoom } from "@/components/studio/StudioRooms";

// 편집실 왼쪽 176px 목차 칸(`.edit-outline`)의 카드 목록 계약.
//
// DESIGN.md §4 「편집실 3영역 골격(v65)」이 이 칸을 이미 계약했고 `EditOutline` 을 컴포넌트
// 인벤토리에 등록까지 해 뒀는데, 실제 화면에는 `1. 첫 장` 같은 글자 목록만 있었다. 장을
// 옮기려면 미리보기 아래 `앞 장`·`다음 장` 화살표를 여러 번 눌러야 했다. 카드뉴스는 장과
// 장의 흐름이 곧 상품인데 그 흐름이 화면에 없었다
// (설계문서 docs/design-docs/osmu-four-room-ux-uplift-v1.0-opus-20260913.md §2.1).
//
// 여기서 고정하는 것은 넷이다. 눌러서 이동 · 순서 바꾸기 · 추가와 삭제 · 표지와 마무리 배지.

afterEach(() => cleanup());

describe("편집실 목차 칸의 카드 목록", () => {
  it("OUTLINE-01 정상: 목록에서 눌러 바로 그 장으로 간다", () => {
    render(<EditRoom lines={["첫 장", "둘째 장", "셋째 장"]} onLinesChange={vi.fn()} kind="card" />);

    const outline = document.querySelector("[data-edit-outline]")!;
    expect(outline.querySelectorAll("[data-outline-item]")).toHaveLength(3);
    expect(outline.querySelector('[data-outline-item="0"]')).toHaveAttribute("aria-current", "true");

    fireEvent.click(outline.querySelector('[data-outline-item="2"]')!);

    expect(outline.querySelector('[data-outline-item="2"]')).toHaveAttribute("aria-current", "true");
    expect(outline.querySelector('[data-outline-item="0"]')).toHaveAttribute("aria-current", "false");
    // 화살표를 여러 번 누르지 않고 한 번에 갔다.
    expect(screen.getByRole("textbox", { name: "카드 3 글자" })).toHaveValue("셋째 장");
  });

  it("OUTLINE-02 정상: 목록에서 순서를 바꾸면 실제 줄 순서가 바뀐다", () => {
    const onLinesChange = vi.fn();
    render(<EditRoom lines={["첫 장", "둘째 장", "셋째 장"]} onLinesChange={onLinesChange} kind="card" />);

    const outline = document.querySelector("[data-edit-outline]")!;
    fireEvent.click(outline.querySelector('[data-outline-item="1"]')!);
    fireEvent.keyDown(outline.querySelector('[data-outline-item="1"]')!, { key: "ArrowUp", altKey: true });

    expect(onLinesChange).toHaveBeenLastCalledWith(["둘째 장", "첫 장", "셋째 장"]);
  });

  it("OUTLINE-02b 정상: 끌어서 놓으면 먼 자리까지 한 번에 옮긴다", () => {
    // 회장 확정 D-2026-09-09-1: "직접 문구 수정이나 드래그앤 드롭정도는 할수있는거지."
    const onLinesChange = vi.fn();
    const onCardTextPositionsChange = vi.fn();
    render(
      <EditRoom
        lines={["첫 장", "둘째 장", "셋째 장"]}
        onLinesChange={onLinesChange}
        kind="card"
        cardTextPositions={["top-center", "center", "bottom-center"]}
        onCardTextPositionsChange={onCardTextPositionsChange}
      />,
    );

    const outline = document.querySelector("[data-edit-outline]")!;
    const payload: Record<string, string> = {};
    const dataTransfer = {
      setData: (key: string, value: string) => { payload[key] = value; },
      getData: (key: string) => payload[key] ?? "",
    };

    fireEvent.dragStart(outline.querySelector('[data-outline-item="2"]')!, { dataTransfer });
    fireEvent.drop(outline.querySelector('[data-outline-item="0"]')!, { dataTransfer });

    expect(onLinesChange).toHaveBeenLastCalledWith(["셋째 장", "첫 장", "둘째 장"]);
    // 글자 위치도 장을 따라가야 한다. 안 따라가면 남의 장 위치가 붙는다.
    expect(onCardTextPositionsChange).toHaveBeenLastCalledWith(["bottom-center", "top-center", "center"]);
  });

  it("OUTLINE-03 정상: 추가와 삭제가 장 수에 반영된다", () => {
    const onLinesChange = vi.fn();
    const onCardTextPositionsChange = vi.fn();
    render(
      <EditRoom
        lines={["첫 장", "둘째 장"]}
        onLinesChange={onLinesChange}
        kind="card"
        cardTextPositions={["top-center", "bottom-center"]}
        onCardTextPositionsChange={onCardTextPositionsChange}
      />,
    );

    const outline = document.querySelector("[data-edit-outline]")!;
    expect(outline.querySelector("[data-outline-count]")).toHaveTextContent("2장");

    fireEvent.click(outline.querySelector("[data-outline-add]")!);
    expect(onLinesChange).toHaveBeenLastCalledWith(["첫 장", "둘째 장", ""]);

    fireEvent.click(outline.querySelector('[data-outline-item="0"]')!);
    fireEvent.click(outline.querySelector('[data-outline-remove="0"]')!);
    expect(onLinesChange).toHaveBeenLastCalledWith(["둘째 장"]);
    // 줄만 지우면 글자 위치가 한 칸씩 밀려 엉뚱한 장의 값이 붙는다.
    expect(onCardTextPositionsChange).toHaveBeenLastCalledWith(["bottom-center"]);
  });

  it("OUTLINE-04 거절: 마지막 한 장은 지울 수 없다", () => {
    const onLinesChange = vi.fn();
    render(<EditRoom lines={["하나뿐인 장"]} onLinesChange={onLinesChange} kind="card" />);

    const remove = document.querySelector('[data-outline-remove="0"]')!;
    expect(remove).toBeDisabled();
    fireEvent.click(remove);
    expect(onLinesChange).not.toHaveBeenCalled();
  });

  it("OUTLINE-05 정상: 첫 장은 표지, 끝 장은 마무리로 보인다", () => {
    render(<EditRoom lines={["첫 장", "가운데 장", "끝 장"]} onLinesChange={vi.fn()} kind="card" />);

    const outline = document.querySelector("[data-edit-outline]")!;
    expect(outline.querySelector('[data-outline-item="0"]')).toHaveTextContent("표지");
    expect(outline.querySelector('[data-outline-item="2"]')).toHaveTextContent("마무리");
    expect(outline.querySelector('[data-outline-item="1"]')).not.toHaveTextContent("표지");
    expect(outline.querySelector('[data-outline-item="1"]')).not.toHaveTextContent("마무리");
  });

  it("OUTLINE-06 정상: 카드뉴스는 장마다 자기 그림을 썸네일로 건다", () => {
    render(
      <EditRoom
        lines={["첫 장", "둘째 장"]}
        onLinesChange={vi.fn()}
        kind="card"
        previewReady
        previewImageUrls={["https://example.test/card-1.png", "https://example.test/card-2.png"]}
      />,
    );

    const outline = document.querySelector("[data-edit-outline]")!;
    expect(outline.querySelector('[data-outline-thumb="0"]')).toHaveAttribute("src", "https://example.test/card-1.png");
    expect(outline.querySelector('[data-outline-thumb="1"]')).toHaveAttribute("src", "https://example.test/card-2.png");
  });

  it("OUTLINE-07 v70로 대체: 영상은 이제 이 공용 목차 대신 VideoEditor 안의 자막 대본을 쓴다", () => {
    // 이 테스트는 원래 영상도 카드와 같은 목차 나브로 장면을 고르고 옮긴다고 고정했다.
    // design-spec-editroom-v70.md §4가 영상 전용 편집기(플레이어+자막 대본+타임라인)로
    // 완전히 갈랐고, 목차 나브는 그 자리에서 걷어냈다(같은 장면 목록이 두 곳에서 따로
    // 노는 것을 막기 위해서다 — StudioRooms.tsx 세션맥락 주석 참조). 그래서 이 단언은
    // "목차가 없다"로 뒤집는다. 순서 이동은 자막 대본에 없다 — 장면 순서는 생성 시점
    // 순서를 그대로 쓰고, 컷(§4.3)으로 뺄 수만 있다(디자인 결정, design-spec §4.3).
    //
    // onVideoEditChange가 실제 서비스처럼 있을 때만 새 워크벤치로 완전히 갈린다.
    // 없는 legacy 경로(레거시 테스트 전용, 실서비스에는 없다)는 옛 목차를 그대로 둔다
    // (회귀 0 — studio-fe2-rooms.test.tsx FE6-EDIT-01 참조).
    render(<EditRoom lines={["첫 장면", "둘째 장면"]} onLinesChange={vi.fn()} kind="video" onVideoEditChange={vi.fn()} previewVideoUrl={null} />);
    expect(document.querySelector("[data-edit-outline]")).toBeNull();
  });

  it("OUTLINE-08 정상: 편집실의 채운 강조색 버튼은 여전히 발행실로 이동 하나뿐이다", () => {
    render(<EditRoom lines={["첫 장", "둘째 장"]} onLinesChange={vi.fn()} kind="card" onOpenPublish={vi.fn()} />);

    expect(document.querySelectorAll("button.bg-accent")).toHaveLength(1);
  });
});
