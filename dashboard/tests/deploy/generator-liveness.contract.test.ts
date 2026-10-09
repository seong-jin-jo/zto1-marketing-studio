import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(__dirname, "../../..");
const workflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/deploy-marketing.yml"),
  "utf8",
);
const compose = readFileSync(
  resolve(repositoryRoot, "docker-compose.postagi-4tenants.yml"),
  "utf8",
);
const dockerfile = readFileSync(
  resolve(repositoryRoot, "dashboard/Dockerfile"),
  "utf8",
);
const probe = readFileSync(
  resolve(repositoryRoot, "scripts/probe-generator-session.sh"),
  "utf8",
);

function runProbe(output: string, status: number) {
  const fakeBin = mkdtempSync(resolve(tmpdir(), "generator-probe-"));
  try {
    const timeout = resolve(fakeBin, "timeout");
    const docker = resolve(fakeBin, "docker");
    writeFileSync(
      timeout,
      '#!/bin/sh\nif [ "$1" = "-k" ]; then shift 2; fi\nshift\nexec "$@"\n',
    );
    writeFileSync(
      docker,
      '#!/bin/sh\nprintf "%s\\n" "$FAKE_DOCKER_OUTPUT"\nexit "$FAKE_DOCKER_STATUS"\n',
    );
    chmodSync(timeout, 0o755);
    chmodSync(docker, 0o755);

    return spawnSync("bash", [resolve(repositoryRoot, "scripts/probe-generator-session.sh")], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        FAKE_DOCKER_OUTPUT: output,
        FAKE_DOCKER_STATUS: String(status),
      },
    });
  } finally {
    rmSync(fakeBin, { recursive: true, force: true });
  }
}

function runUncooperativeProbe() {
  const fakeBin = mkdtempSync(resolve(tmpdir(), "generator-probe-hang-"));
  try {
    const docker = resolve(fakeBin, "docker");
    writeFileSync(docker, '#!/bin/sh\ntrap "" TERM\nexec sleep 10\n');
    chmodSync(docker, 0o755);

    const startedAt = Date.now();
    const result = spawnSync("bash", [resolve(repositoryRoot, "scripts/probe-generator-session.sh")], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        GENERATOR_PROBE_OUTER_TIMEOUT: "1s",
        GENERATOR_PROBE_INNER_TIMEOUT: "1s",
        GENERATOR_PROBE_KILL_AFTER: "1s",
      },
      timeout: 5_000,
    });
    return { result, elapsedMs: Date.now() - startedAt };
  } finally {
    rmSync(fakeBin, { recursive: true, force: true });
  }
}

function credentialStepScript(force: boolean): string {
  const name = "      - name: 이미지·영상 생성기 자격증명 저장소 준비·선택적 배치\n";
  const start = workflow.indexOf(name);
  const runStart = workflow.indexOf("        run: |\n", start);
  const nextStep = workflow.indexOf("\n      - name:", runStart + 1);
  if (start < 0 || runStart < 0 || nextStep < 0) throw new Error("credential step not found");
  return workflow
    .slice(runStart + "        run: |\n".length, nextStep)
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n")
    .replace("${{ github.event.inputs.force_generator_credentials }}", force ? "true" : "false");
}

