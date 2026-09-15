import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import packageJson from "../../package.json";

describe("개발 서버 번들러 계약", () => {
  it("반복된 Turbopack 치명 오류를 피하도록 기본 개발 서버는 Webpack을 사용한다", () => {
    expect(packageJson.scripts.dev).toMatch(/next dev\b/);
    expect(packageJson.scripts.dev).toContain("OSMU_BUILD_COMMIT=$(git rev-parse HEAD)");
    expect(packageJson.scripts.dev).toContain("--webpack");
  });

  it("QA-FLOW-RUNTIME-01 감독 복구 경로도 검증된 개발 명령을 사용한다", () => {
    // Regression: 감독의 직접 `next dev`가 package.json의 Webpack 계약을 우회했고,
    // 네 방 탐침 중 Turbopack 런타임 패닉을 냈다.
    // Found by /qa on 2026-09-14.
    const supervisor = readFileSync(resolve(process.cwd(), "../scripts/osmu-supervisor.sh"), "utf8");
    expect(supervisor).toContain("npm run dev -- -p 3456");
    expect(supervisor).not.toContain("nohup npx next dev -p 3456");
  });

  it("운영 빌드는 기존 Next 기본 빌드 경로를 유지한다", () => {
    expect(packageJson.scripts.build).toBe("next build");
  });
});
