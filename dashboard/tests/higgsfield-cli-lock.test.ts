import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildHiggsfieldInvocation,
  assertHiggsfieldReady,
  hfRun,
  higgsfieldCredentialsNeedRefresh,
  higgsfieldExecutionTimeout,
  isHiggsfieldLockBusyError,
  refreshHiggsfieldCredentialsIfNeeded,
  resolveHiggsfieldCommandCredentialLock,
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

  it("HIGGSFIELD-LOCK-08 정상: 같은 요청의 준비 확인 결과가 있으면 두 번째 auth token 확인을 생략한다", async () => {
    let refreshCalls = 0;
    const refresh = async () => {
      refreshCalls += 1;
      return true;
    };

    expect(await resolveHiggsfieldCommandCredentialLock(false, refresh)).toBe(false);
    expect(await resolveHiggsfieldCommandCredentialLock(true, refresh)).toBe(true);
    expect(refreshCalls).toBe(0);

    expect(await resolveHiggsfieldCommandCredentialLock(undefined, refresh)).toBe(true);
    expect(refreshCalls).toBe(1);
  });

  it("HIGGSFIELD-LOCK-09 통합: 준비 확인 결과를 이미지·영상·완료 조회의 같은 hfRun 호출에 전달한다", () => {
    const routes = [
      "src/app/api/higgsfield/image/route.ts",
      "src/app/api/higgsfield/video/route.ts",
    ].map((relativePath) => readFileSync(resolve(process.cwd(), relativePath), "utf8"));

    for (const source of routes) {
      expect(source).toContain("const credentialLockDecision = await assertHiggsfieldReady()");
      expect(source).toMatch(/hfRun\([\s\S]*?credentialLockDecision\)/);
    }

    const finalizer = readFileSync(resolve(process.cwd(), "src/lib/higgsfield-finalize.ts"), "utf8");
    const queueStart = finalizer.indexOf("withHiggsfieldConcurrency(async () => {");
    const readyCheck = finalizer.indexOf("const credentialLockDecision = await assertHiggsfieldReady()", queueStart);
    const run = finalizer.indexOf("hfRun(", readyCheck);
    expect(queueStart).toBeGreaterThan(-1);
    expect(readyCheck).toBeGreaterThan(queueStart);
    expect(run).toBeGreaterThan(readyCheck);
  });

  it.runIf(process.platform === "linux")(
    "HIGGSFIELD-LOCK-09B 통합: Linux flock에서 실제 준비 확인과 생성 호출은 auth token을 한 번만 실행한다",
    async () => {
    const fixtureRoot = mkdtempSync(resolve(tmpdir(), "higgsfield-request-reuse-"));
    const credentialFile = resolve(fixtureRoot, "credentials.json");
    const callLog = resolve(fixtureRoot, "calls.log");
    const fakeCli = resolve(fixtureRoot, "higgsfield-test-cli");
    const now = Date.now();
    const savedEnv = {
      HIGGSFIELD_BIN: process.env.HIGGSFIELD_BIN,
      HIGGSFIELD_LOCK_DIR: process.env.HIGGSFIELD_LOCK_DIR,
      HIGGSFIELD_LOCK_WRAPPER: process.env.HIGGSFIELD_LOCK_WRAPPER,
      HIGGSFIELD_LOCK_WAIT_SECONDS: process.env.HIGGSFIELD_LOCK_WAIT_SECONDS,
      HIGGSFIELD_CREDENTIAL_FILE: process.env.HIGGSFIELD_CREDENTIAL_FILE,
      HIGGSFIELD_TEST_CALL_LOG: process.env.HIGGSFIELD_TEST_CALL_LOG,
    };
    const restoreEnv = () => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    };

    try {
      writeFileSync(credentialFile, JSON.stringify({
        access_token: "expiring-access",
        refresh_token: "refresh",
        expires_at: new Date(now + 2 * 60 * 1000).toISOString(),
      }), { mode: 0o600 });
      writeFileSync(fakeCli, `#!/bin/sh
set -eu
printf '%s %s\n' "\${1:-}" "\${2:-}" >> "$HIGGSFIELD_TEST_CALL_LOG"
if [ "\${1:-}" = auth ] && [ "\${2:-}" = token ]; then
  printf '%s' '${JSON.stringify({
    access_token: "rotated-access",
    refresh_token: "rotated-refresh",
    expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
  })}' > "$HIGGSFIELD_CREDENTIAL_FILE"
fi
printf '{"ok":true}\n'
`, { mode: 0o700 });
      chmodSync(fakeCli, 0o700);
      process.env.HIGGSFIELD_BIN = fakeCli;
      process.env.HIGGSFIELD_LOCK_DIR = resolve(fixtureRoot, ".cli.lock.d");
      process.env.HIGGSFIELD_LOCK_WRAPPER = resolve(process.cwd(), "scripts/run-higgsfield-locked.sh");
      process.env.HIGGSFIELD_LOCK_WAIT_SECONDS = "2";
      process.env.HIGGSFIELD_CREDENTIAL_FILE = credentialFile;
      process.env.HIGGSFIELD_TEST_CALL_LOG = callLog;

      const credentialLockDecision = await assertHiggsfieldReady();
      expect(credentialLockDecision).toBe(false);
      await hfRun(["generate", "create", "fixture", "--json"], 2_000, credentialLockDecision);

      expect(readFileSync(callLog, "utf8").trim().split("\n")).toEqual([
        "auth token",
        "generate create",
      ]);
    } finally {
      restoreEnv();
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
    },
  );

  it("HIGGSFIELD-LOCK-10 계약: 검증기는 internal과 실제 credential bind mount의 두 컨테이너 모드를 구분한다", () => {
    const source = readFileSync(resolve(process.cwd(), "../scripts/verify-higgsfield-lock.sh"), "utf8");

    expect(source).toContain("--lock-path");
    expect(source).toContain('if [ "$lock_path_mode" = "bind" ]');
    expect(source).toContain('credential_dir="${HIGGSFIELD_CREDENTIAL_DIR:-$HOME/.config/higgsfield}"');
    expect(source).toContain('containers=("$container_a" "$container_b")');
  });

  it("HIGGSFIELD-LOCK-11 거절: 과도하거나 잘못된 stress 매개변수는 Docker 실행 전에 거절한다", () => {
    const script = resolve(process.cwd(), "../scripts/verify-higgsfield-lock.sh");
    const invalidCases = [
      {
        env: { HIGGSFIELD_LOCK_ROUNDS: "51" },
        message: "HIGGSFIELD_LOCK_ROUNDS must be an integer from 1 through 50",
      },
      {
        env: { HIGGSFIELD_LOCK_ROUNDS: "1.5" },
        message: "HIGGSFIELD_LOCK_ROUNDS must be an integer from 1 through 50",
      },
      {
        env: { HIGGSFIELD_LOCK_CRITICAL_SECONDS: "." },
        message: "HIGGSFIELD_LOCK_CRITICAL_SECONDS must be greater than 0 and at most 5",
      },
      {
        env: { HIGGSFIELD_LOCK_CRITICAL_SECONDS: "5.1" },
        message: "HIGGSFIELD_LOCK_CRITICAL_SECONDS must be greater than 0 and at most 5",
      },
    ];

    for (const invalidCase of invalidCases) {
      const result = spawnSync("bash", [script, "--lock-path", "internal"], {
        encoding: "utf8",
        env: { ...process.env, ...invalidCase.env },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(invalidCase.message);
      expect(result.stderr).not.toContain("docker:");
    }
  });
});