function runCredentialStep(
  state: string,
  force: boolean,
  options: { containerRunning?: boolean; wrapperAvailable?: boolean; secret?: string } = {},
) {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "generator-credentials-"));
  const fakeBin = resolve(fixtureRoot, "bin");
  const invocationLog = resolve(fixtureRoot, "docker.log");
  const mkdir = spawnSync("mkdir", ["-p", fakeBin]);
  if (mkdir.status !== 0) throw new Error("failed to create fake bin directory");
  const fakeDocker = `#!/usr/bin/env bash
set -eu
joined="$*"
case "$joined" in
  *'inspect -f'*openclaw-dashboard-osmu*)
    if [ "$FAKE_CONTAINER_RUNNING" = "true" ]; then echo true; else echo false; fi
    ;;
  *'exec openclaw-dashboard-osmu test -x /usr/local/bin/run-higgsfield-locked'*)
    if [ "$FAKE_WRAPPER_AVAILABLE" = "true" ]; then exit 0; else exit 1; fi
    ;;
  *'exec -i -e HIGGSFIELD_CREDENTIAL_FILE='*'/usr/local/bin/run-higgsfield-locked'*)
    cat >/dev/null
    echo write_credentials_locked >> "$FAKE_DOCKER_LOG"
    ;;
  *'console.log("missing")'*) echo "$FAKE_CRED_STATE" ;;
  *'node:20-bookworm-slim node -e'*'.credentials.json.tmp-'*)
    cat >/dev/null
    echo write_credentials_helper >> "$FAKE_DOCKER_LOG"
    ;;
  *'.config.json.tmp-'*) cat >/dev/null; echo write_config >> "$FAKE_DOCKER_LOG" ;;
  *) echo prepare_store >> "$FAKE_DOCKER_LOG" ;;
esac
`;
  writeFileSync(resolve(fakeBin, "docker"), fakeDocker);
  chmodSync(resolve(fakeBin, "docker"), 0o755);

  try {
    const result = spawnSync("bash", ["-c", credentialStepScript(force)], {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: fixtureRoot,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        FAKE_CRED_STATE: state,
        FAKE_DOCKER_LOG: invocationLog,
        FAKE_CONTAINER_RUNNING: String(options.containerRunning ?? false),
        FAKE_WRAPPER_AVAILABLE: String(options.wrapperAvailable ?? true),
        HIGGSFIELD_CREDENTIALS_JSON: options.secret
          ?? '{"access_token":"masked-test-value","refresh_token":"masked-refresh-value"}',
      },
    });
    const invocations = readFileSync(invocationLog, "utf8").trim().split("\n").filter(Boolean);
    return { result, invocations };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function credentialWriterScript(): string {
  const marker = "CREDENTIAL_WRITER_JS=\"$(cat <<'NODE'\n";
  const start = workflow.indexOf(marker);
  const end = workflow.indexOf("\n          NODE\n", start);
  if (start < 0 || end < 0) throw new Error("credential writer script not found");
  return workflow.slice(start + marker.length, end)
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n");
}

function runCredentialWriter(secret: string) {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "generator-writer-"));
  const credentialFile = resolve(fixtureRoot, "credentials.json");
  writeFileSync(credentialFile, '{"access_token":"existing","refresh_token":"keep-me"}', { mode: 0o600 });
  const result = spawnSync(process.execPath, ["-e", credentialWriterScript()], {
    encoding: "utf8",
    input: secret,
    env: { ...process.env, HIGGSFIELD_CREDENTIAL_FILE: credentialFile },
  });
  const content = readFileSync(credentialFile, "utf8");
  rmSync(fixtureRoot, { recursive: true, force: true });
  return { result, content };
}

function waitForFile(file: string, timeoutMs = 3_000): Promise<void> {
  const startedAt = Date.now();
  return new Promise((resolveWait, rejectWait) => {
    const check = () => {
      if (existsSync(file)) {
        resolveWait();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        rejectWait(new Error(`timed out waiting for ${file}`));
        return;
      }
      setTimeout(check, 20);
    };
    check();
  });
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", resolveExit);
  });
}

