import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: ISSUE-003. apply-schema.sh --seed 뒤 네 방 E2E 고정 작업 공간이 없어
// 생성 장부와 임시 고객 토큰 발급이 외래키 위반으로 첫 단계에서 중단됐다.
// Found by /qa on 2026-09-12
// Report: docs/qa/qa-tracker.md

describe("네 방 E2E 작업 공간 시드 계약", () => {
  it("테스트 DB 시드가 검증 스크립트의 고정 작업 공간을 만든다", () => {
    const seed = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/seed-test-tenants.sql"),
      "utf8",
    );

    expect(seed).toContain("cd1d0a40-540d-4524-9b49-bf2445d82182");
    expect(seed).toContain("qa-four-room");
    expect(seed).toContain("'active', 'team'");
  });
});
