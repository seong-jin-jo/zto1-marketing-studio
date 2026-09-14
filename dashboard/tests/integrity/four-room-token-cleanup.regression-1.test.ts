import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  fs.readFileSync(path.resolve(process.cwd(), `scripts/${name}`), "utf8");

// Regression: FLOW-PROBE-CLEANUP-20260914-01. 네 방 검증이 전체 실행시간을 다 쓰면
// 임시 고객 토큰 폐기 요청이 1ms 안에 취소되고도 종료 코드 0을 반환했다.
// Found by /qa on 2026-09-14
// Report: docs/qa/qa-tracker.md
describe("네 방 QA 임시 고객 토큰 폐기 계약", () => {
  it.each(["probe-four-room-flow.mjs", "verify-four-room-ui-e2e.mjs"])(
    "%s은 본 검증 마감과 독립된 폐기 제한시간을 쓰고 폐기 실패를 실패로 반환한다",
    (file) => {
      const source = read(file);

      expect(source).toContain("const cleanupRequest");
      expect(source).toMatch(/cleanupRequest[\s\S]*AbortSignal\.timeout\(60_000\)/);
      expect(source).toContain("process.exitCode");
      expect(source).not.toContain("process.exit(0)");
    },
  );
});
