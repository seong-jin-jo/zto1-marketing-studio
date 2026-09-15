import { describe, expect, it } from "vitest";
import { classifyApiReadResponse } from "../../scripts/lib/api-sweep-contract.mjs";

// Regression: API-READ-SWEEP-V14. The generic empty-array rule marked the
// intentionally empty image gallery as broken, while loose rejection rules did
// not prove that the expected endpoint-specific error was actually observed.
// Found by /qa on 2026-09-16.
// Report: docs/qa/osmu-api-read-sweep-v14-gpt-codex.md

describe("API-READ-SWEEP-V14 endpoint-specific live sweep contracts", () => {
  it("정상 빈 배열을 명시한 경로만 정상으로 센다", () => {
    const input = {
      status: 200,
      method: "GET",
      contentType: "application/json",
      bodyText: "[]",
    };
    expect(classifyApiReadResponse(input)).toBe("응답 구조 오류");
    expect(classifyApiReadResponse({ ...input, allowEmptyArray: true })).toBe("정상");
  });

  it("예상 상태와 본문 코드가 모두 일치할 때만 계약상 거절로 센다", () => {
    const expectedRejection = {
      statuses: [503],
      bodyIncludes: ["BLOG_NOT_CONFIGURED"],
    };
    expect(classifyApiReadResponse({
      status: 503,
      expectedRejection,
      method: "GET",
      contentType: "application/json",
      bodyText: JSON.stringify({ error: "Blog not configured", code: "BLOG_NOT_CONFIGURED" }),
    })).toBe("계약상 거절");
    expect(classifyApiReadResponse({
      status: 503,
      expectedRejection,
      method: "GET",
      contentType: "application/json",
      bodyText: JSON.stringify({ error: "다른 장애", code: "UNRELATED_FAILURE" }),
    })).toBe("계약 불일치");
  });

  it("성공을 기대한 경로의 오류 본문은 HTTP 200이어도 실패로 센다", () => {
    expect(classifyApiReadResponse({
      status: 200,
      method: "GET",
      contentType: "application/json",
      bodyText: JSON.stringify({ error: "upstream failed", code: "GA_UPSTREAM_FAILED" }),
    })).toBe("실패 본문");
  });
});
