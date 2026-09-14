import { describe, expect, it, vi } from "vitest";
import { runCleanupSteps } from "../../scripts/lib/cleanup-steps.mjs";

describe("CODE-REVIEW-20260915-29 네 방 검증 정리 독립 실행", () => {
  it("CODE-REVIEW-20260915-29 거절: 앞 정리가 실패해도 토큰 폐기와 브라우저 종료를 실행한다", async () => {
    const revoke = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined);
    const failures = await runCleanupSteps([
      { label: "설정 복구", run: async () => { throw new Error("읽기 전용"); } },
      { label: "임시 고객 토큰 폐기", run: revoke },
      { label: "브라우저 종료", run: close },
    ]);

    expect(failures).toEqual([{ label: "설정 복구", message: "읽기 전용" }]);
    expect(revoke).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
