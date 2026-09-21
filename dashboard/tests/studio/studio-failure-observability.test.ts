import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { studioFailure } from "@/lib/studio/generation/http";
import { StudioApiError } from "@/lib/studio/generation/errors";
import { mapGenerationDatabaseError } from "@/lib/studio/generation/repository";

// ADR-007(조용한 실패 금지): derivations POST 가 운영에서 500 을 냈는데 컨테이너 로그에
// 아무 줄도 안 남아 원인을 찾을 수 없었다(2026-09-22 실측, request_id 9ef9abf7-…, 8c58e663-…).
// studioFailure 가 원인 error 를 삼키고 request_id 만 돌려줬기 때문이다. 이 테스트는 그
// 회귀가 다시 조용해지지 않게 잡는다.
//
// PR#75 교차 리뷰(REQUEST_CHANGES) 반영: mapGenerationDatabaseError 는 더 이상 여기서
// 로그를 안 찍는다(M1) — request_id 가 아직 없는 자리에서 찍으면 동시 요청에서 어느
// request_id 가 어느 postgres 원인인지 못 잇는다. 원본은 StudioApiError.cause 에 실어
// 던지고, studioFailure 5xx 분기가 request_id 와 cause 를 한 줄로 찍는다.
describe("studioFailure 는 알 수 없는 오류를 조용히 삼키지 않는다", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    debugSpy.mockRestore();
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

    // 응답 본문에는 request_id 만 있고 원인 메시지·스택은 절대 노출되지 않는다.
    const body = await response.json() as { error: { message: string }; meta: { request_id: string } };
    expect(body.error.message).toBe("Studio 요청을 처리하지 못했습니다");
    expect(body.meta.request_id).toBe(payload.request_id);
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain("derivation persist exploded");
    expect(bodyText).not.toContain(payload.error_stack as string);
    expect(response.status).toBe(500);
  });

  it("context 에 request_id 를 실어도 studioFailure 가 만든 진짜 request_id 가 항상 이긴다", () => {
    studioFailure(new Error("boom"), { route: "x", request_id: "attacker-controlled" } as never);
    const [, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.request_id).not.toBe("attacker-controlled");
  });

  it("error.cause 가 있으면(name·message만) 얕게 로그에 얹는다", () => {
    const cause = new Error("root cause detail");
    const wrapped = new Error("wrapper message", { cause });
    studioFailure(wrapped);
    const [, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.cause_name).toBe("Error");
    expect(payload.cause_message).toBe("root cause detail");
  });

  it("Error 가 아닌 객체(fetch 응답 JSON 등)도 [object Object] 대신 직렬화해 남긴다", () => {
    studioFailure({ upstream: "timeout", detail: "generator unreachable" });
    const [, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.error_message).not.toBe("[object Object]");
    expect(payload.error_message as string).toContain("generator unreachable");
  });

  it("postgres 스타일 오류(query·parameters 필드 포함)를 넘겨도 그 필드는 로그 payload 에 안 실린다", () => {
    const pgLike = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      query: "INSERT INTO studio_derivation_batches (...) VALUES ($1,$2,$3)",
      parameters: ["secret-idempotency-key", "member-42", "candidate-99"],
    });
    studioFailure(pgLike);
    const [, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(payload)).not.toContain("query");
    expect(Object.keys(payload)).not.toContain("parameters");
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("secret-idempotency-key");
  });

  it("비밀값은 context 로 넘기지 않는 한 로그에 나타나지 않는다", () => {
    studioFailure(new Error("boom"), { route: "derivations.POST", job_id: "job-1" });
    const [, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(payload)).not.toContain("token");
    expect(Object.keys(payload)).not.toContain("password");
  });

  it("알려진 StudioApiError 4xx(흔하지 않은 코드)는 console.error 가 아니라 warn 한 줄만 남긴다", () => {
    studioFailure(new StudioApiError({ status: 422, code: "DERIVATION_KINDS_REQUIRED", message: "같이 만들 갈래를 하나 이상 골라야 합니다" }));
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("401·429 같은 흔한 4xx 는 warn 이 아니라 debug 로 샘플링한다(로그 폭탄 방지)", () => {
    studioFailure(new StudioApiError({ status: 401, code: "TOKEN_INVALID", message: "인증이 필요합니다" }));
    studioFailure(new StudioApiError({ status: 429, code: "RATE_LIMITED", message: "요청이 너무 많습니다" }));
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledTimes(2);
  });

  it("알려진 StudioApiError 5xx 는 console.error 로 남기고, cause 가 있으면 postgres_code·constraint 도 같이 남긴다", () => {
    const pgError = Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
    studioFailure(new StudioApiError({
      status: 503,
      code: "GENERATION_DB_UNAVAILABLE",
      message: "생성 저장소 연결이 불안정해 잠시 후 다시 시도해야 합니다",
      cause: pgError,
    }));
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.code).toBe("GENERATION_DB_UNAVAILABLE");
    expect(payload.postgres_code).toBe("ECONNREFUSED");
    expect(typeof payload.request_id).toBe("string");
  });
});

// M1(PR#75): mapGenerationDatabaseError 는 이제 자기 자리에서 안 찍는다 — request_id 가
// 없는 시점에 찍으면 studioFailure 가 나중에 만드는 request_id 와 못 잇는다. 대신 원본을
// cause 로 실어 던지기만 하고, 실제 로그는 studioFailure 5xx 분기가 request_id 와 함께 낸다.
describe("mapGenerationDatabaseError 는 여기서 찍지 않고 postgres 원인을 cause 로 실어 던진다", () => {
  it("알 수 없는 postgres 오류는 로그를 안 남기고 cause 에 원본을 실어 500 무결성 위반으로 매핑한다", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pgError = Object.assign(new Error("null value in column \"job_id\" violates not-null constraint"), {
      code: "23502",
      constraint_name: "studio_derivation_batches_job_id_not_null",
    });
    const mapped = mapGenerationDatabaseError(pgError);
    expect(mapped.status).toBe(500);
    expect(mapped.code).toBe("GENERATION_DB_INVARIANT_VIOLATION");
    expect(spy).not.toHaveBeenCalled();
    expect((mapped as unknown as { cause?: unknown }).cause).toBe(pgError);
    spy.mockRestore();
  });

  it("studioFailure 로 흘려보내면 그제서야 request_id 와 한 줄로 postgres 원인이 찍힌다", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pgError = Object.assign(new Error("null value in column \"job_id\" violates not-null constraint"), {
      code: "23502",
      constraint_name: "studio_derivation_batches_job_id_not_null",
    });
    const mapped = mapGenerationDatabaseError(pgError);
    studioFailure(mapped, { route: "derivations.POST", job_id: "job-abc" });
    expect(spy).toHaveBeenCalledTimes(1);
    const [, payload] = spy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.postgres_code).toBe("23502");
    expect(payload.constraint).toBe("studio_derivation_batches_job_id_not_null");
    expect(payload.job_id).toBe("job-abc");
    expect(typeof payload.request_id).toBe("string");
    spy.mockRestore();
  });
});
