import { beforeEach, describe, expect, it } from "vitest";

const TOKEN = "derivation-invalid-id-regression-token";
const INVALID_BATCH_ID = "00000000";

function request(method: "GET" | "DELETE"): Request {
  return new Request(`http://localhost/api/studio/v1/derivations/${INVALID_BATCH_ID}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
}

beforeEach(() => {
  process.env.STUDIO_IDENTITY_MODE = "development";
  process.env.STUDIO_DEV_BEARER_TOKEN = TOKEN;
  process.env.STUDIO_DEV_MEMBER_ID = "derivation-invalid-id-member";
  process.env.STUDIO_DEV_WORKSPACE_IDS = "11111111-1111-4111-8111-111111111111";
});

describe("Studio 파생 작업 경로 식별자 회귀", () => {
  // Regression: API-READ-20260912-02. 잘못된 batchId가 UUID DB 조회까지 도달해 HTTP 500을 반환했다.
  // Found by /qa on 2026-09-12
  // Report: docs/qa/qa-tracker.md
  it.each(["GET", "DELETE"] as const)("%s 요청의 잘못된 파생 작업 번호를 400으로 거절한다", async (method) => {
    const route = await import("@/app/api/studio/v1/derivations/[batchId]/route");
    const response = await route[method](
      request(method),
      { params: Promise.resolve({ batchId: INVALID_BATCH_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_RESOURCE_ID");
    expect(body.error.field_errors).toContainEqual({
      field: "batch_id",
      reason: "UUID 형식이 필요합니다",
    });
  });
});
