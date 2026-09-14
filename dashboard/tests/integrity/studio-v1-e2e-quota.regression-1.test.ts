import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: ISSUE-005. 고정 QA 작업 공간이 미승인 체험 한도 20회를 소진해
// Studio v1 E2E의 두 번째 실제 생성이 429로 끊겼고, 검증기는 실패 응답을 data로
// 오인해 TypeError까지 덧붙였다.
// Found by /qa on 2026-09-12
// Report: docs/qa/qa-tracker.md

describe("Studio v1 실제 생성 E2E의 QA 작업 공간과 실패 경계", () => {
  it("고정 QA 작업 공간은 공유 AI 승인 fixture로 복원된다", () => {
    const seed = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/seed-test-tenants.sql"),
      "utf8",
    );

    expect(seed).toContain("shared_cli_approved_at");
    expect(seed).toContain("COALESCE(tenants.shared_cli_approved_at, EXCLUDED.shared_cli_approved_at)");
  });

  it("교차 시간대 생성 실패는 후보 접근 전에 응답을 기록하고 종료한다", () => {
    const verifier = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/verify-studio-v1-e2e.mjs"),
      "utf8",
    );

    expect(verifier).toContain("oppositeZoneCreated.status !== 201 || !oppositeZoneCreatedBody.data");
    expect(verifier.indexOf("oppositeZoneCreated.status !== 201")).toBeLessThan(
      verifier.indexOf("rejectAllCandidates(oppositeZonePayload)"),
    );
  });
});
