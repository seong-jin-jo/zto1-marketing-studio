import { describe, expect, it, vi } from "vitest";

import { ApiResponseError } from "@/lib/api";
import { retryGeneratorBusy } from "@/lib/generator-busy-retry";

describe("생성기 BUSY 자동 재시도 계약", () => {
  it("HIGGSFIELD-BUSY-01 정상: 두 번 BUSY 뒤 세 번째 접수 결과를 반환한다", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new ApiResponseError(503, { code: "GENERATOR_BUSY" }, "busy"))
      .mockRejectedValueOnce(new ApiResponseError(503, { code: "GENERATOR_BUSY" }, "busy"))
      .mockResolvedValue({ ok: true });
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(retryGeneratorBusy(operation, wait)).resolves.toEqual({ ok: true });
    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it("HIGGSFIELD-BUSY-02 거절: BUSY가 아닌 오류는 즉시 전달한다", async () => {
    const error = new ApiResponseError(503, { code: "GENERATOR_UNAUTHENTICATED" }, "auth");
    const operation = vi.fn().mockRejectedValue(error);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(retryGeneratorBusy(operation, wait)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("HIGGSFIELD-BUSY-03 경계: 세 번 모두 BUSY면 마지막 오류를 반환한다", async () => {
    const error = new ApiResponseError(503, { code: "GENERATOR_BUSY" }, "busy");
    const operation = vi.fn().mockRejectedValue(error);

    await expect(retryGeneratorBusy(operation, async () => undefined)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
