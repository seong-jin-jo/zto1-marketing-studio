import { describe, expect, it } from "vitest";
import { parseTransactionItems } from "@/lib/higgsfield-transactions";

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

  it("returns an empty list for progress text without JSON", () => {
    expect(parseTransactionItems("progress\nnot-json")).toEqual([]);
  });
});
