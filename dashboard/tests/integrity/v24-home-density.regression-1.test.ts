import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: V24-DR-002. 성과실 아래에 레거시 Home 패널이 다시 붙어 정보가 중복됐다.
// Found by /qa on 2026-08-28
// Report: docs/_archive/legacy-20260912/audit/v24-design-review.md

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("v24 성과실 정보 밀도 회귀 계약", () => {
  it("PerformanceRoom 한 벌만 렌더하고 레거시 Home 패널을 다시 붙이지 않는다", () => {
    const source = read("src/components/home/PerformanceDashboard.tsx");

    expect(source.match(/<PerformanceRoom\b/g)).toHaveLength(1);
    expect(source).not.toContain("<PipelineTimeline");
    expect(source).not.toContain("useActivity(");
    expect(source).not.toContain("useAlerts(");
    expect(source).not.toContain("useAgentLogs(");
    expect(source).not.toContain("useErrors(");
    expect(source).not.toContain("Channels Status");
    expect(source).not.toContain(">최근 활동<");
  });
});
