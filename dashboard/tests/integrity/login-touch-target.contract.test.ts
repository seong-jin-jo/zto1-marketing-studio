import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const loginSource = readFileSync(resolve(process.cwd(), "src/app/login/page.tsx"), "utf8");

describe("고객 로그인 터치 타깃 계약", () => {
  it("QA-LOGIN-TOUCH-01 정상: Google 로그인 단추가 공통 44px 조작 영역을 사용한다", () => {
    const button = loginSource.match(/<button[\s\S]*?className=\"([^\"]+)\"[\s\S]*?>/);
    expect(button?.[1]).toContain("min-h-control-touch");
  });
});
