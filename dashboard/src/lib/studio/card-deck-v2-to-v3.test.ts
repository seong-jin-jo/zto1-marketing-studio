import { describe, expect, it } from "vitest";
import type { CardDeck } from "./card-deck-contract";
import { cardDeckV3ForSave, migrateCardDeckV2ToV3, projectCardDeckV3ToV2, synchronizeChatCardDeckV3 } from "./card-deck-v2-to-v3";
import chatDeckFixture from "../../../tests/studio/fixtures/deck-d100.v2.json";

const base = {
  contract_version: "2.0",
  template: "plain",
  ratio: "4:5",
  theme: { background: "#FFF9F0", foreground: "#111111", accent: "#2563EB" },
  brand: { display_name: "OSMU", handle: null },
  hook_type: "pain",
  cta: { keyword: "정리본", comment_example: "정리본을 남겨 주세요", save_reason: "나중에 다시 확인하세요" },
  revision: 3,
} as const;

describe("S2 기존 카드 무손실 이관", () => {
  it("S2-AC1 plain 중간 빈 장도 ID·순서·내용을 제거하지 않고 결정적으로 왕복한다", () => {
    const source = {
      ...base,
      slides: [
        { id: "plain-cover", order: 0, role: "cover", cover: { headline: "첫 장", sub: null }, image_url: null, position: "top" },
        { id: "plain-empty", order: 1, role: "chat", bubbles: [], image_url: null, position: "center" },
        { id: "plain-cta", order: 2, role: "cta", bubbles: [{ id: "plain-cta-bubble", order: 0, speaker: "brand", segments: [{ text: "저장하세요", bold: true }], reaction: null }], image_url: null, position: "bottom" },
      ],
    } as unknown as CardDeck;

    const first = migrateCardDeckV2ToV3(source);
    const second = migrateCardDeckV2ToV3(structuredClone(source));
    expect(first).toEqual(second);
    expect(first.slides.map((slide) => [slide.id, slide.order, slide.content_state])).toEqual([
      ["plain-cover", 0, "filled"],
      ["plain-empty", 1, "empty"],
      ["plain-cta", 2, "filled"],
    ]);
    expect(first.migration).toMatchObject({ source_contract_version: "2.0", converter_version: "card-deck-v2-to-v3@1" });
    expect(first.migration?.source_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(projectCardDeckV3ToV2(first, source)).toEqual(source);
  });

  it("S2-AC2 chat_bubble은 화자·볼드·reaction·CTA를 deep equality로 왕복한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const migrated = migrateCardDeckV2ToV3(source);
    expect(migrated.template).toBe("chat_bubble");
    expect(projectCardDeckV3ToV2(migrated, source)).toEqual(source);
  });

  it("S5-R1-M1 카톡 CTA는 텍스트와 겹치는 foreground 대신 대화 배경을 유지한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const migrated = migrateCardDeckV2ToV3(source);

    expect(migrated.slides[0].background).toEqual({ kind: "solid", color: source.theme.background });
    expect(migrated.slides.at(-1)?.role).toBe("cta");
    expect(migrated.slides.at(-1)?.background).toEqual({ kind: "solid", color: source.theme.background });
  });

  it("S5b-AC1 카톡 원문은 base만 SSOT로 쓰고 바꾼 표지를 v2 projection에 반영한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const migrated = migrateCardDeckV2ToV3(source);
    const cover = migrated.slides[0];
    expect(cover.base.kind).toBe("chat_bubble");
    if (cover.base.kind !== "chat_bubble") throw new Error("fixture");
    cover.base.cover = { ...cover.base.cover!, headline: "바뀐 표지" };
    expect(cover.elements).toEqual([]);
    const projected = projectCardDeckV3ToV2(migrated, source);
    expect(projected.slides[0].cover?.headline).toBe("바뀐 표지");
    expect(projected.slides.slice(1)).toEqual(source.slides.slice(1));
  });

  it("S5b-AC3 v3와 함께 저장할 v2 projection 지문만 현재본으로 인정한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const migrated = migrateCardDeckV2ToV3(source);
    const projected = projectCardDeckV3ToV2(migrated, source);
    const synchronized = synchronizeChatCardDeckV3(migrated, projected);
    expect(synchronized.migration?.source_sha256).toBe(migrated.migration?.source_sha256);
    projected.brand.display_name = "다른 원문";
    expect(synchronizeChatCardDeckV3(migrated, projected).migration?.source_sha256).not.toBe(migrated.migration?.source_sha256);
  });

  it("S5b-R1-M1 공통 저장 경계는 편집기 덱을 현재 v2 projection hash와 동기화한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const edited = migrateCardDeckV2ToV3(source);
    edited.brand.display_name = "편집한 작성자";
    const projected = projectCardDeckV3ToV2(edited, source);
    const persisted = cardDeckV3ForSave(projected, edited);

    expect(persisted?.migration?.source_sha256).not.toBe(edited.migration?.source_sha256);
    expect(persisted).toEqual(synchronizeChatCardDeckV3(edited, projected));
    expect(cardDeckV3ForSave(null, edited)).toBe(edited);
  });

  it("S2-AC1 v3 계약 안의 긴 원본 ID는 자르지 않고 보존하며 계약 밖 ID도 충돌 없이 변환한다", () => {
    const longId = `slide_${"a".repeat(90)}`;
    const source = {
      ...base,
      slides: [
        { id: longId, order: 0, role: "cover", cover: { headline: "첫 장", sub: null }, image_url: null, position: "top" },
        { id: "unsafe/id", order: 1, role: "chat", bubbles: [], image_url: null, position: "center" },
        { id: "unsafe\\id", order: 2, role: "cta", bubbles: [{ id: "bubble-final", order: 0, speaker: "brand", segments: [{ text: "저장", bold: true }], reaction: null }], image_url: null, position: "bottom" },
      ],
    } as unknown as CardDeck;
    const migrated = migrateCardDeckV2ToV3(source);
    expect(migrated.slides[0].id).toBe(longId);
    expect(migrated.slides[1].id).not.toBe(migrated.slides[2].id);
  });

  it("S2-R2-M2 plain 표지 사진은 업로드된 asset id의 사진 요소로 이관한다", () => {
    const source = {
      ...base,
      slides: [
        { id: "plain-cover", order: 0, role: "cover", cover: { headline: "사진 표지", sub: null }, image_url: null, cover_image_url: "https://example.test/api/images/deliver/signed", position: "top" },
      ],
    } as unknown as CardDeck;
    const migrated = migrateCardDeckV2ToV3(source, {
      coverImageAssetIds: { "https://example.test/api/images/deliver/signed": "cover-owned.png" },
    });
    expect(migrated.slides[0].elements).toContainEqual(expect.objectContaining({
      type: "image",
      asset_id: "cover-owned.png",
      name: "표지 사진",
    }));
    expect(migrated.slides[0].elements.find((element) => element.type === "text")?.z_index).toBeGreaterThan(0);
  });

  it("S5-AC5 카톡 표지·마지막 장 사진을 공용 화면·PNG 배경으로 옮기고 원문은 그대로 왕복한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const last = source.slides.at(-1)!;
    source.slides[0].cover_image_url = "https://example.test/cover.png";
    last.cover_image_url = "https://example.test/final.png";

    const migrated = migrateCardDeckV2ToV3(source, {
      coverImageAssetIds: {
        "https://example.test/cover.png": "chat-cover-owned.png",
        "https://example.test/final.png": "chat-final-owned.png",
      },
    });

    expect(migrated.slides[0].background).toMatchObject({ kind: "image", asset_id: "chat-cover-owned.png" });
    expect(migrated.slides.at(-1)?.background).toMatchObject({ kind: "image", asset_id: "chat-final-owned.png" });
    expect(projectCardDeckV3ToV2(migrated, source)).toEqual(source);
  });

  it("S5-AC5 사진을 고른 카톡 장의 소유 asset이 없으면 조용히 사진을 빼지 않고 이관을 거절한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    source.slides[0].cover_image_url = "https://example.test/cover.png";
    expect(() => migrateCardDeckV2ToV3(source)).toThrow("CARD_COVER_IMAGE_ASSET_REQUIRED");
  });

  it("S5-R1-M5 화자 이름·프로필 asset을 v3에 보존하고 기존 덱의 독자 이름은 구독자로 보정한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    source.brand.reader_name = "학생";
    source.brand.profile_image_url = "https://example.test/profile.png";
    source.brand.profile_image_asset_id = "profile-owned.png";
    const migrated = migrateCardDeckV2ToV3(source);
    expect(migrated.brand).toMatchObject({ reader_name: "학생", profile_image_asset_id: "profile-owned.png" });
    migrated.brand.reader_name = "구독자";
    expect(projectCardDeckV3ToV2(migrated, source).brand).toMatchObject({
      reader_name: "구독자",
      profile_image_url: source.brand.profile_image_url,
      profile_image_asset_id: "profile-owned.png",
    });
  });

  it("S5-R1-M5 구 덱 투영은 원본에 없던 화자 필드를 만들지 않는다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const migrated = migrateCardDeckV2ToV3(source);
    expect(projectCardDeckV3ToV2(migrated, source)).toEqual(source);
  });

  it("S5-R1-M5 프로필 URL은 있지만 소유 asset ID가 없으면 v3 이관을 거절한다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    source.brand.profile_image_url = "https://example.test/profile.png";
    expect(() => migrateCardDeckV2ToV3(source)).toThrow("CARD_PROFILE_IMAGE_ASSET_REQUIRED");
  });
});
