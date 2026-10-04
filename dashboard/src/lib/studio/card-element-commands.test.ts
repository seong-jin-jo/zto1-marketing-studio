import { describe, expect, it } from "vitest";
import type { CardDeckV3 } from "./card-element-contract";
import {
  addCardElement,
  commitCardCommand,
  createCardCommandHistory,
  createPlainCardDeckV3,
  deleteCardElement,
  duplicateCardElement,
  moveCardElement,
  moveCardElementLayer,
  nudgeCardElement,
  patchTextElement,
  redoCardCommand,
  resizeCardElement,
  rotateCardElement,
  setCardElementGeometry,
  snapCardElementPosition,
  plainCardDeckV3EntryBlockReason,
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
  it("S1-R4-MIGRATION-01 변환 전후 editLines와 9칸 위치를 손실 없이 보존한다", () => {
    const lines = ["첫 장 원문", "둘째 장 원문", "마지막 장 원문"];
    const converted = createPlainCardDeckV3(lines, ["top-left", "center", "bottom-right"], "deck_migration");
    expect(converted.slides.map((slide) => slide.base.kind === "plain" ? slide.base.lines[0] : "")).toEqual(lines);
    expect(converted.slides.map((slide) => slide.elements[0])).toMatchObject([
      { x: 60, y: 50, style: { align: "left", vertical_align: "top" } },
      { x: 120, y: 425, style: { align: "center", vertical_align: "middle" } },
      { x: 180, y: 800, style: { align: "right", vertical_align: "bottom" } },
    ]);
  });

  it("S1-R4-MIGRATION-01 상한 초과·2장 미만·빈 장·2천자 초과는 자르거나 지어내지 않고 진입을 막는다", () => {
    expect(plainCardDeckV3EntryBlockReason(Array.from({ length: 12 }, (_, index) => `${index + 1}장`))).toContain("최대 11장");
    expect(plainCardDeckV3EntryBlockReason(["한 장"])).toContain("2장 이상");
    expect(plainCardDeckV3EntryBlockReason(["첫 장", " "])).toContain("2번 카드");
    expect(plainCardDeckV3EntryBlockReason(["첫 장", "가".repeat(2_001)])).toContain("2,000자");
    expect(() => createPlainCardDeckV3(["한 장"], [], "deck_rejected")).toThrow(RangeError);
  });
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

  it("S1-R3-BOUNDS-01 끌기와 방향키 이동 뒤에도 장과 최소 1px 교차한다", () => {
    const added = addCardElement(deck(), "slide_cover", "text", { id: "bounded" });
    const moved = moveCardElement(added, "slide_cover", "bounded", -9_000, 9_000);
    expect(moved.slides[0].elements[0]).toMatchObject({ x: -599, y: 1349 });
    const nudged = nudgeCardElement(moved, "slide_cover", "bounded", -100, 100);
    expect(nudged.slides[0].elements[0]).toMatchObject({ x: -599, y: 1349 });
  });

  it("S1-R3-NUMBER-01 숫자 대체 조작은 빈 값·최솟값·각도 범위를 계약 안으로 접는다", () => {
    const added = addCardElement(deck(), "slide_cover", "text", { id: "numeric" });
    const changed = setCardElementGeometry(added, "slide_cover", "numeric", { width: 0, height: Number.NaN, rotation: 540 });
    expect(changed.slides[0].elements[0]).toMatchObject({ width: 4, height: 180, rotation: -180 });
  });

  it("S1-R4-NUMERIC-PRECISION-01 글자 크기·각도·너비·높이를 소수 셋째 자리로 반올림한다", () => {
    const added = addCardElement(deck(), "slide_cover", "text", { id: "precise" });
    const textPatched = patchTextElement(added, "slide_cover", "precise", { style: { font_size: 72.1239 } });
    const geometryPatched = setCardElementGeometry(textPatched, "slide_cover", "precise", { width: 601.2349, height: 181.2349, rotation: 17.1239 });
    expect(geometryPatched.slides[0].elements[0]).toMatchObject({
      width: 601.235,
      height: 181.235,
      rotation: 17.124,
      style: { font_size: 72.124 },
    });
  });
});
