import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression: ISSUE-004. Next dev의 HMR 연결 때문에 networkidle이 오지 않아
// 이미 그려진 네 방을 탐침이 60초 timeout으로 실패 처리했다.
// Found by /qa on 2026-09-12
// Report: docs/qa/qa-tracker.md

const read = (relativePath: string) => fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("네 방 브라우저 탐침 준비 상태 계약", () => {
  it("문서 유휴 대신 DOM 진입과 실제 방 표시를 기다린다", () => {
    for (const file of ["scripts/probe-four-room-flow.mjs", "scripts/verify-four-room-ui-e2e.mjs"]) {
      const source = read(file);
      expect(source, file).toMatch(/waitUntil:\s*"domcontentloaded"/);
      expect(source, file).not.toMatch(/goto\([^\n]+waitUntil:\s*"networkidle"/);
      expect(source, file).toMatch(/\.waitFor\(\{\s*state:\s*"visible"/);
    }
    expect(read("scripts/probe-four-room-flow.mjs")).toContain("roomRoot.evaluate");
    expect(read("scripts/probe-four-room-flow.mjs")).toContain('dashboard_auth_identity_kind\",\"customer');
    const flowSource = read("scripts/verify-four-room-ui-e2e.mjs");
    expect(flowSource.indexOf("const currentPath")).toBeLessThan(flowSource.indexOf("const flow = await sidebar"));
    expect(flowSource).toContain("blockingNavigation");
    expect(flowSource).toContain('dashboard_auth_identity_kind\", \"customer');
  });
});
