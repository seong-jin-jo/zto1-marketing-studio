import { describe, expect, it } from "vitest";
import type { CardDeckV3 } from "./card-element-contract";
import {
  addCardElement,
  commitCardCommand,
  createCardCommandHistory,
  deleteCardElement,
  duplicateCardElement,
  moveCardElement,
  moveCardElementLayer,
  nudgeCardElement,
  redoCardCommand,
  resizeCardElement,
  rotateCardElement,
  snapCardElementPosition,
  toggleCardElementFlag,
  undoCardCommand,
} from "./card-element-commands";

function deck(): CardDeckV3 {
  return {
    contract_version: "3.0", id: "deck_commands", template: "plain", ratio: "4:5", revision: 0,
    theme: { background: "#FFF9F0", foreground: "#111111", accent: "#2563EB" },
    brand: { display_name: "OSMU", handle: null }, hook_type: "pain",
    cta: { keyword: "정리본", comment_example: "정리본을 남겨 주세요", save_reason: "나중에 다시 확인하세요" },
    slides: [
      { id: "slide_cover", order: 0, role: "cover", content_state: "filled", background: { kind: "solid", color: "#FFF9F0" }, base: { kind: "plain", lines: ["첫 장"] }, elements: [] },
      { id: "slide_cta", order: 1, role: "cta", content_state: "filled", background: { kind: "solid", color: "#111111" }, base: { kind: "plain", lines: ["저장"] }, elements: [] },
    ],
  };
}

describe("T-CARD-OPS 카드 자유 배치 순수 명령", () => {
  it("S1-AC1 정상 경로: 추가, 이동, 크기, 15도 회전이 원본을 바꾸지 않고 한 단계씩 기록된다", () => {
    const original = deck();
    const added = addCardElement(original, "slide_cover", "text", { id: "el_text" });
    const moved = moveCardElement(added, "slide_cover", "el_text", 101.1254, 202.5555);
    const resized = resizeCardElement(moved, "slide_cover", "el_text", "se", 99, 20);
    const rotated = rotateCardElement(resized, "slide_cover", "el_text", 17);
    const element = rotated.slides[0].elements[0];
    expect(original.slides[0].elements).toHaveLength(0);
    expect(element).toMatchObject({ x: 101.125, y: 202.556, width: 699, height: 200, rotation: 15 });
    expect(rotated.revision).toBe(4);
  });

  it("S1-AC4 정상·경계 경로: 가운데선과 다른 요소의 선을 4px 안에서 붙인다", () => {
    const withText = addCardElement(deck(), "slide_cover", "text", { id: "moving" });
    const moving = withText.slides[0].elements[0];
    const center = snapCardElementPosition(moving, 243, 360, [moving], "4:5");
    expect(center.x).toBe(240);
    expect(center.guides).toContainEqual({ axis: "x", value: 540, source: "stage" });

    const sibling = { ...moving, id: "sibling", x: 100, y: 900 };
    const other = snapCardElementPosition(moving, 103, 360, [moving, sibling], "4:5");
    expect(other.x).toBe(100);
    expect(other.guides).toContainEqual({ axis: "x", value: 100, source: "element" });
  });

  it("S1-AC5 정상 경로: 키보드 이동, 복제, 삭제, undo와 redo가 같은 덱을 복원한다", () => {
    const first = addCardElement(deck(), "slide_cover", "shape", { id: "shape_a" });
    const nudged = nudgeCardElement(first, "slide_cover", "shape_a", 10, -1);
    const duplicated = duplicateCardElement(nudged, "slide_cover", "shape_a", "shape_b");
    const reordered = moveCardElementLayer(duplicated, "slide_cover", "shape_a", "front");
    const hidden = toggleCardElementFlag(reordered, "slide_cover", "shape_b", "hidden");
    const deleted = deleteCardElement(hidden, "slide_cover", "shape_a");
    let history = createCardCommandHistory(first);
    history = commitCardCommand(history, deleted);
    history = undoCardCommand(history);
    expect(history.present).toEqual(first);
    history = redoCardCommand(history);
    expect(history.present).toEqual(deleted);
    expect(history.present.slides[0].elements).toMatchObject([{ id: "shape_b", hidden: true, z_index: 0 }]);
  });

  it("S1-AC1 거절 경로: 없는 장이나 요소 명령은 내용을 바꾸지 않는다", () => {
    const original = deck();
    expect(moveCardElement(original, "missing", "missing", 1, 1)).toEqual(original);
    expect(deleteCardElement(original, "slide_cover", "missing").slides[0].elements).toHaveLength(0);
  });
});
