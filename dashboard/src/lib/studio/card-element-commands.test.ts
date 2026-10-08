import { describe, expect, it } from "vitest";
import type { CardDeckV3 } from "./card-element-contract";
import {
  addCardElement,
  applyGeneratedImageBackground,
  addChatOverlayElement,
  addChatBubble,
  addChatSlide,
  clearChatSlideBackgroundImage,
  commitCardCommand,
  createCardCommandHistory,
  createRecoverableEmbeddedCardDeckV3,
  createPlainCardDeckV3,
  deleteCardElement,
  deleteChatBubble,
  deleteChatSlide,
  duplicateCardElement,
  duplicateChatSlide,
  moveCardElement,
  moveCardElementLayer,
  moveChatBubble,
  moveChatBubbleToSlide,
  moveChatSlide,
  nudgeCardElement,
  patchTextElement,
  patchChatBubbleText,
  patchChatDeckBrand,
  redoCardCommand,
  resizeCardElement,
  rotateCardElement,
  setCardElementGeometry,
  snapCardElementPosition,
  swapChatSpeakers,
  setChatSlideBackgroundImage,
  splitChatSlideAtBubble,
  splitChatSlideAtBubbleOffset,
  plainCardDeckV3EntryBlockReason,
  toggleChatBubbleBold,
  toggleChatBubbleBoldRange,
  toggleCardElementFlag,
  undoCardCommand,
} from "./card-element-commands";

describe("CH-20261009 생성 이미지 카드 편집 연결", () => {
  it("CH-20261009-1 모든 카드에 실제 생성 이미지 파일을 바탕으로 연결한다", () => {
    const connected = applyGeneratedImageBackground(createPlainCardDeckV3(["첫 장", "둘째 장"]), "generated-card.jpg");
    expect(connected.slides.every((slide) => slide.background.kind === "image" && slide.background.asset_id === "generated-card.jpg")).toBe(true);
    expect(connected.slides.flatMap((slide) => slide.elements).filter((element) => element.type === "text").every((element) => element.style.color === "#FFFFFF")).toBe(true);
  });

  it("CH-20261009-2 빈 이미지 파일명은 카드 바탕으로 허용하지 않는다", () => {
    expect(() => applyGeneratedImageBackground(createPlainCardDeckV3(["첫 장", "둘째 장"]), "  ")).toThrow("비어 있습니다");
  });
});

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

