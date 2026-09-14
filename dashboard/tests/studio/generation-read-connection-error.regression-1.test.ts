import { beforeEach, describe, expect, it, vi } from "vitest";

const withTenantMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: vi.fn(),
  withTenant: withTenantMock,
}));

function connectionError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

describe("Studio 생성 읽기 연결 오류 회귀", () => {
  beforeEach(() => {
    withTenantMock.mockReset();
  });

  // Regression: API-READ-20260914-091409-01. 파생 작업 읽기의 연결 제한시간 초과가 일반 500이 됐다.
  // Found by /qa on 2026-09-14
  // Report: docs/qa/osmu-api-read-sweep-v8-gpt-codex.md
  it.each([
    ["파생 작업", "findDerivation", ["member", "00000000-0000-4000-8000-000000000000", ["workspace"]]],
    ["생성 작업", "findJob", ["member", "00000000-0000-4000-8000-000000000000", ["workspace"]]],
  ] as const)("%s 읽기의 연결 제한시간 초과를 재시도 가능한 503으로 분류한다", async (_label, method, args) => {
    withTenantMock.mockRejectedValueOnce(connectionError("CONNECT_TIMEOUT"));
    const { PostgresGenerationRepository } = await import("@/lib/studio/generation/repository");
    const repository = new PostgresGenerationRepository();

    await expect(repository[method](...args)).rejects.toEqual(expect.objectContaining({
      status: 503,
      code: "GENERATION_DB_UNAVAILABLE",
      retryable: true,
    }));
  });

  it("알 수 없는 읽기 오류를 재시도 가능하다고 가장하지 않는다", async () => {
    withTenantMock.mockRejectedValueOnce(connectionError("XX000"));
    const { PostgresGenerationRepository } = await import("@/lib/studio/generation/repository");
    const repository = new PostgresGenerationRepository();

    await expect(repository.findDerivation(
      "member",
      "00000000-0000-4000-8000-000000000000",
      ["workspace"],
    )).rejects.toEqual(expect.objectContaining({
      status: 500,
      code: "GENERATION_DB_INVARIANT_VIOLATION",
      retryable: false,
    }));
  });
});
