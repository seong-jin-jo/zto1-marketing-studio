import { describe, expect, it } from "vitest";
import {
  CARD_DECK_V3_MAX_BYTES,
  CardDeckV3ValidationError,
  cardDeckV3Projection,
  parseCardDeckV3,
  type CardDeckV3,
} from "./card-element-contract";

function deck(): CardDeckV3 {
  const base = {
    name: "요소",
    x: 96,
    y: 164,
    width: 400,
    height: 180,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
  } as const;
  return {
    contract_version: "3.0",
    id: "deck_test_001",
    template: "plain",
    ratio: "4:5",
    revision: 0,
    theme: { background: "#FFF9F0", foreground: "#111111", accent: "#2563EB" },
    brand: { display_name: "OSMU", handle: null },
    hook_type: "pain",
    cta: { keyword: "정리본", comment_example: "정리본을 남겨 주세요", save_reason: "나중에 다시 확인하세요" },
    slides: [
      {
        id: "slide_test_001", order: 0, role: "cover", content_state: "filled",
        background: { kind: "solid", color: "#FFF9F0" }, base: { kind: "plain", lines: ["첫 장"] },
        elements: [
          { ...base, id: "el_text_001", z_index: 0, type: "text", text: "첫 장", style: { font_family: "Pretendard Variable", font_size: 72, font_weight: 700, line_height: 1.2, letter_spacing: 0, color: "#111111", align: "left", vertical_align: "top" } },
          { ...base, id: "el_image_001", z_index: 1, type: "image", asset_id: "asset_photo_001", alt: "작업 사진", decorative: false, fit: "cover", crop: { x: 0, y: 0, width: 1, height: 1 }, corner_radius: 24 },
          { ...base, id: "el_shape_001", z_index: 2, type: "shape", shape: "rectangle", fill: "#2563EB", stroke: "transparent", stroke_width: 0, corner_radius: 16 },
          { ...base, id: "el_sticker_001", z_index: 3, type: "sticker", asset_id: "builtin:sticker-star", alt: "별 스티커", decorative: true, fit: "contain" },
          { ...base, id: "el_logo_001", z_index: 4, type: "logo", asset_id: "builtin:logo-osmu", alt: "OSMU", fit: "contain" },
        ],
      },
      {
        id: "slide_test_002", order: 1, role: "cta", content_state: "filled",
        background: { kind: "solid", color: "#111111" }, base: { kind: "plain", lines: ["저장하세요"] },
        elements: [{ ...base, id: "el_text_002", z_index: 0, type: "text", text: "저장하세요", style: { font_family: "Pretendard Variable", font_size: 64, font_weight: 700, line_height: 1.2, letter_spacing: 0, color: "#FFFFFF", align: "center", vertical_align: "middle" } }],
      },
    ],
  };
}

describe("AC-CARD-01 카드 요소 v3 계약", () => {
  it("S1-AC1 정상 경로: 5종 요소의 좌표, 회전, 층, 서식, 잠금, 숨김을 왕복 보존한다", () => {
    const value = deck();
    const parsed = parseCardDeckV3(JSON.parse(JSON.stringify(value)));
    expect(parsed).toEqual(value);
    expect(cardDeckV3Projection(parsed)).toEqual(["첫 장", "저장하세요"]);
  });

  it("S1-AC1 거절 경로: 중복 층과 장 밖 요소를 저장하지 않는다", () => {
    const value = deck();
    value.slides[0].elements[1].z_index = 0;
    value.slides[0].elements[2].x = 5_000;
    expect(() => parseCardDeckV3(value)).toThrow(CardDeckV3ValidationError);
  });

  it("S1-AC2 거절 경로: 글자 크기와 색 계약을 벗어나면 저장하지 않는다", () => {
    const value = deck();
    const text = value.slides[0].elements[0];
    if (text.type !== "text") throw new Error("fixture");
    text.style.font_size = 241;
    text.style.color = "red" as `#${string}`;
    expect(() => parseCardDeckV3(value)).toThrow(CardDeckV3ValidationError);
  });

  it("CARD-CANVA-02 글꼴과 글 배경색은 허용 목록 안에서 저장하고 임의 글꼴은 거절한다", () => {
    const value = deck();
    const text = value.slides[0].elements[0];
    if (text.type !== "text") throw new Error("fixture");
    text.style.font_family = "Georgia";
    text.style.background_color = "#FFF2A8";
    expect(parseCardDeckV3(value).slides[0].elements[0]).toMatchObject({
      type: "text",
      style: { font_family: "Georgia", background_color: "#FFF2A8" },
    });
    text.style.font_family = "Unknown Font" as "Georgia";
    expect(() => parseCardDeckV3(value)).toThrow(CardDeckV3ValidationError);
  });

  it("S1-AC3 경계값: 256 KiB를 넘는 덱을 CARD_DECK_TOO_LARGE로 거절한다", () => {
    const value = deck();
    const text = value.slides[0].elements[0];
    if (text.type !== "text") throw new Error("fixture");
    text.text = "가".repeat(CARD_DECK_V3_MAX_BYTES);
    try {
      parseCardDeckV3(value);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CardDeckV3ValidationError);
      expect((error as CardDeckV3ValidationError).code).toBe("CARD_DECK_TOO_LARGE");
    }
  });

  it("S1-R3-ASSET-ID-01 실제 업로드 응답 형식: 확장자 파일명은 허용하고 경로 순회는 거절한다", () => {
    const uploaded = deck();
    const image = uploaded.slides[0].elements[1];
    if (image.type !== "image") throw new Error("fixture");
    image.asset_id = "8f6a04d2c911.png";
    expect(parseCardDeckV3(uploaded).slides[0].elements[1]).toMatchObject({ asset_id: "8f6a04d2c911.png" });

    image.asset_id = "../tenant-b/secret.png";
    expect(() => parseCardDeckV3(uploaded)).toThrow(CardDeckV3ValidationError);
  });

  it("S1-R3-CHAT-PROJECTION-01 카톡 덱은 표지와 말풍선 세그먼트를 순서대로 줄 투영한다", () => {
    const value = deck();
    value.template = "chat_bubble";
    value.slides[0].base = {
      kind: "chat_bubble",
      cover: { headline: "표지 제목", sub: "표지 설명" },
      bubbles: [
        { id: "bubble_2", order: 1, speaker: "brand", segments: [{ text: "둘째", bold: false }], reaction: null },
        { id: "bubble_1", order: 0, speaker: "reader", segments: [{ text: "첫", bold: false }, { text: "말풍선", bold: true }], reaction: "heart" },
      ],
    };

    expect(cardDeckV3Projection(value)[0]).toBe("표지 제목\n표지 설명\n첫말풍선\n둘째");
  });

  it("S5-R1-M5 화자 이름과 프로필 asset ID를 저장하고 경로 순회 ID는 거절한다", () => {
    const value = deck();
    value.brand.reader_name = "구독자";
    value.brand.profile_image_asset_id = "profile-owned.png";
    expect(parseCardDeckV3(value).brand).toMatchObject({ reader_name: "구독자", profile_image_asset_id: "profile-owned.png" });
    value.brand.profile_image_asset_id = "../other/profile.png";
    expect(() => parseCardDeckV3(value)).toThrow(CardDeckV3ValidationError);
  });
});
