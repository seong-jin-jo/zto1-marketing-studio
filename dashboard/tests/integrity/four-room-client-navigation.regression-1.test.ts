import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: ISSUE-006. Next.js client navigation이 link.click() 안에서 먼저 끝나면
// 뒤늦게 설치한 waitForURL({ waitUntil: "commit" })은 이미 지난 commit을 기다리며
// 30초 timeout으로 정상 방 이동을 실패 처리했다.
// Found by /qa on 2026-09-12
// Report: docs/qa/qa-tracker.md

describe("네 방 사람 클릭 검증기의 client navigation 대기", () => {
  it("URL 대기와 링크 클릭을 함께 시작하고 폭과 방을 로그에 남긴다", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/verify-four-room-ui-e2e.mjs"),
      "utf8",
    );

    const waitIndex = source.indexOf("page.waitForURL((url)");
    const clickIndex = source.indexOf("link.click(),", waitIndex);
    expect(source).toContain("await Promise.all([");
    expect(waitIndex).toBeGreaterThan(-1);
    expect(clickIndex).toBeGreaterThan(waitIndex);
    expect(source).toContain("검증 ${tag} ${room.label}");
  });
});
