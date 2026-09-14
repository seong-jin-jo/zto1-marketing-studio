import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: V24-DR-006. 운영 화면 주석이 등록된 provider 수와 다른 고정 숫자를 주장했다.
// Found by /qa on 2026-08-28
// Report: docs/_archive/legacy-20260912/audit/v24-design-review.md

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("v24 OAuth provider 진실원 회귀 계약", () => {
  it("고정 개수를 주장하지 않고 API가 준 provider 목록을 그린다", () => {
    const source = read("src/app/operator/customers/page.tsx");

    expect(source).not.toContain("14개 플랫폼 폼");
    expect(source).toContain("groupOAuthProvidersForDisplay(oauthProviders)");
    expect(source).toContain("oauthProviderGroups.map");
  });
});
