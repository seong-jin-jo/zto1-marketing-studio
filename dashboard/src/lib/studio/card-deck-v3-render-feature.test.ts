import { describe, expect, it } from "vitest";
import { cardDeckV3EntryEnabled, cardDeckV3ForDraft, cardDeckV3RenderingEnabled, usesChatBubbleV2 } from "./card-deck-v3-render-feature";
import { migrateCardDeckV2ToV3 } from "./card-deck-v2-to-v3";
import type { CardDeck } from "./card-deck-contract";
import chatDeckFixture from "../../../tests/studio/fixtures/deck-d100.v2.json";

describe("S2-B CardDeckV3 공용 렌더 feature flag", () => {
  it("R2-01 정상: 기본 설정에서도 직접 편집 PNG 내보내기를 연다", () => {
    expect(cardDeckV3RenderingEnabled({})).toBe(true);
  });

  it("R2-01 거절: 긴급 중지 값이 명시되면 내보내기를 닫는다", () => {
    expect(cardDeckV3RenderingEnabled({ CARD_DECK_V3_RENDER_ENABLED: "0" })).toBe(false);
  });

  it("서버 또는 공개 flag가 명시적으로 켜진 경우에만 공용 렌더를 연다", () => {
    expect(cardDeckV3RenderingEnabled({ CARD_DECK_V3_RENDER_ENABLED: "1" })).toBe(true);
    expect(cardDeckV3RenderingEnabled({ NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED: "true" })).toBe(true);
  });

  it("서버와 브라우저 flag가 다르면 부분 활성화하지 않는다", () => {
    expect(cardDeckV3RenderingEnabled({ CARD_DECK_V3_RENDER_ENABLED: "1", NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED: "0" })).toBe(false);
    expect(cardDeckV3RenderingEnabled({ CARD_DECK_V3_RENDER_ENABLED: "0", NEXT_PUBLIC_CARD_DECK_V3_RENDER_ENABLED: "1" })).toBe(false);
  });

  it("S2-R4-M1 flag off여도 운영 S1 일반·plain v2 카드 자유 배치 진입을 유지한다", () => {
    expect(cardDeckV3EntryEnabled(false, { hasCardDeckV2: false, textEmbedded: false })).toBe(true);
    expect(cardDeckV3EntryEnabled(false, { hasCardDeckV2: false, textEmbedded: true })).toBe(false);
    expect(cardDeckV3EntryEnabled(false, { hasCardDeckV2: true, cardDeckTemplate: "plain", textEmbedded: false })).toBe(true);
    expect(cardDeckV3EntryEnabled(false, { hasCardDeckV2: true, cardDeckTemplate: "chat_bubble", textEmbedded: false })).toBe(false);
  });

  it("flag on이면 S2 AI·v2 진입 판단을 상위 화면에 연다", () => {
    expect(cardDeckV3EntryEnabled(true, { hasCardDeckV2: false, textEmbedded: true })).toBe(true);
    expect(cardDeckV3EntryEnabled(true, { hasCardDeckV2: true, textEmbedded: false })).toBe(true);
  });

  it("S5b-AC1 렌더 flag가 켜지면 카톡 v3 고급 편집 진입을 연다", () => {
    expect(cardDeckV3EntryEnabled(true, { hasCardDeckV2: true, cardDeckTemplate: "chat_bubble", textEmbedded: false })).toBe(true);
  });

  it("S5b-AC3 현재 v2 지문과 일치하는 카톡 v3만 다시 연다", () => {
    const source = structuredClone(chatDeckFixture) as unknown as CardDeck;
    const current = migrateCardDeckV2ToV3(source);
    expect(cardDeckV3ForDraft(source, current)).toBe(current);
    const staleSource = structuredClone(source);
    staleSource.brand.display_name = "새 원문";
    expect(cardDeckV3ForDraft(staleSource, current)).toBeNull();
  });

  it("S5-R3-2 chat_bubble v2가 있으면 잔존 v3를 로드 대상으로 돌려주지 않는다", () => {
    const staleV3 = { id: "stale-v3" };
    expect(usesChatBubbleV2({ template: "chat_bubble" })).toBe(true);
    expect(cardDeckV3ForDraft({ template: "chat_bubble" }, staleV3)).toBeNull();
    expect(cardDeckV3ForDraft({ template: "plain" }, staleV3)).toBe(staleV3);
  });
});
