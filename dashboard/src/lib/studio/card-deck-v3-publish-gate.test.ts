import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  has: false,
  payload: null as Record<string, unknown> | null,
  renders: [] as string[],
  puts: [] as string[],
  deletes: [] as string[],
  jsonValues: [] as unknown[],
  updateSucceeds: true,
  failRenderAt: null as number | null,
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = Object.assign((strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("has_card_deck_v3")) return Promise.resolve([{ has_card_deck_v3: H.has }]);
      if (query.includes("SELECT payload")) return Promise.resolve(H.payload ? [{ payload: H.payload }] : []);
      if (query.includes("UPDATE drafts")) return Promise.resolve(H.updateSucceeds ? [{ id: "22222222-2222-2222-2222-222222222222" }] : []);
      return Promise.resolve([]);
    }, { json: (value: unknown) => { H.jsonValues.push(value); return value; } });
    return callback(sql);
  }),
}));
vi.mock("@/lib/media-store", () => ({ mediaStore: {
  exists: vi.fn(async () => false),
  put: vi.fn(async (_tenant: string, filename: string) => { H.puts.push(filename); }),
  delete: vi.fn(async (_tenant: string, filename: string) => { H.deletes.push(filename); return true; }),
} }));
vi.mock("@/lib/image-token", () => ({ signImageToken: vi.fn((_tenant: string, filename: string) => `token-${filename}`) }));
vi.mock("@/lib/studio/card-slide-render", () => ({
  renderCardSlidePng: vi.fn(async ({ outputPath }: { outputPath: string }) => {
    if (H.failRenderAt === H.renders.length) throw new Error("render failed");
    const fs = await import("node:fs");
    fs.writeFileSync(outputPath, Buffer.from("png"));
    H.renders.push(outputPath);
  }),
}));

const deck = {
  contract_version: "3.0", id: "deck_publish_test", template: "plain", ratio: "4:5", revision: 2,
  theme: { background: "#FFF9F0", foreground: "#111111", accent: "#2563EB" },
  brand: { display_name: "OSMU", handle: null }, hook_type: "pain",
  cta: { keyword: "정리본", comment_example: "정리본을 남겨 주세요", save_reason: "나중에 다시 확인하세요" },
  slides: [
    { id: "slide_publish_cover", order: 0, role: "cover", content_state: "filled", background: { kind: "solid", color: "#FFF9F0" }, base: { kind: "plain", lines: ["첫 장"] }, elements: [] },
    { id: "slide_publish_cta", order: 1, role: "cta", content_state: "filled", background: { kind: "solid", color: "#111111" }, base: { kind: "plain", lines: ["저장"] }, elements: [] },
  ],
};

beforeEach(() => {
  H.has = false; H.payload = null; H.renders = []; H.puts = []; H.deletes = []; H.jsonValues = [];
  H.updateSucceeds = true; H.failRenderAt = null;
  vi.stubEnv("OSMU_PUBLIC_URL", "https://studio.example.com");
  vi.stubEnv("CARD_DECK_V3_RENDER_ENABLED", "0");
});
afterEach(() => vi.unstubAllEnvs());

