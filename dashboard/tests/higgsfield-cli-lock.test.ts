import { describe, expect, it } from "vitest";

import { buildHiggsfieldInvocation } from "@/lib/higgsfield";

describe("Higgsfield CLI 프로세스 간 잠금 계약", () => {
  it("HIGGSFIELD-LOCK-01 정상: 운영 lock 파일이 있으면 모든 CLI를 하나의 배타 잠금으로 실행한다", () => {
    const invocation = buildHiggsfieldInvocation(
      ["generate", "create", "--json"],
      {
        HIGGSFIELD_BIN: "/usr/local/bin/higgsfield",
        HIGGSFIELD_LOCK_FILE: "/root/.config/higgsfield/.cli.lock",
        HIGGSFIELD_LOCK_WAIT_SECONDS: "45",
      },
    );

    expect(invocation).toEqual({
      file: "flock",
      args: [
        "--exclusive",
        "--wait", "45",
        "--conflict-exit-code", "75",
        "--no-fork",
        "/root/.config/higgsfield/.cli.lock",
        "/usr/local/bin/higgsfield",
        "generate", "create", "--json",
      ],
    });
  });

  it("HIGGSFIELD-LOCK-02 거절: 비정상 wait 값은 잠금을 우회하지 않고 안전한 기본값을 쓴다", () => {
    const invocation = buildHiggsfieldInvocation(
      ["account", "status"],
      {
        HIGGSFIELD_BIN: "higgsfield",
        HIGGSFIELD_LOCK_FILE: "/credentials/.cli.lock",
        HIGGSFIELD_LOCK_WAIT_SECONDS: "0; rm -rf /",
      },
    );

    expect(invocation.file).toBe("flock");
    expect(invocation.args.slice(0, 6)).toEqual([
      "--exclusive", "--wait", "45", "--conflict-exit-code", "75", "--no-fork",
    ]);
    expect(invocation.args).not.toContain("0; rm -rf /");
  });

  it("HIGGSFIELD-LOCK-03 경계: 로컬에 lock 경로가 없으면 기존 직접 실행을 보존한다", () => {
    expect(buildHiggsfieldInvocation(["auth", "token"], { HIGGSFIELD_BIN: "hf-dev" })).toEqual({
      file: "hf-dev",
      args: ["auth", "token"],
    });
  });
});
