import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: ISSUE-009. 네 방 단면 탐침만 30초 고정 제한시간을 써서
// 같은 성과실을 4폭 검증기는 통과하고 탐침은 실패하는 상반된 판정이 났다.
// Found by /qa on 2026-09-13
// Report: docs/qa/qa-tracker.md

describe("네 방 단면 탐침 준비 제한시간 계약", () => {
  it("4폭 검증기와 같은 설정 가능한 120초 정책을 페이지와 방 표시에 적용한다", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/probe-four-room-flow.mjs"),
      "utf8",
    );

    expect(source).toContain('process.env.FOUR_ROOM_READY_TIMEOUT_MS||"120000"');
    expect(source).toContain('timeout:readyTimeoutMs');
    expect(source).not.toContain("timeout:30000");
    expect(source).not.toContain("timeout:60000");
  });
});
