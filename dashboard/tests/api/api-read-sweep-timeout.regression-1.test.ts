import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("API 읽기 전수 검증기 요청 제한시간 회귀", () => {
  // Regression: API-READ-20260913-01. Next 개발 서버의 최초 라우트 컴파일이
  // 15초를 넘으면 정상 API도 요청 실패로 오분류됐다.
  // Found by /qa on 2026-09-13
  // Report: docs/qa/osmu-api-read-sweep-v6-gpt-codex-20260913.md
  it("요청별 120초 상한과 전체 실행시간 예산을 함께 제공한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify-api-read-sweep.mjs"), "utf8");

    expect(script).toContain('process.env.API_SWEEP_TIMEOUT_MS || "120000"');
    expect(script).toContain("AbortSignal.timeout(Math.min(requestTimeoutMs, remainingMs))");
    expect(script).toContain("request_timeout_ms: requestTimeoutMs");
    expect(script).toContain('process.env.API_SWEEP_TOTAL_TIMEOUT_MS || "300000"');
    expect(script).toContain("total_timeout_ms: totalTimeoutMs");
  });
});
