// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditRoom } from "@/components/studio/StudioRooms";

// v70 일반 카드 편집실 계약. 말풍선 덱 전용 CardDeckPanel과 구분하며, 일반 카드는
// 112px 스트립, 520px 무대, 실제 값이 보이는 카드 문구 입력 목록을 한 셸에서 쓴다.

afterEach(() => cleanup());

describe("편집실 목차 칸의 카드 목록", () => {
  it("OUTLINE-01 정상: 목록에서 눌러 바로 그 장으로 간다", () => {
    render(<EditRoom lines={["첫 장", "둘째 장", "셋째 장"]} onLinesChange={vi.fn()} kind="card" />);

    const outline = document.querySelector("[data-plain-card-strip]")!;
    expect(outline.querySelectorAll("[data-card-thumbnail]")).toHaveLength(3);
    expect(outline.querySelector('[data-card-thumbnail="0"]')).toHaveAttribute("aria-current", "true");

    fireEvent.click(outline.querySelector('[data-card-thumbnail="2"]')!);

    expect(outline.querySelector('[data-card-thumbnail="2"]')).toHaveAttribute("aria-current", "true");
    expect(outline.querySelector('[data-card-thumbnail="0"]')).toHaveAttribute("aria-current", "false");
    // 화살표를 여러 번 누르지 않고 한 번에 갔다.
    expect(screen.getByRole("textbox", { name: "카드 3 글자" })).toHaveValue("셋째 장");
  });

  it("OUTLINE-02 정상: 목록에서 순서를 바꾸면 실제 줄 순서가 바뀐다", () => {
    const onLinesChange = vi.fn();
    render(<EditRoom lines={["첫 장", "둘째 장", "셋째 장"]} onLinesChange={onLinesChange} kind="card" />);

    fireEvent.click(document.querySelector('[data-line-up="1"]')!);

    expect(onLinesChange).toHaveBeenLastCalledWith(["둘째 장", "첫 장", "셋째 장"]);
  });

  it("OUTLINE-02b 정상: 모든 카드 문구 입력칸에 현재 값이 보인다", () => {
    render(<EditRoom lines={["첫 장", "둘째 장", "셋째 장"]} onLinesChange={vi.fn()} kind="card" />);

    expect(screen.getByRole("textbox", { name: "문구 1" })).toHaveValue("첫 장");
    expect(screen.getByRole("textbox", { name: "문구 2" })).toHaveValue("둘째 장");
    expect(screen.getByRole("textbox", { name: "문구 3" })).toHaveValue("셋째 장");
  });

  it("OUTLINE-03 정상: 추가와 빼기가 장 상태에 반영된다", () => {
    const onLinesChange = vi.fn();
    render(
      <EditRoom
        lines={["첫 장", "둘째 장"]}
        onLinesChange={onLinesChange}
        kind="card"
      />,
    );

    expect(document.querySelectorAll("[data-script-line]")).toHaveLength(2);
    fireEvent.click(document.querySelector("[data-line-add]")!);
    expect(onLinesChange).toHaveBeenLastCalledWith(["첫 장", "둘째 장", ""]);
    fireEvent.click(screen.getAllByRole("button", { name: "빼기" })[0]);
    expect(document.querySelector('[data-script-line="1"]')).toHaveClass("opacity-60");
  });

  it("OUTLINE-04 정상: 한 장뿐이어도 문구 입력과 미리보기를 유지한다", () => {
    const onLinesChange = vi.fn();
    render(<EditRoom lines={["하나뿐인 장"]} onLinesChange={onLinesChange} kind="card" />);
    expect(screen.getByRole("textbox", { name: "문구 1" })).toHaveValue("하나뿐인 장");
    expect(document.querySelectorAll("[data-card-thumbnail]")).toHaveLength(1);
  });

  it("OUTLINE-05 정상: 카드 비율 선택기는 한 벌만 보인다", () => {
    render(<EditRoom lines={["첫 장", "가운데 장", "끝 장"]} onLinesChange={vi.fn()} kind="card" />);
    expect(screen.getAllByRole("group", { name: "콘텐츠 크기 고르기" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "세로 카드 4:5" })).toBeInTheDocument();
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

    const outline = document.querySelector("[data-plain-card-strip]")!;
    expect(outline.querySelector('[data-card-thumbnail="0"] img')).toHaveAttribute("src", "https://example.test/card-1.png");
    expect(outline.querySelector('[data-card-thumbnail="1"] img')).toHaveAttribute("src", "https://example.test/card-2.png");
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
