import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: ISSUE-011. 새로 뜬 Next 개발 서버가 /api/tenant-tokens를
// 15초 넘게 처음 컴파일하자 두 검증기가 요청 본문을 중단하고
// 제품 흐름 실패로 오판했다. Found by /qa on 2026-09-18.

describe("네 방 검증용 고객 토큰 요청 제한시간", () => {
  it("단면과 네 폭 검증기 모두 방 준비와 같은 단계별 상한을 쓴다", () => {
    const sources = [
      "scripts/probe-four-room-flow.mjs",
      "scripts/verify-four-room-ui-e2e.mjs",
    ].map((file) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8"));

    for (const source of sources) {
      expect(source).toContain("Math.min(readyTimeoutMs,");
      expect(source).not.toMatch(/Math\.min\(15_?000,/);
    }
  });
});
