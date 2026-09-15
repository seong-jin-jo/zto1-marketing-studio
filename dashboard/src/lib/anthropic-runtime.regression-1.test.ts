import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const anthropic = readFileSync(resolve(process.cwd(), "src/lib/anthropic.ts"), "utf8");

describe("OSMU 공유 Claude CLI 런타임 계약", () => {
  it("QA-FLOW-RUNTIME-02 cron PATH 밖의 Claude CLI를 사용자 설치 절대경로로 찾는다", () => {
    // Regression: ISSUE-015. cron이 띄운 Next 서버의 PATH에 ~/.local/bin이 없어
    // 공유 Claude CLI spawn이 실패했고 네 방 기본 흐름이 후보 0장에서 끊겼다.
    // Found by /qa on 2026-09-15.
    // Report: docs/qa/qa-tracker.md
    expect(anthropic).toContain("function resolveClaudeBins(): string[]");
    expect(anthropic).toContain('path.join(os.homedir(), ".local", "bin", "claude")');
    expect(anthropic).toContain("accessSync(candidate, constants.X_OK)");
    expect(anthropic).toContain("const CLAUDE_BINS = resolveClaudeBins()");
    expect(anthropic).toContain('code === "ENOENT" || code === "EACCES"');
  });
});
