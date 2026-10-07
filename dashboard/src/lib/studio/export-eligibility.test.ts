import { describe, expect, it } from "vitest";
import { exportKindForDraftState } from "./export-eligibility";

describe("S4 durable export eligibility", () => {
  it.each([
    ["일반 카드 v2", "card", { cardDeck: { slides: [] } }],
    ["카톡 comment_prompt 덱", "card", { cardDeck: { template: "chat_bubble" } }],
    ["AI 이미지 카드", "card", { img: { textEmbedded: false } }],
    ["편집 없는 영상", "video", { vid: { filename: "source.mp4" } }],
  ])("S4-B1 회귀: %s은 기존 발행실 경로를 유지한다", (_label, kind, state) => {
    expect(exportKindForDraftState(kind as "card" | "video", state)).toBeNull();
  });

  it.each([
    ["자유 배치 카드 v3", "card", { cardDeckV3: { revision: 1 } }, "card_deck"],
    ["편집 상태가 저장된 영상", "video", { videoEdit: { revision: 1 } }, "video"],
  ])("S4-B1 정상: %s만 내보내기 대기열로 보낸다", (_label, kind, state, expected) => {
    expect(exportKindForDraftState(kind as "card" | "video", state)).toBe(expected);
  });
});
