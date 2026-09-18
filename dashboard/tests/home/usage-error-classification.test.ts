import { describe, expect, it } from "vitest";
import { ApiResponseError, AuthRequiredError } from "@/lib/api";
import { classifyUsageError } from "@/lib/usage-error";

describe("REVIEW-20260918-10 성과실 사용량 오류 분류", () => {
  it("정상: 명시된 outbox 지연만 지연으로 안내한다", () => {
    expect(classifyUsageError(new ApiResponseError(503, { status: "delayed" }, "relay pending")))
      .toEqual({ delayed: true });
  });

  it("거절: 인증, 일반 서버, 네트워크 실패를 지연으로 위장하지 않는다", () => {
    expect(classifyUsageError(new AuthRequiredError())).toMatchObject({ delayed: false, message: expect.stringContaining("로그인") });
    expect(classifyUsageError(new ApiResponseError(503, { error: "DB down" }, "DB down")))
      .toMatchObject({ delayed: false, message: expect.stringContaining("503") });
    expect(classifyUsageError(new TypeError("fetch failed")))
      .toMatchObject({ delayed: false, message: expect.stringContaining("네트워크") });
  });
});
