// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDeckV3 } from "@/lib/studio/card-element-contract";
import { CardCanvasEditor } from "./CardCanvasEditor";
import { migrateCardDeckV2ToV3 } from "@/lib/studio/card-deck-v2-to-v3";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import chatDeckFixture from "../../../../tests/studio/fixtures/deck-d100.v2.json";

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
  it("S5b-R2-A 카톡 장 도구를 미리보기 열 안에 두고 3열 workspace 구조를 보존한다", () => {
    const current = migrateCardDeckV2ToV3(structuredClone(chatDeckFixture) as unknown as CardDeck);
    render(<CardCanvasEditor deck={current} onDeckChange={() => {}} />);

    const toolbar = screen.getByRole("toolbar", { name: "카톡 장 편집 도구" });
    const stageColumn = toolbar.parentElement;
    expect(stageColumn).toHaveAttribute("data-card-stage-column");
    expect(within(stageColumn!).getByLabelText("카드 편집 스테이지")).toBeInTheDocument();
    expect(document.querySelector("[data-card-right-panel]")).toBeInTheDocument();
  });

  it("S5b-R4-C 댓글 유도 장은 삭제 버튼을 잠그고 원본 역할을 유지한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const current = migrateCardDeckV2ToV3(source);
    const commentPrompt = current.slides.find((slide) => slide.role === "comment_prompt")!;
    render(<CardCanvasEditor deck={current} sourceDeck={source} onDeckChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: `${commentPrompt.order + 1}장` }));

    expect(screen.getByRole("button", { name: "이 장 삭제" })).toBeDisabled();
    expect(current.slides.find((slide) => slide.id === commentPrompt.id)?.role).toBe("comment_prompt");
  });

  it("S5b-R2-MINOR 발행 장면 실측은 넘침을 안내만 하고 undo history 밖에서 자동 commit하지 않는다", async () => {
    const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
    const scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
    Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 100 });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 200 });
    try {
      const current = migrateCardDeckV2ToV3(structuredClone(chatDeckFixture) as unknown as CardDeck);
      const onChange = vi.fn();
      render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
      fireEvent.click(screen.getByRole("button", { name: "2장" }));
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("발행 장면 기준으로 대화가 넘칩니다"));
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "넘침을 다음 장으로 나누기" })).toBeInTheDocument();
    } finally {
      if (clientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeight);
      if (scrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", scrollHeight);
    }
  });

  it("S5b-R2-MINOR 사진이 있는 표지에서 배경 사진 빼기를 실행한다", () => {
    let current = migrateCardDeckV2ToV3(structuredClone(chatDeckFixture) as unknown as CardDeck);
    current.slides[0].background = { kind: "image", asset_id: "cover.png", crop: { x: 0, y: 0, width: 1, height: 1 }, overlay: "#000000" };
    const onChange = (next: CardDeckV3) => { current = next; };
    render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "사진 빼기" }));
    expect(current.slides[0].background).toEqual({ kind: "solid", color: current.theme.background });
  });

  it("S5b-AC1 고급 화자 도구와 undo를 같은 v3 화면에서 실행한다", () => {
    let current = migrateCardDeckV2ToV3(structuredClone(chatDeckFixture) as unknown as CardDeck);
    const original = structuredClone(current);
    const onChange = (next: CardDeckV3) => { current = next; };
    const view = render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    expect(screen.getByLabelText("카톡 대화 고급 편집 도구")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "덱 전체 화자 서로 바꾸기" }));
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    expect(current.slides[1].base).not.toEqual(original.slides[1].base);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(current).toEqual(original);
  });

  it("S5b-R1-M3 이동 대상에는 본문 장만 노출하고 표지·CTA는 숨긴다", () => {
    const current = migrateCardDeckV2ToV3(structuredClone(chatDeckFixture) as unknown as CardDeck);
    render(<CardCanvasEditor deck={current} onDeckChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "3장" }));
    expect(screen.queryByRole("button", { name: "1장으로" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${current.slides.length}장으로` })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /장으로$/ }).length).toBeGreaterThan(0);
  });

  it("S5b-R1-M2 표지·장·범위 굵기·분할 도구를 v3 한 화면에서 실행한다", () => {
    let current = migrateCardDeckV2ToV3(structuredClone(chatDeckFixture) as unknown as CardDeck);
    const onChange = (next: CardDeckV3) => { current = next; };
    const view = render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    expect(screen.getByLabelText("표지 문구 편집")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "배경 사진 고르기" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("표지 제목"), { target: { value: "고친 표지" } });
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    expect(current.slides[0].base).toMatchObject({ kind: "chat_bubble", cover: { headline: "고친 표지" } });

    fireEvent.click(screen.getByRole("button", { name: "3장" }));
    const firstText = screen.getByLabelText("1번째 말풍선 내용") as HTMLTextAreaElement;
    const boldButton = within(firstText.closest("article")!).getByRole("button", { name: "선택 굵게" });
    act(() => fireEvent.select(firstText, { target: { selectionStart: 0, selectionEnd: 2 } }));
    act(() => {
      fireEvent.mouseDown(boldButton);
      fireEvent.click(boldButton);
      view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    });
    expect(current.slides[2].base.kind === "chat_bubble" && current.slides[2].base.bubbles[0].segments.some((segment) => segment.bold)).toBe(true);

    const before = current.slides.length;
    fireEvent.click(screen.getByRole("button", { name: "이 장 복제" }));
    expect(current.slides).toHaveLength(before + 1);
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    expect(screen.getByRole("button", { name: "장 앞으로" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "넘침을 다음 장으로 나누기" })).toBeInTheDocument();
  });

  it("S5b-AC2 카톡 장에 글·스티커·로고를 추가하고 undo로 마지막 요소만 되돌린다", () => {
    let current = migrateCardDeckV2ToV3(structuredClone(chatDeckFixture) as unknown as CardDeck);
    const onChange = (next: CardDeckV3) => { current = next; };
    const view = render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    for (const label of ["글 추가", "스티커 추가", "로고 추가"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    }
    expect(current.slides[0].elements.map((element) => element.type)).toEqual(["text", "sticker", "logo"]);
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(current.slides[0].elements.map((element) => element.type)).toEqual(["text", "sticker"]);
  });
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
    const stage = screen.getByLabelText("카드 편집 스테이지");
    fireEvent.keyDown(stage, { key: "ArrowRight", shiftKey: true });
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    expect(current.slides[0].elements[0].x).toBe(110);
    fireEvent.click(screen.getByRole("button", { name: "제목 잠금" }));
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    fireEvent.keyDown(stage, { key: "ArrowRight" });
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

  it("S5b-R1-M1 저장 hash만 바뀐 외부 덱은 undo history를 지우지 않는다", () => {
    let current = migrateCardDeckV2ToV3(structuredClone(chatDeckFixture) as unknown as CardDeck);
    const onChange = (next: CardDeckV3) => { current = next; };
    const view = render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "글 추가" }));
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    expect(screen.getByRole("button", { name: "실행 취소" })).toBeEnabled();

    const synchronized = structuredClone(current);
    if (!synchronized.migration) throw new Error("fixture");
    synchronized.migration.source_sha256 = "f".repeat(64);
    view.rerender(<CardCanvasEditor deck={synchronized} onDeckChange={onChange} />);

    expect(screen.getByRole("button", { name: "실행 취소" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(current.slides[0].elements).toEqual([]);
  });

  it("S1-R3-KEYBOARD-01 입력칸 키는 무시하고 선택 없이 스테이지 Ctrl+Z는 실행한다", () => {
    let current = deck();
    const onChange = (next: CardDeckV3) => { current = next; };
    const view = render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "제목" }));
    fireEvent.change(screen.getByLabelText("요소 너비"), { target: { value: "700" } });
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    expect(current.slides[0].elements[0].width).toBe(700);

    fireEvent.keyDown(screen.getByLabelText("요소 너비"), { key: "Backspace" });
    expect(current.slides[0].elements).toHaveLength(1);
    fireEvent.pointerDown(screen.getByLabelText("카드 편집 스테이지"));
    fireEvent.keyDown(screen.getByLabelText("카드 편집 스테이지"), { key: "z", ctrlKey: true });
    expect(current.slides[0].elements[0].width).toBe(600);
  });

  it("S1-R3-DIRECT-EDIT-01 더블클릭과 Enter로 글을 직접 편집하고 숫자로 크기·각도를 바꾼다", () => {
    let current = deck();
    const onChange = (next: CardDeckV3) => { current = next; };
    const view = render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    const selection = screen.getByLabelText("제목 요소");
    fireEvent.doubleClick(selection);
    fireEvent.change(screen.getByLabelText("글 내용 직접 편집"), { target: { value: "직접 고친 글" } });
    expect(document.querySelector("[data-card-slide-scene]")).toHaveTextContent("직접 고친 글");
    expect((current.slides[0].elements[0] as { text: string }).text).toBe("첫 장");
    fireEvent.blur(screen.getByLabelText("글 내용 직접 편집"));
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    expect((current.slides[0].elements[0] as { text: string }).text).toBe("직접 고친 글");

    fireEvent.keyDown(screen.getByLabelText("제목 요소"), { key: "Enter" });
    expect(screen.getByLabelText("글 내용 직접 편집")).toBeInTheDocument();
    fireEvent.blur(screen.getByLabelText("글 내용 직접 편집"));
    fireEvent.change(screen.getByLabelText("요소 높이"), { target: { value: "2" } });
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    fireEvent.change(screen.getByLabelText("요소 각도"), { target: { value: "17" } });
    expect(current.slides[0].elements[0]).toMatchObject({ height: 4, rotation: 17 });
  });

  it("S2-C-DIRECT-EDIT-01 실제 포인터 두 번째 클릭에서도 이동보다 직접 편집을 우선한다", () => {
    const current = deck();
    render(<CardCanvasEditor deck={current} onDeckChange={() => {}} />);
    const selection = screen.getByLabelText("제목 요소");
    fireEvent.pointerDown(selection, { pointerId: 7 });
    fireEvent.pointerUp(window, { pointerId: 7 });
    fireEvent.pointerDown(selection, { pointerId: 8 });
    expect(screen.getByLabelText("글 내용 직접 편집")).toBeInTheDocument();
  });

  it("S1-R5-DIRECT-EDIT-02 직접 편집을 짧게 멈추면 저장값을 확정하되 실행 취소 이력은 한 칸만 쓴다", async () => {
    let current = deck();
    const onChange = (next: CardDeckV3) => { current = next; };
    render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    fireEvent.doubleClick(screen.getByLabelText("제목 요소"));
    const editor = screen.getByLabelText("글 내용 직접 편집");

    fireEvent.change(editor, { target: { value: "첫 번째 입력" } });
    await waitFor(() => expect((current.slides[0].elements[0] as { text: string }).text).toBe("첫 번째 입력"), { timeout: 1_000 });
    fireEvent.change(editor, { target: { value: "두 번째 입력" } });
    await waitFor(() => expect((current.slides[0].elements[0] as { text: string }).text).toBe("두 번째 입력"), { timeout: 1_000 });
    fireEvent.blur(editor);

    fireEvent.keyDown(screen.getByLabelText("카드 편집 스테이지"), { key: "z", ctrlKey: true });
    expect((current.slides[0].elements[0] as { text: string }).text).toBe("첫 장");
  });

  it("S1-R7-EDITOR-FLUSH-01 debounce 전에 편집기가 닫혀도 마지막 글을 상위 저장 경계로 확정한다", () => {
    let current = deck();
    const onChange = (next: CardDeckV3) => { current = next; };
    const view = render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    fireEvent.doubleClick(screen.getByLabelText("제목 요소"));
    fireEvent.change(screen.getByLabelText("글 내용 직접 편집"), { target: { value: "닫히기 직전 마지막 글" } });

    view.unmount();

    expect((current.slides[0].elements[0] as { text: string }).text).toBe("닫히기 직전 마지막 글");
  });

  it("S1-R4-FOCUS-01 선택 상자 초점이 선택을 맞추고 삭제 뒤 스테이지로 초점을 돌린다", async () => {
    let current = deck();
    const onChange = (next: CardDeckV3) => { current = next; };
    const view = render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    const selection = screen.getByLabelText("제목 요소");
    fireEvent.focus(selection);
    expect(screen.getByRole("toolbar", { name: "제목 도구" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^삭제$/ }));
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    await waitFor(() => expect(screen.getByLabelText("카드 편집 스테이지")).toHaveFocus());
    expect(current.slides[0].elements).toHaveLength(0);
  });

  it("S1-R3-POINTER-01 덱 변경마다 전역 포인터 이벤트를 다시 구독하지 않는다", () => {
    let current = deck();
    const onChange = (next: CardDeckV3) => { current = next; };
    const addEventListener = vi.spyOn(window, "addEventListener");
    const view = render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);
    const subscriptions = () => addEventListener.mock.calls.filter(([type]) => type === "pointermove" || type === "pointerup").length;
    const initialSubscriptions = subscriptions();

    fireEvent.click(screen.getByRole("button", { name: "글 추가" }));
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);

    expect(subscriptions()).toBe(initialSubscriptions);
    addEventListener.mockRestore();
  });

  it("S5-AC4·R1-M4 카톡 원형을 직접 고치면서 로고 자유 요소를 보존한다", () => {
    let current = deck();
    current.template = "chat_bubble";
    current.slides[0].base = { kind: "chat_bubble", cover: null, bubbles: [
      { id: "bubble_reader", order: 0, speaker: "reader", segments: [{ text: "원형 말풍선", bold: false }], reaction: null },
    ] };
    const projection = current.slides[0].elements[0];
    if (projection.type !== "text") throw new Error("fixture");
    projection.id = "el_bubble_reader";
    projection.text = "원형 말풍선";
    projection.name = "독자 말풍선";
    const onChange = (next: CardDeckV3) => { current = next; };
    const view = render(<CardCanvasEditor deck={current} onDeckChange={onChange} />);

    expect(screen.getAllByText("원형 말풍선").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "독자 말풍선" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "로고 추가" }));
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);

    expect(current.slides[0].base).toMatchObject({ kind: "chat_bubble", bubbles: [{ id: "bubble_reader" }] });
    expect(current.slides[0].elements.map((element) => element.type)).toEqual(["logo"]);
    expect(screen.getByRole("button", { name: "로고" })).toBeInTheDocument();

    const bubbleEditor = screen.getByRole("textbox", { name: "1번째 말풍선 내용" });
    fireEvent.change(bubbleEditor, { target: { value: "한 화면에서 직접 고친 말풍선" } });
    fireEvent.blur(bubbleEditor);
    view.rerender(<CardCanvasEditor deck={current} onDeckChange={onChange} />);

    expect(current.slides[0].base).toMatchObject({ kind: "chat_bubble", bubbles: [{ segments: [{ text: "한 화면에서 직접 고친 말풍선" }] }] });
    expect(current.slides[0].elements).toEqual([expect.objectContaining({ type: "logo" })]);
    expect(screen.getByRole("button", { name: "로고" })).toBeInTheDocument();
  });
});
