import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({ rows: [] as Array<{ has_card_deck_v3: boolean }> }));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = () => Promise.resolve(H.rows);
    return callback(sql);
  }),
}));

beforeEach(() => { H.rows = []; });

describe("S1-R4-PUBLISH-GATE-01 자유 배치 발행 안전문", () => {
  it("v3 덱이 저장된 초안은 서버 발행 경계에서 차단한다", async () => {
    H.rows = [{ has_card_deck_v3: true }];
    const { draftHasCardDeckV3, cardDeckV3PublishBlockedResponse } = await import("./card-deck-v3-publish-gate");
    expect(await draftHasCardDeckV3("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")).toBe(true);
    const response = cardDeckV3PublishBlockedResponse();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CARD_DECK_V3_RENDER_PENDING" });
  });

  it("v3 덱이 없거나 초안 번호가 유효하지 않으면 기존 발행 경로를 유지한다", async () => {
    const { draftHasCardDeckV3 } = await import("./card-deck-v3-publish-gate");
    expect(await draftHasCardDeckV3("11111111-1111-1111-1111-111111111111", "not-a-draft")).toBe(false);
    expect(await draftHasCardDeckV3("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")).toBe(false);
  });
});
