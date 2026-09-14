import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("API 읽기 전수 검증기 개발 서버 병렬도 회귀", () => {
  // Regression: API-READ-20260914-1313-02. 처음 보는 Route Handler 105개를
  // 4개씩 컴파일하면 Next 개발 서버가 CPU 100%에서 멈추고 39개를 놓쳤다.
  // Found by /qa on 2026-09-14
  // Report: docs/qa/osmu-api-read-sweep-v9-gpt-codex.md
  it("기본값은 콜드 컴파일을 한 번에 하나로 제한하고 명시 설정은 유지한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify-api-read-sweep.mjs"), "utf8");

    expect(script).toContain('process.env.API_SWEEP_CONCURRENCY || "1"');
    expect(script).toContain("sweepConcurrency > 12");
    expect(script).toContain("Math.min(sweepConcurrency, files.length)");
    expect(script).toContain("concurrency: sweepConcurrency");
  });
});
