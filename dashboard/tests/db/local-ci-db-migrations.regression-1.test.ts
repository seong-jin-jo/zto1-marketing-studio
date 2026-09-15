import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(resolve(__dirname, "../../../scripts/local-ci-db.sh"), "utf8");

describe("로컬 QA 데이터베이스 migration 배선 회귀", () => {
  // Regression: API-READ-ALL-V12. 새 QA DB에 studio_derivation_batches가 없어 읽기 경로가 HTTP 500을 반환했다.
  // Found by /qa on 2026-09-15
  // Report: docs/qa/qa-tracker.md
  it("기준 schema와 RLS 뒤 explicit manifest의 legacy migration을 적용한다", () => {
    const schemaStep = script.indexOf("dashboard/db/schema.sql");
    const rlsStep = script.indexOf("dashboard/db/rls.sql");
    const migrationStep = script.indexOf('bash "$ROOT/dashboard/db/run-migrations.sh" apply-legacy');

    expect(schemaStep).toBeGreaterThan(-1);
    expect(rlsStep).toBeGreaterThan(schemaStep);
    expect(migrationStep).toBeGreaterThan(rlsStep);
    expect(script).toContain('RUNNER_COMMIT="$(git -C "$ROOT" rev-parse HEAD)"');
    expect(script).toContain('|| { echo "⛔ legacy migration 적용 실패"; exit 1; }');
  });
});
