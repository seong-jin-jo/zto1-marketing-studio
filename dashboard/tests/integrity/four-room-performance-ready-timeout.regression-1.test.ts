import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: ISSUE-007. 공유 Next 개발 서버의 콜드 컴파일이 30초를 넘으면
// 이미 정상 렌더된 성과실을 제안 준비 실패로 오분류했다.
// Found by /qa on 2026-09-13
// Report: docs/qa/qa-tracker.md

describe("네 방 화면 준비 제한시간 회귀", () => {
  it("120초 기본값을 최초 진입, 방 이동, 성과 데이터 준비에 함께 적용하고 관찰 증거를 남긴다", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/verify-four-room-ui-e2e.mjs"),
      "utf8",
    );

    expect(source).toContain('process.env.FOUR_ROOM_READY_TIMEOUT_MS || "120000"');
    expect(source).toContain("{ timeout: readyTimeoutMs }");
    expect(source).toContain('waitUntil: "commit", timeout: readyTimeoutMs');
    expect(source).toContain('waitUntil: "domcontentloaded", timeout: readyTimeoutMs');
    expect(source).not.toContain("timeout: 30000");
    expect(source).toContain("readyTimeoutMs, observations");
  });
});
