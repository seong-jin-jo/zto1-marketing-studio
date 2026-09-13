import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";

describe("개발 서버 번들러 계약", () => {
  it("반복된 Turbopack 치명 오류를 피하도록 기본 개발 서버는 Webpack을 사용한다", () => {
    expect(packageJson.scripts.dev).toMatch(/^next dev\b/);
    expect(packageJson.scripts.dev).toContain("--webpack");
  });

  it("운영 빌드는 기존 Next 기본 빌드 경로를 유지한다", () => {
    expect(packageJson.scripts.build).toBe("next build");
  });
});
