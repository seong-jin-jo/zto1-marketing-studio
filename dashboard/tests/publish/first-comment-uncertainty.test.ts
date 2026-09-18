import { afterEach, describe, expect, it, vi } from "vitest";
import { publishFirstComment } from "@/lib/first-comment";

afterEach(() => vi.unstubAllGlobals());

describe("첫 댓글 공급자 결과 불명확성", () => {
  it("REVIEW-20260918-26 보류: Graph 2xx 응답에 댓글 번호가 없으면 자동 재시도 가능한 실패로 기록하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const result = await publishFirstComment("facebook", { token: "test-token", userId: "page-1" }, "post-1", "comment");
    expect(result).toMatchObject({ ok: false, failureKind: "indeterminate" });
  });

  it("REVIEW-20260918-26 보류: Graph 5xx와 429는 외부 성공 여부를 알 수 없어 잠근다", async () => {
    for (const status of [429, 503]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
      const result = await publishFirstComment("instagram", { token: "test-token", userId: "ig-1" }, "post-1", "comment");
      expect(result).toMatchObject({ ok: false, failureKind: "indeterminate" });
    }
  });

  it("REVIEW-20260918-26 거절: Graph 권한 거절 403은 명시 실패로 남긴다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    const result = await publishFirstComment("facebook", { token: "test-token", userId: "page-1" }, "post-1", "comment");
    expect(result).toMatchObject({ ok: false, failureKind: "definitive" });
  });
});
