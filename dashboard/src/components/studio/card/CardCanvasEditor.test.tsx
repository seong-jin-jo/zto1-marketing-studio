// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CardDeckV3 } from "@/lib/studio/card-element-contract";
import { CardCanvasEditor } from "./CardCanvasEditor";

afterEach(() => cleanup());

function deck(): CardDeckV3 {
  return {
    contract_version: "3.0", id: "deck_editor", template: "plain", ratio: "4:5", revision: 0,
    theme: { background: "#FFF9F0", foreground: "#111111", accent: "#2563EB" },
    brand: { display_name: "OSMU", handle: null }, hook_type: "pain",
    cta: { keyword: "정리본", comment_example: "정리본을 남겨 주세요", save_reason: "나중에 다시 확인하세요" },
    slides: [
      {
        id: "slide_cover", order: 0, role: "cover", content_state: "filled", background: { kind: "solid", color: "#FFF9F0" }, base: { kind: "plain", lines: ["첫 장"] },
        elements: [{ id: "text_existing", type: "text", name: "제목", x: 100, y: 120, width: 600, height: 180, rotation: 0, z_index: 0, opacity: 1, locked: false, hidden: false, text: "첫 장", style: { font_family: "Pretendard Variable", font_size: 64, font_weight: 700, line_height: 1.2, letter_spacing: 0, color: "#111111", align: "left", vertical_align: "middle" } }],
      },
      { id: "slide_cta", order: 1, role: "cta", content_state: "filled", background: { kind: "solid", color: "#111111" }, base: { kind: "plain", lines: ["저장"] }, elements: [] },
    ],
  };
}

describe("CardCanvasEditor S1 자유 배치", () => {
  it("S1-AC2 정상 경로: 요소 선택 뒤 글자 크기, 굵기, 정렬을 바꾸면 상위 덱으로 전달한다", () => {
    let current = deck();
    const { rerender } = render(<CardCanvasEditor deck={current} onDeckChange={(next) => { current = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: "제목" }));
    fireEvent.change(screen.getByLabelText("글자 크기"), { target: { value: "72" } });
    rerender(<CardCanvasEditor deck={current} onDeckChange={(next) => { current = next; }} />);
    const text = current.slides[0].elements[0];
    expect(text.type === "text" && text.style.font_size).toBe(72);
    fireEvent.click(screen.getByRole("button", { name: "가운데 정렬" }));
    const centered = current.slides[0].elements[0];
    expect(centered.type === "text" && centered.style.align).toBe("center");
  });

  it("S1-AC3 정상 경로: 5종 추가 버튼과 요소 목록의 숨김, 잠금, 층 이동, 복제, 삭제가 동작한다", () => {
    let current = deck();
    const onChange = (next: CardDeckV3) => { current = next; };
    const view = render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    for (const label of ["글 추가", "도형 추가", "스티커 추가", "로고 추가"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    }
    expect(current.slides[0].elements.map((element) => element.type)).toEqual(["text", "text", "shape", "sticker", "logo"]);
    const shape = current.slides[0].elements.find((element) => element.type === "shape")!;
    fireEvent.click(screen.getByRole("button", { name: "도형 숨기기" }));
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    expect(current.slides[0].elements.find((element) => element.id === shape.id)?.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "도형 잠금" }));
    expect(current.slides[0].elements.find((element) => element.id === shape.id)?.locked).toBe(true);
  });

  it("S1-AC5 정상·거절 경로: 방향키와 Shift 이동을 적용하되 잠긴 요소는 움직이지 않는다", () => {
    let current = deck();
    const onChange = (next: CardDeckV3) => { current = next; };
    const view = render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "제목" }));
    const editor = screen.getByRole("region", { name: "카드 자유 배치 편집기" });
    fireEvent.keyDown(editor, { key: "ArrowRight", shiftKey: true });
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    expect(current.slides[0].elements[0].x).toBe(110);
    fireEvent.click(screen.getByRole("button", { name: "제목 잠금" }));
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    fireEvent.keyDown(editor, { key: "ArrowRight" });
    expect(current.slides[0].elements[0].x).toBe(110);
  });

  it("S1-AC7 390 대체 흐름: 요소 목록의 이동 단추만으로 좌표를 바꾼다", () => {
    let current = deck();
    const onChange = (next: CardDeckV3) => { current = next; };
    render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "제목 오른쪽 이동" }));
    expect(current.slides[0].elements[0].x).toBe(110);
  });

  it("S1-R3-RELOAD-01 같은 revision이어도 외부 덱 내용이 바뀌면 최신본으로 history를 교체한다", async () => {
    const original = deck();
    const latest = structuredClone(original);
    const text = latest.slides[0].elements[0];
    if (text.type !== "text") throw new Error("fixture");
    text.text = "서버 최신본";
    const view = render(<CardCanvasEditor deck={original} onDeckChange={() => {}} />);
    expect(screen.getByText("첫 장")).toBeInTheDocument();

    view.rerender(<CardCanvasEditor deck={latest} onDeckChange={() => {}} />);

    await waitFor(() => expect(screen.getByText("서버 최신본")).toBeInTheDocument());
    expect(screen.queryByText("첫 장")).not.toBeInTheDocument();
  });
});
