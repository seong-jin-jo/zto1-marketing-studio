import { describe, expect, it } from "vitest";
import { createPlainCardDeckV3 } from "./card-element-commands";
import { canonicalJson, cardDeckExportSource, firstEmptySlide } from "./export-source-hash";

describe("S3 내보내기 source hash 계약", () => {
  it("S3-HASH-01 정상: 객체 key 순서와 무관하게 같은 canonical JSON을 만든다", () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it("S3-HASH-02 정상: 덱 revision과 64자리 hash를 반환한다", () => {
    const deck = createPlainCardDeckV3(["첫 장", "마지막 장"], "deck_export_hash");
    deck.revision = 13;
    const source = cardDeckExportSource(deck);
    expect(source.sourceRevision).toBe(13);
    expect(source.sourceHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("S3-HASH-03 거절: content_state empty의 첫 순서를 반환한다", () => {
    const deck = createPlainCardDeckV3(["첫 장", "마지막 장"], "deck_export_empty");
    deck.slides[1].content_state = "empty";
    expect(firstEmptySlide(deck)).toEqual({ order: 1, number: 2, item_key: deck.slides[1].id });
  });
});
