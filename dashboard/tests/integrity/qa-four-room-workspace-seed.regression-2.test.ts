import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: ISSUE-008. 반복 네 방 QA가 고정 작업 공간의 월 생성 100회를 모두 써
// 기본 흐름의 첫 생성 요청이 STUDIO_LLM_QUOTA_EXHAUSTED로 중단됐다.
// Found by /qa on 2026-09-13
// Report: docs/qa/qa-tracker.md

describe("네 방 E2E 작업 공간 월 사용량 시드 계약", () => {
  it("테스트 DB 시드가 고정 작업 공간의 현재 UTC 월 생성 사용량을 0으로 복원한다", () => {
    const seed = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/seed-test-tenants.sql"),
      "utf8",
    );

    expect(seed).toContain("to_char(timezone('UTC', now()), 'YYYY-MM')");
    expect(seed).toContain("ON CONFLICT (tenant_id) DO UPDATE");
    expect(seed).toContain("generations_used = 0");
  });
});
