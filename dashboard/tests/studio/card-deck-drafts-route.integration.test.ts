import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTenant } from "@/lib/db";
import deckD100 from "./fixtures/deck-d100.v2.json";

const H = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  jsonValues: [] as unknown[],
}));

vi.mock("@/lib/tenant-auth", () => ({
  effectiveTenantId: vi.fn(async () => "tenant-1"),
}));

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) => {
    const sql = Object.assign(() => Promise.resolve(H.rows), {
      json: (value: unknown) => {
        H.jsonValues.push(value);
        return value;
      },
    });
    return callback(sql);
  }),
}));

beforeEach(() => {
  vi.resetModules();
  H.rows = [];
  H.jsonValues = [];
});

describe("POST /api/studio/drafts cardDeck 저장·검증 (TC-API-01·02)", () => {
  it("정상 덱은 저장되고 editLines 가 투영으로 채워진다", async () => {
    H.rows = [{ id: "draft-deck-1" }];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "카드 덱 저장", cardDeck: deckD100 }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: "draft-deck-1" });
    const savedPayload = H.jsonValues[0] as { cardDeck: unknown; editLines: string[] };
    expect(savedPayload.cardDeck).toEqual(deckD100);
    expect(Array.isArray(savedPayload.editLines)).toBe(true);
    expect(savedPayload.editLines.length).toBeGreaterThan(0);
  });

  it("불변식 위반 덱은 400 INVALID_CARD_DECK { rule } 으로 거부하고 DB 접근 전에 막는다", async () => {
    vi.mocked(withTenant).mockClear();
    const brokenDeck = JSON.parse(JSON.stringify(deckD100));
    brokenDeck.slides[8].bubbles[0].segments = [{ text: "감사합니다", bold: false }]; // CTA 키워드 없음

    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "잘못된 카드 덱", cardDeck: brokenDeck }),
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_CARD_DECK");
    expect(body.rule).toBe("cta_keyword");
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("직렬화 64KB 초과 덱은 413 CARD_DECK_TOO_LARGE 로 거부한다", async () => {
    vi.mocked(withTenant).mockClear();
    const bigDeck = JSON.parse(JSON.stringify(deckD100));
    bigDeck.slides[1].bubbles[1].segments[1].text = "가".repeat(70_000);

    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "너무 큰 카드 덱", cardDeck: bigDeck }),
    }));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.code).toBe("CARD_DECK_TOO_LARGE");
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("GET 은 저장된 cardDeck 을 그대로 되돌려준다", async () => {
    H.rows = [{
      id: "draft-deck-2",
      idea: "카드 덱 조회",
      payload: { cardDeck: deckD100 },
      status: "draft",
      updated_at: "2026-09-21T00:00:00Z",
    }];
    const { GET } = await import("@/app/api/studio/drafts/route");
    const body = await (await GET(new Request("http://localhost/api/studio/drafts"))).json();
    expect(body.drafts[0].cardDeck).toEqual(deckD100);
  });

  it("cardDeck 이 없는 요청은 기존처럼 통과하고, 기존 덱을 지우지 않는다(2026-09-21 코드리뷰 MAJOR 4 회귀)", async () => {
    H.rows = [{ id: "draft-legacy-1" }];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "레거시 저장", editLines: ["줄1", "줄2"] }),
    }));
    expect(response.status).toBe(200);
    const savedPayload = H.jsonValues[0] as Record<string, unknown>;
    // cardDeck 키 자체가 병합 대상에 없어야 한다. JSONB `||` 병합은 없는 키를 건드리지
    // 않으므로 이 초안에 이미 저장돼 있던 cardDeck 이 있었다면 그대로 남는다. `null` 을
    // 실어 보내면(옛 동작) 그 자리에서 지워졌다.
    expect(Object.prototype.hasOwnProperty.call(savedPayload, "cardDeck")).toBe(false);
    expect(savedPayload.editLines).toEqual(["줄1", "줄2"]);
  });

  it("clearCardDeck:true 를 보내면 명시적으로 cardDeck 을 지운다", async () => {
    H.rows = [{ id: "draft-legacy-2" }];
    const { POST } = await import("@/app/api/studio/drafts/route");
    const response = await POST(new Request("http://localhost/api/studio/drafts", {
      method: "POST",
      body: JSON.stringify({ tenant_id: "tenant-1", idea: "덱 삭제", clearCardDeck: true }),
    }));
    expect(response.status).toBe(200);
    const savedPayload = H.jsonValues[0] as Record<string, unknown>;
    expect(savedPayload.cardDeck).toBeNull();
  });
});