describe("deploy-marketing.yml 생성기 API 생존 계약", () => {
  it("GENERATOR-LIVENESS-01 정상: 비용 없는 account status API로 배포 전후 세션 생존을 확인한다", () => {
    expect(probe).toContain("higgsfield account status");
    expect(probe).toContain('env HIGGSFIELD_LOCK_WAIT_SECONDS="$lock_wait"');
    expect(probe).toContain("/usr/local/bin/run-higgsfield-locked higgsfield account status");
    expect(probe).toContain('timeout -k "$kill_after" "$outer_timeout"');
    expect(probe).toContain('docker exec "$container" timeout -k "$kill_after" "$inner_timeout"');
    expect(workflow.match(/scripts\/probe-generator-session\.sh/g)?.length).toBeGreaterThanOrEqual(1);
    expect(workflow).not.toContain("higgsfield generate create");
    expect(probe).not.toContain("higgsfield generate");
  });

  it("GENERATOR-LIVENESS-02 거절: 저장 토큰을 출력하는 auth token만으로 생존을 판정할 수 없다", () => {
    expect(workflow).not.toContain("higgsfield auth token");
    expect(probe).not.toContain("higgsfield auth token");
  });

  it("GENERATOR-LIVENESS-03 경계: 탐침 원문은 폐기하고 실제 종료 코드만 보존한다", () => {
    expect(probe).toContain(">/dev/null 2>&1");
    expect(probe).toContain("생성기 API 생존 확인 종료 코드");
    expect(probe).toContain('exit "$probe_status"');

    const secretOutput = "access_token=hf_secret refresh_token=rt_secret Bearer opaque-secret operator@example.com";
    const result = runProbe(secretOutput, 7);
    expect(result.status).toBe(7);
    expect(result.stdout).toContain("생성기 API 생존 확인 종료 코드: 7");
    expect(result.stdout).not.toContain(secretOutput);
    expect(result.stdout).not.toContain("hf_secret");
    expect(result.stdout).not.toContain("operator@example.com");

    const success = runProbe("Authenticated", 0);
    expect(success.status).toBe(0);
    expect(success.stdout).toContain("생성기 API 생존 확인 종료 코드: 0");

    const timedOut = runProbe("account status timed out", 124);
    expect(timedOut.status).toBe(124);
    expect(timedOut.stdout).toContain("생성기 API 생존 확인 종료 코드: 124");

    const busy = runProbe("credential lock busy", 75);
    expect(busy.status).toBe(75);
    expect(busy.stdout).toContain("생성기 API 생존 확인 종료 코드: 75");

    const uncooperative = runUncooperativeProbe();
    expect(uncooperative.result.status).not.toBe(0);
    expect(uncooperative.result.error).toBeUndefined();
    expect(uncooperative.elapsedMs).toBeLessThan(5_000);
  });

  it("GENERATOR-LIVENESS-04 거절: 배포 뒤 API 탐침 실패는 단계 실패로 보이되 글자 카드 배포는 계속한다", () => {
    const finalProbeStart = workflow.indexOf("생성기 API 생존 최종 확인 (배포 뒤)");
    const finalProbeEnd = workflow.indexOf("OSMU 스모크 게이트", finalProbeStart);
    const finalProbeStep = workflow.slice(finalProbeStart, finalProbeEnd);
    const startStep = workflow.indexOf("- name: 기동");

    expect(finalProbeStart).toBeGreaterThan(-1);
    expect(finalProbeStart).toBeGreaterThan(startStep);
    expect(finalProbeStep).toContain("id: generator_liveness");
    expect(finalProbeStep).toContain("if: ${{ success()");
    expect(finalProbeStep).toContain("continue-on-error: true");
    expect(finalProbeStep).toContain("for attempt in 1 2 3");
    expect(finalProbeStep).toContain("sleep 3");
    expect(finalProbeStep).toContain("::error::");
    expect(finalProbeStep).toMatch(/exit 1/);
    expect(finalProbeStep).toContain("글자 카드는 영향 없음");
    expect(finalProbeStep).not.toContain("생성 가능");

    const summaryStart = workflow.indexOf("생성기 상태를 배포 요약에 기록");
    const summaryEnd = workflow.indexOf("OSMU 스모크 게이트", summaryStart);
    const summaryStep = workflow.slice(summaryStart, summaryEnd);
    expect(summaryStep).toContain("steps.generator_liveness.outcome");
    expect(finalProbeStep).toContain("generator_probe_state=busy");
    expect(finalProbeStep).toContain('echo "state=$generator_probe_state" >> "$GITHUB_OUTPUT"');
    expect(summaryStep).toContain("steps.generator_liveness.outputs.state");
    expect(summaryStep).toContain("인증 실패로 판정하지 않았습니다");
    expect(summaryStep).toContain("DEGRADED");
    expect(summaryStep).toContain("GITHUB_STEP_SUMMARY");
  });

  it("GENERATOR-LIVENESS-05 정상: 배포 전 생존 판정은 만료 metadata만 읽고 CLI 갱신을 일으키지 않는다", () => {
    const credentialStepStart = workflow.indexOf("이미지·영상 생성기 자격증명 저장소 준비·선택적 배치");
    const credentialStepEnd = workflow.indexOf("OSMU DB 스키마 read-only preflight", credentialStepStart);
    const credentialStep = workflow.slice(credentialStepStart, credentialStepEnd);

    expect(credentialStep).toContain("CRED_ALIVE=no");
    expect(credentialStep).toContain("credential_state");
    expect(credentialStep).toContain("expires_at");
    expect(credentialStep).not.toContain("probe_generator");
    expect(credentialStep).not.toContain("higgsfield account status");
  });

  it("GENERATOR-LIVENESS-06 거절: force 입력 없이는 시크릿을 쓰거나 덮어쓰지 않는다", () => {
    const credentialStepStart = workflow.indexOf("이미지·영상 생성기 자격증명 저장소 준비·선택적 배치");
    const credentialStepEnd = workflow.indexOf("OSMU DB 스키마 read-only preflight", credentialStepStart);
    const credentialStep = workflow.slice(credentialStepStart, credentialStepEnd);

    expect(credentialStep).toContain('FORCE_CREDENTIALS="${{ github.event.inputs.force_generator_credentials }}"');
    expect(credentialStep).toMatch(/if \[ "\$FORCE_CREDENTIALS" = "true" \]; then[\s\S]*write_credentials/);
    expect(credentialStep).toMatch(/else[\s\S]*기존 생성기 자격증명 보존/);
    expect(credentialStep.match(/write_credentials/g)).toHaveLength(2);
    expect(credentialStep).not.toContain('printf \'%s\' "$HIGGSFIELD_CREDENTIALS_JSON" > "$CRED"');
  });

  it("GENERATOR-LIVENESS-07 정상: 자격증명은 root 실행 UID·0600·쓰기 마운트로 영속된다", () => {
    const service = compose.slice(
      compose.indexOf("  openclaw-dashboard-osmu:"),
      compose.indexOf("  openclaw-studio-export-worker:"),
    );
    const worker = compose.slice(compose.indexOf("  openclaw-studio-export-worker:"));

    expect(service).toContain('user: "0:0"');
    expect(service).toContain("${HOME}/.config/higgsfield:/root/.config/higgsfield:rw");
    expect(service).toContain("HIGGSFIELD_LOCK_DIR: /root/.config/higgsfield/.cli.lock.d");
    expect(service).toContain('HIGGSFIELD_LOCK_WAIT_SECONDS: "10"');
    expect(worker).not.toContain(".config/higgsfield");
    expect(dockerfile).toContain("run-higgsfield-locked.sh /usr/local/bin/run-higgsfield-locked");
    expect(dockerfile).toContain("umask 077");
    expect(workflow).toContain('chmod 600 "/credentials/$file"');
    expect(workflow).toContain('chown 0:0 "/credentials/$file"');
  });

  it("GENERATOR-LIVENESS-08 정상: 배포 뒤 실제 마운트·UID·권한을 확인한다", () => {
    const finalProbeStart = workflow.indexOf("생성기 API 생존 최종 확인 (배포 뒤)");
    const finalProbeEnd = workflow.indexOf("생성기 상태를 배포 요약에 기록", finalProbeStart);
    const finalProbeStep = workflow.slice(finalProbeStart, finalProbeEnd);

    expect(finalProbeStep).toContain('echo "generator_mount_rw=$generator_mount_rw"');
    expect(finalProbeStep).toContain('echo "generator_runtime_uid=$generator_runtime_uid"');
    expect(finalProbeStep).toContain('echo "generator_credentials_mode=$generator_credentials_mode"');
    expect(finalProbeStep).toContain('echo "generator_credentials_uid=$generator_credentials_uid"');
  });

  it.each([
    ["unexpired", false, 0],
    ["expired", false, 0],
    ["missing", false, 0],
    ["unexpired", true, 1],
  ] as const)(
    "GENERATOR-LIVENESS-09 통합: state=%s force=%s일 때 credential 교체 횟수는 %i다",
    (state, force, expectedWrites) => {
      const { result, invocations } = runCredentialStep(state, force);
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(invocations.filter((line) => line.startsWith("write_credentials_"))).toHaveLength(expectedWrites);
      expect(invocations.filter((line) => line === "write_config")).toHaveLength(1);
      expect(result.stdout).not.toContain("masked-test-value");
    },
  );

  it("GENERATOR-LIVENESS-10 경합: 실행 중 dashboard의 force 교체는 같은 credential 잠금을 거친다", () => {
    const { result, invocations } = runCredentialStep("expired", true, { containerRunning: true });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(invocations.filter((line) => line === "write_credentials_locked")).toHaveLength(1);
    expect(invocations).not.toContain("write_credentials_helper");
  });

  it("GENERATOR-LIVENESS-11 거절: 실행 중 옛 이미지에 잠금 wrapper가 없으면 force 교체를 중단한다", () => {
    const { result, invocations } = runCredentialStep("expired", true, {
      containerRunning: true,
      wrapperAvailable: false,
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("force=false 배포로 새 이미지를 먼저 올린 뒤");
    expect(invocations.filter((line) => line.startsWith("write_credentials_"))).toHaveLength(0);
  });

  it("GENERATOR-LIVENESS-12 거절: force 입력인데 시크릿이 비어 있으면 기존 파일을 건드리지 않는다", () => {
    const { result, invocations } = runCredentialStep("expired", true, { secret: "" });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("HIGGSFIELD_CREDENTIALS_JSON이 비어 있음");
    expect(invocations.filter((line) => line.startsWith("write_credentials_"))).toHaveLength(0);
  });

  it.each([
    ["잘못된 JSON", "{"],
    ["access_token 누락", "{}"],
    ["refresh_token 누락", '{"access_token":"access-only"}'],
    ["공백 refresh_token", '{"access_token":"access","refresh_token":"   "}'],
    ["객체 access_token", '{"access_token":{},"refresh_token":"refresh"}'],
    ["배열 refresh_token", '{"access_token":"access","refresh_token":[]}'],
  ])("GENERATOR-LIVENESS-13 거절: %s은 기존 credential을 보존한다", (_label, secret) => {
    const { result, content } = runCredentialWriter(secret);
    expect(result.status).not.toBe(0);
    expect(content).toBe('{"access_token":"existing","refresh_token":"keep-me"}');
    expect(result.stdout).not.toContain("keep-me");
    expect(result.stderr).not.toContain("keep-me");
  });

  const linuxIt = process.platform === "linux" ? it : it.skip;
  linuxIt(
    "GENERATOR-LIVENESS-14 경합: CI Linux에서 실제 wrapper가 force 교체를 직렬화하고 stale·timeout 경계를 보존한다",
    async () => {
      const fixtureRoot = mkdtempSync(resolve(tmpdir(), "generator-lock-integration-"));
      const lockDir = resolve(fixtureRoot, ".cli.lock.d");
      const ownerFile = resolve(lockDir, "owner");
      const credentialFile = resolve(fixtureRoot, "credentials.json");
      const wrapper = resolve(repositoryRoot, "dashboard/scripts/run-higgsfield-locked.sh");
      const sharedEnv = {
        ...process.env,
        HIGGSFIELD_LOCK_DIR: lockDir,
        HIGGSFIELD_LOCK_WAIT_SECONDS: "3",
      };
      writeFileSync(credentialFile, '{"access_token":"existing","refresh_token":"keep-me"}', { mode: 0o600 });

      const holder = spawn(wrapper, ["sh", "-ceu", "sleep 0.6"], { env: sharedEnv, stdio: "ignore" });
      const holderExit = waitForExit(holder);
      try {
        await waitForFile(ownerFile);
        const writer = spawn(wrapper, [process.execPath, "-e", credentialWriterScript()], {
          env: {
            ...sharedEnv,
            HIGGSFIELD_CREDENTIAL_FILE: credentialFile,
          },
          stdio: ["pipe", "ignore", "pipe"],
        });
        const writerExit = waitForExit(writer);
        writer.stdin.end('{"access_token":"new-server-session","refresh_token":"new-refresh"}');

        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        expect(readFileSync(credentialFile, "utf8")).toContain("keep-me");
        expect(await holderExit).toBe(0);
        expect(await writerExit).toBe(0);
        expect(JSON.parse(readFileSync(credentialFile, "utf8"))).toEqual({
          access_token: "new-server-session",
          refresh_token: "new-refresh",
        });

        const liveHolder = spawn(wrapper, ["sh", "-ceu", "sleep 2"], { env: sharedEnv, stdio: "ignore" });
        const liveHolderExit = waitForExit(liveHolder);
        await waitForFile(ownerFile);
        const timedOut = spawnSync(wrapper, ["true"], {
          env: { ...sharedEnv, HIGGSFIELD_LOCK_WAIT_SECONDS: "1" },
          encoding: "utf8",
        });
        expect(timedOut.status).toBe(75);
        expect(await liveHolderExit).toBe(0);

        mkdirSync(lockDir);
        writeFileSync(ownerFile, "stale-owner\n", { mode: 0o600 });
        const old = new Date(Date.now() - 10_000);
        utimesSync(lockDir, old, old);
        utimesSync(ownerFile, old, old);
        const staleRecovered = spawnSync(wrapper, ["true"], { env: sharedEnv, encoding: "utf8" });
        expect(staleRecovered.status, staleRecovered.stderr).toBe(0);
      } finally {
        holder.kill("SIGTERM");
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    },
    10_000,
  );
});
