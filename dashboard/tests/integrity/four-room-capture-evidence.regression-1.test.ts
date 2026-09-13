import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: ISSUE-010. 네 방 QA 캡처가 디자인 원본 폴더에 쓰이고 전체 페이지를
// 저장해, 원본과 QA 결과가 섞이고 같은 viewport 화면 대조가 불가능했다.
// Found by /qa on 2026-09-14
// Report: docs/qa/qa-tracker.md

describe("네 방 QA 캡처 증거 계약", () => {
  it("QA 결과는 logs/diff에 두고 현재 viewport만 캡처한다", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/verify-four-room-ui-e2e.mjs"),
      "utf8",
    );

    expect(source).toContain('../logs/diff/osmu-four-room-flow/captures');
    expect(source).toContain("fullPage: false");
    expect(source).not.toContain("fullPage: true");
    expect(source).not.toContain("../docs/design/prototypes/legacy-prototype-20260912/prototype/qa-flow");
  });
});
