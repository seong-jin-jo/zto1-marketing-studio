import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildHiggsfieldInvocation,
  higgsfieldCredentialsNeedRefresh,
  higgsfieldExecutionTimeout,
  isHiggsfieldLockBusyError,
  refreshHiggsfieldCredentialsIfNeeded,
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
    expect(isHiggsfieldLockBusyError({ code: 75, stderr: "HIGGSFIELD_LOCK_BUSY\n" })).toBe(true);
    expect(isHiggsfieldLockBusyError({ code: "75", stderr: "HIGGSFIELD_LOCK_BUSY" })).toBe(true);
    expect(isHiggsfieldLockBusyError({ code: 75, stderr: "child returned 75" })).toBe(false);
    expect(isHiggsfieldLockBusyError({ code: 1 })).toBe(false);
    expect(isHiggsfieldLockBusyError({ code: "ENOENT" })).toBe(false);
  });

  it("HIGGSFIELD-LOCK-05 경계: refresh 구간만 10초 잠금을 기다리고 생성 명령은 잠금 없이 실행한다", () => {
    const env = {
      HIGGSFIELD_LOCK_DIR: "/credentials/.cli.lock.d",
      HIGGSFIELD_LOCK_WAIT_SECONDS: "10",
    };
    const worstCaseReadyAndCreateMs = higgsfieldExecutionTimeout(8_000, env, true)
      + higgsfieldExecutionTimeout(45_000, env, false);
    expect(worstCaseReadyAndCreateMs).toBe(63_000);
    expect(worstCaseReadyAndCreateMs).toBeLessThan(100_000);
  });

  it("HIGGSFIELD-LOCK-06 경계: 만료 5분 초과면 unlocked, 임박·누락이면 refresh lock을 요구한다", () => {
    const fixtureRoot = mkdtempSync(resolve(tmpdir(), "higgsfield-expiry-"));
    const credentialFile = resolve(fixtureRoot, "credentials.json");
    const env = {
      HIGGSFIELD_LOCK_DIR: resolve(fixtureRoot, ".cli.lock.d"),
      HIGGSFIELD_CREDENTIAL_FILE: credentialFile,
    };
    const now = Date.now();
    try {
      writeFileSync(credentialFile, JSON.stringify({
        access_token: "access",
        refresh_token: "refresh",
        expires_at: new Date(now + 5 * 60 * 1000 + 1).toISOString(),
      }));
      expect(higgsfieldCredentialsNeedRefresh(env, now)).toBe(false);

      writeFileSync(credentialFile, JSON.stringify({
        access_token: "access",
        refresh_token: "refresh",
        expires_at: new Date(now + 5 * 60 * 1000).toISOString(),
      }));
      expect(higgsfieldCredentialsNeedRefresh(env, now)).toBe(true);

      writeFileSync(credentialFile, JSON.stringify({ access_token: "access" }));
      expect(higgsfieldCredentialsNeedRefresh(env, now)).toBe(true);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("HIGGSFIELD-LOCK-07 경계: auth token이 갱신하지 않으면 실제 명령도 잠금을 유지한다", async () => {
    const fixtureRoot = mkdtempSync(resolve(tmpdir(), "higgsfield-refresh-recheck-"));
    const credentialFile = resolve(fixtureRoot, "credentials.json");
    const env = {
      HIGGSFIELD_LOCK_DIR: resolve(fixtureRoot, ".cli.lock.d"),
      HIGGSFIELD_CREDENTIAL_FILE: credentialFile,
    };
    const now = Date.now();
    let refreshCalls = 0;
    try {
      writeFileSync(credentialFile, JSON.stringify({
        access_token: "access",
        refresh_token: "refresh",
        expires_at: new Date(now + 2 * 60 * 1000).toISOString(),
      }));
      const keepCommandLocked = await refreshHiggsfieldCredentialsIfNeeded(
        env,
        async () => { refreshCalls += 1; },
        () => now,
      );
      expect(refreshCalls).toBe(1);
      expect(keepCommandLocked).toBe(true);

      const unlockAfterRotation = await refreshHiggsfieldCredentialsIfNeeded(
        env,
        async () => {
          refreshCalls += 1;
          writeFileSync(credentialFile, JSON.stringify({
            access_token: "rotated-access",
            refresh_token: "rotated-refresh",
            expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
          }));
        },
        () => now,
      );
      expect(refreshCalls).toBe(2);
      expect(unlockAfterRotation).toBe(false);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
