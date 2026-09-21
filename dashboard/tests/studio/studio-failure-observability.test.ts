import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { studioFailure } from "@/lib/studio/generation/http";
import { StudioApiError } from "@/lib/studio/generation/errors";
import { mapGenerationDatabaseError } from "@/lib/studio/generation/repository";

// ADR-007(조용한 실패 금지): derivations POST 가 운영에서 500 을 냈는데 컨테이너 로그에
// 아무 줄도 안 남아 원인을 찾을 수 없었다(2026-09-22 실측, request_id 9ef9abf7-…, 8c58e663-…).
// studioFailure 가 원인 error 를 삼키고 request_id 만 돌려줬기 때문이다. 이 테스트는 그
// 회귀가 다시 조용해지지 않게 잡는다.
describe("studioFailure 는 알 수 없는 오류를 조용히 삼키지 않는다", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("알 수 없는(500) error 는 request_id·이름·메시지·스택·컨텍스트를 console.error 로 남긴다", async () => {
    const boom = new Error("derivation persist exploded");
    const response = studioFailure(boom, { route: "derivations.POST", job_id: "job-123", kinds: "text" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("처리되지 않은 오류");
    expect(payload.job_id).toBe("job-123");
    expect(payload.kinds).toBe("text");
    expect(payload.error_message).toBe("derivation persist exploded");
    expect(payload.error_name).toBe("Error");
    expect(typeof payload.error_stack).toBe("string");
    expect(typeof payload.request_id).toBe("string");

    // 응답 본문에는 request_id 만 있고 원인 메시지는 노출되지 않는다(사용자 노출 계약 불변).
    const body = await response.json() as { error: { message: string }; meta: { request_id: string } };
    expect(body.error.message).toBe("Studio 요청을 처리하지 못했습니다");
    expect(body.meta.request_id).toBe(payload.request_id);
    expect(response.status).toBe(500);
  });

  it("비밀값은 context 로 넘기지 않는 한 로그에 나타나지 않는다", () => {
    studioFailure(new Error("boom"), { route: "derivations.POST", job_id: "job-1" });
    const [, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(payload)).not.toContain("token");
    expect(Object.keys(payload)).not.toContain("password");
  });

  it("알려진 StudioApiError 4xx 는 console.error 가 아니라 warn 한 줄만 남긴다", () => {
    studioFailure(new StudioApiError({ status: 422, code: "DERIVATION_KINDS_REQUIRED", message: "같이 만들 갈래를 하나 이상 골라야 합니다" }));
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("알려진 StudioApiError 5xx 는 console.error 로 남긴다(스택 없이 코드·메시지만)", () => {
    studioFailure(new StudioApiError({ status: 503, code: "GENERATION_DB_BUSY", message: "생성 요청이 몰려 잠시 후 다시 시도해야 합니다" }));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.code).toBe("GENERATION_DB_BUSY");
  });
});

// mapGenerationDatabaseError 도 같은 자리다: postgres 원인을 StudioApiError 로 뭉개기 전에
// 마지막으로 원본을 볼 수 있는 지점인데 로그가 없었다.
describe("mapGenerationDatabaseError 는 postgres 원인을 로그로 남긴다", () => {
  it("알 수 없는 postgres 오류를 console.error 로 남기고 500 무결성 위반으로 매핑한다", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pgError = Object.assign(new Error("null value in column \"job_id\" violates not-null constraint"), {
      code: "23502",
      constraint_name: "studio_derivation_batches_job_id_not_null",
    });
    const mapped = mapGenerationDatabaseError(pgError);
    expect(mapped.status).toBe(500);
    expect(mapped.code).toBe("GENERATION_DB_INVARIANT_VIOLATION");
    expect(spy).toHaveBeenCalledTimes(1);
    const [, payload] = spy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.postgres_code).toBe("23502");
    expect(payload.error_message).toContain("not-null constraint");
    spy.mockRestore();
  });
});
