import { describe, expect, it } from "vitest";
import { trimBodyToFit, validatePlatformPublish } from "@/lib/studio/platform-publish-fields";

// 2026-09-07 회장 계정 실측 재발 방지.
// 발행실 "한도 넘는 곳만 줄이기" 가 X 를 못 줄여 발행 전체가 막혔다. 줄이는 쪽은 본문만
// 코드포인트로 세고, 막는 쪽은 본문에 해시태그를 더해 가중 문자로 쟀기 때문이다.
// 계약: 줄인 결과는 반드시 그 채널 검증을 통과해야 한다.
describe("trimBodyToFit", () => {
  const 한글본문 = "첫 방문 고객이 가장 많이 하는 실수를 먼저 짚고 해결책을 준다. ".repeat(12);

  it("X 는 본문과 해시태그를 합쳐 가중 문자 280 안으로 줄인다", () => {
    const input = { body: 한글본문, hashtags: "#예약 #방문" };
    expect(validatePlatformPublish("x", input).blocking.some((i) => i.field === "body")).toBe(true);

    const trimmed = trimBodyToFit("x", input);
    expect(trimmed).not.toBeNull();
    expect(
      validatePlatformPublish("x", { ...input, body: trimmed as string })
        .blocking.some((issue) => issue.field === "body"),
    ).toBe(false);
  });

  it("한도 안이면 건드리지 않는다", () => {
    expect(trimBodyToFit("x", { body: "짧은 글", hashtags: "#예약" })).toBeNull();
  });

  it("Threads 는 본문 500자 기준으로 줄인다", () => {
    const input = { body: "가".repeat(900), hashtags: "" };
    const trimmed = trimBodyToFit("threads", input);
    expect(trimmed).not.toBeNull();
    expect(
      validatePlatformPublish("threads", { ...input, body: trimmed as string })
        .blocking.some((issue) => issue.field === "body"),
    ).toBe(false);
  });
});
