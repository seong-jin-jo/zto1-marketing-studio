import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDeck } from "@/lib/studio/card-deck-contract";
import { cardDeckFixture } from "./generation-fixture";

// EditorDerivationSink.createDraft는 두 트랜잭션(handoff INSERT, cardDeck UPDATE)으로
// 이뤄진다(회장 리뷰 2026-09-21 MAJOR3). "같은 트랜잭션" 이라는 주석이 실물과 어긋나
// 있었고, UPDATE 실패 시 초안이 반쪽으로 남는지가 검증된 적이 없었다. 이 파일이 그 갭을
// 메운다.

const H = vi.hoisted(() => ({
  calls: [] as string[],
  tenantsRow: null as { name: string } | null | "throw",
  updateShouldFail: false,
  deletedIds: [] as string[],
}));

function sqlFor(strings: TemplateStringsArray): unknown {
  const query = strings.join("?");
  H.calls.push(query);
  if (query.includes("INSERT INTO drafts")) {
    return [{ id: "draft-1" }];
  }
  if (query.includes("SELECT name FROM tenants")) {
    if (H.tenantsRow === "throw") throw new Error("tenant lookup exploded");
    return H.tenantsRow ? [H.tenantsRow] : [];
  }
  if (query.includes("UPDATE drafts")) {
    if (H.updateShouldFail) throw new Error("cardDeck UPDATE failed");
    return [{ id: "draft-1" }];
  }
  if (query.includes("DELETE FROM drafts")) {
    H.deletedIds.push("draft-1");
    return [];
  }
  return [];
}

vi.mock("@/lib/db", () => ({
  withTenant: vi.fn(async (_tenantId: string, callback: (sql: unknown) => unknown) =>
    callback(Object.assign((strings: TemplateStringsArray) => Promise.resolve(sqlFor(strings)), {
      json: (value: unknown) => value,
      array: (value: unknown) => value,
    }))),
}));

afterEach(() => {
  vi.resetModules();
  H.calls = [];
  H.tenantsRow = null;
  H.updateShouldFail = false;
  H.deletedIds = [];
});

async function makeSink() {
  const { EditorDerivationSink } = await import("@/lib/studio/generation/derivation-sink");
  return new EditorDerivationSink();
}

describe("EditorDerivationSink.createDraft — name 치환", () => {
  it("워크스페이스 이름 조회가 되면 브랜드 표시명을 그 이름으로 바꾼다", async () => {
    H.tenantsRow = { name: "우리동네빵집" };
    const sink = await makeSink();
    const deck: CardDeck = cardDeckFixture();
    const result = await sink.createDraft({
      workspaceId: "tenant-1",
      summary: "요약",
      jobId: "job-1",
      candidateId: "cand-1",
      payload: { kind: "card", deck },
    });
    expect(result.draftId).toBe("draft-1");
    expect(H.calls.some((q) => q.includes("UPDATE drafts"))).toBe(true);
  });

  it("이름 조회가 실패해도(throw) 자리표시 '브랜드'를 유지하고 초안 저장은 성공한다", async () => {
    H.tenantsRow = "throw";
    const sink = await makeSink();
    const deck: CardDeck = cardDeckFixture();
    const result = await sink.createDraft({
      workspaceId: "tenant-1",
      summary: "요약",
      jobId: "job-1",
      candidateId: "cand-1",
      payload: { kind: "card", deck },
    });
    expect(result.draftId).toBe("draft-1");
    expect(H.deletedIds).toHaveLength(0);
  });

  it("이름 조회가 빈 결과여도(row 없음) 자리표시 '브랜드'를 유지한다", async () => {
    H.tenantsRow = null;
    const sink = await makeSink();
    const deck: CardDeck = cardDeckFixture();
    const result = await sink.createDraft({
      workspaceId: "tenant-1",
      summary: "요약",
      jobId: "job-1",
      candidateId: "cand-1",
      payload: { kind: "card", deck },
    });
    expect(result.draftId).toBe("draft-1");
  });
});

describe("EditorDerivationSink.createDraft — cardDeck UPDATE 트랜잭션 분리", () => {
  it("cardDeck UPDATE가 실패하면 handoff/초안이 이미 커밋된 상태로 남지 않도록 보상 삭제하고 던진다", async () => {
    H.tenantsRow = { name: "우리동네빵집" };
    H.updateShouldFail = true;
    const sink = await makeSink();
    const deck: CardDeck = cardDeckFixture();
    await expect(sink.createDraft({
      workspaceId: "tenant-1",
      summary: "요약",
      jobId: "job-1",
      candidateId: "cand-1",
      payload: { kind: "card", deck },
    })).rejects.toThrow("cardDeck UPDATE failed");
    // 반쪽 초안(cardDeck 없는 draft-1)을 편집실에 남기지 않는다.
    expect(H.deletedIds).toEqual(["draft-1"]);
  });

  it("text 갈래는 cardDeck UPDATE를 아예 돌지 않는다(카드가 아니면 무관)", async () => {
    const sink = await makeSink();
    const result = await sink.createDraft({
      workspaceId: "tenant-1",
      summary: "요약",
      jobId: "job-1",
      candidateId: "cand-1",
      payload: { kind: "text", body: "본문입니다." },
    });
    expect(result.draftId).toBe("draft-1");
    expect(H.calls.some((q) => q.includes("UPDATE drafts"))).toBe(false);
  });
});