function expectRotatedElementInsideCanvas(element: CardDeckV3["slides"][number]["elements"][number], ratio: CardDeckV3["ratio"]) {
  const radians = element.rotation * Math.PI / 180;
  const boundsWidth = Math.abs(element.width * Math.cos(radians)) + Math.abs(element.height * Math.sin(radians));
  const boundsHeight = Math.abs(element.width * Math.sin(radians)) + Math.abs(element.height * Math.cos(radians));
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const logicalHeight = ratio === "4:5" ? 1350 : 1080;
  expect(centerX - boundsWidth / 2).toBeGreaterThanOrEqual(-0.001);
  expect(centerY - boundsHeight / 2).toBeGreaterThanOrEqual(-0.001);
  expect(centerX + boundsWidth / 2).toBeLessThanOrEqual(1080.001);
  expect(centerY + boundsHeight / 2).toBeLessThanOrEqual(logicalHeight + 0.001);
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

  it("S2-A 복구 가능한 AI 카드는 글자를 지운 배경 사진과 복원된 글을 별도 요소로 만든다", () => {
    const converted = createRecoverableEmbeddedCardDeckV3(
      ["첫 장 원문", "저장하세요"],
      ["top-left", "bottom-right"],
      [{ assetId: "background-1.png", alt: "첫 장 글자 없는 바탕" }, { assetId: "background-2.png", alt: "둘째 장 글자 없는 바탕" }],
      "deck_embedded_recovery",
    );
    expect(converted.slides.map((slide) => slide.elements.map((element) => element.type))).toEqual([
      ["image", "text"],
      ["image", "text"],
    ]);
    expect(converted.slides[0].elements[0]).toMatchObject({ asset_id: "background-1.png", x: 0, y: 0, width: 1080, height: 1350, locked: true, z_index: 0 });
    expect(converted.slides[0].elements[1]).toMatchObject({ text: "첫 장 원문", z_index: 1 });
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

  it("S5b-AC1 말풍선 직접 편집은 base를 바꾸고 옛 projection을 정리한다", () => {
    const chat = deck();
    chat.template = "chat_bubble";
    chat.slides[0].base = {
      kind: "chat_bubble",
      cover: null,
      bubbles: [{ id: "bubble_reader", order: 0, speaker: "reader", segments: [{ text: "원문", bold: true }], reaction: null }],
    };
    chat.slides[0].elements = [{
      id: "el_bubble_reader", type: "text", name: "독자 말풍선", x: 0, y: 0, width: 100, height: 100,
      rotation: 0, z_index: 0, opacity: 1, locked: false, hidden: false, text: "원문",
      style: { font_family: "Pretendard Variable", font_size: 32, font_weight: 700, line_height: 1.2, letter_spacing: 0, color: "#111111", align: "left", vertical_align: "middle" },
    }];

    const changed = patchChatBubbleText(chat, "slide_cover", "bubble_reader", "직접 고친 말풍선");
    expect(changed.revision).toBe(chat.revision + 1);
    expect(changed.slides[0].base).toMatchObject({ kind: "chat_bubble", bubbles: [{ segments: [{ text: "직접 고친 말풍선", bold: true }] }] });
    expect(changed.slides[0].elements).toEqual([]);
    expect(() => patchChatBubbleText(changed, "slide_cover", "bubble_reader", " ")).toThrow("CARD_CHAT_BUBBLE_TEXT_REQUIRED");
  });

  it("S5b-AC1 고급 도구는 순서·화자·굵기·추가·삭제를 한 덱에서 보존한다", () => {
    const chat = deck();
    chat.template = "chat_bubble";
    chat.slides[0].base = {
      kind: "chat_bubble", cover: null,
      bubbles: [
        { id: "bubble_a", order: 0, speaker: "brand", segments: [{ text: "첫째", bold: false }], reaction: null },
        { id: "bubble_b", order: 1, speaker: "reader", segments: [{ text: "둘째", bold: false }], reaction: null },
      ],
    };
    const moved = moveChatBubble(chat, "slide_cover", "bubble_b", -1);
    const swapped = swapChatSpeakers(moved, "slide_cover");
    const bold = toggleChatBubbleBold(swapped, "slide_cover", "bubble_b");
    const added = addChatBubble(bold, "slide_cover", "bubble_c");
    const deleted = deleteChatBubble(added, "slide_cover", "bubble_a");
    const base = deleted.slides[0].base;
    if (base.kind !== "chat_bubble") throw new Error("fixture");
    expect(base.bubbles.map((bubble) => [bubble.id, bubble.order, bubble.speaker, bubble.segments.every((segment) => segment.bold)])).toEqual([
      ["bubble_b", 0, "brand", true],
      ["bubble_c", 1, "brand", false],
    ]);
  });

  it("S5b-R1-M3 말풍선은 본문 장으로만 이동하고 표지·CTA 이동은 거절한다", () => {
    const chat = deck();
    chat.template = "chat_bubble";
    chat.slides = [
      { ...chat.slides[0], base: { kind: "chat_bubble", cover: { headline: "표지", sub: null }, bubbles: [] } },
      {
        ...structuredClone(chat.slides[0]), id: "slide_body", order: 1, role: "body",
        base: {
          kind: "chat_bubble", cover: null,
          bubbles: [
            { id: "bubble_a", order: 0, speaker: "brand", segments: [{ text: "첫째", bold: false }], reaction: null },
            { id: "bubble_b", order: 1, speaker: "reader", segments: [{ text: "둘째", bold: false }], reaction: null },
          ],
        },
      },
      { ...chat.slides[1], order: 2, base: { kind: "chat_bubble", cover: null, bubbles: [] } },
    ];

    expect(() => moveChatBubbleToSlide(chat, "slide_body", "bubble_a", "slide_cover")).toThrow("OPS_BUBBLE_TARGET_LOCKED");
    expect(() => moveChatBubbleToSlide(chat, "slide_body", "bubble_a", "slide_cta")).toThrow("OPS_BUBBLE_TARGET_LOCKED");
    expect(chat.slides[1].base).toMatchObject({ kind: "chat_bubble", bubbles: [{ id: "bubble_a" }, { id: "bubble_b" }] });
  });

  it("S5b-R1-M2 v3 장 추가·복제·순서·삭제와 표지 사진을 원형·overlay 손실 없이 바꾼다", () => {
    const chat = deck();
    chat.template = "chat_bubble";
    chat.slides = [
      { ...chat.slides[0], base: { kind: "chat_bubble", cover: { headline: "표지", sub: null }, bubbles: [] } },
      { ...structuredClone(chat.slides[0]), id: "body_a", order: 1, role: "body", base: { kind: "chat_bubble", cover: null, bubbles: [{ id: "a", order: 0, speaker: "brand", segments: [{ text: "원문", bold: false }], reaction: null }] }, elements: [
        { ...createPlainCardDeckV3(["가", "나"], [], "seed").slides[0].elements[0], id: "overlay" },
        { ...createPlainCardDeckV3(["가", "나"], [], "legacy").slides[0].elements[0], id: "el_removed-bubble" },
      ] },
      { ...structuredClone(chat.slides[0]), id: "body_b", order: 2, role: "body", base: { kind: "chat_bubble", cover: null, bubbles: [{ id: "b", order: 0, speaker: "reader", segments: [{ text: "둘째", bold: false }], reaction: null }] } },
      { ...chat.slides[1], order: 3, base: { kind: "chat_bubble", cover: null, bubbles: [] } },
    ];
    const withPhoto = setChatSlideBackgroundImage(chat, "slide_cover", "cover.png");
    const added = addChatSlide(withPhoto, "body_a");
    const duplicated = duplicateChatSlide(added, "body_a");
    const moved = moveChatSlide(duplicated, duplicated.slides[2].id, 1);
    const padding = Array.from({ length: 3 }, (_, index) => ({ ...structuredClone(moved.slides[1]), id: `padding_${index}` }));
    const padded = { ...moved, slides: [...moved.slides.slice(0, -1), ...padding, moved.slides.at(-1)!].map((slide, order) => ({ ...slide, order })) };
    const deleted = deleteChatSlide(padded, moved.slides[2].id);
    expect(withPhoto.slides[0].background).toMatchObject({ kind: "image", asset_id: "cover.png" });
    const duplicatedSlide = duplicated.slides[2];
    expect(duplicatedSlide.elements).toHaveLength(1);
    expect(duplicatedSlide.elements[0].id).toContain("_el_");
    expect(duplicatedSlide.elements[0].id).not.toContain("removed-bubble");
    expect(deleted.slides.map((slide) => slide.order)).toEqual(deleted.slides.map((_, index) => index));
    expect(() => moveChatSlide(chat, "body_a", -1)).toThrow("OPS_SLIDE_LOCKED");
  });

  it("S5b-R2-MINOR 표지·마지막 사진을 빼고 본문에서는 사진 제거를 거절한다", () => {
    const chat = deck();
    chat.template = "chat_bubble";
    chat.slides = [
      { ...chat.slides[0], base: { kind: "chat_bubble", cover: { headline: "표지", sub: null }, bubbles: [] } },
      { ...structuredClone(chat.slides[0]), id: "body", order: 1, role: "body", base: { kind: "chat_bubble", cover: null, bubbles: [] } },
      { ...chat.slides[1], order: 2, base: { kind: "chat_bubble", cover: null, bubbles: [] } },
    ];
    const withCover = setChatSlideBackgroundImage(chat, "slide_cover", "cover.png");
    const withBoth = setChatSlideBackgroundImage(withCover, "slide_cta", "final.png");
    const cleared = clearChatSlideBackgroundImage(clearChatSlideBackgroundImage(withBoth, "slide_cover"), "slide_cta");
    expect(cleared.slides[0].background).toEqual({ kind: "solid", color: chat.theme.background });
    expect(cleared.slides[2].background).toEqual({ kind: "solid", color: chat.theme.background });
    expect(() => clearChatSlideBackgroundImage(withBoth, "body")).toThrow("OPS_NOT_COVER_OR_CTA_SLIDE");
  });

  it("S5b-R2-MINOR 새 덧붙임 요소는 카톡 머리글과 말풍선 원형을 피한 빈 영역에 놓인다", () => {
    const chat = deck();
    chat.template = "chat_bubble";
    chat.slides[0] = {
      ...chat.slides[0], role: "body", base: {
        kind: "chat_bubble", cover: null,
        bubbles: [{ id: "bubble_base", order: 0, speaker: "brand", segments: [{ text: "원형 말풍선", bold: false }], reaction: null }],
      },
    };
    const added = addChatOverlayElement(chat, "slide_cover", "logo", { id: "overlay-logo" });
    const overlay = added.slides[0].elements.find((element) => element.id === "overlay-logo")!;
    expect(overlay.y).toBeGreaterThanOrEqual(300);
  });

  it("S5b-R1-M2 범위 굵기·장 분할은 구조를 보존하고 두 번째 굵은 덩이를 거절한다", () => {
    const chat = deck();
    chat.template = "chat_bubble";
    chat.slides = Array.from({ length: 7 }, (_, index) => ({
      ...structuredClone(chat.slides[index === 0 ? 0 : 1]), id: `slide_${index}`, order: index,
      role: index === 0 ? "cover" as const : index === 6 ? "cta" as const : "body" as const,
      base: { kind: "chat_bubble" as const, cover: index === 0 ? { headline: "표지", sub: null } : null, bubbles: index === 1 ? [
        { id: "bubble_a", order: 0, speaker: "brand" as const, segments: [{ text: "첫째 문장", bold: false }], reaction: null },
        { id: "bubble_b", order: 1, speaker: "reader" as const, segments: [{ text: "둘째", bold: false }], reaction: null },
      ] : [] }, elements: [],
    }));
    const bold = toggleChatBubbleBoldRange(chat, "slide_1", "bubble_a", { from: 0, to: 2 });
    expect(bold.slides[1].base.kind === "chat_bubble" ? bold.slides[1].base.bubbles[0].segments : []).toEqual([{ text: "첫째", bold: true }, { text: " 문장", bold: false }]);
    expect(() => toggleChatBubbleBoldRange(bold, "slide_1", "bubble_b", { from: 0, to: 2 })).toThrow("OPS_BOLD_LIMIT");
    const split = splitChatSlideAtBubble(bold, "slide_1", 1);
    expect(split.slides).toHaveLength(8);
    expect(split.slides[1].base).toMatchObject({ kind: "chat_bubble", bubbles: [{ id: "bubble_a" }] });
    expect(split.slides[2].base).toMatchObject({ kind: "chat_bubble", bubbles: [{ id: "bubble_b" }] });
    const offsetSplit = splitChatSlideAtBubbleOffset(chat, "slide_1", 0, 2);
    expect(offsetSplit.slides[1].base.kind === "chat_bubble" ? offsetSplit.slides[1].base.bubbles[0].segments.map((segment) => segment.text).join("") : "").toBe("첫째");
    expect(offsetSplit.slides[2].base.kind === "chat_bubble" ? offsetSplit.slides[2].base.bubbles[0].segments.map((segment) => segment.text).join("") : "").toBe(" 문장");
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

  it("S4-E2E 빈 장 계약: 일반 장의 마지막 요소를 지우면 empty가 되고 새 요소를 넣으면 filled로 복구된다", () => {
    const withText = addCardElement(deck(), "slide_cover", "text", { id: "only_text" });
    const emptied = deleteCardElement(withText, "slide_cover", "only_text");
    expect(emptied.slides[0]).toMatchObject({ content_state: "empty", elements: [] });
    const restored = addCardElement(emptied, "slide_cover", "text", { id: "restored_text" });
    expect(restored.slides[0]).toMatchObject({ content_state: "filled" });
  });

  it("S1-AC1 거절 경로: 없는 장이나 요소 명령은 내용을 바꾸지 않는다", () => {
    const original = deck();
    expect(moveCardElement(original, "missing", "missing", 1, 1)).toEqual(original);
    expect(deleteCardElement(original, "slide_cover", "missing").slides[0].elements).toHaveLength(0);
  });

  it("S5-AC4 카톡 장에는 원형을 건드리지 않고 자유 요소를 덧붙이며 일반 장 요청은 거절한다", () => {
    const chat = deck();
    chat.template = "chat_bubble";
    chat.slides[0].base = { kind: "chat_bubble", cover: { headline: "첫 장", sub: null }, bubbles: [] };
    chat.slides[0].elements = [{
      id: "el_orphan-old", type: "text", name: "브랜드 말풍선", x: 0, y: 0, width: 100, height: 100,
      rotation: 0, z_index: 0, opacity: 1, locked: false, hidden: false, text: "옛 projection",
      style: { font_family: "Pretendard Variable", font_size: 32, font_weight: 500, line_height: 1.2, letter_spacing: 0, color: "#111111", align: "left", vertical_align: "middle" },
    }];
    const added = addChatOverlayElement(chat, "slide_cover", "logo", { id: "chat_logo" });
    expect(added.slides[0].base).toEqual(chat.slides[0].base);
    expect(added.slides[0].elements).toMatchObject([{ id: "chat_logo", type: "logo", z_index: 0 }]);
    expect(addChatOverlayElement(deck(), "slide_cover", "logo", { id: "rejected_logo" })).toEqual(deck());
  });

  it("S5b-R1-MINOR 새 글은 테마 전경색과 겹치지 않는 빈 영역을 쓰고 빈 독자 이름은 구독자로 정규화한다", () => {
    const chat = deck();
    chat.template = "chat_bubble";
    chat.theme.foreground = "#F9FAFB";
    chat.slides[0].base = { kind: "chat_bubble", cover: { headline: "첫 장", sub: null }, bubbles: [] };
    const first = addChatOverlayElement(chat, "slide_cover", "text", { id: "el_text_first" });
    const second = addChatOverlayElement(first, "slide_cover", "text", { id: "el_text_second" });
    const [firstText, secondText] = second.slides[0].elements;
    expect(firstText.type === "text" ? firstText.style.color : null).toBe("#F9FAFB");
    expect([firstText.x, firstText.y]).not.toEqual([secondText.x, secondText.y]);
    expect(patchChatDeckBrand(second, { reader_name: "   " }).brand.reader_name).toBe("구독자");
  });

  it("CHAIRMAN-FIX-R2-01 거절 경로: 끌기와 방향키 이동 뒤에도 요소 전체가 카드 안에 남는다", () => {
    const added = addCardElement(deck(), "slide_cover", "text", { id: "bounded" });
    const moved = moveCardElement(added, "slide_cover", "bounded", -9_000, 9_000);
    expect(moved.slides[0].elements[0]).toMatchObject({ x: 0, y: 1170 });
    const nudged = nudgeCardElement(moved, "slide_cover", "bounded", -100, 100);
    expect(nudged.slides[0].elements[0]).toMatchObject({ x: 0, y: 1170 });
  });

  it("CHAIRMAN-FIX-R3-04 경계 경로: 과도한 크기 조절과 회전 뒤에도 변환된 요소 전체가 카드 안에 남는다", () => {
    const added = addCardElement(deck(), "slide_cover", "text", { id: "transformed" });
    const moved = moveCardElement(added, "slide_cover", "transformed", 9_000, 9_000);
    const resized = resizeCardElement(moved, "slide_cover", "transformed", "se", 9_000, 9_000);
    const rotated = rotateCardElement(resized, "slide_cover", "transformed", 45, true);
    expectRotatedElementInsideCanvas(resized.slides[0].elements[0], resized.ratio);
    expectRotatedElementInsideCanvas(rotated.slides[0].elements[0], rotated.ratio);
  });

  it("CHAIRMAN-FIX-R3-05 정상 경로: 회전 요소를 끌어도 회전 경계 전체가 카드 안에서 유지된다", () => {
    const added = addCardElement(deck(), "slide_cover", "text", { id: "rotated-move" });
    const rotated = rotateCardElement(added, "slide_cover", "rotated-move", 30, true);
    const moved = moveCardElement(rotated, "slide_cover", "rotated-move", -9_000, -9_000);
    const nudged = nudgeCardElement(moved, "slide_cover", "rotated-move", 18_000, 18_000);
    expectRotatedElementInsideCanvas(moved.slides[0].elements[0], moved.ratio);
    expectRotatedElementInsideCanvas(nudged.slides[0].elements[0], nudged.ratio);
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
