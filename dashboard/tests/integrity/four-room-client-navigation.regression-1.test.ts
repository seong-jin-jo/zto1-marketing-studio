import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: ISSUE-006. Next.js client navigation은 문서 commit 없이 history를
// 바꾼다. commit을 기다리면 실제 주소가 바뀌어도 링크 클릭을 반복하며 timeout이 난다.
// Found by /qa on 2026-09-12
// Report: docs/qa/qa-tracker.md

describe("네 방 사람 클릭 검증기의 client navigation 대기", () => {
  it("주소 문자열 관찰과 링크 클릭을 함께 시작하고 문서 commit을 기다리지 않는다", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/verify-four-room-ui-e2e.mjs"),
      "utf8",
    );

    const waitIndex = source.indexOf("page.waitForFunction(");
    const clickIndex = source.indexOf("link.click({ noWaitAfter: true })", waitIndex);
    expect(source).toContain("await Promise.all([");
    expect(waitIndex).toBeGreaterThan(-1);
    expect(clickIndex).toBeGreaterThan(waitIndex);
    expect(source).not.toContain('waitUntil: "commit"');
    expect(source).toContain("검증 ${tag} ${room.label}");
  });
});
