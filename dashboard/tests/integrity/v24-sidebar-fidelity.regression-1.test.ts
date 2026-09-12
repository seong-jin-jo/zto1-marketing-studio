import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: V24-DR-001. 현재 방 상태를 중복 설명하는 딱지가 실제 작업 흐름을 가렸다.
// Found by /qa on 2026-08-28
// Report: docs/_archive/legacy-20260912/audit/v24-design-review.md

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("v24 사이드바 정합 회귀 계약", () => {
  it("활성 방은 접근성 상태와 색으로 표시하고 사족 딱지를 다시 붙이지 않는다", () => {
    const source = read("src/components/layout/Sidebar.tsx");

    expect(source).toContain('aria-current={active ? "page" : undefined}');
    expect(source).not.toContain("지금 여기");
  });
});
