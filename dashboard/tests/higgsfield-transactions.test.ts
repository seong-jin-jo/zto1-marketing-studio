import { describe, expect, it } from "vitest";
import { parseTransactionItems, parseTransactionPage } from "@/lib/higgsfield-transactions";

describe("parseTransactionItems", () => {
  it("accepts the paginated Higgsfield CLI response", () => {
    expect(parseTransactionItems('{"cursor":"5","items":[{"action":"spend","credits":-6}]}')).toEqual([
      { action: "spend", credits: -6 },
    ]);
  });

  it("keeps compatibility with a bare transaction array", () => {
    expect(parseTransactionItems('[{"action":"spend","credits":-0.12}]')).toEqual([
      { action: "spend", credits: -0.12 },
    ]);
  });

  it("시험 12: JSON이 아닌 CLI 출력은 파싱 실패로 구분한다", () => {
    expect(parseTransactionItems("progress\nnot-json")).toEqual([]);
    expect(parseTransactionPage("progress\nnot-json")).toEqual({ ok: false, items: [] });
  });
});
