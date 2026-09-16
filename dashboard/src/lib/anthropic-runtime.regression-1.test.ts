import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const anthropic = readFileSync(resolve(process.cwd(), "src/lib/anthropic.ts"), "utf8");
const supervisor = readFileSync(resolve(process.cwd(), "../scripts/osmu-supervisor.sh"), "utf8");

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

  it("QA-FLOW-RUNTIME-03 감독 실행 앱도 macOS 로그인 키체인 세션을 Claude CLI에 승계한다", () => {
    // Regression: ISSUE-017. localhost의 실제 후보 생성만 OAuth refresh 실패로 끊겼다.
    // 짧은 CLI 호출은 남은 access token으로 통과해 실행 파일 정상으로 오인됐다.
    expect(supervisor).toContain("resolve_security_session_id()");
    expect(supervisor).toContain("kSCSecuritySessionID");
    expect(supervisor).toContain("export SECURITYSESSIONID");
    expect(anthropic).toContain('"TERM", "SECURITYSESSIONID"');
    expect(anthropic).toContain("env: claudeCliEnv()");
  });
});