describe("S2-B 자유 배치 발행 준비", () => {
  it("검토·승인 큐 항목에 최신 서버 PNG URL을 원자 반영할 수 있다", async () => {
    const { applyPreparedCardDeckV3Images } = await import("./card-deck-v3-publish-gate");
    const post: Record<string, unknown> = { imageUrl: "old", imageUrls: ["old"] };
    applyPreparedCardDeckV3Images(post, { imageUrl: "new-1", imageUrls: ["new-1", "new-2"], filenames: ["one.png", "two.png"] });
    expect(post).toMatchObject({ imageUrl: "new-1", imageUrls: ["new-1", "new-2"] });
  });

  it("flag off면 v3 초안을 기존 409 오류로 중단한다", async () => {
    H.payload = { cardDeckV3: deck };
    const { assertDraftCanEnterPublishQueue, CardDeckV3PublishBlockedError, cardDeckV3PublishBlockedErrorResponse } = await import("./card-deck-v3-publish-gate");
    const error = await assertDraftCanEnterPublishQueue("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222").catch((caught) => caught);
    expect(error).toBeInstanceOf(CardDeckV3PublishBlockedError);
    expect(cardDeckV3PublishBlockedErrorResponse(error as InstanceType<typeof CardDeckV3PublishBlockedError>).status).toBe(409);
    expect(H.renders).toHaveLength(0);
  });

  it("flag on이면 CardSlideScene 정지 PNG를 장별 저장하고 그 URL을 발행 입력으로 돌려준다", async () => {
    vi.stubEnv("CARD_DECK_V3_RENDER_ENABLED", "1");
    H.payload = { cardDeckV3: deck, img: { topicKey: "topic-s2" } };
    const { assertDraftCanEnterPublishQueue } = await import("./card-deck-v3-publish-gate");
    const prepared = await assertDraftCanEnterPublishQueue("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222");
    expect(H.renders).toHaveLength(2);
    expect(H.puts).toHaveLength(2);
    expect(prepared?.imageUrls).toHaveLength(2);
    expect(prepared?.imageUrls.every((url) => url.startsWith("https://studio.example.com/api/images/deliver/"))).toBe(true);
    expect(H.jsonValues.at(-1)).toMatchObject({ img: { topicKey: "topic-s2", textEmbedded: true, textSourceRecoverable: true } });
  });

  it("v3 덱이 없거나 초안 번호가 유효하지 않으면 기존 발행 경로를 유지한다", async () => {
    const { draftHasCardDeckV3, assertDraftCanEnterPublishQueue } = await import("./card-deck-v3-publish-gate");
    expect(await draftHasCardDeckV3("11111111-1111-1111-1111-111111111111", "not-a-draft")).toBe(false);
    expect(await assertDraftCanEnterPublishQueue("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222")).toBeNull();
  });

  it("S2-B 경합: 렌더 중 최신 덱으로 바뀌면 구형 PNG를 초안이나 발행 입력에 확정하지 않는다", async () => {
    vi.stubEnv("CARD_DECK_V3_RENDER_ENABLED", "1");
    H.payload = { cardDeckV3: deck };
    H.updateSucceeds = false;
    const { assertDraftCanEnterPublishQueue, CardDeckV3RenderError } = await import("./card-deck-v3-publish-gate");
    const error = await assertDraftCanEnterPublishQueue(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ).catch((caught) => caught);
    expect(error).toBeInstanceOf(CardDeckV3RenderError);
    expect((error as InstanceType<typeof CardDeckV3RenderError>).code).toBe("CARD_RENDER_STALE_DECK");
  });

  it("S2-B 경합: 결정적 객체 일부를 만든 뒤 실패해도 다른 인스턴스가 공유할 객체를 삭제하지 않는다", async () => {
    vi.stubEnv("CARD_DECK_V3_RENDER_ENABLED", "1");
    H.payload = { cardDeckV3: deck };
    H.failRenderAt = 1;
    const { assertDraftCanEnterPublishQueue, CardDeckV3RenderError } = await import("./card-deck-v3-publish-gate");
    const error = await assertDraftCanEnterPublishQueue(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ).catch((caught) => caught);
    expect(error).toBeInstanceOf(CardDeckV3RenderError);
    expect((error as InstanceType<typeof CardDeckV3RenderError>).code).toBe("CARD_RENDER_FAILED");
    expect(H.puts).toHaveLength(1);
    expect(H.deletes).toHaveLength(0);
  });

  it.each([
    ["FONT_LOAD_FAILED", 503],
    ["CARD_ASSET_INVALID", 422],
    ["CARD_RENDER_PUBLIC_URL_MISSING", 503],
    ["CARD_RENDER_STALE_DECK", 422],
    ["CARD_RENDER_FAILED", 503],
  ] as const)("S2-R2-M3 %s를 코드와 한국어 사유가 있는 %i 응답으로 바꾼다", async (code, status) => {
    const { CardDeckV3RenderError, cardDeckV3PublishErrorResponse } = await import("./card-deck-v3-publish-gate");
    const response = cardDeckV3PublishErrorResponse(new CardDeckV3RenderError(code, status));
    expect(response?.status).toBe(status);
    const body = await response?.json() as { code?: string; error?: string };
    expect(body.code).toBe(code);
    expect(body.error).toMatch(/[가-힣]/);
  });
});
