import { describe, expect, it } from "vitest";

import {
  buildHiggsfieldInvocation,
  higgsfieldExecutionTimeout,
  isHiggsfieldLockBusyError,
} from "@/lib/higgsfield";

describe("Higgsfield CLI 프로세스 간 잠금 계약", () => {
  it("HIGGSFIELD-LOCK-01 정상: 운영 lock 파일이 있으면 모든 CLI를 하나의 배타 잠금으로 실행한다", () => {
    const invocation = buildHiggsfieldInvocation(
      ["generate", "create", "--json"],
      {
        HIGGSFIELD_BIN: "/usr/local/bin/higgsfield",
        HIGGSFIELD_LOCK_DIR: "/root/.config/higgsfield/.cli.lock.d",
        HIGGSFIELD_LOCK_WAIT_SECONDS: "45",
      },
    );

    expect(invocation).toEqual({
      file: "/usr/local/bin/run-higgsfield-locked",
      args: [
        "/usr/local/bin/higgsfield",
        "generate", "create", "--json",
      ],
    });
  });

  it("HIGGSFIELD-LOCK-02 거절: 비정상 wait 값이 CLI argv로 섞이지 않는다", () => {
    const invocation = buildHiggsfieldInvocation(
      ["account", "status"],
      {
        HIGGSFIELD_BIN: "higgsfield",
        HIGGSFIELD_LOCK_DIR: "/credentials/.cli.lock.d",
        HIGGSFIELD_LOCK_WAIT_SECONDS: "0; rm -rf /",
      },
    );

    expect(invocation.file).toBe("/usr/local/bin/run-higgsfield-locked");
    expect(invocation.args).toEqual(["higgsfield", "account", "status"]);
    expect(invocation.args).not.toContain("0; rm -rf /");
    expect(higgsfieldExecutionTimeout(8_000, {
      HIGGSFIELD_LOCK_DIR: "/credentials/.cli.lock.d",
      HIGGSFIELD_LOCK_WAIT_SECONDS: "0; rm -rf /",
    })).toBe(53_000);
  });

  it("HIGGSFIELD-LOCK-03 경계: 로컬에 lock 경로가 없으면 기존 직접 실행을 보존한다", () => {
    expect(buildHiggsfieldInvocation(["auth", "token"], { HIGGSFIELD_BIN: "hf-dev" })).toEqual({
      file: "hf-dev",
      args: ["auth", "token"],
    });
    expect(higgsfieldExecutionTimeout(8_000, {})).toBe(8_000);
  });

  it("HIGGSFIELD-LOCK-04 경계: 잠금 종료 코드 75만 busy로 분류한다", () => {
    expect(isHiggsfieldLockBusyError({ code: 75 })).toBe(true);
    expect(isHiggsfieldLockBusyError({ code: "75" })).toBe(true);
    expect(isHiggsfieldLockBusyError({ code: 1 })).toBe(false);
    expect(isHiggsfieldLockBusyError({ code: "ENOENT" })).toBe(false);
  });

  it("HIGGSFIELD-LOCK-05 경계: 운영 10초 잠금 대기는 접수 API 100초 예산을 넘기지 않는다", () => {
    const env = {
      HIGGSFIELD_LOCK_DIR: "/credentials/.cli.lock.d",
      HIGGSFIELD_LOCK_WAIT_SECONDS: "10",
    };
    const worstCaseReadyAndCreateMs = higgsfieldExecutionTimeout(8_000, env)
      + higgsfieldExecutionTimeout(45_000, env);
    expect(worstCaseReadyAndCreateMs).toBe(73_000);
    expect(worstCaseReadyAndCreateMs).toBeLessThan(100_000);
  });
});
