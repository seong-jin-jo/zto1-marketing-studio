import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("S7 브라우저 증거의 API 경계", () => {
  it("S7-R1-M6 브라우저 fixture가 모든 API를 한 번에 가로채 실제 route 증거로 오인되게 하지 않는다", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/verify-studio-s7-e2e.mjs"), "utf8");

    expect(source).not.toContain('context.route("**/api/**"');
    expect(source).toContain('apiEvidence: "browser-fixture"');
    expect(source).toContain('draftRouteEvidence: "vitest-route-integration"');
  });
});
