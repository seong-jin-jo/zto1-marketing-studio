import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("API 읽기 전수 검증기 메서드·증거 회귀", () => {
  // Regression: API-READ-ALL-V10. 검증기가 GET만 요청해 명시적 HEAD를 놓쳤고,
  // 3xx를 성공으로 세어 인증 리다이렉트를 정상 API로 오판할 수 있었다.
  // Found by /qa on 2026-09-14
  // Report: docs/qa/osmu-api-read-sweep-v10-gpt-codex.md
  it("GET과 HEAD를 각각 요청하고 3xx를 실패 검토로 분류한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify-api-read-sweep.mjs"), "utf8");

    expect(script).toContain('const READ_METHODS = ["GET", "HEAD"]');
    expect(script).toContain("method,");
    expect(script).toContain('return "리다이렉트 검토"');
    expect(script).toContain("request_count: requests.length");
    expect(script).toContain("method_counts:");
  });

  it("실행 전후 listener PID와 소스 해시가 일치해야 증거를 인정한다", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/verify-api-read-sweep.mjs"), "utf8");

    expect(script).toContain("listener_pids_before: listenerPidsBefore");
    expect(script).toContain("listener_pids_after: listenerPidsAfter");
    expect(script).toContain("source_hash_before: sourceHashBefore");
    expect(script).toContain("source_hash_after: sourceHashAfter");
    expect(script).toContain('collectFiles(path.join(dashboardRoot, "src"))');
    expect(script).toContain('collectFiles(path.join(dashboardRoot, "scripts"))');
    expect(script).toContain('source_hash_scope: ["src/**/*", "scripts/**/*"]');
    expect(script).toContain("evidence_stable: evidenceStable");
    expect(script).toContain("!evidenceStable");
  });
});
