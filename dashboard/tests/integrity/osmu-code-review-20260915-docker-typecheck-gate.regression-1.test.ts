import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("CODE-REVIEW-20260915-26 배포 타입 검사 게이트", () => {
  it("CODE-REVIEW-20260915-26 정상: Docker 이미지 빌드가 같은 소스의 타입 검사를 먼저 실행한다", () => {
    const dockerfile = fs.readFileSync(path.resolve(process.cwd(), "Dockerfile"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts["typecheck:ci"]).toBe("tsc --noEmit -p tsconfig.ci.json");
    expect(dockerfile).toContain("RUN npm run typecheck:ci && npm run build");
    expect(dockerfile.indexOf("npm run typecheck:ci")).toBeLessThan(dockerfile.indexOf("npm run build"));
  });
});
