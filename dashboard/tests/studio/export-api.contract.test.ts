import { describe, expect, it } from "vitest";
import {
  ExportQueueError,
  exportErrorResponse,
  parseCreateExport,
  parseDraftId,
  parseExportId,
  parseIdempotencyKey,
  parseRetryExport,
} from "@/lib/studio/export-contract";

describe("S3 export API request·response·오류 contract", () => {
  it("S3-API-01 정상: 전체 카드 내보내기 요청만 허용한다", () => {
    expect(parseCreateExport({ kind: "card_deck", expected_source_revision: 13, expected_source_hash: "a".repeat(64), item_keys: null }))
      .toMatchObject({ kind: "card_deck", expected_source_revision: 13, item_keys: null });
  });

  it.each([
    ["video kind", { kind: "video", expected_source_revision: 1, expected_source_hash: "a".repeat(64), item_keys: null }],
    ["부분 선택", { kind: "card_deck", expected_source_revision: 1, expected_source_hash: "a".repeat(64), item_keys: ["slide-1"] }],
    ["잘못된 hash", { kind: "card_deck", expected_source_revision: 1, expected_source_hash: "A".repeat(64), item_keys: null }],
  ])("S3-API-02 거절: %s 요청은 INVALID_EXPORT_REQUEST다", (_case, value) => {
    expect(() => parseCreateExport(value)).toThrowError(expect.objectContaining({ status: 400, code: "INVALID_EXPORT_REQUEST" }));
  });

  it("S3-API-03 거절: Idempotency-Key 누락과 중복 retry key를 막는다", () => {
    expect(() => parseIdempotencyKey(new Request("http://localhost"))).toThrowError(expect.objectContaining({ code: "INVALID_EXPORT_REQUEST" }));
    expect(() => parseRetryExport({ item_keys: ["slide-1", "slide-1"] })).toThrowError(expect.objectContaining({ code: "INVALID_EXPORT_REQUEST" }));
  });

  it("S3-PR122-M4 거절: UUID가 아닌 초안·내보내기 경로는 DB 접근 전 404다", () => {
    expect(() => parseDraftId("not-a-uuid")).toThrowError(expect.objectContaining({ status: 404, code: "DRAFT_NOT_FOUND" }));
    expect(() => parseExportId("not-a-uuid")).toThrowError(expect.objectContaining({ status: 404, code: "EXPORT_NOT_FOUND" }));
  });

  it.each([
    [404, "EXPORT_NOT_FOUND"], [409, "REVISION_CONFLICT"], [409, "SOURCE_HASH_CONFLICT"],
    [409, "EMPTY_SLIDE"], [409, "IDEMPOTENCY_KEY_REUSED"], [409, "ITEM_NOT_RETRYABLE"],
    [409, "EXPORT_SOURCE_STALE"], [413, "CARD_DECK_TOO_LARGE"], [422, "ASSET_NOT_AVAILABLE"],
    [429, "EXPORT_ALREADY_ACTIVE"], [503, "EXPORT_WORKER_UNAVAILABLE"],
  ])("S3-API-04 오류: HTTP %i와 %s 코드를 보존한다", async (status, code) => {
    const response = exportErrorResponse(new ExportQueueError(status, code, "public message"));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "public message", code });
  });
});
