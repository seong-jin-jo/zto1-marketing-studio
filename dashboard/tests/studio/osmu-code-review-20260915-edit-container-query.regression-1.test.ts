import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("CODE-REVIEW-20260915-25 편집 목차 컨테이너 반응형", () => {
  it("CODE-REVIEW-20260915-25 정상: 브라우저 폭이 아니라 편집 작업대 폭으로 144px 상태를 고른다", () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), "src/components/studio/StudioRooms.module.css"), "utf8");
    expect(css).toContain("container-name: edit-workbench");
    expect(css).toContain("@container edit-workbench (max-width: 24.4375rem)");
    expect(css).toMatch(/@container edit-workbench[\s\S]*?max-height:\s*9rem/);
    expect(css).not.toContain("@media (max-width: 24.4375rem)");
  });
});
